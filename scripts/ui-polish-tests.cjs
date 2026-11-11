const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const React = require("react");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const today = "2026-11-11";
const noop = () => {};
const idle = { ok: false, message: "" };

// Run component handlers and effects with local fixtures; never call a production service.
function harness(mocks = {}, globals = {}) {
  const hooks = [];
  const effects = [];
  const modules = new Map();
  let index = 0;
  let actionState = idle;
  const react = {
    ...React,
    useState(initial) {
      const slot = index++;
      if (!(slot in hooks)) hooks[slot] = typeof initial === "function" ? initial() : initial;
      return [hooks[slot], (next) => { hooks[slot] = typeof next === "function" ? next(hooks[slot]) : next; }];
    },
    useRef(initial) {
      const slot = index++;
      return hooks[slot] ??= { current: initial };
    },
    useCallback: (callback) => callback,
    useMemo: (compute) => compute(),
    useEffect(effect, dependencies) {
      const slot = index++;
      const previous = hooks[slot];
      if (previous && dependencies.every((value, i) => Object.is(value, previous.dependencies[i]))) return;
      effects.push(() => {
        previous?.cleanup?.();
        hooks[slot] = { dependencies, cleanup: effect() };
      });
    }
  };

  function load(file) {
    if (modules.has(file)) return modules.get(file).exports;
    const module = { exports: {} };
    modules.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    const localRequire = (name) => {
      if (name in mocks) return mocks[name];
      if (name === "react") return react;
      if (name === "react-dom") return { useFormState: () => [actionState, noop], useFormStatus: () => ({ pending: false }) };
      if (name === "next/link") return () => null;
      if (name === "@/app/store/actions") return {};
      if (name.startsWith("@/")) {
        const base = name.slice(2);
        return load(`${base}${fs.existsSync(path.join(root, `${base}.tsx`)) ? ".tsx" : ".ts"}`);
      }
      return require(name);
    };
    vm.runInNewContext(code, { module, exports: module.exports, require: localRequire, URLSearchParams, AbortController, ...globals }, { filename: file });
    return module.exports;
  }

  return { load, setAction: (next) => { actionState = next; }, render(component, props) {
    index = 0;
    const tree = component(props);
    for (const effect of effects.splice(0)) effect();
    return tree;
  } };
}

