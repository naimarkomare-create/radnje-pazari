import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileWithClient } from "@/lib/auth";
import {
  assertReturnStatus,
  canEditReturnProposal,
  canViewReturnProposal,
  RETURN_PROPOSAL_COLUMNS,
  RETURN_PROPOSAL_ITEM_COLUMNS
} from "@/lib/return-proposals";
import { createClient } from "@/lib/supabase/server";
import type { ReturnProposal } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const profile = await getCurrentProfileWithClient(supabase);

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("return_proposals")
    .select(`${RETURN_PROPOSAL_COLUMNS}, stores(id, name)`)
    .eq("id", params.id)
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Najava nije pronađena." }, { status: 404 });

  const proposal = data as unknown as ReturnProposal;
  if (!canViewReturnProposal(profile, proposal)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: items, error: itemsError, count } = await supabase
    .from("return_proposal_items")
    .select(RETURN_PROPOSAL_ITEM_COLUMNS, { count: "exact" })
    .eq("proposal_id", params.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 });
  return NextResponse.json({ proposal: { ...proposal, item_count: count ?? items?.length ?? 0, return_proposal_items: items ?? [] } });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const profile = await getCurrentProfileWithClient(supabase);

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing, error: existingError } = await supabase
    .from("return_proposals")
    .select(RETURN_PROPOSAL_COLUMNS)
    .eq("id", params.id)
    .single();

  if (existingError || !existing) return NextResponse.json({ error: existingError?.message ?? "Najava nije pronađena." }, { status: 404 });

  const proposal = existing as ReturnProposal;
  if (!canEditReturnProposal(profile, proposal)) return NextResponse.json({ error: "Najava više nije otvorena za izmene." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {
    updated_by: profile.id
  };

  if (typeof body.note === "string") update.note = body.note;
  if (typeof body.return_date === "string") update.return_date = body.return_date;
  if (typeof body.status === "string") {
    let status;
    try {
      status = assertReturnStatus(body.status);
    } catch {
      return NextResponse.json({ error: "Status nije ispravan." }, { status: 400 });
    }
    if (profile.role !== "admin" && !["draft", "submitted"].includes(status)) {
      return NextResponse.json({ error: "Radnja ne može postaviti ovaj status." }, { status: 403 });
    }
    update.status = status;
    if (status === "submitted") update.submitted_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("return_proposals")
    .update(update)
    .eq("id", params.id)
    .select(`${RETURN_PROPOSAL_COLUMNS}, stores(id, name)`)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("return_proposal_history").insert({
    action: "proposal_updated",
    new_value: data,
    old_value: existing,
    proposal_id: params.id,
    user_id: profile.id
  });

  return NextResponse.json({ proposal: data });
}
