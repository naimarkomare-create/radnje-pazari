import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { deleteExpiredReturnDrafts } from "@/lib/returns/delete-expired-return-drafts";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const supabase = createClient();
  const authorization = await authorizeApi(supabase, true);
  if (!authorization.ok) return authorization.response;

  try {
    const result = await deleteExpiredReturnDrafts();
    return NextResponse.json(result);
  } catch (error) {
    console.error("Expired return draft cleanup failed.", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return NextResponse.json(
      { error: "Stari nacrti nisu obrisani. Pokušajte ponovo." },
      { status: 500 }
    );
  }
}
