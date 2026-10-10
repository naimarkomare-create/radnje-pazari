// Expiration dates are calendar dates, never local instants. Two-digit years mean 2000-2099.
export function isWriteoffIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function formatWriteoffDate(iso: string): string {
  if (!isWriteoffIsoDate(iso)) return "";
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year.slice(-2)}`;
}

export function parseWriteoffDate(display: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(display.trim());
  if (!match) return null;
  const iso = `20${match[3]}-${match[2]}-${match[1]}`;
  return isWriteoffIsoDate(iso) ? iso : null;
}

export function writeoffExcelDate(iso: string): Date {
  if (!isWriteoffIsoDate(iso)) throw new Error("Datum isteka nije ispravan.");
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
