"use client";

import { useState } from "react";
import type { ProduceMatrixRow } from "@/lib/produce";
import type { Store } from "@/lib/types";

export function ProduceMatrixTable({
  rows,
  stores,
  selectedDate
}: {
  rows: ProduceMatrixRow[];
  stores: Store[];
  selectedDate: string;
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  async function exportExcel() {
    setExporting(true);
    setError("");

    try {
      const XLSX = await import("xlsx");
      const excelRows = rows.map((row) => {
        const output: Record<string, string | number> = {
          Artikal: row.itemName,
          Jedinica: row.unit
        };

        for (const store of stores) {
          output[store.name] = row.quantities[store.name] ?? 0;
        }

        output.Ukupno = row.total;
        return output;
      });
      const worksheet = XLSX.utils.json_to_sheet(excelRows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Trebovanje");
      XLSX.writeFile(workbook, `trebovanje-voce-povrce-${selectedDate}.xlsx`);
    } catch {
      setError("Excel fajl nije mogao da bude napravljen.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-ink">Trebovanje voća i povrća</h2>
        <button className="button-secondary" disabled={exporting || rows.length === 0} onClick={exportExcel} type="button">
          {exporting ? "Priprema..." : "Export u Excel"}
        </button>
      </div>
      {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="py-8 text-sm text-slate-500">Nema trebovanja za izabrani datum</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-max border-collapse text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th sticky>Artikal</Th>
                <Th>Jedinica</Th>
                {stores.map((store) => (
                  <Th key={store.id}>{store.name}</Th>
                ))}
                <Th>Ukupno</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.itemId}>
                  <Td sticky>{row.itemName}</Td>
                  <Td>{row.unit}</Td>
                  {stores.map((store) => (
                    <Td key={store.id}>{row.quantities[store.name] ?? 0}</Td>
                  ))}
                  <Td strong>{row.total}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Th({ children, sticky = false }: { children: React.ReactNode; sticky?: boolean }) {
  return (
    <th className={`border-b border-slate-200 px-3 py-3 font-bold text-slate-700 ${sticky ? "sticky left-0 z-10 bg-slate-50" : ""}`}>
      {children}
    </th>
  );
}

function Td({ children, sticky = false, strong = false }: { children: React.ReactNode; sticky?: boolean; strong?: boolean }) {
  return (
    <td
      className={`border-b border-slate-100 px-3 py-3 text-slate-700 ${
        sticky ? "sticky left-0 bg-white font-semibold text-ink" : ""
      } ${strong ? "font-bold text-ink" : ""}`}
    >
      {children}
    </td>
  );
}
