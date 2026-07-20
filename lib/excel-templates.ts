import { readFile } from "fs/promises";
import path from "path";
import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { PRODUCE_STORE_NAMES } from "@/lib/produce";
import { temperatureSlotIndex } from "@/lib/temperature-slots";

const SERBIAN_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAJ", "JUN", "JUL", "AVG", "SEP", "OKT", "NOV", "DEC"];

export type ProduceExportBatch = {
  stores?: { name: string } | null;
  produce_request_items?: Array<{
    quantity: number | string;
    produce_items?: { name: string } | null;
  }>;
};

export type RevenueSpecificationReport = {
  report_date: string;
  cash_revenue: number | string;
  check_revenue: number | string;
  card_revenue: number | string;
  bank_transfer_revenue: number | string;
  correction_revenue: number | string;
  edopuna_revenue: number | string;
  total_revenue: number | string;
};

export type TemperatureChecklistReport = {
  report_date: string;
  shift: string | null;
  temperature: number | string;
  note: string | null;
  created_at: string;
};

export async function buildProduceOrderWorkbook(batches: ProduceExportBatch[]) {
  const workbook = await loadTemplate("trebovanje-voce-povrce.xlsx");
  const worksheet = requiredWorksheet(workbook, "Trebovanje");
  const templateRows = new Map<string, number>();

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const name = textValue(worksheet.getCell(rowNumber, 1).value);
    if (!name) continue;

    const normalized = normalizeProduceName(name);
    if (templateRows.has(normalized)) throw new Error(`Dupliran artikal u Excel šablonu: ${name}`);
    templateRows.set(normalized, rowNumber);

    for (let column = 2; column <= 11; column += 1) worksheet.getCell(rowNumber, column).value = 0;
    worksheet.getCell(rowNumber, 13).value = null;
    worksheet.getCell(rowNumber, 14).value = null;
  }

  const storeColumns = new Map(PRODUCE_STORE_NAMES.map((name, index) => [name, index + 2]));
  const unmatchedNames = new Set<string>();
  let unmatchedCount = 0;

  for (const batch of batches) {
    const storeName = relationValue(batch.stores)?.name;
    const storeColumn = storeName ? storeColumns.get(storeName as (typeof PRODUCE_STORE_NAMES)[number]) : undefined;
    if (!storeColumn) continue;

    for (const item of batch.produce_request_items ?? []) {
      const itemName = relationValue(item.produce_items)?.name;
      const quantity = numericValue(item.quantity);
      if (!itemName || quantity === null || quantity <= 0) continue;

      const rowNumber = templateRows.get(normalizeProduceName(itemName));
      if (!rowNumber) {
        unmatchedCount += 1;
        unmatchedNames.add(itemName);
        continue;
      }

      const cell = worksheet.getCell(rowNumber, storeColumn);
      cell.value = numericValue(cell.value) ?? 0;
      cell.value = Number(cell.value) + quantity;
    }
  }

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const total = rangeTotal(worksheet, rowNumber, 2, 11);
    worksheet.getCell(rowNumber, 12).value = { formula: `SUM(B${rowNumber}:K${rowNumber})`, result: total };
  }

  workbook.calcProperties.fullCalcOnLoad = true;
  return { workbook, unmatchedCount, unmatchedNames: Array.from(unmatchedNames).sort((a, b) => a.localeCompare(b, "sr")) };
}

