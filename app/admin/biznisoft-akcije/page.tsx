import Link from "next/link";
import { BizniSoftActionButtons } from "@/app/admin/biznisoft-akcije/BizniSoftActionButtons";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { requireAdmin } from "@/lib/auth";
import {
  actionStatusFromDates,
  formatDateTime,
  saleActionGroupKeyFromParts,
  statusClass,
  storageIdFromStoreName,
  storageLabel
} from "@/lib/biznisoft/groups";
import { todayInBelgrade } from "@/lib/date";
import { PRODUCE_STORE_NAMES, sortProduceStores } from "@/lib/produce";
import { createClient } from "@/lib/supabase/server";
import type { Store } from "@/lib/types";

type PageSearchParams = {
  active_today?: string;
  loyalty?: string;
  page?: string;
  show_finished?: string;
  storage_id?: string;
  storage_scope?: string;
};

type SaleActionGroupSummary = {
  action_type: number;
  storage_id: number | null;
  from_chapter: string | null;
  chapter_to: string | null;
  loyalty_level: number;
  priority_level: number;
  sale_action_name: string | null;
  item_count: number;
  article_count: number;
  resolved_article_count: number;
  groupKey: string;
};

const PAGE_SIZE = 20;

export default async function AdminBizniSoftActionsPage({ searchParams }: { searchParams: PageSearchParams }) {
  await requireAdmin();
  const supabase = createClient();
  const today = todayInBelgrade();
  const selectedStorageScope = searchParams.storage_scope ?? "";
  const selectedStorage = searchParams.storage_id ?? "";
  const selectedLoyalty = searchParams.loyalty ?? "";
  const activeToday = searchParams.active_today === "1";
  const showFinished = searchParams.show_finished === "1";
  const page = positiveInteger(searchParams.page, 1);

  let groupsQuery = supabase
    .from("biznisoft_sale_action_groups")
    .select(
      "action_type, storage_id, from_chapter, chapter_to, loyalty_level, priority_level, sale_action_name, item_count, article_count, resolved_article_count",
      { count: "exact" }
    )
    .order("from_chapter", { ascending: true, nullsFirst: false });

  if (selectedStorageScope === "global") groupsQuery = groupsQuery.is("storage_id", null);
  if (selectedStorageScope === "store" && selectedStorage) groupsQuery = groupsQuery.eq("storage_id", Number(selectedStorage));
  if (selectedLoyalty === "loyalty") groupsQuery = groupsQuery.gt("loyalty_level", 0);
  if (selectedLoyalty === "normal") groupsQuery = groupsQuery.eq("loyalty_level", 0);

  if (activeToday) {
    const { start, end } = dayRange(today);
    groupsQuery = groupsQuery.lte("from_chapter", end).gte("chapter_to", start);
  } else if (!showFinished) {
    const { start } = dayRange(today);
    groupsQuery = groupsQuery.or(`chapter_to.is.null,chapter_to.gte.${start}`);
  }

  const from = (page - 1) * PAGE_SIZE;
  const [storesResult, groupsResult] = await Promise.all([
    supabase.from("stores").select("id, name").in("name", [...PRODUCE_STORE_NAMES]),
    groupsQuery.range(from, from + PAGE_SIZE - 1)
  ]);
  const stores = sortProduceStores((storesResult.data ?? []) as Store[]);
  const groups = ((groupsResult.data ?? []) as Omit<SaleActionGroupSummary, "groupKey">[]).map((group) => ({
    ...group,
    article_count: Number(group.article_count),
    groupKey: saleActionGroupKeyFromParts(group),
    item_count: Number(group.item_count),
    resolved_article_count: Number(group.resolved_article_count)
  }));
  const totalCount = groupsResult.count ?? groups.length;
  const error = storesResult.error?.message ?? groupsResult.error?.message;

  return (
    <>
      <PageHeader eyebrow="Admin pregled" title="BizniSoft akcije" />
      <div className="page-content">
        <BizniSoftActionButtons />
        <ActionFilters
          activeToday={activeToday}
          selectedLoyalty={selectedLoyalty}
          selectedStorage={selectedStorage}
          selectedStorageScope={selectedStorageScope}
          showFinished={showFinished}
          stores={stores}
        />
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <p className="text-sm text-slate-600">Ukupno grupa za izabrane filtere: {totalCount}</p>
        <SaleActionGroups groups={groups} stores={stores} today={today} />
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          pathname="/admin/biznisoft-akcije"
          searchParams={searchParams}
          totalCount={totalCount}
        />
      </div>
    </>
  );
}

