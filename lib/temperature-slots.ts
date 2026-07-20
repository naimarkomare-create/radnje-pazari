export const TEMPERATURE_SLOTS = [
  {
    aliases: ["07", "07:00"],
    label: "Prva smena",
    time: "07:00",
    value: "Prva smena"
  },
  {
    aliases: ["14", "14:00"],
    label: "Međusmena",
    time: "14:00",
    value: "Međusmena"
  },
  {
    aliases: ["20", "20:00", "Treća smena"],
    label: "Druga smena",
    time: "20:00",
    value: "Druga smena"
  }
] as const;

export type TemperatureSlotValue = (typeof TEMPERATURE_SLOTS)[number]["value"];

export function isTemperatureSlotValue(value: string): value is TemperatureSlotValue {
  return TEMPERATURE_SLOTS.some((slot) => slot.value === value);
}

export function temperatureSlotIndex(value: string | null) {
  if (!value) return null;

  const normalized = normalizeSlotText(value);
  const index = TEMPERATURE_SLOTS.findIndex(
    (slot) =>
      normalizeSlotText(slot.value) === normalized ||
      slot.aliases.some((alias) => normalizeSlotText(alias) === normalized)
  );

  return index >= 0 ? index : null;
}

export function formatTemperatureSlot(value: string | null) {
  const index = temperatureSlotIndex(value);
  if (index === null) return value || "Bez smene";

  const slot = TEMPERATURE_SLOTS[index];
  return `${slot.label} — ${slot.time}`;
}

function normalizeSlotText(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("sr")
    .replace(/[đð]/g, "dj")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
