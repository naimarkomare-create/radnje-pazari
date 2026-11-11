import "server-only";

import { NextResponse } from "next/server";
import type { createServiceClient } from "@/lib/supabase/service";

// Use the existing server-only lease to serialize finalization and item changes across requests.
export async function withWriteoffListLock(
  supabase: ReturnType<typeof createServiceClient>,
  listId: string,
  work: () => Promise<NextResponse>
) {
  const operation = `writeoff:${listId}`;
  const claim = await supabase.rpc("claim_security_operation", { p_operation: operation });
  if (claim.error) throw claim.error;
  if (!claim.data) return NextResponse.json({ error: "Popis se trenutno menja. Proverite stanje pa pokušajte ponovo." }, { status: 409 });

  try {
    return await work();
  } finally {
    try {
      const { error } = await supabase.from("security_operation_locks").delete().eq("operation", operation).eq("token", claim.data);
      if (error) console.error("Write-off list lease release failed.");
    } catch {
      console.error("Write-off list lease release failed.");
    }
  }
}
