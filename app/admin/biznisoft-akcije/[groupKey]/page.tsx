import Link from "next/link";
import { CreateGroupTaskButton } from "@/app/admin/biznisoft-akcije/[groupKey]/CreateGroupTaskButton";
import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/auth";
import {
  actionStatusFromDates,
  articleText,
  formatDateTime,
  parseSaleActionGroupKey,
  statusClass,
  storageIdFromStoreName,
  storageLabel
} from "@/lib/biznisoft/groups";
import { todayInBelgrade } from "@/lib/date";
import { PRODUCE_STORE_NAMES, sortProduceStores } from "@/lib/produce";
import { createClient } from "@/lib/supabase/server";
import type { BizniSoftSaleActionWithArticle, Store } from "@/lib/types";

export default async function BizniSoftActionDetailPage({
  params,
  searchParams
}: {
  params: { groupKey: string };
  searchParams: { q?: string };
}) {
  await requireAdmin();
  const supabase = createClient();
  const decodedGroupKey = safeDecode(params.groupKey);
  const parts = parseSaleActionGroupKey(decodedGroupKey);
  const today = todayInBelgrade();
  const search = typeof searchParams.q === "string" ? searchParams.q.trim() : "";
  const storesResult = await supabase
    .from("stores")
    .select("id, name, latitude, longitude, address, created_at")
    .in("name", [...PRODUCE_STORE_NAMES]);
  const stores = sortProduceStores((storesResult.data ?? []) as Store[]);
  let rows: BizniSoftSaleActionWithArticle[] = [];
  let error = storesResult.error?.message;

  if (!parts) {
    error = error ?? "Akcija nije ispravna.";
  } else {
    let query = supabase
      .from("biznisoft_sale_actions_with_articles")
      .select("*")
      .eq("action_type", parts.action_type)
      .order("article_name", { ascending: true, nullsFirst: false });

    query = parts.storage_id === null ? query.is("storage_id", null) : query.eq("storage_id", parts.storage_id);
    query = parts.from_chapter === null ? query.is("from_chapter", null) : query.eq("from_chapter", parts.from_chapter);
    query = parts.chapter_to === null ? query.is("chapter_to", null) : query.eq("chapter_to", parts.chapter_to);

    const rowsResult = await query;
    rows = ((rowsResult.data ?? []) as unknown as BizniSoftSaleActionWithArticle[]).filter(
      (row) => (row.loyalty_level ?? 0) === parts.loyalty_level && (row.priority_level ?? 0) === parts.priority_level
    );
    error = error ?? rowsResult.error?.message;
  }

  const filteredRows = filterRows(rows, search);

  return (
    <>
      <PageHeader eyebrow="BizniSoft akcije" title="Detalji akcije" />
      <div className="page-content">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link className="button-secondary w-fit" href="/admin/biznisoft-akcije">
            Nazad na akcije
          </Link>
          <CreateGroupTaskButton groupKey={decodedGroupKey} />
        </div>
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {rows.length > 0 ? (
          <>
            <ActionHeader rows={rows} stores={stores} today={today} />
            <SearchBox search={search} />
            <ArticleTable rows={filteredRows} stores={stores} />
          </>
        ) : !error ? (
          <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">Akcija nije pronađena.</p>
        ) : null}
      </div>
    </>
  );
}

function ActionHeader({ rows, stores, today }: { rows: BizniSoftSaleActionWithArticle[]; stores: Store[]; today: string }) {
  const first = rows[0];
  const storesByStorageId = storesByStorageIdMap(stores);
  const status = actionStatusFromDates({ chapter_to: first.chapter_to, from_chapter: first.from_chapter, today });

  return (
    <section className="interactive-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Info label="Radnja" value={storageLabel(first.storage_id, storesByStorageId)} />
        <Info label="Period OD" value={formatDateTime(first.from_chapter)} />
        <Info label="Period DO" value={formatDateTime(first.chapter_to)} />
        <Info label="Loyalty level" value={String(first.loyalty_level ?? 0)} />
        <Info label="Ukupno artikala" value={String(rows.length)} />
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Status</p>
          <p className="mt-1">
            <span className={statusClass(status)}>{status}</span>
          </p>
        </div>
      </div>
    </section>
  );
}

function SearchBox({ search }: { search: string }) {
  return (
    <form className="interactive-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm" method="get">
      <label className="field">
        <span className="label">Pretraga artikala</span>
        <input className="input" defaultValue={search} name="q" placeholder="Naziv, barkod ili ArticleID" />
      </label>
      <button className="button-secondary mt-3" type="submit">
        Pretraži
      </button>
    </form>
  );
}

