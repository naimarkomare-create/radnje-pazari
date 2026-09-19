import { readJsonObject, publicErrorMessage } from "@/lib/security/validation";
import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { assertReturnStatus, RETURN_PROPOSAL_COLUMNS } from "@/lib/return-proposals";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const supabase = createClient();
  const authorization = await authorizeApi(supabase, true);
  if (!authorization.ok) return authorization.response;
  const { profile } = authorization;


  const body = await readJsonObject(request);
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

  if (error) return NextResponse.json({ error: publicErrorMessage(error) }, { status: 500 });

  await supabase.from("return_proposal_history").insert({
    action: "status_updated",
    new_value: data,
    old_value: oldProposal ?? null,
    proposal_id: params.id,
    user_id: profile.id
  });

  return NextResponse.json({ proposal: data });
}
