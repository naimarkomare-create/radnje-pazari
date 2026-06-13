import { getBizniSoftCredentials, getItem, getItems, getItems2, getSessionHandle } from "@/lib/biznisoft/soap-client";
import type { BizniSoftArticle, BizniSoftSaleAction } from "@/lib/types";

export type NormalizedBizniSoftSaleAction = Omit<BizniSoftSaleAction, "id" | "synced_at">;
export type NormalizedBizniSoftArticle = Omit<BizniSoftArticle, "synced_at">;
export type BizniSoftSaleActionSyncDebug = {
  actionType1Fault: string | null;
  actionType1RawCount: number;
  actionType2Fault: string | null;
  actionType2RawCount: number;
  actionType3Fault: string | null;
  actionType3RawCount: number;
  firstFiveRowsPreview: Array<Record<string, unknown>>;
  normalizedRowsCount: number;
  totalRawRowsBeforeNormalize: number;
  uniqueArticleIdsCount: number;
};
export type PreparedBizniSoftSaleActions = {
  duplicateSourceKeyRows: number;
  rows: NormalizedBizniSoftSaleAction[];
  rowsSkippedMissingSourceKey: number;
};
export type BizniSoftArticleLookupRef = {
  articleId: number | null;
  barcode: string | null;
  code: string | null;
};
export type BizniSoftArticleSyncResult = {
  articleRowsResolvedByBarcode: number;
  articleRowsResolvedByCode: number;
  articleRowsResolvedByID: number;
  articles: NormalizedBizniSoftArticle[];
  barcodeRowsFetched: number;
  testArticles: Array<Record<string, unknown>>;
  unresolvedArticleRows: number;
  uniqueArticleIdCount: number;
};

export async function fetchBizniSoftSaleActionsWithArticles() {
  const credentials = getBizniSoftCredentials();
  const sessionHandle = await getSessionHandle(credentials);
  const actionTypeResults = await Promise.all([1, 2, 3].map((actionType) => fetchSaleActionRowsForActionType({
    actionType,
    sessionHandle,
    soapUrl: credentials.soapUrl
  })));
  const rows = actionTypeResults.flatMap((result) => result.rows);
  const saleActions = rows.map(normalizeSaleAction).filter((action): action is NormalizedBizniSoftSaleAction => action !== null);
  const articleIds = Array.from(
    new Set(saleActions.map((action) => action.article_id).filter((articleId): articleId is number => articleId !== null))
  );
  const debug: BizniSoftSaleActionSyncDebug = {
    actionType1Fault: actionTypeResults[0]?.fault ?? null,
    actionType1RawCount: actionTypeResults[0]?.rows.length ?? 0,
    actionType2Fault: actionTypeResults[1]?.fault ?? null,
    actionType2RawCount: actionTypeResults[1]?.rows.length ?? 0,
    actionType3Fault: actionTypeResults[2]?.fault ?? null,
    actionType3RawCount: actionTypeResults[2]?.rows.length ?? 0,
    firstFiveRowsPreview: rows.slice(0, 5).map(previewRow),
    normalizedRowsCount: saleActions.length,
    totalRawRowsBeforeNormalize: rows.length,
    uniqueArticleIdsCount: articleIds.length
  };

  return { debug, saleActions, uniqueArticleIdCount: articleIds.length };
}

export async function fetchBizniSoftArticlesForSaleActionIds(articleIds: number[]) {
  return fetchBizniSoftArticlesForSaleActionRefs(
    articleIds.map((articleId) => ({
      articleId,
      barcode: null,
      code: null
    }))
  );
}

