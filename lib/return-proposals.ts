import type { Profile, ReturnProposal, ReturnProposalStatus } from "@/lib/types";

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
