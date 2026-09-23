import { publicErrorMessage } from "@/lib/security/validation";
import { NextResponse, type NextRequest } from "next/server";
import { businessDateInBelgrade } from "@/lib/date";
import { objectPathFromStoragePath, SHELF_PHOTOS_BUCKET } from "@/lib/shelf-photos";
import { createServiceClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ShelfPhotoCleanupRow = {
  id: string;
  store_id: string;
  storage_path: string | null;
  check_date: string;
};

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.CLEANUP_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  const authorizedByCleanupHeader = Boolean(expectedSecret && authorization === `Bearer ${expectedSecret}`);
  const authorizedByCronHeader = Boolean(cronSecret && authorization === `Bearer ${cronSecret}`);

  if (!authorizedByCleanupHeader && !authorizedByCronHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const cutoffDate = businessDateInBelgrade(-30);

  const { data, error } = await supabase
    .from("produce_shelf_photo_checks")
    .select("id, store_id, storage_path, check_date")
    .lt("check_date", cutoffDate);

  if (error) {
    return NextResponse.json({ error: "Brisanje starih slika nije uspelo." }, { status: 500 });
  }

  const candidates = ((data ?? []) as ShelfPhotoCleanupRow[]).filter((row) => row.storage_path?.startsWith(`${SHELF_PHOTOS_BUCKET}/`));
  const deletable = candidates
    .map((row) => ({ ...row, objectPath: objectPathFromStoragePath(row.storage_path) }))
    .filter((row): row is ShelfPhotoCleanupRow & { objectPath: string } => Boolean(row.objectPath?.startsWith(`${row.check_date}/${row.store_id}/`)));

  if (deletable.length === 0) {
    console.log("Shelf photo cleanup deleted 0 photos.");
    return NextResponse.json({ cutoffDate, candidates: data?.length ?? 0, deletedFiles: 0, deletedRows: 0 });
  }

  const { error: storageError } = await supabase.storage
    .from(SHELF_PHOTOS_BUCKET)
    .remove(deletable.map((row) => row.objectPath));

  if (storageError) {
    return NextResponse.json({ error: publicErrorMessage(storageError), deletedFiles: 0, deletedRows: 0 }, { status: 500 });
  }

  const { error: deleteError } = await supabase
    .from("produce_shelf_photo_checks")
    .delete()
    .in(
      "id",
      deletable.map((row) => row.id)
    );

  if (deleteError) {
    return NextResponse.json({ error: publicErrorMessage(deleteError), deletedFiles: deletable.length, deletedRows: 0 }, { status: 500 });
  }

  console.log(`Shelf photo cleanup deleted ${deletable.length} photos.`);

  return NextResponse.json({
    cutoffDate,
    candidates: data?.length ?? 0,
    deletedFiles: deletable.length,
    deletedRows: deletable.length
  });
}
