"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import {
  calculateRevenueTotal,
  canStoreEditRevenue,
  REVENUE_FIELDS,
  type RevenueFieldName
} from "@/lib/revenue";
import { createClient } from "@/lib/supabase/server";
import { isTemperatureSlotValue } from "@/lib/temperature-slots";
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

function getRequiredTemperature(formData: FormData) {
  const raw = getRequiredText(formData, "temperature", "Temperatura").replace(",", ".");

  if (raw === "-" || raw === "+" || raw === "." || raw === "-." || raw === "+.") {
    throw new Error("Unesite ispravnu temperaturu.");
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    throw new Error("Unesite ispravnu temperaturu.");
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

function assertTodayRevenueRequest(formData: FormData, today: string) {
  const suppliedDate = getText(formData, "report_date");

  if (suppliedDate && suppliedDate !== today) {
    throw new Error("Pazar se može uneti samo za današnji datum.");
  }
}

function dailyRevenueErrorMessage(error: { code?: string; message: string }) {
  if (
    error.code === "23505" ||
    error.message.includes("Pazar za današnji datum je već unet")
  ) {
    return "Pazar za današnji datum je već unet.";
  }

  if (error.message.includes("Rok za izmenu")) {
    return "Rok za izmenu je istekao. Kontaktirajte admina.";
  }

  return error.message;
}

export async function submitDailyRevenue(
  _previousState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const profile = await requireStore();
    const supabase = createClient();
    const today = todayInBelgrade();
    assertTodayRevenueRequest(formData, today);
    const revenueValues = getRevenueValues(formData);
    const { data: existing, error: existingError } = await supabase
      .from("daily_revenue_reports")
      .select("id")
      .eq("store_id", profile.store_id)
      .eq("report_date", today)
      .limit(1);

    if (existingError) {
      return { ok: false, message: existingError.message };
    }

    if ((existing ?? []).length > 0) {
      return {
        ok: false,
        message: "Pazar za današnji datum je već unet."
      };
    }

    const { error } = await supabase.from("daily_revenue_reports").insert({
      store_id: profile.store_id,
      user_id: profile.id,
      report_date: today,
      shift: null,
      ...revenueValues,
      note: getOptionalText(formData, "note")
    });

    if (error) {
      return { ok: false, message: dailyRevenueErrorMessage(error) };
    }

    revalidatePath("/store/pazari");
    revalidatePath("/store/moji-unosi");
    return { ok: true, message: "Pazar za danas je sačuvan." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Greška pri slanju." };
  }
}

export async function updateStoreDailyRevenue(
  _previousState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    const profile = await requireStore();
    const reportId = getRequiredText(formData, "id", "Pazar");
    const supabase = createClient();
    const today = todayInBelgrade();
    assertTodayRevenueRequest(formData, today);
    const revenueValues = getRevenueValues(formData);
    const { data: existing, error: existingError } = await supabase
      .from("daily_revenue_reports")
      .select("id, store_id, user_id, report_date, created_at")
      .eq("id", reportId)
      .maybeSingle();

    if (existingError || !existing) {
      return { ok: false, message: "Pazar nije pronađen." };
    }

    if (
      existing.store_id !== profile.store_id ||
      existing.user_id !== profile.id
    ) {
      return { ok: false, message: "Nemate dozvolu za izmenu ovog pazara." };
    }

    if (existing.report_date !== today) {
      return {
        ok: false,
        message: "Pazar se može izmeniti samo za današnji datum."
      };
    }

    if (!canStoreEditRevenue(existing.created_at)) {
      return {
        ok: false,
        message: "Rok za izmenu je istekao. Kontaktirajte admina."
      };
    }

    const { data: updated, error } = await supabase
      .from("daily_revenue_reports")
      .update({
        ...revenueValues,
        note: getOptionalText(formData, "note")
      })
      .eq("id", reportId)
      .eq("report_date", today)
      .select("id")
      .maybeSingle();

    if (error) {
      return { ok: false, message: dailyRevenueErrorMessage(error) };
    }

    if (!updated) {
      return {
        ok: false,
        message: "Pazar nije sačuvan. Pokušajte ponovo."
      };
    }

    revalidatePath("/store/pazari");
    revalidatePath("/store/moji-unosi");
    revalidatePath("/admin/pazari");
    revalidatePath("/admin/ispravka-pazara");
    return { ok: true, message: "Pazar za danas je sačuvan." };
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
    const shift = getRequiredText(formData, "shift", "Smena");

    if (!isTemperatureSlotValue(shift)) {
      return { ok: false, message: "Izabrana smena nije ispravna." };
    }

    const { data: device, error: deviceError } = await supabase
      .from("temperature_devices")
      .select("id, name")
      .eq("id", deviceId)
      .eq("store_id", profile.store_id)
      .eq("active", true)
      .single();

    if (deviceError || !device) {
      return { ok: false, message: "Uređaj nije dostupan." };
    }

    const { error } = await supabase.from("temperature_reports").insert({
      store_id: profile.store_id,
      user_id: profile.id,
      report_date: getRequiredText(formData, "report_date", "Datum"),
      shift,
      device_id: device.id,
      device_name: device.name,
      temperature: getRequiredTemperature(formData),
      note: getOptionalText(formData, "note")
    });

    if (error) {
      if (error.code === "23505") {
        return {
          ok: false,
          message: "Temperatura za izabrani uređaj, datum i smenu je već uneta."
        };
      }

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
