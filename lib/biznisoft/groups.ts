import type { BizniSoftSaleActionWithArticle, Store } from "@/lib/types";

export type SaleActionGroupParts = {
  action_type: number;
  storage_id: number | null;
  from_chapter: string | null;
  chapter_to: string | null;
  loyalty_level: number;
  priority_level: number;
};

export type SaleActionGroup = SaleActionGroupParts & {
  groupKey: string;
  rows: BizniSoftSaleActionWithArticle[];
};

const SALE_ACTION_NAME_FIELDS = [
  "ActionName",
  "SaleActionName",
  "Name",
  "Description",
  "Caption",
  "Title",
  "ActionTitle",
  "Naziv",
  "NazivAkcije"
];

export function saleActionGroupKeyFromParts(parts: SaleActionGroupParts) {
  return [
    parts.action_type,
    parts.storage_id ?? "ALL",
    parts.from_chapter ?? "NO_FROM",
    parts.chapter_to ?? "NO_TO",
    parts.loyalty_level ?? 0,
    parts.priority_level ?? 0
  ].join("__");
}

export function saleActionGroupKey(row: BizniSoftSaleActionWithArticle) {
  return saleActionGroupKeyFromParts({
    action_type: row.action_type,
    chapter_to: row.chapter_to,
    from_chapter: row.from_chapter,
    loyalty_level: row.loyalty_level ?? 0,
    priority_level: row.priority_level ?? 0,
    storage_id: row.storage_id
  });
}

export function parseSaleActionGroupKey(groupKey: string): SaleActionGroupParts | null {
  const parts = groupKey.split("__");

  if (parts.length !== 6) return null;

  const [actionType, storageId, fromChapter, chapterTo, loyaltyLevel, priorityLevel] = parts;
  const action_type = Number(actionType);
  const loyalty_level = Number(loyaltyLevel);
  const priority_level = Number(priorityLevel);

  if (!Number.isFinite(action_type) || !Number.isFinite(loyalty_level) || !Number.isFinite(priority_level)) return null;

  return {
    action_type,
    chapter_to: chapterTo === "NO_TO" ? null : chapterTo,
    from_chapter: fromChapter === "NO_FROM" ? null : fromChapter,
    loyalty_level,
    priority_level,
    storage_id: storageId === "ALL" ? null : Number(storageId)
  };
}

export function groupSaleActions(rows: BizniSoftSaleActionWithArticle[]) {
  const groups = new Map<string, SaleActionGroup>();

  for (const row of rows) {
    const groupKey = saleActionGroupKey(row);
    const current =
      groups.get(groupKey) ??
      ({
        action_type: row.action_type,
        chapter_to: row.chapter_to,
        from_chapter: row.from_chapter,
        groupKey,
        loyalty_level: row.loyalty_level ?? 0,
        priority_level: row.priority_level ?? 0,
        rows: [],
        storage_id: row.storage_id
      } satisfies SaleActionGroup);

    current.rows.push(row);
    groups.set(groupKey, current);
  }

  return Array.from(groups.values()).sort((a, b) => (a.from_chapter ?? "").localeCompare(b.from_chapter ?? ""));
}

export function getSaleActionName(row: BizniSoftSaleActionWithArticle) {
  if (row.sale_action_name) return row.sale_action_name;

  for (const field of SALE_ACTION_NAME_FIELDS) {
    const value = readRaw(row.raw, field);
    if (value !== null && value !== undefined && value !== "") return String(value);
  }

  return null;
}

export function actionStatusFromDates({
  chapter_to,
  from_chapter,
  today
}: {
  chapter_to: string | null;
  from_chapter: string | null;
  today: string;
}) {
  if (chapter_to && formatBelgradeDate(chapter_to) < today) return "Završena";
  if (from_chapter && formatBelgradeDate(from_chapter) === today) return "Počinje danas";
  if (chapter_to && formatBelgradeDate(chapter_to) === today) return "Ističe danas";
  if (from_chapter && formatBelgradeDate(from_chapter) > today) return "Buduća";
  return "Aktivna";
}

export function statusClass(status: string) {
  if (status === "Aktivna") return "rounded-md bg-green-50 px-2 py-1 text-xs font-bold text-green-700";
  if (status === "Počinje danas") return "rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700";
  if (status === "Ističe danas") return "rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700";
  if (status === "Buduća") return "rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700";
  return "rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700";
}

export function storageLabel(storageId: number | null, storesByStorageId: Map<number, Store>) {
  if (storageId === null) return "Sve radnje";

  const store = storesByStorageId.get(storageId);
  return store?.name ?? `Nepoznat objekat (StorageID: ${storageId})`;
}

export function storageIdFromStoreName(name: string) {
  const match = name.match(/Radnja\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

export function articleText(row: BizniSoftSaleActionWithArticle) {
  if (row.article_id === null && row.article_attribute_id !== null) {
    return {
      barcode: "-",
      id: row.article_code ?? "-",
      name: "Akcija po atributu/grupi"
    };
  }

  if (row.article_id === null) {
    return {
      barcode: row.article_barcode ?? "-",
      id: row.article_code ?? "-",
      name: "Akcija po atributu/grupi"
    };
  }

  return {
    barcode: row.article_barcode ?? "-",
    id: row.article_code ?? String(row.article_id),
    name: row.article_name ?? `Nepoznat artikal (ID: ${row.article_id})`
  };
}

export function formatBelgradeDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Belgrade",
    year: "numeric"
  }).format(new Date(value));
}

export function formatDateTime(value: string | null) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("sr-RS", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatNumber(value: number | null) {
  if (value === null) return "-";

  return new Intl.NumberFormat("sr-RS", {
    maximumFractionDigits: 2
  }).format(value);
}

function readRaw(raw: Record<string, unknown> | null | undefined, field: string) {
  if (!raw || typeof raw !== "object") return undefined;

  const direct = raw[field];
  if (direct !== undefined) return direct;

  const lowerField = field.toLowerCase();
  const entry = Object.entries(raw).find(([key]) => key.toLowerCase() === lowerField);
  return entry?.[1];
}
