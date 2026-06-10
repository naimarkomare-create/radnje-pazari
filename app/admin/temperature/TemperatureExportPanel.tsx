"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Store, TemperatureDevice, TemperatureReport } from "@/lib/types";

const shifts = ["Prva smena", "Druga smena"] as const;

export function TemperatureExportPanel({
  month,
  selectedStore,
  selectedDevice,
  selectedShift,
  stores,
  devices,
  reports
}: {
  month: string;
  selectedStore: string;
  selectedDevice: string;
  selectedShift: string;
  stores: Store[];
  devices: TemperatureDevice[];
  reports: TemperatureReport[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateFilter(key: "month" | "store_id" | "device_id" | "shift", value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value) params.set(key, value);
    else params.delete(key);

    if (key === "store_id") params.delete("store");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const sheetRows = buildTemperatureTables({ month, stores, devices, reports });
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
    worksheet["!cols"] = [{ wch: 14 }, { wch: 16 }, { wch: 16 }];
    worksheet["!margins"] = { left: 0.35, right: 0.35, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };
    styleTemperatureSheet(worksheet as Record<string, unknown>, sheetRows);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Mesečne temperature");
    XLSX.writeFile(workbook, `temperature-${month}.xlsx`);
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
        <button className="button-secondary" onClick={exportExcel} type="button">
          Export mesečne temperature
        </button>
      </div>
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
