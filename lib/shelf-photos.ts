export const SHELF_PHOTOS_BUCKET = "shelf-photos";
export const SHELF_PHOTOS_PREFIX = "shelf-photos/";

export function objectPathFromStoragePath(storagePath: string | null) {
  if (!storagePath) {
    return null;
  }

  if (!storagePath.startsWith(SHELF_PHOTOS_PREFIX)) {
    return null;
  }

  return storagePath.slice(SHELF_PHOTOS_PREFIX.length);
}

export async function createSignedShelfPhotoUrl(supabase: ReturnType<typeof import("@/lib/supabase/server").createClient>, storagePath: string | null) {
  const objectPath = objectPathFromStoragePath(storagePath);

  if (!objectPath) {
    return "";
  }

  const { data } = await supabase.storage.from(SHELF_PHOTOS_BUCKET).createSignedUrl(objectPath, 60 * 60);
  return data?.signedUrl ?? "";
}
