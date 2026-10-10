const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");

// Exercise the actual component handlers with lightweight hooks, without browser or production credentials.
function harness() {
  const states = [];
  let cursor = 0;
  let fetchResponse = { ok: true };
  const requests = [];
  const downloads = [];
  const cache = new Map();
  const react = {
    ...require("react"),
    useId: () => "test-date",
    useEffect: () => {},
    useState: (initial) => {
      const slot = cursor++;
      if (!(slot in states)) states[slot] = typeof initial === "function" ? initial() : initial;
      return [states[slot], (next) => { states[slot] = typeof next === "function" ? next(states[slot]) : next; }];
    },
    useRef: (initial) => {
      const slot = cursor++;
      if (!(slot in states)) states[slot] = { current: initial };
      return states[slot];
    }
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const localRequire = (name) => {
      if (name === "react") return react;
      if (name === "next/link") return (props) => require("react").createElement("a", props);
      if (name === "@/lib/client-download") return { downloadResponseFile: async (...args) => downloads.push(args) };
      if (name.startsWith("@/")) {
        const base = name.slice(2);
        return load(`${base}${fs.existsSync(path.join(root, `${base}.tsx`)) ? ".tsx" : ".ts"}`);
      }
      return require(name);
    };
    const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    vm.runInNewContext(code, {
      module, exports: module.exports, require: localRequire, Date, Intl, console, setTimeout, clearTimeout, AbortController, DOMException, crypto: require("node:crypto").webcrypto,
      fetch: async (...args) => { requests.push(args); return fetchResponse; },
      window: { setTimeout, clearTimeout, setInterval, clearInterval }, document: { getElementById: () => null }
    }, { filename: file });
    return module.exports;
  }
  return {
    load, requests, downloads,
    response: (value) => { fetchResponse = value; },
    render: (component, props) => { cursor = 0; return component(props); }
  };
}

