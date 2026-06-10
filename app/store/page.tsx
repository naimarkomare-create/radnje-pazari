import Link from "next/link";
import { StoreTasks } from "@/app/store/StoreTasks";
import { PageHeader } from "@/components/PageHeader";
import { requireStore } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import type { StoreTaskAssignment } from "@/lib/types";

const actions = [
  {
    href: "/store/pazari",
    title: "Dnevni pazar",
    description: "Pošaljite dnevni izveštaj o gotovini, kartici i ukupnom pazaru."
  },
  {
    href: "/store/temperature",
    title: "Temperature",
    description: "Unesite temperaturu frižidera ili zamrzivača."
  },
  {
    href: "/store/trebovanja",
    title: "Trebovanja",
    description: "Pošaljite zahtev za voće i povrće."
  },
  {
    href: "/store/kontrola-police",
    title: "Kontrola voća i povrća",
    description: "Pošaljite dnevnu sliku police voća i povrća."
  },
  {
    href: "/store/moji-unosi",
    title: "Moji unosi",
    description: "Pregledajte nedavno poslate izveštaje."
  }
];

export default async function StoreDashboardPage() {
  const profile = await requireStore();
  const supabase = createClient();
  const today = todayInBelgrade();
  const storeId = profile.store_id ?? "";

  const [daily, temperatures, produce, todayRevenue, todayTemperature, todayShelfPhoto, taskAssignmentsResult] = await Promise.all([
    supabase.from("daily_revenue_reports").select("id", { count: "exact", head: true }),
    supabase.from("temperature_reports").select("id", { count: "exact", head: true }),
    supabase.from("produce_request_batches").select("id", { count: "exact", head: true }),
    supabase.from("daily_revenue_reports").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("report_date", today),
    supabase.from("temperature_reports").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("report_date", today),
    supabase.from("produce_shelf_photo_checks").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("check_date", today),
    supabase
      .from("store_task_assignments")
      .select(
        "id, task_id, store_id, status, completed_at, completed_by, photo_path, photo_url, created_at, store_tasks!inner(id, title, description, due_date, due_time, priority, photo_required, created_by, created_at, active)"
      )
      .eq("store_id", storeId)
      .eq("store_tasks.due_date", today)
      .eq("store_tasks.active", true)
      .order("created_at", { ascending: true })
  ]);
  const taskAssignments = (taskAssignmentsResult.data ?? []) as unknown as StoreTaskAssignment[];
  const reminders = [
    { href: "/store/pazari", title: "Pošalji pazar", visible: (todayRevenue.count ?? 0) === 0 },
    { href: "/store/temperature", title: "Pošalji temperaturu", visible: (todayTemperature.count ?? 0) === 0 },
    { href: "/store/kontrola-police", title: "Pošalji sliku voća i povrća", visible: (todayShelfPhoto.count ?? 0) === 0 }
  ].filter((reminder) => reminder.visible);

  return (
    <>
      <PageHeader
        description="Izaberite šta želite da pošaljete ili pregledate."
        eyebrow={profile.stores?.name ?? "Radnja"}
        title="Početna"
      />
      <div className="page-content">
        <StoreTasks assignments={taskAssignments} storeId={storeId} />
        {taskAssignmentsResult.error ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{taskAssignmentsResult.error.message}</p>
        ) : null}
        {reminders.length > 0 ? (
          <section className="grid gap-3 sm:grid-cols-3">
            {reminders.map((reminder) => (
              <Link className="interactive-card rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800 shadow-sm" href={reminder.href} key={reminder.href}>
                {reminder.title}
              </Link>
            ))}
          </section>
        ) : null}
        <section className="grid grid-cols-3 gap-3">
          <Summary label="Pazari" value={daily.count ?? 0} />
          <Summary label="Temperature" value={temperatures.count ?? 0} />
          <Summary label="Trebovanja" value={produce.count ?? 0} />
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          {actions.map((action) => (
            <Link
              className="interactive-card rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
              href={action.href}
              key={action.href}
            >
              <h2 className="text-lg font-bold text-ink">{action.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{action.description}</p>
              <p className="mt-4 text-sm font-semibold text-leaf">Otvori</p>
            </Link>
          ))}
        </section>
      </div>
    </>
  );
}

function Summary({ label, value }: { label: string; value: number }) {
  return (
    <div className="interactive-card min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <p className="truncate text-xs font-semibold text-slate-500 sm:text-sm">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}