export async function fetchBizniSoftArticlesForSaleActionRefs(refs: BizniSoftArticleLookupRef[]): Promise<BizniSoftArticleSyncResult> {
  const credentials = getBizniSoftCredentials();
  const sessionHandle = await getSessionHandle(credentials);
  const normalizedRefs = refs.map((ref) => ({
    articleId: typeof ref.articleId === "number" && Number.isFinite(ref.articleId) ? ref.articleId : null,
    barcode: normalizeLookupText(ref.barcode),
    code: normalizeLookupText(ref.code)
  }));
  const testRefs = [
    { articleId: 29709, barcode: null, code: "029709" },
    { articleId: 372703, barcode: null, code: null },
    { articleId: 372706, barcode: null, code: null }
  ];
  const uniqueArticleIds = Array.from(new Set(normalizedRefs.map((ref) => ref.articleId).filter((articleId): articleId is number => articleId !== null)));
  const byArticleId = new Map<number, NormalizedBizniSoftArticle>();
  const byBarcode = new Map<string, NormalizedBizniSoftArticle>();
  const byCode = new Map<string, NormalizedBizniSoftArticle>();
  const articlesById = await fetchBizniSoftArticles({
    articleIds: Array.from(new Set([...uniqueArticleIds, ...testRefs.map((ref) => ref.articleId)])),
    sessionHandle,
    soapUrl: credentials.soapUrl
  });

  for (const article of articlesById) {
    rememberArticle({ article, byArticleId, byBarcode, byCode });
  }

  let articleRowsResolvedByID = normalizedRefs.filter((ref) => ref.articleId !== null && byArticleId.has(ref.articleId)).length;
  let articleRowsResolvedByBarcode = 0;
  let articleRowsResolvedByCode = 0;
  let barcodeRowsFetched = 0;
  const resolvedRefIndexes = new Set<number>();

  normalizedRefs.forEach((ref, index) => {
    if (ref.articleId !== null && byArticleId.has(ref.articleId)) {
      resolvedRefIndexes.add(index);
    }
  });

  for (const [index, ref] of normalizedRefs.entries()) {
    if (ref.articleId !== null && byArticleId.has(ref.articleId)) continue;

    if (ref.barcode) {
      const article =
        byBarcode.get(ref.barcode) ??
        (await fetchSingleBizniSoftArticleByLookup({
          lookups: articleBarcodeLookups(ref.barcode),
          sessionHandle,
          soapUrl: credentials.soapUrl
        }));

      if (article) {
        rememberArticle({ article, byArticleId, byBarcode, byCode });
        articleRowsResolvedByBarcode += 1;
        resolvedRefIndexes.add(index);
        continue;
      }

      const barcodeArticle = await fetchArticleFromBarcodeSpec({
        articleId: ref.articleId,
        barcode: ref.barcode,
        code: ref.code,
        sessionHandle,
        soapUrl: credentials.soapUrl
      });

      if (barcodeArticle) {
        rememberArticle({ article: barcodeArticle, byArticleId, byBarcode, byCode });
        barcodeRowsFetched += 1;
        articleRowsResolvedByBarcode += 1;
        resolvedRefIndexes.add(index);
        continue;
      }
    }

    if (ref.code) {
      const article =
        byCode.get(ref.code) ??
        (await fetchSingleBizniSoftArticleByLookup({
          lookups: articleCodeLookups(ref.code),
          sessionHandle,
          soapUrl: credentials.soapUrl
        }));

      if (article) {
        rememberArticle({ article, byArticleId, byBarcode, byCode });
        articleRowsResolvedByCode += 1;
        resolvedRefIndexes.add(index);
        continue;
      }

      const barcodeArticle = await fetchArticleFromBarcodeSpec({
        articleId: ref.articleId,
        barcode: ref.barcode,
        code: ref.code,
        sessionHandle,
        soapUrl: credentials.soapUrl
      });

      if (barcodeArticle) {
        rememberArticle({ article: barcodeArticle, byArticleId, byBarcode, byCode });
        barcodeRowsFetched += 1;
        articleRowsResolvedByCode += 1;
        resolvedRefIndexes.add(index);
      }
    }
  }

  const unresolvedArticleRows = normalizedRefs.length - resolvedRefIndexes.size;
  const testArticles = await Promise.all(
    testRefs.map(async (ref) => debugArticleLookupRef({ ref, sessionHandle, soapUrl: credentials.soapUrl }))
  );

  return {
    articleRowsResolvedByBarcode,
    articleRowsResolvedByCode,
    articleRowsResolvedByID,
    articles: Array.from(byArticleId.values()),
    barcodeRowsFetched,
    testArticles,
    unresolvedArticleRows,
    uniqueArticleIdCount: uniqueArticleIds.length
  };
}

