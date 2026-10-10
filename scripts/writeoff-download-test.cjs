const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const ExcelJS = require("exceljs");
const { NextRequest, NextResponse } = require("next/server");
const root = path.resolve(__dirname, "..");
const listId = "11111111-1111-4111-8111-111111111111";
const storeId = "22222222-2222-4222-8222-222222222222";
const supplierId = "33333333-3333-4333-8333-333333333333";
const quantities = [13, 22, 14, 101];
// Test-only snapshots: the application itself reads Supabase, never this fixture.
const fixture = [1039, 1698, 9249, 15380].map((id, index) => ({
  id: `item-${id}`, writeoff_list_id: listId, store_id: storeId, supplier_id: supplierId,
  article_id: id, article_code: null, barcode: ["8606108042151", "8600103056380", "8600103056250", "8600103027175"][index],
  article_name: `Saved article ${id}`, quantity: quantities[index], stock_amount: 9999,
  expiration_date: "2026-10-10", price: null, level_price: null, account: null,
  popdv_id: null, vat_transaction_type: null, modify_time: null, operator_name: null
}));
const list = { id: listId, reference: "OT-TEST", status: "finalized", store_id: storeId, supplier_id: supplierId, stores: { name: "Radnja 1" } };

function harness({ role = "admin", savedList = list, items = fixture, liveService } = {}) {
  const cache = new Map();
  const calls = [];
  const service = liveService ?? { from(table) {
    const call = { table, filters: [] };
    calls.push(call);
    const chain = new Proxy({}, { get(_target, key) {
      if (key === "then") return (resolve, reject) => Promise.resolve({ data: table === "writeoff_lists" ? savedList : items, error: null }).then(resolve, reject);
      if (["insert", "update", "delete", "upsert"].includes(key)) throw new Error("Unexpected write");
      return (...args) => { if (key === "eq") call.filters.push(args); return chain; };
    } });
    return chain;
  } };
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const localRequire = (specifier) => {
      if (specifier === "server-only") return {};
      if (specifier === "next/server") return { NextRequest, NextResponse };
      if (specifier === "next/headers") return { headers: () => new Headers({ host: "localhost:3000", origin: "http://localhost:3000" }) };
      if (specifier === "@/lib/auth") return {
        getCurrentProfileWithClient: async () => role ? { id: listId, role, store_id: role === "admin" ? null : storeId } : null,
        isValidProfileBinding: (profile) => profile.role === "admin" ? profile.store_id === null : profile.role === "store" && profile.store_id === storeId
      };
      if (specifier === "@/lib/supabase/server") return { createClient: () => ({}) };
      if (specifier === "@/lib/supabase/service") return { createServiceClient: () => service };
      if (specifier === "@/lib/excel-templates") return { excelDownloadResponse: async (workbook, name) => new NextResponse(Buffer.from(await workbook.xlsx.writeBuffer()), { headers: { "Content-Disposition": `attachment; filename="${name}"` } }) };
      if (specifier.startsWith("@/")) return load(`${specifier.slice(2)}.ts`);
      return require(specifier);
    };
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, Buffer, Uint8Array, ArrayBuffer, Date, Error, URL, process, console, Headers, setTimeout, clearTimeout }, { filename: file });
    return module.exports;
  }
  const GET = load("app/api/admin/popis-otpis/[id]/export/biznisoft/route.ts").GET;
  return { load, calls, invoke: (query = "", id = savedList.id) => GET(new NextRequest(`http://localhost:3000/api/admin/popis-otpis/${id}/export/biznisoft${query}`), { params: Promise.resolve({ id }) }) };
}

async function verifyResponse(response, rows) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.match(response.headers.get("Content-Disposition"), /attachment; filename="PROBNI-/);
  assert.equal(response.headers.get("X-Writeoff-Mode"), "test");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const workbook = new ExcelJS.Workbook();
  const bytes = Buffer.from(await response.arrayBuffer());
  await workbook.xlsx.load(bytes);
  const sheet = workbook.getWorksheet("BSRep_411717");
  const expected = new Map();
  for (const row of rows) {
    const code = row.article_code?.trim() || String(row.article_id).padStart(6, "0");
    const previous = expected.get(code);
    expected.set(code, { ...row, quantity: Number(row.quantity) + (previous?.quantity ?? 0) });
  }
  assert.equal(sheet.rowCount, expected.size + 2);
  for (let index = 2; index < sheet.rowCount; index++) {
    const code = sheet.getCell(`D${index}`).value;
    const row = expected.get(code);
    assert(row, `No extra article ${code}`);
    assert.equal(sheet.getCell(`C${index}`).value, row.barcode);
    assert.equal(sheet.getCell(`E${index}`).value, row.article_name);
    assert.equal(sheet.getCell(`F${index}`).type, ExcelJS.ValueType.Number);
    assert.equal(sheet.getCell(`F${index}`).value, row.quantity);
    for (const [column, field] of [["G", "price"], ["M", "account"], ["N", "level_price"], ["Q", "popdv_id"], ["R", "vat_transaction_type"]]) {
      if (row[field] == null) assert.equal(sheet.getCell(`${column}${index}`).value, null);
    }
    expected.delete(code);
  }
  assert.equal(expected.size, 0, "No missing articles");
  assert.equal(sheet.getCell(`F${sheet.rowCount}`).value, rows.reduce((sum, row) => sum + Number(row.quantity), 0));
  return bytes;
}

