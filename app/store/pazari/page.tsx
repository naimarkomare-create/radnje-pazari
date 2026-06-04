import { DailyRevenueForm } from "@/app/store/StoreForms";
import { PageHeader } from "@/components/PageHeader";
import { DailyReportsList } from "@/components/ReportLists";
import { requireStore } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { DailyRevenueReport } from "@/lib/types";

export default async function StoreDailyRevenuePage() {
  const profile = await requireStore();
  const result = await createClient()
    .from("daily_revenue_reports")
    .select("id, store_id, user_id, report_date, shift, cash_revenue, card_revenue, total_revenue, note, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <>
      <PageHeader eyebrow={profile.stores?.name ?? "Radnja"} title="Dnevni pazar" />
      <div className="page-content grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <DailyRevenueForm storeName={profile.stores?.name ?? "Radnja"} today={todayInBelgrade()} />
        <DailyReportsList reports={(result.data ?? []) as DailyRevenueReport[]} error={result.error?.message} />
      </div>
    </>
  );
}
