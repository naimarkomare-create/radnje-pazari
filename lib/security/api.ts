import "server-only";
import { headers, type UnsafeUnwrappedHeaders } from "next/headers";
import { NextResponse } from "next/server";
import { getCurrentProfileWithClient } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isSameOriginRequest } from "@/lib/security/request";

export async function authorizeApi(supabase = createClient(), adminOnly = false) {
  const jsonError = (error: string, status: number) => ({
    ok: false as const,
    response: NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } })
  });
  try {
    const profile = await getCurrentProfileWithClient(supabase);
    if (!profile) return jsonError("Unauthorized", 401);
    if ((adminOnly && profile.role !== "admin") ||
      (profile.role !== "admin" && (profile.role !== "store" || !profile.store_id))) {
      return jsonError("Forbidden", 403);
    }
    const requestHeaders = headers() as unknown as UnsafeUnwrappedHeaders;
    if (!isSameOriginRequest(requestHeaders)) return jsonError("Zahtev nije dozvoljen.", 403);
    return { ok: true as const, profile };
  } catch {
    return jsonError("Provera sesije trenutno nije dostupna. Pokušajte ponovo.", 503);
  }
}
