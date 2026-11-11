import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { readJsonObject } from "@/lib/security/validation";
import { isIsoDate, isUuid, numericValue } from "@/lib/popis-otpis";
import { withWriteoffListLock } from "@/lib/writeoff-list-lock";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Context = { params: Promise<{ id: string; itemId: string }> };
const revisionColumns = "id, quantity, expiration_date, updated_at";

async function readItem(supabase: ReturnType<typeof createServiceClient>, id: string, itemId: string) {
  const { data, error } = await supabase.from("writeoff_lists")
    .select(`status, writeoff_list_items(${revisionColumns})`)
    .eq("id", id).eq("writeoff_list_items.id", itemId).maybeSingle();
  if (error) throw error;
  return data ? { status: data.status, item: data.writeoff_list_items[0] ?? null } : null;
}

const notFound = () => NextResponse.json({ error: "Popis ili stavka nije pronađena." }, { status: 404 });

export async function GET(_request: NextRequest, context: Context) {
  const authorization = await authorizeApi(createClient(), true);
  if (!authorization.ok) return authorization.response;
  const { id, itemId } = await context.params;
  if (!isUuid(id) || !isUuid(itemId)) return notFound();
  try {
    const snapshot = await readItem(createServiceClient(), id, itemId);
    return snapshot ? NextResponse.json(snapshot, { headers: { "Cache-Control": "private, no-store" } }) : notFound();
  } catch {
    return NextResponse.json({ error: "Stanje stavke nije moguće proveriti." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  return mutateItem(request, context, "edit");
}

export async function DELETE(request: NextRequest, context: Context) {
  return mutateItem(request, context, "delete");
}

async function mutateItem(request: NextRequest, context: Context, operation: "edit" | "delete") {
  const authorization = await authorizeApi(createClient(), true);
  if (!authorization.ok) return authorization.response;
  const { id, itemId } = await context.params;
  if (!isUuid(id) || !isUuid(itemId)) return notFound();
  // Preserve database timestamp precision rather than round-tripping through Date.
  const version = /^"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2}))"$/.exec(request.headers.get("if-match") ?? "")?.[1];
  if (!version || !Number.isFinite(Date.parse(version))) {
    return NextResponse.json({ error: "Osvežite popis pre izmene ili brisanja stavke." }, { status: 400 });
  }

  try {
    const update: { quantity?: number; expiration_date?: string } = {};
    if (operation === "edit") {
      const body = await readJsonObject(request);
      if (body.quantity !== undefined) {
        const quantity = typeof body.quantity === "number" || typeof body.quantity === "string" ? numericValue(body.quantity) : null;
        if (quantity === null || quantity <= 0) return NextResponse.json({ error: "Količina mora biti veća od 0." }, { status: 400 });
        update.quantity = quantity;
      }
      if (body.expiration_date !== undefined) {
        if (!isIsoDate(body.expiration_date)) return NextResponse.json({ error: "Datum isteka nije ispravan." }, { status: 400 });
        update.expiration_date = body.expiration_date;
      }
      if (Object.keys(update).length === 0) return NextResponse.json({ error: "Nema izmena." }, { status: 400 });
    }

    const supabase = createServiceClient();
    return await withWriteoffListLock(supabase, id, async () => {
      const snapshot = await readItem(supabase, id, itemId);
      if (!snapshot) return notFound();
      if (snapshot.status !== "draft") return NextResponse.json({ error: "Popis je završen i zaključan." }, { status: 409 });
      if (!snapshot.item) return operation === "delete" ? NextResponse.json({ success: true, alreadyDeleted: true }) : notFound();

      const table = supabase.from("writeoff_list_items");
      const mutation = operation === "edit" ? table.update(update) : table.delete();
      const result = await mutation.eq("id", itemId).eq("writeoff_list_id", id).eq("updated_at", version)
        .select(revisionColumns).maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) return NextResponse.json({ error: "Stavka je u međuvremenu promenjena. Proverite sačuvano stanje." }, { status: 409 });
      return NextResponse.json(operation === "edit" ? { item: result.data } : { success: true });
    });
  } catch {
    return NextResponse.json({ error: operation === "edit" ? "Izmenu stavke nije moguće potvrditi." : "Brisanje stavke nije moguće potvrditi." }, { status: 500 });
  }
}
