/* Push only: this worker does not intercept requests or cache app data. */
const taskIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

self.addEventListener("push", (event) => {
  let payload;
  try { payload = event.data?.json(); } catch { return; }
  if (typeof payload?.taskId !== "string" || !taskIdPattern.test(payload.taskId)) return;
  event.waitUntil(self.registration.showNotification("Novi zadatak", {
    body: typeof payload.body === "string" ? payload.body : "Otvorite zadatak u aplikaciji.",
    tag: `task-${payload.taskId}`,
    data: { taskId: payload.taskId }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const taskId = event.notification.data?.taskId;
  if (typeof taskId !== "string" || !taskIdPattern.test(taskId)) return;
  const destination = new URL(`/store?task=${taskId}#task-${taskId}`, self.location.origin);
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => {
      const url = new URL(client.url);
      return url.origin === destination.origin && url.pathname === "/store";
    });
    if (existing) {
      try {
        const opened = await existing.navigate(destination.href);
        if (opened) return opened.focus();
      } catch { /* Open a fresh window if the existing window is unavailable. */ }
    }
    return self.clients.openWindow(destination.href);
  })());
});
