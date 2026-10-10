const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const ExcelJS = require("exceljs");

const root = path.resolve(__dirname, "..");
const cache = new Map();

function loadTs(relativePath) {
  const file = relativePath.replace(/\\/g, "/").replace(/^@\//, "") .replace(/\.tsx?$/, "") + ".ts";
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} };
  cache.set(file, module);
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const localRequire = (specifier) => {
    if (specifier === "server-only") return {};
    if (specifier.startsWith("@/lib/")) return loadTs(specifier);
    return require(specifier);
  };
  vm.runInNewContext(code, {
    module,
    exports: module.exports,
    require: localRequire,
    Buffer,
    Date,
    console,
    process,
    setTimeout,
    clearTimeout
  }, { filename: file });
  return module.exports;
}

function item(index, overrides = {}) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    writeoff_list_id: "00000000-0000-4000-8000-000000000001",
    client_entry_id: `00000000-0000-4000-8000-${String(index + 1000).padStart(12, "0")}`,
    store_id: "00000000-0000-4000-8000-000000000002",
    supplier_id: "00000000-0000-4000-8000-000000000003",
    article_id: index,
    article_code: String(index).padStart(6, "0"),
    barcode: `00000000000${index}`,
    article_name: `Artikal ${index}`,
    unit: "KOM",
    quantity: 1,
    expiration_date: "2026-10-10",
    stock_amount: 20,
    stock_fetched_at: "2026-10-09T10:00:00.000Z",
    price: 10,
    level_price: 10,
    account: "13401",
    popdv_id: "3.7",
    vat_transaction_type: "Promet dobara i usluga bez naknade",
    operator_name: "EXAMPLE_OPERATOR",
    modify_time: "2026-10-09T10:00:00.000Z",
    supplier_name: "EXAMPLE SUPPLIER",
    store_name: "Radnja 1",
    created_by: "00000000-0000-4000-8000-000000000004",
    created_at: "2026-10-09T10:00:00.000Z",
    updated_at: "2026-10-09T10:00:00.000Z",
    ...overrides
  };
}

