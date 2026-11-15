// Service worker: solo recibe notificaciones push y abre el ticket al tocarlas.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = { titulo: "Pasteko Mantenimiento", cuerpo: "Tienes un aviso nuevo", url: "/admin/tickets", tag: undefined };
  try { d = { ...d, ...e.data.json() }; } catch {}
  e.waitUntil(
    self.registration.showNotification(d.titulo, {
      body: d.cuerpo,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: d.tag,
      renotify: !!d.tag,
      data: { url: d.url },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || "/admin/tickets", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => {
      for (const w of ws) if (w.url === url && "focus" in w) return w.focus();
      return self.clients.openWindow(url);
    })
  );
});
