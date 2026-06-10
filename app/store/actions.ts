"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/auth";
import { calculateRevenueTotal, REVENUE_FIELDS, type RevenueFieldName } from "@/lib/revenue";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

const successState: ActionState = { ok: true, message: "Uspešno poslato." };

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getRequiredText(formData: FormData, key: string, label: string) {
  const value = getText(formData, key);

  if (!value) {
    throw new Error(`${label} je obavezno polje.`);
  }

  return value;
}

function getRequiredNumber(formData: FormData, key: string, label: string) {
  const raw = getRequiredText(formData, key, label);
  const value = Number(raw);

  if (!Number.isFinite(value)) {
    throw new Error(`${label} mora biti broj.`);
  }

  return value;
}

function getNumberOrZero(formData: FormData, key: string, label: string) {
  const raw = getText(formData, key);

  if (!raw) {
    return 0;
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    throw new Error(`${label} mora biti broj.`);
  }

  return value;
}

function getOptionalText(formData: FormData, key: string) {
  const value = getText(formData, key);
  return value || null;
}

function getRevenueValues(formData: FormData) {
  const values = Object.fromEntries(
    REVENUE_FIELDS.map((field) => [field.name, getNumberOrZero(formData, field.name, field.label)])
  ) as Record<RevenueFieldName, number>;

  return {
    ...values,
    total_revenue: calculateRevenueTotal(values)
  };
}

export async function submitDailyRevenue(
  _previousState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const profile = await requireStore();
    const supabase = createClient();

    const reportDate = getRequiredText(formData, "report_date", "Datum");
    const revenueValues = getRevenueValues(formData);

    const { error } = await supabase.from("daily_revenue_reports").insert({
      store_id: profile.store_id,
      user_id: profile.id,
      report_date: reportDate,
      shift: getOptionalText(formData, "shift"),
      ...revenueValues,
      note: getOptionalText(formData, "note")
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/store/pazari");
    revalidatePath("/store/moji-unosi");
    return successState;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Greška pri slanju." };
  }
}

export async function updateStoreDailyRevenue(
  _previousState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireStore();
    const reportId = getRequiredText(formData, "id", "Pazar");
    const supabase = createClient();
    const revenueValues = getRevenueValues(formData);

    const { error } = await supabase
      .from("daily_revenue_reports")
      .update({
        report_date: getRequiredText(formData, "report_date", "Datum"),
        shift: getOptionalText(formData, "shift"),
        ...revenueValues,
        note: getOptionalText(formData, "note")
      })
      .eq("id", reportId);

    if (error) {
      return { ok: false, message: error.message.includes("Rok za izmenu") ? "Rok za izmenu je istekao. Kontaktirajte admina." : error.message };
    }

    revalidatePath("/store/pazari");
    revalidatePath("/store/moji-unosi");
    revalidatePath("/admin/pazari");
    revalidatePath("/admin/ispravka-pazara");
    return { ok: true, message: "Izmene su sačuvane." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Greška pri čuvanju izmena." };
  }
}

export async function submitTemperature(
  _previousState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const profile = await requireStore();
    const supabase = createClient();
    const deviceId = getRequiredText(formData, "device_id", "Naziv uređaja");
    const { data: device, error: deviceError } = await supabase
      .from("temperature_devices")
      .select("id, name")
      .eq("id", deviceId)
      .eq("active", true)
      .single();

    if (deviceError || !device) {
      return { ok: false, message: "Uređaj nije dostupan." };
    }

    const { error } = await supabase.from("temperature_reports").insert({
      store_id: profile.store_id,
      user_id: profile.id,
      report_date: getRequiredText(formData, "report_date", "Datum"),
      shift: getRequiredText(formData, "shift", "Smena"),
      device_id: device.id,
      device_name: device.name,
      temperature: getRequiredNumber(formData, "temperature", "Temperatura"),
      note: getOptionalText(formData, "note")
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/store/temperature");
    revalidatePath("/store/moji-unosi");
    return successState;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Greška pri slanju." };
  }
}

export async function submitProduceRequest(
  _previousState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireStore();
    const supabase = createClient();
    const rawItems = getRequiredText(formData, "items", "Artikli");
    const parsedItems: unknown = JSON.parse(rawItems);

    if (!Array.isArray(parsedItems)) {
      throw new Error("Artikli nisu ispravno poslati.");
    }

    const items = parsedItems
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const produceItemId = "produce_item_id" in item ? String(item.produce_item_id) : "";
        const quantity = "quantity" in item ? Number(item.quantity) : 0;

        if (!/^[0-9a-f-]{36}$/i.test(produceItemId) || !Number.isFinite(quantity) || quantity <= 0) {
          return null;
        }

        return { produce_item_id: produceItemId, quantity };
      })
      .filter((item): item is { produce_item_id: string; quantity: number } => item !== null);

    if (items.length === 0) {
      return { ok: false, message: "Unesite količinu za najmanje jedan artikal." };
    }

    const { error } = await supabase.rpc("submit_produce_request", {
      p_request_date: getRequiredText(formData, "request_date", "Datum"),
      p_note: getText(formData, "note"),
      p_items: items
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/store/trebovanja");
    revalidatePath("/store/moji-unosi");
    revalidatePath("/admin/trebovanja");
    return { ok: true, message: "Uspešno poslato trebovanje" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Greška pri slanju." };
  }
}
