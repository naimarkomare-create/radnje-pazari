import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const sections = [
  { href: "/admin/pazari", title: "Pazari", description: "Pregled i filteri svih dnevnih pazara." },
  { href: "/admin/ispravka-pazara", title: "Ispravka pazara", description: "Izmena i korekcija poslatih pazara." },
  { href: "/admin/temperature", title: "Temperature", description: "Pregled svih izveštaja temperature." },
  { href: "/admin/trebovanja", title: "Trebovanja", description: "Pregled svih zahteva za voće i povrće." },
  { href: "/admin/kontrola-police", title: "Kontrola voća i povrća", description: "Pregled dnevnih slika polica po radnjama." },
  { href: "/admin/mapa", title: "Mapa", description: "Lokacije radnji i dnevni statusi na mapi." },
  { href: "/admin/zadaci", title: "Pošalji zadatak", description: "Kreiranje i praćenje dnevnih zadataka po radnjama." },
  { href: "/admin/biznisoft-akcije", title: "BizniSoft akcije", description: "Sinhronizacija i zadaci za akcijske cene." }
];

export default async function AdminDashboardPage() {
  await requireAdmin();
  const supabase = createClient();

  const [daily, temperatures, produce, shelfPhotos] = await Promise.all([
    supabase.from("daily_revenue_reports").select("id", { count: "exact", head: true }),
    supabase.from("temperature_reports").select("id", { count: "exact", head: true }),
    supabase.from("produce_request_batches").select("id", { count: "exact", head: true }),
    supabase.from("produce_shelf_photo_checks").select("id", { count: "exact", head: true })
  ]);

  return (
    <>
      <PageHeader description="Pregled internih izveštaja svih radnji." eyebrow="Admin pregled" title="Početna" />
      <div className="page-content">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Summary label="Pazari" value={daily.count ?? 0} />
          <Summary label="Temperature" value={temperatures.count ?? 0} />
          <Summary label="Trebovanja" value={produce.count ?? 0} />
          <Summary label="Kontrola voća i povrća" value={shelfPhotos.count ?? 0} />
        </section>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sections.map((section) => (
            <Link
              className="interactive-card rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              href={section.href}
              key={section.href}
            >
              <h2 className="text-lg font-bold text-ink">{section.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{section.description}</p>
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
    <div className="interactive-card min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <p className="text-xs font-semibold text-slate-500 sm:text-sm">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}
