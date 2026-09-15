import { readJsonObject, publicErrorMessage, isUuid } from "@/lib/security/validation";
import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { canEditReturnProposal, RETURN_PROPOSAL_ITEM_COLUMNS } from "@/lib/return-proposals";
import { createClient } from "@/lib/supabase/server";
import type { ReturnProposal } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const supabase = createClient();
  const authorization = await authorizeApi(supabase, false);
  if (!authorization.ok) return authorization.response;
  const { profile } = authorization;
  if (!isUuid(params.id) || !isUuid(params.itemId)) return NextResponse.json({ error: "Najava nije pronađena." }, { status: 404 });


  const proposal = await loadEditableProposal(supabase, params.id);
  if (!proposal.ok) return proposal.response;
  if (!canEditReturnProposal(profile, proposal.proposal)) return NextResponse.json({ error: "Najava nije otvorena za izmene." }, { status: 403 });

  const body = await readJsonObject(request);
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
    .select(RETURN_PROPOSAL_ITEM_COLUMNS)
    .eq("id", params.itemId)
    .eq("proposal_id", params.id)
    .single();

  const { data, error } = await supabase
    .from("return_proposal_items")
    .update(update)
    .eq("id", params.itemId)
    .eq("proposal_id", params.id)
    .select(RETURN_PROPOSAL_ITEM_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: publicErrorMessage(error) }, { status: 500 });

  await Promise.all([
    supabase.from("return_proposals").update({ updated_by: profile.id }).eq("id", params.id),
    supabase.from("return_proposal_history").insert({
      action: "item_updated",
      item_id: params.itemId,
      new_value: data,
      old_value: oldItem ?? null,
      proposal_id: params.id,
      user_id: profile.id
    })
  ]);

  return NextResponse.json({ item: data });
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string; itemId: string } }) {
  const supabase = createClient();
  const authorization = await authorizeApi(supabase, false);
  if (!authorization.ok) return authorization.response;
  const { profile } = authorization;
  if (!isUuid(params.id) || !isUuid(params.itemId)) return NextResponse.json({ error: "Najava nije pronađena." }, { status: 404 });


  const proposal = await loadEditableProposal(supabase, params.id);
  if (!proposal.ok) return proposal.response;
  if (!canEditReturnProposal(profile, proposal.proposal)) return NextResponse.json({ error: "Najava nije otvorena za izmene." }, { status: 403 });

  const { data: oldItem } = await supabase
    .from("return_proposal_items")
    .select(RETURN_PROPOSAL_ITEM_COLUMNS)
    .eq("id", params.itemId)
    .eq("proposal_id", params.id)
    .single();

  const { error } = await supabase
    .from("return_proposal_items")
    .delete()
    .eq("id", params.itemId)
    .eq("proposal_id", params.id);

  if (error) return NextResponse.json({ error: publicErrorMessage(error) }, { status: 500 });

  await Promise.all([
    supabase.from("return_proposals").update({ updated_by: profile.id }).eq("id", params.id),
    supabase.from("return_proposal_history").insert({
      action: "item_deleted",
      item_id: null,
      old_value: oldItem ?? null,
      proposal_id: params.id,
      user_id: profile.id
    })
  ]);

  return NextResponse.json({ ok: true });
}

async function loadEditableProposal(
  supabase: ReturnType<typeof createClient>,
  id: string
): Promise<{ ok: true; proposal: ReturnProposal } | { ok: false; response: NextResponse }> {
  const { data, error } = await supabase.from("return_proposals").select("id, store_id, status").eq("id", id).single();

  if (error || !data) {
    return { ok: false, response: NextResponse.json({ error: "Najava nije pronađena." }, { status: 404 }) };
  }

  return { ok: true, proposal: data as ReturnProposal };
}
