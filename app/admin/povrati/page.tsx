import Link from "next/link";
import { AdminReturnStatusControl } from "@/components/povrati/AdminReturnStatusControl";
import { ExpiredReturnDraftCleanupButton } from "@/components/povrati/ExpiredReturnDraftCleanupButton";
import { SupplierCoverageReport } from "@/components/povrati/SupplierCoverageReport";
import { SupplierSyncPanel } from "@/components/povrati/SupplierSyncPanel";
import { Pagination } from "@/components/Pagination";
import { requireAdmin } from "@/lib/auth";
import {
  distinctSupplierNames,
  formatReturnDate,
  formatReturnItemCount,
  RETURN_PROPOSAL_COLUMNS,
  RETURN_PROPOSAL_ITEM_COLUMNS,
  returnStatusLabel,
  returnSupplierSummary,
  supplierRelationSourceLabel,
  todayIsoDate
} from "@/lib/return-proposals";
import { createClient } from "@/lib/supabase/server";
import type {
  ReturnProposal,
  ReturnProposalItem,
  ReturnProposalSummary,
  Store,
  SupplierCoverageReport as SupplierCoverageData
} from "@/lib/types";

type SearchParams = {
  deleted?: string;
  id?: string;
  item_page?: string;
  page?: string;
  period?: string;
  status?: string;
  store_id?: string;
  supplier?: string;
  q?: string;
};

type SummaryRow = Omit<ReturnProposal, "return_proposal_items"> & {
  return_proposal_items?: Array<{ supplier_name: string | null }>;
  supplier_matches?: Array<{ supplier_id: string | null }>;
};

type SupplierFilterRow = {
  id: string;
  is_active: boolean;
  name: string;
};

const PAGE_SIZE = 30;
const ITEM_PAGE_SIZE = 50;

