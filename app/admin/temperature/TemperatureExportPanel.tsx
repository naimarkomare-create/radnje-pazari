"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { downloadResponseFile } from "@/lib/client-download";

export function TemperatureExportPanel({ month }: { month: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateMonth(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");

    if (value) params.set("month", value);
    else params.delete("month");

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  async function exportAllTemperatureLists() {
    if (exporting) return;
    setExporting(true);
    setError(null);

    try {
      const params = new URLSearchParams({ month });
      const response = await fetch(`/api/admin/export/temperature/bulk?${params}`);
      await downloadResponseFile(response, `Temperature-sve-radnje-${month}.zip`);
    } catch (exportError) {
      setError(
        exportError instanceof Error
          ? exportError.message
          : "Temperaturne liste nisu izvezene. Pokušajte ponovo."
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="field w-full sm:max-w-xs">
          <span className="label">Mesec</span>
          <input
            className="input"
            onChange={(event) => updateMonth(event.target.value)}
            type="month"
            value={month}
          />
        </label>
        <button
          className="button-secondary w-full sm:w-auto"
          disabled={exporting}
          onClick={exportAllTemperatureLists}
          type="button"
        >
          {exporting ? "Priprema ZIP datoteke..." : "Izvezi sve temperaturne liste"}
        </button>
      </div>
      {error ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}