async function main() {
  for (const [role, status] of [[null, 401], ["store", 403]]) {
    const test = harness({ role });
    assert.equal((await test.invoke()).status, status);
    assert.equal(test.calls.length, 0);
  }
  assert.equal((await harness().invoke("?mode=invalid")).status, 400);
  assert.equal((await harness({ savedList: { ...list, status: "draft" } }).invoke()).status, 409);
  const normal = await harness().invoke("?mode=production");
  assert.equal(normal.status, 422);
  assert.equal((await normal.json()).code, "ACCOUNTING_METADATA_MISSING");
  const test = harness();
  const bytes = await verifyResponse(await test.invoke(), fixture);
  await verifyResponse(await harness().invoke("?mode=test"), fixture);
  for (const call of test.calls) assert.deepEqual(call.filters[0], [call.table === "writeoff_lists" ? "id" : "writeoff_list_id", listId]);
  const { verifyBizniSoftTestExport } = test.load("lib/popis-otpis-export.ts");
  const tampered = new ExcelJS.Workbook();
  await tampered.xlsx.load(bytes);
  tampered.getWorksheet("BSRep_411717").getCell("F2").value = 0;
  const tamperedBytes = Buffer.from(await tampered.xlsx.writeBuffer());
  await assert.rejects(() => verifyBizniSoftTestExport(tamperedBytes, fixture), /Provera artikala i količina/);
  assert.equal((await harness({ items: [] }).invoke()).status, 422);
  assert.equal((await harness({ items: [{ ...fixture[0], quantity: 0 }] }).invoke()).status, 422);
  assert.equal((await harness({ items: [{ ...fixture[0], store_id: supplierId }] }).invoke()).status, 422);
  const missingBarcode = await harness({ items: [{ ...fixture[0], barcode: "" }] }).invoke();
  assert.equal(missingBarcode.status, 422);
  assert.match((await missingBarcode.json()).error, /identitet/);
  const split = [fixture[0], { ...fixture[0], id: "another-expiry", expiration_date: "2026-10-15", quantity: 2.5 }];
  await verifyResponse(await harness({ items: split }).invoke(), split);
  console.log("PASS actual GET download handler: admin-only, finalized-only, one-click controlled download, strict production 422, XLSX attachment, 13/22/14/101 = 150, blanks and reconciliation failure.");
  if (process.argv.includes("--live-read")) {
    require("@next/env").loadEnvConfig(root);
    const { createClient } = require("@supabase/supabase-js");
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const lookup = await client.from("writeoff_list_items").select("writeoff_list_id").in("article_id", [1039, 1698, 9249, 15380]);
    if (lookup.error) throw new Error("Read-only Supabase inventory check failed.");
    for (const id of new Set(lookup.data.map((row) => row.writeoff_list_id))) {
      const savedList = await client.from("writeoff_lists").select("id, status").eq("id", id).single();
      const savedItems = await client.from("writeoff_list_items").select("*").eq("writeoff_list_id", id);
      if (savedList.error || savedItems.error) throw new Error("Read-only saved inventory lookup failed.");
      const live = harness({ liveService: client });
      const response = await live.invoke("", id);
      if (savedList.data.status !== "finalized") {
        assert.equal(response.status, 409);
        console.log("Existing inventory is a draft; endpoint correctly refuses it. No status changed.");
      } else {
        await verifyResponse(response, savedItems.data);
        console.log(`PASS GET handler with live Supabase read-only data: ${savedItems.data.length} rows; saved total ${savedItems.data.reduce((sum, row) => sum + Number(row.quantity), 0)}. Auth boundary simulated; no data writes.`);
      }
    }
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
