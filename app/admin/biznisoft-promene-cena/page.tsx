import Link from "next/link";
import { BulkTaskButton, DetailTaskButtons, GroupTaskButton, PriceSyncButton } from "@/app/admin/biznisoft-promene-cena/PriceChangeButtons";
import { Pagination } from "@/components/Pagination";
import { requireAdmin } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { PRODUCE_STORE_NAMES, sortProduceStores } from "@/lib/produce";
import { createClient } from "@/lib/supabase/server";
import type { BizniSoftArticle, BizniSoftPriceChange, BizniSoftPriceChangeWithArticle, Store } from "@/lib/types";

type PageSearchParams = {
  filter?: string;
  page?: string;
  q?: string;
  storage_key?: string;
};

type ChangeGroup = {
  storageKey: string;
  label: string;
  changes: BizniSoftPriceChangeWithArticle[];
};

const filterOptions = [
  { href: "/admin/biznisoft-promene-cena?filter=today", key: "today", label: "Danas" },
  { href: "/admin/biznisoft-promene-cena?filter=7d", key: "7d", label: "7 dana" },
  { href: "/admin/biznisoft-promene-cena?filter=new", key: "new", label: "Bez zadatka" },
  { href: "/admin/biznisoft-promene-cena?filter=task_created", key: "task_created", label: "Sa zadatkom" },
  { href: "/admin/biznisoft-promene-cena?filter=ignored", key: "ignored", label: "Ignorisano" },
  { href: "/admin/biznisoft-promene-cena?filter=all", key: "all", label: "Sve" }
];

const PAGE_SIZE = 50;

export default async function BizniSoftPriceChangesPage({ searchParams }: { searchParams: PageSearchParams }) {
  await requireAdmin();
  const supabase = createClient();
  const today = todayInBelgrade();
  const activeFilter = searchParams.filter ?? "today";
  const search = (searchParams.q ?? "").trim();
  const selectedStorageKey = searchParams.storage_key;
  const page = positiveInteger(searchParams.page, 1);

  let query = supabase
    .from("biznisoft_price_changes")
    .select(
      "id, change_date, detected_at, storage_key, storage_id, article_id, name, barcode, old_retail_price, new_retail_price, old_wholesale_price, new_wholesale_price, amount, status, task_created, task_created_at, ignored_at, source_key, created_at",
      { count: "exact" }
    )
    .order("detected_at", { ascending: false });

  if (activeFilter === "today") query = query.eq("change_date", today);
  if (activeFilter === "7d") query = query.gte("change_date", dateDaysAgo(6));
  if (activeFilter === "new") query = query.eq("status", "new").eq("task_created", false);
  if (activeFilter === "task_created") query = query.eq("status", "task_created");
  if (activeFilter === "ignored") query = query.eq("status", "ignored");
  if (selectedStorageKey) query = query.eq("storage_key", selectedStorageKey);
  if (search) {
    const safeSearch = search.replace(/[%_,()]/g, "").slice(0, 80);
    const articleId = Number(safeSearch);
    query = Number.isInteger(articleId)
      ? query.or(`name.ilike.%${safeSearch}%,barcode.ilike.%${safeSearch}%,article_id.eq.${articleId}`)
      : query.or(`name.ilike.%${safeSearch}%,barcode.ilike.%${safeSearch}%`);
  }

  const from = (page - 1) * PAGE_SIZE;
  const [storesResult, changesResult, summary, lastCheck] = await Promise.all([
    supabase.from("stores").select("id, name, biznisoft_storage_id").in("name", [...PRODUCE_STORE_NAMES]),
    query.range(from, from + PAGE_SIZE - 1),
    fetchSummary(supabase, today),
    fetchLastCheck(supabase)
  ]);
  if (changesResult.error) throw new Error(changesResult.error.message);

  const stores = sortProduceStores((storesResult.data ?? []) as unknown as Store[]);
  const storesByStorageId = storesByBizniSoftStorageId(stores);
  const changes = (changesResult.data ?? []) as BizniSoftPriceChange[];
  const articleIds = Array.from(new Set(changes.filter((change) => !change.name || !change.barcode).map((change) => change.article_id)));
  const articles = await fetchArticles(supabase, articleIds);
  const changesWithArticles = changes.map((change) => attachArticle(change, articles));
  const groups = groupChanges(changesWithArticles, storesByStorageId);
  const selectedGroup = selectedStorageKey ? groups.find((group) => group.storageKey === selectedStorageKey) ?? null : null;
  const totalCount = changesResult.count ?? changes.length;

  return (
    <main className="page-fade space-y-6">
      <header className="space-y-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">BizniSoft</p>
          <h1 className="text-2xl font-bold text-slate-950">Promene cena</h1>
          <p className="mt-1 text-sm text-slate-600">Poslednja provera: {lastCheck ? formatDateTime(lastCheck) : "-"}</p>
        </div>

        <section className="grid gap-3 sm:grid-cols-5">
          <SummaryCard label="Danas" value={summary.today} />
          <SummaryCard label="Bez zadatka" value={summary.new} />
          <SummaryCard label="Zadatak napravljen" value={summary.taskCreated} />
          <SummaryCard label="Ignorisano" value={summary.ignored} />
          <SummaryCard label="Provere artikala" value={summary.checkedArticles} />
        </section>

        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <PriceSyncButton />
          <BulkTaskButton />
        </div>
      </header>

      <section className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {filterOptions.map((option) => (
            <Link
              className={`whitespace-nowrap rounded-full border px-3 py-2 text-sm font-semibold transition-all duration-200 ${
                activeFilter === option.key
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
              }`}
              href={option.href}
              key={option.key}
            >
              {option.label}
            </Link>
          ))}
        </div>

        <form action="/admin/biznisoft-promene-cena" className="flex gap-2">
          <input name="filter" type="hidden" value={activeFilter} />
          {selectedStorageKey ? <input name="storage_key" type="hidden" value={selectedStorageKey} /> : null}
          <input
            className="input"
            defaultValue={searchParams.q ?? ""}
            name="q"
            placeholder="Naziv / šifra / barkod"
            type="search"
          />
        </form>

        <p className="text-sm text-slate-600">
          Prikazano promena: <strong>{changesWithArticles.length}</strong> od <strong>{totalCount}</strong> | Grupa na strani: <strong>{groups.length}</strong>
        </p>
      </section>

      {selectedGroup ? (
        <PriceChangeDetail activeFilter={activeFilter} group={selectedGroup} />
      ) : (
        <section className="grid gap-3 lg:grid-cols-2">
          {groups.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-600">Nema promena cena za izabrani prikaz.</div>
          ) : (
            groups.map((group) => <PriceChangeGroupCard activeFilter={activeFilter} group={group} key={group.storageKey} />)
          )}
        </section>
      )}
      <Pagination
        page={page}
        pageSize={PAGE_SIZE}
        pathname="/admin/biznisoft-promene-cena"
        searchParams={searchParams}
        totalCount={totalCount}
      />
    </main>
  );
}

