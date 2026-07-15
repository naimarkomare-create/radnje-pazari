import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileWithClient } from "@/lib/auth";
import { assertReturnStatus, RETURN_PROPOSAL_COLUMNS } from "@/lib/return-proposals";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const profile = await getCurrentProfileWithClient(supabase);

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  let status;
  try {
    status = assertReturnStatus(String(body.status ?? ""));
  } catch {
    return NextResponse.json({ error: "Status nije ispravan." }, { status: 400 });
  }
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

  const { data: oldProposal } = await supabase.from("return_proposals").select(RETURN_PROPOSAL_COLUMNS).eq("id", params.id).single();
  const { data, error } = await supabase
    .from("return_proposals")
    .update(update)
    .eq("id", params.id)
    .select(`${RETURN_PROPOSAL_COLUMNS}, stores(id, name)`)
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
