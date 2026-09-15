/* Credential-free application tests. These do not replace tests against deployed RLS. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");
const ts = require("typescript");
const { NextRequest, NextResponse } = require("next/server");
const root = path.resolve(__dirname, "..");
const store1 = "11111111-1111-4111-8111-111111111111";
const store2 = "22222222-2222-4222-8222-222222222222";
const user1 = "33333333-3333-4333-8333-333333333333";
const objectId = "44444444-4444-4444-8444-444444444444";
const worker = { id: user1, role: "store", store_id: store1 };
const admin = { id: user1, role: "admin", store_id: null };
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
function filesIn(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((f) =>
    f.isDirectory() ? filesIn(`${dir}/${f.name}`) : [`${dir}/${f.name}`]);
}
function failCall() { throw new Error("Unexpected privileged/database/network call"); }
const forbiddenModule = new Proxy({}, { get: (_, key) => key === "__esModule" ? true : failCall });
const realLibraries = new Set([
  "lib/security/api.ts", "lib/security/request.ts", "lib/security/validation.ts",
  "lib/security/sync-lock.ts", "lib/return-proposals.ts", "lib/date.ts", "lib/pagination.ts",
  "lib/revenue.ts", "lib/temperature-slots.ts", "lib/shelf-photos.ts",
  "lib/biznisoft/soap-client.ts", "lib/excel-templates.ts", "lib/produce.ts"
]);

// Load actual TS handlers, replacing only their external boundaries, never making real requests.
function harness(options = {}) {
  const cache = new Map();
  const headers = new Headers(options.headers || { host: "app.example", origin: "https://app.example", "sec-fetch-site": "same-origin" });
  const profile = options.profile === undefined ? worker : options.profile;
  const auth = {
    getCurrentProfileWithClient: async () => {
      if (options.authFails) throw new Error("Temporary auth outage");
      return profile;
    },
    requireStore: async () => { if (profile?.role !== "store") throw new Error("Denied"); return profile; },
    requireAdmin: async () => { if (profile?.role !== "admin") throw new Error("Denied"); return profile; }
  };
  function load(file) {
    file = file.replace(/\\/g, "/");
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const localRequire = (specifier) => {
      if (specifier === "server-only") return {};
      if (specifier === "next/server") return { NextRequest, NextResponse };
      if (specifier === "next/headers") return { headers: () => headers };
      if (specifier === "next/cache") return { revalidatePath: () => {} };
      if (specifier === "@/lib/auth") return auth;
      if (specifier === "@/lib/supabase/server") return { createClient: () => options.db || { from: failCall } };
      if (specifier === "@/lib/supabase/service") return { createServiceClient: () => options.service || failCall() };
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        let next = specifier.startsWith("@/") ? specifier.slice(2) : path.posix.join(path.posix.dirname(file), specifier);
        if (!path.extname(next)) next += ".ts";
        if (next.startsWith("app/") || realLibraries.has(next)) return load(next);
        return forbiddenModule;
      }
      return require(specifier);
    };
    const code = ts.transpileModule(read(file), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true
    } }).outputText;
    const context = {
      module, exports: module.exports, require: localRequire, Buffer, URL, Headers, Request, Response, Error,
      FormData, AbortController, setTimeout, clearTimeout, Uint8Array, ArrayBuffer,
      process: { env: options.env || {}, cwd: () => root },
      console: options.console || console,
      fetch: options.fetch || failCall
    };
    vm.runInNewContext(code, context, { filename: file });
    return module.exports;
  }
  return { load };
}

function database(resolver) {
  const calls = [];
  return { calls, from(table) {
    const call = { table, verb: "select", payload: null, filters: [] };
    calls.push(call);
    const chain = new Proxy({}, { get(_, key) {
      if (key === "then") return (resolve, reject) => Promise.resolve(resolver(call)).then(resolve, reject);
      return (...args) => {
        if (["insert", "update", "delete"].includes(key)) { call.verb = key; call.payload = args[0]; }
        if (["eq", "in", "gte", "lte"].includes(key)) call.filters.push([key, ...args]);
        return chain;
      };
    } });
    return chain;
  } };
}
const request = (method = "GET", body, suffix = "") => new NextRequest(`https://app.example/api/test${suffix}`, {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } })
});
const context = { params: { id: objectId, itemId: objectId } };
let passed = 0;
async function test(name, run) { await run(); passed += 1; console.log(`PASS ${name}`); }

async function main() {
  await test("canonical authorization: anonymous, store, admin, invalid role and temporary outage", async () => {
    for (const [profile, expected] of [[null, 401], [worker, 403], [{ ...worker, role: "owner" }, 403]]) {
      const result = await harness({ profile }).load("lib/security/api.ts").authorizeApi(undefined, true);
      assert.equal(result.response.status, expected);
      assert.equal(result.response.headers.get("cache-control"), "private, no-store");
    }
    assert.equal((await harness({ profile: admin }).load("lib/security/api.ts").authorizeApi(undefined, true)).ok, true);
    assert.equal((await harness().load("lib/security/api.ts").authorizeApi()).ok, true);
    assert.equal((await harness({ authFails: true }).load("lib/security/api.ts").authorizeApi()).response.status, 503);
    assert.equal((await harness({ profile: { ...worker, store_id: null } }).load("lib/security/api.ts").authorizeApi()).response.status, 403);
  });
  await test("all admin API handlers reject anonymous and store roles before privileged work", async () => {
    let handlers = 0;
    for (const file of filesIn("app/api/admin").filter((f) => f.endsWith("route.ts"))) {
      for (const [profile, status] of [[null, 401], [worker, 403]]) {
        const exports = harness({ profile }).load(file);
        for (const method of ["GET", "POST", "PATCH", "PUT", "DELETE"]) {
          if (typeof exports[method] !== "function") continue;
          const response = await exports[method](request(method), context);
          assert.equal(response.status, status, `${file} ${method}`);
          handlers += 1;
        }
      }
    }
    assert.ok(handlers >= 40);
    console.log(`  ${handlers} denied handler invocations (including delegated routes)`);
  });
  await test("cross-site and sibling-origin requests denied; same-origin and non-browser allowed", () => {
    const { isSameOriginRequest } = harness().load("lib/security/request.ts");
    for (const input of [
      { host: "app.example", origin: "https://evil.example" },
      { host: "app.example", "sec-fetch-site": "cross-site" },
      { host: "app.example", "sec-fetch-site": "same-site" },
      { host: "app.example", origin: "null" }
    ]) assert.equal(isSameOriginRequest(new Headers(input)), false);
    assert.equal(isSameOriginRequest(new Headers({ host: "app.example", origin: "https://app.example" })), true);
    assert.equal(isSameOriginRequest(new Headers({ host: "app.example" })), true);
  });
  await test("admin Server Actions deny store sessions independently of page layouts", async () => {
    let actions = 0;
    for (const file of filesIn("app/admin").filter((f) => f.endsWith("actions.ts"))) {
      const exports = harness().load(file);
      for (const action of Object.values(exports).filter((value) => typeof value === "function")) {
        const result = await action({}, new FormData());
        assert.equal(result.ok, false, file);
        actions += 1;
      }
    }
    assert.ok(actions >= 10);
    console.log(`  ${actions} admin Server Actions denied before database access`);
  });
  await test("cron/cleanup reject missing or wrong secrets before any work", async () => {
    for (const file of filesIn("app/api/cron").filter((f) => f.endsWith("route.ts"))) {
      const routes = harness({ env: { CRON_SECRET: "EXAMPLE_CRON_SECRET" } }).load(file);
      assert.equal((await routes.GET(request())).status, 401);
    }
    const cleanup = harness({ env: { CLEANUP_SECRET: "EXAMPLE_CLEANUP_SECRET" } }).load("app/api/cleanup-shelf-photos/route.ts");
    assert.equal((await cleanup.POST(request("POST", undefined, "?secret=EXAMPLE_CLEANUP_SECRET"))).status, 401);
    assert.equal(cleanup.GET, undefined);
  });
  await test("return proposal read/update/item delete reject another store's UUID", async () => {
    for (const [file, method] of [
      ["app/api/return-proposals/[id]/route.ts", "GET"],
      ["app/api/return-proposals/[id]/route.ts", "PATCH"],
      ["app/api/return-proposals/[id]/items/route.ts", "POST"],
      ["app/api/return-proposals/[id]/items/[itemId]/route.ts", "PATCH"],
      ["app/api/return-proposals/[id]/items/[itemId]/route.ts", "DELETE"]
    ]) {
      const db = database(() => ({ data: { id: objectId, store_id: store2, status: "draft" }, error: null }));
      const response = await harness({ db }).load(file)[method](request(method), context);
      assert.equal(response.status, 403, `${file} ${method}`);
      assert.ok(db.calls.every((c) => c.verb === "select"));
    }
  });
  await test("return creation ignores forged role/store/creator/status fields", async () => {
    const db = database((c) => ({ data: { ...c.payload, id: objectId }, error: null }));
    const response = await harness({ db }).load("app/api/return-proposals/route.ts").POST(request("POST", {
      store_id: store2, role: "admin", created_by: store2, status: "completed", reviewed_by: store2
    }));
    assert.equal(response.status, 201);
    const payload = db.calls[0].payload;
    assert.equal(payload.store_id, store1);
    assert.equal(payload.created_by, user1);
    assert.equal(payload.status, "draft");
    assert.equal(payload.role, undefined);
    assert.equal(payload.reviewed_by, undefined);
  });
  await test("return query is scoped; invalid statuses and malformed dates are rejected", async () => {
    const db = database(() => ({ data: [], error: null }));
    const routes = harness({ db }).load("app/api/return-proposals/route.ts");
    assert.equal((await routes.GET(request("GET", undefined, `?store_id=${store2}`))).status, 200);
    assert.ok(db.calls[0].filters.some((f) => f[1] === "store_id" && f[2] === store1));
    assert.equal((await routes.GET(request("GET", undefined, "?status=owner"))).status, 400);
    assert.equal((await routes.POST(request("POST", { return_date: "2026-02-30" }))).status, 400);
    const own = database(() => ({ data: { id: objectId, store_id: store1, status: "draft" }, error: null }));
    const patch = harness({ db: own }).load("app/api/return-proposals/[id]/route.ts").PATCH;
    assert.equal((await patch(request("PATCH", { status: "owner" }), context)).status, 400);
    assert.equal((await patch(request("PATCH", { status: "completed" }), context)).status, 403);
    assert.ok(own.calls.every((c) => c.verb === "select"));
  });
  await test("pazar uses trusted owner/today; dates, foreign IDs, nonfinite amounts rejected", async () => {
    const db = database((c) => ({ data: c.verb === "select" ? [] : null, error: null }));
    const h = harness({ db });
    const actions = h.load("app/store/actions.ts");
    const form = new FormData();
    form.set("store_id", store2); form.set("user_id", store2); form.set("shift", "untrusted");
    form.set("cash_revenue", "10");
    assert.equal((await actions.submitDailyRevenue({}, form)).ok, true);
    const payload = db.calls.find((c) => c.verb === "insert").payload;
    assert.equal(payload.store_id, store1); assert.equal(payload.user_id, user1);
    assert.equal(payload.shift, null);
    assert.equal(payload.report_date, h.load("lib/date.ts").todayInBelgrade());
    form.set("report_date", "2000-01-01");
    assert.equal((await actions.submitDailyRevenue({}, form)).ok, false);
    form.delete("report_date"); form.set("cash_revenue", "Infinity");
    assert.equal((await actions.submitDailyRevenue({}, form)).ok, false);
    form.set("cash_revenue", "10"); form.set("id", objectId);
    const foreign = database(() => ({ data: { ...payload, id: objectId, store_id: store2, created_at: new Date().toISOString() }, error: null }));
    assert.equal((await harness({ db: foreign }).load("app/store/actions.ts").updateStoreDailyRevenue({}, form)).ok, false);
    assert.ok(foreign.calls.every((c) => c.verb === "select"));
  });
  await test("UUID/date validation, null JSON, sanitized error output and Belgrade midnight", async () => {
    const h = harness(), validation = h.load("lib/security/validation.ts"), date = h.load("lib/date.ts");
    assert.equal(validation.isUuid("------------------------------------"), false);
    assert.equal(validation.isUuid(store1), true);
    assert.equal(Object.keys(await validation.readJsonObject(request("POST", null))).length, 0);
    assert.equal(Object.keys(await validation.readJsonObject(request("POST", []))).length, 0);
    assert.equal(validation.actionError(new Error("SQL INTERNAL SECRET"), "Safe error"), "Safe error");
    assert.equal(validation.actionError(new validation.InputError("Validation"), "Safe error"), "Validation");
    assert.equal(date.isValidIsoDate("2026-02-30"), false);
    assert.equal(date.businessDateInBelgrade(0, new Date("2026-07-20T22:30:00Z")), "2026-07-21");
  });
  await test("temperature uses assigned store/device, accepts negative values, rejects invalid slot/date", async () => {
    const db = database(() => ({ data: { id: objectId, name: "Test device" }, error: null }));
    const action = harness({ db }).load("app/store/actions.ts").submitTemperature;
    const form = new FormData();
    for (const [key, value] of Object.entries({ store_id: store2, user_id: store2, device_id: objectId, report_date: "2026-09-15", shift: "Prva smena", temperature: "-18.5" })) form.set(key, value);
    assert.equal((await action({}, form)).ok, true);
    const payload = db.calls.find((c) => c.verb === "insert").payload;
    assert.equal(payload.store_id, store1); assert.equal(payload.user_id, user1); assert.equal(payload.temperature, -18.5);
    assert.ok(db.calls[0].filters.some((f) => f[1] === "store_id" && f[2] === store1));
    form.set("shift", "Unexpected"); assert.equal((await action({}, form)).ok, false);
    form.set("shift", "Prva smena"); form.set("report_date", "2026-02-30");
    assert.equal((await action({}, form)).ok, false);
  });
  await test("photo paths reject traversal, URL encoding and different task/store ownership", () => {
    const { objectPathFromStoragePath: parse, taskPhotoObjectPath: task } = harness().load("lib/shelf-photos.ts");
    const photo = `shelf-photos/tasks/${store1}/${objectId}/123.jpg`;
    assert.equal(task(photo, store1, objectId), `tasks/${store1}/${objectId}/123.jpg`);
    assert.equal(task(photo, store2, objectId), null);
    assert.equal(task(photo, store1, store2), null);
    for (const bad of ["../123.jpg", "%2e%2e%2f123.jpg", "sub/123.jpg", "123.svg", "123.jpg?x=1", "a\\123.jpg"]) {
      assert.equal(parse(`shelf-photos/2026-09-15/${store1}/${bad}`), null);
    }
  });
  await test("sync lease prevents concurrent runs, fails closed and releases after work", async () => {
    for (const [claim, status] of [[{ data: null }, 409], [{ error: { message: "private SQL" } }, 503]]) {
      const result = await harness({ service: { rpc: async () => claim } }).load("lib/security/sync-lock.ts").withIntegrationLock(failCall);
      assert.equal(result.status, status);
      assert.ok(!(await result.text()).includes("private SQL"));
    }
    const service = database(() => ({ error: null }));
    service.rpc = async () => ({ data: "EXAMPLE_LEASE_TOKEN" });
    const result = await harness({ service }).load("lib/security/sync-lock.ts").withIntegrationLock(async () => NextResponse.json({ ok: true }));
    assert.equal(result.status, 200);
    assert.ok(service.calls[0].filters.some((f) => f[1] === "token" && f[2] === "EXAMPLE_LEASE_TOKEN"));
  });
  await test("SOAP faults redact synthetic secrets; working namespace, empty password, sessions retained", async () => {
    const session = `{${objectId}}`, logs = [], requests = [];
    const credentials = { soapUrl: "https://soap.invalid", companyId: "1", companyYear: "2026", username: "EXAMPLE_USERNAME", password: "" };
    const client = harness({ console: { log: (...a) => logs.push(a.join(" ")) }, fetch: async (_, init) => {
      requests.push(init);
      return new Response(`<return>${requests.length === 1 ? session : "[]"}</return>`);
    } }).load("lib/biznisoft/soap-client.ts");
    const returned = await client.getSessionHandle(credentials);
    assert.equal(returned, session);
    await client.getItems({ sessionHandle: returned, itemType: "itSaleActions", jsonGetItemsRequest: "{}", soapUrl: credentials.soapUrl });
    assert.match(requests[0].body, /<Password xsi:type="xsd:string"><\/Password>/);
    assert.equal(requests[1].headers.SOAPAction, "urn:BSWebSericeIntf-IBSWebService#GetItems");
    assert.ok(requests[1].body.includes(session));
    assert.ok(!logs.join(" ").includes(session));
    assert.ok(!logs.join(" ").includes(credentials.username));
    const fault = harness({ env: { BIZNISOFT_USERNAME: "EXAMPLE_USERNAME", BIZNISOFT_PASSWORD: "EXAMPLE_PASSWORD" } }).load("lib/biznisoft/soap-client.ts");
    let message = "";
    try { fault.extractSoapReturn(`<Fault><faultstring>EXAMPLE_USERNAME EXAMPLE_PASSWORD ${session} Bearer EXAMPLE_TOKEN</faultstring></Fault>`); }
    catch (e) { message = e.message; }
    assert.ok(message.includes("[redacted]"));
    for (const secret of [session, "EXAMPLE_USERNAME", "EXAMPLE_PASSWORD", "EXAMPLE_TOKEN"]) assert.ok(!message.includes(secret));
    assert.throws(() => fault.extractSoapReturn("<html>private upstream response</html>"), (e) => !e.message.includes("private upstream"));
  });
  await test("export templates treat user text as strings, preserve numbers and intentional formulas", async () => {
    const ExcelJS = require("exceljs"), JSZip = require("jszip"), XLSX = require("xlsx");
    const { buildTemperatureChecklistWorkbook, buildProduceOrderWorkbook } = harness().load("lib/excel-templates.ts");
    const malicious = ["=HYPERLINK(\"https://example.invalid\",\"x\")", "+1+1", "-1+1", "@SUM(1,2)"];
    const { workbook } = await buildTemperatureChecklistWorkbook({ month: "2026-09", storeName: "Radnja 1", deviceName: "Test", reports: malicious.map((note, i) => ({
      report_date: `2026-09-0${i + 1}`, shift: "07:00", temperature: -18, note, created_at: "2026-09-15T10:00:00Z"
    })) });
    const buffer = await workbook.xlsx.writeBuffer();
    const restored = new ExcelJS.Workbook(); await restored.xlsx.load(buffer);
    const values = [];
    restored.eachSheet((s) => s.eachRow((r) => r.eachCell((c) => values.push(c.value))));
    for (const value of malicious) assert.ok(values.includes(value), `Text cell retained: ${value[0]}`);
    assert.ok(values.includes(-18));
    const zip = await JSZip.loadAsync(buffer);
    const sheets = Object.keys(zip.files).filter((f) => /^xl\/worksheets\/sheet\d+\.xml$/.test(f));
    for (const sheet of sheets) assert.ok(!/<f[^>]*>[^<]*(HYPERLINK|1\+1|SUM\(1,2)/.test(await zip.file(sheet).async("string")));
    const produce = await buildProduceOrderWorkbook([]);
    assert.ok(produce.workbook.worksheets[0].getCell("L2").value.formula.startsWith("SUM("));
    const legacy = XLSX.utils.aoa_to_sheet(malicious.map((s) => [s]));
    malicious.forEach((_, i) => { assert.equal(legacy[`A${i + 1}`].t, "s"); assert.equal(legacy[`A${i + 1}`].f, undefined); });
  });
  await test("static RLS baseline and new migration protect exposed tables/view/history/storage", () => {
    const sql = filesIn("supabase/migrations").filter((f) => f.endsWith(".sql")).map(read).join("\n");
    const tables = [...new Set([...sql.matchAll(/create table (?:if not exists )?public\.(\w+)/gi)].map((m) => m[1]))];
    for (const table of tables) assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"), table);
    const migration = read("supabase/migrations/20260915120000_security_hardening.sql");
    for (const check of ["security_invoker = true", "p.store_id = public.current_user_store_id()", "new.created_at := now()", "new.created_by := auth.uid()", "old.id::text", "from storage.objects", "revoke all on public.security_operation_locks"]) assert.ok(migration.includes(check));
    assert.ok(!/truncate|delete from|drop table/i.test(migration));
    console.log(`  ${tables.length} tables statically checked; deployed RLS still requires live verification`);
  });
  await test("client import graph cannot reach service-role/secret modules", () => {
    const sourceFiles = [...filesIn("app"), ...filesIn("components"), ...filesIn("lib")].filter((f) => /\.tsx?$/.test(f));
    function visit(file, seen = new Set()) {
      if (seen.has(file)) return;
      seen.add(file);
      const source = read(file);
      if (/^[\s]*["']use server["']/.test(source)) return;
      assert.ok(!/import\s+["']server-only["']|SUPABASE_SERVICE_ROLE_KEY|process\.env\.(?:CRON_SECRET|BIZNISOFT_PASSWORD)/.test(source), `Client graph reaches ${file}`);
      const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      for (const statement of ast.statements) {
        if (!ts.isImportDeclaration(statement) || statement.importClause?.isTypeOnly) continue;
        const elements = statement.importClause?.namedBindings;
        if (elements && ts.isNamedImports(elements) && elements.elements.length && elements.elements.every((e) => e.isTypeOnly)) continue;
        const specifier = statement.moduleSpecifier.text;
        if (!specifier.startsWith("@/") && !specifier.startsWith(".")) continue;
        const base = specifier.startsWith("@/") ? specifier.slice(2) : path.posix.join(path.posix.dirname(file), specifier);
        const found = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((f) => sourceFiles.includes(f));
        if (found) visit(found, seen);
      }
    }
    for (const file of sourceFiles.filter((f) => /^[\s]*["']use client["']/.test(read(f)))) visit(file);
    assert.ok(read("lib/supabase/service.ts").includes('import "server-only"'));
  });
  await test("security headers and private API caching remain configured", async () => {
    const config = (await import(pathToFileURL(path.join(root, "next.config.mjs")))).default;
    const rules = await config.headers();
    const headers = rules.flatMap((r) => r.headers);
    for (const key of ["X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Content-Security-Policy", "Permissions-Policy"]) assert.ok(headers.some((h) => h.key === key));
    assert.ok(headers.some((h) => h.key === "Cache-Control" && h.value === "private, no-store"));
    assert.ok(!/export async function GET/.test(read("app/api/cleanup-shelf-photos/route.ts")));
    for (const file of ["middleware.ts", "lib/supabase/client.ts", "lib/supabase/server.ts"]) {
      assert.ok(read(file).includes("cookieOptions: authCookieOptions"));
    }
    assert.equal(harness({ env: { NODE_ENV: "production" } }).load("lib/supabase/cookie-options.ts").authCookieOptions.secure, true);
    assert.equal(harness({ env: { NODE_ENV: "development" } }).load("lib/supabase/cookie-options.ts").authCookieOptions.secure, false);
  });
  console.log(`\n${passed} security test groups passed. No production services contacted.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
