import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const RESET_EXISTING = process.argv.includes("--reset-existing-passwords");
const INTERNAL_DOMAIN = "firma.local";
const accounts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11].map((number) => ({
  storeName: `Radnja ${number}`,
  username: `radnja${number}`
}));

loadLocalEnv();

const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const [
  { data: storeRows, error: storesError },
  { data: adminRows, error: adminsError },
  { data: storeProfileRows, error: storeProfilesError },
  authUsers
] = await Promise.all([
  supabase.from("stores").select("id, name").in("name", accounts.map((account) => account.storeName)),
  supabase.from("profiles").select("id").eq("role", "admin"),
  supabase.from("profiles").select("id, email, store_id").eq("role", "store"),
  listAllAuthUsers()
]);

if (storesError) throw new Error(`Store lookup failed: ${storesError.message}`);
if (adminsError) throw new Error(`Admin verification failed: ${adminsError.message}`);
if (storeProfilesError) throw new Error(`Store profile verification failed: ${storeProfilesError.message}`);

const storesByName = new Map((storeRows ?? []).map((store) => [store.name, store]));
const missingStores = accounts.filter((account) => !storesByName.has(account.storeName));
if (missingStores.length > 0) {
  throw new Error(`Missing required stores: ${missingStores.map((account) => account.storeName).join(", ")}`);
}

const usersByEmail = new Map();
for (const user of authUsers) {
  const email = user.email?.trim().toLowerCase();
  if (!email) continue;
  if (usersByEmail.has(email)) throw new Error(`Duplicate Auth email detected for ${email}.`);
  usersByEmail.set(email, user);
}

const forbiddenRadnja10 = usersByEmail.get(internalEmail("radnja10"));
if (forbiddenRadnja10) {
  throw new Error("radnja10 account exists. Review and remove that non-production store account manually before continuing.");
}

const expectedEmails = new Set(accounts.map((account) => internalEmail(account.username)));
const unexpectedStoreProfiles = (storeProfileRows ?? []).filter((profile) => {
  const authEmail = authUsers.find((user) => user.id === profile.id)?.email?.trim().toLowerCase();
  return !authEmail || !expectedEmails.has(authEmail);
});
if (unexpectedStoreProfiles.length > 0) {
  console.error("Unexpected development store profiles require manual review; none were deleted:");
  console.table(unexpectedStoreProfiles.map((profile) => ({
    Email: authUsers.find((user) => user.id === profile.id)?.email ?? profile.email ?? "UNKNOWN",
    "Profile ID": profile.id,
    "Store ID": profile.store_id ?? "NONE"
  })));
  process.exit(3);
}

const existingUsers = accounts
  .map((account) => usersByEmail.get(internalEmail(account.username)))
  .filter(Boolean);
const existingIds = existingUsers.map((user) => user.id);
let existingProfiles = [];
if (existingIds.length > 0) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, store_id")
    .in("id", existingIds);
  if (error) throw new Error(`Existing profile lookup failed: ${error.message}`);
  existingProfiles = data ?? [];
}
const profilesById = new Map(existingProfiles.map((profile) => [profile.id, profile]));

const plan = accounts.map((account) => {
  const email = internalEmail(account.username);
  const user = usersByEmail.get(email) ?? null;
  const profile = user ? profilesById.get(user.id) ?? null : null;
  if (profile?.role === "admin") {
    throw new Error(`${account.username} is linked to an admin profile. No changes were made.`);
  }
  return {
    ...account,
    email,
    profile,
    store: storesByName.get(account.storeName),
    user
  };
});

console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
console.log(`Existing production-name accounts: ${plan.filter((entry) => entry.user).length}`);
console.log(`New accounts to create: ${plan.filter((entry) => !entry.user).length}`);
console.log(`Existing passwords to reset: ${RESET_EXISTING ? plan.filter((entry) => entry.user).length : 0}`);
console.table(plan.map((entry) => ({
  Username: entry.username,
  Store: entry.storeName,
  Auth: entry.user ? "existing" : "create",
  Binding: entry.profile?.store_id === entry.store.id && entry.profile?.role === "store" ? "correct" : "set/correct"
})));