function PriceChangeGroupCard({ activeFilter, group }: { activeFilter: string; group: ChangeGroup }) {
  const pendingCount = group.changes.filter((change) => change.status === "new" && !change.task_created).length;
  const upCount = group.changes.filter((change) => direction(change) === "Poskupljenje").length;
  const downCount = group.changes.filter((change) => direction(change) === "Pojeftinjenje").length;
  const changeDate = group.changes[0]?.change_date ?? todayInBelgrade();

  return (
    <article className="animated-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">{group.label}</h2>
          <p className="text-sm text-slate-600">{group.changes.length} promena</p>
        </div>
        <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">Bez zadatka: {pendingCount}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md bg-slate-50 p-2">
          <p className="text-slate-500">Poskupljenja</p>
          <p className="font-bold text-slate-950">{upCount}</p>
        </div>
        <div className="rounded-md bg-slate-50 p-2">
          <p className="text-slate-500">Pojeftinjenja</p>
          <p className="font-bold text-slate-950">{downCount}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <Link className="button-secondary text-center" href={`/admin/biznisoft-promene-cena?filter=${activeFilter}&storage_key=${encodeURIComponent(group.storageKey)}`}>
          Otvori
        </Link>
        <GroupTaskButton changeDate={changeDate} storageKey={group.storageKey} />
      </div>
    </article>
  );
}

