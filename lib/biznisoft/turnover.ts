import "server-only";

import { getBizniSoftCredentials, getItems, getSessionHandle } from "@/lib/biznisoft/soap-client";
import type {
  BizniSoftTurnoverResult,
  BizniSoftTurnoverSnapshot
} from "@/lib/biznisoft/turnover-types";
import { todayInBelgrade } from "@/lib/date";
import { PRODUCE_STORE_NAMES } from "@/lib/produce";
import { createServiceClient } from "@/lib/supabase/service";

type RawRow = Record<string, unknown>;

type ConfiguredStore = {
  id: string;
  name: string;
  biznisoft_storage_id: number | null;
};

type TurnoverCacheRow = {
  business_date: string;
  payload: unknown;
  fetched_at: string | null;
  refresh_started_at: string | null;
};

export class TurnoverServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly publicMessage: string,
    public readonly status: number
  ) {
    super(publicMessage);
    this.name = "TurnoverServiceError";
  }
}

const TURNOVER_ITEM_TYPE = "itOperater_Sale_Report";
const TURNOVER_LIMIT = 1000;
const TODAY_FRESH_SECONDS = 25;
const COMPLETED_DATE_FRESH_SECONDS = 6 * 60 * 60;
const REFRESH_LOCK_SECONDS = 90;
const STORE_REQUEST_CONCURRENCY = 5;

export async function getBizniSoftTurnover({
  businessDate,
  force = false
}: {
  businessDate: string;
  force?: boolean;
}): Promise<BizniSoftTurnoverResult> {
  const supabase = createServiceClient();
  const freshForSeconds =
    businessDate === todayInBelgrade() ? TODAY_FRESH_SECONDS : COMPLETED_DATE_FRESH_SECONDS;
  const initialCache = await readCache(businessDate);
  const initialSnapshot = snapshotFromCache(initialCache);

  if (!force && initialSnapshot && isFresh(initialCache?.fetched_at, freshForSeconds)) {
    return resultFromSnapshot(initialSnapshot);
  }

  const { data: refreshToken, error: claimError } = await supabase.rpc(
    "claim_biznisoft_turnover_refresh",
    {
      p_business_date: businessDate,
      p_force: force,
      p_fresh_for_seconds: freshForSeconds,
      p_lock_for_seconds: REFRESH_LOCK_SECONDS
    }
  );

  if (claimError) {
    throw new TurnoverServiceError(
      "cache_unavailable",
      "Keš prometa nije dostupan. Proverite da li je Supabase migracija primenjena.",
      503
    );
  }

  if (!refreshToken || typeof refreshToken !== "string") {
    const currentCache = await readCache(businessDate);
    const currentSnapshot = snapshotFromCache(currentCache) ?? initialSnapshot;

    if (currentSnapshot) {
      return {
        ...currentSnapshot,
        refreshing: true,
        stale: !isFresh(currentCache?.fetched_at ?? initialCache?.fetched_at, freshForSeconds),
        warning: null
      };
    }

    throw new TurnoverServiceError(
      "refresh_in_progress",
      "Osvežavanje prometa je u toku. Pokušajte ponovo za nekoliko sekundi.",
      202
    );
  }

  try {
    const snapshot = await fetchTurnoverSnapshot(businessDate);
    const { data: completedRow, error: cacheWriteError } = await supabase
      .from("biznisoft_turnover_cache")
      .update({
        fetched_at: snapshot.fetchedAt,
        last_error_at: null,
        last_error_code: null,
        payload: snapshot,
        refresh_started_at: null,
        refresh_token: null,
        updated_at: new Date().toISOString()
      })
      .eq("business_date", businessDate)
      .eq("refresh_token", refreshToken)
      .select("business_date")
      .maybeSingle();

    if (cacheWriteError || !completedRow) {
      await releaseRefreshLock(businessDate, refreshToken, "cache_write_failed");
      console.error("BizniSoft turnover cache write failed.", { businessDate });

      return {
        ...snapshot,
        refreshing: false,
        stale: false,
        warning: "Promet je preuzet, ali deljeni keš trenutno nije ažuriran."
      };
    }

    return resultFromSnapshot(snapshot);
  } catch (error) {
    const errorCode = classifyTurnoverError(error);
    await releaseRefreshLock(businessDate, refreshToken, errorCode);
    console.error("BizniSoft turnover refresh failed.", { businessDate, errorCode });

    const fallbackCache = await readCache(businessDate);
    const fallbackSnapshot = snapshotFromCache(fallbackCache) ?? initialSnapshot;

    if (fallbackSnapshot) {
      return {
        ...fallbackSnapshot,
        refreshing: false,
        stale: true,
        warning:
          "BizniSoft trenutno nije dostupan. Prikazani su poslednji uspešno preuzeti podaci."
      };
    }

    throw new TurnoverServiceError(
      errorCode,
      publicMessageForError(errorCode),
      errorCode === "configuration" ? 503 : 502
    );
  }
}