export function saleActionSourceKey(
  action: Pick<BizniSoftSaleAction, "action_type" | "storage_id" | "article_id" | "article_attribute_id" | "from_chapter" | "chapter_to" | "loyalty_level">,
  taskType: "start" | "end"
) {
  return [
    "biznisoft_sale_action",
    taskType,
    action.action_type,
    action.storage_id ?? "ALL",
    action.article_id ?? "null",
    action.article_attribute_id ?? "null",
    action.from_chapter ?? "null",
    action.chapter_to ?? "null",
    action.loyalty_level ?? "null"
  ].join(":");
}

export function prepareSaleActionsForUpsert(saleActions: NormalizedBizniSoftSaleAction[]): PreparedBizniSoftSaleActions {
  const groups = new Map<string, NormalizedBizniSoftSaleAction[]>();
  let rowsSkippedMissingSourceKey = 0;

  for (const action of saleActions) {
    if (!action.source_key) {
      rowsSkippedMissingSourceKey += 1;
      continue;
    }

    const current = groups.get(action.source_key) ?? [];
    current.push(action);
    groups.set(action.source_key, current);
  }

  const rowsBySourceKey = new Map<string, NormalizedBizniSoftSaleAction>();
  let duplicateSourceKeyRows = 0;

  for (const [sourceKey, actions] of groups) {
    if (actions.length === 1) {
      rowsBySourceKey.set(sourceKey, actions[0]);
      continue;
    }

    const rawHashes = new Set(actions.map((action) => stableHash(action.raw)));

    if (rawHashes.size === 1) {
      duplicateSourceKeyRows += actions.length - 1;
      rowsBySourceKey.set(sourceKey, actions[0]);
      continue;
    }

    for (const action of actions) {
      const collisionSafeKey = `${sourceKey}__${stableHash(action.raw)}`;

      if (rowsBySourceKey.has(collisionSafeKey)) {
        duplicateSourceKeyRows += 1;
        continue;
      }

      rowsBySourceKey.set(collisionSafeKey, {
        ...action,
        source_key: collisionSafeKey
      });
    }
  }

  return {
    duplicateSourceKeyRows,
    rows: Array.from(rowsBySourceKey.values()),
    rowsSkippedMissingSourceKey
  };
}

