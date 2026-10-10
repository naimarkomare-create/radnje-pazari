import "server-only";

import { readFile } from "fs/promises";
import path from "path";
import ExcelJS from "exceljs";
import { writeoffExcelDate } from "@/lib/writeoff-date";
import {
  aggregateItemsByArticle,
  formatBizniSoftArticleCode,
  numericValue,
  validateWriteoffItems,
  WRITE_OFF_IMPORT_COLUMNS,
  WRITE_OFF_IMPORT_SHEET,
  type ImportableWriteoffItem
} from "@/lib/popis-otpis";

export async function buildBizniSoftWriteoffWorkbook(items: ImportableWriteoffItem[], options: { testOnly?: boolean } = {}) {
  const preparedItems = items.map((item) => ({
    ...item,
    article_code: item.article_code?.trim() || formatBizniSoftArticleCode(item.article_id)
  }));
  const errors = validateWriteoffItems(preparedItems, { requireBizniSoftMetadata: !options.testOnly });
  if (options.testOnly) {
    for (const item of preparedItems) {
      if (!Number.isInteger(item.article_id) || item.article_id <= 0 || !item.article_code) {
        errors.push("Probni izvoz zahteva pouzdan identitet svakog artikla.");
      }
    }
    const identities = new Map<number, ImportableWriteoffItem>();
    for (const item of preparedItems) {
      const previous = identities.get(item.article_id);
      if (previous && (previous.article_code !== item.article_code || previous.barcode !== item.barcode || previous.article_name !== item.article_name)) {
        errors.push(`Artikal ${item.article_id} ima neusaglašene sačuvane podatke. Probni izvoz je blokiran.`);
      }
      identities.set(item.article_id, item);
    }
  }
  if (errors.length > 0) throw new Error(errors.join(" "));

  const aggregated = aggregateItemsByArticle(preparedItems);
  const workbook = await loadWriteoffTemplate();
  const worksheet = workbook.getWorksheet(WRITE_OFF_IMPORT_SHEET);
  if (!worksheet) throw new Error(`BizniSoft šablon nema radni list ${WRITE_OFF_IMPORT_SHEET}.`);
  if (worksheet.columnCount !== WRITE_OFF_IMPORT_COLUMNS) {
    throw new Error("BizniSoft šablon nema očekivanih 20 kolona.");
  }

  const detailStyles = captureRow(worksheet, 2);
  const footerStyles = captureRow(worksheet, 6);
  const detailHeight = worksheet.getRow(2).height;
  const footerHeight = worksheet.getRow(6).height;
  if (options.testOnly) worksheet.unMergeCells("A6:B6");
  worksheet.spliceRows(2, Math.max(0, worksheet.rowCount - 1));
  // ExcelJS keeps removed styled rows in its internal row array. Trim those
  // template-only rows so the regenerated footer follows the actual details.
  const rows = (worksheet as unknown as { _rows: ExcelJS.Row[] })._rows;
  rows.splice(1);

  let totalQuantity = 0;
  let totalValue = 0;
  let allPricesAvailable = true;

  for (const [index, item] of aggregated.entries()) {
    const price = options.testOnly ? numericValue(item.price) : Number(item.price);
    const quantity = Number(item.quantity);
    const value = price === null ? null : quantity * price;
    totalQuantity += quantity;
    if (value === null) allPricesAvailable = false;
    else totalValue += value;
    const row = worksheet.getRow(index + 2);
    setRowValues(row, [
      "+",
      index + 1,
      textCell(item.barcode),
      textCell(item.article_code),
      item.article_name,
      quantity,
      price,
      options.testOnly ? null : 0,
      options.testOnly ? null : 0,
      null,
      null,
      value,
      textCell(item.account),
      options.testOnly ? numericValue(item.level_price) : Number(item.level_price),
      null,
      null,
      textCell(item.popdv_id),
      item.vat_transaction_type,
      toExcelDate(item.modify_time),
      item.operator_name
    ]);
    applyRowAppearance(row, detailStyles, detailHeight);
    forceText(row.getCell(3));
    forceText(row.getCell(4));
  }

  const footer = worksheet.getRow(aggregated.length + 2);
  setRowValues(footer, [
    aggregated.length,
    aggregated.length,
    null,
    null,
    "UKUPNO ZA DOKUMENT:",
    totalQuantity,
    null,
    null,
    options.testOnly ? null : 0,
    null,
    null,
    allPricesAvailable ? totalValue : null,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    null
  ]);
  applyRowAppearance(footer, footerStyles, footerHeight);
  if (options.testOnly) {
    worksheet.mergeCells(`A${aggregated.length + 2}:B${aggregated.length + 2}`);
    workbook.subject = "PROBNI XLSX - nije potvrđen za produkcijski otpis";
    workbook.description = "Iz sačuvanog završenog popisa. Nedostupna računovodstvena polja ostavljena su prazna.";
  }
  workbook.calcProperties.fullCalcOnLoad = false;
  return { workbook, itemCount: aggregated.length, totalQuantity, totalValue };
}

/** Reopen the exact download bytes; never substitute stock amounts for saved quantities. */
export async function buildVerifiedBizniSoftTestExport(items: ImportableWriteoffItem[]) {
  const result = await buildBizniSoftWriteoffWorkbook(items, { testOnly: true });
  const buffer = Buffer.from(await result.workbook.xlsx.writeBuffer());
  await verifyBizniSoftTestExport(buffer, items);
  return buffer;
}

