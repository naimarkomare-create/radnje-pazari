import { getBizniSoftCredentials, getItems, getSessionHandle } from "@/lib/biznisoft/soap-client";
import { todayInBelgrade } from "@/lib/date";
import { PRODUCE_STORE_NAMES, sortProduceStores } from "@/lib/produce";
import { createServiceClient } from "@/lib/supabase/service";
import type { Store } from "@/lib/types";

type BizniSoftRawRow = Record<string, unknown>;

type StockPriceRow = {
  storage_key: string;
  storage_id: number | null;
  article_id: number;
  name: string | null;
  barcode: string | null;
  unit: string | null;
  amount: number | null;
  wholesale_price: number | null;
  retail_price: number | null;
  modify_time: string | null;
  raw: BizniSoftRawRow;
};

type CurrentStockPriceRow = StockPriceRow & {
  last_seen_at: string;
};

type MappedStore = Store & {
  resolvedStorageId: number | null;
};

export type BizniSoftStockPriceSyncResult = {
  stores_checked: number;
  rows_fetched_total: number;
  snapshot_rows_inserted: number;
  baseline_rows_inserted: number;
  price_changes_created: number;
  current_rows_updated: number;
  skipped_stores_count: number;
  errors_count: number;
  snapshot_run_id: string;
};

const STOCK_ITEM_TYPE = "itArticlesOnStock";
const STOCK_LIMIT = 30_000;
const STORE_SYNC_CONCURRENCY = 2;

export async function syncBiznisoftStockPrices(): Promise<BizniSoftStockPriceSyncResult> {
  const credentials = getBizniSoftCredentials();
  const sessionHandle = await getSessionHandle(credentials);
  const stores = await fetchMappedStores();
  const mappedStores = stores.filter((store) => store.resolvedStorageId !== null);
  const snapshotRunId = crypto.randomUUID();
  const totals: BizniSoftStockPriceSyncResult = {
    baseline_rows_inserted: 0,
    current_rows_updated: 0,
    errors_count: 0,
    price_changes_created: 0,
    rows_fetched_total: 0,
    skipped_stores_count: stores.length - mappedStores.length,
    snapshot_rows_inserted: 0,
    snapshot_run_id: snapshotRunId,
    stores_checked: 0
  };

  await runWithConcurrency(mappedStores, STORE_SYNC_CONCURRENCY, async (store) => {
    try {
      const result = await syncStoreStockPrices({
        credentials,
        sessionHandle,
        snapshotRunId,
        storageId: store.resolvedStorageId as number
      });

      totals.baseline_rows_inserted += result.baseline_rows_inserted;
      totals.current_rows_updated += result.current_rows_updated;
      totals.price_changes_created += result.price_changes_created;
      totals.rows_fetched_total += result.rows_fetched_total;
      totals.snapshot_rows_inserted += result.snapshot_rows_inserted;
      totals.stores_checked += 1;
    } catch {
      totals.errors_count += 1;
    }
  });

  return totals;
}

async function syncStoreStockPrices({
  credentials,
  sessionHandle,
  snapshotRunId,
  storageId
}: {
  credentials: ReturnType<typeof getBizniSoftCredentials>;
  sessionHandle: string;
  snapshotRunId: string;
  storageId: number;
}) {
  const now = new Date().toISOString();
  const today = todayInBelgrade();
  const stockJson = await getItems({
    itemType: STOCK_ITEM_TYPE,
    jsonGetItemsRequest: JSON.stringify({
      StorageID: storageId,
      xsicChangesFromDate: "2000-01-01 00:00:00",
      xsicMobSortOnly: false,
      xsicNotBookedInvoices: false
    }),
    limit: STOCK_LIMIT,
    sessionHandle,
    soapUrl: credentials.soapUrl
  });
  const normalizedRows = flattenBizniSoftRows(parseBizniSoftJson(stockJson))
    .map((row) => normalizeStockPriceRow(row, storageId))
    .filter((row): row is StockPriceRow => row !== null);
  const rows = Array.from(new Map(normalizedRows.map((row) => [row.article_id, row])).values());
  const currentByArticle = await fetchCurrentRowsForStorage(String(storageId));
  const baselineRows: StockPriceRow[] = [];
  const changedRows: Array<{ old: CurrentStockPriceRow; next: StockPriceRow }> = [];
  const unchangedRows: StockPriceRow[] = [];

  for (const row of rows) {
    const current = currentByArticle.get(row.article_id);

    if (!current) {
      baselineRows.push(row);
      continue;
    }

    if (!samePrice(current.retail_price, row.retail_price)) {
      changedRows.push({ old: current, next: row });
    } else {
      unchangedRows.push(row);
    }
  }

  await upsertInChunks(
    "biznisoft_stock_price_snapshots",
    rows.map((row) => ({
      ...row,
      snapshot_at: now,
      snapshot_date: today,
      snapshot_run_id: snapshotRunId,
      synced_at: now
    })),
    "snapshot_run_id,storage_key,article_id"
  );

  if (changedRows.length > 0) {
    await upsertInChunks(
      "biznisoft_price_changes",
      changedRows.map(({ old, next }) => ({
        amount: next.amount,
        article_id: next.article_id,
        barcode: next.barcode,
        change_date: today,
        detected_at: now,
        name: next.name,
        new_retail_price: next.retail_price,
        new_wholesale_price: next.wholesale_price,
        old_retail_price: old.retail_price,
        old_wholesale_price: old.wholesale_price,
        raw_new: next.raw,
        raw_old: old.raw ?? {},
        source_key: stockPriceChangeSourceKey({
          articleId: next.article_id,
          modifyTime: next.modify_time,
          newRetailPrice: next.retail_price,
          oldRetailPrice: old.retail_price,
          storageKey: next.storage_key
        }),
        status: "new",
        storage_id: next.storage_id,
        storage_key: next.storage_key,
        task_created: false
      })),
      "source_key"
    );
  }

  await upsertInChunks(
    "biznisoft_stock_price_current",
    [...baselineRows, ...changedRows.map((row) => row.next), ...unchangedRows].map((row) => ({
      ...row,
      last_seen_at: now
    })),
    "storage_key,article_id"
  );

  return {
    baseline_rows_inserted: baselineRows.length,
    current_rows_updated: changedRows.length + unchangedRows.length,
    price_changes_created: changedRows.length,
    rows_fetched_total: rows.length,
    snapshot_rows_inserted: rows.length
  };
}

