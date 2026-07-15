import { RevenueCorrectionTable } from "@/app/admin/ispravka-pazara/RevenueCorrectionTable";
import { AdminFilters } from "@/components/AdminFilters";
import { PageHeader } from "@/components/PageHeader";
import { Pagination } from "@/components/Pagination";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DailyRevenueReport, Store } from "@/lib/types";

export default async function AdminRevenueCorrectionPage({
  searchParams
}: {
  searchParams: { date?: string; page?: string; store?: string; store_id?: string };
}) {
  await requireAdmin();
  const supabase = createClient();
  const selectedDate = typeof searchParams.date === "string" ? searchParams.date : "";
  const selectedStore =
    typeof searchParams.store_id === "string"
      ? searchParams.store_id
      : typeof searchParams.store === "string"
        ? searchParams.store
        : "";
  const page = positiveInteger(searchParams.page, 1);
  const storesQuery = supabase.from("stores").select("id, name").order("name");
  let query = supabase
    .from("daily_revenue_reports")
    .select("id, store_id, user_id, report_date, shift, cash_revenue, check_revenue, card_revenue, bank_transfer_revenue, correction_revenue, edopuna_revenue, total_revenue, note, created_at, stores(name)", { count: "exact" })
    .order("report_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (selectedDate) query = query.eq("report_date", selectedDate);
  if (selectedStore) query = query.eq("store_id", selectedStore);
  const from = (page - 1) * 30;
  const [storesResult, reports] = await Promise.all([storesQuery, query.range(from, from + 29)]);

  return (
    <>
      <PageHeader eyebrow="Admin pregled" title="Ispravka pazara" />
      <div className="page-content">
        <AdminFilters
          resetHref="/admin/ispravka-pazara"
          selectedDate={selectedDate}
          selectedStore={selectedStore}
          stores={(storesResult.data ?? []) as Store[]}
        />
        <RevenueCorrectionTable
          error={reports.error?.message ?? storesResult.error?.message}
          reports={(reports.data ?? []) as unknown as DailyRevenueReport[]}
        />
        <Pagination
          page={page}
          pageSize={30}
          pathname="/admin/ispravka-pazara"
          searchParams={searchParams}
          totalCount={reports.count ?? reports.data?.length ?? 0}
        />
      </div>
    </>
  );
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
