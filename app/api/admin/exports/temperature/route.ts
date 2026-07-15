import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileWithClient } from "@/lib/auth";
import { PRODUCE_STORE_NAMES } from "@/lib/produce";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 1000;
const MAX_ROWS = 6000;

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const profile = await getCurrentProfileWithClient(supabase);

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const month = request.nextUrl.searchParams.get("month") ?? "";
  const storeId = request.nextUrl.searchParams.get("store_id") ?? "";
  const deviceId = request.nextUrl.searchParams.get("device_id") ?? "";

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Mesec nije ispravan." }, { status: 400 });
  }

  let storesQuery = supabase.from("stores").select("id, name").in("name", [...PRODUCE_STORE_NAMES]).order("name");
  let devicesQuery = supabase
    .from("temperature_devices")
    .select("id, store_id, name, active, stores(id, name)")
    .eq("active", true)
    .order("sort_order")
    .order("name");

  if (storeId) {
    storesQuery = storesQuery.eq("id", storeId);
    devicesQuery = devicesQuery.eq("store_id", storeId);
  }
  if (deviceId) devicesQuery = devicesQuery.eq("id", deviceId);

  const [storesResult, devicesResult, reportsResult] = await Promise.all([
    storesQuery,
    devicesQuery,
    fetchReports(supabase, month, storeId, deviceId)
  ]);

  if (storesResult.error || devicesResult.error || reportsResult.error) {
    return NextResponse.json({ error: "Podaci za export nisu učitani." }, { status: 500 });
  }

  return NextResponse.json({
    devices: devicesResult.data ?? [],
    reports: reportsResult.data,
    stores: storesResult.data ?? []
  });
}

async function fetchReports(supabase: ReturnType<typeof createClient>, month: string, storeId: string, deviceId: string) {
  const reports: Array<Record<string, unknown>> = [];
  const monthStart = `${month}-01`;
  const monthEnd = getMonthEnd(month);

  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    let query = supabase
      .from("temperature_reports")
      .select("id, store_id, device_id, report_date, shift, temperature, created_at")
      .gte("report_date", monthStart)
      .lte("report_date", monthEnd)
      .order("created_at", { ascending: true });

    if (storeId) query = query.eq("store_id", storeId);
    if (deviceId) query = query.eq("device_id", deviceId);
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error) return { data: reports, error };
    reports.push(...(data ?? []));
    if ((data?.length ?? 0) < PAGE_SIZE) return { data: reports, error: null };
  }

  return { data: reports, error: new Error("Previše redova za jedan export.") };
}

function getMonthEnd(month: string) {
  const [year, monthIndex] = month.split("-").map(Number);
  const lastDay = new Date(year, monthIndex, 0).getDate();
  return `${month}-${String(lastDay).padStart(2, "0")}`;
}