async function fetchMappedStores() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, biznisoft_storage_id, latitude, longitude, address, created_at")
    .in("name", [...PRODUCE_STORE_NAMES]);

  if (error) throw new Error(error.message);

  return sortProduceStores((data ?? []) as Store[]).map((store) => ({
    ...store,
    resolvedStorageId: store.biznisoft_storage_id ?? storageIdFromStoreName(store.name)
  })) satisfies MappedStore[];
}

async function fetchCurrentRowsForStorage(storageKey: string) {
  const supabase = createServiceClient();
  const rows: CurrentStockPriceRow[] = [];

  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("biznisoft_stock_price_current")
      .select("storage_key, storage_id, article_id, name, barcode, unit, amount, wholesale_price, retail_price, modify_time, raw, last_seen_at")
      .eq("storage_key", storageKey)
      .range(from, from + 999);

    if (error) throw new Error(error.message);

    rows.push(...((data ?? []) as CurrentStockPriceRow[]));
    if (!data || data.length < 1000) break;
  }

  return new Map(rows.map((row) => [row.article_id, row]));
}

async function upsertInChunks(table: string, rows: Record<string, unknown>[], onConflict: string) {
  if (rows.length === 0) return;

  const supabase = createServiceClient();

  for (let index = 0; index < rows.length; index += 1000) {
    const { error } = await supabase.from(table).upsert(rows.slice(index, index + 1000), { onConflict });
    if (error) throw new Error(error.message);
  }
}

function normalizeStockPriceRow(raw: BizniSoftRawRow, fallbackStorageId: number): StockPriceRow | null {
  const articleId = toInteger(readField(raw, "ID"));
  const storageId = toInteger(readField(raw, "StorageID")) ?? fallbackStorageId;

  if (articleId === null) return null;

  return {
    amount: toNumber(readField(raw, "Amount")),
    article_id: articleId,
    barcode: toText(readField(raw, "Barcode")),
    modify_time: toIsoDateTime(readField(raw, "ModifyTime")),
    name: toText(readField(raw, "Name")),
    raw,
    retail_price: toNumber(readField(raw, "RetailPrice")),
    storage_id: storageId,
    storage_key: storageId === null ? "ALL" : String(storageId),
    unit: toText(readField(raw, "Unit")),
    wholesale_price: toNumber(readField(raw, "WholesalePrice"))
  };
}

function parseBizniSoftJson(value: string) {
  if (!value) return [];

  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

function flattenBizniSoftRows(value: unknown): BizniSoftRawRow[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.flat(Infinity).filter((row): row is BizniSoftRawRow => Boolean(row) && typeof row === "object" && !Array.isArray(row));
  }
  if (typeof value === "object") return [value as BizniSoftRawRow];
  return [];
}

function readField(raw: BizniSoftRawRow, field: string) {
  const direct = raw[field];
  if (direct !== undefined) return direct;

  const lowerField = field.toLowerCase();
  return Object.entries(raw).find(([key]) => key.toLowerCase() === lowerField)?.[1];
}

function toInteger(value: unknown) {
  const number = toNumber(value);
  if (number === null || !Number.isInteger(number)) return null;
  return number;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const normalized = typeof value === "string" ? value.replace(",", ".").trim() : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function toText(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function toIsoDateTime(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function samePrice(left: number | null, right: number | null) {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) < 0.0001;
}

function storageIdFromStoreName(name: string) {
  const match = name.match(/Radnja\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function stockPriceChangeSourceKey({
  articleId,
  modifyTime,
  newRetailPrice,
  oldRetailPrice,
  storageKey
}: {
  articleId: number;
  modifyTime: string | null;
  newRetailPrice: number | null;
  oldRetailPrice: number | null;
  storageKey: string;
}) {
  return `stock_price_change__${storageKey}__${articleId}__${pricePart(oldRetailPrice)}__${pricePart(newRetailPrice)}__${modifyTime ?? "NO_MODIFY_TIME"}`;
}

function pricePart(value: number | null) {
  return value === null ? "NULL" : String(value);
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let index = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  });

  await Promise.all(workers);
}
