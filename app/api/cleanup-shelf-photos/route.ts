import { NextResponse, type NextRequest } from "next/server";
import { objectPathFromStoragePath, SHELF_PHOTOS_BUCKET } from "@/lib/shelf-photos";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ShelfPhotoCleanupRow = {
  id: string;
  storage_path: string;
  check_date: string;
};

export async function GET(request: NextRequest) {
  const expectedSecret = process.env.CLEANUP_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const querySecret = request.nextUrl.searchParams.get("secret");
  const authorization = request.headers.get("authorization");
  const authorizedByQuery = Boolean(expectedSecret && querySecret === expectedSecret);
  const authorizedByCleanupHeader = Boolean(expectedSecret && authorization === `Bearer ${expectedSecret}`);
  const authorizedByCronHeader = Boolean(cronSecret && authorization === `Bearer ${cronSecret}`);

  if (!authorizedByQuery && !authorizedByCleanupHeader && !authorizedByCronHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("produce_shelf_photo_checks")
    .select("id, storage_path, check_date")
    .lt("check_date", cutoffDate);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const candidates = ((data ?? []) as ShelfPhotoCleanupRow[]).filter((row) => row.storage_path.startsWith(`${SHELF_PHOTOS_BUCKET}/`));
  const deletable = candidates
    .map((row) => ({ ...row, objectPath: objectPathFromStoragePath(row.storage_path) }))
    .filter((row): row is ShelfPhotoCleanupRow & { objectPath: string } => Boolean(row.objectPath));

  if (deletable.length === 0) {
    console.log("Shelf photo cleanup deleted 0 photos.");
    return NextResponse.json({ cutoffDate, candidates: data?.length ?? 0, deletedFiles: 0, deletedRows: 0 });
  }

  const { error: storageError } = await supabase.storage
    .from(SHELF_PHOTOS_BUCKET)
    .remove(deletable.map((row) => row.objectPath));

  if (storageError) {
    return NextResponse.json({ error: storageError.message, deletedFiles: 0, deletedRows: 0 }, { status: 500 });
  }

  const { error: deleteError } = await supabase
    .from("produce_shelf_photo_checks")
    .delete()
    .in(
      "id",
      deletable.map((row) => row.id)
    );

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message, deletedFiles: deletable.length, deletedRows: 0 }, { status: 500 });
  }

  console.log(`Shelf photo cleanup deleted ${deletable.length} photos.`);

  return NextResponse.json({
    cutoffDate,
    candidates: data?.length ?? 0,
    deletedFiles: deletable.length,
    deletedRows: deletable.length
  });
}