if (!APPLY) {
  console.log("No accounts or profiles were changed. Re-run with --apply after review.");
  console.log("Add --reset-existing-passwords only when approved for development accounts being promoted to production.");
  process.exit(0);
}

const adminIdsBefore = new Set((adminRows ?? []).map((profile) => profile.id));
const credentials = [];

for (const entry of plan) {
  let user = entry.user;
  let initialPassword = null;

  if (!user) {
    initialPassword = generatePassword();
    const { data, error } = await supabase.auth.admin.createUser({
      email: entry.email,
      email_confirm: true,
      password: initialPassword,
      user_metadata: { username: entry.username }
    });
    if (error || !data.user) throw new Error(`Could not create ${entry.username}: ${error?.message ?? "unknown error"}`);
    user = data.user;
  } else if (RESET_EXISTING) {
    initialPassword = generatePassword();
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password: initialPassword });
    if (error) throw new Error(`Could not reset ${entry.username}: ${error.message}`);
  }

  const { error: profileError } = await supabase.from("profiles").upsert(
    {
      email: entry.email,
      id: user.id,
      role: "store",
      store_id: entry.store.id
    },
    { onConflict: "id" }
  );
  if (profileError) throw new Error(`Could not bind ${entry.username}: ${profileError.message}`);

  credentials.push({
    "Initial password": initialPassword ?? "UNCHANGED",
    Store: entry.storeName,
    Username: entry.username
  });
}

await verifyFinalBindings(adminIdsBefore);

console.log("Production store accounts are bound and verified.");
console.table(credentials);
console.warn("Store generated passwords securely now. They are shown only in this terminal output and are not saved to disk.");

async function verifyFinalBindings(adminIdsBefore) {
  const finalUsers = await listAllAuthUsers();
  const finalByEmail = new Map(finalUsers.map((user) => [user.email?.trim().toLowerCase(), user]));
  if (finalByEmail.has(internalEmail("radnja10"))) throw new Error("Verification failed: radnja10 exists.");

  const expectedIds = accounts.map((account) => finalByEmail.get(internalEmail(account.username))?.id).filter(Boolean);
  if (expectedIds.length !== accounts.length) throw new Error("Verification failed: not all ten Auth users exist.");

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, email, role, store_id")
    .in("id", expectedIds);
  if (profilesError) throw new Error(`Binding verification failed: ${profilesError.message}`);
  const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile]));

  for (const account of accounts) {
    const user = finalByEmail.get(internalEmail(account.username));
    const profile = byId.get(user.id);
    const store = storesByName.get(account.storeName);
    if (!profile || profile.role !== "store" || profile.store_id !== store.id) {
      throw new Error(`Binding verification failed for ${account.username}.`);
    }
  }

  const { data: adminsAfter, error: adminsAfterError } = await supabase.from("profiles").select("id").eq("role", "admin");
  if (adminsAfterError) throw new Error(`Admin verification failed: ${adminsAfterError.message}`);
  const adminIdsAfter = new Set((adminsAfter ?? []).map((profile) => profile.id));
  if (adminIdsAfter.size !== adminIdsBefore.size || [...adminIdsBefore].some((id) => !adminIdsAfter.has(id))) {
    throw new Error("Admin profile verification failed. Review the project immediately.");
  }

  const { data: storeProfilesAfter, error: storeProfilesAfterError } = await supabase
    .from("profiles")
    .select("id")
    .eq("role", "store");
  if (storeProfilesAfterError) throw new Error(`Final store-profile verification failed: ${storeProfilesAfterError.message}`);
  const expectedIdSet = new Set(expectedIds);
  if ((storeProfilesAfter ?? []).length !== accounts.length || storeProfilesAfter.some((profile) => !expectedIdSet.has(profile.id))) {
    throw new Error("Final verification failed: unexpected store profiles remain.");
  }
}

async function listAllAuthUsers() {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Auth user lookup failed: ${error.message}`);
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

function generatePassword() {
  return `A1!${randomBytes(18).toString("base64url")}`;
}

function internalEmail(username) {
  return `${username}@${INTERNAL_DOMAIN}`;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const separator = trimmed.indexOf("=");
    const name = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
    if (name && process.env[name] === undefined) process.env[name] = value;
  }
}
