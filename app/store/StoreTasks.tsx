"use client";

import { useRef, useState } from "react";
import { completeStoreTask } from "@/app/store/task-actions";
import { compressImage } from "@/lib/image-compression";
import { SHELF_PHOTOS_BUCKET } from "@/lib/shelf-photos";
import { computeTaskStatus, taskPriorityLabel, taskStatusLabel } from "@/lib/tasks";
import { createClient } from "@/lib/supabase/client";
import type { ActionState, StoreTaskAssignment } from "@/lib/types";

export function StoreTasks({ assignments, storeId }: { assignments: StoreTaskAssignment[]; storeId: string }) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-ink">Današnji zadaci</h2>
        <p className="mt-1 text-sm text-slate-600">Zadaci koje je admin poslao za danas.</p>
      </div>
      {assignments.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {assignments.map((assignment) => (
            <StoreTaskCard assignment={assignment} key={assignment.id} storeId={storeId} />
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-slate-200 bg-white p-5 text-sm text-slate-500 shadow-sm">Nema zadataka za danas.</p>
      )}
    </section>
  );
}

function StoreTaskCard({ assignment, storeId }: { assignment: StoreTaskAssignment; storeId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<ActionState>({ ok: false, message: "" });
  const task = assignment.store_tasks;

  if (!task) return null;

  const status = computeTaskStatus({
    dueDate: task.due_date,
    dueTime: task.due_time,
    status: assignment.status
  });
  const done = status === "done";

  async function onComplete() {
    if (!task) return;
    setLoading(true);
    setState({ ok: false, message: "" });

    try {
      let photoPath: string | null = null;
      const file = fileRef.current?.files?.[0];

      if (task.photo_required) {
        if (!file) {
          setState({ ok: false, message: "Slika je obavezna za ovaj zadatak." });
          return;
        }

        const compressed = await compressImage(file);
        const objectPath = `tasks/${storeId}/${assignment.id}/${Date.now()}.jpg`;
        photoPath = `${SHELF_PHOTOS_BUCKET}/${objectPath}`;
        const supabase = createClient();
        const { error: uploadError } = await supabase.storage.from(SHELF_PHOTOS_BUCKET).upload(objectPath, compressed, {
          contentType: "image/jpeg",
          upsert: false
        });

        if (uploadError) {
          setState({ ok: false, message: uploadError.message });
          return;
        }
      }

      const result = await completeStoreTask({ assignmentId: assignment.id, photoPath });
      setState(result);
      if (result.ok && fileRef.current) fileRef.current.value = "";
    } catch (error) {
      setState({ ok: false, message: error instanceof Error ? error.message : "Greška pri završavanju zadatka." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="interactive-card rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={priorityClass(task.priority)}>{taskPriorityLabel(task.priority)}</span>
        <span className={statusClass(status)}>{taskStatusLabel(status)}</span>
      </div>
      <h3 className="mt-3 text-lg font-bold text-ink">{task.title}</h3>
      {task.description ? <p className="mt-2 text-sm leading-6 text-slate-600">{task.description}</p> : null}
      <div className="mt-3 space-y-1 text-sm font-semibold text-slate-700">
        <p>Rok: {task.due_date} {task.due_time?.slice(0, 5) ?? ""}</p>
        <p>Potrebna slika: {task.photo_required ? "da" : "ne"}</p>
      </div>
      {task.photo_required && !done ? (
        <label className="field mt-4">
          <span className="label">Slika</span>
          <input ref={fileRef} accept="image/*" capture="environment" className="input" type="file" />
        </label>
      ) : null}
      {state.message ? (
        <p className={`mt-4 rounded-md px-3 py-3 text-sm ${state.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {state.message}
        </p>
      ) : null}
      <button className="button-primary mt-4 w-full sm:w-auto" disabled={loading || done} onClick={onComplete} type="button">
        {done ? "Završeno" : loading ? "Čuvanje..." : "Završeno"}
      </button>
    </article>
  );
}

function priorityClass(priority: NonNullable<StoreTaskAssignment["store_tasks"]>["priority"]) {
  if (priority === "hitno") return "rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700";
  if (priority === "vazno") return "rounded-md bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700";
  return "rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700";
}

function statusClass(status: StoreTaskAssignment["status"]) {
  if (status === "done") return "rounded-md bg-green-50 px-2 py-1 text-xs font-bold text-green-700";
  if (status === "late") return "rounded-md bg-red-50 px-2 py-1 text-xs font-bold text-red-700";
  return "rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700";
}
