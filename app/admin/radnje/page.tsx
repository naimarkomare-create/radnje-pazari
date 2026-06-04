import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Store } from "@/lib/types";

export default async function AdminStoresPage() {
  await requireAdmin();
  const result = await createClient().from("stores").select("id, name, created_at").order("name");
  const stores = (result.data ?? []) as Store[];

  return (
    <>
      <PageHeader description="Pregled radnji bez mogućnosti izmene." eyebrow="Admin pregled" title="Radnje" />
      <div className="page-content">
        {result.error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{result.error.message}</p> : null}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {stores.map((store) => (
            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" key={store.id}>
              <h2 className="font-bold text-ink">{store.name}</h2>
              <p className="mt-1 text-xs text-slate-500">Aktivna radnja</p>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
