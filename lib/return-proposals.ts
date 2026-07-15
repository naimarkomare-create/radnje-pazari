import type { Profile, ReturnProposal, ReturnProposalStatus } from "@/lib/types";

export const RETURN_PROPOSAL_COLUMNS =
  "id, store_id, status, return_date, note, partner_id, partner_name, created_by, updated_by, submitted_at, reviewed_by, reviewed_at, completed_at, cancelled_at, created_at, updated_at";

export const RETURN_PROPOSAL_ITEM_COLUMNS =
  "id, proposal_id, article_id, article_name, barcode, unit, quantity, reason, note, created_by, updated_by, created_at, updated_at";

export const editableReturnStatuses: ReturnProposalStatus[] = ["draft", "submitted"];
export const returnStatuses: ReturnProposalStatus[] = ["draft", "submitted", "reviewed", "completed", "cancelled"];

export function canEditReturnProposal(profile: Profile, proposal: Pick<ReturnProposal, "status" | "store_id">) {
  if (profile.role === "admin") return true;
  return profile.role === "store" && profile.store_id === proposal.store_id && editableReturnStatuses.includes(proposal.status);
}

export function canViewReturnProposal(profile: Profile, proposal: Pick<ReturnProposal, "store_id">) {
  return profile.role === "admin" || (profile.role === "store" && profile.store_id === proposal.store_id);
}

export function assertReturnStatus(value: string): ReturnProposalStatus {
  if (!returnStatuses.includes(value as ReturnProposalStatus)) {
    throw new Error("Status nije ispravan.");
  }

  return value as ReturnProposalStatus;
}

export function todayIsoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Belgrade",
    year: "numeric"
  }).format(new Date());
}
