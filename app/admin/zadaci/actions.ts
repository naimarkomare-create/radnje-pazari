"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { PRODUCE_STORE_NAMES } from "@/lib/produce";
import { objectPathFromStoragePath, SHELF_PHOTOS_BUCKET } from "@/lib/shelf-photos";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { ActionState, TaskPriority } from "@/lib/types";

const priorities: TaskPriority[] = ["podsetnik", "vazno", "hitno"];

function getText(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function createStoreTask(_previousState: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const profile = await requireAdmin();
    const title = getText(formData, "title");
    const dueDate = getText(formData, "due_date");
    const dueTime = getText(formData, "due_time") || null;
    const priority = getText(formData, "priority") as TaskPriority;
    const selectedStoreIds = formData.getAll("store_ids").map(String).filter(Boolean);
    const allStores = getText(formData, "all_stores") === "on";

    if (!title) return { ok: false, message: "Naslov zadatka je obavezan." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return { ok: false, message: "Rok datum nije ispravan." };
    if (dueTime && !/^\d{2}:\d{2}$/.test(dueTime)) return { ok: false, message: "Rok vreme nije ispravno." };
    if (!priorities.includes(priority)) return { ok: false, message: "Oznaka nije ispravna." };

    const supabase = createClient();
    const storesQuery = supabase.from("stores").select("id, name").in("name", [...PRODUCE_STORE_NAMES]);
    const storesResult = allStores
      ? await storesQuery
      : await storesQuery.in("id", selectedStoreIds.length > 0 ? selectedStoreIds : ["00000000-0000-0000-0000-000000000000"]);
    const stores = storesResult.data ?? [];

    if (storesResult.error) return { ok: false, message: storesResult.error.message };
    if (stores.length === 0) return { ok: false, message: "Izaberite najmanje jednu radnju." };

    const { data: task, error: taskError } = await supabase
      .from("store_tasks")
      .insert({
        title,
        description: getText(formData, "description") || null,
        due_date: dueDate,
        due_time: dueTime,
        priority,
        photo_required: getText(formData, "photo_required") === "on",
        created_by: profile.id
      })
      .select("id")
      .single();

    if (taskError || !task) return { ok: false, message: taskError?.message ?? "Zadatak nije kreiran." };

    const { error: assignmentsError } = await supabase.from("store_task_assignments").insert(
      stores.map((store) => ({
        task_id: task.id,
        store_id: store.id
      }))
    );

    if (assignmentsError) return { ok: false, message: assignmentsError.message };

    revalidatePath("/admin/zadaci");
    revalidatePath("/store");
    return { ok: true, message: "Zadatak je poslat." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Greška pri slanju zadatka." };
  }
}

export async function deleteTaskPhoto(assignmentId: string): Promise<ActionState> {
  try {
    await requireAdmin();
    const supabase = createClient();
    const { data: assignment, error } = await supabase
      .from("store_task_assignments")
      .select("id, task_id, photo_path")
      .eq("id", assignmentId)
      .single();

    if (error || !assignment) return { ok: false, message: error?.message ?? "Fotografija nije pronađena." };

    const objectPath = objectPathFromStoragePath(assignment.photo_path);

    if (objectPath) {
      const service = createServiceClient();
      const { error: storageError } = await service.storage.from(SHELF_PHOTOS_BUCKET).remove([objectPath]);
      if (storageError) return { ok: false, message: storageError.message };
    }

    const { error: updateError } = await supabase
      .from("store_task_assignments")
      .update({ photo_path: null, photo_url: null })
      .eq("id", assignmentId);

    if (updateError) return { ok: false, message: updateError.message };

    revalidatePath("/admin/zadaci");
    revalidatePath(`/admin/zadaci/${assignment.task_id}`);
    return { ok: true, message: "Slika je obrisana." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Greška pri brisanju slike." };
  }
}
