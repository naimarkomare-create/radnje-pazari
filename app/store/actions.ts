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
