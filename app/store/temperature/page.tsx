import { TemperatureForm } from "@/app/store/StoreForms";
import { PageHeader } from "@/components/PageHeader";
import { TemperatureReportsList } from "@/components/ReportLists";
import { requireStore } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { TemperatureReport } from "@/lib/types";

export default async function StoreTemperaturePage() {
  const profile = await requireStore();
  const result = await createClient()
    .from("temperature_reports")
    .select("id, store_id, user_id, report_date, device_name, temperature, note, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <>
      <PageHeader eyebrow={profile.stores?.name ?? "Radnja"} title="Temperature" />
      <div className="page-content grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <TemperatureForm storeName={profile.stores?.name ?? "Radnja"} today={todayInBelgrade()} />
        <TemperatureReportsList reports={(result.data ?? []) as TemperatureReport[]} error={result.error?.message} />
      </div>
    </>
  );
}
