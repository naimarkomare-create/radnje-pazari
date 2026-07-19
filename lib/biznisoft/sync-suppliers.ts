import {
  getBizniSoftCredentials,
  getItems,
  getSessionHandle,
  type BizniSoftCredentials
} from "@/lib/biznisoft/soap-client";
import { PRODUCE_STORE_NAMES, sortProduceStores } from "@/lib/produce";
import { createServiceClient } from "@/lib/supabase/service";
import type { Store } from "@/lib/types";

type BizniSoftRow = Record<string, unknown>;

type MappedStore = {
  name: string;
  storageId: number;
};

type CalculationDocument = {
  calculationNo: number;
  companyYear: number;
  documentDate: string | null;
  partnerId: string;
  storageId: number;
};

type SupplierRow = {
  address: string | null;
  attributes: Record<string, unknown>;
  biznisoft_partner_id: string;
  city: string | null;
  code: string | null;
  email: string | null;
  is_active: boolean;
  name: string;
  phone: string | null;
  registration_number: string | null;
  synced_at: string;
  tax_id: string | null;
  updated_at: string;
};

type SupplierRecord = {
  biznisoft_partner_id: string;
  id: string;
};

type RelationCandidate = {
  articleCode: string;
  articleId: number;
  barcode: string | null;
  biznisoftArticleId: string;
  partnerId: string;
  supplierId: string;
};

export type SupplierSyncResult = {
  success: true;
  received: number;
  created: number;
  updated: number;
  skipped: number;
  calculationDocuments: number;
  storesChecked: number;
  suppliersReceived: number;
  suppliersUpserted: number;
  errors: string[];
};

export type ArticleSupplierSyncResult = {
  success: true;
  relationsReceived: number;
  relationsUpserted: number;
  relationsInDatabase: number;
  relationsCreated: number;
  relationsUpdated: number;
  suppliersReceived: number;
  unmatchedArticles: number;
  unmatchedSuppliers: number;
  documentsAttempted: number;
  documentsProcessed: number;
  documentsRemaining: number;
  storesChecked: number;
  errors: string[];
};

const CUSTOMER_ITEM_TYPE = "itCustomer";
const CALCULATION_ITEM_TYPE = "itCalculations";
const CALCULATION_DETAIL_ITEM_TYPE = "itCalculationsDetail";
const CUSTOMER_LIMIT = 10_000;
const CALCULATION_LIMIT = 5_000;
const RELATION_DOCUMENT_BATCH_SIZE = 400;
const STORE_CONCURRENCY = 2;
const DETAIL_CONCURRENCY = 5;
const DATABASE_CHUNK_SIZE = 500;
const ARTICLE_LOOKUP_CHUNK_SIZE = 100;

export async function syncBizniSoftSuppliers(): Promise<SupplierSyncResult> {
  const credentials = getBizniSoftCredentials();
  const sessionHandle = await getSessionHandle(credentials);
  const stores = await fetchMappedStores();
  const calculationResult = await fetchCalculationDocuments({
    credentials,
    sessionHandle,
    stores
  });
  const partnerIds = new Set(calculationResult.documents.map((document) => document.partnerId));
  const customerRows = parseBizniSoftRows(
    await getItems({
      itemType: CUSTOMER_ITEM_TYPE,
      jsonGetItemsRequest: JSON.stringify({
        xsicChangesFromDate: "2000-01-01 00:00:00",
        xsicVatNumber: ""
      }),
      limit: CUSTOMER_LIMIT,
      sessionHandle,
      soapUrl: credentials.soapUrl
    }),
    CUSTOMER_ITEM_TYPE
  );
  const now = new Date().toISOString();
  const suppliers = new Map<string, SupplierRow>();
  let invalidSupplierCount = 0;

  for (const raw of customerRows) {
    const partnerId = toInteger(readField(raw, "ID"));
    if (partnerId === null || !partnerIds.has(String(partnerId))) continue;

    const name = toText(readField(raw, "Name"));
    if (!name) {
      invalidSupplierCount += 1;
      continue;
    }

    suppliers.set(String(partnerId), {
      address: toText(readField(raw, "Address")),
      attributes: supplierAttributes(raw),
      biznisoft_partner_id: String(partnerId),
      city: toText(readField(raw, "City")),
      code: toText(readField(raw, "Number")),
      email: toText(readField(raw, "E-Mail")),
      is_active: toBoolean(readField(raw, "Active"), true),
      name,
      phone: toText(readField(raw, "Phone")),
      registration_number: toText(readField(raw, "RegNO")),
      synced_at: now,
      tax_id: toText(readField(raw, "VatNumber")),
      updated_at: now
    });
  }

  const missingPartnerCount = Array.from(partnerIds).filter((partnerId) => !suppliers.has(partnerId)).length;
  const existingPartnerIds = await fetchExistingSupplierPartnerIds();
  const rows = Array.from(suppliers.values());
  await upsertRows("biznisoft_suppliers", rows, "biznisoft_partner_id");

  const errors = [...calculationResult.errors];
  if (customerRows.length >= CUSTOMER_LIMIT) {
    errors.push(`BizniSoft je vratio maksimalnih ${CUSTOMER_LIMIT} partnera; proverite da li je lista potpuna.`);
  }
  if (missingPartnerCount > 0) {
    errors.push(`${missingPartnerCount} partnera iz kalkulacija nije pronađeno u itCustomer.`);
  }

  return {
    calculationDocuments: calculationResult.documents.length,
    created: rows.filter((row) => !existingPartnerIds.has(row.biznisoft_partner_id)).length,
    errors,
    received: partnerIds.size,
    skipped: invalidSupplierCount + missingPartnerCount,
    storesChecked: calculationResult.storesChecked,
    suppliersReceived: partnerIds.size,
    suppliersUpserted: rows.length,
    success: true,
    updated: rows.filter((row) => existingPartnerIds.has(row.biznisoft_partner_id)).length
  };
}

