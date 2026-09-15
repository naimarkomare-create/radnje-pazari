import { withIntegrationLock } from "@/lib/security/sync-lock";
import { publicErrorMessage } from "@/lib/security/validation";
import { NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { syncBizniSoftPrices } from "@/lib/biznisoft/price-sync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const authorization = await authorizeApi(undefined, true);
  if (!authorization.ok) return authorization.response;

  return withIntegrationLock(async () => {

    try {
      const result = await syncBizniSoftPrices();
      return NextResponse.json(result);
    } catch (error) {
      return NextResponse.json(
        { error: publicErrorMessage(error) },
        { status: 500 }
      );
    }
  });
}
