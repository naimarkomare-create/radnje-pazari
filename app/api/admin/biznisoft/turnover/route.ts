import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import {
  getBizniSoftTurnover,
  TurnoverServiceError
} from "@/lib/biznisoft/turnover";
import { isValidIsoDate, todayInBelgrade } from "@/lib/date";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();

  if (!profile) {
    return json({ success: false, error: "Unauthorized" }, 401);
  }

  if (profile.role !== "admin") {
    return json({ success: false, error: "Forbidden" }, 403);
  }

  const businessDate = request.nextUrl.searchParams.get("date") ?? todayInBelgrade();

  if (!isValidIsoDate(businessDate)) {
    return json({ success: false, error: "Datum nije ispravan." }, 400);
  }

  if (businessDate > todayInBelgrade()) {
    return json({ success: false, error: "Datum prometa ne može biti u budućnosti." }, 400);
  }

  try {
    const result = await getBizniSoftTurnover({
      businessDate,
      force: request.nextUrl.searchParams.get("force") === "true"
    });

    return json({ success: true, ...result });
  } catch (error) {
    if (error instanceof TurnoverServiceError) {
      return json(
        {
          success: false,
          code: error.code,
          error: error.publicMessage,
          refreshing: error.code === "refresh_in_progress"
        },
        error.status
      );
    }

    console.error("Unexpected BizniSoft turnover API error.", {
      message: error instanceof Error ? error.message : "Unknown error"
    });
    return json(
      {
        success: false,
        error: "Promet trenutno nije moguće preuzeti iz BizniSoft-a."
      },
      500
    );
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "private, no-store"
    },
    status
  });
}
