import { RevenueExportButtons } from "@/app/admin/pazari/RevenueExportButtons";
import { RevenueRangeFilters } from "@/app/admin/pazari/RevenueRangeFilters";
import { DailyRevenueTable } from "@/components/AdminTables";
import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { DailyRevenueReport, Store } from "@/lib/types";

export default async function AdminDailyRevenuePage({
  searchParams
}: {
  searchParams: { date?: string; date_from?: string; date_to?: string; store?: string; store_id?: string };
}) {
  await requireAdmin();
  const supabase = createClient();
  const today = todayInBelgrade();
  const dateFrom =
    typeof searchParams.date_from === "string" && searchParams.date_from
      ? searchParams.date_from
      : typeof searchParams.date === "string" && searchParams.date
        ? searchParams.date
        : today;
  const dateTo = typeof searchParams.date_to === "string" && searchParams.date_to ? searchParams.date_to : dateFrom;
  const selectedStore =
    typeof searchParams.store_id === "string"
      ? searchParams.store_id
      : typeof searchParams.store === "string"
        ? searchParams.store
        : "";
  const storesResult = await supabase.from("stores").select("id, name, created_at").order("name");
  const stores = (storesResult.data ?? []) as Store[];
  const exportStores = selectedStore ? stores.filter((store) => store.id === selectedStore) : stores;
  let query = supabase
    .from("daily_revenue_reports")
    .select("id, store_id, user_id, report_date, shift, cash_revenue, check_revenue, card_revenue, bank_transfer_revenue, correction_revenue, edopuna_revenue, total_revenue, note, created_at, stores(name)")
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  query = query.gte("report_date", dateFrom).lte("report_date", dateTo);
  if (selectedStore) query = query.eq("store_id", selectedStore);
  const reports = await query;

  return (
    <>
      <PageHeader eyebrow="Admin pregled" title="Pazari" />
      <div className="page-content">
        <RevenueRangeFilters dateFrom={dateFrom} dateTo={dateTo} selectedStore={selectedStore} stores={stores} />
        <RevenueExportButtons
          dateFrom={dateFrom}
          dateTo={dateTo}
          reports={(reports.data ?? []) as unknown as DailyRevenueReport[]}
          stores={exportStores}
        />
        <DailyRevenueTable
          error={reports.error?.message ?? storesResult.error?.message}
          reports={(reports.data ?? []) as unknown as DailyRevenueReport[]}
        />
      </div>
    </>
  );
}
