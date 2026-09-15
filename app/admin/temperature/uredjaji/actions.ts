"use server";

import { InputError, actionError, publicErrorMessage, isUuid } from "@/lib/security/validation";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

const deviceTypes = new Set(["Frižider", "Zamrzivač", "Vitrina", "Ostalo", ""]);

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getRequiredText(formData: FormData, key: string, label: string) {
  const value = getText(formData, key);
  if (!value) throw new InputError(`${label} je obavezno polje.`);
  if ((key === "id" || key === "store_id") && !isUuid(value)) throw new InputError(`${label} nije ispravno polje.`);
  return value;
}

function getOptionalNumber(formData: FormData, key: string, label: string) {
  const raw = getText(formData, key);
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new InputError(`${label} mora biti broj.`);
  return value;
}

function getIntegerOrZero(formData: FormData, key: string, label: string) {
  const raw = getText(formData, key);
  if (!raw) return 0;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new InputError(`${label} mora biti ceo broj.`);
  return value;
}

function getDevicePayload(formData: FormData) {
  const deviceType = getText(formData, "device_type");
  if (!deviceTypes.has(deviceType)) throw new InputError("Tip uređaja nije ispravan.");

  return {
    store_id: getRequiredText(formData, "store_id", "Radnja"),
    name: getRequiredText(formData, "name", "Naziv uređaja"),
    device_type: deviceType || null,
    min_allowed: getOptionalNumber(formData, "min_allowed", "Min dozvoljena temperatura"),
    max_allowed: getOptionalNumber(formData, "max_allowed", "Max dozvoljena temperatura"),
    active: formData.get("active") === "on",
    sort_order: getIntegerOrZero(formData, "sort_order", "Redosled")
  };
}

export async function addTemperatureDevice(
  _previousState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireAdmin();
    const supabase = createClient();
    const { error } = await supabase.from("temperature_devices").insert(getDevicePayload(formData));

    if (error) return { ok: false, message: publicErrorMessage(error) };

    revalidatePath("/admin/temperature/uredjaji");
    revalidatePath("/store/temperature");
    return { ok: true, message: "Uređaj je sačuvan." };
  } catch (error) {
    return { ok: false, message: actionError(error, "Greška pri čuvanju uređaja.") };
  }
}

export async function updateTemperatureDevice(
  _previousState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = getRequiredText(formData, "id", "Uređaj");
    const supabase = createClient();
    const { error } = await supabase.from("temperature_devices").update(getDevicePayload(formData)).eq("id", id);

    if (error) return { ok: false, message: publicErrorMessage(error) };

    revalidatePath("/admin/temperature/uredjaji");
    revalidatePath("/store/temperature");
    return { ok: true, message: "Uređaj je sačuvan." };
  } catch (error) {
    return { ok: false, message: actionError(error, "Greška pri čuvanju uređaja.") };
  }
}

export async function setTemperatureDeviceActive(
  _previousState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireAdmin();
    const id = getRequiredText(formData, "id", "Uređaj");
    const active = getRequiredText(formData, "active", "Aktivan") === "true";
    const supabase = createClient();
    const { error } = await supabase.from("temperature_devices").update({ active }).eq("id", id);

    if (error) return { ok: false, message: publicErrorMessage(error) };

    revalidatePath("/admin/temperature/uredjaji");
    revalidatePath("/store/temperature");
    return { ok: true, message: "Uređaj je sačuvan." };
  } catch (error) {
    return { ok: false, message: actionError(error, "Greška pri čuvanju uređaja.") };
  }
}