async function fetchTurnoverSnapshot(
  businessDate: string
): Promise<BizniSoftTurnoverSnapshot> {
  const stores = await loadConfiguredStores();
  const mappedStores = stores.filter(
    (store): store is ConfiguredStore & { biznisoft_storage_id: number } =>
      Number.isInteger(store.biznisoft_storage_id)
  );
  const unmappedStores = stores.filter((store) => !Number.isInteger(store.biznisoft_storage_id));
  const warnings = unmappedStores.map(
    (store) => `Nije podešen BizniSoft StorageID za ${store.name}.`
  );

  if (mappedStores.length === 0) {
    throw new TurnoverServiceError(
      "configuration",
      "Nijedna radnja nema podešen BizniSoft StorageID.",
      503
    );
  }

  const credentials = getBizniSoftCredentials();
  const sessionHandle = await getSessionHandle(credentials);
  const storeResults = await mapWithConcurrency(
    mappedStores,
    STORE_REQUEST_CONCURRENCY,
    async (store) => {
      try {
        return {
          ok: true as const,
          storeId: store.id,
          amount: await fetchStoreTurnover({
            businessDate,
            sessionHandle,
            soapUrl: credentials.soapUrl,
            storageId: store.biznisoft_storage_id
          })
        };
      } catch (error) {
        return {
          ok: false as const,
          storeId: store.id,
          errorCode: classifyTurnoverError(error)
        };
      }
    }
  );
  const failures = storeResults.filter(
    (result): result is { ok: false; storeId: string; errorCode: string } => !result.ok
  );

  if (failures.length > 0) {
    const errorCode = failures.some((failure) => failure.errorCode === "timeout")
      ? "timeout"
      : failures[0].errorCode;
    throw new TurnoverServiceError(errorCode, publicMessageForError(errorCode), 502);
  }

  const amounts = storeResults.filter(
    (result): result is { ok: true; storeId: string; amount: number } => result.ok
  );
  const amountByStoreId = new Map(amounts.map((row) => [row.storeId, row.amount]));
  const storeRows = stores.map((store) => ({
    amount: amountByStoreId.get(store.id) ?? null,
    storeId: store.id,
    storeName: store.name,
    storeNumber: storeNumberFromName(store.name)
  }));

  return {
    businessDate,
    currency: "RSD",
    fetchedAt: new Date().toISOString(),
    mappingComplete: unmappedStores.length === 0,
    representedStores: storeRows.filter((store) => store.amount !== null).length,
    source: "biznisoft",
    stores: storeRows,
    total: roundCurrency(
      storeRows.reduce((sum, store) => sum + (store.amount === null ? 0 : store.amount), 0)
    ),
    warnings
  };
}

async function fetchStoreTurnover({
  businessDate,
  sessionHandle,
  soapUrl,
  storageId
}: {
  businessDate: string;
  sessionHandle: string;
  soapUrl: string;
  storageId: number;
}) {
  const rawJson = await getItems({
    itemType: TURNOVER_ITEM_TYPE,
    jsonGetItemsRequest: JSON.stringify({
      DateFrom: businessDate,
      DateTo: businessDate,
      StorageID: storageId
    }),
    limit: TURNOVER_LIMIT,
    sessionHandle,
    soapUrl
  });
  let parsed: unknown;

  try {
    parsed = rawJson ? JSON.parse(rawJson) : [];
  } catch {
    throw new Error("BizniSoft turnover response was not valid JSON.");
  }

  const rows = flattenRows(parsed);
  let total = 0;

  for (const row of rows) {
    const returnedStorageId = toInteger(readField(row, "StorageID"));
    const rowTotal = toNumber(readField(row, "Total"));

    if (returnedStorageId !== storageId || rowTotal === null) {
      throw new Error("BizniSoft turnover response contained invalid store totals.");
    }

    total += rowTotal;
  }

  return roundCurrency(total);
}

async function loadConfiguredStores() {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, biznisoft_storage_id")
    .in("name", [...PRODUCE_STORE_NAMES]);

  if (error) {
    throw new TurnoverServiceError(
      "cache_unavailable",
      "Podaci o radnjama trenutno nisu dostupni.",
      503
    );
  }

  const storesByName = new Map(
    ((data ?? []) as ConfiguredStore[]).map((store) => [store.name, store])
  );
  const missingStore = PRODUCE_STORE_NAMES.find((name) => !storesByName.has(name));

  if (missingStore) {
    throw new TurnoverServiceError(
      "configuration",
      `Radnja ${missingStore} nije pronađena u konfiguraciji.`,
      503
    );
  }

  return PRODUCE_STORE_NAMES.map((name) => storesByName.get(name) as ConfiguredStore);
}

