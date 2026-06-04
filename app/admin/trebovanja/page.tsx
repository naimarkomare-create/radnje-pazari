import { ProduceMatrixTable } from "@/app/admin/trebovanja/ProduceMatrixTable";
import { AdminFilters } from "@/components/AdminFilters";
import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { buildProduceMatrix, PRODUCE_STORE_NAMES, sortProduceStores } from "@/lib/produce";
import { createClient } from "@/lib/supabase/server";
import type { ProduceRequestBatch, Store } from "@/lib/types";

export default async function AdminProduceRequestsPage({
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
    .from("produce_request_batches")
    .select(
      "id, store_id, user_id, request_date, note, created_at, stores(id, name), produce_request_items(id, batch_id, produce_item_id, quantity, created_at, produce_items(id, name, unit, sort_order))"
    )
    .eq("request_date", selectedDate)
    .order("created_at", { ascending: false });

  if (selectedStore) query = query.eq("store_id", selectedStore);
  const batchesResult = await query;
  const rows = buildProduceMatrix((batchesResult.data ?? []) as unknown as ProduceRequestBatch[]);

  return (
    <>
      <PageHeader eyebrow="Admin pregled" title="Trebovanje voća i povrća" />
      <div className="page-content">
        <AdminFilters
          resetHref="/admin/trebovanja"
          selectedDate={selectedDate}
          selectedStore={selectedStore}
          stores={stores}
        />
        {storesResult.error || batchesResult.error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {storesResult.error?.message ?? batchesResult.error?.message}
          </p>
        ) : null}
        <ProduceMatrixTable rows={rows} selectedDate={selectedDate} stores={stores} />
      </div>
    </>
  );
}
