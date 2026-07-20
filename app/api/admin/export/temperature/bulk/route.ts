import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileWithClient } from "@/lib/auth";
import { isIsoMonth, monthBounds } from "@/lib/excel-templates";
import { PRODUCE_STORE_NAMES } from "@/lib/produce";
import { createClient } from "@/lib/supabase/server";
import {
  buildBulkTemperatureZip,
  type TemperatureExportDevice,
  type TemperatureExportReport,
  type TemperatureExportStore
} from "@/lib/temperature-bulk-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const profile = await getCurrentProfileWithClient(supabase);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!isIsoMonth(month)) {
    return NextResponse.json({ error: "Mesec nije ispravan." }, { status: 400 });
  }

  try {
    const [storesResult, devicesResult] = await Promise.all([
      supabase.from("stores").select("id, name").in("name", [...PRODUCE_STORE_NAMES]),
      supabase
        .from("temperature_devices")
        .select("id, store_id, name, sort_order")
        .eq("active", true)
        .order("sort_order")
        .order("name")
    ]);

    if (storesResult.error) throw new Error(storesResult.error.message);
    if (devicesResult.error) throw new Error(devicesResult.error.message);

    const storeOrder = new Map(PRODUCE_STORE_NAMES.map((name, index) => [name, index]));
    const stores = ((storesResult.data ?? []) as TemperatureExportStore[]).sort(
      (left, right) =>
        (storeOrder.get(left.name as (typeof PRODUCE_STORE_NAMES)[number]) ?? 99) -
        (storeOrder.get(right.name as (typeof PRODUCE_STORE_NAMES)[number]) ?? 99)
    );
    const storeIds = new Set(stores.map((store) => store.id));
    const devices = (
      (devicesResult.data ?? []) as TemperatureExportDevice[]
    ).filter((device) => storeIds.has(device.store_id));
    const reports = await loadMonthlyReports({
      month,
      storeIds: stores.map((store) => store.id),
      supabase
    });
    const { fileCount, output } = await buildBulkTemperatureZip({
      devices,
      month,
      reports,
      stores
    });

    if (fileCount === 0) {
      return NextResponse.json(
        { error: "Nema aktivnih temperaturnih uređaja za izvoz." },
        { status: 404 }
      );
    }

    const fileName = `Temperature-sve-radnje-${month}.zip`;
    const responseBody = new Uint8Array(output);

    return new NextResponse(responseBody, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": "application/zip",
        "X-Temperature-File-Count": String(fileCount)
      }
    });
  } catch (error) {
    console.error("Bulk temperature ZIP export failed", error);
    return NextResponse.json(
      { error: "Temperaturne liste nisu izvezene. Pokušajte ponovo." },
      { status: 500 }
    );
  }
}

async function loadMonthlyReports({
  month,
  storeIds,
  supabase
}: {
  month: string;
  storeIds: string[];
  supabase: ReturnType<typeof createClient>;
}) {
  if (storeIds.length === 0) return [] as TemperatureExportReport[];

  const bounds = monthBounds(month);
  const pageSize = 1000;
  const reports: TemperatureExportReport[] = [];

  for (let from = 0; ; from += pageSize) {
    const result = await supabase
      .from("temperature_reports")
      .select("store_id, device_id, report_date, shift, temperature, note, created_at")
      .in("store_id", storeIds)
      .gte("report_date", bounds.start)
      .lte("report_date", bounds.end)
      .order("created_at", { ascending: true })
      .range(from, from + pageSize - 1);

    if (result.error) throw new Error(result.error.message);

    const page = (result.data ?? []) as TemperatureExportReport[];
    reports.push(...page);
    if (page.length < pageSize) break;
  }

  return reports;
}
