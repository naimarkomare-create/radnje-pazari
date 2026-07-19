import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

const EXPIRATION_DAYS = 20;
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

export type ExpiredReturnDraftCleanupResult = {
  success: true;
  deletedProposals: number;
  olderThan: string;
};

export async function deleteExpiredReturnDrafts(): Promise<ExpiredReturnDraftCleanupResult> {
  const olderThan = new Date(
    Date.now() - EXPIRATION_DAYS * DAY_IN_MILLISECONDS
  ).toISOString();
  const supabase = createServiceClient();
  const { count, error } = await supabase
    .from("return_proposals")
    .delete({ count: "exact" })
    .eq("status", "draft")
    .lt("updated_at", olderThan);

  if (error) {
    throw new Error("Brisanje starih nacrta najava povrata nije uspelo.");
  }

  return {
    deletedProposals: count ?? 0,
    olderThan,
    success: true
  };
}