async function readCache(businessDate: string) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("biznisoft_turnover_cache")
    .select("business_date, payload, fetched_at, refresh_started_at")
    .eq("business_date", businessDate)
    .maybeSingle();

  if (error) {
    throw new TurnoverServiceError(
      "cache_unavailable",
      "Keš prometa nije dostupan. Proverite da li je Supabase migracija primenjena.",
      503
    );
  }

  return (data as TurnoverCacheRow | null) ?? null;
}

async function releaseRefreshLock(
  businessDate: string,
  refreshToken: string,
  errorCode: string
) {
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("biznisoft_turnover_cache")
    .update({
      last_error_at: new Date().toISOString(),
      last_error_code: errorCode,
      refresh_started_at: null,
      refresh_token: null,
      updated_at: new Date().toISOString()
    })
    .eq("business_date", businessDate)
    .eq("refresh_token", refreshToken);

  if (error) {
    console.error("BizniSoft turnover refresh lock release failed.", { businessDate });
  }
}

function snapshotFromCache(row: TurnoverCacheRow | null) {
  return isTurnoverSnapshot(row?.payload) ? row.payload : null;
}

function isTurnoverSnapshot(value: unknown): value is BizniSoftTurnoverSnapshot {
  if (!value || typeof value !== "object") return false;

  const snapshot = value as Partial<BizniSoftTurnoverSnapshot>;
  return (
    typeof snapshot.businessDate === "string" &&
    snapshot.currency === "RSD" &&
    typeof snapshot.total === "number" &&
    Array.isArray(snapshot.stores) &&
    typeof snapshot.representedStores === "number" &&
    typeof snapshot.mappingComplete === "boolean" &&
    typeof snapshot.fetchedAt === "string" &&
    snapshot.source === "biznisoft" &&
    Array.isArray(snapshot.warnings)
  );
}

function resultFromSnapshot(snapshot: BizniSoftTurnoverSnapshot): BizniSoftTurnoverResult {
  return {
    ...snapshot,
    refreshing: false,
    stale: false,
    warning: snapshot.warnings.length > 0 ? snapshot.warnings.join(" ") : null
  };
}

function isFresh(fetchedAt: string | null | undefined, freshForSeconds: number) {
  if (!fetchedAt) return false;

  const fetchedAtMs = Date.parse(fetchedAt);
  return Number.isFinite(fetchedAtMs) && Date.now() - fetchedAtMs < freshForSeconds * 1000;
}

function flattenRows(value: unknown): RawRow[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flat(Infinity)
      .filter(
        (row): row is RawRow =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row)
      );
  }
  return typeof value === "object" ? [value as RawRow] : [];
}

function readField(row: RawRow, field: string) {
  if (row[field] !== undefined) return row[field];

  const lowerField = field.toLowerCase();
  return Object.entries(row).find(([key]) => key.toLowerCase() === lowerField)?.[1];
}

function toInteger(value: unknown) {
  const number = toNumber(value);
  return number !== null && Number.isInteger(number) ? number : null;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const normalized = typeof value === "string" ? value.replace(",", ".").trim() : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function storeNumberFromName(name: string) {
  const match = /^Radnja\s+(\d+)$/i.exec(name);
  return match ? Number(match[1]) : null;
}

function classifyTurnoverError(error: unknown) {
  if (error instanceof TurnoverServiceError) return error.code;

  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timed out") || message.includes("timeout")) return "timeout";
  if (
    message.includes("biznisoft_company") ||
    message.includes("biznisoft_username") ||
    message.includes("selecting database") ||
    message.includes("please login") ||
    message.includes("session handle")
  ) {
    return "configuration";
  }
  if (message.includes("valid json") || message.includes("invalid store totals")) {
    return "invalid_response";
  }
  return "upstream_unavailable";
}

function publicMessageForError(errorCode: string) {
  if (errorCode === "timeout") {
    return "BizniSoft nije odgovorio na vreme. Pokušajte ponovo.";
  }
  if (errorCode === "configuration") {
    return "BizniSoft konfiguracija ili prijava trenutno nije ispravna.";
  }
  if (errorCode === "invalid_response") {
    return "BizniSoft je vratio odgovor koji nije moguće obraditi.";
  }
  if (errorCode === "cache_unavailable") {
    return "Keš prometa trenutno nije dostupan.";
  }
  return "Promet trenutno nije moguće preuzeti iz BizniSoft-a.";
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  });

  await Promise.all(workers);
  return results;
}
