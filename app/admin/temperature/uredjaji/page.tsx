import { AddDeviceForm, DeviceActiveButton, DeviceEditForm } from "@/app/admin/temperature/uredjaji/DeviceForms";
import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { PRODUCE_STORE_NAMES, sortProduceStores } from "@/lib/produce";
import { createClient } from "@/lib/supabase/server";
import type { Store, TemperatureDevice } from "@/lib/types";

export default async function AdminTemperatureDevicesPage() {
  await requireAdmin();
  const supabase = createClient();
  const [storesResult, devicesResult] = await Promise.all([
    supabase.from("stores").select("id, name, created_at").in("name", [...PRODUCE_STORE_NAMES]),
    supabase
      .from("temperature_devices")
      .select("id, store_id, name, device_type, min_allowed, max_allowed, active, sort_order, created_at, stores(id, name)")
      .order("sort_order")
      .order("name")
  ]);
  const stores = sortProduceStores((storesResult.data ?? []) as Store[]);
  const devices = (devicesResult.data ?? []) as unknown as TemperatureDevice[];

  return (
    <>
      <PageHeader eyebrow="Admin pregled" title="Uređaji temperatura" />
      <div className="page-content">
        {storesResult.error || devicesResult.error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {storesResult.error?.message ?? devicesResult.error?.message}
          </p>
        ) : null}
        <AddDeviceForm stores={stores} />
        <section className="space-y-5">
          {stores.map((store) => {
            const storeDevices = devices.filter((device) => device.store_id === store.id);

            return (
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5" key={store.id}>
                <h2 className="text-lg font-bold text-ink">{store.name}</h2>
                <div className="mt-4 space-y-4">
                  {storeDevices.length > 0 ? (
                    storeDevices.map((device) => (
                      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_160px]" key={device.id}>
                        <DeviceEditForm device={device} stores={stores} />
                        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
                          <p className={`mb-3 text-sm font-bold ${device.active ? "text-leaf" : "text-red-700"}`}>
                            {device.active ? "Aktivan" : "Neaktivan"}
                          </p>
                          <DeviceActiveButton device={device} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">Nema uređaja za ovu radnju.</p>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      </div>
    </>
  );
}
