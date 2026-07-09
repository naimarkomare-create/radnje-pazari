import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { assertReturnStatus } from "@/lib/return-proposals";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const profile = await getCurrentProfile();

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const status = assertReturnStatus(String(body.status ?? ""));
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status,
    updated_by: profile.id
  };

  if (status === "reviewed") {
    update.reviewed_at = now;
    update.reviewed_by = profile.id;
  }
  if (status === "completed") update.completed_at = now;
  if (status === "cancelled") update.cancelled_at = now;
  if (status === "submitted") update.submitted_at = now;

  const supabase = createClient();
  const { data: oldProposal } = await supabase.from("return_proposals").select("*").eq("id", params.id).single();
  const { data, error } = await supabase
    .from("return_proposals")
    .update(update)
    .eq("id", params.id)
    .select("*, stores(id, name), return_proposal_items(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("return_proposal_history").insert({
    action: "status_updated",
    new_value: data,
    old_value: oldProposal ?? null,
    proposal_id: params.id,
    user_id: profile.id
  });

  return NextResponse.json({ proposal: data });
}
