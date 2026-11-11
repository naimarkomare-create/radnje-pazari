import { NextRequest, NextResponse } from "next/server";
import { authorizeApi } from "@/lib/security/api";
import { isUuid, readJsonObject } from "@/lib/security/validation";
import { createServiceClient } from "@/lib/supabase/service";
import { getTaskPushConfig, readTaskPushSubscription, TASK_PUSH_COOKIE } from "@/lib/task-push-config";

export const runtime = "nodejs";

async function authorizeStore() {
  const auth = await authorizeApi();
  if (!auth.ok) return auth;
  if (auth.profile.role !== "store" || !auth.profile.store_id) {
    return { ok: false as const, response: NextResponse.json({ error: "Obaveštenja su dostupna samo zaposlenima u radnji." }, { status: 403 }) };
  }
  return { ok: true as const, userId: auth.profile.id, storeId: auth.profile.store_id };
}

export async function GET(request: NextRequest) {
  const auth = await authorizeStore();
  if (!auth.ok) return auth.response;
  const id = request.cookies.get(TASK_PUSH_COOKIE)?.value;
  if (!isUuid(id)) return NextResponse.json({ enabled: false });
  try {
    const { data, error } = await createServiceClient().from("task_push_subscriptions").select("id")
      .eq("id", id).eq("user_id", auth.userId).eq("store_id", auth.storeId).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ enabled: Boolean(data) });
  } catch {
    return NextResponse.json({ error: "Stanje obaveštenja nije dostupno." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeStore();
  if (!auth.ok) return auth.response;
  if (!getTaskPushConfig()) return NextResponse.json({ error: "Obaveštenja još nisu podešena." }, { status: 503 });
  const subscription = readTaskPushSubscription(await readJsonObject(request));
  if (!subscription) return NextResponse.json({ error: "Ovaj servis za obaveštenja nije podržan." }, { status: 400 });
  try {
    const service = createServiceClient();
    const { data, error } = await service.from("task_push_subscriptions").upsert({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_id: auth.userId,
      store_id: auth.storeId
    }, { onConflict: "endpoint" }).select("id").single();
    if (error || !data) throw error ?? new Error("Registration unavailable");

    const previous = request.cookies.get(TASK_PUSH_COOKIE)?.value;
    if (isUuid(previous) && previous !== data.id) {
      await service.from("task_push_subscriptions").delete().eq("id", previous).eq("user_id", auth.userId);
    }
    const response = NextResponse.json({ enabled: true });
    response.cookies.set(TASK_PUSH_COOKIE, data.id, {
      httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 365 * 24 * 60 * 60
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Prijava uređaja nije uspela. Pokušajte ponovo." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authorizeStore();
  if (!auth.ok) return auth.response;
  const id = request.cookies.get(TASK_PUSH_COOKIE)?.value;
  try {
    if (isUuid(id)) {
      const { error } = await createServiceClient().from("task_push_subscriptions").delete().eq("id", id).eq("user_id", auth.userId);
      if (error) throw error;
    }
    const response = NextResponse.json({ enabled: false });
    response.cookies.delete(TASK_PUSH_COOKIE);
    return response;
  } catch {
    return NextResponse.json({ error: "Obaveštenja nisu isključena. Pokušajte ponovo." }, { status: 500 });
  }
}
