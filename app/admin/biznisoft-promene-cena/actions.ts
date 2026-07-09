"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { PRODUCE_STORE_NAMES, sortProduceStores } from "@/lib/produce";
import { createClient } from "@/lib/supabase/server";
import type { ActionState, BizniSoftPriceChange, Store } from "@/lib/types";

const SOURCE_TYPE = "biznisoft_price_change";

export async function createPriceChangeTasksForAllPending(): Promise<ActionState & { created?: number; skipped?: number; failed?: number }> {
  try {
    await requireAdmin();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("biznisoft_price_changes")
      .select("change_date, storage_key")
      .eq("status", "new")
      .eq("task_created", false);

    if (error) return { ok: false, message: error.message };

    const groups = Array.from(new Set((data ?? []).map((row) => `${row.change_date}__${row.storage_key}`)));
    let created = 0;
    let skipped = 0;
    let failed = 0;

    for (const group of groups) {
      const [changeDate, storageKey] = splitGroupKey(group);
      const result = await createTasksForGroup({ changeDate, storageKey });
      created += result.created ?? 0;
      skipped += result.skipped ?? 0;
      failed += result.ok ? 0 : 1;
    }

    revalidatePricePaths();
    return { ok: failed === 0, message: `Kreirano: ${created}. Preskočeno: ${skipped}. Neuspešno: ${failed}.`, created, skipped, failed };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Greška pri kreiranju zadataka." };
  }
}

export async function createPriceChangeTasksForGroup(
  storageKey: string,
  changeDate = todayInBelgrade()
): Promise<ActionState & { created?: number; skipped?: number }> {
  try {
    await requireAdmin();
    const result = await createTasksForGroup({ changeDate, storageKey });
    revalidatePricePaths();
    return result;
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Greška pri kreiranju zadatka." };
  }
}