export async function buildRevenueSpecificationWorkbook({
  month,
  reports,
  storeName
}: {
  month: string;
  reports: RevenueSpecificationReport[];
  storeName: string;
}) {
  const workbook = await loadTemplate("specifikacija-pazara.xlsx");
  const worksheet = requiredWorksheet(workbook, "List1");
  const { monthIndex, year } = parseMonth(month);
  const daysInMonth = new Date(year, monthIndex, 0).getDate();
  const byDay = new Map<number, RevenueTotals>();

  for (const report of reports) {
    const day = dayFromIsoDate(report.report_date, month);
    if (!day || day > daysInMonth) continue;

    const totals = byDay.get(day) ?? emptyRevenueTotals();
    totals.cash += numericValue(report.cash_revenue) ?? 0;
    totals.check += numericValue(report.check_revenue) ?? 0;
    totals.card += numericValue(report.card_revenue) ?? 0;
    totals.bankTransfer += numericValue(report.bank_transfer_revenue) ?? 0;
    totals.correction += numericValue(report.correction_revenue) ?? 0;
    totals.edopuna += numericValue(report.edopuna_revenue) ?? 0;
    totals.total += numericValue(report.total_revenue) ?? 0;
    byDay.set(day, totals);
  }

  worksheet.getCell("B1").value = `specifikacija pazara - ${storeName} - ${SERBIAN_MONTHS[monthIndex - 1]} ${year}`;

  for (let day = 1; day <= 31; day += 1) {
    const row = day + 2;
    for (const column of [2, 3, 4, 5, 6, 7, 8, 10]) worksheet.getCell(row, column).value = null;
    if (day > daysInMonth) continue;

    const totals = byDay.get(day);
    if (!totals) continue;
    worksheet.getCell(row, 2).value = totals.cash;
    worksheet.getCell(row, 3).value = totals.check;
    worksheet.getCell(row, 4).value = totals.card;
    worksheet.getCell(row, 5).value = totals.bankTransfer;
    worksheet.getCell(row, 6).value = totals.correction;
    worksheet.getCell(row, 7).value = totals.total;
    worksheet.getCell(row, 10).value = totals.edopuna;
  }

  const monthlyTotals = Array.from(byDay.values()).reduce(addRevenueTotals, emptyRevenueTotals());
  setSumFormula(worksheet, "B34", "B3:B33", monthlyTotals.cash);
  setSumFormula(worksheet, "C34", "C3:C33", monthlyTotals.check);
  setSumFormula(worksheet, "D34", "D3:D33", monthlyTotals.card);
  setSumFormula(worksheet, "E34", "E3:E33", monthlyTotals.bankTransfer);
  setSumFormula(worksheet, "F34", "F3:F33", monthlyTotals.correction);
  setSumFormula(worksheet, "G34", "G3:G33", monthlyTotals.total);
  worksheet.getCell("H34").value = null;
  setSumFormula(worksheet, "J34", "J3:J33", monthlyTotals.edopuna);

  workbook.calcProperties.fullCalcOnLoad = true;
  return workbook;
}

export async function buildTemperatureChecklistWorkbook({
  deviceName,
  month,
  reports,
  storeName
}: {
  deviceName: string;
  month: string;
  reports: TemperatureChecklistReport[];
  storeName: string;
}) {
  const workbook = await loadTemplate("temperatura-uredjaja.xlsx");
  const worksheet = requiredWorksheet(workbook, "List1");
  const { monthIndex, year } = parseMonth(month);
  const daysInMonth = new Date(year, monthIndex, 0).getDate();
  const latestBySlot = new Map<string, TemperatureChecklistReport>();
  let duplicateCount = 0;
  let unmappedShiftCount = 0;

  for (const report of reports) {
    const day = dayFromIsoDate(report.report_date, month);
    const slot = temperatureSlotIndex(report.shift);
    if (!day || day > daysInMonth) continue;
    if (slot === null) {
      unmappedShiftCount += 1;
      continue;
    }
    if (numericValue(report.temperature) === null) continue;

    const key = `${day}:${slot}`;
    const existing = latestBySlot.get(key);
    if (existing) duplicateCount += 1;
    if (!existing || Date.parse(report.created_at) >= Date.parse(existing.created_at)) latestBySlot.set(key, report);
  }

  worksheet.getCell("A2").value = `market br. ${storeName}`;
  worksheet.getCell("A3").value = `uređaj ${deviceName}`;
  worksheet.getCell("E3").value = `mesec ${SERBIAN_MONTHS[monthIndex - 1]} ${year}`;

  for (let day = 1; day <= 31; day += 1) {
    const layout = temperatureDayLayout(day);
    worksheet.getCell(layout.startRow, layout.dayColumn).value = day <= daysInMonth ? day : null;

    for (let slot = 0; slot < 3; slot += 1) {
      const row = layout.startRow + slot;
      worksheet.getCell(row, layout.temperatureColumn).value = null;
      worksheet.getCell(row, layout.signatureColumn).value = null;
      worksheet.getCell(row, layout.correctiveColumn).value = null;

      const report = latestBySlot.get(`${day}:${slot}`);
      if (!report) continue;
      worksheet.getCell(row, layout.temperatureColumn).value = numericValue(report.temperature);
      worksheet.getCell(row, layout.signatureColumn).value = storeName;
      worksheet.getCell(row, layout.correctiveColumn).value = report.note?.trim() || null;
    }
  }

  workbook.calcProperties.fullCalcOnLoad = true;
  return { workbook, duplicateCount, unmappedShiftCount };
}

