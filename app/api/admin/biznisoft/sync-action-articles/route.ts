import { withIntegrationLock } from "@/lib/security/sync-lock";
import { readJsonObject } from "@/lib/security/validation";
import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import {
  fetchBizniSoftArticleBatchForSaleActions,
  type NormalizedBizniSoftArticle
} from "@/lib/biznisoft/sale-actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const REMOTE_BATCH_SIZE = 3;

type ArticleCacheRow = {
  article_id: number;
  article_code: string | null;
  barcode: string | null;
  cat_no: string | null;
  name: string | null;
  raw: Record<string, unknown> | null;
  unit: string | null;
};

type StockArticleRow = {
  article_id: number;
  barcode: string | null;
  name: string | null;
  raw: Record<string, unknown> | null;
  unit: string | null;
};

export async function POST(request: NextRequest) {
  const authorization = await authorizeApi(undefined, true);
  if (!authorization.ok) return authorization.response;

  return withIntegrationLock(async () => {

    const body = (await readJsonObject(request)) as {
      excludedArticleIds?: unknown;
    };
    const excludedArticleIds = normalizedExcludedIds(body.excludedArticleIds);

    try {
      const supabase = createClient();
      const actionsResult = await supabase
        .from("biznisoft_sale_actions")
        .select("article_id")
        .not("article_id", "is", null)
        .limit(10000);

      if (actionsResult.error) throw new Error(actionsResult.error.message);

      const articleIds = Array.from(
        new Set(
          (actionsResult.data ?? [])
            .map((row) => row.article_id)
            .filter(
              (articleId): articleId is number =>
                typeof articleId === "number" &&
                Number.isInteger(articleId) &&
                articleId > 0
            )
        )
      ).sort((left, right) => left - right);

      if (articleIds.length === 0) {
        return NextResponse.json({
          complete: true,
          createdCount: 0,
          failedBatch: [],
          partial: false,
          processedArticles: 0,
          remainingArticles: 0,
          resolvedArticles: 0,
          skippedCount: 0,
          totalArticles: 0,
          updatedCount: 0
        });
      }

      const cacheResult = await supabase
        .from("biznisoft_articles")
        .select("article_id, article_code, name, barcode, cat_no, unit, raw")
        .in("article_id", articleIds);

      if (cacheResult.error) throw new Error(cacheResult.error.message);

      const cacheById = new Map<number, ArticleCacheRow>(
        ((cacheResult.data ?? []) as ArticleCacheRow[]).map((row) => [
          row.article_id,
          row
        ])
      );
      const initiallyResolved = articleIds.filter((articleId) =>
        hasArticleName(cacheById.get(articleId))
      ).length;
      let createdCount = 0;
      let updatedCount = 0;
      let localCacheUpserted = 0;
      const localCandidates = articleIds.filter((articleId) => {
        const article = cacheById.get(articleId);
        return !hasArticleName(article) || !article?.barcode;
      });

      if (localCandidates.length > 0) {
        const stockResult = await supabase
          .from("biznisoft_stock_price_current")
          .select("article_id, name, barcode, unit, raw")
          .in("article_id", localCandidates)
          .limit(1000);

        if (stockResult.error) throw new Error(stockResult.error.message);

        const stockById = bestStockRows(
          (stockResult.data ?? []) as StockArticleRow[]
        );
        const now = new Date().toISOString();
        const localUpserts = localCandidates
          .map((articleId) => {
            const current = cacheById.get(articleId);
            const stock = stockById.get(articleId);
            if (!stock) return null;

            const merged = articleFromStock({ articleId, current, stock });
            if (!hasArticleName(merged) && !merged.barcode) return null;
            if (current && !articleCacheChanged(current, merged)) return null;
            return { ...merged, synced_at: now };
          })
          .filter(
            (
              article
            ): article is ArticleCacheRow & {
              synced_at: string;
            } => article !== null
          );

        if (localUpserts.length > 0) {
          const localUpsertResult = await supabase
            .from("biznisoft_articles")
            .upsert(localUpserts, { onConflict: "article_id" });

          if (localUpsertResult.error) {
            throw new Error(localUpsertResult.error.message);
          }

          for (const article of localUpserts) {
            if (cacheById.has(article.article_id)) updatedCount += 1;
            else createdCount += 1;
            cacheById.set(article.article_id, article);
          }
          localCacheUpserted = localUpserts.length;
        }
      }

      const unresolvedBeforeSoap = articleIds.filter(
        (articleId) => !hasArticleName(cacheById.get(articleId))
      );
      const soapBatch = unresolvedBeforeSoap
        .filter((articleId) => !excludedArticleIds.has(articleId))
        .slice(0, REMOTE_BATCH_SIZE);
      let failedBatch: Array<{
        articleId: number;
        code: string;
        message: string;
      }> = [];

      if (soapBatch.length > 0) {
        const remoteResult =
          await fetchBizniSoftArticleBatchForSaleActions(soapBatch);
        const now = new Date().toISOString();
        const remoteUpserts = remoteResult.articles.map((article) => ({
          ...mergeRemoteArticle(cacheById.get(article.article_id), article),
          synced_at: now
        }));

        if (remoteUpserts.length > 0) {
          const remoteUpsertResult = await supabase
            .from("biznisoft_articles")
            .upsert(remoteUpserts, { onConflict: "article_id" });

          if (remoteUpsertResult.error) {
            return NextResponse.json(
              {
                error:
                  "Artikli su preuzeti, ali čuvanje u bazi nije završeno.",
                retryable: true
              },
              { status: 500 }
            );
          }

          for (const article of remoteUpserts) {
            if (cacheById.has(article.article_id)) updatedCount += 1;
            else createdCount += 1;
            cacheById.set(article.article_id, article);
          }
        }

        failedBatch = [
          ...remoteResult.failures,
          ...remoteResult.articles
            .filter((article) => !article.name?.trim())
            .map((article) => ({
              articleId: article.article_id,
              code: "invalid_response",
              message: "BizniSoft odgovor nema naziv artikla."
            }))
        ];
      }

      const failedIds = new Set([
        ...excludedArticleIds,
        ...failedBatch.map((failure) => failure.articleId)
      ]);
      const unresolvedArticleIds = articleIds.filter(
        (articleId) => !hasArticleName(cacheById.get(articleId))
      );
      const retryableRemaining = unresolvedArticleIds.filter(
        (articleId) => !failedIds.has(articleId)
      );
      const complete = retryableRemaining.length === 0;
      const resolvedArticles = articleIds.length - unresolvedArticleIds.length;
      const processedArticles =
        articleIds.length - retryableRemaining.length;

      return NextResponse.json({
        complete,
        createdCount,
        failedBatch,
        localCacheUpserted,
        partial: complete && unresolvedArticleIds.length > 0,
        processedArticles,
        remainingArticles: retryableRemaining.length,
        resolvedArticles,
        skippedCount: initiallyResolved,
        soapBatchAttempted: soapBatch.length,
        totalArticles: articleIds.length,
        unresolvedArticleIds: unresolvedArticleIds.slice(0, 100),
        updatedCount
      });
    } catch (error) {
      const message = safeSyncError(error);
      console.error("BizniSoft action article batch sync failed", { message });
      return NextResponse.json(
        { error: message, retryable: true },
        { status: 502 }
      );
    }
  });
}

