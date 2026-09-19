import { createClient } from "@supabase/supabase-js";

const requiredNames = [
  "PROD_BASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "TEST_STORE1_USERNAME",
  "TEST_STORE1_PASSWORD",
  "TEST_STORE2_USERNAME",
  "TEST_STORE2_PASSWORD",
  "TEST_ADMIN_USERNAME",
  "TEST_ADMIN_PASSWORD"
];

const missing = requiredNames.filter(
  (name) => !Object.prototype.hasOwnProperty.call(process.env, name) || process.env[name] === ""
);
if (missing.length > 0) {
  console.error(`Missing test environment variable names: ${missing.join(", ")}`);
  process.exit(2);
}

const baseUrl = new URL(process.env.PROD_BASE_URL);
if (baseUrl.protocol !== "https:" && baseUrl.hostname !== "localhost") {
  throw new Error("PROD_BASE_URL must use HTTPS.");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const today = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Belgrade",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
}).format(new Date());
let passed = 0;
let manualMutationRequired = false;

function emailFor(username) {
  const normalized = username.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@firma.local`;
}

async function login(label, username, password) {
  const client = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  const { data, error } = await client.auth.signInWithPassword({
    email: emailFor(username),
    password
  });
  if (error || !data.session) throw new Error(`${label}: login failed.`);
  const cookie = sessionCookie(data.session);
  console.log(`PASS ${label}: login established an SSR auth cookie.`);
  passed += 1;
  return { client, cookie };
}

function sessionCookie(session) {
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const key = `sb-${projectRef}-auth-token`;
  const encoded = `base64-${Buffer.from(JSON.stringify(session), "utf8").toString("base64url")}`;
  const chunkSize = 3180;
  if (encoded.length <= chunkSize) return `${key}=${encoded}`;
  const chunks = [];
  for (let offset = 0, index = 0; offset < encoded.length; offset += chunkSize, index += 1) {
    chunks.push(`${key}.${index}=${encoded.slice(offset, offset + chunkSize)}`);
  }
  return chunks.join("; ");
}

async function appFetch(path, cookie = "") {
  return fetch(new URL(path, baseUrl), {
    headers: {
      Accept: "application/json, text/html",
      Origin: baseUrl.origin,
      ...(cookie ? { Cookie: cookie } : {})
    },
    redirect: "manual"
  });
}

function expect(label, condition, detail) {
  if (!condition) throw new Error(`${label}: ${detail}`);
  console.log(`PASS ${label}`);
  passed += 1;
}

async function json(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

const store1 = await login(
  "Store 1",
  process.env.TEST_STORE1_USERNAME,
  process.env.TEST_STORE1_PASSWORD
);
const store2 = await login(
  "Store 2",
  process.env.TEST_STORE2_USERNAME,
  process.env.TEST_STORE2_PASSWORD
);
const admin = await login(
  "Admin",
  process.env.TEST_ADMIN_USERNAME,
  process.env.TEST_ADMIN_PASSWORD
);

const adminReadPath = `/api/admin/exports/revenue?date_from=${today}&date_to=${today}`;
for (const [label, cookie] of [
  ["Unauthenticated admin API denial", ""],
  ["Store 1 admin API denial", store1.cookie],
  ["Store 2 admin API denial", store2.cookie]
]) {
  const response = await appFetch(adminReadPath, cookie);
  expect(label, response.status === 401 || response.status === 403, `received ${response.status}`);
}

const adminResponse = await appFetch(adminReadPath, admin.cookie);
expect("Admin read-only API access", adminResponse.ok, `received ${adminResponse.status}`);

for (const [label, cookie] of [
  ["Store 1 persistent request", store1.cookie],
  ["Store 2 persistent request", store2.cookie],
  ["Admin persistent request", admin.cookie]
]) {
  const first = await appFetch(label.startsWith("Admin") ? "/admin" : "/store", cookie);
  const second = await appFetch(label.startsWith("Admin") ? "/admin" : "/store", cookie);
  expect(label, first.status === 200 && second.status === 200, `received ${first.status}/${second.status}`);
}

const loggedOut = await appFetch("/store");
expect(
  "Cookie removal invalidates protected access",
  [302, 303, 307, 308].includes(loggedOut.status),
  `received ${loggedOut.status}`
);

const refreshed = await store1.client.auth.refreshSession();
if (refreshed.error || !refreshed.data.session) throw new Error("Store 1 refresh-token flow failed.");
const refreshedResponse = await appFetch("/store", sessionCookie(refreshed.data.session));
expect("Refreshed session remains authorized", refreshedResponse.status === 200, `received ${refreshedResponse.status}`);

const store1ListResponse = await appFetch("/api/return-proposals?limit=5", store1.cookie);
const store2ListResponse = await appFetch("/api/return-proposals?limit=5", store2.cookie);
expect("Store proposal lists load", store1ListResponse.ok && store2ListResponse.ok, "list request failed");
const store1List = await json(store1ListResponse);
const store2List = await json(store2ListResponse);
const store1Proposals = Array.isArray(store1List?.proposals) ? store1List.proposals : [];
const store2Proposals = Array.isArray(store2List?.proposals) ? store2List.proposals : [];
const store1Id = store1Proposals[0]?.store_id;
const store2Id = store2Proposals[0]?.store_id;

if (store1Id && store2Id && store1Id !== store2Id) {
  const tampered1 = await appFetch(`/api/return-proposals?store_id=${encodeURIComponent(store2Id)}&limit=5`, store1.cookie);
  const tampered2 = await appFetch(`/api/return-proposals?store_id=${encodeURIComponent(store1Id)}&limit=5`, store2.cookie);
  const tampered1Body = await json(tampered1);
  const tampered2Body = await json(tampered2);
  expect(
    "Tampered store_id is ignored for Store 1",
    tampered1.ok && (tampered1Body?.proposals ?? []).every((row) => row.store_id === store1Id),
    "foreign store data returned"
  );
  expect(
    "Tampered store_id is ignored for Store 2",
    tampered2.ok && (tampered2Body?.proposals ?? []).every((row) => row.store_id === store2Id),
    "foreign store data returned"
  );

  if (store1Proposals[0]?.id && store2Proposals[0]?.id) {
    const cross1 = await appFetch(`/api/return-proposals/${store2Proposals[0].id}`, store1.cookie);
    const cross2 = await appFetch(`/api/return-proposals/${store1Proposals[0].id}`, store2.cookie);
    expect("Store 1 cannot read Store 2 proposal", [403, 404].includes(cross1.status), `received ${cross1.status}`);
    expect("Store 2 cannot read Store 1 proposal", [403, 404].includes(cross2.status), `received ${cross2.status}`);
  } else {
    manualMutationRequired = true;
  }
} else {
  manualMutationRequired = true;
}

if (manualMutationRequired) {
  console.warn("MANUAL MUTATION TEST REQUIRED: test accounts need one proposal each to verify cross-store UUID denial and write tampering.");
}

console.log(`${passed} deployed security checks passed. No business record was created, changed or deleted.`);