export async function excelDownloadResponse(workbook: ExcelJS.Workbook, fileName: string) {
  const output = await workbook.xlsx.writeBuffer();
  const safeName = sanitizeFileName(fileName.endsWith(".xlsx") ? fileName : `${fileName}.xlsx`);
  const asciiName = safeName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "-");

  return new NextResponse(Buffer.from(output), {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }
  });
}

export function monthBounds(month: string) {
  const { monthIndex, year } = parseMonth(month);
  const lastDay = new Date(year, monthIndex, 0).getDate();
  return { end: `${month}-${String(lastDay).padStart(2, "0")}`, start: `${month}-01` };
}

export function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isIsoMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(5));
  return month >= 1 && month <= 12;
}

function parseMonth(month: string) {
  if (!isIsoMonth(month)) throw new Error("Mesec nije ispravan.");
  return { monthIndex: Number(month.slice(5)), year: Number(month.slice(0, 4)) };
}

async function loadTemplate(fileName: string) {
  const templateDirectory = path.join(process.cwd(), "public", "templates", "excel");
  let template: Buffer | null = null;

  for (const candidate of [fileName, `${fileName}.xlsx`]) {
    try {
      template = await readFile(path.join(templateDirectory, candidate));
      break;
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
  }

  if (!template) throw new Error(`Excel šablon nije pronađen: ${fileName}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(template).buffer);
  return workbook;
}

function requiredWorksheet(workbook: ExcelJS.Workbook, name: string) {
  const worksheet = workbook.getWorksheet(name);
  if (!worksheet) throw new Error(`Excel šablon nema radni list: ${name}`);
  return worksheet;
}

function relationValue<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function textValue(value: ExcelJS.CellValue) {
  return typeof value === "string" ? value.trim() : "";
}

function numericValue(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeProduceName(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("sr")
    .replace(/[đð]/g, "dj")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rangeTotal(worksheet: ExcelJS.Worksheet, row: number, startColumn: number, endColumn: number) {
  let total = 0;
  for (let column = startColumn; column <= endColumn; column += 1) total += numericValue(worksheet.getCell(row, column).value) ?? 0;
  return total;
}

type RevenueTotals = {
  cash: number;
  check: number;
  card: number;
  bankTransfer: number;
  correction: number;
  edopuna: number;
  total: number;
};

function emptyRevenueTotals(): RevenueTotals {
  return { bankTransfer: 0, card: 0, cash: 0, check: 0, correction: 0, edopuna: 0, total: 0 };
}

function addRevenueTotals(total: RevenueTotals, current: RevenueTotals) {
  total.cash += current.cash;
  total.check += current.check;
  total.card += current.card;
  total.bankTransfer += current.bankTransfer;
  total.correction += current.correction;
  total.edopuna += current.edopuna;
  total.total += current.total;
  return total;
}

function setSumFormula(worksheet: ExcelJS.Worksheet, address: string, range: string, result: number) {
  worksheet.getCell(address).value = { formula: `SUM(${range})`, result };
}

function dayFromIsoDate(value: string, month: string) {
  if (!value.startsWith(`${month}-`)) return null;
  const day = Number(value.slice(8, 10));
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

function temperatureDayLayout(day: number) {
  if (day <= 16) {
    return { correctiveColumn: 4, dayColumn: 1, signatureColumn: 3, startRow: 5 + (day - 1) * 3, temperatureColumn: 2 };
  }
  return { correctiveColumn: 8, dayColumn: 5, signatureColumn: 7, startRow: 5 + (day - 17) * 3, temperatureColumn: 6 };
}

function sanitizeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|\r\n]+/g, "-").replace(/\s+/g, " ").trim();
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
