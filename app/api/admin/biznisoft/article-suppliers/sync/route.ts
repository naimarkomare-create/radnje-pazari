import { withIntegrationLock } from "@/lib/security/sync-lock";
import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
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
  const authorization = await authorizeApi(supabase, true);
  if (!authorization.ok) return authorization.response;

  return withIntegrationLock(async () => {


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
  });
}
