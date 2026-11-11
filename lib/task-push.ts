import "server-only";

import { generateRequestDetails } from "web-push";
import { getTaskPushConfig, readTaskPushSubscription } from "@/lib/task-push-config";
import { createServiceClient } from "@/lib/supabase/service";

export async function notifyTaskStores(taskId: string, title: string, storeIds: string[]) {
  const vapidDetails = getTaskPushConfig();
  if (!vapidDetails) return { warning: true, message: "Obaveštenja nisu podešena na serveru." };

  const supabase = createServiceClient();
  const recipients = new Set(storeIds);
  const deadline = Date.now() + 12_000;
  const { data, count, error } = await supabase.from("task_push_subscriptions")
    .select("id, endpoint, p256dh, auth, user_id, store_id, profiles!inner(role, store_id)", { count: "exact" })
    .in("store_id", [...recipients]).eq("profiles.role", "store").order("id").limit(500)
    .abortSignal(AbortSignal.timeout(5_000));
  if (error) throw error;

  const rows = data ?? [];
  const subscriptions = rows.filter((row) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return recipients.has(row.store_id) && profile?.role === "store" && profile.store_id === row.store_id;
  });
  const omitted = Math.max(0, (count ?? rows.length) - rows.length);
  const missingStores = omitted ? 0 : recipients.size - new Set(subscriptions.map((row) => row.store_id)).size;
  const payload = JSON.stringify({ title: "Novi zadatak", body: Array.from(title).slice(0, 120).join(""), taskId });
  let sent = 0;
  let failed = omitted;
  let cursor = 0;

  await Promise.all(Array.from({ length: Math.min(8, subscriptions.length) }, async () => {
    while (cursor < subscriptions.length && Date.now() < deadline) {
      const row = subscriptions[cursor++];
      const subscription = readTaskPushSubscription({ endpoint: row.endpoint, keys: { auth: row.auth, p256dh: row.p256dh } });
      if (!subscription) { failed++; continue; }
      try {
        const request = generateRequestDetails(subscription, payload, {
          vapidDetails, TTL: 3600, urgency: "high", topic: taskId.replace(/-/g, "")
        });
        const response = await fetch(request.endpoint, {
          method: request.method,
          headers: Object.fromEntries(Object.entries(request.headers).map(([key, value]) => [key, String(value)])),
          body: request.body ? new Uint8Array(request.body) : undefined,
          cache: "no-store",
          redirect: "error",
          signal: AbortSignal.timeout(Math.max(1, Math.min(5000, deadline - Date.now())))
        });
        await response.body?.cancel().catch(() => undefined);
        if (response.ok) {
          sent++;
        } else {
          failed++;
          if (response.status === 404 || response.status === 410) {
            // Do not remove a registration that has been rebound since the query.
            await supabase.from("task_push_subscriptions").delete().eq("id", row.id)
              .eq("user_id", row.user_id).eq("endpoint", row.endpoint).eq("auth", row.auth)
              .abortSignal(AbortSignal.timeout(2_000)).then(() => undefined, () => undefined);
          }
        }
      } catch {
        failed++;
      }
    }
  }));
  failed += subscriptions.length - cursor;

  const message = [
    sent ? `Servis je prihvatio obaveštenje za ${sent} ${sent === 1 ? "uređaj" : "uređaja"}.` : "Nijedno obaveštenje nije potvrđeno.",
    failed ? `Slanje nije potvrđeno za ${failed} uređaja.` : "",
    missingStores ? `Bez prijavljenog uređaja: ${missingStores} radnji.` : ""
  ].filter(Boolean).join(" ");
  return { warning: failed > 0 || missingStores > 0 || sent === 0, message };
}
