"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { Store } from "@/lib/types";

type FilterKey = "date" | "store_id";

export function AdminFilters({
  stores,
  selectedDate,
  selectedStore
}: {
  stores: Store[];
  selectedDate: string;
  selectedStore: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [nextFilter, setNextFilter] = useState<{ key: FilterKey; value: string }>();

  function updateFilter(key: FilterKey, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");

    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }

    if (key === "store_id") {
      params.delete("store");
    }

    const query = params.toString();
    setNextFilter({ key, value });
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold text-ink">Filteri</h2>
      <fieldset aria-busy={pending} className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2" disabled={pending}>
        <label className="field">
          <span className="label">Datum</span>
          <input
            className="input"
            onChange={(event) => updateFilter("date", event.target.value)}
            type="date"
            value={pending && nextFilter?.key === "date" ? nextFilter.value : selectedDate}
          />
        </label>
        <label className="field">
          <span className="label">Radnja</span>
          <select
            className="input"
            onChange={(event) => updateFilter("store_id", event.target.value)}
            value={pending && nextFilter?.key === "store_id" ? nextFilter.value : selectedStore}
          >
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
