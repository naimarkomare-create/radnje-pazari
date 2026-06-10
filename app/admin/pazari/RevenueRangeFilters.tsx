"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Store } from "@/lib/types";

export function RevenueRangeFilters({
  dateFrom,
  dateTo,
  selectedStore,
  stores
}: {
  dateFrom: string;
  dateTo: string;
  selectedStore: string;
  stores: Store[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateFilter(key: "date_from" | "date_to" | "store_id", value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value) params.set(key, value);
    else params.delete(key);

    if (key === "store_id") params.delete("store");
    if (key === "date_from" || key === "date_to") params.delete("date");

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold text-ink">Filteri</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="field">
          <span className="label">Datum od</span>
          <input className="input" onChange={(event) => updateFilter("date_from", event.target.value)} type="date" value={dateFrom} />
        </label>
        <label className="field">
          <span className="label">Datum do</span>
          <input className="input" onChange={(event) => updateFilter("date_to", event.target.value)} type="date" value={dateTo} />
        </label>
        <label className="field">
          <span className="label">Radnja</span>
          <select className="input" onChange={(event) => updateFilter("store_id", event.target.value)} value={selectedStore}>
            <option value="">Sve radnje</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </section>
  );
}
