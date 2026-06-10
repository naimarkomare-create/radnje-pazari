"use client";

import dynamic from "next/dynamic";

export type StoreMapMarker = {
  id: string;
  name: string;
  storeType: StoreType;
  address: string | null;
  latitude: number;
  longitude: number;
  yesterday: string;
  yesterdayRevenueTotal: number;
  revenueSubmitted: boolean;
  temperatureSubmitted: boolean;
  shelfPhotoSubmitted: boolean;
  openTasksCount: number;
  statusColor: "green" | "yellow" | "red";
  detailHref: string;
};

export type StoreType = "supermarket" | "medium" | "mini";

const StoreMap = dynamic(() => import("./StoreMap"), {
  loading: () => (
    <section className="flex h-[70vh] min-h-[420px] items-center justify-center rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-600 shadow-sm">
      Učitavanje mape...
    </section>
  ),
  ssr: false
});

export function StoreMapSection({ markers }: { markers: StoreMapMarker[] }) {
  return (
    <section className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_1.25fr]">
        <div className="interactive-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-ink">Tip objekta</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
            <TypeLegend markerClass="h-6 w-6 rounded-md border-[3px]" label="Supermarket" />
            <TypeLegend markerClass="h-5 w-5 rounded-full border-[3px]" label="Srednja radnja" />
            <TypeLegend markerClass="h-4 w-4 rotate-45 rounded-sm border-2" label="Mini market" />
          </div>
        </div>
        <div className="interactive-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-bold text-ink">Status danas</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <StatusLegend colorClass="bg-emerald-500" label="Green: sve poslato" />
            <StatusLegend colorClass="bg-amber-400" label="Yellow: nešto fali" />
            <StatusLegend colorClass="bg-red-500" label="Red: fali pazar ili temperatura" />
          </div>
        </div>
      </div>
      {markers.length > 0 ? (
        <StoreMap markers={markers} />
      ) : (
        <section className="interactive-card rounded-lg border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-600 shadow-sm">
          Nema radnji sa unetim koordinatama.
        </section>
      )}
    </section>
  );
}

function StatusLegend({ colorClass, label }: { colorClass: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
      <span className={`size-3 rounded-full ${colorClass}`} />
      {label}
    </div>
  );
}

function TypeLegend({ markerClass, label }: { markerClass: string; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
      <span className={`${markerClass} inline-block border-slate-500 bg-white shadow-sm`} />
      {label}
    </div>
  );
}
