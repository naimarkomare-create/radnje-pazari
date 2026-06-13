import Link from "next/link";
import { BizniSoftActionButtons } from "@/app/admin/biznisoft-akcije/BizniSoftActionButtons";
import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/auth";
import {
  actionStatusFromDates,
  formatDateTime,
  getSaleActionName,
  groupSaleActions,
  statusClass,
  storageIdFromStoreName,
  storageLabel
} from "@/lib/biznisoft/groups";
import { todayInBelgrade } from "@/lib/date";
import { PRODUCE_STORE_NAMES, sortProduceStores } from "@/lib/produce";
import { createClient } from "@/lib/supabase/server";
import type { BizniSoftSaleActionWithArticle, Store } from "@/lib/types";

export default async function AdminBizniSoftActionsPage({
  searchParams
}: {
  searchParams: { storage_scope?: string; storage_id?: string; active_today?: string; loyalty?: string; show_finished?: string };
}) {
  await requireAdmin();
  const supabase = createClient();
  const today = todayInBelgrade();
  const selectedStorageScope = typeof searchParams.storage_scope === "string" ? searchParams.storage_scope : "";
  const selectedStorage = typeof searchParams.storage_id === "string" ? searchParams.storage_id : "";
  const selectedLoyalty = typeof searchParams.loyalty === "string" ? searchParams.loyalty : "";
  const activeToday = searchParams.active_today === "1";
  const showFinished = searchParams.show_finished === "1";
  const storesResult = await supabase
    .from("stores")
    .select("id, name, latitude, longitude, address, created_at")
    .in("name", [...PRODUCE_STORE_NAMES]);
  let query = supabase
    .from("biznisoft_sale_actions_with_articles")
    .select("*")
    .order("from_chapter", { ascending: true, nullsFirst: false })
    .limit(1000);

  if (selectedStorageScope === "global") query = query.is("storage_id", null);
  if (selectedStorageScope === "store" && selectedStorage) query = query.eq("storage_id", Number(selectedStorage));
  if (selectedLoyalty === "loyalty") query = query.gt("loyalty_level", 0);
  if (selectedLoyalty === "normal") query = query.or("loyalty_level.is.null,loyalty_level.eq.0");

  if (activeToday) {
    const { start, end } = dayRange(today);
    query = query.lte("from_chapter", end).gte("chapter_to", start);
  } else if (!showFinished) {
    const { start } = dayRange(today);
    query = query.or(`chapter_to.is.null,chapter_to.gte.${start}`);
  }

  const actionsResult = await query;
  const rows = (actionsResult.data ?? []) as unknown as BizniSoftSaleActionWithArticle[];
  const stores = sortProduceStores((storesResult.data ?? []) as Store[]);
  const groups = groupSaleActions(rows);
  const error = storesResult.error?.message ?? actionsResult.error?.message;

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
        <SaleActionGroups groups={groups} stores={stores} today={today} />
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
              if (storageId === null) return null;

              return (
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

function SaleActionGroups({
  groups,
  stores,
  today
}: {
  groups: ReturnType<typeof groupSaleActions>;
  stores: Store[];
  today: string;
}) {
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
                  <Td>{group.rows.length}</Td>
                  <Td>
                    <span className={statusClass(status)}>{status}</span>
                  </Td>
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

function saleActionDisplayName(group: ReturnType<typeof groupSaleActions>[number], storesByStorageId: Map<number, Store>) {
  const first = group.rows[0];
  const rawName = first ? getSaleActionName(first) : null;
  if (rawName) return rawName;

  const base = group.loyalty_level > 0 ? "Loyalty akcija" : "Prodajna akcija";
  const period = `${formatDateTime(group.from_chapter)} - ${formatDateTime(group.chapter_to)}`;
  const store = storageLabel(group.storage_id, storesByStorageId);
  return `${base} | ${period} | ${store} | ${group.rows.length} artikala`;
}

function dayRange(date: string) {
  const next = nextDate(date);
  return {
    end: `${next}T00:00:00+01:00`,
    start: `${date}T00:00:00+01:00`
  };
}

function nextDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-slate-200 px-3 py-2 font-bold text-slate-700">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-700">{children}</td>;
}