function ActionFilters({
  activeToday,
  selectedLoyalty,
  selectedStorageScope,
  selectedStorage,
  showFinished,
  stores
}: {
  activeToday: boolean;
  selectedLoyalty: string;
  selectedStorageScope: string;
  selectedStorage: string;
  showFinished: boolean;
  stores: Store[];
}) {
  return (
    <form className="interactive-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm" method="get">
      <h2 className="text-lg font-bold text-ink">Filteri</h2>
      <div className="mt-4 grid gap-4 md:grid-cols-4">
        <label className="field">
          <span className="label">Tip akcije po radnji</span>
          <select className="input" defaultValue={selectedStorageScope} name="storage_scope">
            <option value="">Sve radnje / globalne akcije</option>
            <option value="global">Samo globalne akcije</option>
            <option value="store">Po konkretnoj radnji</option>
          </select>
        </label>
        <label className="field">
          <span className="label">Radnja / StorageID</span>
          <select className="input" defaultValue={selectedStorage} name="storage_id">
            <option value="">Izaberite radnju</option>
            {stores.map((store) => {
              const storageId = storageIdFromStoreName(store.name);
              return storageId === null ? null : (
                <option key={store.id} value={storageId}>
                  {store.name}
                </option>
              );
            })}
          </select>
        </label>
        <label className="field">
          <span className="label">Loyalty</span>
          <select className="input" defaultValue={selectedLoyalty} name="loyalty">
            <option value="">Loyalty / obične akcije</option>
            <option value="loyalty">Samo loyalty akcije</option>
            <option value="normal">Samo obične akcije</option>
          </select>
        </label>
        <div className="grid gap-2">
          <label className="flex items-center gap-3 rounded-md bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
            <input defaultChecked={activeToday} name="active_today" type="checkbox" value="1" />
            Aktivne danas
          </label>
          <label className="flex items-center gap-3 rounded-md bg-slate-50 px-3 py-3 text-sm font-semibold text-slate-700">
            <input defaultChecked={showFinished} name="show_finished" type="checkbox" value="1" />
            Prikaži završene
          </label>
        </div>
      </div>
      <button className="button-secondary mt-4" type="submit">
        Primeni filtere
      </button>
    </form>
  );
}

function SaleActionGroups({ groups, stores, today }: { groups: SaleActionGroupSummary[]; stores: Store[]; today: string }) {
  if (groups.length === 0) {
    return <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">Nema akcija za izabrane filtere.</p>;
  }

  const storesByStorageId = new Map(
    stores.map((store) => [storageIdFromStoreName(store.name), store]).filter((entry): entry is [number, Store] => entry[0] !== null)
  );

  return (
    <section className="interactive-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead>
            <tr>
              <Th>Naziv akcije</Th>
              <Th>Radnja / Sve radnje</Th>
              <Th>Period</Th>
              <Th>Broj artikala</Th>
              <Th>Status</Th>
              <Th>Akcija</Th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const status = actionStatusFromDates({ chapter_to: group.chapter_to, from_chapter: group.from_chapter, today });
              return (
                <tr key={group.groupKey}>
                  <Td>{saleActionDisplayName(group, storesByStorageId)}</Td>
                  <Td>{storageLabel(group.storage_id, storesByStorageId)}</Td>
                  <Td>{`${formatDateTime(group.from_chapter)} - ${formatDateTime(group.chapter_to)}`}</Td>
                  <Td>
                    {group.item_count}
                    <span className="block text-xs text-slate-500">Nazivi: {group.resolved_article_count}/{group.article_count}</span>
                  </Td>
                  <Td><span className={statusClass(status)}>{status}</span></Td>
                  <Td>
                    <Link className="button-secondary" href={`/admin/biznisoft-akcije/${encodeURIComponent(group.groupKey)}`}>
                      Otvori akciju
                    </Link>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function saleActionDisplayName(group: SaleActionGroupSummary, storesByStorageId: Map<number, Store>) {
  if (group.sale_action_name) return group.sale_action_name;
  const base = group.loyalty_level > 0 ? "Loyalty akcija" : "Prodajna akcija";
  const period = `${formatDateTime(group.from_chapter)} - ${formatDateTime(group.chapter_to)}`;
  return `${base} | ${period} | ${storageLabel(group.storage_id, storesByStorageId)} | ${group.item_count} artikala`;
}

function dayRange(date: string) {
  return { end: `${nextDate(date)}T00:00:00+01:00`, start: `${date}T00:00:00+01:00` };
}

function nextDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-slate-200 px-3 py-2 font-bold text-slate-700">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-700">{children}</td>;
}
