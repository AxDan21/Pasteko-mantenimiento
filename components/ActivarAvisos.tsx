"use client";
import { useEffect, useState } from "react";
import { guardarSuscripcion, probarAviso, quitarSuscripcion } from "@/app/avisos/actions";

type Estado = "cargando" | "sin-soporte" | "ios-instalar" | "sin-llaves" | "bloqueado" | "apagado" | "activo";

const aBytes = (b64: string) => {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** Botón para recibir en este celular una notificación por cada reporte nuevo. */
export default function ActivarAvisos({ compacto = false }: { compacto?: boolean }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const llave = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const instalada = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone;
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setEstado(ios && !instalada ? "ios-instalar" : "sin-soporte");
      if (!llave) return setEstado("sin-llaves");
      if (Notification.permission === "denied") return setEstado("bloqueado");
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      setEstado(sub ? "activo" : "apagado");
    })().catch(() => setEstado("sin-soporte"));
  }, [llave]);

  async function activar() {
    setOcupado(true);
    setMsg(null);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") return setEstado("bloqueado");
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(llave!) });
      const r = await guardarSuscripcion(sub.toJSON() as Parameters<typeof guardarSuscripcion>[0], navigator.userAgent.replace(/.*\(([^)]+)\).*/, "$1"));
      if (!r.ok) throw new Error();
      setEstado("activo");
      const p = await probarAviso();
      setMsg(p.enviados ? "Listo. Te mandamos una notificación de prueba." : "Activado. Si no llega la prueba, revisa que el celular permita notificaciones de esta app.");
    } catch {
      setMsg("No se pudo activar. Intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar() {
    setOcupado(true);
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await quitarSuscripcion(sub.endpoint);
      await sub.unsubscribe();
    }
    setEstado("apagado");
    setMsg(null);
    setOcupado(false);
  }

  if (estado === "cargando") return null;
  const textos: Partial<Record<Estado, string>> = {
    "sin-soporte": "Este navegador no recibe notificaciones. En Android usa Chrome; en iPhone, agrega la app a la pantalla de inicio.",
    "ios-instalar": "En iPhone: toca Compartir → «Agregar a inicio», abre la app desde ese ícono e inicia sesión. Ahí aparecerá el botón para activar avisos.",
    "sin-llaves": "Faltan las llaves de notificaciones en Vercel (NEXT_PUBLIC_VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY).",
    bloqueado: "Las notificaciones están bloqueadas para este sitio. Actívalas en los ajustes del navegador y recarga.",
  };

  return (
    <div className={`avisos ${estado === "activo" ? "on" : ""} ${compacto ? "compacto" : ""}`}>
      <span className="avisos-ic" aria-hidden>
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
      </span>
      <div className="avisos-t">
        <b>{estado === "activo" ? "Avisos activos en este celular" : compacto ? "Recibe en tu celular los reportes que te asignen" : "Recibe cada reporte en tu celular"}</b>
        <span>{msg ?? textos[estado] ?? (estado === "activo" ? "Te llega una notificación al abrirse o actualizarse un ticket." : "Gratis, sin WhatsApp. Actívalo en cada celular donde quieras recibirlos.")}</span>
      </div>
      {estado === "apagado" && <button className="btn primary small" onClick={activar} disabled={ocupado}>{ocupado ? "Activando…" : "Activar"}</button>}
      {estado === "activo" && (
        <span className="avisos-acc">
          <button className="btn small" onClick={async () => { setOcupado(true); const p = await probarAviso(); setMsg(p.enviados ? "Prueba enviada." : "No se pudo enviar la prueba."); setOcupado(false); }} disabled={ocupado}>Probar</button>
          <button className="btn small" onClick={desactivar} disabled={ocupado}>Apagar</button>
        </span>
      )}
    </div>
  );
}
