/* Credential-free regression tests. All SOAP/database boundaries are simulated; no production writes. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { NextRequest, NextResponse } = require("next/server");
const root = path.resolve(__dirname, "..");
const store1 = "11111111-1111-4111-8111-111111111111";
const store2 = "22222222-2222-4222-8222-222222222222";
const supplierId = "33333333-3333-4333-8333-333333333333";
const stores = [{ id: store1, name: "Radnja 1", biznisoft_storage_id: 1 }, { id: store2, name: "Radnja 2", biznisoft_storage_id: 2 }];
const barcode = "0008600103056380";
const old = { storage_key: "1", storage_id: 1, article_id: 1698, name: "Verified article", barcode, unit: "KOM", amount: 31, retail_price: 100, wholesale_price: 80, last_seen_at: "2026-07-20T12:00:00Z", raw: {} };

function harness(options = {}) {
  const data = {
    stores: options.stores ?? stores,
    biznisoft_stock_price_current: options.stock ?? [{ ...old }],
    biznisoft_articles: options.articles ?? [{ article_id: 1698, article_code: "001698", name: "Verified article", barcode, unit: "KOM", raw: {} }],
    article_suppliers: [],
    writeoff_lists: [{ id: store1, store_id: store1, supplier_id: supplierId, supplier_name: "Supplier snapshot", status: "draft", stores: { biznisoft_storage_id: 1 } }],
    writeoff_list_items: []
  };
  const calls = [], soap = [], priceCalls = [], rpc = [];
  const client = {
    from(table) {
      const call = { table, filters: [], payload: null, verb: "select", single: false, limit: Infinity, from: 0 };
      calls.push(call);
      const chain = new Proxy({}, { get(_, key) {
        if (key === "then") return (resolve, reject) => Promise.resolve().then(() => {
          if (call.verb === "upsert") {
            const existing = data[table].find((row) => row.storage_key === call.payload.storage_key);
            if (existing) Object.assign(existing, call.payload); else data[table].push({ ...call.payload });
            return { data: null, error: null };
          }
          if (call.verb === "insert") {
            data[table].push({ ...call.payload });
            return { data: call.payload, error: null };
          }
          let rows = data[table] ?? [];
          for (const [verb, field, value] of call.filters) rows = rows.filter((row) => {
            const actual = field.startsWith("raw->") ? row.raw?._barcodeSpec?.[field.split("->>")[1]] : row[field];
            return verb === "in" ? value.includes(actual) : actual === value;
          });
          rows = rows.slice(call.from, call.from + call.limit);
          return { data: call.single ? rows[0] ?? null : rows, error: null };
        }).then(resolve, reject);
        return (...args) => {
          if (["eq", "in"].includes(key)) call.filters.push([key, ...args]);
          if (key === "upsert") { call.verb = key; call.payload = args[0]; }
          if (key === "insert") { call.verb = key; call.payload = args[0]; }
          if (key === "limit") call.limit = args[0];
          if (key === "range") { call.from = args[0]; call.limit = args[1] - args[0] + 1; }
          if (["single", "maybeSingle"].includes(key)) call.single = true;
          return chain;
        };
      } });
      return chain;
    },
    async rpc(name, args) {
      rpc.push({ name, args });
      throw new Error("Article lookup must not perform database synchronization");
    }
  };

  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const localRequire = (name) => {
      if (name === "server-only") return {};
      if (name === "@/lib/supabase/service") return { createServiceClient: () => client };
      if (name === "@/lib/supabase/server") return { createClient: () => ({}) };
      if (name === "@/lib/security/api") return { authorizeApi: async () => options.role === "store" || options.role === "anonymous" ? { ok: false, response: NextResponse.json({ error: "Denied" }, { status: options.role === "store" ? 403 : 401 }) } : { ok: true, profile: { id: store1 } } };
      if (name === "@/lib/biznisoft/soap-client") return {
        getBizniSoftCredentials: () => ({ soapUrl: "http://example.test/soap" }), getSessionHandle: async () => "{TEST_ONLY_SESSION_VALUE}",
        getItem: async (args) => {
          priceCalls.push(args);
          if (!options.livePrice) throw new Error("TEST_ONLY_PRICE_UNAVAILABLE");
          const request = JSON.parse(args.jsonGetItemRequest);
          return JSON.stringify(typeof options.livePrice === "function" ? options.livePrice(request) : options.livePrice);
        },
        getItems: async (args) => {
          soap.push(args);
          throw new Error("Write-off lookup must not start a mass synchronization");
        }
      };
      if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`);
      return require(name);
    };
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, process: { env: options.env ?? {} }, Date, Intl, Error, console: { error() {} }, crypto: require("node:crypto").webcrypto, setTimeout, clearTimeout, Buffer }, { filename: file });
    return module.exports;
  }
  return { load, data, calls, soap, priceCalls, rpc };
}

async function main() {
  const catalogOnly = harness({ stock: [{ ...old, storage_key: "2", storage_id: 2 }] });
  const lookup = catalogOnly.load("lib/biznisoft/writeoff-lookup.ts").lookupWriteoffArticles;
  const found = await lookup(1, barcode);
  assert.equal(found.length, 1);
  assert.equal(found[0].article_id, 1698);
  assert.equal(found[0].article_code, "001698");
  assert.equal(found[0].barcode, barcode);
  assert.equal(found[0].stock_amount, null, "Never uses another store's stock or invented zero");
  assert.equal(found[0].price, null);
  assert.equal(found[0].price_message, "Artikal je pronađen. Aktuelna cena za izabranu radnju nije dostupna.");
  assert.equal(catalogOnly.soap.length, 0, "Lookup never triggers a full inventory synchronization");
  assert.equal(catalogOnly.priceCalls[0].itemType, "qtArticlePriceForPOS");
  assert.equal(JSON.parse(catalogOnly.priceCalls[0].jsonGetItemRequest).StorageID, 1);
  const save = await catalogOnly.load("app/api/admin/popis-otpis/[id]/items/route.ts").POST(new NextRequest(`http://localhost/api/admin/popis-otpis/${store1}/items`, {
    method: "POST", body: JSON.stringify({ article_id: 1698, barcode, supplier_id: supplierId, client_entry_id: store2, quantity: 13, expiration_date: "2027-01-05" })
  }), { params: Promise.resolve({ id: store1 }) });
  assert.equal(save.status, 201, "Catalog-verified item can be saved without store stock");
  const savedItem = (await save.json()).item;
  assert.equal(savedItem.quantity, 13);
  assert.equal(savedItem.expiration_date, "2027-01-05");
  assert.equal(savedItem.stock_amount, null);
  assert.equal(savedItem.price, null, "Does not copy another store's accounting price");
  assert.equal(savedItem.store_id, store1);
  assert.equal(savedItem.supplier_name, "Supplier snapshot");
  assert.equal(savedItem.article_code, "001698");
  const forged = await catalogOnly.load("app/api/admin/popis-otpis/[id]/items/route.ts").POST(new NextRequest(`http://localhost/api/admin/popis-otpis/${store1}/items`, {
    method: "POST", body: JSON.stringify({ article_id: 1039, barcode, supplier_id: supplierId, client_entry_id: store2, quantity: 13, expiration_date: "2027-01-05" })
  }), { params: Promise.resolve({ id: store1 }) });
  assert.equal(forged.status, 409, "A different article ID cannot borrow a verified barcode");
  const stale = harness({ stock: [{ ...old }] });
  assert.equal((await stale.load("lib/biznisoft/writeoff-lookup.ts").lookupWriteoffArticles(1, barcode))[0].stock_amount, null);
  const fresh = harness({ stock: [{ ...old, amount: 0, retail_price: 0, last_seen_at: new Date().toISOString() }] });
  const freshResult = (await fresh.load("lib/biznisoft/writeoff-lookup.ts").lookupWriteoffArticles(1, barcode))[0];
  assert.equal(freshResult.stock_amount, null, "Write-off does not collect stock quantities");
  assert.equal(freshResult.price, 0, "An authoritative zero price stays zero");
  assert.equal(freshResult.price_source, "cache");
  assert.equal(fresh.priceCalls.length, 0, "A fresh store-specific price does not need another live call");
  const live = harness({ stock: [], livePrice: (request) => ({ ...request, PriceWithVat: "47,99", PriceWithoutVat: 40 }) });
  const liveResult = (await live.load("lib/biznisoft/writeoff-lookup.ts").lookupWriteoffArticles(1, barcode))[0];
  assert.equal(liveResult.price, 47.99);
  assert.equal(liveResult.article_code, "001698");
  assert.equal(liveResult.price_source, "live");
  assert.equal(liveResult.stock_amount, null);
  assert.equal(live.rpc.length, 0, "Single-item price lookup performs no synchronization/cache writes");
  assert.equal(live.soap.length, 0);
  for (const badPrice of [
    (request) => ({ ...request, StorageID: 2, PriceWithVat: 47.99 }),
    (request) => ({ ...request, ArticleID: 1039, PriceWithVat: 47.99 }),
    (request) => ({ ...request, Date: "2000-01-01", PriceWithVat: 47.99 }),
    (request) => ({ ...request, PriceWithVat: null }),
    (request) => ({ ...request, PriceWithVat: -1 })
  ]) {
    const invalid = harness({ stock: [{ ...old }], livePrice: badPrice });
    const invalidResult = (await invalid.load("lib/biznisoft/writeoff-lookup.ts").lookupWriteoffArticles(1, barcode))[0];
    assert.equal(invalidResult.price, null, "Never use another store/date/article price, negative price, or stale fallback");
    assert.equal(invalidResult.price_source, "unavailable");
  }
  const alias = harness({ stock: [], articles: [{ article_id: 1698, article_code: "001698", name: "Known alias", barcode: "different-primary", unit: "KOM", raw: { _barcodeSpec: { ArticleID: 1698, Barcode: barcode } } }] });
  assert.equal((await alias.load("lib/biznisoft/writeoff-lookup.ts").lookupWriteoffArticles(1, barcode))[0].barcode, barcode);
  const collision = harness({ stock: [], articles: [
    { article_id: 1698, name: "First", barcode, raw: {} },
    { article_id: 1039, name: "Second", barcode: "other", raw: { _barcodeSpec: { ArticleID: 1039, Barcode: barcode } } }
  ] });
  assert.equal((await collision.load("lib/biznisoft/writeoff-lookup.ts").lookupWriteoffArticles(1, barcode)).length, 2, "Verified barcode collisions are not hidden");
  assert.equal(collision.priceCalls.length, 0, "A barcode collision requires selection before live price lookup");
  await collision.load("lib/biznisoft/writeoff-lookup.ts").lookupWriteoffArticles(1, barcode, { articleId: 1039 });
  assert.equal(JSON.parse(collision.priceCalls[0].jsonGetItemRequest).ArticleID, 1039);
  for (const call of catalogOnly.calls.filter((call) => call.table === "biznisoft_stock_price_current")) assert(call.filters.some(([verb, key, value]) => verb === "eq" && key === "storage_key" && value === "1"));
  assert(!catalogOnly.calls.some((call) => call.filters.some((filter) => filter[1] === "supplier_id")));


  const endpoint = live.load("app/api/admin/popis-otpis/lookup/route.ts");
  const url = "http://localhost/api/admin/popis-otpis/lookup?store_id=" + store1 + "&barcode=" + encodeURIComponent(barcode);
  const apiResponse = await endpoint.GET(new NextRequest(url));
  assert.equal(apiResponse.status, 200);
  const apiResult = await apiResponse.json();
  assert.equal(apiResult.article.price, 47.99);
  assert.equal(apiResult.article.barcode, barcode);
  for (const [role, status] of [["store", 403], ["anonymous", 401]]) {
    const denied = harness({ role });
    assert.equal((await denied.load("app/api/admin/popis-otpis/lookup/route.ts").GET(new NextRequest(url))).status, status);
    assert.equal(denied.calls.length, 0);
    assert.equal(denied.priceCalls.length, 0);
  }
  const invalidId = await endpoint.GET(new NextRequest(url + "&article_id=-1"));
  assert.equal(invalidId.status, 400);
  const unknown = harness({ stock: [], articles: [] });
  assert.equal((await unknown.load("lib/biznisoft/writeoff-lookup.ts").lookupWriteoffArticles(1, barcode)).length, 0);
  assert.equal(unknown.priceCalls.length, 0, "Unknown barcode must not trigger guessed article price requests");
  const liveSave = await live.load("app/api/admin/popis-otpis/[id]/items/route.ts").POST(new NextRequest(
    "http://localhost/api/admin/popis-otpis/" + store1 + "/items", { method: "POST",
      body: JSON.stringify({ article_id: 1698, barcode, price: 1, supplier_id: supplierId, client_entry_id: store2, quantity: 13, expiration_date: "2027-01-05" })
    }), { params: Promise.resolve({ id: store1 }) });
  assert.equal(liveSave.status, 201);
  const liveSavedItem = (await liveSave.json()).item;
  assert.equal(liveSavedItem.price, 47.99, "Save uses server-resolved store price, not a client supplied price");
  assert.equal(liveSavedItem.quantity, 13, "Manual write-off quantity is never replaced by stock amount");
  assert.equal(liveSavedItem.expiration_date, "2027-01-05");
  const component = fs.readFileSync(path.join(root, "components/popis-otpis/PopisOtpisEditor.tsx"), "utf8");
  assert(!/StockRefreshControl|Trenutno stanje|stock_amount/.test(component));
  assert.match(component, /Cena za/);
  assert.match(component, /refreshSelectedPrice/);
  console.log("PASS write-off lookup: catalog without stock, exact barcodes/collisions, selected-store live prices, fresh cache, stale/wrong-price rejection, admin API, authoritative saved price, manual quantity, no sync writes.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
