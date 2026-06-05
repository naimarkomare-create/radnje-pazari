"use server";

import { revalidatePath } from "next/cache";
import { requireStore } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function submitShelfPhotoMetadata({
  checkDate,
  storagePath,
  note
}: {
  checkDate: string;
  storagePath: string;
  note: string;
}): Promise<ActionState> {
  try {
    const profile = await requireStore();
    const storeId = profile.store_id;

    if (!storeId || !/^\d{4}-\d{2}-\d{2}$/.test(checkDate)) {
      return { ok: false, message: "Datum nije ispravan." };
    }

    const expectedPrefix = `shelf-photos/${checkDate}/${storeId}/`;

    if (!storagePath.startsWith(expectedPrefix)) {
      return { ok: false, message: "Putanja slike nije ispravna." };
    }

    const supabase = createClient();
    const { error } = await supabase.from("produce_shelf_photo_checks").insert({
      store_id: storeId,
      user_id: profile.id,
      check_date: checkDate,
      photo_url: storagePath,
      storage_path: storagePath,
      note: note.trim() || null
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    revalidatePath("/store/kontrola-police");
    revalidatePath("/admin/kontrola-police");
    return { ok: true, message: "Slika je uspešno poslata" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Greška pri slanju slike." };
  }
}
