import { formatTemperatureSlot } from "@/lib/temperature-slots";
import type { DailyRevenueReport, TemperatureReport } from "@/lib/types";

export function DailyReportsList({
  reports,
  error,
  showStore = false
}: {
  reports: DailyRevenueReport[];
  error?: string;
  showStore?: boolean;
}) {
  return (
    <ReportList title="Pazari" error={error} empty="Nema poslatih pazara.">
      {reports.map((report) => (
        <li className="report-row" key={report.id}>
          <div className="min-w-0">
            <p className="font-semibold text-ink">{showStore ? report.stores?.name ?? "Radnja" : report.report_date}</p>
            <p className="mt-1 text-sm text-slate-500">
              {showStore ? `${report.report_date} · ${report.shift || "Bez smene"}` : report.shift || "Bez smene"}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-slate-700">{formatMoney(report.total_revenue)}</span>
        </li>
      ))}
    </ReportList>
  );
}

export function TemperatureReportsList({
  reports,
  error,
  showStore = false
}: {
  reports: TemperatureReport[];
  error?: string;
  showStore?: boolean;
}) {
  return (
    <ReportList title="Temperature" error={error} empty="Nema poslatih temperatura.">
      {reports.map((report) => (
        <li className="report-row" key={report.id}>
          <div className="min-w-0">
            <p className="font-semibold text-ink">{report.device_name}</p>
            <p className="mt-1 text-sm text-slate-500">
              {showStore
                ? `${report.stores?.name ?? "Radnja"} · ${report.report_date} · ${formatTemperatureSlot(report.shift)}`
                : `${report.report_date} · ${formatTemperatureSlot(report.shift)}`}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold text-slate-700">{Number(report.temperature).toFixed(1)} °C</span>
        </li>
      ))}
    </ReportList>
  );
}

function ReportList({
  title,
  error,
  empty,
  children
}: {
  title: string;
  error?: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <ul className="mt-3 space-y-2">
        {children.length > 0 ? children : <li className="py-3 text-sm text-slate-500">{empty}</li>}
      </ul>
    </section>
  );
}

export function formatMoney(value: number) {
  return new Intl.NumberFormat("sr-RS", {
    style: "currency",
    currency: "RSD",
    maximumFractionDigits: 2
  }).format(Number(value));
}