export async function ignorePriceChangeGroup(storageKey: string, changeDate = todayInBelgrade()): Promise<ActionState> {
  try {
    await requireAdmin();
    const supabase = createClient();
    const { error } = await supabase
      .from("biznisoft_price_changes")
      .update({ ignored_at: new Date().toISOString(), status: "ignored" })
      .eq("change_date", changeDate)
      .eq("storage_key", storageKey)
      .eq("status", "new");

    if (error) return { ok: false, message: error.message };

    revalidatePricePaths();
    return { ok: true, message: "Promene su označene kao ignorisane." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Greška pri ignorisanju promena." };
  }
}

async function createTasksForGroup({
  changeDate,
  storageKey
}: {
  changeDate: string;
  storageKey: string;
}): Promise<ActionState & { created?: number; skipped?: number }> {
  const profile = await requireAdmin();
  const supabase = createClient();
  const { data: changesData, error: changesError } = await supabase
    .from("biznisoft_price_changes")
    .select("*")
    .eq("change_date", changeDate)
    .eq("storage_key", storageKey)
    .eq("status", "new")
    .eq("task_created", false)
    .order("article_id", { ascending: true });

  if (changesError) return { ok: false, message: changesError.message };

  const changes = (changesData ?? []) as BizniSoftPriceChange[];
  if (changes.length === 0) return { ok: true, message: "Nema nepotvrđenih promena za ovu grupu.", created: 0, skipped: 0 };

  const stores = await fetchStores(supabase);
  const storesByStorageId = storesByBizniSoftStorageId(stores);
  const targetStores = targetStoresForStorageKey(storageKey, stores, storesByStorageId);

  if (targetStores.length === 0) {
    return {
      ok: false,
      message: `Nije podešen BizniSoft StorageID za ovu radnju: ${storageLabel(storageKey, storesByStorageId)}.`,
      created: 0,
      skipped: 0
    };
  }

  const description = buildTaskDescription({
    changes,
    storageLabel: storageLabel(storageKey, storesByStorageId)
  });
  const sourceKeys = targetStores.map((store) => sourceKeyFor(changeDate, storageKey, store.id));
  const { data: existingData, error: existingError } = await supabase
    .from("store_tasks")
    .select("source_key")
    .eq("source_type", SOURCE_TYPE)
    .in("source_key", sourceKeys);

  if (existingError) return { ok: false, message: existingError.message };

  const existingKeys = new Set((existingData ?? []).map((task) => task.source_key as string));
  let created = 0;
  let skipped = 0;

  for (const store of targetStores) {
    const sourceKey = sourceKeyFor(changeDate, storageKey, store.id);

    if (existingKeys.has(sourceKey)) {
      skipped += 1;
      continue;
    }

    const { data: task, error: taskError } = await supabase
      .from("store_tasks")
      .insert({
        active: true,
        created_by: profile.id,
        description,
        due_date: changeDate,
        due_time: null,
        photo_required: true,
        priority: "hitno",
        source_key: sourceKey,
        source_type: SOURCE_TYPE,
        title: "Promeniti cene na polici"
      })
      .select("id")
      .single();

    if (taskError || !task) return { ok: false, message: taskError?.message ?? "Zadatak nije kreiran.", created, skipped };

    const { error: assignmentError } = await supabase.from("store_task_assignments").insert({
      store_id: store.id,
      task_id: task.id
    });

    if (assignmentError) return { ok: false, message: assignmentError.message, created, skipped };

    created += 1;
    existingKeys.add(sourceKey);
  }

  if (created > 0) {
    const { error: updateError } = await supabase
      .from("biznisoft_price_changes")
      .update({ status: "task_created", task_created: true, task_created_at: new Date().toISOString() })
      .in(
        "id",
        changes.map((change) => change.id)
      );

    if (updateError) return { ok: false, message: updateError.message, created, skipped };
  }

  return { ok: true, message: `Kreirano zadataka: ${created}. Preskočeno duplikata: ${skipped}.`, created, skipped };
}

async function fetchStores(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from("stores")
    .select("id, name, biznisoft_storage_id, latitude, longitude, address, created_at")
    .in("name", [...PRODUCE_STORE_NAMES]);

  if (error) throw new Error(error.message);
  return sortProduceStores((data ?? []) as Store[]);
}

function targetStoresForStorageKey(storageKey: string, stores: Store[], storesByStorageId: Map<number, Store>) {
  if (storageKey === "ALL") return stores;

  const storageId = Number(storageKey);
  const store = Number.isFinite(storageId) ? storesByStorageId.get(storageId) : null;
  return store ? [store] : [];
}

function buildTaskDescription({
  changes,
  storageLabel
}: {
  changes: BizniSoftPriceChange[];
  storageLabel: string;
}) {
  const lines = changes.slice(0, 120).map((change) => {
    const name = change.name ?? `Nepoznat artikal (ID: ${change.article_id})`;
    const barcode = change.barcode ? `, barkod: ${change.barcode}` : "";
    return `- ${name} (šifra: ${change.article_id}${barcode}): ${formatRsd(change.old_retail_price)} → ${formatRsd(change.new_retail_price)}`;
  });
  const omitted = changes.length > lines.length ? `\n... još ${changes.length - lines.length} artikala` : "";

  return [
    `Radnja: ${storageLabel}`,
    `Broj artikala: ${changes.length}`,
    "",
    "Artikli:",
    lines.join("\n") + omitted
  ].join("\n");
}

function storageLabel(storageKey: string, storesByStorageId: Map<number, Store>) {
  if (storageKey === "ALL") return "Sve radnje";

  const storageId = Number(storageKey);
  if (!Number.isFinite(storageId)) return `Nepoznat objekat (StorageID: ${storageKey})`;

  return storesByStorageId.get(storageId)?.name ?? `Nepoznat objekat (StorageID: ${storageId})`;
}

function storesByBizniSoftStorageId(stores: Store[]) {
  return new Map(
    stores
      .map((store) => {
        const storageId = store.biznisoft_storage_id ?? storageIdFromStoreName(store.name);
        return storageId ? ([storageId, store] as const) : null;
      })
      .filter((entry): entry is readonly [number, Store] => entry !== null)
  );
}

function storageIdFromStoreName(name: string) {
  const match = name.match(/Radnja\s+(\d+)/i);
  return match ? Number(match[1]) : null;
}

function sourceKeyFor(changeDate: string, storageKey: string, storeId: string) {
  return `price_change_task__${changeDate}__${storageKey}_*store*${storeId}`;
}

function splitGroupKey(group: string) {
  const [changeDate, ...storageKeyParts] = group.split("__");
  return [changeDate, storageKeyParts.join("__")] as const;
}

function formatRsd(value: number | null) {
  if (value === null) return "-";
  return value.toLocaleString("sr-RS", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

function revalidatePricePaths() {
  revalidatePath("/admin/biznisoft-promene-cena");
  revalidatePath("/admin/zadaci");
  revalidatePath("/store");
}
