"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function completeStoreTask({
  assignmentId,
  photoPath
}: {
  assignmentId: string;
  photoPath?: string | null;
}): Promise<ActionState> {
  try {
    const profile = await requireStore();
    const storeId = profile.store_id;

    if (!storeId || !/^[0-9a-f-]{36}$/i.test(assignmentId)) {
      return { ok: false, message: "Zadatak nije ispravan." };
    }

    const supabase = createClient();
    const { data: assignment, error: assignmentError } = await supabase
      .from("store_task_assignments")
      .select("id, store_id, status, store_tasks(photo_required)")
      .eq("id", assignmentId)
      .eq("store_id", storeId)
      .single();

    if (assignmentError || !assignment) {
      return { ok: false, message: assignmentError?.message ?? "Zadatak nije pronađen." };
    }

    const task = Array.isArray(assignment.store_tasks) ? assignment.store_tasks[0] : assignment.store_tasks;
    const photoRequired = Boolean(task?.photo_required);

    if (photoRequired && !photoPath) {
      return { ok: false, message: "Slika je obavezna za ovaj zadatak." };
    }

    if (photoPath && !photoPath.startsWith(`shelf-photos/tasks/${storeId}/${assignmentId}/`)) {
      return { ok: false, message: "Putanja slike nije ispravna." };
    }

    const { error } = await supabase
      .from("store_task_assignments")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
        completed_by: profile.id,
        photo_path: photoPath || null,
        photo_url: photoPath || null
      })
      .eq("id", assignmentId)
      .eq("store_id", storeId);

    if (error) return { ok: false, message: error.message };

    revalidatePath("/store");
    revalidatePath("/admin/zadaci");
    return { ok: true, message: "Zadatak je završen." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Greška pri završavanju zadatka." };
  }
}
