import { NextResponse } from "next/server";
import { getCurrentProfileWithClient } from "@/lib/auth";
import { deleteExpiredReturnDrafts } from "@/lib/returns/delete-expired-return-drafts";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const supabase = createClient();
  const profile = await getCurrentProfileWithClient(supabase);

  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json(
      { error: "Nemate dozvolu za brisanje starih nacrta." },
      { status: 403 }
    );
  }

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
