import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import {
  buildRevenueSpecificationWorkbook,
  excelDownloadResponse,
  isIsoMonth,
  monthBounds,
  type RevenueSpecificationReport
} from "@/lib/excel-templates";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const authorization = await authorizeApi(supabase, true);
  if (!authorization.ok) return authorization.response;

  const storeId = request.nextUrl.searchParams.get("store_id") ?? "";
  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!isUuid(storeId)) return NextResponse.json({ error: "Radnja nije ispravna." }, { status: 400 });
  if (!isIsoMonth(month)) return NextResponse.json({ error: "Mesec nije ispravan." }, { status: 400 });

  try {
    const bounds = monthBounds(month);
    const [storeResult, reportsResult] = await Promise.all([
      supabase.from("stores").select("id, name").eq("id", storeId).single(),
      supabase
        .from("daily_revenue_reports")
        .select(
          "report_date, cash_revenue, check_revenue, card_revenue, bank_transfer_revenue, correction_revenue, edopuna_revenue, total_revenue"
        )
        .eq("store_id", storeId)
        .gte("report_date", bounds.start)
        .lte("report_date", bounds.end)
        .order("report_date", { ascending: true })
        .order("created_at", { ascending: true })
    ]);

    if (storeResult.error || !storeResult.data) throw new Error(storeResult.error?.message ?? "Radnja nije pronađena.");
    if (reportsResult.error) throw new Error(reportsResult.error.message);

    const workbook = await buildRevenueSpecificationWorkbook({
      month,
      reports: (reportsResult.data ?? []) as RevenueSpecificationReport[],
      storeName: storeResult.data.name
    });
    const storeFileName = storeResult.data.name.replace(/\s+/g, "-");
    return excelDownloadResponse(workbook, `Specifikacija-pazara-${storeFileName}-${month}.xlsx`);
  } catch (error) {
    console.error("Pazar specification Excel export failed", error);
    return NextResponse.json({ error: "Specifikacija pazara nije mogla da bude napravljena." }, { status: 500 });
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
