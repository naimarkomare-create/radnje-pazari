import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileWithClient } from "@/lib/auth";
import {
  distinctSupplierNames,
  RETURN_PROPOSAL_COLUMNS,
  todayIsoDate
} from "@/lib/return-proposals";
import { createClient } from "@/lib/supabase/server";
import type { ReturnProposal, ReturnProposalSummary } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const profile = await getCurrentProfileWithClient(supabase);

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const searchParams = request.nextUrl.searchParams;
  const page = positiveInteger(searchParams.get("page"), 1);
  const pageSize = Math.min(50, positiveInteger(searchParams.get("limit"), 30));
  let query = supabase
    .from("return_proposals")
    .select(
      `${RETURN_PROPOSAL_COLUMNS}, stores(id, name), return_proposal_items(supplier_name)`,
      { count: "exact" }
    )
    .order("updated_at", { ascending: false });

  if (profile.role === "store") {
    query = query.eq("store_id", profile.store_id);
  }

  const status = searchParams.get("status");
  if (status) query = query.eq("status", status);

  const date = searchParams.get("date");
  if (date) query = query.eq("return_date", date);

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const proposals = (
    (data ?? []) as unknown as Array<
      ReturnProposal & {
        return_proposal_items?: Array<{ supplier_name: string | null }>;
      }
    >
  ).map((proposal): ReturnProposalSummary => {
    const summaryItems = proposal.return_proposal_items ?? [];
    return {
      created_at: proposal.created_at,
      id: proposal.id,
      item_count: summaryItems.length,
      return_date: proposal.return_date,
      status: proposal.status,
      store_id: proposal.store_id,
      stores: proposal.stores,
      supplier_names: distinctSupplierNames(summaryItems),
      updated_at: proposal.updated_at
    };
  });

  return NextResponse.json({ count: count ?? proposals.length, page, pageSize, proposals });
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const profile = await getCurrentProfileWithClient(supabase);

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const storeId = profile.role === "admin" ? String(body.store_id ?? "") : profile.store_id;

  if (!storeId) return NextResponse.json({ error: "Radnja je obavezna." }, { status: 400 });

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
    .select(`${RETURN_PROPOSAL_COLUMNS}, stores(id, name)`)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("return_proposal_history").insert({
    action: "created",
    new_value: data,
    proposal_id: data.id,
    user_id: profile.id
  });
  return NextResponse.json(
    {
      proposal: {
        ...data,
        item_count: 0,
        return_proposal_items: [],
        supplier_names: []
      }
    },
    { status: 201 }
  );
}

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
