import { createSignedShelfPhotoUrls } from "@/lib/shelf-photos";
import { dateTimeKeyInBelgrade } from "@/lib/date";
import type { StoreTaskAssignment, TaskPriority, TaskStatus } from "@/lib/types";

export const TASK_PRIORITIES: Array<{ value: TaskPriority; label: string }> = [
  { value: "podsetnik", label: "Podsetnik" },
  { value: "vazno", label: "Važno" },
  { value: "hitno", label: "Hitno" }
];

export function taskPriorityLabel(value: TaskPriority) {
  return TASK_PRIORITIES.find((priority) => priority.value === value)?.label ?? "Podsetnik";
}

export function taskStatusLabel(value: TaskStatus) {
  if (value === "done") return "Završeno";
  if (value === "late") return "Kasni";
  return "Nije završeno";
}

export function computeTaskStatus({
  status,
  dueDate,
  dueTime,
  now = new Date()
}: {
  status: TaskStatus;
  dueDate: string;
  dueTime: string | null;
  now?: Date;
}): TaskStatus {
  if (status === "done") return "done";

  const normalizedDueTime = dueTime
    ? dueTime.length === 5
      ? `${dueTime}:00`
      : dueTime
    : "23:59:59";
  const dueAt = `${dueDate}T${normalizedDueTime}`;
  return dateTimeKeyInBelgrade(now) > dueAt ? "late" : "pending";
}

export async function withSignedTaskPhotoUrls(
  supabase: ReturnType<typeof import("@/lib/supabase/server").createClient>,
  assignments: StoreTaskAssignment[]
) {
  const urls = await createSignedShelfPhotoUrls(
    supabase,
    assignments.map((assignment) => assignment.photo_path)
  );

  return assignments.map((assignment) => ({
    ...assignment,
    signedPhotoUrl: assignment.photo_path ? (urls.get(assignment.photo_path) ?? "") : ""
  }));
}
