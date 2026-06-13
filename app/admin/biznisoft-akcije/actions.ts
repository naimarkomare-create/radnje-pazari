"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  articleText,
  formatDateTime,
  groupSaleActions,
  parseSaleActionGroupKey,
  saleActionGroupKeyFromParts,
  storageIdFromStoreName,
  storageLabel
} from "@/lib/biznisoft/groups";
import { todayInBelgrade } from "@/lib/date";
import { PRODUCE_STORE_NAMES, sortProduceStores } from "@/lib/produce";
import { createClient } from "@/lib/supabase/server";
import type { ActionState, BizniSoftSaleActionWithArticle, Store } from "@/lib/types";

const SOURCE_TYPE = "biznisoft_sale_action_group";
const TASK_TYPE = "postaviti";

export async function createSaleActionTasks(): Promise<ActionState & { created?: number; skipped?: number }> {
  try {
    await requireAdmin();
    const supabase = createClient();
    const today = todayInBelgrade();
    const { start } = dayRange(today);
    const rowsResult = await supabase
      .from("biznisoft_sale_actions_with_articles")
      .select("*")
      .or(`chapter_to.is.null,chapter_to.gte.${start}`);

    if (rowsResult.error) return { ok: false, message: rowsResult.error.message };

    const groups = groupSaleActions((rowsResult.data ?? []) as unknown as BizniSoftSaleActionWithArticle[]);
    return createTasksForGroups(groups.map((group) => group.groupKey));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Greška pri kreiranju zadataka." };
  }
}

export async function createSaleActionGroupTask(groupKey: string): Promise<ActionState & { created?: number; skipped?: number }> {
  try {
    await requireAdmin();
    return createTasksForGroups([decodeURIComponent(groupKey)]);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Greška pri kreiranju zadatka." };
  }
}

async function createTasksForGroups(groupKeys: string[]): Promise<ActionState & { created?: number; skipped?: number }> {
  const supabase = createClient();
  const profile = await requireAdmin();
  const storesResult = await supabase
    .from("stores")
    .select("id, name, latitude, longitude, address, created_at")
    .in("name", [...PRODUCE_STORE_NAMES]);

  if (storesResult.error) return { ok: false, message: storesResult.error.message };

  const stores = sortProduceStores((storesResult.data ?? []) as Store[]);
  const storesByStorageId = new Map(
    stores.map((store) => [storageIdFromStoreName(store.name), store]).filter((entry): entry is [number, Store] => entry[0] !== null)
  );
  const plans = [];

  for (const groupKey of groupKeys) {
    const parts = parseSaleActionGroupKey(groupKey);
    if (!parts) continue;

    let query = supabase
      .from("biznisoft_sale_actions_with_articles")
      .select("*")
      .eq("action_type", parts.action_type);

    query = parts.storage_id === null ? query.is("storage_id", null) : query.eq("storage_id", parts.storage_id);
    query = parts.from_chapter === null ? query.is("from_chapter", null) : query.eq("from_chapter", parts.from_chapter);
    query = parts.chapter_to === null ? query.is("chapter_to", null) : query.eq("chapter_to", parts.chapter_to);

    const rowsResult = await query;
    if (rowsResult.error) return { ok: false, message: rowsResult.error.message };

    const rows = ((rowsResult.data ?? []) as unknown as BizniSoftSaleActionWithArticle[]).filter(
      (row) => (row.loyalty_level ?? 0) === parts.loyalty_level && (row.priority_level ?? 0) === parts.priority_level
    );
    if (rows.length === 0) continue;

    const storeIds = parts.storage_id === null ? stores.map((store) => store.id) : [storesByStorageId.get(parts.storage_id)?.id].filter((id): id is string => Boolean(id));
    if (storeIds.length === 0) continue;

    plans.push({
      description: buildTaskDescription(rows, storesByStorageId),
      dueDate: taskDueDate(parts.from_chapter),
      sourceKey: `${saleActionGroupKeyFromParts(parts)}__${TASK_TYPE}`,
      storeIds
    });
  }

  if (plans.length === 0) return { ok: true, message: "Nema akcija za koje treba napraviti zadatke.", created: 0, skipped: 0 };

  const existingResult = await supabase
    .from("store_tasks")
    .select("source_type, source_key")
    .eq("source_type", SOURCE_TYPE)
    .in(
      "source_key",
      plans.map((plan) => plan.sourceKey)
    );

  if (existingResult.error) return { ok: false, message: existingResult.error.message };

  const existingKeys = new Set((existingResult.data ?? []).map((task) => task.source_key as string));
  let created = 0;
  let skipped = 0;

  for (const plan of plans) {
    if (existingKeys.has(plan.sourceKey)) {
      skipped += 1;
      continue;
    }

    const { data: task, error: taskError } = await supabase
      .from("store_tasks")
      .insert({
        active: true,
        created_by: profile.id,
        description: plan.description,
        due_date: plan.dueDate,
        due_time: null,
        photo_required: true,
        priority: "vazno",
        source_key: plan.sourceKey,
        source_type: SOURCE_TYPE,
        title: "Postaviti akcijske cene"
      })
      .select("id")
      .single();

    if (taskError || !task) return { ok: false, message: taskError?.message ?? "Zadatak nije kreiran.", created, skipped };

    const { error: assignmentError } = await supabase.from("store_task_assignments").insert(
      plan.storeIds.map((storeId) => ({
        task_id: task.id,
        store_id: storeId
      }))
    );

    if (assignmentError) return { ok: false, message: assignmentError.message, created, skipped };

    created += 1;
    existingKeys.add(plan.sourceKey);
  }

  revalidatePath("/admin/biznisoft-akcije");
  revalidatePath("/admin/zadaci");
  revalidatePath("/store");
  return { ok: true, message: `Kreirano zadataka: ${created}. Preskočeno duplikata: ${skipped}.`, created, skipped };
}

function buildTaskDescription(rows: BizniSoftSaleActionWithArticle[], storesByStorageId: Map<number, Store>) {
  const first = rows[0];
  const lines = rows.slice(0, 80).map((row) => {
    const article = articleText(row);
    return `- ${article.name} (${article.id}), cena: ${row.retail_price ?? "-"}`;
  });
  const omitted = rows.length > lines.length ? `\n... još ${rows.length - lines.length} artikala` : "";

  return [
    `Period: ${formatDateTime(first.from_chapter)} - ${formatDateTime(first.chapter_to)}`,
    `Radnja: ${storageLabel(first.storage_id, storesByStorageId)}`,
    `Broj artikala: ${rows.length}`,
    "",
    "Artikli:",
    lines.join("\n") + omitted
  ].join("\n");
}

function taskDueDate(fromChapter: string | null) {
  if (!fromChapter) return todayInBelgrade();

  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Belgrade",
    year: "numeric"
  }).format(new Date(fromChapter));
}

function dayRange(date: string) {
  const next = nextDate(date);
  return {
    end: `${next}T00:00:00+01:00`,
    start: `${date}T00:00:00+01:00`
  };
}

function nextDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + 1);

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