export default async function AdminPovratiPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const supabase = createClient();

  if (searchParams.id) {
    const itemPage = positiveInteger(searchParams.item_page, 1);
    const returnHref = buildAdminReturnListHref(searchParams);
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
        <ReturnProposalDetail
          itemPage={itemPage}
          proposal={proposal}
          returnHref={returnHref}
        />
      </main>
    );
  }

  const page = positiveInteger(searchParams.page, 1);
  const search = (searchParams.q ?? "").trim();
  const [storesResult, suppliersResult, matchingProposalIds, coverageResult] = await Promise.all([
    supabase.from("stores").select("id, name").order("name"),
    supabase.from("biznisoft_suppliers").select("id, name, is_active").order("name"),
    search ? findMatchingProposalIds(supabase, search) : Promise.resolve<string[] | null>(null),
    supabase.rpc("get_supplier_coverage_report", {
      p_sample_limit: 10,
      p_sample_offset: 0
    })
  ]);
  if (storesResult.error) throw new Error(storesResult.error.message);
  if (suppliersResult.error) throw new Error(suppliersResult.error.message);
  const stores = (storesResult.data ?? []) as Pick<Store, "id" | "name">[];
  const suppliers = (suppliersResult.data ?? []) as SupplierFilterRow[];
  const coverage = coverageResult.error
    ? null
    : normalizeCoverageReport(coverageResult.data);
  const supplierFilter =
    searchParams.supplier === "unassigned" ||
    suppliers.some((supplier) => supplier.id === searchParams.supplier)
      ? searchParams.supplier
      : "";
  const supplierJoin = supplierFilter
    ? ", supplier_matches:return_proposal_items!inner(supplier_id)"
    : "";

  let query = supabase
    .from("return_proposals")
    .select(
      `${RETURN_PROPOSAL_COLUMNS}, stores(id, name), return_proposal_items(supplier_name)${supplierJoin}`,
      { count: "exact" }
    )
    .order("updated_at", { ascending: false });

  if (searchParams.status) query = query.eq("status", searchParams.status);
  if (searchParams.store_id) query = query.eq("store_id", searchParams.store_id);
  if (searchParams.period === "today") query = query.eq("return_date", todayIsoDate());
  if (searchParams.period === "week") query = query.gte("return_date", dateDaysAgo(6));
  if (supplierFilter === "unassigned") query = query.is("supplier_matches.supplier_id", null);
  if (supplierFilter && supplierFilter !== "unassigned") {
    query = query.eq("supplier_matches.supplier_id", supplierFilter);
  }
  if (matchingProposalIds) query = query.in("id", matchingProposalIds.length > 0 ? matchingProposalIds : ["00000000-0000-0000-0000-000000000000"]);

  const from = (page - 1) * PAGE_SIZE;
  const proposalsResult = await query.range(from, from + PAGE_SIZE - 1);
  if (proposalsResult.error) throw new Error(proposalsResult.error.message);

  const proposals = ((proposalsResult.data ?? []) as unknown as SummaryRow[]).map(
    (row): ReturnProposalSummary => {
      const { return_proposal_items, ...proposal } = row;
      const summaryItems = return_proposal_items ?? [];
      return {
        ...proposal,
        item_count: summaryItems.length,
        supplier_names: distinctSupplierNames(summaryItems)
      };
    }
  );
  const totalCount = proposalsResult.count ?? proposals.length;

  return (
    <main className="page-content">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">Admin</p>
          <h1 className="text-2xl font-bold text-slate-950">Najave povrata</h1>
        </div>
        <ExpiredReturnDraftCleanupButton />
      </header>

      {searchParams.deleted === "1" ? (
        <p
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800"
          role="status"
        >
          Najava povrata je obrisana.
        </p>
      ) : null}

      <SupplierSyncPanel />
      <SupplierCoverageReport coverage={coverage} />

      <form className="grid gap-2 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <select className="input" defaultValue={searchParams.period ?? ""} name="period">
          <option value="">Svi datumi</option>
          <option value="today">Danas</option>
          <option value="week">Ove nedelje</option>
        </select>
        <select className="input" defaultValue={searchParams.status ?? ""} name="status">
          <option value="">Svi statusi</option>
          <option value="draft">Nacrt</option>
          <option value="submitted">Poslato</option>
          <option value="reviewed">Pregledano</option>
          <option value="completed">Završeno</option>
          <option value="cancelled">Otkazano</option>
        </select>
        <select className="input" defaultValue={searchParams.store_id ?? ""} name="store_id">
          <option value="">Sve radnje</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>
        <select className="input" defaultValue={supplierFilter} name="supplier">
          <option value="">Svi dobavljači</option>
          <option value="unassigned">Bez dobavljača</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
              {supplier.is_active ? "" : " (neaktivan)"}
            </option>
          ))}
        </select>
        <input className="input" defaultValue={searchParams.q ?? ""} name="q" placeholder="Naziv / barkod / šifra" />
        <button className="button-secondary sm:col-span-2 lg:col-span-5" type="submit">
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
              </div>
              <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                {returnStatusLabel(proposal.status)}
              </span>
            </div>
            <div className="mt-3 grid gap-1 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">
                {formatReturnDate(proposal.return_date)} ·{" "}
                {returnSupplierSummary(
                  proposal.supplier_names,
                  proposal.item_count
                )}{" "}
                · {formatReturnItemCount(proposal.item_count)}
              </p>
              <p>Prvi unos: {formatDateTime(proposal.created_at)}</p>
              <p>Poslednja izmena: {formatDateTime(proposal.updated_at)}</p>
            </div>
            <Link
              className="button-secondary mt-4 w-full"
              href={buildAdminReturnDetailHref(searchParams, proposal.id)}
            >
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

