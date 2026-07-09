import { ReturnProposalApp } from "@/components/povrati/ReturnProposalApp";
import { requireStore } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ReturnProposal } from "@/lib/types";

export default async function PovratiPage() {
  const profile = await requireStore();
  const supabase = createClient();
  const { data, error } = await supabase
    .from("return_proposals")
    .select("*, stores(id, name), return_proposal_items(*)")
    .eq("store_id", profile.store_id)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) throw new Error(error.message);

  return (
    <main className="page-content">
      <ReturnProposalApp initialProposals={(data ?? []) as ReturnProposal[]} />
    </main>
  );
}