async function main() {
  const { buildBizniSoftWriteoffWorkbook, buildSupplierWriteoffWorkbook } = loadTs("lib/popis-otpis-export");
  const { formatBizniSoftArticleCode, normalizeStockSnapshot } = loadTs("lib/popis-otpis");
  assert.equal(formatBizniSoftArticleCode(1039), "001039");
  assert.equal(formatBizniSoftArticleCode(15380), "015380");
  const normalizedIdentity = normalizeStockSnapshot({ ID: 1039, StorageID: 1, Name: "Artikal", Barcode: "8606108042151", Unit: "KOM", RetailPrice: 32.99 }, "2026-10-09T10:00:00.000Z");
  assert.equal(normalizedIdentity.article_code, "001039");
  const four = [
    { quantity: 3, barcode: "7622202027215", article_code: "024183", article_name: "KRO 7D S.MAX KAK&VAN 110G", price: 147.99, level_price: 147.99, modify_time: "2026-05-16T18:03:15.000Z" },
    { quantity: 2, barcode: "5201360572793", article_code: "029230", article_name: "KRO 7D DOUBLE KA&VA 185", price: 239.99, level_price: 239.99, modify_time: "2026-05-16T18:03:26.000Z" },
    { quantity: 3, barcode: "7622202214332", article_code: "001773", article_name: "KRO 7D MINI KAKAO 185G", price: 239.99, level_price: 239.99, modify_time: "2026-05-16T18:03:38.000Z" },
    { quantity: 12, barcode: "7622202009075", article_code: "001872", article_name: "KRO 7D KAKAO MAX 80G", price: 107.99, level_price: 107.99, modify_time: "2026-05-16T18:03:52.000Z" }
  ].map((overrides, index) => item(index + 1, overrides));
  const result = await buildBizniSoftWriteoffWorkbook(four);
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(Buffer.from(await result.workbook.xlsx.writeBuffer()));
  const sheet = reopened.getWorksheet("BSRep_411717");
  assert(sheet);
  assert.equal(sheet.columnCount, 20);
  assert.equal(sheet.rowCount, 6);
  assert.equal(sheet.getCell("C2").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("C2").value, "7622202027215");
  assert.equal(sheet.getCell("D2").value, "024183");
  assert.equal(sheet.getCell("F2").value, 3);
  assert.equal(sheet.getCell("C3").value, "5201360572793");
  assert.equal(sheet.getCell("D3").value, "029230");
  assert.equal(sheet.getCell("F3").value, 2);
  assert.equal(sheet.getCell("C4").value, "7622202214332");
  assert.equal(sheet.getCell("D4").value, "001773");
  assert.equal(sheet.getCell("F4").value, 3);
  assert.equal(sheet.getCell("C5").value, "7622202009075");
  assert.equal(sheet.getCell("D5").value, "001872");
  assert.equal(sheet.getCell("F5").value, 12);
  assert.equal(sheet.getCell("F6").value, 20);
  assert.equal(sheet.getCell("A6").value, 4);
  assert.equal(sheet.getCell("E6").value, "UKUPNO ZA DOKUMENT:");
  assert.equal(sheet.getCell("L6").value, 2939.8);
  assert.equal(sheet.getCell("C6").value, null);

  if (process.argv.includes("--write-test-file")) {
    const outputDir = path.join(root, "biznisoft-output");
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, "popis-otpis-test-riba.xlsx"), Buffer.from(await result.workbook.xlsx.writeBuffer()));
    console.log("safe write-off test workbook written to biznisoft-output/popis-otpis-test-riba.xlsx");
  }
  if (process.argv.includes("--write-optional-fields-test")) {
    await writeOptionalFieldsTestWorkbook();
  }

  const strictMissingMetadataErrors = loadTs("lib/popis-otpis").validateWriteoffItems([item(1039, {
    article_code: null,
    level_price: null,
    account: null,
    popdv_id: null,
    vat_transaction_type: null
  })]);
  assert.match(strictMissingMetadataErrors.join(" "), /Niv\.cena/);
  assert.match(strictMissingMetadataErrors.join(" "), /Konto za artikal 1039/);
  assert.match(strictMissingMetadataErrors.join(" "), /POPDV ID za artikal 1039/);
  await assert.rejects(() => buildBizniSoftWriteoffWorkbook([item(1039, {
    quantity: 13, level_price: null, account: null, popdv_id: null, vat_transaction_type: null
  })]), /Niv\.cena/);

  // Synthetic metadata is test-only; saved quantities must never become stock amounts or test quantities.
  const savedQuantities = [13, 22, 14, 101];
  const savedFixture = [1039, 1698, 9249, 15380].map((id, index) => item(id, { quantity: savedQuantities[index], stock_amount: 999 }));
  const savedExport = await buildBizniSoftWriteoffWorkbook(savedFixture);
  const savedReopened = new ExcelJS.Workbook();
  await savedReopened.xlsx.load(Buffer.from(await savedExport.workbook.xlsx.writeBuffer()));
  const savedSheet = savedReopened.getWorksheet("BSRep_411717");
  assert.deepEqual(savedQuantities.map((_, index) => savedSheet.getCell(`F${index + 2}`).value), savedQuantities);
  assert.equal(savedSheet.getCell("F6").value, 150);

  for (const count of [1, 10, 100, 500]) {
    const rows = Array.from({ length: count }, (_, index) => item(index + 1));
    const built = await buildBizniSoftWriteoffWorkbook(rows);
    const check = new ExcelJS.Workbook();
    await check.xlsx.load(Buffer.from(await built.workbook.xlsx.writeBuffer()));
    const worksheet = check.getWorksheet("BSRep_411717");
    assert.equal(worksheet.rowCount, count + 2);
    assert.equal(worksheet.getCell(`F${count + 2}`).value, count);
    assert.equal(worksheet.getCell(`A${count + 2}`).value, count);
  }

  const split = [item(9, { quantity: 3, expiration_date: "2026-10-10" }), item(9, { quantity: 4, expiration_date: "2026-10-15", client_entry_id: "00000000-0000-4000-8000-000000000999" })];
  const aggregated = await buildBizniSoftWriteoffWorkbook(split);
  const aggregateCheck = new ExcelJS.Workbook();
  await aggregateCheck.xlsx.load(Buffer.from(await aggregated.workbook.xlsx.writeBuffer()));
  assert.equal(aggregateCheck.getWorksheet("BSRep_411717").getCell("F2").value, 7);
  const supplierWorkbook = await buildSupplierWriteoffWorkbook({ items: split, reference: "OT-TEST", supplierName: "EXAMPLE SUPPLIER" });
  const supplierCheck = new ExcelJS.Workbook();
  await supplierCheck.xlsx.load(Buffer.from(await supplierWorkbook.xlsx.writeBuffer()));
  const supplierSheet = supplierCheck.getWorksheet("Dobavljač");
  assert.equal(supplierSheet.rowCount, 3);
  assert.equal(supplierSheet.getCell("E2").type, ExcelJS.ValueType.Date);
  assert.equal(supplierSheet.getCell("E2").value.toISOString(), "2026-10-10T00:00:00.000Z");
  assert.equal(supplierSheet.getCell("E3").value.toISOString(), "2026-10-15T00:00:00.000Z");
  assert.equal(supplierSheet.getCell("E2").numFmt, "dd/mm/yy");
  assert.equal(supplierSheet.getCell("E3").numFmt, "dd/mm/yy");
  const supplierOnly = await buildSupplierWriteoffWorkbook({
    items: [item(1039, { article_code: null, price: null, level_price: null, account: null, popdv_id: null, vat_transaction_type: null })],
    reference: "OT-MISSING-METADATA",
    supplierName: "EXAMPLE SUPPLIER"
  });
  const supplierOnlyCheck = new ExcelJS.Workbook();
  await supplierOnlyCheck.xlsx.load(Buffer.from(await supplierOnly.xlsx.writeBuffer()));
  assert.equal(supplierOnlyCheck.getWorksheet("Dobavljač").getCell("B2").value, "000000000001039");
  console.log("writeoff export regression tests passed");
}

