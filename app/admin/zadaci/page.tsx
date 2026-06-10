import Link from "next/link";
import { AdminTaskForm } from "@/app/admin/zadaci/AdminTaskForm";
import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { todayInBelgrade } from "@/lib/date";
import { PRODUCE_STORE_NAMES, sortProduceStores } from "@/lib/produce";
import { computeTaskStatus, taskPriorityLabel } from "@/lib/tasks";
import { createClient } from "@/lib/supabase/server";
import type { Store, StoreTask } from "@/lib/types";

export default async function AdminTasksPage() {
  await requireAdmin();
  const supabase = createClient();
  const storesResult = await supabase
    .from("stores")
    .select("id, name, latitude, longitude, address, created_at")
    .in("name", [...PRODUCE_STORE_NAMES]);
  const tasksResult = await supabase
    .from("store_tasks")
    .select(
      "id, title, description, due_date, due_time, priority, photo_required, created_by, created_at, active, store_task_assignments(id, task_id, store_id, status, completed_at, completed_by, photo_path, photo_url, created_at, stores(id, name))"
    )
    .eq("active", true)
    .order("due_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  const stores = sortProduceStores((storesResult.data ?? []) as Store[]);
  const tasks = (tasksResult.data ?? []) as unknown as StoreTask[];
  const error = storesResult.error?.message ?? tasksResult.error?.message;

  return (
    <>
      <PageHeader eyebrow="Admin pregled" title="Pošalji zadatak" />
      <div className="page-content">
        {error ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        <AdminTaskForm stores={stores} today={todayInBelgrade()} />
        <TaskOverview tasks={tasks} />
      </div>
    </>
  );
}

function TaskOverview({ tasks }: { tasks: StoreTask[] }) {
  if (tasks.length === 0) {
    return <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">Nema aktivnih zadataka.</p>;
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-bold text-ink">Aktivni zadaci</h2>
      <div className="grid gap-4">
        {tasks.map((task) => {
          const summary = summarizeTask(task);

          return (
            <Link
              className="interactive-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              href={`/admin/zadaci/${task.id}`}
              key={task.id}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={priorityClass(task.priority)}>{taskPriorityLabel(task.priority)}</span>
                    {task.photo_required ? <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">Slika obavezna</span> : null}
                  </div>
                  <h3 className="mt-2 text-lg font-bold text-ink">{task.title}</h3>
                  {task.description ? <p className="mt-1 text-sm text-slate-600">{task.description}</p> : null}
                  <p className="mt-2 text-sm font-semibold text-slate-600">Rok: {formatDue(task.due_date, task.due_time)}</p>
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-3 lg:min-w-[360px]">
                  <SummaryBadge label="Završeno" value={`${summary.done}/${summary.total}`} tone="green" />
                  <SummaryBadge label="Nije završeno" value={String(summary.pending)} tone="slate" />
                  <SummaryBadge label="Kasni" value={String(summary.late)} tone="red" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function summarizeTask(task: StoreTask) {
  return (task.store_task_assignments ?? []).reduce(
    (summary, assignment) => {
      const status = computeTaskStatus({
        dueDate: task.due_date,
        dueTime: task.due_time,
        status: assignment.status
      });

      summary.total += 1;
      if (status === "done") summary.done += 1;
      else if (status === "late") summary.late += 1;
      else summary.pending += 1;
      return summary;
    },
    { done: 0, late: 0, pending: 0, total: 0 }
  );
}

function SummaryBadge({ label, value, tone }: { label: string; value: string; tone: "green" | "red" | "slate" }) {
  const classes = {
    green: "bg-green-50 text-green-700",
    red: "bg-red-50 text-red-700",
    slate: "bg-slate-100 text-slate-700"
  };

  return (
    <div className={`rounded-md px-3 py-2 font-bold ${classes[tone]}`}>
      <p className="text-xs">{label}</p>
      <p className="text-lg">{value}</p>
    </div>
  );
}

function priorityClass(priority: StoreTask["priority"]) {
  if (priority === "hitno") return "rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700";
  if (priority === "vazno") return "rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700";
  return "rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700";
}

function formatDue(date: string, time: string | null) {
  return time ? `${date} ${time.slice(0, 5)}` : date;
}
