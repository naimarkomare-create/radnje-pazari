import { withIntegrationLock } from "@/lib/security/sync-lock";
import { publicErrorMessage } from "@/lib/security/validation";
import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { fetchBizniSoftSaleActionsWithArticles, prepareSaleActionsForUpsert } from "@/lib/biznisoft/sale-actions";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const WHOLE_SYNC_TIMEOUT_MS = 75_000;

export async function POST() {
  const authorization = await authorizeApi(undefined, true);
  if (!authorization.ok) return authorization.response;

  return withIntegrationLock(async () => {

    try {
      const { debug, saleActions } = await withTimeout(
        fetchBizniSoftSaleActionsWithArticles(),
        WHOLE_SYNC_TIMEOUT_MS,
        "BizniSoft sale actions sync timed out."
      );
      const supabase = createClient();
      const now = new Date().toISOString();
      const prepared = prepareSaleActionsForUpsert(saleActions);
      let rowsUpsertedCount = 0;

      if (prepared.rows.length > 0) {
        const { error } = await supabase.from("biznisoft_sale_actions").upsert(
          prepared.rows.map((action) => ({
            ...action,
            synced_at: now
          })),
          {
            onConflict: "source_key"
          }
        );

        if (error) {
          return NextResponse.json({ error: publicErrorMessage(error) }, { status: 500 });
        }

        rowsUpsertedCount = prepared.rows.length;
      }

      const databaseCountResult = await supabase
        .from("biznisoft_sale_actions")
        .select("id", { count: "exact", head: true });
      if (databaseCountResult.error) {
        return NextResponse.json({ error: publicErrorMessage(databaseCountResult.error) }, { status: 500 });
      }
      const rowsInDatabaseAfterSync = databaseCountResult.count ?? 0;
      const faults = [
        debug.actionType1Fault ? { actionType: 1, fault: debug.actionType1Fault } : null,
        debug.actionType2Fault ? { actionType: 2, fault: debug.actionType2Fault } : null,
        debug.actionType3Fault ? { actionType: 3, fault: debug.actionType3Fault } : null
      ].filter((fault): fault is { actionType: number; fault: string } => fault !== null);

      console.log(`BizniSoft sale actions synced count: ${saleActions.length}`);
      console.log(`BizniSoft unique ArticleID count: ${debug.uniqueArticleIdsCount}`);

      return NextResponse.json({
        actionType1RawCount: debug.actionType1RawCount,
        actionType2RawCount: debug.actionType2RawCount,
        actionType3RawCount: debug.actionType3RawCount,
        count: saleActions.length,
        duplicateSourceKeyRows: prepared.duplicateSourceKeyRows,
        faults,
        firstFiveRowsPreview: debug.firstFiveRowsPreview,
        normalizedRowsCount: debug.normalizedRowsCount,
        rawRowsCount: debug.totalRawRowsBeforeNormalize,
        rowsInDatabaseAfterSync,
        rowsSentToUpsert: prepared.rows.length,
        rowsSkippedMissingSourceKey: prepared.rowsSkippedMissingSourceKey,
        rowsUpsertedCount,
        syncedAt: now,
        totalRawRowsBeforeNormalize: debug.totalRawRowsBeforeNormalize,
        uniqueArticleIdsCount: debug.uniqueArticleIdsCount
      });
    } catch (error) {
      return NextResponse.json(
        { error: publicErrorMessage(error) },
        { status: 500 }
      );
    }
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
