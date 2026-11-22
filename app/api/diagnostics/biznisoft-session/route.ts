import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { BizniSoftSoapError, getBizniSoftCredentials, getSessionHandle } from "@/lib/biznisoft/soap-client";

export const runtime = "nodejs";
export const maxDuration = 25;

export async function POST(request: Request) {
  const secret = process.env.BIZNISOFT_SESSION_PROBE_SECRET;
  if (process.env.VERCEL_ENV !== "preview" || !secret || !/^[0-9a-f]{64}$/.test(secret)) {
    return reply({ ok: false, code: "not_found" }, 404);
  }
  const token = /^Bearer ([0-9a-f]{64})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token || !timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(secret, "hex"))) {
    return reply({ ok: false, code: "unauthorized" }, 401);
  }

  try {
    const credentials = getBizniSoftCredentials();
    const url = new URL(credentials.soapUrl);
    if (
      url.protocol !== "https:" || url.pathname !== "/soap/IBSWebService" ||
      !process.env.BIZNISOFT_TUNNEL_USERNAME || !process.env.BIZNISOFT_TUNNEL_PASSWORD
    ) {
      return reply({ ok: false, code: "invalid_config" }, 503);
    }
    await getSessionHandle(credentials);
    return reply({ ok: true, method: "GetSessionHandle" }, 200);
  } catch (error) {
    if (error instanceof BizniSoftSoapError) {
      const { method, kind, httpStatus, responseReason, transportCode } = error.diagnostic;
      return reply({ ok: false, method, code: kind, httpStatus, responseReason, transportCode }, kind === "timeout" ? 504 : 502);
    }
    return reply({ ok: false, code: "invalid_config" }, 503);
  }
}

function reply(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
