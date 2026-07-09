import Link from "next/link";
import { AdminReturnStatusControl } from "@/components/povrati/AdminReturnStatusControl";
import { requireAdmin } from "@/lib/auth";
import { todayIsoDate } from "@/lib/return-proposals";
import { createClient } from "@/lib/supabase/server";
import type { ReturnProposal, ReturnProposalItem, Store } from "@/lib/types";

type SearchParams = {
  id?: string;
  period?: string;
  status?: string;
  store_id?: string;
  q?: string;
};

export default async function AdminPovratiPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const supabase = createClient();
  const { data: storesData } = await supabase.from("stores").select("id, name").order("name");
  const stores = (storesData ?? []) as Pick<Store, "id" | "name">[];
  const selectedId = searchParams.id;

  if (selectedId) {
    const { data, error } = await supabase
      .from("return_proposals")
      .select("*, stores(id, name), return_proposal_items(*)")
      .eq("id", selectedId)
      .single();

    if (error) throw new Error(error.message);

    return (
      <main className="page-content">
        <ReturnProposalDetail proposal={data as ReturnProposal} />
      </main>
    );
  }

  let query = supabase
    .from("return_proposals")
    .select("*, stores(id, name), return_proposal_items(*)")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (searchParams.status) query = query.eq("status", searchParams.status);
  if (searchParams.store_id) query = query.eq("store_id", searchParams.store_id);
  if (searchParams.period === "today") query = query.eq("return_date", todayIsoDate());
  if (searchParams.period === "week") query = query.gte("return_date", dateDaysAgo(6));

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const proposals = filterBySearch(((data ?? []) as ReturnProposal[]), searchParams.q ?? "");

  return (
    <main className="page-content">
      <header className="space-y-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Admin</p>
        <h1 className="text-2xl font-bold text-slate-950">Najave povrata</h1>
      </header>

      <form className="grid gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-4">
        <select className="input" defaultValue={searchParams.period ?? ""} name="period">
          <option value="">Svi datumi</option>
          <option value="today">Danas</option>
          <option value="week">Ove nedelje</option>
        </select>
        <select className="input" defaultValue={searchParams.status ?? ""} name="status">
          <option value="">Svi statusi</option>
          <option value="draft">draft</option>
          <option value="submitted">submitted</option>
          <option value="reviewed">reviewed</option>
          <option value="completed">completed</option>
          <option value="cancelled">cancelled</option>
        </select>
        <select className="input" defaultValue={searchParams.store_id ?? ""} name="store_id">
          <option value="">Sve radnje</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
        <input className="input" defaultValue={searchParams.q ?? ""} name="q" placeholder="Naziv / barkod / šifra" />
        <button className="button-secondary sm:col-span-4" type="submit">
          Prikaži
        </button>
      </form>

      <section className="grid gap-3 lg:grid-cols-2">
        {proposals.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">Nema najava za izabrane filtere.</div>
        ) : null}
        {proposals.map((proposal) => (
          <article className="animated-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={proposal.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">{proposal.stores?.name ?? "Radnja"}</h2>
                <p className="text-sm text-slate-600">Stavki: {proposal.return_proposal_items?.length ?? 0}</p>
              </div>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{proposal.status}</span>
            </div>
            <div className="mt-3 grid gap-1 text-sm text-slate-600">
              <p>Datum povrata: {proposal.return_date ?? "-"}</p>
              <p>Prvi unos: {formatDateTime(proposal.created_at)}</p>
              <p>Poslednja izmena: {formatDateTime(proposal.updated_at)}</p>
              <p>Kreirao: {proposal.created_by ?? "-"}</p>
            </div>
            <Link className="button-secondary mt-4 w-full" href={`/admin/povrati?id=${proposal.id}`}>
              Otvori
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}

function ReturnProposalDetail({ proposal }: { proposal: ReturnProposal }) {
  const items = proposal.return_proposal_items ?? [];

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <Link className="button-secondary mb-4 inline-flex" href="/admin/povrati">
          Nazad
        </Link>
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">{proposal.stores?.name ?? "Radnja"}</h1>
            <p className="text-sm text-slate-600">Stavki: {items.length}</p>
            <p className="text-sm text-slate-600">Prvi unos: {formatDateTime(proposal.created_at)}</p>
            <p className="text-sm text-slate-600">Poslednja izmena: {formatDateTime(proposal.updated_at)}</p>
          </div>
          <AdminReturnStatusControl proposalId={proposal.id} status={proposal.status} />
        </div>
      </div>

      <div className="space-y-2">
        {items.length === 0 ? <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Nema stavki.</p> : null}
        {items.map((item) => (
          <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm" key={item.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold text-slate-950">{item.article_name}</p>
                <p className="text-sm text-slate-600">
                  Šifra: {item.article_id} | Barkod: {item.barcode ?? "-"} | Količina: {item.quantity} {item.unit ?? ""}
                </p>
                {item.reason ? <p className="text-sm text-slate-600">Razlog: {item.reason}</p> : null}
                {item.note ? <p className="text-sm text-slate-600">Napomena: {item.note}</p> : null}
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Kreirano: {formatDateTime(item.created_at)} | Izmenjeno: {formatDateTime(item.updated_at)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function filterBySearch(proposals: ReturnProposal[], search: string) {
  const q = search.trim().toLowerCase();
  if (!q) return proposals;

  return proposals.filter((proposal) =>
    (proposal.return_proposal_items ?? []).some((item: ReturnProposalItem) =>
      [item.article_name, item.barcode, String(item.article_id)].filter(Boolean).some((value) => String(value).toLowerCase().includes(q))
    )
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("sr-RS", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Belgrade"
  }).format(new Date(value));
}

function dateDaysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Belgrade",
    year: "numeric"
  }).format(date);
}
