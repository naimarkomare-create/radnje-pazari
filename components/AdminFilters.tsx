import Link from "next/link";
import type { Store } from "@/lib/types";

export function AdminFilters({
  stores,
  selectedDate,
  selectedStore,
  resetHref
}: {
  stores: Store[];
  selectedDate: string;
  selectedStore: string;
  resetHref: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold text-ink">Filteri</h2>
      <form className="mt-4 grid gap-4 sm:grid-cols-[1fr_1fr_auto_auto]" method="get">
        <label className="field">
          <span className="label">Datum</span>
          <input className="input" defaultValue={selectedDate} name="date" type="date" />
        </label>
        <label className="field">
          <span className="label">Radnja</span>
          <select className="input" defaultValue={selectedStore} name="store">
            <option value="">Sve radnje</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button className="button-primary w-full" type="submit">
            Pošalji
          </button>
        </div>
        <div className="flex items-end">
          <Link className="button-secondary w-full" href={resetHref}>
            Nazad
          </Link>
        </div>
      </form>
    </section>
  );
}