export async function syncBizniSoftArticleSuppliers(): Promise<ArticleSupplierSyncResult> {
  const credentials = getBizniSoftCredentials();
  const companyYear = Number(credentials.companyYear);
  const sessionHandle = await getSessionHandle(credentials);
  const stores = await fetchMappedStores();
  const calculationResult = await fetchCalculationDocuments({
    credentials,
    sessionHandle,
    stores
  });
  const [suppliers, processedDocumentKeys] = await Promise.all([
    fetchSupplierRecords(),
    fetchProcessedDocumentKeys(companyYear)
  ]);
  const supplierByPartnerId = new Map(suppliers.map((supplier) => [supplier.biznisoft_partner_id, supplier]));
  const unprocessedDocuments = calculationResult.documents
    .filter((document) => !processedDocumentKeys.has(documentKey(document)))
    .sort(compareCalculationDocuments);
  const unmatchedSupplierIds = new Set(
    unprocessedDocuments
      .filter((document) => !supplierByPartnerId.has(document.partnerId))
      .map((document) => document.partnerId)
  );
  const documentsToProcess = unprocessedDocuments
    .filter((document) => supplierByPartnerId.has(document.partnerId))
    .slice(0, RELATION_DOCUMENT_BATCH_SIZE);
  const detailResults = await mapWithConcurrency(documentsToProcess, DETAIL_CONCURRENCY, async (document) => {
    try {
      const rows = parseBizniSoftRows(
        await getItems({
          itemType: CALCULATION_DETAIL_ITEM_TYPE,
          jsonGetItemsRequest: JSON.stringify({
            StorageID: document.storageId,
            CalcNo: document.calculationNo
          }),
          limit: 2_000,
          sessionHandle,
          soapUrl: credentials.soapUrl
        }),
        CALCULATION_DETAIL_ITEM_TYPE
      );
      const articles = rows
        .map(normalizeDetailArticle)
        .filter((article): article is NonNullable<typeof article> => article !== null);
      return { articles, document, error: null };
    } catch (error) {
      return {
        articles: [] as Array<ReturnType<typeof normalizeDetailArticle>>,
        document,
        error: safeBizniSoftError(error)
      };
    }
  });
  const successfulDetails = detailResults.filter((result) => !result.error);
  const relationCandidates = new Map<string, RelationCandidate>();
  let relationOccurrences = 0;

  for (const result of successfulDetails) {
    const supplier = supplierByPartnerId.get(result.document.partnerId);
    if (!supplier) continue;

    for (const article of result.articles) {
      if (!article) continue;
      relationOccurrences += 1;
      relationCandidates.set(`${article.articleId}:${supplier.id}`, {
        articleCode: article.articleCode,
        articleId: article.articleId,
        barcode: article.barcode,
        biznisoftArticleId: article.biznisoftArticleId,
        partnerId: result.document.partnerId,
        supplierId: supplier.id
      });
    }
  }

  const candidates = Array.from(relationCandidates.values());
  const [localArticleIds, existingRelations] = await Promise.all([
    fetchLocalArticleIds(candidates.map((candidate) => candidate.articleId)),
    fetchExistingRelations(candidates.map((candidate) => candidate.articleId))
  ]);
  const now = new Date().toISOString();
  await upsertRows(
    "article_suppliers",
    candidates.map((candidate) => {
      const relationKey = `${candidate.articleId}:${candidate.supplierId}`;
      return {
        article_id: candidate.articleId,
        biznisoft_article_id: candidate.biznisoftArticleId,
        relation_source:
          existingRelations.get(relationKey) === "manual_admin"
            ? "manual_admin"
            : "purchase_calculation",
        supplier_id: candidate.supplierId,
        synced_at: now,
        updated_at: now
      };
    }),
    "article_id,supplier_id"
  );
  await upsertRows(
    "biznisoft_supplier_relation_documents",
    successfulDetails.map(({ document }) => ({
      calculation_no: document.calculationNo,
      company_year: document.companyYear,
      document_date: document.documentDate,
      partner_id: document.partnerId,
      storage_id: document.storageId,
      synced_at: now
    })),
    "company_year,storage_id,calculation_no"
  );

  const detailErrors = detailResults
    .filter((result) => result.error)
    .map(
      (result) =>
        `Kalkulacija ${result.document.storageId}/${result.document.calculationNo}: ${result.error}`
    );
  const errors = [...calculationResult.errors, ...detailErrors.slice(0, 20)];
  if (detailErrors.length > 20) errors.push(`Još ${detailErrors.length - 20} SOAP grešaka nije prikazano.`);
  const unmatchedArticleIds = new Set(
    candidates
      .map((candidate) => candidate.articleId)
      .filter((articleId) => !localArticleIds.has(articleId))
  );
  const created = candidates.filter(
    (candidate) =>
      !existingRelations.has(`${candidate.articleId}:${candidate.supplierId}`)
  ).length;
  const unmatchedCandidates = candidates.filter(
    (candidate) => !localArticleIds.has(candidate.articleId)
  );
  if (unmatchedCandidates.length > 0) {
    console.warn(
      "BizniSoft unmatched article-supplier examples:",
      unmatchedCandidates.slice(0, 10).map((candidate) => ({
        articleCode: candidate.articleCode,
        articleId: candidate.biznisoftArticleId,
        barcode: candidate.barcode,
        supplierPartnerId: candidate.partnerId
      }))
    );
  }
  if (unmatchedSupplierIds.size > 0) {
    console.warn(
      "BizniSoft unmatched supplier partner examples:",
      Array.from(unmatchedSupplierIds).slice(0, 10)
    );
  }
  const relationsInDatabase = await fetchTableCount("article_suppliers");
  if (relationsInDatabase === 0) {
    errors.push(
      "Dobavljači su sinhronizovani, ali nije pronađena nijedna veza između artikala i dobavljača."
    );
  }

  return {
    documentsAttempted: documentsToProcess.length,
    documentsProcessed: successfulDetails.length,
    documentsRemaining: Math.max(0, unprocessedDocuments.length - successfulDetails.length),
    errors,
    relationsCreated: created,
    relationsInDatabase,
    relationsReceived: relationOccurrences,
    relationsUpserted: candidates.length,
    relationsUpdated: candidates.length - created,
    storesChecked: calculationResult.storesChecked,
    suppliersReceived: suppliers.length,
    success: true,
    unmatchedArticles: unmatchedArticleIds.size,
    unmatchedSuppliers: unmatchedSupplierIds.size
  };
}

