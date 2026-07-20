import { NextRequest } from "next/server";
import { POST as syncActionArticles } from "@/app/api/admin/biznisoft/sync-action-articles/route";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export function POST(request: NextRequest) {
  return syncActionArticles(request);
}
