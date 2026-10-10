import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { isUuid, validateWriteoffItems, type ImportableWriteoffItem } from "@/lib/popis-otpis";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeApi(createClient(), true);
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Popis nije pronađen." }, { status: 404 });
  try {
    const supabase = createServiceClient();
    const [listResult, itemsResult] = await Promise.all([
      supabase.from("writeoff_lists").select("id, reference, store_id, supplier_id, supplier_name, status, created_by, finalized_at, created_at, updated_at, stores(id, name, biznisoft_storage_id)").eq("id", id).single(),
      supabase.from("writeoff_list_items").select("id, writeoff_list_id, client_entry_id, store_id, supplier_id, article_id, article_code, barcode, article_name, unit, quantity, expiration_date, stock_amount, stock_fetched_at, price, level_price, account, popdv_id, vat_transaction_type, operator_name, modify_time, supplier_name, created_by, created_at, updated_at").eq("writeoff_list_id", id).order("created_at", { ascending: true })
    ]);
    if (listResult.error || !listResult.data) return NextResponse.json({ error: "Popis nije pronađen." }, { status: 404 });
    if (itemsResult.error) throw itemsResult.error;
    return NextResponse.json({ list: listResult.data, items: itemsResult.data ?? [] });
  } catch {
    return NextResponse.json({ error: "Popis nije mogao da se učita." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeApi(createClient(), true);
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Popis nije pronađen." }, { status: 404 });
  try {
    const supabase = createServiceClient();
    const result = await supabase.from("writeoff_lists").delete().eq("id", id).eq("status", "draft");
    if (result.error) throw result.error;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Samo nacrt popisa može da se obriše." }, { status: 400 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authorization = await authorizeApi(createClient(), true);
  if (!authorization.ok) return authorization.response;
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Popis nije pronađen." }, { status: 404 });
  try {
    const supabase = createServiceClient();
    const listResult = await supabase.from("writeoff_lists").select("id, status, stores(name)").eq("id", id).single();
    if (listResult.error || !listResult.data) return NextResponse.json({ error: "Popis nije pronađen." }, { status: 404 });
    if (listResult.data.status !== "draft") return NextResponse.json({ error: "Popis je već završen i zaključan." }, { status: 409 });
    const itemResult = await supabase.from("writeoff_list_items").select("*").eq("writeoff_list_id", id);
    if (itemResult.error) throw itemResult.error;
    const store = Array.isArray(listResult.data.stores) ? listResult.data.stores[0] : listResult.data.stores;
    const items = (itemResult.data ?? []).map((item) => ({ ...item, store_name: store?.name ?? "" })) as ImportableWriteoffItem[];
    const errors = validateWriteoffItems(items, { requireBizniSoftMetadata: false });
    if (errors.length > 0) return NextResponse.json({ error: errors.join(" "), validationErrors: errors }, { status: 422 });
    const update = await supabase.from("writeoff_lists").update({ finalized_at: new Date().toISOString(), status: "finalized" }).eq("id", id).eq("status", "draft").select("id, status, finalized_at").single();
    if (update.error || !update.data) throw update.error ?? new Error("Popis nije završen.");
    return NextResponse.json({ list: update.data });
  } catch {
    return NextResponse.json({ error: "Popis nije mogao da se završi." }, { status: 500 });
  }
}
