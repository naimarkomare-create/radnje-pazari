import { PageHeader } from "@/components/PageHeader";
import { DailyReportsList, ProduceRequestsList, TemperatureReportsList } from "@/components/ReportLists";
import { requireStore } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DailyRevenueReport, ProduceRequest, TemperatureReport } from "@/lib/types";

export default async function StoreEntriesPage() {
  const profile = await requireStore();
  const supabase = createClient();
  const [daily, temperatures, produce] = await Promise.all([
    supabase
      .from("daily_revenue_reports")
      .select("id, store_id, user_id, report_date, shift, cash_revenue, card_revenue, total_revenue, note, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("temperature_reports")
      .select("id, store_id, user_id, report_date, device_name, temperature, note, created_at")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("produce_requests")
      .select("id, store_id, user_id, request_date, item_name, quantity, unit, note, created_at")
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  return (
    <>
      <PageHeader eyebrow={profile.stores?.name ?? "Radnja"} title="Moji unosi" />
      <div className="page-content grid items-start gap-5 xl:grid-cols-3">
        <DailyReportsList reports={(daily.data ?? []) as DailyRevenueReport[]} error={daily.error?.message} />
        <TemperatureReportsList reports={(temperatures.data ?? []) as TemperatureReport[]} error={temperatures.error?.message} />
        <ProduceRequestsList requests={(produce.data ?? []) as ProduceRequest[]} error={produce.error?.message} />
      </div>
    </>
  );
}
