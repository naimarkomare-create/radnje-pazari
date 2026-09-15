export const SHELF_PHOTOS_BUCKET = "shelf-photos";
export const SHELF_PHOTOS_PREFIX = "shelf-photos/";

export function objectPathFromStoragePath(storagePath: string | null) {
  if (!storagePath) {
    return null;
  }

  if (!storagePath.startsWith(SHELF_PHOTOS_PREFIX)) {
    return null;
  }

  const objectPath = storagePath.slice(SHELF_PHOTOS_PREFIX.length);
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const file = "[A-Za-z0-9_-]+\\.(?:jpg|jpeg|png|webp)";
  return new RegExp(`^(?:\\d{4}-\\d{2}-\\d{2}/${uuid}/${file}|tasks/${uuid}/${uuid}/${file})$`).test(objectPath)
    ? objectPath
    : null;
}

export function taskPhotoObjectPath(storagePath: string | null, storeId: string, assignmentId: string) {
  const path = objectPathFromStoragePath(storagePath);
  return path?.startsWith(`tasks/${storeId}/${assignmentId}/`) ? path : null;
}

export async function createSignedShelfPhotoUrls(
  supabase: ReturnType<typeof import("@/lib/supabase/server").createClient>,
  storagePaths: Array<string | null>
) {
  const entries = storagePaths
    .map((storagePath) => ({ objectPath: objectPathFromStoragePath(storagePath), storagePath }))
    .filter((entry): entry is { objectPath: string; storagePath: string } => Boolean(entry.objectPath && entry.storagePath));
  const objectPaths = Array.from(new Set(entries.map((entry) => entry.objectPath)));
  const urls = new Map<string, string>();

  if (objectPaths.length === 0) return urls;

  const { data } = await supabase.storage.from(SHELF_PHOTOS_BUCKET).createSignedUrls(objectPaths, 60 * 60);
  const byObjectPath = new Map((data ?? []).map((item) => [item.path, item.signedUrl]));

  for (const entry of entries) {
    urls.set(entry.storagePath, byObjectPath.get(entry.objectPath) ?? "");
  }

  return urls;
}

export async function withSignedShelfPhotoUrls<T extends { storage_path: string | null }>(
  supabase: ReturnType<typeof import("@/lib/supabase/server").createClient>,
  photos: T[]
) {
  const urls = await createSignedShelfPhotoUrls(
    supabase,
    photos.map((photo) => photo.storage_path)
  );

  return photos.map((photo) => ({
    ...photo,
    signedUrl: photo.storage_path ? (urls.get(photo.storage_path) ?? "") : ""
  }));
}
