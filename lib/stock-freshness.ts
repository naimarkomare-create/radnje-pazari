export const DEFAULT_STOCK_FRESHNESS_MINUTES = 30;

export function stockIsStale(timestamp: string | null | undefined, thresholdMinutes = DEFAULT_STOCK_FRESHNESS_MINUTES, now = Date.now()) {
  const value = timestamp ? Date.parse(timestamp) : NaN;
  return !Number.isFinite(value) || now - value > thresholdMinutes * 60_000 || value > now + 60_000;
}

export function formatStockTimestamp(timestamp: string | null | undefined) {
  if (!timestamp || !Number.isFinite(Date.parse(timestamp))) return "nije dostupno";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Belgrade", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(timestamp));
  const part = (name: string) => parts.find((item) => item.type === name)?.value;
  return `${part("day")}/${part("month")}/${part("year")} ${part("hour")}:${part("minute")}`;
}
