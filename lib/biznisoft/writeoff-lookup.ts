import "server-only";
import { createServiceClient } from "@/lib/supabase/service";
import { formatBizniSoftArticleCode, numericValue, readRawField, textValue } from "@/lib/popis-otpis";
import { DEFAULT_STOCK_FRESHNESS_MINUTES, stockIsStale } from "@/lib/stock-freshness";
import { getBizniSoftCredentials, getItem, getSessionHandle } from "@/lib/biznisoft/soap-client";
import { todayInBelgrade } from "@/lib/date";

export function stockFreshnessMinutes() {
  const configured = Number(process.env.BIZNISOFT_STOCK_FRESHNESS_MINUTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_STOCK_FRESHNESS_MINUTES;
}

// Catalog/barcode identity is independent of supplier and selected-store stock quantities.
export async function lookupWriteoffArticles(storageId: number, barcode: string, options: { articleId?: number } = {}) {
  const client = createServiceClient();
  const [stock, catalog] = await Promise.all([
    client.from("biznisoft_stock_price_current").select("article_id, name, barcode, unit, retail_price, last_seen_at, raw").eq("storage_key", String(storageId)).eq("barcode", barcode).order("last_seen_at", { ascending: false }).limit(20),
    client.from("biznisoft_articles").select("article_id, article_code, name, barcode, unit, raw").eq("barcode", barcode).limit(20)
  ]);
  // A database failure must not be misrepresented as a product that does not exist.
  if (catalog.error) throw new Error("Katalog artikala trenutno nije dostupan.");
  const stockRows = stock.error ? [] : stock.data ?? [];
  const catalogRows = catalog.data ?? [];
  // Existing article sync stores verified itBarcodespec results here; preserve collisions even if a primary barcode matched.
  const aliases = await Promise.all(["Barcode", "BarCode", "EAN"].map((field) => client.from("biznisoft_articles")
    .select("article_id, article_code, name, barcode, unit, raw").eq(`raw->_barcodeSpec->>${field}`, barcode).limit(20)));
  for (const alias of aliases) {
      if (alias.error) throw new Error("Katalog barkodova trenutno nije dostupan.");
      for (const row of alias.data ?? []) {
        const raw = row.raw as Record<string, unknown> | null;
        const spec = raw?._barcodeSpec as Record<string, unknown> | undefined;
        if (numericValue(readRawField(spec, ["ArticleID", "ID"])) === row.article_id) catalogRows.push(row);
      }
  }
  const ids = [...new Set([...stockRows.map((row) => row.article_id), ...catalogRows.map((row) => row.article_id)])]
    .filter((id) => options.articleId === undefined || id === options.articleId);
  if (!ids.length) return [];
  const [details, relations, selectedStock] = await Promise.all([
    client.from("biznisoft_articles").select("article_id, article_code, name, barcode, unit, raw").in("article_id", ids),
    client.from("article_suppliers").select("article_id, is_primary, supplier:biznisoft_suppliers!inner(id, name, is_active)").in("article_id", ids).eq("supplier.is_active", true),
    client.from("biznisoft_stock_price_current").select("article_id, name, barcode, unit, retail_price, last_seen_at, raw").eq("storage_key", String(storageId)).in("article_id", ids).limit(20)
  ]);
  if (details.error) throw new Error("Katalog artikala trenutno nije dostupan.");
  const cache = new Map((details.data ?? []).map((row) => [row.article_id, row]));
  const prices = new Map((selectedStock.error ? [] : selectedStock.data ?? []).map((row) => [row.article_id, row]));
  const threshold = stockFreshnessMinutes();
  const candidates = ids.flatMap((id) => {
    if (!Number.isInteger(id) || id <= 0) return [];
    const cached = cache.get(id);
    const matchedStock = stockRows.find((row) => row.article_id === id);
    const stored = prices.get(id) ?? matchedStock;
    const name = textValue(cached?.name) ?? textValue(stored?.name);
    if (!name) return [];
    const stockRaw = (stored?.raw ?? {}) as Record<string, unknown>;
    const articleRaw = (cached?.raw ?? {}) as Record<string, unknown>;
    const raw = { ...articleRaw, ...stockRaw };
    const cachedPrice = numericValue(stored?.retail_price);
    const fresh = Boolean(stored?.last_seen_at) && stored !== undefined && !stockIsStale(stored.last_seen_at, threshold) &&
      todayInBelgrade(new Date(stored.last_seen_at)) === todayInBelgrade();
    // Freshness is a warning, not permission to erase a verified selected-store price.
    const price = cachedPrice !== null && cachedPrice >= 0 ? cachedPrice : null;
    return [{ article_id: id, article_code: textValue(cached?.article_code) ?? textValue(readRawField(raw, ["Code", "ArticleCode", "CatNo", "ArticleCatNo"])) ?? formatBizniSoftArticleCode(id),
      article_name: name, name, barcode, unit: stored?.unit ?? cached?.unit ?? null,
      stock_amount: null, stock_fetched_at: null,
      price, price_checked_at: price === null ? null : stored?.last_seen_at ?? null,
      price_source: price === null ? "selection_required" : "cache",
      price_message: price !== null && !fresh ? "Cena je iz poslednje sinhronizacije izabrane radnje. Proverite je pre otpisa." : null as string | null,
      account: textValue(readRawField(raw, ["Account", "Konto"])),
      level_price: numericValue(readRawField(raw, ["LevelPrice", "NivCena", "NivPrice"])),
      popdv_id: textValue(readRawField(raw, ["POPDVID", "POPDVId", "POPDV_ID", "PdvId"])),
      vat_transaction_type: textValue(readRawField(raw, ["VATTransactionType", "VatTransactionType", "TaxTransactionType", "VrstaPDVPrometa"])),
      operator_name: textValue(readRawField(raw, ["Operater", "Operator"])), modify_time: textValue(readRawField(raw, ["ModifyTime", "ModificationTime"])),
      suppliers: (relations.error ? [] : relations.data ?? []).flatMap((row) => {
        if (row.article_id !== id) return [];
        const supplier = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier;
        return supplier ? [{ id: supplier.id, name: supplier.name, is_primary: row.is_primary === true }] : [];
      })
    }];
  });
  // Resolve only the explicitly identified article, never every candidate sharing a barcode.
  if (candidates.length === 1 && candidates[0].price === null) {
    const candidate = candidates[0];
    try {
      const credentials = getBizniSoftCredentials();
      const sessionHandle = await getSessionHandle(credentials);
      const businessDate = todayInBelgrade();
      const json = await getItem({ soapUrl: credentials.soapUrl, sessionHandle, itemType: "qtArticlePriceForPOS",
        jsonGetItemRequest: JSON.stringify({ StorageID: storageId, Date: businessDate, ArticleID: candidate.article_id }) });
      const rows = flattenPriceRows(JSON.parse(json));
      const row = rows.length === 1 ? rows[0] : null;
      const value = numericValue(readRawField(row, ["PriceWithVat"]));
      const returnedDate = textValue(readRawField(row, ["Date"]));
      if (!row || numericValue(readRawField(row, ["StorageID"])) !== storageId ||
        numericValue(readRawField(row, ["ArticleID"])) !== candidate.article_id ||
        !returnedDate || returnedDate.slice(0, 10) !== businessDate || value === null || value < 0) {
        throw new Error("Price identity could not be verified");
      }
      candidate.price = value;
      candidate.price_source = "live";
      candidate.price_checked_at = new Date().toISOString();
    } catch {
      candidate.price_source = "unavailable";
      candidate.price_message = "Artikal je pronađen. Aktuelna cena za izabranu radnju nije dostupna.";
      console.error("Write-off article price lookup unavailable.", { storageId, articleId: candidate.article_id });
    }
  }
  return candidates;
}

function flattenPriceRows(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(flattenPriceRows);
  return value && typeof value === "object" ? [value as Record<string, unknown>] : [];
}
