"use client";

import type { DailyRevenueReport, Store } from "@/lib/types";

type RevenueExportReport = DailyRevenueReport & { stores?: { name: string } | null };

export function RevenueExportButtons({
  reports,
  stores,
  dateFrom,
  dateTo
}: {
  reports: RevenueExportReport[];
  stores: Store[];
  dateFrom: string;
  dateTo: string;
}) {
  async function exportWorkbook(type: "all" | "cash") {
    const XLSX = await import("xlsx");
    const rows = buildRows(reports, stores, dateFrom, dateTo);
    const excelRows: Array<Record<string, string | number>> =
      type === "all"
        ? rows.map((row) => ({
            Datum: row.date,
            Radnja: row.storeName,
            Gotovina: row.cash,
            Ček: row.check,
            Kartica: row.card,
            Virman: row.bankTransfer,
            Ispravka: row.correction,
            eDopuna: row.edopuna,
            Ukupno: row.total,
            Status: row.status
          }))
        : rows.map((row) => ({
            Datum: row.date,
            Radnja: row.storeName,
            Gotovina: row.cash,
            Status: row.status
          }));

    excelRows.push(type === "all" ? buildAllTotalRow(rows) : buildCashTotalRow(rows));
    const worksheet = XLSX.utils.json_to_sheet(excelRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, type === "all" ? "Svi pazari" : "Gotovina");
    XLSX.writeFile(workbook, buildFileName(type, dateFrom, dateTo));
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:flex-row">
      <button className="button-secondary" onClick={() => exportWorkbook("all")} type="button">
        Export svi pazari
      </button>
      <button className="button-secondary" onClick={() => exportWorkbook("cash")} type="button">
        Export samo gotovina
      </button>
    </section>
  );
}

type ExportRow = {
  date: string;
  storeName: string;
  cash: number;
  check: number;
  card: number;
  bankTransfer: number;
  correction: number;
  edopuna: number;
  total: number;
  status: "Poslato" | "Nije poslato";
};

function buildRows(reports: RevenueExportReport[], stores: Store[], dateFrom: string, dateTo: string) {
  const rows: ExportRow[] = [];
  const dateKeys = getDateRange(dateFrom, dateTo);

  for (const date of dateKeys) {
    for (const store of stores) {
      const matches = reports.filter((report) => report.report_date === date && report.store_id === store.id);

      if (matches.length === 0) {
        rows.push({
          date,
          storeName: store.name,
          cash: 0,
          check: 0,
          card: 0,
          bankTransfer: 0,
          correction: 0,
          edopuna: 0,
          total: 0,
          status: "Nije poslato"
        });
      } else {
        for (const report of matches) {
          rows.push({
            date,
            storeName: report.stores?.name ?? store.name,
            cash: Number(report.cash_revenue) || 0,
            check: Number(report.check_revenue) || 0,
            card: Number(report.card_revenue) || 0,
            bankTransfer: Number(report.bank_transfer_revenue) || 0,
            correction: Number(report.correction_revenue) || 0,
            edopuna: Number(report.edopuna_revenue) || 0,
            total: Number(report.total_revenue) || 0,
            status: "Poslato"
          });
        }
      }
    }
  }

  return rows;
}

function buildAllTotalRow(rows: ExportRow[]) {
  return {
    Datum: "",
    Radnja: "Total",
    Gotovina: sum(rows, "cash"),
    Ček: sum(rows, "check"),
    Kartica: sum(rows, "card"),
    Virman: sum(rows, "bankTransfer"),
    Ispravka: sum(rows, "correction"),
    eDopuna: sum(rows, "edopuna"),
    Ukupno: sum(rows, "total"),
    Status: ""
  };
}

function buildCashTotalRow(rows: ExportRow[]) {
  return {
    Datum: "",
    Radnja: "Total",
    Gotovina: sum(rows, "cash"),
    Status: ""
  };
}

function sum(rows: ExportRow[], key: keyof Pick<ExportRow, "cash" | "check" | "card" | "bankTransfer" | "correction" | "edopuna" | "total">) {
  return rows.reduce((total, row) => total + Number(row[key] || 0), 0);
}

function getDateRange(dateFrom: string, dateTo: string) {
  const dates: string[] = [];
  const [startYear, startMonth, startDay] = dateFrom.split("-").map(Number);
  const [endYear, endMonth, endDay] = dateTo.split("-").map(Number);
  const start = new Date(startYear, startMonth - 1, startDay);
  const end = new Date(endYear, endMonth - 1, endDay);

  for (const date = start; date <= end; date.setDate(date.getDate() + 1)) {
    dates.push(formatDateKey(date));
  }

  return dates;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildFileName(type: "all" | "cash", dateFrom: string, dateTo: string) {
  const prefix = type === "all" ? "pazari-svi" : "pazari-gotovina";
  return dateFrom === dateTo ? `${prefix}-${dateFrom}.xlsx` : `${prefix}-${dateFrom}_do_${dateTo}.xlsx`;
}
