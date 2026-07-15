import { ReturnProposalApp } from "@/components/povrati/ReturnProposalApp";
import { requireStore } from "@/lib/auth";
import { RETURN_PROPOSAL_COLUMNS, RETURN_PROPOSAL_ITEM_COLUMNS } from "@/lib/return-proposals";
import { createClient } from "@/lib/supabase/server";
import type { ReturnProposal, ReturnProposalItem, ReturnProposalSummary } from "@/lib/types";

type SummaryRow = Omit<ReturnProposal, "return_proposal_items"> & {
  return_proposal_items?: Array<{ count: number }>;
};

export default async function PovratiPage() {
  const profile = await requireStore();
  const supabase = createClient();
  const [summariesResult, latestResult] = await Promise.all([
    supabase
      .from("return_proposals")
      .select(`${RETURN_PROPOSAL_COLUMNS}, stores(id, name), return_proposal_items(count)`)
      .eq("store_id", profile.store_id)
      .order("updated_at", { ascending: false })
      .limit(20),
    supabase
      .from("return_proposals")
      .select(`${RETURN_PROPOSAL_COLUMNS}, stores(id, name)`)
      .eq("store_id", profile.store_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  if (summariesResult.error) throw new Error(summariesResult.error.message);
  if (latestResult.error) throw new Error(latestResult.error.message);

  const latest = latestResult.data as unknown as ReturnProposal | null;
  const itemsResult = latest
    ? await supabase
        .from("return_proposal_items")
        .select(RETURN_PROPOSAL_ITEM_COLUMNS, { count: "exact" })
        .eq("proposal_id", latest.id)
        .order("created_at", { ascending: false })
        .limit(50)
    : null;

  if (itemsResult?.error) throw new Error(itemsResult.error.message);

  const summaries = ((summariesResult.data ?? []) as unknown as SummaryRow[]).map(
    (proposal): ReturnProposalSummary => ({
      created_at: proposal.created_at,
      id: proposal.id,
      item_count: Number(proposal.return_proposal_items?.[0]?.count ?? 0),
      return_date: proposal.return_date,
      status: proposal.status,
      store_id: proposal.store_id,
      stores: proposal.stores,
      updated_at: proposal.updated_at
    })
  );
  const activeProposal = latest
    ? {
        ...latest,
        item_count: itemsResult?.count ?? itemsResult?.data?.length ?? 0,
        return_proposal_items: (itemsResult?.data ?? []) as ReturnProposalItem[]
      }
    : null;

  return (
    <main className="page-content">
      <ReturnProposalApp initialActiveProposal={activeProposal} initialProposals={summaries} />
    </main>
  );
}
