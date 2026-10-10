import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PopisOtpisDrafts } from "@/components/popis-otpis/PopisOtpisDrafts";

export default async function PopisOtpisPage() {
  await requireAdmin();
  const supabase = createClient();
  const [storesResult, suppliersResult, listsResult] = await Promise.all([
    supabase.from("stores").select("id, name, biznisoft_storage_id").order("name"),
    supabase.from("biznisoft_suppliers").select("id, name, is_active").eq("is_active", true).order("name"),
    supabase
      .from("writeoff_lists")
      .select("id, reference, store_id, supplier_id, supplier_name, status, created_by, finalized_at, created_at, updated_at, stores(id, name, biznisoft_storage_id)")
      .order("updated_at", { ascending: false })
      .limit(30)
  ]);
  if (storesResult.error) throw new Error(storesResult.error.message);
  if (suppliersResult.error) throw new Error(suppliersResult.error.message);
  if (listsResult.error) throw new Error(listsResult.error.message);

  return (
    <main className="page-content">
      <PopisOtpisDrafts
        lists={listsResult.data ?? []}
        stores={storesResult.data ?? []}
        suppliers={suppliersResult.data ?? []}
      />
    </main>
  );
}