export async function verifyBizniSoftTestExport(buffer: Buffer, items: ImportableWriteoffItem[]) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.getWorksheet(WRITE_OFF_IMPORT_SHEET);
  const expected = aggregateItemsByArticle(items);
  const fail = () => { throw new Error("Provera artikala i količina nije uspela. Probni XLSX nije preuzet."); };
  if (!sheet || workbook.worksheets.length !== 1 || sheet.columnCount !== 20 || sheet.rowCount !== expected.length + 2) return fail();
  let total = 0;
  for (const [index, item] of expected.entries()) {
    const row = sheet.getRow(index + 2);
    const code = item.article_code?.trim() || formatBizniSoftArticleCode(item.article_id);
    if (row.getCell(3).type !== ExcelJS.ValueType.String || row.getCell(3).value !== item.barcode ||
        row.getCell(4).type !== ExcelJS.ValueType.String || row.getCell(4).value !== code ||
        row.getCell(5).value !== item.article_name || row.getCell(6).type !== ExcelJS.ValueType.Number ||
        row.getCell(6).value !== Number(item.quantity)) return fail();
    total += Number(item.quantity);
  }
  const footer = sheet.getRow(expected.length + 2);
  if (footer.getCell(1).value !== expected.length || footer.getCell(5).value !== "UKUPNO ZA DOKUMENT:" ||
      footer.getCell(6).type !== ExcelJS.ValueType.Number || footer.getCell(6).value !== total) return fail();
}

function setRowValues(row: ExcelJS.Row, values: unknown[]) {
  for (let index = 0; index < WRITE_OFF_IMPORT_COLUMNS; index += 1) {
    row.getCell(index + 1).value = values[index] as ExcelJS.CellValue;
  }
}

export async function buildSupplierWriteoffWorkbook({
  items,
  reference,
  supplierName
}: {
  items: ImportableWriteoffItem[];
  reference: string;
  supplierName: string;
}) {
  const errors = validateWriteoffItems(items, { requireBizniSoftMetadata: false });
  if (errors.length > 0) throw new Error(errors.join(" "));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Interna aplikacija";
  workbook.subject = `Popis robe za otpis ${reference}`;
  const worksheet = workbook.addWorksheet("Dobavljač");
  worksheet.headerFooter.oddHeader = `${supplierName} · ${reference}`;
  worksheet.columns = [
    { header: "Redni broj", key: "rowNumber", width: 14 },
    { header: "Barkod", key: "barcode", width: 22 },
    { header: "Naziv proizvoda", key: "articleName", width: 42 },
    { header: "Količina", key: "quantity", width: 14 },
    { header: "Datum isteka roka", key: "expirationDate", width: 20 },
    { header: "Radnja", key: "storeName", width: 18 }
  ];
  worksheet.getRow(1).font = { bold: true };
  worksheet.getRow(1).alignment = { vertical: "middle" };
  for (const item of items) {
    const row = worksheet.addRow({
      articleName: item.article_name,
      barcode: textCell(item.barcode),
      expirationDate: writeoffExcelDate(item.expiration_date),
      quantity: Number(item.quantity),
      rowNumber: worksheet.rowCount,
      storeName: item.store_name
    });
    forceText(row.getCell(2));
    row.getCell(5).numFmt = "dd/mm/yy";
  }
  worksheet.autoFilter = { from: "A1", to: `F${Math.max(1, worksheet.rowCount)}` };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  return workbook;
}

function captureRow(worksheet: ExcelJS.Worksheet, rowNumber: number) {
  return Array.from({ length: WRITE_OFF_IMPORT_COLUMNS }, (_, index) => ({
    style: { ...worksheet.getCell(rowNumber, index + 1).style },
    numFmt: worksheet.getCell(rowNumber, index + 1).numFmt,
    alignment: worksheet.getCell(rowNumber, index + 1).alignment,
    border: worksheet.getCell(rowNumber, index + 1).border,
    fill: worksheet.getCell(rowNumber, index + 1).fill,
    font: worksheet.getCell(rowNumber, index + 1).font
  }));
}

function applyRowAppearance(row: ExcelJS.Row, styles: ReturnType<typeof captureRow>, height: number | undefined) {
  if (height !== undefined) row.height = height;
  for (let index = 0; index < styles.length; index += 1) {
    const cell = row.getCell(index + 1);
    const source = styles[index];
    cell.style = { ...source.style };
    cell.numFmt = source.numFmt;
    cell.alignment = source.alignment;
    cell.border = source.border;
    cell.fill = source.fill;
    cell.font = source.font;
  }
}

function forceText(cell: ExcelJS.Cell) {
  cell.numFmt = "@";
  cell.value = cell.value === null || cell.value === undefined ? null : String(cell.value);
}

function textCell(value: unknown) {
  return value === null || value === undefined ? null : String(value);
}

function toExcelDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function loadWriteoffTemplate() {
  const file = path.join(process.cwd(), "public", "templates", "excel", "biznisoft-otpis-import.xlsx");
  const template = await readFile(file);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(template as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  return workbook;
}
