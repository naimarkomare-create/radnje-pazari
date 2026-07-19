import { NextResponse } from "next/server";
import { getCurrentProfileWithClient } from "@/lib/auth";
import {
  safeBizniSoftError,
  syncBizniSoftArticleSuppliers
} from "@/lib/biznisoft/sync-suppliers";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  const supabase = createClient();
  const profile = await getCurrentProfileWithClient(supabase);

  if (!profile) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (profile.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    return NextResponse.json(await syncBizniSoftArticleSuppliers());
  } catch (error) {
    const message = safeBizniSoftError(error);
    console.error("BizniSoft article supplier sync failed:", message);
    return NextResponse.json(
      { error: "Sinhronizacija veza artikala nije uspela." },
      { status: 500 }
    );
  }
}
