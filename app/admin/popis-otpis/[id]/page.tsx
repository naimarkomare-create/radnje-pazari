import { notFound } from "next/navigation";
import { PopisOtpisEditor } from "@/components/popis-otpis/PopisOtpisEditor";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function PopisOtpisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = createClient();
  const [listResult, itemsResult] = await Promise.all([
    supabase.from("writeoff_lists").select("id, reference, store_id, supplier_id, supplier_name, status, created_by, finalized_at, created_at, updated_at, stores(id, name, biznisoft_storage_id)").eq("id", id).single(),
    supabase.from("writeoff_list_items").select("id, writeoff_list_id, client_entry_id, store_id, supplier_id, article_id, article_code, barcode, article_name, unit, quantity, expiration_date, stock_amount, stock_fetched_at, price, level_price, account, popdv_id, vat_transaction_type, operator_name, modify_time, supplier_name, created_by, created_at, updated_at").eq("writeoff_list_id", id).order("created_at", { ascending: true })
  ]);
  if (listResult.error || !listResult.data || itemsResult.error) notFound();
  return (
    <main className="page-content">
      <PopisOtpisEditor list={listResult.data} initialItems={itemsResult.data ?? []} />
    </main>
  );
}