function ReturnProposalDetail({
  proposal,
  itemPage,
  returnHref
}: {
  proposal: ReturnProposal;
  itemPage: number;
  returnHref: string;
}) {
  const items = proposal.return_proposal_items ?? [];
  const itemCount = proposal.item_count ?? items.length;

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <Link className="button-secondary mb-4 inline-flex" href={returnHref}>
          Nazad
        </Link>
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">{proposal.stores?.name ?? "Radnja"}</h1>
            <p className="text-sm text-slate-600">Stavki: {itemCount}</p>
            <p className="text-sm text-slate-600">Prvi unos: {formatDateTime(proposal.created_at)}</p>
            <p className="text-sm text-slate-600">Poslednja izmena: {formatDateTime(proposal.updated_at)}</p>
          </div>
          <AdminReturnStatusControl
            proposalId={proposal.id}
            returnHref={returnHref}
            status={proposal.status}
          />
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
            <p className="text-sm text-slate-600">
              Dobavljač: {item.supplier_name ?? "Nije evidentiran"}
            </p>
            {item.supplier_name && item.supplier_relation_source ? (
              <p className="text-xs font-semibold text-slate-500">
                {supplierRelationSourceLabel(item.supplier_relation_source)}
              </p>
            ) : null}
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

function buildAdminReturnListHref(searchParams: SearchParams) {
  const params = buildAdminReturnListParams(searchParams);
  const query = params.toString();
  return query ? `/admin/povrati?${query}` : "/admin/povrati";
}

function buildAdminReturnDetailHref(
  searchParams: SearchParams,
  proposalId: string
) {
  const params = buildAdminReturnListParams(searchParams);
  params.set("id", proposalId);
  return `/admin/povrati?${params.toString()}`;
}

function buildAdminReturnListParams(searchParams: SearchParams) {
  const params = new URLSearchParams();
  const keys: Array<keyof SearchParams> = [
    "page",
    "period",
    "status",
    "store_id",
    "supplier",
    "q"
  ];

  for (const key of keys) {
    const value = searchParams[key];
    if (value) params.set(key, value);
  }

  return params;
}

function normalizeCoverageReport(value: unknown): SupplierCoverageData | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const report = value as Record<string, unknown>;
  const sample = Array.isArray(report.unmatchedSample)
    ? report.unmatchedSample
        .map((item) => normalizeCoverageArticle(item))
        .filter(
          (
            item
          ): item is SupplierCoverageData["unmatchedSample"][number] =>
            item !== null
        )
    : [];

  return {
    articlesWithSupplier: toCount(report.articlesWithSupplier),
    articlesWithoutSupplier: toCount(report.articlesWithoutSupplier),
    coveragePercent: toNumber(report.coveragePercent),
    lastSyncAt:
      typeof report.lastSyncAt === "string" ? report.lastSyncAt : null,
    processedDocumentDateFrom:
      typeof report.processedDocumentDateFrom === "string"
        ? report.processedDocumentDateFrom
        : null,
    processedDocumentDateTo:
      typeof report.processedDocumentDateTo === "string"
        ? report.processedDocumentDateTo
        : null,
    processedDocuments: toCount(report.processedDocuments),
    relationArticleIdsMissingLocally: toCount(
      report.relationArticleIdsMissingLocally
    ),
    totalArticles: toCount(report.totalArticles),
    totalRelations: toCount(report.totalRelations),
    totalSuppliers: toCount(report.totalSuppliers),
    unmatchedSample: sample
  };
}

function normalizeCoverageArticle(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const article = value as Record<string, unknown>;
  const articleId = Number(article.articleId);
  if (!Number.isSafeInteger(articleId)) return null;

  return {
    articleId,
    barcode: typeof article.barcode === "string" ? article.barcode : null,
    name: typeof article.name === "string" ? article.name : null,
    reason:
      typeof article.reason === "string"
        ? article.reason
        : "Nema eksplicitne veze u obrađenim BizniSoft kalkulacijama.",
    unit: typeof article.unit === "string" ? article.unit : null
  };
}

function toCount(value: unknown) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function toNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}
