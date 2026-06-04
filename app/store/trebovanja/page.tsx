import { ProduceRequestForm } from "@/app/store/StoreForms";
import { PageHeader } from "@/components/PageHeader";
import { ProduceRequestsList } from "@/components/ReportLists";
import { requireStore } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { ProduceRequest } from "@/lib/types";

export default async function StoreProduceRequestsPage() {
  const profile = await requireStore();
  const result = await createClient()
    .from("produce_requests")
    .select("id, store_id, user_id, request_date, item_name, quantity, unit, note, created_at")
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <>
      <PageHeader eyebrow={profile.stores?.name ?? "Radnja"} title="Trebovanja" />
      <div className="page-content grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.8fr)]">
        <ProduceRequestForm storeName={profile.stores?.name ?? "Radnja"} today={todayInBelgrade()} />
        <ProduceRequestsList requests={(result.data ?? []) as ProduceRequest[]} error={result.error?.message} />
      </div>
    </>
  );
}
