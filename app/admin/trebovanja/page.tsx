import { AdminFilters } from "@/components/AdminFilters";
import { ProduceRequestsTable } from "@/components/AdminTables";
import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ProduceRequest, Store } from "@/lib/types";

export default async function AdminProduceRequestsPage({
  searchParams
}: {
  searchParams: { date?: string; store?: string };
}) {
  await requireAdmin();
  const supabase = createClient();
  const selectedDate = typeof searchParams.date === "string" ? searchParams.date : "";
  const selectedStore = typeof searchParams.store === "string" ? searchParams.store : "";
  const storesResult = await supabase.from("stores").select("id, name, created_at").order("name");
  let query = supabase
    .from("produce_requests")
    .select("id, store_id, user_id, request_date, item_name, quantity, unit, note, created_at, stores(name)")
    .order("request_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  if (selectedDate) query = query.eq("request_date", selectedDate);
  if (selectedStore) query = query.eq("store_id", selectedStore);
  const requests = await query;

  return (
    <>
      <PageHeader eyebrow="Admin pregled" title="Trebovanja" />
      <div className="page-content">
        <AdminFilters
          resetHref="/admin/trebovanja"
          selectedDate={selectedDate}
          selectedStore={selectedStore}
          stores={(storesResult.data ?? []) as Store[]}
        />
        <ProduceRequestsTable
          error={requests.error?.message ?? storesResult.error?.message}
          requests={(requests.data ?? []) as unknown as ProduceRequest[]}
        />
      </div>
    </>
  );
}
