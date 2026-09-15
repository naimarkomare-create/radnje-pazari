"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/auth";
import { taskPhotoObjectPath, SHELF_PHOTOS_BUCKET } from "@/lib/shelf-photos";
import { isUuid } from "@/lib/security/validation";
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

    if (!storeId || !isUuid(assignmentId)) {
      return { ok: false, message: "Zadatak nije ispravan." };
    }

    const supabase = createClient();
    const { data: assignment, error: assignmentError } = await supabase
      .from("store_task_assignments")
      .select("id, store_id, status, store_tasks(photo_required, active)")
      .eq("id", assignmentId)
      .eq("store_id", storeId)
      .single();

    if (assignmentError || !assignment) {
      return { ok: false, message: "Zadatak nije pronađen." };
    }

    const task = Array.isArray(assignment.store_tasks) ? assignment.store_tasks[0] : assignment.store_tasks;
    if (!task?.active) return { ok: false, message: "Zadatak nije dostupan." };
    if (assignment.status === "done") return { ok: true, message: "Zadatak je već završen." };
    const photoRequired = Boolean(task?.photo_required);

    if (photoRequired && !photoPath) {
      return { ok: false, message: "Slika je obavezna za ovaj zadatak." };
    }

    const objectPath = photoPath ? taskPhotoObjectPath(photoPath, storeId, assignmentId) : null;
    if (photoPath && !objectPath) {
      return { ok: false, message: "Putanja slike nije ispravna." };
    }
    if (objectPath) {
      const { data, error } = await supabase.storage.from(SHELF_PHOTOS_BUCKET).createSignedUrl(objectPath, 60);
      if (error || !data?.signedUrl) return { ok: false, message: "Slika nije pronađena. Pošaljite sliku ponovo." };
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

    if (error) return { ok: false, message: "Zadatak nije sačuvan. Pokušajte ponovo." };

    revalidatePath("/store");
    revalidatePath("/admin/zadaci");
    return { ok: true, message: "Zadatak je završen." };
  } catch (error) {
    return { ok: false, message: "Greška pri završavanju zadatka." };
  }
}
