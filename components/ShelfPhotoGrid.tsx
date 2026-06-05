import type { ProduceShelfPhotoCheck } from "@/lib/types";

export function ShelfPhotoGrid({
  photos,
  empty = "Nema poslatih slika za izabrani datum"
}: {
  photos: ProduceShelfPhotoCheck[];
  empty?: string;
}) {
  if (photos.length === 0) {
    return <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">{empty}</p>;
  }

  return (
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {photos.map((photo) => (
        <article className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm" key={photo.id}>
          {photo.signedUrl ? (
            <img alt="Kontrola police voća i povrća" className="aspect-[4/3] w-full object-cover" src={photo.signedUrl} />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center bg-slate-100 text-sm text-slate-500">Slika nije dostupna</div>
          )}
          <div className="space-y-2 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold text-ink">{photo.stores?.name ?? "Radnja"}</p>
              <p className="text-slate-500">{photo.check_date}</p>
            </div>
            <p className="text-slate-600">Vreme slanja: {formatTime(photo.created_at)}</p>
            {photo.note ? <p className="text-slate-600">Napomena: {photo.note}</p> : null}
          </div>
        </article>
      ))}
    </section>
  );
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat("sr-RS", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
