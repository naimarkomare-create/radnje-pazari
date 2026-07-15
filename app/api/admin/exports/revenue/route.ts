import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileWithClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 1000;
const MAX_ROWS = 12000;

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const profile = await getCurrentProfileWithClient(supabase);

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const dateFrom = request.nextUrl.searchParams.get("date_from") ?? "";
  const dateTo = request.nextUrl.searchParams.get("date_to") ?? dateFrom;
  const storeId = request.nextUrl.searchParams.get("store_id") ?? "";

  if (!isIsoDate(dateFrom) || !isIsoDate(dateTo) || dateFrom > dateTo) {
    return NextResponse.json({ error: "Opseg datuma nije ispravan." }, { status: 400 });
  }
  if (daysBetween(dateFrom, dateTo) > 366) {
    return NextResponse.json({ error: "Export je ograničen na najviše 366 dana." }, { status: 400 });
  }

  const reports: Array<Record<string, unknown>> = [];

  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    let query = supabase
      .from("daily_revenue_reports")
      .select(
        "id, store_id, report_date, cash_revenue, check_revenue, card_revenue, bank_transfer_revenue, correction_revenue, edopuna_revenue, total_revenue, stores(name)"
      )
      .gte("report_date", dateFrom)
      .lte("report_date", dateTo)
      .order("report_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (storeId) query = query.eq("store_id", storeId);
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);

    if (error) return NextResponse.json({ error: "Podaci za export nisu učitani." }, { status: 500 });
    reports.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return NextResponse.json({ reports });
  }

  return NextResponse.json({ error: "Previše redova za jedan export. Sužite opseg datuma." }, { status: 413 });
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function daysBetween(from: string, to: string) {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
