import type { WriteoffListItem } from "@/lib/types";

export const WRITE_OFF_IMPORT_SHEET = "BSRep_411717";
export const WRITE_OFF_IMPORT_COLUMNS = 20;

export type WriteoffStockSnapshot = {
  article_id: number;
  article_code: string | null;
  barcode: string;
  name: string;
  unit: string | null;
  amount: number | null;
  retail_price: number | null;
  account: string | null;
  level_price: number | null;
  popdv_id: string | null;
  vat_transaction_type: string | null;
  operator_name: string | null;
  modify_time: string | null;
  storage_id: number;
  stock_fetched_at: string;
};

export function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function numericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  return Number.isFinite(number) ? number : null;
}

export function textValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

/** BizniSoft's article ID is the authoritative article code; XLSX keeps it as six text digits. */
export function formatBizniSoftArticleCode(articleId: number) {
  return String(articleId).padStart(6, "0");
}

export function readRawField(raw: Record<string, unknown> | null | undefined, names: string[]) {
  if (!raw || typeof raw !== "object") return null;
  const entries = Object.entries(raw);
  for (const name of names) {
    const direct = raw[name];
    if (direct !== undefined && direct !== null && direct !== "") return direct;
    const lower = name.toLowerCase();
    const match = entries.find(([key]) => key.toLowerCase() === lower);
    if (match && match[1] !== undefined && match[1] !== null && match[1] !== "") return match[1];
  }
  return null;
}

export function normalizeStockSnapshot(
  row: Record<string, unknown>,
  stockFetchedAt: string
): WriteoffStockSnapshot | null {
  const articleId = numericValue(readRawField(row, ["ID", "ArticleID"]));
  const barcode = textValue(readRawField(row, ["Barcode", "BarCode", "EAN", "Barkod"]));
  const name = textValue(readRawField(row, ["Name", "ArticleName", "Naziv", "NazivArtikla"]));
  const storageId = numericValue(readRawField(row, ["StorageID", "storage_id"]));
  if (!articleId || !Number.isInteger(articleId) || !barcode || !name || storageId === null || !Number.isInteger(storageId)) {
    return null;
  }

  return {
    account: textValue(readRawField(row, ["Account", "Konto"])),
    amount: numericValue(readRawField(row, ["Amount", "Stanje"])),
    article_id: articleId,
    article_code: textValue(readRawField(row, ["Code", "ArticleCode", "CatNo", "ArticleCatNo"])) ?? formatBizniSoftArticleCode(articleId),
    barcode,
    level_price: numericValue(readRawField(row, ["LevelPrice", "NivCena", "NivPrice"])),
    modify_time: textValue(readRawField(row, ["ModifyTime", "ModificationTime"])),
    name,
    operator_name: textValue(readRawField(row, ["Operater", "Operator"])),
    popdv_id: textValue(readRawField(row, ["POPDVID", "POPDVId", "POPDV_ID", "PdvId"])),
    retail_price: numericValue(readRawField(row, ["RetailPrice", "Price", "PriceRSD"])),
    storage_id: storageId,
    stock_fetched_at: stockFetchedAt,
    unit: textValue(readRawField(row, ["Unit", "UnitName", "UnitOfMeasure"])),
    vat_transaction_type: textValue(readRawField(row, ["VATTransactionType", "VatTransactionType", "TaxTransactionType", "VrstaPDVPrometa"])),
  };
}

export type ImportableWriteoffItem = WriteoffListItem & {
  store_name: string;
};

export function validateWriteoffItems(items: ImportableWriteoffItem[], options: { requireBizniSoftMetadata?: boolean } = {}) {
  const errors: string[] = [];
  if (items.length === 0) errors.push("Popis nema potvrđene stavke.");
  const requireBizniSoftMetadata = options.requireBizniSoftMetadata !== false;

  for (const item of items) {
    if (!item.article_id || !item.barcode || !item.article_name) errors.push(`Artikal ${item.article_id || "bez šifre"} nema potpun identitet.`);
    if (requireBizniSoftMetadata && !item.article_code) errors.push(`BizniSoft šifra za artikal ${item.article_id || "bez šifre"} nije dostupna.`);
    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) errors.push(`Količina za artikal ${item.article_id} nije ispravna.`);
    if (!isIsoDate(item.expiration_date)) errors.push(`Datum isteka za artikal ${item.article_id} nije ispravan.`);
    if (requireBizniSoftMetadata && (item.price === null || !Number.isFinite(Number(item.price)))) errors.push(`Cena za artikal ${item.article_id} nije dostupna iz autoritativnog BizniSoft izvora.`);
    if (requireBizniSoftMetadata && (item.level_price === null || !Number.isFinite(Number(item.level_price)))) errors.push(`Niv.cena za artikal ${item.article_id} nije dostupna iz autoritativnog BizniSoft izvora.`);
    if (requireBizniSoftMetadata && !item.account) {
      errors.push(`Konto za artikal ${item.article_id} nije pouzdano dostupan; izvoz je blokiran.`);
    }
    if (requireBizniSoftMetadata && !item.popdv_id) {
      errors.push(`POPDV ID za artikal ${item.article_id} nije pouzdano dostupan; izvoz je blokiran.`);
    }
    if (requireBizniSoftMetadata && !item.vat_transaction_type) {
      errors.push(`Vrsta PDV prometa za artikal ${item.article_id} nije pouzdano dostupna; izvoz je blokiran.`);
    }
  }

  return Array.from(new Set(errors));
}

export function buildSupplierRows(items: ImportableWriteoffItem[]) {
  return items.map((item, index) => ({
    rowNumber: index + 1,
    barcode: item.barcode,
    articleName: item.article_name,
    quantity: Number(item.quantity),
    expirationDate: item.expiration_date,
    storeName: item.store_name
  }));
}

export function aggregateItemsByArticle(items: ImportableWriteoffItem[]) {
  const map = new Map<string, ImportableWriteoffItem & { quantity: number }>();
  for (const item of items) {
    const key = String(item.article_id);
    const existing = map.get(key);
    if (existing) existing.quantity += Number(item.quantity);
    else map.set(key, { ...item, quantity: Number(item.quantity) });
  }
  return Array.from(map.values());
}

export function formatRsd(value: unknown) {
  const number = numericValue(value);
  if (number === null) return "-";
  return number.toLocaleString("sr-RS", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
