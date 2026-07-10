import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import type { ArticleLookupItem } from "@/lib/types";

export const dynamic = "force-dynamic";

type LookupResponse = {
  article: ArticleLookupItem | null;
  articles: ArticleLookupItem[];
  error: string | null;
};

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const barcode = searchParams.get("barcode")?.trim();
  const articleId = searchParams.get("article_id")?.trim();
  const q = searchParams.get("q")?.trim();

  try {
    if (barcode) {
      const articles = await lookupByField("barcode", barcode);
      return jsonResult(articles[0] ?? null, articles);
    }

    if (articleId) {
      const numericArticleId = Number(articleId);
      if (!Number.isInteger(numericArticleId)) return jsonResult(null, [], "ArticleID nije ispravan.");

      const articles = await lookupByField("article_id", numericArticleId);
      return jsonResult(articles[0] ?? null, articles);
    }

    if (q && q.length >= 2) {
      const articles = await searchArticles(q);
      return jsonResult(articles.length === 1 ? articles[0] : null, articles);
    }

    return jsonResult(null, []);
  } catch (error) {
    return jsonResult(null, [], error instanceof Error ? error.message : "Pretraga nije uspela.");
  }
}

async function lookupByField(field: "barcode" | "article_id", value: string | number) {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("biznisoft_stock_price_current")
    .select("article_id, name, barcode, unit, storage_id, raw, last_seen_at")
    .eq(field, value)
    .order("last_seen_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);
  return dedupeArticles(data ?? []);
}

async function searchArticles(q: string) {
  const supabase = createServiceClient();
  const maybeId = Number(q);
  let query = supabase
    .from("biznisoft_stock_price_current")
    .select("article_id, name, barcode, unit, storage_id, raw, last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(80);

  query = Number.isInteger(maybeId)
    ? query.or(`name.ilike.%${escapeLike(q)}%,barcode.ilike.%${escapeLike(q)}%,article_id.eq.${maybeId}`)
    : query.or(`name.ilike.%${escapeLike(q)}%,barcode.ilike.%${escapeLike(q)}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return dedupeArticles(data ?? []).slice(0, 20);
}

function jsonResult(article: ArticleLookupItem | null, articles: ArticleLookupItem[], error: string | null = null) {
  return NextResponse.json({ article, articles, error } satisfies LookupResponse);
}

function dedupeArticles(rows: Array<Record<string, unknown>>): ArticleLookupItem[] {
  const map = new Map<string, ArticleLookupItem>();

  for (const row of rows) {
    const articleId = Number(row.article_id);
    if (!Number.isInteger(articleId)) continue;

    const barcode = typeof row.barcode === "string" ? row.barcode : null;
    const key = `${articleId}:${barcode ?? ""}`;
    if (map.has(key)) continue;

    map.set(key, {
      article_id: articleId,
      barcode,
      name: typeof row.name === "string" && row.name ? row.name : `Nepoznat artikal (ID: ${articleId})`,
      raw: typeof row.raw === "object" && row.raw !== null ? (row.raw as Record<string, unknown>) : {},
      storage_id: typeof row.storage_id === "number" ? row.storage_id : null,
      unit: typeof row.unit === "string" ? row.unit : null
    });
  }

  return Array.from(map.values());
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, "");
}
