import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { fetchBizniSoftArticlesForSaleActionRefs } from "@/lib/biznisoft/sale-actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const supabase = createClient();
    const actionsResult = await supabase
      .from("biznisoft_sale_actions")
      .select("article_id, raw")
      .limit(10000);

    if (actionsResult.error) {
      return NextResponse.json({ error: actionsResult.error.message }, { status: 500 });
    }

    const saleActionsCount = actionsResult.data?.length ?? 0;
    const refs = (actionsResult.data ?? []).map((row) => {
      const raw = isRecord(row.raw) ? row.raw : {};

      return {
        articleId: typeof row.article_id === "number" && Number.isFinite(row.article_id) ? row.article_id : toNumber(readRaw(raw, "ArticleID")),
        barcode: toText(readRaw(raw, "Barcode") ?? readRaw(raw, "BarCode") ?? readRaw(raw, "EAN") ?? readRaw(raw, "barkod")),
        code: toText(
          readRaw(raw, "ArticleCode") ??
            readRaw(raw, "ArticleNo") ??
            readRaw(raw, "Code") ??
            readRaw(raw, "CatNo") ??
            readRaw(raw, "ArticleCatNo") ??
            readRaw(raw, "Artikal")
        )
      };
    });
    const rowsWithArticleId = refs.filter((ref) => ref.articleId !== null).length;
    const {
      articleRowsResolvedByBarcode,
      articleRowsResolvedByCode,
      articleRowsResolvedByID,
      articles,
      barcodeRowsFetched,
      testArticles,
      uniqueArticleIdCount,
      unresolvedArticleRows
    } = await fetchBizniSoftArticlesForSaleActionRefs(refs);
    const fetchedIds = new Set(articles.map((article) => article.article_id));
    const missingArticles = refs.filter((ref) => ref.articleId !== null && !fetchedIds.has(ref.articleId)).length;
    const unresolvedArticleIds = Array.from(
      new Set(refs.map((ref) => ref.articleId).filter((articleId): articleId is number => articleId !== null && !fetchedIds.has(articleId)))
    );
    const now = new Date().toISOString();
    let upsertedArticles = 0;

    if (articles.length > 0) {
      const articlesResult = await supabase.from("biznisoft_articles").upsert(
        articles.map((article) => ({
          ...article,
          synced_at: now
        })),
        {
          onConflict: "article_id"
        }
      );

      if (articlesResult.error) {
        return NextResponse.json({ error: articlesResult.error.message }, { status: 500 });
      }

      upsertedArticles = articles.length;
    }

    console.log(`BizniSoft sale actions count: ${saleActionsCount}`);
    console.log(`BizniSoft unique ArticleID count: ${uniqueArticleIdCount}`);
    console.log(`BizniSoft articles fetched count: ${articles.length}`);
    console.log(`BizniSoft articles upserted count: ${upsertedArticles}`);

    return NextResponse.json({
      actionRowsWithArticleId: rowsWithArticleId,
      articleRowsFetchedByCode: articleRowsResolvedByCode,
      articleRowsFetchedById: articleRowsResolvedByID,
      articleRowsResolvedByBarcode,
      articleRowsResolvedByCode,
      articleRowsResolvedByID,
      articlesUpserted: upsertedArticles,
      barcodeRowsFetched,
      fetchedArticles: articles.length,
      missingArticles,
      syncedAt: now,
      testArticles,
      uniqueArticleIds: uniqueArticleIdCount,
      uniqueArticleIdsCount: uniqueArticleIdCount,
      unresolvedArticleIds,
      unresolvedArticleRows,
      upsertedArticles
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "BizniSoft article sync failed." },
      { status: 500 }
    );
  }
}

function readRaw(raw: Record<string, unknown>, field: string) {
  const direct = raw[field];
  if (direct !== undefined) return direct;

  const lowerField = field.toLowerCase();
  const entry = Object.entries(raw).find(([key]) => key.toLowerCase() === lowerField);
  return entry?.[1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function toText(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value).trim() || null;
}

function toNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const normalized = typeof value === "string" ? value.replace(",", ".") : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}
