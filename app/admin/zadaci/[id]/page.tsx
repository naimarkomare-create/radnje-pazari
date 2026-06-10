import Link from "next/link";
import { DeleteTaskPhotoButton } from "@/app/admin/zadaci/[id]/DeleteTaskPhotoButton";
import { PageHeader } from "@/components/PageHeader";
import { requireAdmin } from "@/lib/auth";
import { computeTaskStatus, taskPriorityLabel, taskStatusLabel, withSignedTaskPhotoUrls } from "@/lib/tasks";
import { createClient } from "@/lib/supabase/server";
import type { StoreTask, StoreTaskAssignment } from "@/lib/types";

export default async function AdminTaskDetailPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const supabase = createClient();
  const result = await supabase
    .from("store_tasks")
    .select(
      "id, title, description, due_date, due_time, priority, photo_required, created_by, created_at, active, store_task_assignments(id, task_id, store_id, status, completed_at, completed_by, photo_path, photo_url, created_at, stores(id, name))"
    )
    .eq("id", params.id)
    .single();

  const task = result.data as unknown as StoreTask | null;
  const assignments = task
    ? await withSignedTaskPhotoUrls(
        supabase,
        [...(task.store_task_assignments ?? [])].sort((a, b) => (a.stores?.name ?? "").localeCompare(b.stores?.name ?? ""))
      )
    : [];

  return (
    <>
      <PageHeader eyebrow="Pošalji zadatak" title={task?.title ?? "Zadatak"} />
      <div className="page-content">
        <Link className="button-secondary w-fit" href="/admin/zadaci">
          Nazad
        </Link>
        {result.error || !task ? (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{result.error?.message ?? "Zadatak nije pronađen."}</p>
        ) : (
          <>
            <TaskSummary task={task} />
            <AssignmentTable assignments={assignments} task={task} />
          </>
        )}
      </div>
    </>
  );
}

function TaskSummary({ task }: { task: StoreTask }) {
  return (
    <section className="interactive-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={priorityClass(task.priority)}>{taskPriorityLabel(task.priority)}</span>
        {task.photo_required ? <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">Slika obavezna</span> : null}
      </div>
      {task.description ? <p className="mt-3 text-sm leading-6 text-slate-600">{task.description}</p> : null}
      <p className="mt-3 text-sm font-semibold text-slate-700">Rok: {task.due_date} {task.due_time?.slice(0, 5) ?? ""}</p>
    </section>
  );
}

function AssignmentTable({ task, assignments }: { task: StoreTask; assignments: StoreTaskAssignment[] }) {
  return (
    <section className="interactive-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold text-ink">Status po radnji</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left text-sm">
          <thead>
            <tr>
              <Th>Radnja</Th>
              <Th>Status</Th>
              <Th>Completed time</Th>
              <Th>Photo</Th>
              <Th>Akcija</Th>
            </tr>
          </thead>
          <tbody>
            {assignments.map((assignment) => {
              const status = computeTaskStatus({
                dueDate: task.due_date,
                dueTime: task.due_time,
                status: assignment.status
              });

              return (
                <tr key={assignment.id}>
                  <Td>{assignment.stores?.name ?? "Radnja"}</Td>
                  <Td>
                    <span className={statusClass(status)}>{taskStatusLabel(status)}</span>
                  </Td>
                  <Td>{assignment.completed_at ? formatDateTime(assignment.completed_at) : "-"}</Td>
                  <Td>
                    {assignment.signedPhotoUrl ? (
                      <div className="flex items-center gap-3">
                        <a className="font-semibold text-leaf underline" href={assignment.signedPhotoUrl} rel="noreferrer" target="_blank">
                          Otvori sliku
                        </a>
                        <img alt="Slika zadatka" className="h-14 w-20 rounded-md object-cover" src={assignment.signedPhotoUrl} />
                      </div>
                    ) : (
                      "-"
                    )}
                  </Td>
                  <Td>{assignment.photo_path ? <DeleteTaskPhotoButton assignmentId={assignment.id} /> : "-"}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border-b border-slate-200 px-3 py-2 font-bold text-slate-700">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="border-b border-slate-100 px-3 py-2 align-top text-slate-700">{children}</td>;
}

function priorityClass(priority: StoreTask["priority"]) {
  if (priority === "hitno") return "rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700";
  if (priority === "vazno") return "rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700";
  return "rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700";
}

function statusClass(status: StoreTaskAssignment["status"]) {
  if (status === "done") return "rounded-md bg-green-50 px-2 py-1 text-xs font-bold text-green-700";
  if (status === "late") return "rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700";
  return "rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("sr-RS", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}
