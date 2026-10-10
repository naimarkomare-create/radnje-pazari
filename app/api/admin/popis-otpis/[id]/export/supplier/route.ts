import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { buildSupplierWriteoffWorkbook } from "@/lib/popis-otpis-export";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { excelDownloadResponse } from "@/lib/excel-templates";
import type { ImportableWriteoffItem } from "@/lib/popis-otpis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeApi(createClient(), true);
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  try {
    const supabase = createServiceClient();
    const [listResult, itemResult] = await Promise.all([
      supabase.from("writeoff_lists").select("id, reference, supplier_name, status, stores(name)").eq("id", id).single(),
      supabase.from("writeoff_list_items").select("*").eq("writeoff_list_id", id).order("created_at", { ascending: true })
    ]);
    if (listResult.error || !listResult.data) return NextResponse.json({ error: "Popis nije pronađen." }, { status: 404 });
    if (listResult.data.status !== "finalized") return NextResponse.json({ error: "Prvo završite i zaključajte popis." }, { status: 409 });
    if (itemResult.error) throw itemResult.error;
    const store = Array.isArray(listResult.data.stores) ? listResult.data.stores[0] : listResult.data.stores;
    const items = (itemResult.data ?? []).map((item) => ({ ...item, store_name: store?.name ?? "" })) as ImportableWriteoffItem[];
    const workbook = await buildSupplierWriteoffWorkbook({ items, reference: listResult.data.reference, supplierName: listResult.data.supplier_name });
    return excelDownloadResponse(workbook, `dobavljac-otpis-${listResult.data.reference}.xlsx`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Izvoz nije moguć.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
