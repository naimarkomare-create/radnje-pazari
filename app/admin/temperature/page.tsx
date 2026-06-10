import { AdminFilters } from "@/components/AdminFilters";
import { TemperatureTable } from "@/components/AdminTables";
import { PageHeader } from "@/components/PageHeader";
import Link from "next/link";
import { TemperatureExportPanel } from "@/app/admin/temperature/TemperatureExportPanel";
import { requireAdmin } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { PRODUCE_STORE_NAMES, sortProduceStores } from "@/lib/produce";
import { createClient } from "@/lib/supabase/server";
import type { Store, TemperatureDevice, TemperatureReport } from "@/lib/types";

export default async function AdminTemperaturePage({
  searchParams
}: {
  searchParams: { date?: string; store?: string; store_id?: string; month?: string; device_id?: string; shift?: string };
}) {
  await requireAdmin();
  const supabase = createClient();
  const selectedDate = typeof searchParams.date === "string" && searchParams.date ? searchParams.date : todayInBelgrade();
  const selectedMonth =
    typeof searchParams.month === "string" && searchParams.month ? searchParams.month : selectedDate.slice(0, 7);
  const selectedStore =
    typeof searchParams.store_id === "string"
      ? searchParams.store_id
      : typeof searchParams.store === "string"
        ? searchParams.store
        : "";
  const selectedDevice = typeof searchParams.device_id === "string" ? searchParams.device_id : "";
  const selectedShift = typeof searchParams.shift === "string" ? searchParams.shift : "";
  const storesResult = await supabase
    .from("stores")
    .select("id, name, created_at")
    .in("name", [...PRODUCE_STORE_NAMES]);
  const stores = sortProduceStores((storesResult.data ?? []) as Store[]);
  const selectedStores = selectedStore ? stores.filter((store) => store.id === selectedStore) : stores;
  let query = supabase
    .from("temperature_reports")
    .select("id, store_id, user_id, device_id, report_date, shift, device_name, temperature, note, created_at, stores(name)")
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (selectedDate) query = query.eq("report_date", selectedDate);
  if (selectedStore) query = query.eq("store_id", selectedStore);
  const monthStart = `${selectedMonth}-01`;
  const monthEnd = getMonthEnd(selectedMonth);
  let devicesQuery = supabase
    .from("temperature_devices")
    .select("id, store_id, name, device_type, min_allowed, max_allowed, active, sort_order, created_at, stores(id, name)")
    .eq("active", true)
    .order("sort_order")
    .order("name");
  let exportReportsQuery = supabase
    .from("temperature_reports")
    .select("id, store_id, user_id, device_id, report_date, shift, device_name, temperature, note, created_at, stores(name), temperature_devices(name)")
    .gte("report_date", monthStart)
    .lte("report_date", monthEnd);

  if (selectedStore) {
    devicesQuery = devicesQuery.eq("store_id", selectedStore);
    exportReportsQuery = exportReportsQuery.eq("store_id", selectedStore);
  }

  if (selectedDevice) {
    devicesQuery = devicesQuery.eq("id", selectedDevice);
    exportReportsQuery = exportReportsQuery.eq("device_id", selectedDevice);
  }

  const [reports, statusReports, devicesResult, exportReportsResult] = await Promise.all([
    query,
    supabase.from("temperature_reports").select("store_id").eq("report_date", selectedDate),
    devicesQuery,
    exportReportsQuery
  ]);
  const submittedStoreIds = new Set((statusReports.data ?? []).map((report) => report.store_id as string));
  const submittedStores = stores.filter((store) => submittedStoreIds.has(store.id));
  const missingStores = stores.filter((store) => !submittedStoreIds.has(store.id));

  return (
    <>
      <PageHeader eyebrow="Admin pregled" title="Temperature" />
      <div className="page-content">
        <div className="flex justify-end">
          <Link className="button-secondary" href="/admin/temperature/uredjaji">
            Uređaji temperatura
          </Link>
        </div>
        <TemperatureExportPanel
          devices={(devicesResult.data ?? []) as unknown as TemperatureDevice[]}
          month={selectedMonth}
          reports={(exportReportsResult.data ?? []) as unknown as TemperatureReport[]}
          selectedDevice={selectedDevice}
          selectedShift={selectedShift}
          selectedStore={selectedStore}
          stores={selectedStores}
        />
        <AdminFilters
          resetHref="/admin/temperature"
          selectedDate={selectedDate}
          selectedStore={selectedStore}
          stores={stores}
        />
        <section className="grid gap-5 lg:grid-cols-2">
          <StatusPanel title="Poslali temperaturu" stores={submittedStores} empty="Nijedna radnja nije poslala temperaturu." />
          <StatusPanel title="Nisu poslali temperaturu" stores={missingStores} empty="Sve radnje su poslale temperaturu." />
        </section>
        <TemperatureTable
          error={reports.error?.message ?? storesResult.error?.message ?? statusReports.error?.message ?? devicesResult.error?.message ?? exportReportsResult.error?.message}
          reports={(reports.data ?? []) as unknown as TemperatureReport[]}
        />
      </div>
    </>
  );
}

function getMonthEnd(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const lastDay = new Date(year, monthIndex, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

function StatusPanel({ title, stores, empty }: { title: string; stores: Store[]; empty: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        <span className="rounded-md bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">{stores.length}</span>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {stores.length > 0 ? (
          stores.map((store) => (
            <li className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700" key={store.id}>
              {store.name}
            </li>
          ))
        ) : (
          <li className="text-sm text-slate-500">{empty}</li>
        )}
      </ul>
    </section>
  );
}