export function safeBizniSoftError(error: unknown) {
  const message = error instanceof Error ? error.message : "Nepoznata BizniSoft greška.";
  return message
    .replace(/\{[0-9a-f-]{20,}\}/gi, "[redacted]")
    .replace(/<Password\b[^>]*>[\s\S]*?<\/Password>/gi, "<Password>[redacted]</Password>")
    .replace(/<Username\b[^>]*>[\s\S]*?<\/Username>/gi, "<Username>[redacted]</Username>")
    .slice(0, 500);
}

async function fetchCalculationDocuments({
  credentials,
  sessionHandle,
  stores
}: {
  credentials: BizniSoftCredentials;
  sessionHandle: string;
  stores: MappedStore[];
}) {
  const results = await mapWithConcurrency(stores, STORE_CONCURRENCY, async (store) => {
    try {
      const rows = parseBizniSoftRows(
        await getItems({
          itemType: CALCULATION_ITEM_TYPE,
          jsonGetItemsRequest: JSON.stringify({
            StorageID: store.storageId,
            xsicUnbookedOnly: false,
            xsicWithLevelingOnly: false,
            xsicUncheckedOnly: false
          }),
          limit: CALCULATION_LIMIT,
          sessionHandle,
          soapUrl: credentials.soapUrl
        }),
        CALCULATION_ITEM_TYPE
      );
      const documents = rows
        .map((row) =>
          normalizeCalculationDocument(row, store.storageId, Number(credentials.companyYear))
        )
        .filter((document): document is CalculationDocument => document !== null);
      return {
        documents,
        error:
          rows.length >= CALCULATION_LIMIT
            ? `${store.name}: dostignut je limit od ${CALCULATION_LIMIT} kalkulacija.`
            : null,
        succeeded: true
      };
    } catch (error) {
      return {
        documents: [] as CalculationDocument[],
        error: `${store.name}: ${safeBizniSoftError(error)}`,
        succeeded: false
      };
    }
  });
  const documents = new Map<string, CalculationDocument>();
  const errors: string[] = [];
  let storesChecked = 0;

  for (const result of results) {
    if (result.error) errors.push(result.error);
    if (result.succeeded) storesChecked += 1;
    for (const document of result.documents) documents.set(documentKey(document), document);
  }

  return { documents: Array.from(documents.values()), errors, storesChecked };
}

