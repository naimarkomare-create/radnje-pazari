import "server-only";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

// Shared across Vercel instances. Work is awaited inside the active request.
export async function withIntegrationLock(work: () => Promise<NextResponse>) {
  let service: ReturnType<typeof createServiceClient>;
  let token: string;
  try {
    service = createServiceClient();
    const claim = await service.rpc("claim_security_operation", { p_operation: "biznisoft-sync" });
    if (claim.error) throw new Error("Lease unavailable");
    if (!claim.data) {
      return NextResponse.json({ error: "Sinhronizacija je već u toku. Pokušajte ponovo kasnije." }, { status: 409 });
    }
    token = String(claim.data);
  } catch {
    return NextResponse.json({ error: "Sinhronizaciju trenutno nije moguće pokrenuti." }, { status: 503 });
  }

  try {
    return await work();
  } finally {
    try {
      const { error } = await service.from("security_operation_locks").delete()
        .eq("operation", "biznisoft-sync").eq("token", token);
      if (error) console.error("BizniSoft sync lease release failed.");
    } catch {
      console.error("BizniSoft sync lease release failed.");
    }
  }
}
