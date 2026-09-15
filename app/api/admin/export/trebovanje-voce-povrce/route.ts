import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { buildProduceOrderWorkbook, excelDownloadResponse, isIsoDate, type ProduceExportBatch } from "@/lib/excel-templates";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const authorization = await authorizeApi(supabase, true);
  if (!authorization.ok) return authorization.response;

  const date = request.nextUrl.searchParams.get("date") ?? "";
  if (!isIsoDate(date)) return NextResponse.json({ error: "Datum nije ispravan." }, { status: 400 });

  try {
    const { data, error } = await supabase
      .from("produce_request_batches")
      .select("store_id, stores(name), produce_request_items(quantity, produce_items(name))")
      .eq("request_date", date);

    if (error) throw new Error(error.message);
    const { workbook, unmatchedCount, unmatchedNames } = await buildProduceOrderWorkbook(
      (data ?? []) as unknown as ProduceExportBatch[]
    );

    if (unmatchedCount > 0) {
      console.warn("Trebovanje Excel export: unmatched produce articles", {
        date,
        unmatchedCount,
        unmatchedNames
      });
    } else {
      console.info("Trebovanje Excel export: unmatched produce article count", { date, unmatchedCount: 0 });
    }

    return excelDownloadResponse(workbook, `Trebovanje-voce-povrce-${date}.xlsx`);
  } catch (error) {
    console.error("Trebovanje Excel export failed", error);
    return NextResponse.json({ error: "Excel trebovanje nije moglo da bude napravljeno." }, { status: 500 });
  }
}
