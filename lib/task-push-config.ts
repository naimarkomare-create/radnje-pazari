import "server-only";

export const TASK_PUSH_COOKIE = "task-push-device";

export function getTaskPushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = process.env.VAPID_SUBJECT?.trim() ?? "";
  if (!/^B[A-Za-z0-9_-]{86}$/.test(publicKey) || !/^[A-Za-z0-9_-]{43}$/.test(privateKey)) return null;
  if (!/^mailto:[^\s@]+@[^\s@]+$/.test(subject) && !/^https:\/\/[^\s]+$/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

export function readTaskPushSubscription(value: Record<string, unknown>) {
  const { endpoint, keys } = value;
  // Never let a browser turn the sender into an arbitrary outbound HTTP client.
  if (typeof endpoint !== "string" || endpoint.length > 2048 || !(
    /^https:\/\/fcm\.googleapis\.com\/(?:fcm\/send|wp)\/[A-Za-z0-9_:-]+$/.test(endpoint) ||
    /^https:\/\/updates\.push\.services\.mozilla\.com\/wpush\/v2\/[A-Za-z0-9_-]+$/.test(endpoint)
  )) return null;
  if (!keys || typeof keys !== "object") return null;
  const { auth, p256dh } = keys as Record<string, unknown>;
  if (typeof auth !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(auth) ||
    typeof p256dh !== "string" || !/^B[A-Za-z0-9_-]{86}$/.test(p256dh)) return null;
  return { endpoint, keys: { auth, p256dh } };
}
