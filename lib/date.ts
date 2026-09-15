export const BELGRADE_TIME_ZONE = "Europe/Belgrade";

const belgradeDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BELGRADE_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

const belgradeDateTimeFormatter = new Intl.DateTimeFormat("sr-RS", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: BELGRADE_TIME_ZONE
});

export function formatBelgradeDateTime(value: string) {
  return belgradeDateTimeFormatter.format(new Date(value));
}

export function todayInBelgrade(now = new Date()) {
  const parts = belgradeDateFormatter.formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    throw new Error("Nije moguće odrediti poslovni datum.");
  }

  return `${year}-${month}-${day}`;
}

export function businessDateInBelgrade(dayOffset = 0, now = new Date()) {
  return addDaysToIsoDate(todayInBelgrade(now), dayOffset);
}

export function addDaysToIsoDate(value: string, dayOffset: number) {
  if (!isValidIsoDate(value)) {
    throw new Error("Datum nije ispravan.");
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + dayOffset);

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0")
  ].join("-");
}

export function isValidIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function formatSerbianIsoDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}.${match[2]}.${match[1]}.` : value;
}
