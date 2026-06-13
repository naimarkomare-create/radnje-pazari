import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { fetchBizniSoftArticlesForSaleActionIds } from "@/lib/biznisoft/sale-actions";
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
      .select("article_id")
      .not("article_id", "is", null)
      .limit(10000);

    if (actionsResult.error) {
      return NextResponse.json({ error: actionsResult.error.message }, { status: 500 });
    }

    const articleIds = Array.from(
      new Set(
        (actionsResult.data ?? [])
          .map((row) => row.article_id)
          .filter((articleId): articleId is number => typeof articleId === "number" && Number.isFinite(articleId))
      )
    );
    const { articles, uniqueArticleIdCount } = await fetchBizniSoftArticlesForSaleActionIds(articleIds);
    const now = new Date().toISOString();
    let articlesUpsertedCount = 0;

    if (articles.length > 0) {
      const articlesError = await supabase.from("biznisoft_articles").upsert(
        articles.map((article) => ({
          ...article,
          synced_at: now
        })),
        {
          onConflict: "article_id"
        }
      );

      if (articlesError.error) {
        return NextResponse.json({ error: articlesError.error.message }, { status: 500 });
      }

      articlesUpsertedCount = articles.length;
    }

    console.log(`BizniSoft sale actions synced count: 0`);
    console.log(`BizniSoft unique ArticleID count: ${uniqueArticleIdCount}`);
    console.log(`BizniSoft articles fetched count: ${articles.length}`);
    console.log(`BizniSoft articles upserted count: ${articlesUpsertedCount}`);

    return NextResponse.json({
      articlesFetchedCount: articles.length,
      articlesUpsertedCount,
      syncedAt: now,
      uniqueArticleIdCount
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "BizniSoft article sync failed." },
      { status: 500 }
    );
  }
}