async function writeOptionalFieldsTestWorkbook() {
  const products = [
    { articleId: 1039, barcode: "8606108042151", name: "GRAND BLACK&EASY SEC.11G", price: 32.99 },
    { articleId: 1698, barcode: "8600103056380", name: "KAFA AROMA 200G", price: 477.99 },
    { articleId: 9249, barcode: "8600103056250", name: "KAFA GRAND 500G", price: 1187.99 },
    { articleId: 15380, barcode: "8600103027175", name: "CAJ FRUC.ED S.VOCE 50G", price: 167.99 }
  ];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fs.readFileSync(path.join(root, "public/templates/excel/biznisoft-otpis-import.xlsx")));
  const worksheet = workbook.getWorksheet("BSRep_411717");
  const setRow = (rowNumber, values) => values.forEach((value, index) => { worksheet.getCell(rowNumber, index + 1).value = value; });
  products.forEach((product, index) => setRow(index + 2, [
    "+", index + 1, product.barcode, String(product.articleId).padStart(6, "0"), product.name, 1, product.price,
    0, 0, null, null, product.price, null, null, null, null, null, null, null, null
  ]));
  setRow(6, [4, 4, null, null, "UKUPNO ZA DOKUMENT:", 4, null, null, 0, null, null, products.reduce((sum, product) => sum + product.price, 0), null, null, null, null, null, null, null, null]);
  const outputDir = path.join(root, "biznisoft-output");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "popis-otpis-optional-fields-test.xlsx");
  fs.writeFileSync(outputPath, Buffer.from(await workbook.xlsx.writeBuffer()));
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(fs.readFileSync(outputPath));
  const sheet = reopened.getWorksheet("BSRep_411717");
  assert(sheet);
  assert.equal(sheet.rowCount, 6);
  assert.equal(sheet.getCell("C2").value, "8606108042151");
  assert.equal(sheet.getCell("D2").value, "001039");
  assert.equal(sheet.getCell("F5").value, 1);
  assert.equal(sheet.getCell("F6").value, 4);
  assert.equal(sheet.getCell("L6").value, 1866.96);
  assert.equal(sheet.getCell("M2").value, null);
  assert.equal(sheet.getCell("N2").value, null);
  assert.equal(sheet.getCell("Q2").value, null);
  assert.equal(sheet.getCell("R2").value, null);
  console.log("optional-field test workbook written to biznisoft-output/popis-otpis-optional-fields-test.xlsx");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
