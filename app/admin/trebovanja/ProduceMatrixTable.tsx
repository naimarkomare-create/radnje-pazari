import type { ProduceMatrixRow } from "@/lib/produce";
import type { Store } from "@/lib/types";

export function ProduceMatrixTable({
  rows,
  stores,
  selectedDate
}: {
  rows: ProduceMatrixRow[];
  stores: Store[];
  selectedDate: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-ink">Trebovanje voća i povrća</h2>
        <a className="button-secondary text-center" href={`/api/admin/export/trebovanje-voce-povrce?date=${encodeURIComponent(selectedDate)}`}>
          Izvezi Excel
        </a>
      </div>
      {rows.length === 0 ? (
        <p className="py-8 text-sm text-slate-500">Nema trebovanja za izabrani datum</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-max border-collapse text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <Th sticky>Artikal</Th>
                <Th>Jedinica</Th>
                {stores.map((store) => (
                  <Th key={store.id}>{store.name}</Th>
                ))}
                <Th>Ukupno</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.itemId}>
                  <Td sticky>{row.itemName}</Td>
                  <Td>{row.unit}</Td>
                  {stores.map((store) => (
                    <Td key={store.id}>{row.quantities[store.name] ?? 0}</Td>
                  ))}
                  <Td strong>{row.total}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Th({ children, sticky = false }: { children: React.ReactNode; sticky?: boolean }) {
  return (
    <th className={`border-b border-slate-200 px-3 py-3 font-bold text-slate-700 ${sticky ? "sticky left-0 z-10 bg-slate-50" : ""}`}>
      {children}
    </th>
  );
}

function Td({ children, sticky = false, strong = false }: { children: React.ReactNode; sticky?: boolean; strong?: boolean }) {
  return (
    <td
      className={`border-b border-slate-100 px-3 py-3 text-slate-700 ${
        sticky ? "sticky left-0 bg-white font-semibold text-ink" : ""
      } ${strong ? "font-bold text-ink" : ""}`}
    >
      {children}
    </td>
  );
}
