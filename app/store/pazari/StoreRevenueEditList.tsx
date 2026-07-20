import { formatMoney } from "@/components/ReportLists";
import { formatSerbianIsoDate } from "@/lib/date";
import type { DailyRevenueReport } from "@/lib/types";

export function StoreRevenueEditList({
  reports,
  error
}: {
  reports: DailyRevenueReport[];
  error?: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-bold text-ink">Prethodni pazari</h2>
      {error ? (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="mt-4 space-y-3">
        {reports.length > 0 ? (
          reports.map((report) => (
            <article
              className="rounded-md border border-slate-200 bg-slate-50 p-3"
              key={report.id}
            >
              <p className="font-bold text-ink">
                {formatSerbianIsoDate(report.report_date)}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {report.shift ? `${report.shift} · ` : ""}
                {formatMoney(report.total_revenue)}
              </p>
              {report.note ? (
                <p className="mt-1 text-sm text-slate-600">
                  Napomena: {report.note}
                </p>
              ) : null}
            </article>
          ))
        ) : (
          <p className="py-3 text-sm text-slate-500">
            Nema prethodnih pazara.
          </p>
        )}
      </div>
    </section>
  );
}
