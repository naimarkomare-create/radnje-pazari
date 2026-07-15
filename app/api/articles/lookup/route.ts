import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileWithClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import type { ArticleLookupItem } from "@/lib/types";

export const dynamic = "force-dynamic";

type LookupResponse = {
  article: ArticleLookupItem | null;
  articles: ArticleLookupItem[];
  error: string | null;
};

export async function GET(request: NextRequest) {
  const authClient = createClient();
  const profile = await getCurrentProfileWithClient(authClient);

  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const barcode = searchParams.get("barcode")?.trim();
  const articleId = searchParams.get("article_id")?.trim();
  const q = searchParams.get("q")?.trim();
  const supabase = createServiceClient();

  try {
    if (barcode) {
      const articles = await lookupByField(supabase, "barcode", barcode);
      return jsonResult(articles[0] ?? null, articles);
    }

    if (articleId) {
      const numericArticleId = Number(articleId);
      if (!Number.isInteger(numericArticleId)) return jsonResult(null, [], "ArticleID nije ispravan.");

      const articles = await lookupByField(supabase, "article_id", numericArticleId);
      return jsonResult(articles[0] ?? null, articles);
    }

    if (q && q.length >= 2) {
      const articles = await searchArticles(supabase, q);
      return jsonResult(articles.length === 1 ? articles[0] : null, articles);
    }

    return jsonResult(null, []);
  } catch (error) {
    return jsonResult(null, [], "Pretraga nije uspela.");
  }
}

async function lookupByField(
  supabase: ReturnType<typeof createServiceClient>,
  field: "barcode" | "article_id",
  value: string | number
) {
  const { data, error } = await supabase
    .from("biznisoft_article_lookup")
    .select("article_id, name, barcode, unit")
    .eq(field, value)
    .limit(20);

  if (error) throw new Error(error.message);
  return dedupeArticles(data ?? []);
}

async function searchArticles(supabase: ReturnType<typeof createServiceClient>, q: string) {
  const { data, error } = await supabase
    .from("biznisoft_article_lookup")
    .select("article_id, name, barcode, unit")
    .ilike("name", `%${escapeLike(q)}%`)
    .limit(20);
  if (error) throw new Error(error.message);
  return dedupeArticles(data ?? []);
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
    const key = String(articleId);
    if (map.has(key)) continue;

    map.set(key, {
      article_id: articleId,
      barcode,
      name: typeof row.name === "string" && row.name ? row.name : `Nepoznat artikal (ID: ${articleId})`,
      unit: typeof row.unit === "string" ? row.unit : null
    });
  }

  return Array.from(map.values());
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, "").slice(0, 80);
}
