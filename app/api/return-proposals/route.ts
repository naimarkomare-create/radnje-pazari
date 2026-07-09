import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { todayIsoDate } from "@/lib/return-proposals";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient();
  const searchParams = request.nextUrl.searchParams;
  let query = supabase
    .from("return_proposals")
    .select("*, stores(id, name), return_proposal_items(id)")
    .order("updated_at", { ascending: false });

  if (profile.role === "store") {
    query = query.eq("store_id", profile.store_id);
  }

  const status = searchParams.get("status");
  if (status) query = query.eq("status", status);

  const date = searchParams.get("date");
  if (date) query = query.eq("return_date", date);

  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ proposals: data ?? [] });
}

export async function POST(request: NextRequest) {
  const profile = await getCurrentProfile();

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const storeId = profile.role === "admin" ? String(body.store_id ?? "") : profile.store_id;

  if (!storeId) return NextResponse.json({ error: "Radnja je obavezna." }, { status: 400 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from("return_proposals")
    .insert({
      created_by: profile.id,
      note: typeof body.note === "string" ? body.note : null,
      return_date: typeof body.return_date === "string" ? body.return_date : todayIsoDate(),
      status: "draft",
      store_id: storeId,
      updated_by: profile.id
    })
    .select("*, stores(id, name), return_proposal_items(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("return_proposal_history").insert({
    action: "created",
    new_value: data,
    proposal_id: data.id,
    user_id: profile.id
  });

  return NextResponse.json({ proposal: data }, { status: 201 });
}
