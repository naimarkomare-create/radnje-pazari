import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfileWithClient } from "@/lib/auth";
import { objectPathFromStoragePath, SHELF_PHOTOS_BUCKET } from "@/lib/shelf-photos";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskWithAssignments = {
  id: string;
  store_task_assignments?: Array<{
    photo_path: string | null;
  }>;
};

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isUuid(params.id)) {
    return NextResponse.json({ error: "Zadatak nije pronađen." }, { status: 404 });
  }

  const supabase = createClient();
  const profile = await getCurrentProfileWithClient(supabase);
  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const taskResult = await supabase
    .from("store_tasks")
    .select("id, store_task_assignments(photo_path)")
    .eq("id", params.id)
    .maybeSingle();

  if (taskResult.error) {
    console.error("Task lookup before delete failed", {
      message: taskResult.error.message,
      taskId: params.id
    });
    return NextResponse.json({ error: "Zadatak nije mogao da bude učitan." }, { status: 500 });
  }

  if (!taskResult.data) {
    return NextResponse.json({ error: "Zadatak nije pronađen." }, { status: 404 });
  }

  const task = taskResult.data as unknown as TaskWithAssignments;
  const objectPaths = Array.from(
    new Set(
      (task.store_task_assignments ?? [])
        .map((assignment) => objectPathFromStoragePath(assignment.photo_path))
        .filter((path): path is string => Boolean(path?.startsWith("tasks/")))
    )
  );
  const deleteResult = await supabase
    .from("store_tasks")
    .delete()
    .eq("id", params.id)
    .select("id")
    .maybeSingle();

  if (deleteResult.error) {
    console.error("Task delete failed", {
      message: deleteResult.error.message,
      taskId: params.id
    });
    return NextResponse.json({ error: "Zadatak nije mogao da bude obrisan." }, { status: 500 });
  }

  if (!deleteResult.data) {
    return NextResponse.json({ error: "Zadatak nije pronađen." }, { status: 404 });
  }

  if (objectPaths.length > 0) {
    try {
      const service = createServiceClient();
      const storageResult = await service.storage.from(SHELF_PHOTOS_BUCKET).remove(objectPaths);

      if (storageResult.error) {
        console.error("Deleted task storage cleanup failed", {
          fileCount: objectPaths.length,
          message: storageResult.error.message,
          taskId: params.id
        });
        return NextResponse.json({
          success: true,
          warning: "Zadatak je obrisan, ali neke povezane fotografije nisu uklonjene iz skladišta."
        });
      }
    } catch (error) {
      console.error("Deleted task storage cleanup failed", {
        fileCount: objectPaths.length,
        message: error instanceof Error ? error.message : "Unknown storage cleanup error",
        taskId: params.id
      });
      return NextResponse.json({
        success: true,
        warning: "Zadatak je obrisan, ali neke povezane fotografije nisu uklonjene iz skladišta."
      });
    }
  }

  return NextResponse.json({ success: true });
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
