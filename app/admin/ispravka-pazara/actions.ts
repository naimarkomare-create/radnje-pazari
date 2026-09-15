"use server";

import { InputError, actionError, publicErrorMessage, isUuid } from "@/lib/security/validation";
import { isValidIsoDate } from "@/lib/date";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { calculateRevenueTotal, REVENUE_FIELDS, type RevenueFieldName } from "@/lib/revenue";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function getRequiredText(formData: FormData, key: string, label: string) {
  const value = getText(formData, key);

  if (!value) {
    throw new InputError(`${label} je obavezno polje.`);
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
    throw new InputError(`${label} mora biti broj.`);
  }

  return value;
}

function getRevenueValues(formData: FormData) {
  const values = Object.fromEntries(
    REVENUE_FIELDS.map((field) => [field.name, getNumberOrZero(formData, field.name, field.label)])
  ) as Record<RevenueFieldName, number>;
  const manualTotal = getText(formData, "total_revenue");
  const total = manualTotal ? getNumberOrZero(formData, "total_revenue", "Ukupno") : calculateRevenueTotal(values);
  if (!Number.isFinite(total)) throw new InputError("Ukupno mora biti konačan broj.");

  return {
    ...values,
    total_revenue: total
  };
}

export async function updateAdminDailyRevenue(
  _previousState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await requireAdmin();
    const reportId = getRequiredText(formData, "id", "Pazar");
    const reportDate = getRequiredText(formData, "report_date", "Datum");
    if (!isUuid(reportId) || !isValidIsoDate(reportDate)) throw new InputError("Pazar ili datum nije ispravan.");
    const supabase = createClient();
    const { error } = await supabase
      .from("daily_revenue_reports")
      .update({
        report_date: reportDate,
        shift: getText(formData, "shift") || null,
        ...getRevenueValues(formData),
        note: getText(formData, "note") || null
      })
      .eq("id", reportId);

    if (error) {
      return { ok: false, message: publicErrorMessage(error) };
    }

    revalidatePath("/admin/ispravka-pazara");
    revalidatePath("/admin/pazari");
    revalidatePath("/store/pazari");
    return { ok: true, message: "Izmene su sačuvane." };
  } catch (error) {
    return { ok: false, message: actionError(error, "Greška pri čuvanju izmena.") };
  }
}
