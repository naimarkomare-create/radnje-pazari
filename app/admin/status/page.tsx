import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { Store } from "@/lib/types";

export default async function AdminStatusPage() {
  await requireAdmin();
  const supabase = createClient();
  const today = todayInBelgrade();
  const [storesResult, reportsResult] = await Promise.all([
    supabase.from("stores").select("id, name, created_at").order("name"),
    supabase.from("daily_revenue_reports").select("store_id").eq("report_date", today)
  ]);

  const stores = (storesResult.data ?? []) as Store[];
  const submittedIds = new Set((reportsResult.data ?? []).map((report) => report.store_id as string));
  const submitted = stores.filter((store) => submittedIds.has(store.id));
  const missing = stores.filter((store) => !submittedIds.has(store.id));

  return (
    <>
      <PageHeader description={`Status dnevnog pazara za ${today}.`} eyebrow="Admin pregled" title="Poslato / nije poslato" />
      <div className="page-content grid items-start gap-5 md:grid-cols-2">
        <StatusList empty="Nijedna radnja još nije poslala pazar." stores={submitted} title="Poslato danas" />
        <StatusList empty="Sve radnje su poslale pazar." stores={missing} title="Nije poslato danas" />
        {storesResult.error || reportsResult.error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 md:col-span-2">
            {storesResult.error?.message ?? reportsResult.error?.message}
          </p>
        ) : null}
      </div>
    </>
  );
}

function StatusList({ title, stores, empty }: { title: string; stores: Store[]; empty: string }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">{title}</h2>
        <span className="rounded-md bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">{stores.length}</span>
      </div>
      <ul className="mt-4 space-y-2">
        {stores.length > 0 ? (
          stores.map((store) => (
            <li className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 font-semibold text-slate-700" key={store.id}>
              {store.name}
            </li>
          ))
        ) : (
          <li className="py-3 text-sm text-slate-500">{empty}</li>
        )}
      </ul>
    </section>
  );
}