async function fetchSaleActionRowsForActionType({
  actionType,
  sessionHandle,
  soapUrl
}: {
  actionType: number;
  sessionHandle: string;
  soapUrl: string;
}) {
  const request = JSON.stringify({ ActionType: actionType });
  const faults: string[] = [];
  let getItemsRows: Array<Record<string, unknown>> = [];
  let pagedRows: Array<Record<string, unknown>> = [];

  try {
    const response = await getItems({
      itemType: "itSaleActions",
      jsonGetItemsRequest: request,
      limit: 10000,
      sessionHandle,
      soapUrl
    });
    getItemsRows = flattenBizniSoftRows(parsePossiblyNestedJson(response));
  } catch (error) {
    faults.push(`GetItems: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (getItemsRows.length >= 10000) {
    try {
      pagedRows = await fetchSaleActionRowsWithPagination({ request, sessionHandle, soapUrl });
    } catch (error) {
      faults.push(`GetItems2: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const rows = pagedRows.length > getItemsRows.length ? pagedRows : getItemsRows;

  return {
    actionType,
    fault: faults.length > 0 ? faults.join(" | ") : null,
    rows
  };
}

async function fetchSaleActionRowsWithPagination({
  request,
  sessionHandle,
  soapUrl
}: {
  request: string;
  sessionHandle: string;
  soapUrl: string;
}) {
  const rows: Array<Record<string, unknown>> = [];
  const rowcount = 1000;

  for (let offset = 0; offset < 100000; offset += rowcount) {
    const response = await getItems2({
      itemType: "itSaleActions",
      jsonGetItemsRequest: request,
      offset,
      rowcount,
      sessionHandle,
      soapUrl
    });
    const pageRows = flattenBizniSoftRows(parsePossiblyNestedJson(response));
    rows.push(...pageRows);

    if (pageRows.length < rowcount) break;
  }

  return rows;
}

function normalizeSaleAction(raw: Record<string, unknown>): NormalizedBizniSoftSaleAction | null {
  const actionType = toNumber(readField(raw, "ActionType"));

  if (actionType === null) return null;

  return {
    source_key: sourceKeyFromRaw(raw),
    sale_action_name: readSaleActionName(raw),
    action_type: actionType,
    loyalty_level: toNumber(readField(raw, "LoyaltyLevel")),
    storage_id: toNumber(readField(raw, "StorageID")),
    article_id: toNumber(readField(raw, "ArticleID")),
    article_attribute_id: toNumber(readField(raw, "ArticleAttributeID")),
    discount_percent: toNumber(readField(raw, "DiscountPercent")),
    wholesale_price: toNumber(readField(raw, "WholesalePrice")),
    retail_price: toNumber(readField(raw, "RetailPrice")),
    from_chapter: toIsoDateTime(readField(raw, "FromChapter")),
    chapter_to: toIsoDateTime(readField(raw, "ChapterTo")),
    priority_level: toNumber(readField(raw, "PriorityLevel")),
    raw: sanitizeRawObject(raw)
  };
}

async function fetchBizniSoftArticles({
  articleIds,
  sessionHandle,
  soapUrl
}: {
  articleIds: number[];
  sessionHandle: string;
  soapUrl: string;
}): Promise<NormalizedBizniSoftArticle[]> {
  if (articleIds.length === 0) return [];

  const candidates = [
    { ArticleID: articleIds },
    { ArticleIDs: articleIds },
    { ArticleID: articleIds.join(",") },
    { IDs: articleIds },
    { ID: articleIds },
    { ID: articleIds.join(",") }
  ];
  const errors: string[] = [];
  const found = new Map<number, NormalizedBizniSoftArticle>();

  for (const request of candidates) {
    try {
      const response = await getItems({
        itemType: "itArticle",
        jsonGetItemsRequest: JSON.stringify(request),
        limit: Math.max(articleIds.length, 1000),
        sessionHandle,
        soapUrl
      });
      const parsed = parsePossiblyNestedJson(response);
      const articles = flattenBizniSoftRows(parsed).map(normalizeArticle).filter((article): article is NormalizedBizniSoftArticle => article !== null);
      const filtered = articles.filter((article) => articleIds.includes(article.article_id));

      for (const article of filtered) {
        found.set(article.article_id, article);
      }

      if (found.size === articleIds.length) return Array.from(found.values());
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  const missingIds = articleIds.filter((articleId) => !found.has(articleId));

  for (const articleId of missingIds) {
    const article = await fetchSingleBizniSoftArticle({ articleId, sessionHandle, soapUrl });
    if (article) {
      found.set(article.article_id, article);
    }
  }

  if (found.size === 0) {
    console.warn(`BizniSoft article lookup did not return article rows. Sale actions will still sync. Attempts: ${errors.length}`);
  }

  return Array.from(found.values());
}

async function fetchSingleBizniSoftArticle({
  articleId,
  sessionHandle,
  soapUrl
}: {
  articleId: number;
  sessionHandle: string;
  soapUrl: string;
}) {
  const candidates = [
    { ID: articleId },
    { ArticleID: articleId },
    { ID: String(articleId) },
    { ArticleID: String(articleId) },
    { Code: paddedArticleCode(articleId) },
    { ArticleCode: paddedArticleCode(articleId) },
    { CatNo: paddedArticleCode(articleId) }
  ];

  for (const request of candidates) {
    try {
      const response = await getItem({
        itemType: "itArticle",
        jsonGetItemRequest: JSON.stringify(request),
        sessionHandle,
        soapUrl
      });
      const parsed = parsePossiblyNestedJson(response);
      const rows = flattenBizniSoftRows(parsed);
      const article = normalizeArticle(rows[0] ?? (isRecord(parsed) ? parsed : null));

      if (article && article.article_id === articleId) return article;
    } catch {
      // Try the next read-only request shape.
    }

    try {
      const response = await getItems({
        itemType: "itArticle",
        jsonGetItemsRequest: JSON.stringify(request),
        limit: 10,
        sessionHandle,
        soapUrl
      });
      const article = flattenBizniSoftRows(parsePossiblyNestedJson(response))
        .map(normalizeArticle)
        .find((candidate): candidate is NormalizedBizniSoftArticle => Boolean(candidate && candidate.article_id === articleId));

      if (article) return article;
    } catch {
      // Try the next read-only request shape.
    }
  }

  return null;
}

async function fetchSingleBizniSoftArticleByLookup({
  lookups,
  sessionHandle,
  soapUrl
}: {
  lookups: Array<Record<string, string>>;
  sessionHandle: string;
  soapUrl: string;
}) {
  for (const request of lookups) {
    try {
      const response = await getItem({
        itemType: "itArticle",
        jsonGetItemRequest: JSON.stringify(request),
        sessionHandle,
        soapUrl
      });
      const parsed = parsePossiblyNestedJson(response);
      const rows = flattenBizniSoftRows(parsed);
      const article = normalizeArticle(rows[0] ?? (isRecord(parsed) ? parsed : null));

      if (article) return article;
    } catch {
      // Try the next read-only request shape.
    }

    try {
      const response = await getItems({
        itemType: "itArticle",
        jsonGetItemsRequest: JSON.stringify(request),
        limit: 10,
        sessionHandle,
        soapUrl
      });
      const article = flattenBizniSoftRows(parsePossiblyNestedJson(response))
        .map(normalizeArticle)
        .find((candidate): candidate is NormalizedBizniSoftArticle => candidate !== null);

      if (article) return article;
    } catch {
      // Try the next read-only request shape.
    }
  }

  return null;
}

async function fetchArticleFromBarcodeSpec({
  articleId,
  barcode,
  code,
  sessionHandle,
  soapUrl
}: {
  articleId: number | null;
  barcode: string | null;
  code: string | null;
  sessionHandle: string;
  soapUrl: string;
}) {
  const lookups: Array<Record<string, string | number>> = [];

  if (articleId !== null) {
    lookups.push({ ArticleID: articleId }, { ID: articleId });
  }

  if (barcode) {
    lookups.push({ Barcode: barcode }, { BarCode: barcode }, { EAN: barcode });
  }

  if (code) {
    lookups.push({ Code: code }, { ArticleCode: code }, { CatNo: code });
  }

  for (const lookup of lookups) {
    try {
      const response = await getItems({
        itemType: "itBarcodespec",
        jsonGetItemsRequest: JSON.stringify(lookup),
        limit: 10,
        sessionHandle,
        soapUrl
      });
      const rows = flattenBizniSoftRows(parsePossiblyNestedJson(response));
      const barcodeRow = rows[0];
      if (!barcodeRow) continue;

      const resolvedArticleId = toNumber(readField(barcodeRow, "ArticleID") ?? readField(barcodeRow, "ID")) ?? articleId;
      const resolvedBarcode = toText(readField(barcodeRow, "Barcode") ?? readField(barcodeRow, "BarCode") ?? readField(barcodeRow, "EAN")) ?? barcode;
      const resolvedCode =
        toText(readField(barcodeRow, "Code") ?? readField(barcodeRow, "ArticleCode") ?? readField(barcodeRow, "CatNo") ?? readField(barcodeRow, "ArticleCatNo")) ?? code;

      if (resolvedArticleId !== null) {
        const article = await fetchSingleBizniSoftArticle({ articleId: resolvedArticleId, sessionHandle, soapUrl });
        if (article) {
          return {
            ...article,
            barcode: article.barcode ?? resolvedBarcode,
            article_code: article.article_code ?? resolvedCode,
            raw: {
              ...article.raw,
              _barcodeSpec: barcodeRow
            }
          };
        }

        return {
          article_id: resolvedArticleId,
          article_code: resolvedCode,
          barcode: resolvedBarcode,
          cat_no: resolvedCode,
          name: null,
          raw: {
            _barcodeSpec: barcodeRow
          },
          unit: null
        };
      }
    } catch {
      // Try the next read-only barcode lookup shape.
    }
  }

  return null;
}

function normalizeArticle(raw: Record<string, unknown>): NormalizedBizniSoftArticle | null {
  const articleId = toNumber(readField(raw, "ID") ?? readField(raw, "ArticleID") ?? readField(raw, "Sifra") ?? readField(raw, "Šifra"));

  if (articleId === null) return null;

  return {
    article_id: articleId,
    article_code: toText(readField(raw, "Code") ?? readField(raw, "ArticleCode") ?? readField(raw, "CatNo") ?? readField(raw, "ArticleCatNo") ?? readField(raw, "Artikal")),
    barcode: toText(readField(raw, "Barcode") ?? readField(raw, "BarCode") ?? readField(raw, "EAN") ?? readField(raw, "Barkod")),
    cat_no: toText(readField(raw, "CatNo") ?? readField(raw, "ArticleCatNo")),
    name: toText(readField(raw, "Name") ?? readField(raw, "ArticleName") ?? readField(raw, "Naziv") ?? readField(raw, "NazivArtikla") ?? readField(raw, "Article_Name") ?? readField(raw, "Title")),
    raw: sanitizeRawObject(raw),
    unit: toText(readField(raw, "Unit") ?? readField(raw, "UnitName") ?? readField(raw, "UnitOfMeasure"))
  };
}

function rememberArticle({
  article,
  byArticleId,
  byBarcode,
  byCode
}: {
  article: NormalizedBizniSoftArticle;
  byArticleId: Map<number, NormalizedBizniSoftArticle>;
  byBarcode: Map<string, NormalizedBizniSoftArticle>;
  byCode: Map<string, NormalizedBizniSoftArticle>;
}) {
  byArticleId.set(article.article_id, article);
  if (article.barcode) byBarcode.set(article.barcode, article);
  if (article.article_code) byCode.set(article.article_code, article);
  if (article.cat_no) byCode.set(article.cat_no, article);
}

function articleBarcodeLookups(barcode: string) {
  return keyedLookups(["Barcode", "BarCode", "EAN", "Barkod"], barcode);
}

function articleCodeLookups(code: string) {
  return keyedLookups(["Code", "ArticleCode", "CatNo", "ArticleCatNo", "Artikal"], code);
}

function paddedArticleCode(articleId: number) {
  return String(articleId).padStart(6, "0");
}

function keyedLookups(keys: string[], value: string): Array<Record<string, string>> {
  return keys.map((key) => ({ [key]: value }));
}

async function debugArticleLookupRef({
  ref,
  sessionHandle,
  soapUrl
}: {
  ref: BizniSoftArticleLookupRef;
  sessionHandle: string;
  soapUrl: string;
}) {
  const attempts: Array<Record<string, unknown>> = [];
  const id = ref.articleId;
  const padded = id !== null ? paddedArticleCode(id) : ref.code;
  const requests: Array<{
    itemType: string;
    label: string;
    method: "GetItem" | "GetItems";
    request: Record<string, string | number>;
  }> = [];

  if (id !== null) {
    requests.push(
      { label: "GetItem ID", method: "GetItem", itemType: "itArticle", request: { ID: id } },
      { label: "GetItems ID", method: "GetItems", itemType: "itArticle", request: { ID: id } },
      { label: "GetItems ArticleID", method: "GetItems", itemType: "itArticle", request: { ArticleID: id } },
      { label: "GetItems itBarcodespec ArticleID", method: "GetItems", itemType: "itBarcodespec", request: { ArticleID: id } }
    );
  }

  if (padded) {
    requests.push(
      { label: "GetItems Code", method: "GetItems", itemType: "itArticle", request: { Code: padded } },
      { label: "GetItems ArticleCode", method: "GetItems", itemType: "itArticle", request: { ArticleCode: padded } },
      { label: "GetItems CatNo", method: "GetItems", itemType: "itArticle", request: { CatNo: padded } },
      { label: "GetItems itBarcodespec Code", method: "GetItems", itemType: "itBarcodespec", request: { Code: padded } }
    );
  }

  for (const request of requests) {
    try {
      const response =
        request.method === "GetItem"
          ? await getItem({
              itemType: request.itemType,
              jsonGetItemRequest: JSON.stringify(request.request),
              sessionHandle,
              soapUrl
            })
          : await getItems({
              itemType: request.itemType,
              jsonGetItemsRequest: JSON.stringify(request.request),
              limit: 10,
              sessionHandle,
              soapUrl
            });
      const rows = flattenBizniSoftRows(parsePossiblyNestedJson(response));
      attempts.push({
        label: request.label,
        ok: true,
        preview: rows.slice(0, 2).map((row) => ({
          ArticleID: readField(row, "ArticleID") ?? readField(row, "ID"),
          Barcode: readField(row, "Barcode") ?? readField(row, "BarCode") ?? readField(row, "EAN") ?? readField(row, "Barkod"),
          Code: readField(row, "Code") ?? readField(row, "ArticleCode") ?? readField(row, "CatNo") ?? readField(row, "ArticleCatNo"),
          Name: readField(row, "Name") ?? readField(row, "ArticleName") ?? readField(row, "Naziv") ?? readField(row, "NazivArtikla")
        })),
        rowCount: rows.length
      });
    } catch (error) {
      attempts.push({
        label: request.label,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    articleId: id,
    code: padded,
    attempts
  };
}

function readSaleActionName(raw: Record<string, unknown>) {
  return toText(
    readField(raw, "ActionName") ??
      readField(raw, "SaleActionName") ??
      readField(raw, "Name") ??
      readField(raw, "Description") ??
      readField(raw, "Caption") ??
      readField(raw, "Title") ??
      readField(raw, "ActionTitle") ??
      readField(raw, "Naziv") ??
      readField(raw, "NazivAkcije")
  );
}

function normalizeLookupText(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim() || null;
}

function parsePossiblyNestedJson(value: string): unknown {
  let parsed: unknown = value;

  for (let index = 0; index < 3 && typeof parsed === "string"; index += 1) {
    parsed = JSON.parse(parsed);
  }

  return parsed;
}

function flattenBizniSoftRows(value: unknown): Array<Record<string, unknown>> {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flat(Infinity).filter(isRecord);
  }

  if (isRecord(value)) {
    const nestedRows = extractRows(value);
    return nestedRows.length > 0 ? nestedRows : [value];
  }

  return [];
}

function extractSaleActionRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter(isSaleActionLike);
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const objectValue = value as Record<string, unknown>;

  const directRows = extractRows(objectValue).filter(isSaleActionLike);
  if (directRows.length > 0) return directRows;

  for (const candidate of Object.values(objectValue)) {
    const nested = extractSaleActionRows(candidate);
    if (nested.length > 0) return nested;
  }

  return [];
}

function sourceKeyFromRaw(raw: Record<string, unknown>) {
  return [
    toNumberSourcePart(readField(raw, "ActionType"), "NO_ACTION_TYPE"),
    toNumberSourcePart(readField(raw, "StorageID"), "ALL"),
    toNumberSourcePart(readField(raw, "ArticleID"), "NO_ARTICLE"),
    toNumberSourcePart(readField(raw, "ArticleAttributeID"), "NO_ARTICLE_ATTR"),
    toNumberSourcePart(readField(raw, "CustomerAttributeID"), "NO_CUSTOMER_ATTR"),
    toNumberSourcePart(readField(raw, "PartnerID"), "NO_PARTNER"),
    toNumberSourcePart(readField(raw, "LoyaltyLevel"), "0"),
    toNumberSourcePart(readField(raw, "AmountFrom"), "NO_AMOUNT_FROM"),
    toNumberSourcePart(readField(raw, "AmountTo"), "NO_AMOUNT_TO"),
    toNumberSourcePart(readField(raw, "ValueFrom"), "NO_VALUE_FROM"),
    toNumberSourcePart(readField(raw, "ValueTo"), "NO_VALUE_TO"),
    toNumberSourcePart(readField(raw, "DiscountPercent"), "NO_DISCOUNT"),
    toNumberSourcePart(readField(raw, "WholesalePrice"), "NO_WHOLESALE"),
    toNumberSourcePart(readField(raw, "RetailPrice"), "NO_RETAIL"),
    toDateSourcePart(readField(raw, "FromChapter"), "NO_FROM"),
    toDateSourcePart(readField(raw, "ChapterTo"), "NO_TO"),
    toNumberSourcePart(readField(raw, "PriorityLevel"), "0"),
    toBooleanSourcePart(readField(raw, "AttributeSum"), "false"),
    toBooleanSourcePart(readField(raw, "ForInvoiceLevel"), "false"),
    toBooleanSourcePart(readField(raw, "NoAction"), "false"),
    toBooleanSourcePart(readField(raw, "ActionDiscount"), "false")
  ].join("__");
}

function toNumberSourcePart(value: unknown, fallback: string) {
  if (value === null || value === undefined || value === "") return fallback;

  const number = toNumber(value);
  return number === null ? String(value).trim().replace(/\s+/g, " ") : String(number);
}

function toDateSourcePart(value: unknown, fallback: string) {
  if (value === null || value === undefined || value === "") return fallback;
  return toIsoDateTime(value) ?? String(value).trim().replace(/\s+/g, " ");
}

function toBooleanSourcePart(value: unknown, fallback: string) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "boolean") return String(value);

  const raw = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "da"].includes(raw)) return "true";
  if (["0", "false", "no", "ne"].includes(raw)) return "false";

  return raw || fallback;
}

function previewRow(row: Record<string, unknown>) {
  return {
    ActionType: readField(row, "ActionType"),
    ArticleAttributeID: readField(row, "ArticleAttributeID"),
    ArticleID: readField(row, "ArticleID"),
    ChapterTo: readField(row, "ChapterTo"),
    DiscountPercent: readField(row, "DiscountPercent"),
    FromChapter: readField(row, "FromChapter"),
    LoyaltyLevel: readField(row, "LoyaltyLevel"),
    RetailPrice: readField(row, "RetailPrice"),
    StorageID: readField(row, "StorageID")
  };
}

function extractRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const objectValue = value as Record<string, unknown>;

  for (const candidate of [objectValue.Items, objectValue.items, objectValue.Data, objectValue.data, objectValue.Rows, objectValue.rows]) {
    const rows = extractRows(candidate);
    if (rows.length > 0) return rows;
  }

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isSaleActionLike(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;

  const keys = Object.keys(value as Record<string, unknown>).map((key) => key.toLowerCase());
  return keys.includes("actiontype") || keys.includes("articleid") || keys.includes("storageid");
}

function readField(row: Record<string, unknown>, field: string) {
  const direct = row[field];
  if (direct !== undefined) return direct;

  const lowerField = field.toLowerCase();
  const key = Object.keys(row).find((candidate) => candidate.toLowerCase() === lowerField);
  return key ? row[key] : null;
}

function sanitizeRawObject(row: Record<string, unknown>) {
  const sanitized = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
  return Object.keys(sanitized).length > 0 ? sanitized : {};
}

function stableHash(value: unknown) {
  const text = stableStringify(value);
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const objectValue = value as Record<string, unknown>;
  return `{${Object.keys(objectValue)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`)
    .join(",")}}`;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function toText(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim() || null;
}

function toIsoDateTime(value: unknown) {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const raw = String(value).trim();
  const jsonDate = raw.match(/\/Date\((\d+)\)\//);
  if (jsonDate) return new Date(Number(jsonDate[1])).toISOString();

  const serbianDate = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\.?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (serbianDate) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = serbianDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:${second.padStart(2, "0")}+01:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw}T00:00:00+01:00`;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
