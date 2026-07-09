import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { syncBizniSoftPrices } from "@/lib/biznisoft/price-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const profile = await getCurrentProfile();

  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await syncBizniSoftPrices();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "BizniSoft price sync failed." },
      { status: 500 }
    );
  }
}
