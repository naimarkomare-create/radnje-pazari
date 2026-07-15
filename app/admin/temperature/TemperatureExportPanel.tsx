"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { downloadResponseFile } from "@/lib/client-download";
import type { Store, TemperatureDevice, TemperatureReport } from "@/lib/types";

const shifts = ["Prva smena", "Druga smena"] as const;

export function TemperatureExportPanel({
  month,
  selectedStore,
  selectedDevice,
  selectedShift,
  stores,
  devices,
}: {
  month: string;
  selectedStore: string;
  selectedDevice: string;
  selectedShift: string;
  stores: Store[];
  devices: TemperatureDevice[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [exporting, setExporting] = useState<"monthly" | "checklist" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateFilter(key: "month" | "store_id" | "device_id" | "shift", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");

    if (value) params.set(key, value);
    else params.delete(key);

    if (key === "store_id") {
      params.delete("store");
      params.delete("device_id");
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  async function exportExcel() {
    if (exporting) return;
    setExporting("monthly");
    setError(null);

    try {
      const params = new URLSearchParams({ month });
      if (selectedStore) params.set("store_id", selectedStore);
      if (selectedDevice) params.set("device_id", selectedDevice);
      const response = await fetch(`/api/admin/exports/temperature?${params}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Export nije uspeo.");

      const XLSX = await import("xlsx");
      const sheetRows = buildTemperatureTables({
        month,
        stores: (payload.stores ?? []) as Store[],
        devices: (payload.devices ?? []) as TemperatureDevice[],
        reports: (payload.reports ?? []) as TemperatureReport[]
      });
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
      worksheet["!cols"] = [{ wch: 14 }, { wch: 16 }, { wch: 16 }];
      worksheet["!margins"] = { left: 0.35, right: 0.35, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
      styleTemperatureSheet(worksheet as Record<string, unknown>, sheetRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, "Mesečne temperature");
      XLSX.writeFile(workbook, `temperature-${month}.xlsx`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export nije uspeo.");
    } finally {
      setExporting(null);
    }
  }

  async function exportChecklist() {
    if (exporting || !selectedStore || !selectedDevice) return;
    setExporting("checklist");
    setError(null);

    try {
      const params = new URLSearchParams({ device_id: selectedDevice, month, store_id: selectedStore });
      const response = await fetch(`/api/admin/export/temperature?${params}`);
      const storeName = stores.find((store) => store.id === selectedStore)?.name.replace(/\s+/g, "-") ?? "Radnja";
      const deviceName = devices.find((device) => device.id === selectedDevice)?.name.replace(/\s+/g, "-") ?? "Uredjaj";
      await downloadResponseFile(response, `Temperatura-${storeName}-${deviceName}-${month}.xlsx`);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export nije uspeo.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="grid flex-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="field">
            <span className="label">Mesec</span>
            <input className="input" onChange={(event) => updateFilter("month", event.target.value)} type="month" value={month} />
          </label>
          <label className="field">
            <span className="label">Radnja</span>
            <select className="input" onChange={(event) => updateFilter("store_id", event.target.value)} value={selectedStore}>
              <option value="">Sve radnje</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>
                  {store.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Naziv uređaja</span>
            <select className="input" onChange={(event) => updateFilter("device_id", event.target.value)} value={selectedDevice}>
              <option value="">Svi uređaji</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.stores?.name ? `${device.stores.name} - ` : ""}
                  {device.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="label">Smena</span>
            <select className="input" onChange={(event) => updateFilter("shift", event.target.value)} value={selectedShift}>
              <option value="">Sve smene</option>
              {shifts.map((shift) => (
                <option key={shift} value={shift}>
                  {shift}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-2">
          <button className="button-secondary" disabled={exporting !== null} onClick={exportExcel} type="button">
            {exporting === "monthly" ? "Priprema..." : "Export mesečne temperature"}
          </button>
          <button
            className="button-secondary"
            disabled={exporting !== null || !selectedStore || !selectedDevice}
            onClick={exportChecklist}
            type="button"
          >
            {exporting === "checklist" ? "Priprema..." : "Izvezi ček listu"}
          </button>
        </div>
      </div>
      {!selectedStore || !selectedDevice ? (
        <p className="mt-3 text-sm text-slate-600">Izaberite jednu radnju i jedan uređaj za temperaturnu ček listu.</p>
      ) : null}
      {error ? <p className="mt-3 text-sm font-semibold text-red-700">{error}</p> : null}
    </section>
  );
}

function buildTemperatureTables({
  month,
  stores,
  devices,
  reports
}: {
  month: string;
  stores: Store[];
  devices: TemperatureDevice[];
  reports: TemperatureReport[];
}) {
  const rows: Array<Array<string | number>> = [];
  const monthDays = getMonthDays(month);

  for (const store of stores) {
    const storeDevices = devices.filter((device) => device.store_id === store.id && device.active);

    for (const device of storeDevices) {
      rows.push([`${store.name} - ${device.name}`]);
      rows.push(["Datum", "Prva smena", "Druga smena"]);

      for (const date of monthDays) {
        rows.push([
          formatDisplayDate(date),
          getLatestTemperatureValue(reports, store.id, device.id, date, "Prva smena"),
          getLatestTemperatureValue(reports, store.id, device.id, date, "Druga smena")
        ]);
      }

      rows.push([]);
    }
  }

  return rows.length > 0 ? rows : [["Nema aktivnih uređaja za izabrane filtere."]];
}

function getLatestTemperatureValue(
  reports: TemperatureReport[],
  storeId: string,
  deviceId: string,
  date: string,
  shift: string
) {
  const latest = reports
    .filter(
      (report) =>
        report.report_date === date &&
        report.store_id === storeId &&
        report.device_id === deviceId &&
        report.shift === shift
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  return latest ? Number(latest.temperature) : "NEDOSTAJE";
}

function getMonthDays(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const date = new Date(year, monthIndex - 1, 1);
  const days: string[] = [];

  while (date.getFullYear() === year && date.getMonth() === monthIndex - 1) {
    days.push(formatDateKey(date));
    date.setDate(date.getDate() + 1);
  }

  return days;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}.${month}.${year}`;
}

function styleTemperatureSheet(worksheet: Record<string, unknown>, rows: Array<Array<string | number>>) {
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const isTitleRow = row.length === 1 && typeof row[0] === "string" && row[0].includes(" - ");
    const isHeaderRow = row[0] === "Datum" && row[1] === "Prva smena";

    if (isTitleRow || isHeaderRow) {
      for (let columnIndex = 0; columnIndex < Math.max(row.length, 3); columnIndex += 1) {
        const address = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
        const cell = worksheet[address] as { s?: Record<string, unknown> } | undefined;
        if (cell) cell.s = { font: { bold: true } };
      }
    }

    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      if (row[columnIndex] === "NEDOSTAJE") {
        const address = `${String.fromCharCode(65 + columnIndex)}${rowIndex + 1}`;
        const cell = worksheet[address] as { s?: Record<string, unknown> } | undefined;
        if (cell) cell.s = { font: { bold: true, color: { rgb: "C2412D" } } };
      }
    }
  }
}
