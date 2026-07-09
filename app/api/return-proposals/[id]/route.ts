import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { assertReturnStatus, canEditReturnProposal, canViewReturnProposal } from "@/lib/return-proposals";
import { createClient } from "@/lib/supabase/server";
import type { ReturnProposal } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getCurrentProfile();

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient();
  const { data, error } = await supabase
    .from("return_proposals")
    .select("*, stores(id, name), return_proposal_items(*)")
    .eq("id", params.id)
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Najava nije pronađena." }, { status: 404 });

  const proposal = data as ReturnProposal;
  if (!canViewReturnProposal(profile, proposal)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({ proposal });
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getCurrentProfile();

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient();
  const { data: existing, error: existingError } = await supabase
    .from("return_proposals")
    .select("*")
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
    const status = assertReturnStatus(body.status);
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
    .select("*, stores(id, name), return_proposal_items(*)")
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
