import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import {
  buildTemperatureChecklistWorkbook,
  excelDownloadResponse,
  isIsoMonth,
  monthBounds,
  type TemperatureChecklistReport
} from "@/lib/excel-templates";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const authorization = await authorizeApi(supabase, true);
  if (!authorization.ok) return authorization.response;

  const storeId = request.nextUrl.searchParams.get("store_id") ?? "";
  const deviceId = request.nextUrl.searchParams.get("device_id") ?? "";
  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!isUuid(storeId)) return NextResponse.json({ error: "Radnja nije ispravna." }, { status: 400 });
  if (!isUuid(deviceId)) return NextResponse.json({ error: "Uređaj nije ispravan." }, { status: 400 });
  if (!isIsoMonth(month)) return NextResponse.json({ error: "Mesec nije ispravan." }, { status: 400 });

  try {
    const bounds = monthBounds(month);
    const [storeResult, deviceResult, reportsResult] = await Promise.all([
      supabase.from("stores").select("id, name").eq("id", storeId).single(),
      supabase.from("temperature_devices").select("id, store_id, name").eq("id", deviceId).eq("store_id", storeId).single(),
      supabase
        .from("temperature_reports")
        .select("report_date, shift, temperature, note, created_at")
        .eq("store_id", storeId)
        .eq("device_id", deviceId)
        .gte("report_date", bounds.start)
        .lte("report_date", bounds.end)
        .order("created_at", { ascending: true })
    ]);

    if (storeResult.error || !storeResult.data) throw new Error(storeResult.error?.message ?? "Radnja nije pronađena.");
    if (deviceResult.error || !deviceResult.data) throw new Error(deviceResult.error?.message ?? "Uređaj nije pronađen.");
    if (reportsResult.error) throw new Error(reportsResult.error.message);

    const { workbook, duplicateCount, unmappedShiftCount } = await buildTemperatureChecklistWorkbook({
      deviceName: deviceResult.data.name,
      month,
      reports: (reportsResult.data ?? []) as TemperatureChecklistReport[],
      storeName: storeResult.data.name
    });

    if (duplicateCount > 0) {
      console.warn("Temperature checklist export: multiple readings found for the same slot; latest readings used", {
        deviceId,
        duplicateCount,
        month,
        storeId
      });
    }
    if (unmappedShiftCount > 0) {
      console.warn("Temperature checklist export: readings with unmapped shift were skipped", {
        deviceId,
        month,
        storeId,
        unmappedShiftCount
      });
    }

    const storeFileName = storeResult.data.name.replace(/\s+/g, "-");
    const deviceFileName = deviceResult.data.name.replace(/\s+/g, "-");
    return excelDownloadResponse(workbook, `Temperatura-${storeFileName}-${deviceFileName}-${month}.xlsx`);
  } catch (error) {
    console.error("Temperature checklist Excel export failed", error);
    return NextResponse.json({ error: "Temperaturna ček lista nije mogla da bude napravljena." }, { status: 500 });
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
