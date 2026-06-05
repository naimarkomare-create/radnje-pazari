import { AdminFilters } from "@/components/AdminFilters";
import { PageHeader } from "@/components/PageHeader";
import { formatTime } from "@/components/ShelfPhotoGrid";
import { requireAdmin } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { PRODUCE_STORE_NAMES, sortProduceStores } from "@/lib/produce";
import { createSignedShelfPhotoUrl } from "@/lib/shelf-photos";
import { createClient } from "@/lib/supabase/server";
import type { ProduceShelfPhotoCheck, Store } from "@/lib/types";

export default async function AdminShelfPhotoPage({
  searchParams
}: {
  searchParams: { date?: string; store?: string };
}) {
  await requireAdmin();
  const supabase = createClient();
  const selectedDate = typeof searchParams.date === "string" && searchParams.date ? searchParams.date : todayInBelgrade();
  const selectedStore = typeof searchParams.store === "string" ? searchParams.store : "";
  const storesResult = await supabase
    .from("stores")
    .select("id, name, created_at")
    .in("name", [...PRODUCE_STORE_NAMES]);
  const stores = sortProduceStores((storesResult.data ?? []) as Store[]);

  let query = supabase
    .from("produce_shelf_photo_checks")
    .select("id, store_id, user_id, check_date, photo_url, storage_path, note, created_at, stores(id, name)")
    .eq("check_date", selectedDate)
    .order("created_at", { ascending: false });

  if (selectedStore) query = query.eq("store_id", selectedStore);
  const photosResult = await query;
  const photos = await Promise.all(
    ((photosResult.data ?? []) as unknown as ProduceShelfPhotoCheck[]).map(async (photo) => ({
      ...photo,
      signedUrl: await createSignedShelfPhotoUrl(supabase, photo.storage_path)
    }))
  );
  const submittedIds = new Set(photos.map((photo) => photo.store_id));
  const submittedStores = stores.filter((store) => submittedIds.has(store.id));
  const missingStores = stores.filter((store) => !submittedIds.has(store.id));

  return (
    <>
      <PageHeader eyebrow="Admin pregled" title="Kontrola police voća i povrća" />
      <div className="page-content">
        <AdminFilters
          resetHref="/admin/kontrola-police"
          selectedDate={selectedDate}
          selectedStore={selectedStore}
          stores={stores}
        />
        {storesResult.error || photosResult.error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {storesResult.error?.message ?? photosResult.error?.message}
          </p>
        ) : null}
        <section className="grid gap-5 lg:grid-cols-2">
          <StatusPanel empty="Nijedna radnja nije poslala sliku." stores={submittedStores} title="Poslali danas" />
          <StatusPanel empty="Sve radnje su poslale sliku." stores={missingStores} title="Nisu poslali danas" />
        </section>
        <ShelfPhotoAdminTable photos={photos} />
      </div>
    </>
  );
}

function StatusPanel({ title, stores, empty }: { title: string; stores: Store[]; empty: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        <span className="rounded-md bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">{stores.length}</span>
      </div>
      <ul className="mt-4 flex flex-wrap gap-2">
        {stores.length > 0 ? (
          stores.map((store) => (
            <li className="rounded-md bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700" key={store.id}>
              {store.name}
            </li>
          ))
        ) : (
          <li className="text-sm text-slate-500">{empty}</li>
        )}
      </ul>
    </section>
  );
}

function ShelfPhotoAdminTable({ photos }: { photos: ProduceShelfPhotoCheck[] }) {
  if (photos.length === 0) {
    return <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">Nema poslatih slika za izabrani datum</p>;
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left text-sm">
          <thead>
            <tr>
              <Th>Radnja</Th>
              <Th>Datum</Th>
              <Th>Vreme slanja</Th>
              <Th>Slika</Th>
              <Th>Napomena</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {photos.map((photo) => (
              <tr key={photo.id}>
                <Td>{photo.stores?.name ?? "Radnja"}</Td>
                <Td>{photo.check_date}</Td>
                <Td>{formatTime(photo.created_at)}</Td>
                <Td>
                  {photo.signedUrl ? (
                    <a className="font-semibold text-leaf underline" href={photo.signedUrl} rel="noreferrer" target="_blank">
                      Otvori sliku
                    </a>
                  ) : (
                    "-"
                  )}
                </Td>
                <Td>{photo.note ?? "-"}</Td>
                <Td>Poslato</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-slate-200 px-3 py-2 font-bold text-slate-700">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-700">{children}</td>;
}
