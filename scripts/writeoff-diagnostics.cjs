const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const ExcelJS = require("exceljs");
const JSZip = require("jszip");
const { DOMParser } = require("@xmldom/xmldom");

const root = path.resolve(__dirname, "..");
const output = path.join(root, "biznisoft-output", "diagnostics");
const sheetPath = "xl/worksheets/sheet1.xml";
const variants = [
  ["A-original-identical.xlsx", []],
  ["B-only-niv-cena-blank.xlsx", ["N"]],
  ["C-only-konto-blank.xlsx", ["M"]],
  ["D-only-popdv-blank.xlsx", ["Q"]],
  ["E-only-vat-type-blank.xlsx", ["R"]],
  ["F-all-four-blank.xlsx", ["M", "N", "Q", "R"]]
];
const hash = (buffer) => crypto.createHash("sha256").update(buffer).digest("hex");
const parse = (xml) => new DOMParser().parseFromString(xml, "text/xml");
const elements = (document, name) => Array.from(document.getElementsByTagName(name));

async function inspect(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.getWorksheet("BSRep_411717");
  assert(sheet, "Expected original sheet");
  const xml = await zip.file(sheetPath).async("string");
  const cells = new Map(elements(parse(xml), "c").map((cell) => [cell.getAttribute("r"), cell.toString()]));
  const entries = {};
  for (const [name, entry] of Object.entries(zip.files)) {
    if (!entry.dir) entries[name] = hash(await entry.async("nodebuffer"));
  }
  const reportCells = [];
  for (let row = 1; row <= 6; row++) {
    for (let col = 1; col <= 20; col++) {
      const cell = sheet.getCell(row, col);
      reportCells.push({ address: cell.address, type: cell.type, value: cell.value, numFmt: cell.numFmt, style: cell.style, xml: cells.get(cell.address) ?? null });
    }
  }
  return { zip, xml, cells, sheet, entries, report: {
    sha256: hash(buffer), quantities: [2, 3, 4, 5].map((r) => sheet.getCell(`F${r}`).value),
    totalQuantity: sheet.getCell("F6").value, dimensions: [sheet.rowCount, sheet.columnCount],
    merges: sheet.model.merges, properties: sheet.properties, views: sheet.views,
    pageSetup: sheet.pageSetup, cells: reportCells, entries
  } };
}

function validate(original, current, blankColumns) {
  assert.equal(current.sheet.rowCount, 6);
  assert.equal(current.sheet.columnCount, 20);
  assert.deepEqual(current.report.quantities, [3, 2, 3, 12]);
  assert.equal(current.report.totalQuantity, 20);
  const blank = new Set(blankColumns.flatMap((col) => [2, 3, 4, 5].map((r) => `${col}${r}`)));
  for (let r = 1; r <= 6; r++) {
    for (let c = 1; c <= 20; c++) {
      const expected = original.sheet.getCell(r, c);
      const actual = current.sheet.getCell(r, c);
      if (blank.has(actual.address)) {
        assert.equal(actual.value, null, `${actual.address} must be blank`);
      } else {
        assert.deepEqual(actual.value, expected.value, `${actual.address} value`);
        assert.equal(actual.type, expected.type, `${actual.address} type`);
        assert.equal(current.cells.get(actual.address), original.cells.get(actual.address), `${actual.address} XML`);
      }
      assert.equal(actual.numFmt, expected.numFmt, `${actual.address} format`);
      assert.deepEqual(actual.style, expected.style, `${actual.address} style`);
    }
  }
  for (const [name, entryHash] of Object.entries(original.entries)) {
    if (name !== sheetPath || blank.size === 0) assert.equal(current.entries[name], entryHash, `${name} unchanged`);
  }
  assert.deepEqual(Object.keys(current.entries).sort(), Object.keys(original.entries).sort());
  assert.equal(current.xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, ""), original.xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, ""));
}

async function traceSaved() {
  require("@next/env").loadEnvConfig(root);
  const { createClient } = require("@supabase/supabase-js");
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.from("writeoff_list_items")
    .select("id, writeoff_list_id, article_id, article_code, barcode, quantity, stock_amount, expiration_date")
    .in("article_id", [1039, 1698, 9249, 15380]);
  if (error) throw new Error("Read-only inventory trace failed.");
  const groups = {};
  for (const row of data ?? []) {
    const group = groups[row.writeoff_list_id] ?? { items: [], totalQuantity: 0 };
    group.items.push(row);
    group.totalQuantity += Number(row.quantity);
    groups[row.writeoff_list_id] = group;
  }
  await fs.writeFile(path.join(output, "saved-inventory-trace.json"), JSON.stringify({ readOnly: true, groups }, null, 2));
  console.log(`Read-only trace: ${data?.length ?? 0} saved rows; quantities ${data?.map((r) => r.quantity).join(", ")}`);
}

