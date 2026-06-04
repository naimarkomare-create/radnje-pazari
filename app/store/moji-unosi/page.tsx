import { PageHeader } from "@/components/PageHeader";
import { ProduceBatchList } from "@/components/ProduceBatchList";
import { DailyReportsList, TemperatureReportsList } from "@/components/ReportLists";
import { requireStore } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DailyRevenueReport, ProduceRequestBatch, TemperatureReport } from "@/lib/types";

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
      .from("produce_request_batches")
      .select(
        "id, store_id, user_id, request_date, note, created_at, produce_request_items(id, batch_id, produce_item_id, quantity, created_at, produce_items(id, name, unit, sort_order))"
      )
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  return (
    <>
      <PageHeader eyebrow={profile.stores?.name ?? "Radnja"} title="Moji unosi" />
      <div className="page-content grid items-start gap-5 xl:grid-cols-3">
        <DailyReportsList reports={(daily.data ?? []) as DailyRevenueReport[]} error={daily.error?.message} />
        <TemperatureReportsList reports={(temperatures.data ?? []) as TemperatureReport[]} error={temperatures.error?.message} />
        <ProduceBatchList
          batches={(produce.data ?? []) as unknown as ProduceRequestBatch[]}
          error={produce.error?.message}
          title="Trebovanja"
        />
      </div>
    </>
  );
}
