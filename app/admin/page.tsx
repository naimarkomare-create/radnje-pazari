import Link from "next/link";
import { LogoutButton } from "@/components/LogoutButton";
import { requireAdmin } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { DailyRevenueReport, ProduceRequest, Store, TemperatureReport } from "@/lib/types";

type AdminSearchParams = {
  date?: string;
  store?: string;
};

export default async function AdminDashboardPage({
  searchParams
}: {
  searchParams: AdminSearchParams;
}) {
  await requireAdmin();

  const supabase = createClient();
  const selectedDate = typeof searchParams.date === "string" ? searchParams.date : "";
  const selectedStore = typeof searchParams.store === "string" ? searchParams.store : "";
  const today = todayInBelgrade();

  const storesResult = await supabase.from("stores").select("id, name, created_at").order("name");
  const stores = (storesResult.data ?? []) as Store[];

  let dailyQuery = supabase
    .from("daily_revenue_reports")
    .select("id, store_id, user_id, report_date, shift, cash_revenue, card_revenue, total_revenue, note, created_at, stores(name)")
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  let temperatureQuery = supabase
    .from("temperature_reports")
    .select("id, store_id, user_id, report_date, device_name, temperature, note, created_at, stores(name)")
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  let produceQuery = supabase
    .from("produce_requests")
    .select("id, store_id, user_id, request_date, item_name, quantity, unit, note, created_at, stores(name)")
    .order("request_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (selectedDate) {
    dailyQuery = dailyQuery.eq("report_date", selectedDate);
    temperatureQuery = temperatureQuery.eq("report_date", selectedDate);
    produceQuery = produceQuery.eq("request_date", selectedDate);
  }

  if (selectedStore) {
    dailyQuery = dailyQuery.eq("store_id", selectedStore);
    temperatureQuery = temperatureQuery.eq("store_id", selectedStore);
    produceQuery = produceQuery.eq("store_id", selectedStore);
  }

  const [daily, temperatures, produce, submittedToday] = await Promise.all([
    dailyQuery,
    temperatureQuery,
    produceQuery,
    supabase.from("daily_revenue_reports").select("store_id").eq("report_date", today)
  ]);

  const submittedStoreIds = new Set((submittedToday.data ?? []).map((row) => row.store_id as string));
  const submittedStores = stores.filter((store) => submittedStoreIds.has(store.id));
  const missingStores = stores.filter((store) => !submittedStoreIds.has(store.id));

  return (
    <main className="min-h-screen pb-10">
      <header className="section">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-leaf">Admin pregled</p>
            <h1 className="text-2xl font-bold text-ink">Svi izveštaji</h1>
          </div>
          <LogoutButton />
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-7 px-4 py-6">
        <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <form className="grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto]" method="get">
            <label className="field">
              <span className="label">Datum</span>
              <input className="input" defaultValue={selectedDate} name="date" type="date" />
            </label>
            <label className="field">
              <span className="label">Radnja</span>
              <select className="input" defaultValue={selectedStore} name="store">
                <option value="">Sve radnje</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button className="button-primary w-full" type="submit">
                Pošalji
              </button>
            </div>
            <div className="flex items-end">
              <Link className="button-secondary w-full" href="/admin">
                Reset
              </Link>
            </div>
          </form>
        </section>

        {storesResult.error ? <ErrorBanner message={storesResult.error.message} /> : null}
        {submittedToday.error ? <ErrorBanner message={submittedToday.error.message} /> : null}

        <section className="grid gap-4 md:grid-cols-2">
          <StatusPanel title="Poslato danas" stores={submittedStores} empty="Nijedna radnja još nije poslala pazar." />
          <StatusPanel title="Nije poslato danas" stores={missingStores} empty="Sve radnje su poslale pazar." />
        </section>

        <AdminTable title="Svi pazari" error={daily.error?.message}>
          <thead>
            <tr>
              <Th>Datum</Th>
              <Th>Radnja</Th>
              <Th>Smena</Th>
              <Th>Gotovina</Th>
              <Th>Kartica</Th>
              <Th>Ukupno</Th>
              <Th>Napomena</Th>
            </tr>
          </thead>
          <tbody>
            {((daily.data ?? []) as unknown as DailyRevenueReport[]).map((report) => (
              <tr key={report.id}>
                <Td>{report.report_date}</Td>
                <Td>{report.stores?.name ?? "-"}</Td>
                <Td>{report.shift ?? "-"}</Td>
                <Td>{formatMoney(report.cash_revenue)}</Td>
                <Td>{formatMoney(report.card_revenue)}</Td>
                <Td>{formatMoney(report.total_revenue)}</Td>
                <Td>{report.note ?? "-"}</Td>
              </tr>
            ))}
          </tbody>
        </AdminTable>

        <AdminTable title="Sve temperature" error={temperatures.error?.message}>
          <thead>
            <tr>
              <Th>Datum</Th>
              <Th>Radnja</Th>
              <Th>Naziv uređaja</Th>
              <Th>Temperatura</Th>
              <Th>Napomena</Th>
            </tr>
          </thead>
          <tbody>
            {((temperatures.data ?? []) as unknown as TemperatureReport[]).map((report) => (
              <tr key={report.id}>
                <Td>{report.report_date}</Td>
                <Td>{report.stores?.name ?? "-"}</Td>
                <Td>{report.device_name}</Td>
                <Td>{Number(report.temperature).toFixed(1)} °C</Td>
                <Td>{report.note ?? "-"}</Td>
              </tr>
            ))}
          </tbody>
        </AdminTable>

        <AdminTable title="Sva trebovanja" error={produce.error?.message}>
          <thead>
            <tr>
              <Th>Datum</Th>
              <Th>Radnja</Th>
              <Th>Naziv artikla</Th>
              <Th>Količina</Th>
              <Th>Jedinica mere</Th>
              <Th>Napomena</Th>
            </tr>
          </thead>
          <tbody>
            {((produce.data ?? []) as unknown as ProduceRequest[]).map((request) => (
              <tr key={request.id}>
                <Td>{request.request_date}</Td>
                <Td>{request.stores?.name ?? "-"}</Td>
                <Td>{request.item_name}</Td>
                <Td>{request.quantity ?? "-"}</Td>
                <Td>{request.unit ?? "-"}</Td>
                <Td>{request.note ?? "-"}</Td>
              </tr>
            ))}
          </tbody>
        </AdminTable>
      </div>
    </main>
  );
}

function StatusPanel({ title, stores, empty }: { title: string; stores: Store[]; empty: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {stores.length > 0 ? (
          stores.map((store) => (
            <li className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700" key={store.id}>
              {store.name}
            </li>
          ))
        ) : (
          <li className="text-sm text-slate-600">{empty}</li>
        )}
      </ul>
    </div>
  );
}

function AdminTable({
  title,
  error,
  children
}: {
  title: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          {children}
        </table>
      </div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-slate-200 px-3 py-2 font-bold text-slate-700">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-700">{children}</td>;
}

function ErrorBanner({ message }: { message: string }) {
  return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("sr-RS", {
    style: "currency",
    currency: "RSD",
    maximumFractionDigits: 2
  }).format(Number(value));
}
