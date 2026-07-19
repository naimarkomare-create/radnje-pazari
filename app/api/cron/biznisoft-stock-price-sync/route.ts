import { NextRequest, NextResponse } from "next/server";
import { syncBiznisoftStockPrices } from "@/lib/biznisoft/stock-price-sync";
import { deleteExpiredReturnDrafts } from "@/lib/returns/delete-expired-return-drafts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret) {
    console.error("CRON_SECRET is missing; daily cron tasks were not run.");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let returnDraftCleanup:
    | Awaited<ReturnType<typeof deleteExpiredReturnDrafts>>
    | { error: string; success: false };

  try {
    returnDraftCleanup = await deleteExpiredReturnDrafts();
  } catch (error) {
    console.error("Daily return draft cleanup failed.", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    returnDraftCleanup = {
      error: "Brisanje starih nacrta najava povrata nije uspelo.",
      success: false
    };
  }

  try {
    const result = await syncBiznisoftStockPrices();
    return NextResponse.json({
      ...result,
      autoCreateTasks: process.env.AUTO_CREATE_PRICE_TASKS === "true",
      returnDraftCleanup
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "BizniSoft stock price cron failed.",
        returnDraftCleanup
      },
      { status: 500 }
    );
  }
}