function PriceChangeDetail({ activeFilter, group }: { activeFilter: string; group: ChangeGroup }) {
  const changeDate = group.changes[0]?.change_date ?? todayInBelgrade();

  return (
    <section className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <Link className="button-secondary mb-4 inline-flex" href={`/admin/biznisoft-promene-cena?filter=${activeFilter}`}>
          Nazad
        </Link>
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-950">{group.label}</h2>
          <p className="text-sm text-slate-600">{group.changes.length} promena</p>
        </div>
        <div className="mt-4">
          <DetailTaskButtons changeDate={changeDate} storageKey={group.storageKey} />
        </div>
      </div>

      <div className="space-y-2">
        {group.changes.map((change) => (
          <article className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-colors duration-200 hover:bg-slate-50" key={change.id}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-bold text-slate-950">{articleName(change)}</h3>
                <p className="text-xs text-slate-600">
                  Šifra: {change.article_id} | Barkod: {change.article_barcode ?? "-"}
                </p>
              </div>
              <span className={direction(change) === "Poskupljenje" ? "rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700" : "rounded-md bg-green-50 px-2 py-1 text-xs font-bold text-green-700"}>
                {direction(change)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <p className="font-bold text-slate-950">
                {formatRsd(change.old_retail_price)} → {formatRsd(change.new_retail_price)}
              </p>
              <p className="text-xs text-slate-500">{formatDateTime(change.detected_at)}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
    </div>
  );
}

async function fetchArticles(supabase: ReturnType<typeof createClient>, articleIds: number[]) {
  if (articleIds.length === 0) return new Map<number, BizniSoftArticle>();

  const { data, error } = await supabase
    .from("biznisoft_articles")
    .select("article_id, name, barcode, article_code, cat_no, unit")
    .in("article_id", articleIds);

  if (error) throw new Error(error.message);
  return new Map(((data ?? []) as BizniSoftArticle[]).map((article) => [article.article_id, article]));
}

async function fetchSummary(supabase: ReturnType<typeof createClient>, today: string) {
  const [todayResult, newResult, taskResult, ignoredResult, checkedResult] = await Promise.all([
    supabase.from("biznisoft_price_changes").select("id", { count: "exact", head: true }).eq("change_date", today),
    supabase.from("biznisoft_price_changes").select("id", { count: "exact", head: true }).eq("status", "new").eq("task_created", false),
    supabase.from("biznisoft_price_changes").select("id", { count: "exact", head: true }).eq("status", "task_created"),
    supabase.from("biznisoft_price_changes").select("id", { count: "exact", head: true }).eq("status", "ignored"),
    supabase.from("biznisoft_stock_price_current").select("article_id", { count: "planned", head: true })
  ]);

  return {
    checkedArticles: checkedResult.count ? `~${checkedResult.count}` : 0,
    ignored: ignoredResult.count ?? 0,
    new: newResult.count ?? 0,
    taskCreated: taskResult.count ?? 0,
    today: todayResult.count ?? 0
  };
}

async function fetchLastCheck(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from("biznisoft_stock_price_current")
    .select("last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return (data?.last_seen_at as string | undefined) ?? null;
}

function attachArticle(change: BizniSoftPriceChange, articles: Map<number, BizniSoftArticle>): BizniSoftPriceChangeWithArticle {
  const article = articles.get(change.article_id);

  return {
    ...change,
    article_barcode: change.barcode ?? article?.barcode ?? null,
    article_code: article?.article_code ?? null,
    article_name: change.name ?? article?.name ?? null
  };
}

function groupChanges(changes: BizniSoftPriceChangeWithArticle[], storesByStorageId: Map<number, Store>) {
  const groups = new Map<string, ChangeGroup>();

  for (const change of changes) {
    const group = groups.get(change.storage_key) ?? {
      changes: [],
      label: storageLabel(change.storage_key, storesByStorageId),
      storageKey: change.storage_key
    };
    group.changes.push(change);
    groups.set(change.storage_key, group);
  }

  return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label, "sr"));
}

function storageLabel(storageKey: string, storesByStorageId: Map<number, Store>) {
  if (storageKey === "ALL") return "Sve radnje";

  const storageId = Number(storageKey);
  if (!Number.isFinite(storageId)) return `Nepoznat objekat (StorageID: ${storageKey})`;

  return storesByStorageId.get(storageId)?.name ?? `Nepoznat objekat (StorageID: ${storageId})`;
}

function storesByBizniSoftStorageId(stores: Store[]) {
  return new Map(
    stores
      .map((store) => {
        const storageId = store.biznisoft_storage_id ?? storageIdFromStoreName(store.name);
        return storageId ? ([storageId, store] as const) : null;
      })
      .filter((entry): entry is readonly [number, Store] => entry !== null)
  );
}

function storageIdFromStoreName(name: string) {
  const match = name.match(/Radnja\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function direction(change: BizniSoftPriceChangeWithArticle) {
  const oldPrice = change.old_retail_price ?? 0;
  const newPrice = change.new_retail_price ?? 0;
  return newPrice >= oldPrice ? "Poskupljenje" : "Pojeftinjenje";
}

function articleName(change: BizniSoftPriceChangeWithArticle) {
  return change.article_name ?? `Nepoznat artikal (ID: ${change.article_id})`;
}

function formatRsd(value: number | null) {
  if (value === null) return "-";
  return value.toLocaleString("sr-RS", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
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
