"use client";

import { useState } from "react";
import { downloadResponseFile } from "@/lib/client-download";
import type { DailyRevenueReport, Store } from "@/lib/types";

type RevenueExportReport = DailyRevenueReport & { stores?: { name: string } | null };

export function RevenueExportButtons({
  stores,
  dateFrom,
  dateTo,
  month,
  selectedStore
}: {
  stores: Store[];
  dateFrom: string;
  dateTo: string;
  month: string;
  selectedStore: string;
}) {
  const [exporting, setExporting] = useState<"all" | "cash" | "specification" | null>(null);
  const [specificationMonth, setSpecificationMonth] = useState(month);
  const [error, setError] = useState<string | null>(null);

  async function exportWorkbook(type: "all" | "cash") {
    if (exporting) return;
    setExporting(type);
    setError(null);

    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (selectedStore) params.set("store_id", selectedStore);
      const response = await fetch(`/api/admin/exports/revenue?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Export nije uspeo.");

      const ExcelJS = (await import("exceljs")).default;
      const rows = buildRows((payload.reports ?? []) as RevenueExportReport[], stores, dateFrom, dateTo);
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
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(type === "all" ? "Svi pazari" : "Gotovina");
      worksheet.columns = Object.keys(excelRows[0]).map((key) => ({ header: key, key }));
      worksheet.addRows(excelRows);
      const output = await workbook.xlsx.writeBuffer();
      await downloadResponseFile(
        new Response(new Blob([output], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        })),
        buildFileName(type, dateFrom, dateTo)
      );
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export nije uspeo.");
    } finally {
      setExporting(null);
    }
  }

  async function exportSpecification() {
    if (exporting || !selectedStore) return;
    setExporting("specification");
    setError(null);

    try {
      const params = new URLSearchParams({ month: specificationMonth, store_id: selectedStore });
      const response = await fetch(`/api/admin/export/pazari?${params}`);
      const storeName = stores[0]?.name.replace(/\s+/g, "-") ?? "Radnja";
      await downloadResponseFile(response, `Specifikacija-pazara-${storeName}-${specificationMonth}.xlsx`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export nije uspeo.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row">
        <button className="button-secondary" disabled={exporting !== null} onClick={() => exportWorkbook("all")} type="button">
          {exporting === "all" ? "Priprema..." : "Export svi pazari"}
        </button>
        <button className="button-secondary" disabled={exporting !== null} onClick={() => exportWorkbook("cash")} type="button">
          {exporting === "cash" ? "Priprema..." : "Export samo gotovina"}
        </button>
      </div>
      <div className="grid gap-3 border-t border-slate-200 pt-3 sm:grid-cols-[minmax(180px,260px)_auto] sm:items-end">
        <label className="field">
          <span className="label">Mesec specifikacije</span>
          <input className="input" onChange={(event) => setSpecificationMonth(event.target.value)} type="month" value={specificationMonth} />
        </label>
        <button
          className="button-secondary"
          disabled={exporting !== null || !selectedStore || !specificationMonth}
          onClick={exportSpecification}
          type="button"
        >
          {exporting === "specification" ? "Priprema..." : "Izvezi specifikaciju"}
        </button>
      </div>
      {!selectedStore ? <p className="text-sm text-slate-600">Izaberite jednu radnju za specifikaciju pazara.</p> : null}
      {error ? <p className="text-sm font-semibold text-red-700">{error}</p> : null}
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
