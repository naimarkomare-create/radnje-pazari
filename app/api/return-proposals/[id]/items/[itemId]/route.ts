import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { canEditReturnProposal } from "@/lib/return-proposals";
import { createClient } from "@/lib/supabase/server";
import type { ReturnProposal } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const profile = await getCurrentProfile();

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient();
  const proposal = await loadEditableProposal(params.id);
  if (!proposal.ok) return proposal.response;
  if (!canEditReturnProposal(profile, proposal.proposal)) return NextResponse.json({ error: "Najava nije otvorena za izmene." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = { updated_by: profile.id };

  if (body.quantity !== undefined) {
    const quantity = Number(body.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: "Količina mora biti veća od 0." }, { status: 400 });
    update.quantity = quantity;
  }
  if (typeof body.reason === "string") update.reason = body.reason;
  if (typeof body.note === "string") update.note = body.note;

  const { data: oldItem } = await supabase
    .from("return_proposal_items")
    .select("*")
    .eq("id", params.itemId)
    .eq("proposal_id", params.id)
    .single();

  const { data, error } = await supabase
    .from("return_proposal_items")
    .update(update)
    .eq("id", params.itemId)
    .eq("proposal_id", params.id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("return_proposals").update({ updated_by: profile.id }).eq("id", params.id);
  await supabase.from("return_proposal_history").insert({
    action: "item_updated",
    item_id: params.itemId,
    new_value: data,
    old_value: oldItem ?? null,
    proposal_id: params.id,
    user_id: profile.id
  });

  return NextResponse.json({ item: data });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const profile = await getCurrentProfile();

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient();
  const proposal = await loadEditableProposal(params.id);
  if (!proposal.ok) return proposal.response;
  if (!canEditReturnProposal(profile, proposal.proposal)) return NextResponse.json({ error: "Najava nije otvorena za izmene." }, { status: 403 });

  const { data: oldItem } = await supabase
    .from("return_proposal_items")
    .select("*")
    .eq("id", params.itemId)
    .eq("proposal_id", params.id)
    .single();

  const { error } = await supabase
    .from("return_proposal_items")
    .delete()
    .eq("id", params.itemId)
    .eq("proposal_id", params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("return_proposals").update({ updated_by: profile.id }).eq("id", params.id);
  await supabase.from("return_proposal_history").insert({
    action: "item_deleted",
    item_id: params.itemId,
    old_value: oldItem ?? null,
    proposal_id: params.id,
    user_id: profile.id
  });

  return NextResponse.json({ ok: true });
}

async function loadEditableProposal(id: string): Promise<{ ok: true; proposal: ReturnProposal } | { ok: false; response: NextResponse }> {
  const supabase = createClient();
  const { data, error } = await supabase.from("return_proposals").select("*").eq("id", id).single();

  if (error || !data) {
    return { ok: false, response: NextResponse.json({ error: error?.message ?? "Najava nije pronađena." }, { status: 404 }) };
  }

  return { ok: true, proposal: data as ReturnProposal };
}
