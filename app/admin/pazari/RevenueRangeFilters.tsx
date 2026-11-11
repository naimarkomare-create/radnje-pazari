"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { Store } from "@/lib/types";

type FilterKey = "date_from" | "date_to" | "store_id";

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
  const [pending, startTransition] = useTransition();
  const [nextFilter, setNextFilter] = useState<{ key: FilterKey; value: string }>();

  function updateFilter(key: FilterKey, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");

    if (value) params.set(key, value);
    else params.delete(key);

    if (key === "store_id") params.delete("store");
    if (key === "date_from" || key === "date_to") params.delete("date");

    const query = params.toString();
    setNextFilter({ key, value });
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  function filterValue(key: FilterKey, current: string) {
    return pending && nextFilter?.key === key ? nextFilter.value : current;
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold text-ink">Filteri</h2>
      <fieldset aria-busy={pending} className="mt-4 grid min-w-0 gap-4 md:grid-cols-3" disabled={pending}>
        <label className="field">
          <span className="label">Datum od</span>
          <input className="input" onChange={(event) => updateFilter("date_from", event.target.value)} type="date" value={filterValue("date_from", dateFrom)} />
        </label>
        <label className="field">
          <span className="label">Datum do</span>
          <input className="input" onChange={(event) => updateFilter("date_to", event.target.value)} type="date" value={filterValue("date_to", dateTo)} />
        </label>
        <label className="field">
          <span className="label">Radnja</span>
          <select className="input" onChange={(event) => updateFilter("store_id", event.target.value)} value={filterValue("store_id", selectedStore)}>
            <option value="">Sve radnje</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      {pending ? <p className="mt-3 text-sm text-slate-600" role="status">Učitavanje rezultata...</p> : null}
    </section>
  );
}
