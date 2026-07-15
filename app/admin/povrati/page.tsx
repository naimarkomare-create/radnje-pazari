import Link from "next/link";
import { AdminReturnStatusControl } from "@/components/povrati/AdminReturnStatusControl";
import { Pagination } from "@/components/Pagination";
import { requireAdmin } from "@/lib/auth";
import { RETURN_PROPOSAL_COLUMNS, RETURN_PROPOSAL_ITEM_COLUMNS, todayIsoDate } from "@/lib/return-proposals";
import { createClient } from "@/lib/supabase/server";
import type { ReturnProposal, ReturnProposalItem, Store } from "@/lib/types";

type SearchParams = {
  id?: string;
  item_page?: string;
  page?: string;
  period?: string;
  status?: string;
  store_id?: string;
  q?: string;
};

type SummaryRow = Omit<ReturnProposal, "return_proposal_items"> & {
  return_proposal_items?: Array<{ count: number }>;
};

const PAGE_SIZE = 30;
const ITEM_PAGE_SIZE = 50;

export default async function AdminPovratiPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const supabase = createClient();

  if (searchParams.id) {
    const itemPage = positiveInteger(searchParams.item_page, 1);
    const proposalResult = await supabase
      .from("return_proposals")
      .select(`${RETURN_PROPOSAL_COLUMNS}, stores(id, name)`)
      .eq("id", searchParams.id)
      .single();

    if (proposalResult.error || !proposalResult.data) {
      throw new Error(proposalResult.error?.message ?? "Najava nije pronađena.");
    }

    const from = (itemPage - 1) * ITEM_PAGE_SIZE;
    const itemsResult = await supabase
      .from("return_proposal_items")
      .select(RETURN_PROPOSAL_ITEM_COLUMNS, { count: "exact" })
      .eq("proposal_id", searchParams.id)
      .order("created_at", { ascending: false })
      .range(from, from + ITEM_PAGE_SIZE - 1);

    if (itemsResult.error) throw new Error(itemsResult.error.message);

    const proposal = {
      ...(proposalResult.data as unknown as ReturnProposal),
      item_count: itemsResult.count ?? itemsResult.data?.length ?? 0,
      return_proposal_items: (itemsResult.data ?? []) as ReturnProposalItem[]
    };

    return (
      <main className="page-content">
        <ReturnProposalDetail itemPage={itemPage} proposal={proposal} />
      </main>
    );
  }

  const page = positiveInteger(searchParams.page, 1);
  const search = (searchParams.q ?? "").trim();
  const [storesResult, matchingProposalIds] = await Promise.all([
    supabase.from("stores").select("id, name").order("name"),
    search ? findMatchingProposalIds(supabase, search) : Promise.resolve<string[] | null>(null)
  ]);
  const stores = (storesResult.data ?? []) as Pick<Store, "id" | "name">[];

  let query = supabase
    .from("return_proposals")
    .select(`${RETURN_PROPOSAL_COLUMNS}, stores(id, name), return_proposal_items(count)`, { count: "exact" })
    .order("updated_at", { ascending: false });

  if (searchParams.status) query = query.eq("status", searchParams.status);
  if (searchParams.store_id) query = query.eq("store_id", searchParams.store_id);
  if (searchParams.period === "today") query = query.eq("return_date", todayIsoDate());
  if (searchParams.period === "week") query = query.gte("return_date", dateDaysAgo(6));
  if (matchingProposalIds) query = query.in("id", matchingProposalIds.length > 0 ? matchingProposalIds : ["00000000-0000-0000-0000-000000000000"]);

  const from = (page - 1) * PAGE_SIZE;
  const proposalsResult = await query.range(from, from + PAGE_SIZE - 1);
  if (proposalsResult.error) throw new Error(proposalsResult.error.message);

  const proposals = ((proposalsResult.data ?? []) as unknown as SummaryRow[]).map((row) => {
    const { return_proposal_items, ...proposal } = row;
    return { ...proposal, item_count: Number(return_proposal_items?.[0]?.count ?? 0) } as ReturnProposal;
  });
  const totalCount = proposalsResult.count ?? proposals.length;

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

      <p className="text-sm text-slate-600">Ukupno najava: {totalCount}</p>
      <section className="grid gap-3 lg:grid-cols-2">
        {proposals.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">Nema najava za izabrane filtere.</div>
        ) : null}
        {proposals.map((proposal) => (
          <article className="animated-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={proposal.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-950">{proposal.stores?.name ?? "Radnja"}</h2>
                <p className="text-sm text-slate-600">Stavki: {proposal.item_count ?? 0}</p>
              </div>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{proposal.status}</span>
            </div>
            <div className="mt-3 grid gap-1 text-sm text-slate-600">
              <p>Datum povrata: {proposal.return_date ?? "-"}</p>
              <p>Prvi unos: {formatDateTime(proposal.created_at)}</p>
              <p>Poslednja izmena: {formatDateTime(proposal.updated_at)}</p>
            </div>
            <Link className="button-secondary mt-4 w-full" href={`/admin/povrati?id=${proposal.id}`}>
              Otvori
            </Link>
          </article>
        ))}
      </section>
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        pathname="/admin/povrati"
        searchParams={searchParams}
        totalCount={totalCount}
      />
    </main>
  );
}

function ReturnProposalDetail({ proposal, itemPage }: { proposal: ReturnProposal; itemPage: number }) {
  const items = proposal.return_proposal_items ?? [];
  const itemCount = proposal.item_count ?? items.length;

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <Link className="button-secondary mb-4 inline-flex" href="/admin/povrati">
          Nazad
        </Link>
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">{proposal.stores?.name ?? "Radnja"}</h1>
            <p className="text-sm text-slate-600">Stavki: {itemCount}</p>
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
            <p className="font-bold text-slate-950">{item.article_name}</p>
            <p className="text-sm text-slate-600">
              Šifra: {item.article_id} | Barkod: {item.barcode ?? "-"} | Količina: {item.quantity} {item.unit ?? ""}
            </p>
            {item.reason ? <p className="text-sm text-slate-600">Razlog: {item.reason}</p> : null}
            {item.note ? <p className="text-sm text-slate-600">Napomena: {item.note}</p> : null}
            <p className="mt-2 text-xs text-slate-500">
              Kreirano: {formatDateTime(item.created_at)} | Izmenjeno: {formatDateTime(item.updated_at)}
            </p>
          </article>
        ))}
      </div>
      <Pagination
        page={itemPage}
        pageParam="item_page"
        pageSize={ITEM_PAGE_SIZE}
        pathname="/admin/povrati"
        searchParams={{ id: proposal.id }}
        totalCount={itemCount}
      />
    </section>
  );
}

async function findMatchingProposalIds(supabase: ReturnType<typeof createClient>, search: string) {
  const value = search.replace(/[%_,()]/g, "").slice(0, 80);
  const numeric = Number(value);
  let query = supabase.from("return_proposal_items").select("proposal_id").limit(500);

  query = Number.isInteger(numeric)
    ? query.or(`article_name.ilike.%${value}%,barcode.eq.${value},article_id.eq.${numeric}`)
    : query.or(`article_name.ilike.%${value}%,barcode.ilike.%${value}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return Array.from(new Set((data ?? []).map((row) => row.proposal_id as string)));
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

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
