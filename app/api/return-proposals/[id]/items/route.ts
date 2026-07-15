import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileWithClient } from "@/lib/auth";
import { canEditReturnProposal, RETURN_PROPOSAL_ITEM_COLUMNS } from "@/lib/return-proposals";
import { createClient } from "@/lib/supabase/server";
import type { ReturnProposal } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const profile = await getCurrentProfileWithClient(supabase);

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: proposalData, error: proposalError } = await supabase
    .from("return_proposals")
    .select("id, store_id, status")
    .eq("id", params.id)
    .single();

  if (proposalError || !proposalData) return NextResponse.json({ error: proposalError?.message ?? "Najava nije pronađena." }, { status: 404 });

  const proposal = proposalData as ReturnProposal;
  if (!canEditReturnProposal(profile, proposal)) return NextResponse.json({ error: "Najava nije otvorena za izmene." }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const articleId = Number(body.article_id);
  const quantity = Number(body.quantity);
  const articleName = String(body.article_name ?? "").trim();

  if (!Number.isInteger(articleId)) return NextResponse.json({ error: "ArticleID nije ispravan." }, { status: 400 });
  if (!articleName) return NextResponse.json({ error: "Naziv artikla je obavezan." }, { status: 400 });
  if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: "Količina mora biti veća od 0." }, { status: 400 });

  const { data, error } = await supabase
    .from("return_proposal_items")
    .insert({
      article_id: articleId,
      article_name: articleName,
      barcode: typeof body.barcode === "string" ? body.barcode : null,
      created_by: profile.id,
      note: typeof body.note === "string" ? body.note : null,
      proposal_id: params.id,
      quantity,
      raw_article: {},
      reason: typeof body.reason === "string" ? body.reason : null,
      unit: typeof body.unit === "string" ? body.unit : null,
      updated_by: profile.id
    })
    .select(RETURN_PROPOSAL_ITEM_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await Promise.all([
    supabase.from("return_proposals").update({ updated_by: profile.id }).eq("id", params.id),
    supabase.from("return_proposal_history").insert({
      action: "item_added",
      item_id: data.id,
      new_value: data,
      proposal_id: params.id,
      user_id: profile.id
    })
  ]);

  return NextResponse.json({ item: data }, { status: 201 });
}
