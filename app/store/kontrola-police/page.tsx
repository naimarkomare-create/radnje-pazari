import { NotificationPermission } from "@/app/store/kontrola-police/NotificationPermission";
import { ShelfPhotoForm } from "@/app/store/kontrola-police/ShelfPhotoForm";
import { PageHeader } from "@/components/PageHeader";
import { ShelfPhotoGrid } from "@/components/ShelfPhotoGrid";
import { requireStore } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { createSignedShelfPhotoUrl } from "@/lib/shelf-photos";
import { createClient } from "@/lib/supabase/server";
import type { ProduceShelfPhotoCheck } from "@/lib/types";

export default async function StoreShelfPhotoPage() {
  const profile = await requireStore();
  const supabase = createClient();
  const result = await supabase
    .from("produce_shelf_photo_checks")
    .select("id, store_id, user_id, check_date, photo_url, storage_path, note, created_at")
    .order("created_at", { ascending: false })
    .limit(12);
  const photos = await Promise.all(
    ((result.data ?? []) as ProduceShelfPhotoCheck[]).map(async (photo) => ({
      ...photo,
      signedUrl: await createSignedShelfPhotoUrl(supabase, photo.storage_path)
    }))
  );

  return (
    <>
      <PageHeader eyebrow={profile.stores?.name ?? "Radnja"} title="Kontrola voća i povrća" />
      <div className="page-content">
        <ShelfPhotoForm storeId={profile.store_id ?? ""} today={todayInBelgrade()} />
        <NotificationPermission />
        {result.error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{result.error.message}</p> : null}
        <ShelfPhotoGrid photos={photos} />
      </div>
    </>
  );
}