async function fetchMappedStores(): Promise<MappedStore[]> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, biznisoft_storage_id, latitude, longitude, address, created_at")
    .in("name", [...PRODUCE_STORE_NAMES]);

  if (error) throw new Error(error.message);

  return sortProduceStores((data ?? []) as Store[])
    .map((store) => ({
      name: store.name,
      storageId: store.biznisoft_storage_id ?? storageIdFromStoreName(store.name)
    }))
    .filter((store): store is MappedStore => store.storageId !== null);
}

async function fetchExistingSupplierPartnerIds() {
  const rows = await fetchAllRows<{ biznisoft_partner_id: string }>(
    "biznisoft_suppliers",
    "biznisoft_partner_id"
  );
  return new Set(rows.map((row) => row.biznisoft_partner_id));
}

async function fetchSupplierRecords() {
  return fetchAllRows<SupplierRecord>(
    "biznisoft_suppliers",
    "id, biznisoft_partner_id"
  );
}

async function fetchProcessedDocumentKeys(companyYear: number) {
  const rows = await fetchAllRows<{
    calculation_no: number;
    company_year: number;
    storage_id: number;
  }>(
    "biznisoft_supplier_relation_documents",
    "company_year, storage_id, calculation_no",
    (query) => query.eq("company_year", companyYear)
  );
  return new Set(
    rows.map(
      (row) => `${row.company_year}:${row.storage_id}:${row.calculation_no}`
    )
  );
}

async function fetchLocalArticleIds(articleIds: number[]) {
  const ids = Array.from(new Set(articleIds));
  const result = new Set<number>();
  const supabase = createServiceClient();

  for (let index = 0; index < ids.length; index += ARTICLE_LOOKUP_CHUNK_SIZE) {
    const { data, error } = await supabase
      .from("biznisoft_stock_price_current")
      .select("article_id")
      .in("article_id", ids.slice(index, index + ARTICLE_LOOKUP_CHUNK_SIZE));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const articleId = toInteger(row.article_id);
      if (articleId !== null) result.add(articleId);
    }
  }

  return result;
}

async function fetchExistingRelations(articleIds: number[]) {
  const ids = Array.from(new Set(articleIds));
  const result = new Map<string, string>();
  const supabase = createServiceClient();

  for (let index = 0; index < ids.length; index += DATABASE_CHUNK_SIZE) {
    const { data, error } = await supabase
      .from("article_suppliers")
      .select("article_id, relation_source, supplier_id")
      .in("article_id", ids.slice(index, index + DATABASE_CHUNK_SIZE));
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      result.set(
        `${row.article_id}:${row.supplier_id}`,
        typeof row.relation_source === "string"
          ? row.relation_source
          : "purchase_calculation"
      );
    }
  }

  return result;
}

