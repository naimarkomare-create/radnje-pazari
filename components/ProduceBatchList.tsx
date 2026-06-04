import type { ProduceRequestBatch } from "@/lib/types";

export function ProduceBatchList({
  batches,
  error,
  title = "Nedavna trebovanja"
}: {
  batches: ProduceRequestBatch[];
  error?: string;
  title?: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-lg font-bold text-ink">{title}</h2>
      {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4 space-y-3">
        {batches.length > 0 ? (
          batches.map((batch) => (
            <article className="rounded-md border border-slate-200 bg-slate-50 p-3" key={batch.id}>
              <div className="flex items-center justify-between gap-3">
                <p className="font-bold text-ink">{batch.request_date}</p>
                <span className="text-xs font-semibold text-slate-500">
                  {batch.produce_request_items?.length ?? 0} artikala
                </span>
              </div>
              <ul className="mt-3 space-y-1 text-sm text-slate-700">
                {(batch.produce_request_items ?? [])
                  .slice()
                  .sort((a, b) => (a.produce_items?.sort_order ?? 0) - (b.produce_items?.sort_order ?? 0))
                  .map((item) => (
                    <li className="flex justify-between gap-3" key={item.id}>
                      <span>{item.produce_items?.name ?? "Artikal"}</span>
                      <span className="font-semibold">
                        {item.quantity} {item.produce_items?.unit ?? ""}
                      </span>
                    </li>
                  ))}
              </ul>
              {batch.note ? <p className="mt-3 border-t border-slate-200 pt-2 text-sm text-slate-500">{batch.note}</p> : null}
            </article>
          ))
        ) : (
          <p className="py-3 text-sm text-slate-500">Nema poslatih trebovanja.</p>
        )}
      </div>
    </section>
  );
}
