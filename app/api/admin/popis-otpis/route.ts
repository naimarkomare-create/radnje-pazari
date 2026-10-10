import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { isUuid } from "@/lib/popis-otpis";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const authorization = await authorizeApi(createClient(), true);
  if (!authorization.ok) return authorization.response;
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("writeoff_lists")
      .select("id, reference, store_id, supplier_id, supplier_name, status, created_by, finalized_at, created_at, updated_at, stores(id, name, biznisoft_storage_id)")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const ids = (data ?? []).map((row) => row.id);
    const counts = new Map<string, number>();
    if (ids.length > 0) {
      const result = await supabase.from("writeoff_list_items").select("writeoff_list_id").in("writeoff_list_id", ids);
      if (result.error) throw result.error;
      for (const row of result.data ?? []) counts.set(row.writeoff_list_id, (counts.get(row.writeoff_list_id) ?? 0) + 1);
    }
    return NextResponse.json({ lists: (data ?? []).map((row) => ({ ...row, item_count: counts.get(row.id) ?? 0 })) });
  } catch {
    return NextResponse.json({ error: "Popisi nisu mogli da se učitaju." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const authorization = await authorizeApi(createClient(), true);
  if (!authorization.ok) return authorization.response;
  try {
    const body = await request.json();
    const storeId = typeof body.store_id === "string" ? body.store_id : "";
    const supplierId = typeof body.supplier_id === "string" ? body.supplier_id : "";
    if (!isUuid(storeId) || !isUuid(supplierId)) {
      return NextResponse.json({ error: "Radnja i dobavljač su obavezni." }, { status: 400 });
    }

    const supabase = createServiceClient();
    const [storeResult, supplierResult] = await Promise.all([
      supabase.from("stores").select("id, name, biznisoft_storage_id").eq("id", storeId).single(),
      supabase.from("biznisoft_suppliers").select("id, name, is_active").eq("id", supplierId).single()
    ]);
    if (storeResult.error || !storeResult.data) return NextResponse.json({ error: "Radnja nije pronađena." }, { status: 404 });
    if (supplierResult.error || !supplierResult.data || !supplierResult.data.is_active) {
      return NextResponse.json({ error: "Dobavljač nije pronađen ili nije aktivan." }, { status: 400 });
    }
    if (!Number.isInteger(storeResult.data.biznisoft_storage_id)) {
      return NextResponse.json({ error: "Nije podešen BizniSoft StorageID za ovu radnju." }, { status: 409 });
    }

    const reference = `OT-${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const { data, error } = await supabase
      .from("writeoff_lists")
      .insert({
        created_by: authorization.profile.id,
        reference,
        store_id: storeId,
        supplier_id: supplierId,
        supplier_name: supplierResult.data.name,
        status: "draft"
      })
      .select("id, reference, store_id, supplier_id, supplier_name, status, created_by, finalized_at, created_at, updated_at, stores(id, name, biznisoft_storage_id)")
      .single();
    if (error || !data) throw error ?? new Error("Popis nije kreiran.");
    return NextResponse.json({ list: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Popis nije mogao da se kreira." }, { status: 500 });
  }
}
