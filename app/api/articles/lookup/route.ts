import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileWithClient } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import type { ArticleLookupItem, ArticleSupplierOption } from "@/lib/types";

export const dynamic = "force-dynamic";
const SOURCE_ROW_LIMIT = 200;
const RESULT_LIMIT = 20;

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
      const articles = await attachSuppliers(
        supabase,
        await lookupByField(supabase, "barcode", barcode)
      );
      return jsonResult(articles[0] ?? null, articles);
    }

    if (articleId) {
      const numericArticleId = Number(normalizeIdentifier(articleId));
      if (!Number.isSafeInteger(numericArticleId)) {
        return jsonResult(null, [], "ArticleID nije ispravan.");
      }

      const articles = await attachSuppliers(
        supabase,
        await lookupByField(supabase, "article_id", numericArticleId)
      );
      return jsonResult(articles[0] ?? null, articles);
    }

    if (q && q.length >= 2) {
      const articles = await attachSuppliers(supabase, await searchArticles(supabase, q));
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
    .from("biznisoft_stock_price_current")
    .select("article_id, name, barcode, unit")
    .eq(field, value)
    .order("last_seen_at", { ascending: false })
    .limit(SOURCE_ROW_LIMIT);

  if (error) throw new Error(error.message);
  return dedupeArticles(data ?? []).slice(0, RESULT_LIMIT);
}

async function searchArticles(supabase: ReturnType<typeof createServiceClient>, q: string) {
  const { data, error } = await supabase
    .from("biznisoft_stock_price_current")
    .select("article_id, name, barcode, unit")
    .ilike("name", `%${escapeLike(q)}%`)
    .order("last_seen_at", { ascending: false })
    .limit(SOURCE_ROW_LIMIT);
  if (error) throw new Error(error.message);
  return dedupeArticles(data ?? []).slice(0, RESULT_LIMIT);
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
      code: normalizeIdentifier(row.article_id),
      id: normalizeIdentifier(row.article_id),
      article_id: articleId,
      barcode,
      name: typeof row.name === "string" && row.name ? row.name : `Nepoznat artikal (ID: ${articleId})`,
      suppliers: [],
      unit: typeof row.unit === "string" ? row.unit : null
    });
  }

  return Array.from(map.values());
}

async function attachSuppliers(
  supabase: ReturnType<typeof createServiceClient>,
  articles: ArticleLookupItem[]
) {
  if (articles.length === 0) return articles;
  const articleIds = articles.map((article) => article.article_id);
  const { data, error } = await supabase
    .from("article_suppliers")
    .select(
      "article_id, is_primary, relation_source, supplier:biznisoft_suppliers!inner(id, biznisoft_partner_id, name, is_active)"
    )
    .in("article_id", articleIds)
    .eq("supplier.is_active", true);

  if (error) throw new Error(error.message);
  const suppliersByArticle = new Map<number, Map<string, ArticleSupplierOption>>();

  for (const row of data ?? []) {
    const articleId = Number(row.article_id);
    const supplier = relationValue(row.supplier);
    if (!Number.isInteger(articleId) || !supplier) continue;
    if (
      typeof supplier.id !== "string" ||
      typeof supplier.biznisoft_partner_id !== "string" ||
      typeof supplier.name !== "string"
    ) {
      continue;
    }

    const suppliers = suppliersByArticle.get(articleId) ?? new Map<string, ArticleSupplierOption>();
    suppliers.set(supplier.id, {
      id: supplier.id,
      isPrimary: row.is_primary === true,
      name: supplier.name,
      partnerId: supplier.biznisoft_partner_id,
      relationSource:
        typeof row.relation_source === "string"
          ? row.relation_source
          : "purchase_calculation"
    });
    suppliersByArticle.set(articleId, suppliers);
  }

  return articles.map((article) => ({
    ...article,
    suppliers: Array.from(
      suppliersByArticle.get(article.article_id)?.values() ?? []
    ).sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
      return left.name.localeCompare(right.name, "sr");
    })
  }));
}

function relationValue<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, "").slice(0, 80);
}

function normalizeIdentifier(value: unknown) {
  return value === null || value === undefined ? "" : String(value).trim();
}
