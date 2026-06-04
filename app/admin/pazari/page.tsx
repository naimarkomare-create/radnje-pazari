import { AdminFilters } from "@/components/AdminFilters";
import { DailyRevenueTable } from "@/components/AdminTables";
import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DailyRevenueReport, Store } from "@/lib/types";

export default async function AdminDailyRevenuePage({
  searchParams
}: {
  searchParams: { date?: string; store?: string };
}) {
  await requireAdmin();
  const supabase = createClient();
  const selectedDate = typeof searchParams.date === "string" ? searchParams.date : "";
  const selectedStore = typeof searchParams.store === "string" ? searchParams.store : "";
  const storesResult = await supabase.from("stores").select("id, name, created_at").order("name");
  let query = supabase
    .from("daily_revenue_reports")
    .select("id, store_id, user_id, report_date, shift, cash_revenue, card_revenue, total_revenue, note, created_at, stores(name)")
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (selectedDate) query = query.eq("report_date", selectedDate);
  if (selectedStore) query = query.eq("store_id", selectedStore);
  const reports = await query;

  return (
    <>
      <PageHeader eyebrow="Admin pregled" title="Pazari" />
      <div className="page-content">
        <AdminFilters
          resetHref="/admin/pazari"
          selectedDate={selectedDate}
          selectedStore={selectedStore}
          stores={(storesResult.data ?? []) as Store[]}
        />
        <DailyRevenueTable
          error={reports.error?.message ?? storesResult.error?.message}
          reports={(reports.data ?? []) as unknown as DailyRevenueReport[]}
        />
      </div>
    </>
  );
}
