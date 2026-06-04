import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { requireStore } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const actions = [
  {
    href: "/store/pazari",
    title: "Dnevni pazar",
    description: "Pošaljite dnevni izveštaj o gotovini, kartici i ukupnom pazaru."
  },
  {
    href: "/store/temperature",
    title: "Temperature",
    description: "Unesite temperaturu frižidera ili zamrzivača."
  },
  {
    href: "/store/trebovanja",
    title: "Trebovanja",
    description: "Pošaljite zahtev za voće i povrće."
  },
  {
    href: "/store/moji-unosi",
    title: "Moji unosi",
    description: "Pregledajte nedavno poslate izveštaje."
  }
];

export default async function StoreDashboardPage() {
  const profile = await requireStore();
  const supabase = createClient();

  const [daily, temperatures, produce] = await Promise.all([
    supabase.from("daily_revenue_reports").select("id", { count: "exact", head: true }),
    supabase.from("temperature_reports").select("id", { count: "exact", head: true }),
    supabase.from("produce_requests").select("id", { count: "exact", head: true })
  ]);

  return (
    <>
      <PageHeader
        description="Izaberite šta želite da pošaljete ili pregledate."
        eyebrow={profile.stores?.name ?? "Radnja"}
        title="Početna"
      />
      <div className="page-content">
        <section className="grid grid-cols-3 gap-3">
          <Summary label="Pazari" value={daily.count ?? 0} />
          <Summary label="Temperature" value={temperatures.count ?? 0} />
          <Summary label="Trebovanja" value={produce.count ?? 0} />
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          {actions.map((action) => (
            <Link
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-leaf hover:shadow"
              href={action.href}
              key={action.href}
            >
              <h2 className="text-lg font-bold text-ink">{action.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{action.description}</p>
              <p className="mt-4 text-sm font-semibold text-leaf">Otvori</p>
            </Link>
          ))}
        </section>
      </div>
    </>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <p className="truncate text-xs font-semibold text-slate-500 sm:text-sm">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}
