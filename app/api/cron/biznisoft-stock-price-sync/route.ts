import { NextRequest, NextResponse } from "next/server";
import { syncBiznisoftStockPrices } from "@/lib/biznisoft/stock-price-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!cronSecret || authorization !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncBiznisoftStockPrices();
    return NextResponse.json({
      ...result,
      autoCreateTasks: process.env.AUTO_CREATE_PRICE_TASKS === "true"
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "BizniSoft stock price cron failed." },
      { status: 500 }
    );
  }
}