function nodes(tree) {
  if (tree == null || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

const field = (tree, name) => nodes(tree).find((node) => node.props?.name === name).props;
const change = (input, value) => input.onChange({ target: { value } });
const text = (tree) => nodes(tree).flatMap((node) => node.props?.children).filter((value) => typeof value === "string").join(" ");
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

async function main() {
  const orders = harness();
  const { ProduceOrderForm } = orders.load("app/store/trebovanja/ProduceOrderForm.tsx");
  const item = { id: "item-1", name: "Jabuka", unit: "kg" };
  const orderProps = { items: [item], today };
  const order = () => orders.render(ProduceOrderForm, orderProps);
  for (let run = 0; run < 2; run += 1) {
    const tree = order();
    nodes(tree).find((node) => node.props?.item === item).props.updateQuantity(item.id, 5);
    change(field(tree, "request_date"), "2026-11-12");
    change(field(tree, "note"), "Zadržite napomenu");
    if (run === 0) {
      orders.setAction({ ok: false, message: "Greška" });
      assert.equal(field(order(), "request_date").value, "2026-11-12");
      assert.equal(field(order(), "note").value, "Zadržite napomenu");
      assert.equal(JSON.parse(field(order(), "items").value)[0].quantity, 5);
    }
    orders.setAction({ ok: true, message: "Uspešno poslato trebovanje" });
    order();
    assert.equal(field(order(), "items").value, "[]");
    assert.equal(field(order(), "note").value, "");
    assert.equal(field(order(), "request_date").value, today);
  }
  console.log("PASS store orders preserve failed drafts and clear consecutive successful submissions");

  const temperatures = harness();
  const { TemperatureForm } = temperatures.load("app/store/StoreForms.tsx");
  const temperature = () => temperatures.render(TemperatureForm, { devices: [{ id: "fridge-1", name: "Frižider" }], storeName: "Radnja 1", today });
  const entries = { report_date: "2026-11-10", shift: "prva", device_id: "fridge-1", temperature: "-18,5", note: "Provera" };
  for (const [name, value] of Object.entries(entries)) change(field(temperature(), name), value);
  temperatures.setAction({ ok: false, message: "Greška" });
  for (const [name, value] of Object.entries(entries)) assert.equal(field(temperature(), name).value, value);
  temperatures.setAction({ ok: true, message: "Sačuvano" });
  temperature();
  assert.equal(field(temperature(), "temperature").value, "");
  assert.equal(field(temperature(), "report_date").value, today);
  assert.equal(field(temperature(), "device_id").value, "");
  const revenue = harness();
  const renderRevenue = () => revenue.render(revenue.load("app/store/StoreForms.tsx").DailyRevenueForm, { storeName: "Radnja 1", today });
  change(field(renderRevenue(), "cash_revenue"), "");
  assert.equal(field(renderRevenue(), "cash_revenue").value, "");
  assert.equal(field(renderRevenue(), "total_revenue_display").value, 0);
  change(field(renderRevenue(), "cash_revenue"), "50.25");
  assert.equal(field(renderRevenue(), "total_revenue_display").value, 50.25);
  console.log("PASS temperature drafts survive failures; cleared revenue fields remain editable");

  let uploadCalls = 0;
  let saves = 0;
  let upload = deferred();
  const photos = harness({
    "@/lib/image-compression": { compressImage: async (file) => file },
    "@/lib/supabase/client": { createClient: () => ({ storage: { from: () => ({ upload: () => { uploadCalls++; return upload.promise; } }) } }) },
    "@/app/store/kontrola-police/actions": { submitShelfPhotoMetadata: async () => { saves++; return { ok: true, message: "Sačuvano" }; } }
  });
  const { ShelfPhotoForm } = photos.load("app/store/kontrola-police/ShelfPhotoForm.tsx");
  const photoForm = () => photos.render(ShelfPhotoForm, { storeId: "store-1", today });
  const file = { files: [{ name: "example.jpg" }], value: "example.jpg" };
  nodes(photoForm()).find((node) => node.props?.type === "file").ref.current = file;
  nodes(photoForm()).find((node) => node.type === "textarea").props.onChange({ target: { value: "Sačuvaj unos" } });
  const submit = photoForm().props.onSubmit;
  const first = submit({ preventDefault: noop });
  const second = submit({ preventDefault: noop });
  upload.resolve({ error: { message: "DO_NOT_EXPOSE_INTERNAL_ERROR" } });
  await Promise.all([first, second]);
  assert.equal(uploadCalls, 1);
  assert.equal(saves, 0);
  assert.equal(file.value, "example.jpg");
  assert.equal(nodes(photoForm()).find((node) => node.type === "textarea").props.value, "Sačuvaj unos");
  assert.doesNotMatch(text(photoForm()), /DO_NOT_EXPOSE/);
  upload = deferred();
  const retry = photoForm().props.onSubmit({ preventDefault: noop });
  upload.resolve({ error: null });
  await retry;
  assert.equal(saves, 1);
  assert.equal(file.value, "");
  console.log("PASS duplicate photo submits blocked; failures preserve the file and note and hide internal errors");

  const timers = new Map();
  const requests = [];
  let timerId = 0;
  const search = harness({}, {
    window: { setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: (id) => timers.delete(id) },
    fetch: (_url, options) => { const pending = deferred(); requests.push({ ...pending, signal: options.signal }); return pending.promise; }
  });
  const { SupplierSearchSelect } = search.load("components/povrati/SupplierSearchSelect.tsx");
  const supplier = () => search.render(SupplierSearchSelect, { selected: null, onChange: noop });
  const type = (query) => { change(nodes(supplier()).find((node) => node.type === "input").props, query); return supplier(); };
  const runTimer = () => { const [id, fn] = timers.entries().next().value; timers.delete(id); return fn(); };
  const response = (name) => ({ ok: true, json: async () => ({ suppliers: [{ id: name, name }] }) });
  assert.match(text(type("Prvi")), /Tražim dobavljače/);
  const firstSearch = runTimer();
  requests[0].resolve(response("Prvi dobavljač"));
  await firstSearch;
  assert.match(text(supplier()), /Prvi dobavljač/);
  assert.doesNotMatch(text(type("Drugi")), /Prvi dobavljač|Nema dobavljača/);
  const staleSearch = runTimer();
  type("Treći");
  assert.equal(requests[1].signal.aborted, true);
  const currentSearch = runTimer();
  requests[2].resolve(response("Treći dobavljač"));
  await currentSearch;
  requests[1].resolve(response("Drugi dobavljač"));
  await staleSearch;
  assert.match(text(supplier()), /Treći dobavljač/);
  assert.doesNotMatch(text(supplier()), /Drugi dobavljač/);
  console.log("PASS supplier search never offers stale results or false empty states while loading");

  const { Pagination } = harness().load("components/Pagination.tsx");
  const pages = { pageSize: 30, pathname: "/admin/povrati", searchParams: { supplier: "a", status: "draft", page: "9" } };
  const links = (tree) => nodes(tree).filter((node) => node.props?.href);
  assert.equal(links(Pagination({ ...pages, page: 1, totalCount: 31 })).length, 1);
  const [lastPage] = links(Pagination({ ...pages, page: 9, totalCount: 12 }));
  assert.equal(lastPage.props.href, "/admin/povrati?supplier=a&status=draft");
  console.log("PASS pagination preserves filters, skips disabled links and recovers from out-of-range pages");

  let statusError = null;
  const stores = [{ id: "store-1", name: "Radnja 1" }, { id: "store-2", name: "Radnja 2" }];
  const shelf = harness({
    "@/lib/auth": { requireAdmin: async () => {} },
    "@/components/AdminFilters": { AdminFilters: () => null },
    "@/app/admin/kontrola-police/DeleteShelfPhotoButton": { DeleteShelfPhotoButton: () => null },
    "@/lib/shelf-photos": { withSignedShelfPhotoUrls: async (_client, rows) => rows },
    "@/lib/supabase/server": { createClient: () => ({ from(table) {
      let columns;
      const query = {
        select(value) { columns = value; return query; },
        in: () => query, eq: () => query, order: () => query, range: () => query,
        then(resolve) {
          if (table === "stores") return resolve({ data: stores, error: null });
          if (columns === "store_id, storage_path") return resolve({ data: [{ store_id: "store-1", storage_path: "saved-photo" }], error: statusError });
          return resolve({ data: [], error: null, count: 0 });
        }
      };
      return query;
    } }) }
  });
  const shelfPage = shelf.load("app/admin/kontrola-police/page.tsx").default;
  const overview = () => shelfPage({ searchParams: Promise.resolve({ store_id: "store-1", date: today }) });
  const panels = (tree) => nodes(tree).filter((node) => node.props?.title === "Poslali sliku" || node.props?.title === "Nisu poslali sliku");
  const filtered = panels(await overview());
  assert.equal(filtered.length, 2);
  assert.equal(filtered[0].props.stores[0].id, "store-1");
  assert.equal(filtered[1].props.stores.length, 0, "An unselected store must not be marked missing");
  statusError = { message: "DO_NOT_EXPOSE_INTERNAL_ERROR" };
  const failed = await overview();
  assert.equal(panels(failed).length, 0, "A failed query must not be shown as a missing report");
  assert(nodes(failed).some((node) => node.props?.role === "alert"));
  assert.doesNotMatch(text(failed), /DO_NOT_EXPOSE/);
  console.log("PASS shelf status follows the selected store and avoids false missing reports on failure");

  const { formatTime } = harness().load("components/ShelfPhotoGrid.tsx");
  for (const timezone of ["UTC", "America/New_York", "Europe/Belgrade"]) {
    const previous = process.env.TZ;
    try {
      process.env.TZ = timezone;
      assert.equal(formatTime("2026-11-11T10:00:00Z"), "11:00");
      assert.equal(formatTime("2026-07-11T10:00:00Z"), "12:00");
    } finally {
      if (previous === undefined) delete process.env.TZ;
      else process.env.TZ = previous;
    }
  }
  console.log("PASS shelf timestamps use Serbian winter/summer time independently of the server timezone");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
