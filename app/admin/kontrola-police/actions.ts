"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { objectPathFromStoragePath, SHELF_PHOTOS_BUCKET } from "@/lib/shelf-photos";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import type { ActionState } from "@/lib/types";

export async function deleteShelfPhoto(photoId: string): Promise<ActionState> {
  try {
    await requireAdmin();
    const supabase = createClient();
    const { data: photo, error } = await supabase
      .from("produce_shelf_photo_checks")
      .select("id, storage_path")
      .eq("id", photoId)
      .single();

    if (error || !photo) return { ok: false, message: error?.message ?? "Slika nije pronađena." };

    const objectPath = objectPathFromStoragePath(photo.storage_path);

    if (objectPath) {
      const service = createServiceClient();
      const { error: storageError } = await service.storage.from(SHELF_PHOTOS_BUCKET).remove([objectPath]);
      if (storageError) return { ok: false, message: storageError.message };
    }

    const { error: updateError } = await supabase
      .from("produce_shelf_photo_checks")
      .update({ photo_url: null, storage_path: null })
      .eq("id", photoId);

    if (updateError) return { ok: false, message: updateError.message };

    revalidatePath("/admin/kontrola-police");
    revalidatePath("/store/kontrola-police");
    return { ok: true, message: "Slika je obrisana." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Greška pri brisanju slike." };
  }
}
