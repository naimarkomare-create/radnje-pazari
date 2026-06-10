import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { PRODUCE_STORE_NAMES, sortProduceStores } from "@/lib/produce";
import { createClient } from "@/lib/supabase/server";
import type { DailyRevenueReport, ProduceShelfPhotoCheck, Store, StoreTaskAssignment, TemperatureReport } from "@/lib/types";
import { StoreMapSection, type StoreMapMarker, type StoreType } from "./StoreMapSection";

export default async function AdminMapPage() {
  await requireAdmin();

  const supabase = createClient();
  const today = todayInBelgrade();
  const yesterday = previousDate(today);

  const [storesResult, yesterdayRevenueResult, todayRevenueResult, todayTemperatureResult, todayShelfPhotoResult, openTasksResult] =
    await Promise.all([
      supabase
        .from("stores")
        .select("id, name, latitude, longitude, address, created_at")
        .in("name", [...PRODUCE_STORE_NAMES]),
      supabase.from("daily_revenue_reports").select("store_id, total_revenue").eq("report_date", yesterday),
      supabase.from("daily_revenue_reports").select("store_id").eq("report_date", today),
      supabase.from("temperature_reports").select("store_id").eq("report_date", today),
      supabase.from("produce_shelf_photo_checks").select("store_id").eq("check_date", today),
      supabase
        .from("store_task_assignments")
        .select("store_id, status, store_tasks!inner(active)")
        .neq("status", "done")
        .eq("store_tasks.active", true)
    ]);

  const stores = sortProduceStores((storesResult.data ?? []) as Store[]);
  const markers = buildMarkers({
    shelfPhotos: (todayShelfPhotoResult.data ?? []) as Pick<ProduceShelfPhotoCheck, "store_id">[],
    stores,
    temperatures: (todayTemperatureResult.data ?? []) as Pick<TemperatureReport, "store_id">[],
    todayRevenues: (todayRevenueResult.data ?? []) as Pick<DailyRevenueReport, "store_id">[],
    yesterday,
    yesterdayRevenues: (yesterdayRevenueResult.data ?? []) as Pick<DailyRevenueReport, "store_id" | "total_revenue">[],
    openTasks: (openTasksResult.data ?? []) as Pick<StoreTaskAssignment, "store_id">[]
  });
  const error =
    storesResult.error?.message ??
    yesterdayRevenueResult.error?.message ??
    todayRevenueResult.error?.message ??
    todayTemperatureResult.error?.message ??
    todayShelfPhotoResult.error?.message ??
    openTasksResult.error?.message;

  return (
    <>
      <PageHeader eyebrow="Admin pregled" title="Mapa objekata" />
      <div className="page-content">
        {error ? (
          <section className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {error}
          </section>
        ) : null}
        <StoreMapSection markers={markers} />
      </div>
    </>
  );
}

function buildMarkers({
  shelfPhotos,
  stores,
  temperatures,
  todayRevenues,
  yesterday,
  yesterdayRevenues,
  openTasks
}: {
  shelfPhotos: Pick<ProduceShelfPhotoCheck, "store_id">[];
  stores: Store[];
  temperatures: Pick<TemperatureReport, "store_id">[];
  todayRevenues: Pick<DailyRevenueReport, "store_id">[];
  yesterday: string;
  yesterdayRevenues: Pick<DailyRevenueReport, "store_id" | "total_revenue">[];
  openTasks: Pick<StoreTaskAssignment, "store_id">[];
}) {
  const todayRevenueStoreIds = new Set(todayRevenues.map((report) => report.store_id));
  const todayTemperatureStoreIds = new Set(temperatures.map((report) => report.store_id));
  const todayShelfPhotoStoreIds = new Set(shelfPhotos.map((report) => report.store_id));
  const openTaskCounts = openTasks.reduce<Record<string, number>>((counts, task) => {
    counts[task.store_id] = (counts[task.store_id] ?? 0) + 1;
    return counts;
  }, {});

  return stores
    .filter((store) => store.latitude !== null && store.longitude !== null)
    .map((store) => {
      const revenueSubmitted = todayRevenueStoreIds.has(store.id);
      const temperatureSubmitted = todayTemperatureStoreIds.has(store.id);
      const shelfPhotoSubmitted = todayShelfPhotoStoreIds.has(store.id);

      return {
        address: store.address,
        detailHref: `/admin/pazari?store_id=${store.id}`,
        id: store.id,
        latitude: Number(store.latitude),
        longitude: Number(store.longitude),
        name: store.name,
        storeType: getStoreType(store.name),
        statusColor: getMarkerStatusColor({
          revenueSubmitted,
          shelfPhotoSubmitted,
          temperatureSubmitted
        }),
        revenueSubmitted,
        shelfPhotoSubmitted,
        temperatureSubmitted,
        openTasksCount: openTaskCounts[store.id] ?? 0,
        yesterday,
        yesterdayRevenueTotal: sumYesterdayRevenue(yesterdayRevenues, store.id)
      } satisfies StoreMapMarker;
    });
}

function getStoreType(storeName: string): StoreType {
  if (storeName === "Radnja 1" || storeName === "Radnja 4") return "supermarket";
  if (storeName === "Radnja 6" || storeName === "Radnja 7" || storeName === "Radnja 9") return "medium";
  return "mini";
}

function getMarkerStatusColor({
  revenueSubmitted,
  shelfPhotoSubmitted,
  temperatureSubmitted
}: {
  revenueSubmitted: boolean;
  shelfPhotoSubmitted: boolean;
  temperatureSubmitted: boolean;
}): StoreMapMarker["statusColor"] {
  if (revenueSubmitted && temperatureSubmitted && shelfPhotoSubmitted) return "green";
  if (!revenueSubmitted || !temperatureSubmitted) return "red";
  return "yellow";
}

function sumYesterdayRevenue(reports: Pick<DailyRevenueReport, "store_id" | "total_revenue">[], storeId: string) {
  return reports
    .filter((report) => report.store_id === storeId)
    .reduce((total, report) => total + Number(report.total_revenue ?? 0), 0);
}

function previousDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  date.setDate(date.getDate() - 1);

  const previousYear = date.getFullYear();
  const previousMonth = String(date.getMonth() + 1).padStart(2, "0");
  const previousDay = String(date.getDate()).padStart(2, "0");

  return `${previousYear}-${previousMonth}-${previousDay}`;
}