async function fetchTableCount(table: string) {
  const supabase = createServiceClient();
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function fetchAllRows<T>(
  table: string,
  columns: string,
  filter?: (query: any) => any
): Promise<T[]> {
  const supabase = createServiceClient();
  const rows: T[] = [];

  for (let from = 0; ; from += 1_000) {
    let query = supabase.from(table).select(columns).range(from, from + 999);
    if (filter) query = filter(query);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < 1_000) break;
  }

  return rows;
}

async function upsertRows(table: string, rows: Record<string, unknown>[], onConflict: string) {
  if (rows.length === 0) return;
  const supabase = createServiceClient();

  for (let index = 0; index < rows.length; index += DATABASE_CHUNK_SIZE) {
    const { error } = await supabase
      .from(table)
      .upsert(rows.slice(index, index + DATABASE_CHUNK_SIZE), { onConflict });
    if (error) throw new Error(error.message);
  }
}

function normalizeCalculationDocument(
  raw: BizniSoftRow,
  fallbackStorageId: number,
  companyYear: number
): CalculationDocument | null {
  const calculationNo = toInteger(readField(raw, "CalcNo"));
  const partnerId = toInteger(readField(raw, "PartnerID"));
  const storageId = toInteger(readField(raw, "StorageID")) ?? fallbackStorageId;
  if (calculationNo === null || partnerId === null || !Number.isInteger(companyYear)) return null;

  return {
    calculationNo,
    companyYear,
    documentDate: toIsoDate(readField(raw, "Date")),
    partnerId: String(partnerId),
    storageId
  };
}

function normalizeDetailArticle(raw: BizniSoftRow) {
  const biznisoftArticleId = normalizeIdentifier(readField(raw, "ArticleID"));
  const articleId = toInteger(biznisoftArticleId);
  if (articleId === null || !biznisoftArticleId) return null;

  return {
    articleCode:
      normalizeIdentifier(readField(raw, "ArticleCode")) ??
      biznisoftArticleId,
    articleId,
    barcode: normalizeIdentifier(readField(raw, "Barcode")),
    biznisoftArticleId
  };
}

function parseBizniSoftRows(value: string, itemType: string): BizniSoftRow[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`BizniSoft ${itemType} je vratio neispravan JSON.`);
  }

  return flattenBizniSoftRows(parsed);
}

function flattenBizniSoftRows(value: unknown): BizniSoftRow[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .flat(Infinity)
      .filter(
        (row): row is BizniSoftRow =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row)
      );
  }
  return typeof value === "object" ? [value as BizniSoftRow] : [];
}

function supplierAttributes(raw: BizniSoftRow) {
  const attributes: Record<string, unknown> = {};
  const fields = [
    "Type",
    "Category",
    "Country",
    "PostCode",
    "PostalCode",
    "ContactPerson",
    "Fax",
    "Note",
    "PaymentDays",
    "Blocked",
    "GLN"
  ];

  for (const field of fields) {
    const value = readField(raw, field);
    if (value !== null && value !== undefined && value !== "") attributes[field] = value;
  }

  return attributes;
}

function readField(raw: BizniSoftRow | undefined, field: string) {
  if (!raw) return undefined;
  const direct = raw[field];
  if (direct !== undefined) return direct;
  const lowerField = field.toLowerCase();
  return Object.entries(raw).find(([key]) => key.toLowerCase() === lowerField)?.[1];
}

function toInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function toText(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeIdentifier(value: unknown) {
  if (value === null || value === undefined) return null;
  const identifier = String(value).trim();
  return identifier || null;
}

function toBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "da", "t"].includes(normalized)) return true;
    if (["false", "0", "no", "ne", "f"].includes(normalized)) return false;
  }
  return fallback;
}

function toIsoDate(value: unknown) {
  const text = toText(value);
  if (!text) return null;
  const isoPrefix = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoPrefix) return isoPrefix[1];
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function storageIdFromStoreName(name: string) {
  const match = name.match(/Radnja\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function documentKey(document: CalculationDocument) {
  return `${document.companyYear}:${document.storageId}:${document.calculationNo}`;
}

function compareCalculationDocuments(left: CalculationDocument, right: CalculationDocument) {
  const byDate = (right.documentDate ?? "").localeCompare(left.documentDate ?? "");
  if (byDate !== 0) return byDate;
  if (right.storageId !== left.storageId) return right.storageId - left.storageId;
  return right.calculationNo - left.calculationNo;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let index = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const currentIndex = index;
        index += 1;
        results[currentIndex] = await worker(items[currentIndex]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}
