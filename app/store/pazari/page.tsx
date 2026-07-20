import { DailyRevenueForm } from "@/app/store/StoreForms";
import { StoreRevenueEditList } from "@/app/store/pazari/StoreRevenueEditList";
import { PageHeader } from "@/components/PageHeader";
import { requireStore } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { DailyRevenueReport } from "@/lib/types";

export default async function StoreDailyRevenuePage() {
  const profile = await requireStore();
  const today = todayInBelgrade();
  const result = await createClient()
    .from("daily_revenue_reports")
    .select("id, store_id, user_id, report_date, shift, cash_revenue, check_revenue, card_revenue, bank_transfer_revenue, correction_revenue, edopuna_revenue, total_revenue, note, created_at")
    .eq("store_id", profile.store_id)
    .order("created_at", { ascending: false })
    .limit(30);
  const reports = (result.data ?? []) as DailyRevenueReport[];
  const todayReport = reports.find((report) => report.report_date === today);
  const previousReports = reports.filter(
    (report) => report.id !== todayReport?.id
  );

  return (
    <>
      <PageHeader eyebrow={profile.stores?.name ?? "Radnja"} title="Dnevni pazar" />
      <div className="page-content grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <DailyRevenueForm
          report={todayReport}
          storeName={profile.stores?.name ?? "Radnja"}
          today={today}
        />
        <StoreRevenueEditList
          error={result.error?.message}
          reports={previousReports}
        />
      </div>
    </>
  );
}