function normalizedExcludedIds(value: unknown) {
  if (!Array.isArray(value)) return new Set<number>();

  return new Set(
    value
      .slice(0, 500)
      .map(Number)
      .filter(
        (articleId) => Number.isInteger(articleId) && articleId > 0
      )
  );
}

function bestStockRows(rows: StockArticleRow[]) {
  const byId = new Map<number, StockArticleRow>();

  for (const row of rows) {
    const current = byId.get(row.article_id);
    const currentScore = Number(Boolean(current?.name)) + Number(Boolean(current?.barcode));
    const nextScore = Number(Boolean(row.name)) + Number(Boolean(row.barcode));
    if (!current || nextScore > currentScore) byId.set(row.article_id, row);
  }

  return byId;
}

function articleFromStock({
  articleId,
  current,
  stock
}: {
  articleId: number;
  current: ArticleCacheRow | undefined;
  stock: StockArticleRow;
}): ArticleCacheRow {
  const stockRaw = isRecord(stock.raw) ? stock.raw : {};

  return {
    article_id: articleId,
    article_code:
      current?.article_code ??
      toText(
        readRaw(stockRaw, "Code") ??
          readRaw(stockRaw, "ArticleCode") ??
          readRaw(stockRaw, "CatNo") ??
          readRaw(stockRaw, "ArticleCatNo")
      ),
    barcode: current?.barcode ?? stock.barcode,
    cat_no:
      current?.cat_no ??
      toText(
        readRaw(stockRaw, "CatNo") ??
          readRaw(stockRaw, "ArticleCatNo")
      ),
    name: current?.name ?? stock.name,
    raw:
      Object.keys(stockRaw).length > 0
        ? stockRaw
        : current?.raw ?? {},
    unit: current?.unit ?? stock.unit
  };
}

function mergeRemoteArticle(
  current: ArticleCacheRow | undefined,
  article: NormalizedBizniSoftArticle
): ArticleCacheRow {
  return {
    article_id: article.article_id,
    article_code: article.article_code ?? current?.article_code ?? null,
    barcode: article.barcode ?? current?.barcode ?? null,
    cat_no: article.cat_no ?? current?.cat_no ?? null,
    name: article.name ?? current?.name ?? null,
    raw:
      Object.keys(article.raw).length > 0
        ? article.raw
        : current?.raw ?? {},
    unit: article.unit ?? current?.unit ?? null
  };
}

function hasArticleName(article: ArticleCacheRow | undefined) {
  return Boolean(article?.name?.trim());
}

function articleCacheChanged(
  current: ArticleCacheRow,
  next: ArticleCacheRow
) {
  return (
    current.article_code !== next.article_code ||
    current.barcode !== next.barcode ||
    current.cat_no !== next.cat_no ||
    current.name !== next.name ||
    current.unit !== next.unit
  );
}

function readRaw(raw: Record<string, unknown>, field: string) {
  const direct = raw[field];
  if (direct !== undefined) return direct;

  const lowerField = field.toLowerCase();
  return Object.entries(raw).find(
    ([key]) => key.toLowerCase() === lowerField
  )?.[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toText(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim() || null;
}

function safeSyncError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  if (/timed out|timeout|fetch failed|econnreset|socket/i.test(message)) {
    return "BizniSoft servis nije odgovorio na vreme.";
  }

  if (/session|login|database/i.test(message)) {
    return "Prijava na BizniSoft servis nije uspela.";
  }

  if (/BIZNISOFT_/i.test(message)) {
    return "BizniSoft podešavanje na serveru nije ispravno.";
  }

  return "Sinhronizacija artikala nije uspela u ovom koraku.";
}
