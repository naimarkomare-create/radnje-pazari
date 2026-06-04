"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/auth";
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

function getOptionalNumber(formData: FormData, key: string, label: string) {
  const raw = getText(formData, key);

  if (!raw) {
    return null;
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

export async function submitDailyRevenue(
  _previousState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const profile = await requireStore();
    const supabase = createClient();

    const reportDate = getRequiredText(formData, "report_date", "Datum");
    const cashRevenue = getRequiredNumber(formData, "cash_revenue", "Gotovina");
    const cardRevenue = getRequiredNumber(formData, "card_revenue", "Kartica");
    const totalRevenue = getRequiredNumber(formData, "total_revenue", "Ukupno");

    const { error } = await supabase.from("daily_revenue_reports").insert({
      store_id: profile.store_id,
      user_id: profile.id,
      report_date: reportDate,
      shift: getOptionalText(formData, "shift"),
      cash_revenue: cashRevenue,
      card_revenue: cardRevenue,
      total_revenue: totalRevenue,
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

export async function submitTemperature(
  _previousState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const profile = await requireStore();
    const supabase = createClient();

    const { error } = await supabase.from("temperature_reports").insert({
      store_id: profile.store_id,
      user_id: profile.id,
      report_date: getRequiredText(formData, "report_date", "Datum"),
      device_name: getRequiredText(formData, "device_name", "Naziv uređaja"),
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
    const profile = await requireStore();
    const supabase = createClient();

    const { error } = await supabase.from("produce_requests").insert({
      store_id: profile.store_id,
      user_id: profile.id,
      request_date: getRequiredText(formData, "request_date", "Datum"),
      item_name: getRequiredText(formData, "item_name", "Naziv artikla"),
      quantity: getOptionalNumber(formData, "quantity", "Količina"),
      unit: getOptionalText(formData, "unit"),
      note: getOptionalText(formData, "note")
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/store/trebovanja");
    revalidatePath("/store/moji-unosi");
    return successState;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Greška pri slanju." };
  }
}