function ArticleTable({ rows, stores }: { rows: BizniSoftSaleActionWithArticle[]; stores: Store[] }) {
  if (rows.length === 0) {
    return <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">Nema artikala za pretragu.</p>;
  }

  const storesByStorageId = storesByStorageIdMap(stores);

  return (
    <section className="interactive-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead>
            <tr>
              <Th>Barkod</Th>
              <Th>Šifra artikla / ArticleID</Th>
              <Th>Naziv artikla</Th>
              <Th>Stara cena / Redovna cena</Th>
              <Th>Nova akcijska cena</Th>
              <Th>Period OD</Th>
              <Th>Period DO</Th>
              <Th>Radnja / Sve radnje</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const raw = saleActionRaw(row);
              const article = articleText(row);
              const articleRaw = row.article_raw ?? {};
              const barcode =
                article.barcode !== "-"
                  ? article.barcode
                  : firstText(
                      rawText(raw, "Barcode", "BarCode", "Barkod", "EAN"),
                      rawText(articleRaw, "Barcode", "BarCode", "Barkod", "EAN")
                    );
              const rawArticleName = firstText(
                rawText(raw, "ArticleName", "Naziv", "NazivArtikla", "Naziv artikla"),
                rawText(articleRaw, "ArticleName", "Name", "Naziv", "NazivArtikla")
              );
              const articleName =
                article.name.startsWith("Nepoznat artikal") || article.name === "Akcija po atributu/grupi"
                  ? rawArticleName
                  : article.name;

              return (
                <tr key={row.id}>
                  <Td>{barcode}</Td>
                  <Td>{article.id}</Td>
                  <Td>{articleName === "-" ? article.name : articleName}</Td>
                  <Td>{formatRsd(oldRegularPrice(row, raw))}</Td>
                  <Td>{formatRsd(row.retail_price)}</Td>
                  <Td>{formatDateTime(row.from_chapter)}</Td>
                  <Td>{formatDateTime(row.chapter_to)}</Td>
                  <Td>{storageLabel(row.storage_id, storesByStorageId)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function filterRows(rows: BizniSoftSaleActionWithArticle[], search: string) {
  if (!search) return rows;

  const query = search.toLowerCase();
  return rows.filter((row) => {
    const haystack = [
      row.article_id,
      row.article_code,
      row.article_name,
      row.article_barcode,
      row.article_cat_no,
      row.article_attribute_id
    ]
      .filter((value) => value !== null && value !== undefined)
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });
}

function storesByStorageIdMap(stores: Store[]) {
  return new Map(
    stores.map((store) => [storageIdFromStoreName(store.name), store]).filter((entry): entry is [number, Store] => entry[0] !== null)
  );
}

function saleActionRaw(row: BizniSoftSaleActionWithArticle) {
  const candidate = row as BizniSoftSaleActionWithArticle & {
    sale_action_raw?: Record<string, unknown> | null;
  };

  return candidate.sale_action_raw ?? row.raw ?? {};
}

function oldRegularPrice(row: BizniSoftSaleActionWithArticle, raw: Record<string, unknown> | null | undefined) {
  const candidate = row as BizniSoftSaleActionWithArticle & {
    old_regular_price?: unknown;
    regular_price?: unknown;
  };

  // TODO: Fill this from the future regular MP price snapshot sync. Do not use WholesalePrice as the old retail price.
  return candidate.old_regular_price ?? candidate.regular_price ?? readRaw(raw, "old_regular_price") ?? readRaw(raw, "regular_price");
}

function formatRsd(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";

  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const number = Number(normalized);

  if (!Number.isFinite(number)) return "-";

  return number.toLocaleString("sr-RS", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  });
}

function rawText(raw: Record<string, unknown> | null | undefined, ...fields: string[]) {
  for (const field of fields) {
    const value = readRaw(raw, field);
    if (value !== null && value !== undefined && value !== "") return String(value);
  }

  return "-";
}

function firstText(...values: string[]) {
  return values.find((value) => value !== "-") ?? "-";
}

function readRaw(raw: Record<string, unknown> | null | undefined, field: string) {
  if (!raw || typeof raw !== "object") return undefined;

  const direct = raw[field];
  if (direct !== undefined) return direct;

  const lowerField = field.toLowerCase();
  const entry = Object.entries(raw).find(([key]) => key.toLowerCase() === lowerField);
  return entry?.[1];
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-ink">{value}</p>
    </div>
  );
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-slate-200 px-3 py-2 font-bold text-slate-700">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-700">{children}</td>;
}
