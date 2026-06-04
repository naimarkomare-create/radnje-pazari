import { LogoutButton } from "@/components/LogoutButton";
import { requireStore } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { DailyRevenueReport, ProduceRequest, TemperatureReport } from "@/lib/types";
import { StoreForms } from "@/app/store/StoreForms";

export default async function StoreDashboardPage() {
  const profile = await requireStore();
  const supabase = createClient();
  const storeName = profile.stores?.name ?? "Radnja";
  const today = todayInBelgrade();

  const [daily, temperatures, produce] = await Promise.all([
    supabase
      .from("daily_revenue_reports")
      .select("id, report_date, shift, cash_revenue, card_revenue, total_revenue, note, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("temperature_reports")
      .select("id, report_date, device_name, temperature, note, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("produce_requests")
      .select("id, request_date, item_name, quantity, unit, note, created_at")
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  return (
    <main className="min-h-screen pb-10">
      <header className="section">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-leaf">{storeName}</p>
            <h1 className="text-2xl font-bold text-ink">Moji unosi</h1>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-8 px-4 py-6">
        <StoreForms storeName={storeName} today={today} />

        <section className="space-y-4">
          <h2 className="text-xl font-bold text-ink">Moji unosi</h2>
          <div className="grid gap-5 lg:grid-cols-3">
            <RecentDailyReports reports={(daily.data ?? []) as DailyRevenueReport[]} error={daily.error?.message} />
            <RecentTemperatureReports reports={(temperatures.data ?? []) as TemperatureReport[]} error={temperatures.error?.message} />
            <RecentProduceRequests requests={(produce.data ?? []) as ProduceRequest[]} error={produce.error?.message} />
          </div>
        </section>
      </div>
    </main>
  );
}

function RecentDailyReports({ reports, error }: { reports: DailyRevenueReport[]; error?: string }) {
  return (
    <RecentPanel title="Dnevni pazar" error={error} empty="Nema poslatih pazara.">
      {reports.map((report) => (
        <li className="rounded-md border border-slate-200 bg-white p-3" key={report.id}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">{report.report_date}</span>
            <span className="text-sm text-slate-600">{formatMoney(report.total_revenue)}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{report.shift || "Bez smene"}</p>
        </li>
      ))}
    </RecentPanel>
  );
}

function RecentTemperatureReports({ reports, error }: { reports: TemperatureReport[]; error?: string }) {
  return (
    <RecentPanel title="Temperatura frižidera/zamrzivača" error={error} empty="Nema poslatih temperatura.">
      {reports.map((report) => (
        <li className="rounded-md border border-slate-200 bg-white p-3" key={report.id}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">{report.device_name}</span>
            <span className="text-sm text-slate-600">{Number(report.temperature).toFixed(1)} °C</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{report.report_date}</p>
        </li>
      ))}
    </RecentPanel>
  );
}

function RecentProduceRequests({ requests, error }: { requests: ProduceRequest[]; error?: string }) {
  return (
    <RecentPanel title="Trebovanje voća i povrća" error={error} empty="Nema poslatih trebovanja.">
      {requests.map((request) => (
        <li className="rounded-md border border-slate-200 bg-white p-3" key={request.id}>
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold">{request.item_name}</span>
            <span className="text-sm text-slate-600">
              {[request.quantity, request.unit].filter(Boolean).join(" ") || "-"}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{request.request_date}</p>
        </li>
      ))}
    </RecentPanel>
  );
}

function RecentPanel({
  title,
  error,
  empty,
  children
}: {
  title: string;
  error?: string;
  empty: string;
  children: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-bold text-ink">{title}</h3>
      {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <ul className="space-y-2">{hasChildren ? children : <li className="text-sm text-slate-600">{empty}</li>}</ul>
    </div>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("sr-RS", {
    style: "currency",
    currency: "RSD",
    maximumFractionDigits: 2
  }).format(Number(value));
}
