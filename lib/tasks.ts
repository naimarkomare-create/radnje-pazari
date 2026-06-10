import { createSignedShelfPhotoUrl } from "@/lib/shelf-photos";
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

  const dueAt = new Date(`${dueDate}T${dueTime || "23:59:59"}`);
  return now.getTime() > dueAt.getTime() ? "late" : "pending";
}

export async function withSignedTaskPhotoUrls(
  supabase: ReturnType<typeof import("@/lib/supabase/server").createClient>,
  assignments: StoreTaskAssignment[]
) {
  return Promise.all(
    assignments.map(async (assignment) => ({
      ...assignment,
      signedPhotoUrl: await createSignedShelfPhotoUrl(supabase, assignment.photo_path)
    }))
  );
}