function nodes(tree) {
  if (tree == null || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

async function main() {
  const dates = harness().load("lib/writeoff-date.ts");
  for (const timezone of ["UTC", "Europe/Belgrade", "America/Los_Angeles", "Pacific/Kiritimati"]) {
    const original = process.env.TZ;
    try {
      process.env.TZ = timezone;
      for (const [display, iso] of [["10/10/26", "2026-10-10"], ["13/10/26", "2026-10-13"], ["25/12/26", "2026-12-25"], ["05/01/27", "2027-01-05"], ["29/02/28", "2028-02-29"], ["29/02/00", "2000-02-29"]]) {
        assert.equal(dates.parseWriteoffDate(display), iso);
        assert.equal(dates.formatWriteoffDate(iso), display);
        assert.equal(dates.writeoffExcelDate(iso).toISOString().slice(0, 10), iso);
      }
      for (const invalid of ["31/02/27", "29/02/27", "00/10/26", "13/00/26", "13/13/26", "10/13/26", "01/01/2027", "2026-10-13", "1/1/27"]) {
        assert.equal(dates.parseWriteoffDate(invalid), null, invalid);
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  }

  const exports = harness();
  const ExportButtons = exports.load("components/popis-otpis/WriteoffExportButtons.tsx").WriteoffExportButtons;
  const exportProps = { listId: "existing-finalized-list", reference: "OT-TEST" };
  let tree = exports.render(ExportButtons, exportProps);
  assert.equal(nodes(tree).filter((node) => node.type === "button").length, 2);
  assert(!nodes(tree).some((node) => node.type === "input" && node.props.type === "checkbox"));
  const button = nodes(tree).find((node) => node.type === "button" && node.props.children === "BizniSoft izvoz");
  button.props.onClick();
  button.props.onClick();
  await tick();
  assert.equal(exports.requests.length, 1, "Double click does not send two requests");
  assert.match(exports.requests[0][0], /\/export\/biznisoft\?mode=test$/);
  assert.equal(exports.downloads.length, 1, "One click downloads directly");
  exports.response({ ok: false, json: async () => ({ error: "Artikal 1039 nema potpun identitet." }) });
  nodes(exports.render(ExportButtons, exportProps)).find((node) => node.type === "button").props.onClick();
  await tick();
  tree = exports.render(ExportButtons, exportProps);
  assert(nodes(tree).some((node) => node.props.role === "alert"));
  assert(nodes(tree).filter((node) => node.type === "button").every((node) => !node.props.disabled), "Failure clears busy state");

  const input = harness();
  const DateInput = input.load("components/popis-otpis/ExpirationDateInput.tsx").ExpirationDateInput;
  let display = "13/10/26";
  const props = () => ({ value: display, onChange: (value) => { display = value; } });
  tree = input.render(DateInput, props());
  assert.equal(nodes(tree).find((node) => node.type === "input").props.type, "text");
  assert.equal(nodes(tree).find((node) => node.type === "input").props.value, "13/10/26");
  nodes(tree).find((node) => node.props.children === "Kalendar").props.onClick();
  tree = input.render(DateInput, props());
  nodes(tree).find((node) => node.props["aria-label"] === "25/10/26").props.onClick();
  assert.equal(display, "25/10/26");
  assert.equal(dates.parseWriteoffDate(display), "2026-10-25");
  // Same component is used when editing stored dates after reload.
  display = dates.formatWriteoffDate("2027-01-05");
  tree = input.render(DateInput, props());
  const field = nodes(tree).find((node) => node.type === "input");
  assert.equal(field.props.value, "05/01/27");
  field.props.onChange({ target: { value: "310227" } });
  assert.equal(display, "31/02/27");
  assert.equal(nodes(input.render(DateInput, props())).find((node) => node.type === "input").props["aria-invalid"], true);
  assert.equal(dates.parseWriteoffDate(display), null);
  field.props.onChange({ target: { value: "13/102" } });
  assert.equal(display, "13/10/2", "Typing continues correctly after automatically inserted separator");

  const editor = harness();
  const Editor = editor.load("components/popis-otpis/PopisOtpisEditor.tsx").PopisOtpisEditor;
  tree = editor.render(Editor, { list: { status: "finalized", reference: "OT-TEST", supplier_name: "Supplier" }, initialItems: [{ id: "saved", quantity: 13, expiration_date: "2026-10-13" }] });
  assert(nodes(tree).some((node) => node.type === "strong" && node.props.children === "13/10/26"), "Finalized review displays stored ISO date in Serbian format");
  assert(!nodes(tree).some((node) => node.type === "input" && node.props.type === "date"));

  const draft = harness();
  const DraftEditor = draft.load("components/popis-otpis/PopisOtpisEditor.tsx").PopisOtpisEditor;
  const draftProps = { list: { id: "draft", status: "draft", reference: "OT-TEST", supplier_id: "supplier", supplier_name: "Supplier", store_id: "store" }, initialItems: [] };
  tree = draft.render(DraftEditor, draftProps);
  const scanInput = nodes(tree).find((node) => node.type === "input" && node.props.enterKeyHint === "search");
  scanInput.props.onChange({ target: { value: "0001039" } });
  tree = draft.render(DraftEditor, draftProps);
  draft.response({ ok: true, json: async () => ({ candidates: [{ article_id: 1039, barcode: "0001039", article_name: "Known article" }] }) });
  await nodes(tree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  tree = draft.render(DraftEditor, draftProps);
  nodes(tree).find((node) => node.props.id === "writeoff-quantity").props.onChange({ target: { value: "13" } });
  nodes(tree).find((node) => node.type?.name === "ExpirationDateInput").props.onChange("31/02/27");
  tree = draft.render(DraftEditor, draftProps);
  const forms = () => nodes(tree).filter((node) => node.type === "form");
  await forms()[1].props.onSubmit({ preventDefault() {} });
  assert.equal(draft.requests.length, 1, "Invalid expiration date must not send a save request");
  nodes(tree).find((node) => node.type?.name === "ExpirationDateInput").props.onChange("05/01/27");
  tree = draft.render(DraftEditor, draftProps);
  draft.response({ ok: true, json: async () => ({ item: { id: "saved", quantity: 13, expiration_date: "2027-01-05" } }) });
  await forms()[1].props.onSubmit({ preventDefault() {} });
  const payload = JSON.parse(draft.requests[1][1].body);
  assert.equal(payload.expiration_date, "2027-01-05", "Save payload is ISO, not localized or swapped");
  assert.equal(payload.quantity, 13);
  tree = draft.render(DraftEditor, draftProps);
  assert.equal(nodes(tree).find((node) => node.type === "input" && node.props.enterKeyHint === "search").props.value, "", "Scan field is cleared for next product");
  nodes(tree).find((node) => node.type === "button" && node.props.children === "Izmeni").props.onClick();
  tree = draft.render(DraftEditor, draftProps);
  assert.equal(nodes(tree).find((node) => node.type?.name === "ExpirationDateInput").props.value, "05/01/27");
  nodes(tree).find((node) => node.type?.name === "ExpirationDateInput").props.onChange("13/10/26");
  tree = draft.render(DraftEditor, draftProps);
  draft.response({ ok: true, json: async () => ({ item: { id: "saved", quantity: 13, expiration_date: "2026-10-13" } }) });
  await nodes(tree).find((node) => node.type === "button" && node.props.children === "Sačuvaj").props.onClick();
  assert.equal(JSON.parse(draft.requests[2][1].body).expiration_date, "2026-10-13", "Edit payload never interprets 13 as month");

  const collision = harness();
  const CollisionEditor = collision.load("components/popis-otpis/PopisOtpisEditor.tsx").PopisOtpisEditor;
  tree = collision.render(CollisionEditor, draftProps);
  nodes(tree).find((node) => node.type === "input" && node.props.enterKeyHint === "search").props.onChange({ target: { value: "0001039" } });
  tree = collision.render(CollisionEditor, draftProps);
  const candidate = { article_id: 1039, article_code: "001039", barcode: "0001039", article_name: "First article", price: null, price_source: "selection_required", price_checked_at: null };
  collision.response({ ok: true, json: async () => ({ candidates: [candidate, { ...candidate, article_id: 1698, article_name: "Second article" }] }) });
  await nodes(tree).find((node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  tree = collision.render(CollisionEditor, draftProps);
  let resolvePrice;
  collision.response({ ok: true, json: () => new Promise((resolve) => { resolvePrice = resolve; }) });
  nodes(tree).find((node) => node.type === "button" && nodes(node).some((child) => child.type === "strong" && child.props.children === "First article")).props.onClick();
  await tick();
  tree = collision.render(CollisionEditor, draftProps);
  assert(nodes(tree).find((node) => node.type === "button" && node.props.children === "Potvrdi stavku").props.disabled, "Wait for the selected article price lookup before saving");
  assert.match(collision.requests[1][0], /article_id=1039/);
  resolvePrice({ candidates: [{ ...candidate, price: 47.99, price_source: "live", price_checked_at: "2026-10-10T12:00:00Z" }] });
  await tick();
  tree = collision.render(CollisionEditor, draftProps);
  assert.equal(nodes(tree).find((node) => node.type === "button" && node.props.children === "Potvrdi stavku").props.disabled, false);
  assert(nodes(tree).some((node) => node.type === "p" && JSON.stringify(node.props.children).includes("47,99")), "Current price uses Serbian decimals");
  nodes(tree).find((node) => node.props["aria-label"] === "Poništi artikal").props.onClick();
  tree = collision.render(CollisionEditor, draftProps);
  assert(!nodes(tree).some((node) => node.props.id === "writeoff-quantity"), "Cancel restores the scan workflow");

  assert.doesNotMatch(fs.readFileSync(path.join(root, "components/popis-otpis/PopisOtpisEditor.tsx"), "utf8"), /StockRefreshControl|Trenutno stanje|stock_amount|Osveži stanje/);
  console.log("PASS writeoff UI/date regression: one-click download, no consent, double-click lock, error recovery, DD/MM/YY input/calendar/review/edit, leap years, invalid dates, four timezones.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