async function main() {
  const sourcePath = path.join(root, "public/templates/excel/biznisoft-otpis-import.xlsx");
  const originalBuffer = await fs.readFile(sourcePath);
  const original = await inspect(originalBuffer);
  assert.deepEqual(original.report.quantities, [3, 2, 3, 12]);
  await fs.mkdir(output, { recursive: true });
  const reports = { source: sourcePath, original: original.report, variants: {}, comparisons: {} };
  for (const [name, columns] of variants) {
    let buffer = originalBuffer;
    if (columns.length) {
      const zip = await JSZip.loadAsync(originalBuffer);
      const document = parse(original.xml);
      let xml = original.xml;
      for (const col of columns) {
        for (let row = 2; row <= 5; row++) {
          const address = `${col}${row}`;
          const cell = elements(document, "c").find((node) => node.getAttribute("r") === address);
          assert(cell, `Missing ${address}`);
          const style = cell.getAttribute("s");
          const expression = new RegExp(`<c\\b(?=[^>]*\\br="${address}")[^>]*(?:\\/>|>[\\s\\S]*?<\\/c>)`);
          assert(expression.test(xml), `Cannot isolate ${address}`);
          xml = xml.replace(expression, `<c r="${address}" s="${style}"/>`);
        }
      }
      zip.file(sheetPath, xml);
      buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    }
    const target = path.join(output, name);
    await fs.writeFile(target, buffer);
    const reopened = await inspect(await fs.readFile(target));
    validate(original, reopened, columns);
    if (!columns.length) assert.equal(hash(buffer), hash(originalBuffer));
    reports.variants[name] = reopened.report;
    console.log(`${name}: PASS; 4 articles; quantities 3, 2, 3, 12; total 20; blank columns ${columns.join(",") || "none"}`);
  }
  for (const name of ["popis-otpis-test-riba.xlsx", "popis-otpis-optional-fields-test.xlsx"]) {
    const file = path.join(root, "biznisoft-output", name);
    try {
      const compared = await inspect(await fs.readFile(file));
      const differences = compared.report.cells.filter((cell, index) => JSON.stringify(cell) !== JSON.stringify(original.report.cells[index]));
      const valueTypeDifferences = compared.report.cells.flatMap((cell, index) => {
        const source = original.report.cells[index];
        return JSON.stringify(cell.value) !== JSON.stringify(source.value) || cell.type !== source.type
          ? [{ address: cell.address, originalValue: source.value, generatedValue: cell.value, originalType: source.type, generatedType: cell.type }]
          : [];
      });
      reports.comparisons[name] = { ...compared.report, changedCells: differences.map((cell) => cell.address), valueTypeDifferences };
      console.log(`${name}: quantities ${compared.report.quantities.join(", ")}; total ${compared.report.totalQuantity}; ${differences.length} cells differ (including XML/style).`);
      console.log(`  Quantity format F2: original ${original.sheet.getCell("F2").numFmt}; generated ${compared.sheet.getCell("F2").numFmt}`);
      console.log(`  Merges: original ${original.report.merges.join(", ")}; generated ${compared.report.merges.join(", ")}`);
      for (const difference of valueTypeDifferences) console.log(`  ${difference.address}: ${JSON.stringify(difference)}`);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      reports.comparisons[name] = { unavailable: true };
      console.log(`${name}: not present; not regenerated or substituted.`);
    }
  }
  await fs.writeFile(path.join(output, "workbook-comparison.json"), JSON.stringify(reports, null, 2));
  await fs.writeFile(path.join(output, "TEST-ORDER.txt"), [
    "MANUAL TEST ONLY - DO NOT POST OR CONFIRM DOCUMENTS",
    "Use separate NEW UNPOSTED TEST write-off documents. Keep store, date, import operation and mapping identical.",
    "Test in this order:",
    ...variants.map(([name], index) => `${index + 1}. ${name}`),
    "Expected in EVERY file: codes 024183, 029230, 001773, 001872; quantities 3, 2, 3, 12; total 20.",
    "A is a byte-identical original. If A fails, stop: compare document/import settings before testing blanks.",
    "Capture import mapping/settings: sheet BSRep_411717, header row 1, detail rows 2-5, F=Kolicina, D=Sifra, C=Barkod. Footer row 6 is not an article.",
    "Do not change mappings between tests. Record imported quantities, recalculated fields, warnings and errors for each file.",
    "A passing and one of B-E failing isolates a field dependency ONLY under that document configuration.",
    "A-E passing but F failing indicates a combined dependency, not proof that all four are optional.",
    "If all six pass, compare the previously generated file with identical settings; XML rewrite differences remain a separate hypothesis.",
    "These ORIGINAL sample article/accounting values must never be reused for other products.",
    "Production accounting validation stays enabled until actual importer behavior is verified."
  ].join("\n") + "\n");
  if (process.argv.includes("--trace-saved")) await traceSaved();
  console.log(`Comparison report: ${path.join(output, "workbook-comparison.json")}`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
