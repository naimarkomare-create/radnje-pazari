import { TemperatureForm } from "@/app/store/StoreForms";
import { PageHeader } from "@/components/PageHeader";
import { TemperatureReportsList } from "@/components/ReportLists";
import { requireStore } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { TemperatureDevice, TemperatureReport } from "@/lib/types";

export default async function StoreTemperaturePage() {
  const profile = await requireStore();
  const supabase = createClient();
  const [result, devicesResult] = await Promise.all([
    supabase
    .from("temperature_reports")
    .select("id, store_id, user_id, device_id, report_date, shift, device_name, temperature, note, created_at")
    .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("temperature_devices")
      .select("id, store_id, name, device_type, min_allowed, max_allowed, active, sort_order, created_at")
      .eq("active", true)
      .order("sort_order")
      .order("name")
  ]);

  return (
    <>
      <PageHeader eyebrow={profile.stores?.name ?? "Radnja"} title="Temperature" />
      <div className="page-content grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <TemperatureForm
          devices={(devicesResult.data ?? []) as TemperatureDevice[]}
          storeName={profile.stores?.name ?? "Radnja"}
          today={todayInBelgrade()}
        />
        <TemperatureReportsList
          reports={(result.data ?? []) as TemperatureReport[]}
          error={result.error?.message ?? devicesResult.error?.message}
        />
      </div>
    </>
  );
}
