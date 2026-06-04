import { ProduceOrderForm } from "@/app/store/trebovanja/ProduceOrderForm";
import { PageHeader } from "@/components/PageHeader";
import { ProduceBatchList } from "@/components/ProduceBatchList";
import { requireStore } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { ProduceItem, ProduceRequestBatch } from "@/lib/types";

export default async function StoreProduceRequestsPage() {
  const profile = await requireStore();
  const supabase = createClient();
  const [itemsResult, batchesResult] = await Promise.all([
    supabase
      .from("produce_items")
      .select("id, name, unit, sort_order, active, created_at")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("produce_request_batches")
      .select(
        "id, store_id, user_id, request_date, note, created_at, produce_request_items(id, batch_id, produce_item_id, quantity, created_at, produce_items(id, name, unit, sort_order))"
      )
      .order("created_at", { ascending: false })
      .limit(10)
  ]);

  return (
    <>
      <PageHeader eyebrow={profile.stores?.name ?? "Radnja"} title="Trebovanje voća i povrća" />
      <div className="page-content">
        <ProduceOrderForm items={(itemsResult.data ?? []) as ProduceItem[]} today={todayInBelgrade()} />
        <ProduceBatchList
          batches={(batchesResult.data ?? []) as unknown as ProduceRequestBatch[]}
          error={itemsResult.error?.message ?? batchesResult.error?.message}
        />
      </div>
    </>
  );
}
