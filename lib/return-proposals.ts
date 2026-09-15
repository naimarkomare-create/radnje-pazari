import { formatSerbianIsoDate, todayInBelgrade } from "@/lib/date";
import type { Profile, ReturnProposal, ReturnProposalStatus } from "@/lib/types";

export const RETURN_PROPOSAL_COLUMNS =
  "id, store_id, status, return_date, note, partner_id, partner_name, created_by, updated_by, submitted_at, reviewed_by, reviewed_at, completed_at, cancelled_at, created_at, updated_at";

export const RETURN_PROPOSAL_ITEM_COLUMNS =
  "id, proposal_id, article_id, article_name, barcode, unit, quantity, reason, note, supplier_id, supplier_partner_id, supplier_name, supplier_relation_source, created_by, updated_by, created_at, updated_at";

export const editableReturnStatuses: ReturnProposalStatus[] = ["draft", "submitted"];
export const returnStatuses: ReturnProposalStatus[] = ["draft", "submitted", "reviewed", "completed", "cancelled"];
export const returnStatusLabels: Record<ReturnProposalStatus, string> = {
  cancelled: "Otkazano",
  completed: "Završeno",
  draft: "Nacrt",
  reviewed: "Pregledano",
  submitted: "Poslato"
};

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

export function returnStatusLabel(status: ReturnProposalStatus) {
  return returnStatusLabels[status];
}

export function formatReturnDate(value: string | null) {
  if (!value) return "-";
  return formatSerbianIsoDate(value);
}

export function formatReturnItemCount(count: number) {
  const normalized = Math.max(0, Math.trunc(count));
  const lastTwo = normalized % 100;
  const last = normalized % 10;
  const noun =
    lastTwo >= 11 && lastTwo <= 14
      ? "artikala"
      : last === 1
        ? "artikal"
        : last >= 2 && last <= 4
          ? "artikla"
          : "artikala";
  return `${normalized} ${noun}`;
}

export function distinctSupplierNames(
  items: Array<{ supplier_name?: string | null }>
) {
  return Array.from(
    new Set(
      items
        .map((item) => item.supplier_name?.trim())
        .filter((name): name is string => Boolean(name))
    )
  ).sort((left, right) => left.localeCompare(right, "sr"));
}

export function supplierRelationSourceLabel(source: string | null | undefined) {
  if (source === "manual_selection") return "Ručno izabrano";
  if (source === "manual_admin") return "Ručno trajno povezano";
  if (source === "latest_purchase" || source === "purchase_calculation") {
    return "Nabavna kalkulacija";
  }
  if (source === "biznisoft_direct") return "Automatski povezano";
  if (source === "primary_supplier") return "Primarni dobavljač";
  return source ? "Automatski povezano" : null;
}

export function returnSupplierSummary(supplierNames: string[], itemCount: number) {
  if (itemCount === 0) return "Bez artikala";
  if (supplierNames.length === 0) return "Dobavljač nije povezan";
  if (supplierNames.length === 1) return supplierNames[0];
  return `Više dobavljača (${supplierNames.length})`;
}

export function todayIsoDate() {
  return todayInBelgrade();
}
