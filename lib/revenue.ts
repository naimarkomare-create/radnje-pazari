export const REVENUE_FIELDS = [
  { name: "cash_revenue", label: "Gotovina" },
  { name: "check_revenue", label: "Ček" },
  { name: "card_revenue", label: "Kartica" },
  { name: "bank_transfer_revenue", label: "Virman" },
  { name: "correction_revenue", label: "Ispravka" },
  { name: "edopuna_revenue", label: "eDopuna" }
] as const;

export type RevenueFieldName = (typeof REVENUE_FIELDS)[number]["name"];

export function calculateRevenueTotal(values: Record<RevenueFieldName, number>) {
  return REVENUE_FIELDS.reduce((total, field) => total + (Number(values[field.name]) || 0), 0);
}

export function minutesUntilEditExpires(createdAt: string) {
  const created = new Date(createdAt).getTime();
  const expires = created + 20 * 60 * 1000;
  return Math.max(0, Math.ceil((expires - Date.now()) / 60000));
}

export function canStoreEditRevenue(createdAt: string) {
  return minutesUntilEditExpires(createdAt) > 0;
}
