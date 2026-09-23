import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "shelf-photos";
const APPLY = process.argv.includes("--apply");
const CONFIRMED = process.argv.includes("--confirm=DELETE_LINKED_OPERATIONAL_PHOTOS");

loadLocalEnv();

const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const [shelfRows, taskRows] = await Promise.all([
  fetchAll("produce_shelf_photo_checks", "id, store_id, check_date, storage_path"),
  fetchAll("store_task_assignments", "id, store_id, photo_path")
]);

const candidates = [];
let invalidPaths = 0;

for (const row of shelfRows) {
  const objectPath = shelfPhotoObjectPath(row.storage_path, row.check_date, row.store_id);
  if (row.storage_path && !objectPath) invalidPaths += 1;
  if (objectPath) candidates.push(objectPath);
}

for (const row of taskRows) {
  const objectPath = taskPhotoObjectPath(row.photo_path, row.store_id, row.id);
  if (row.photo_path && !objectPath) invalidPaths += 1;
  if (objectPath) candidates.push(objectPath);
}

const objectPaths = [...new Set(candidates)];
console.log(`Mode: ${APPLY ? "APPLY" : "DRY RUN"}`);
console.log(`Bucket: ${BUCKET}`);
console.log(`Linked shelf-photo objects: ${objectPaths.length}`);
console.log(`Invalid/untrusted paths skipped: ${invalidPaths}`);
console.log("Unlinked bucket objects are intentionally left untouched.");

if (!APPLY) {
  console.log("No files were removed. Re-run with --apply --confirm=DELETE_LINKED_OPERATIONAL_PHOTOS after backup and review.");
} else if (!CONFIRMED) {
  console.error("Refusing to remove files without --confirm=DELETE_LINKED_OPERATIONAL_PHOTOS.");
  process.exitCode = 2;
} else {
  let removed = 0;
  for (let index = 0; index < objectPaths.length; index += 100) {
    const chunk = objectPaths.slice(index, index + 100);
    const { data, error } = await supabase.storage.from(BUCKET).remove(chunk);
    if (error) throw new Error(`Storage cleanup failed after ${removed} removals: ${error.message}`);
    removed += data?.length ?? 0;
  }

  console.log(`Storage objects removed: ${removed}`);
  console.log("Now run production-clean-start.sql to delete the linked operational database rows.");
}

async function fetchAll(table, columns) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(columns).range(from, from + pageSize - 1);
    if (error) throw new Error(`Could not inspect ${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}

function shelfPhotoObjectPath(storagePath, checkDate, storeId) {
  const objectPath = normalizedObjectPath(storagePath);
  return objectPath?.startsWith(`${checkDate}/${storeId}/`) ? objectPath : null;
}

function taskPhotoObjectPath(storagePath, storeId, assignmentId) {
  const objectPath = normalizedObjectPath(storagePath);
  return objectPath?.startsWith(`tasks/${storeId}/${assignmentId}/`) ? objectPath : null;
}

function normalizedObjectPath(storagePath) {
  if (typeof storagePath !== "string" || !storagePath.startsWith(`${BUCKET}/`)) return null;
  const objectPath = storagePath.slice(BUCKET.length + 1);
  const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
  const file = "[A-Za-z0-9_-]+\\.(?:jpg|jpeg|png|webp)";
  return new RegExp(`^(?:\\d{4}-\\d{2}-\\d{2}/${uuid}/${file}|tasks/${uuid}/${uuid}/${file})$`, "i").test(objectPath)
    ? objectPath
    : null;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function loadLocalEnv() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const separator = trimmed.indexOf("=");
    const name = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, "$2");
    if (name && process.env[name] === undefined) process.env[name] = value;
  }
}
