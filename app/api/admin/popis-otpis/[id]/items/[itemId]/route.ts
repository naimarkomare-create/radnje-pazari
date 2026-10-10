import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { isIsoDate, isUuid, numericValue } from "@/lib/popis-otpis";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const authorization = await authorizeApi(createClient(), true);
  if (!authorization.ok) return authorization.response;
  const { id, itemId } = await params;
  if (!isUuid(id) || !isUuid(itemId)) return NextResponse.json({ error: "Stavka nije pronađena." }, { status: 404 });
  try {
    const body = await request.json();
    const update: Record<string, unknown> = {};
    if (body.quantity !== undefined) {
      const quantity = numericValue(body.quantity);
      if (quantity === null || quantity <= 0) return NextResponse.json({ error: "Količina mora biti veća od 0." }, { status: 400 });
      update.quantity = quantity;
    }
    if (body.expiration_date !== undefined) {
      if (!isIsoDate(body.expiration_date)) return NextResponse.json({ error: "Datum isteka nije ispravan." }, { status: 400 });
      update.expiration_date = body.expiration_date;
    }
    if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nema izmena." }, { status: 400 });
    const supabase = createServiceClient();
    const list = await supabase.from("writeoff_lists").select("status").eq("id", id).single();
    if (list.error || list.data?.status !== "draft") return NextResponse.json({ error: "Stavka nije pronađena ili je popis završen." }, { status: 404 });
    const result = await supabase.from("writeoff_list_items").update(update).eq("id", itemId).eq("writeoff_list_id", id).select("*").single();
    if (result.error || !result.data) return NextResponse.json({ error: "Stavka nije pronađena ili je popis završen." }, { status: 404 });
    return NextResponse.json({ item: result.data });
  } catch {
    return NextResponse.json({ error: "Stavka nije izmenjena." }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const authorization = await authorizeApi(createClient(), true);
  if (!authorization.ok) return authorization.response;
  const { id, itemId } = await params;
  if (!isUuid(id) || !isUuid(itemId)) return NextResponse.json({ error: "Stavka nije pronađena." }, { status: 404 });
  try {
    const supabase = createServiceClient();
    const list = await supabase.from("writeoff_lists").select("status").eq("id", id).single();
    if (list.error || list.data?.status !== "draft") return NextResponse.json({ error: "Stavka nije moguće obrisati iz završenog popisa." }, { status: 409 });
    const result = await supabase.from("writeoff_list_items").delete().eq("id", itemId).eq("writeoff_list_id", id);
    if (result.error) throw result.error;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Stavka nije obrisana." }, { status: 500 });
  }
}
