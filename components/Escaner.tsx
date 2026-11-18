"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

type Lector = (v: HTMLVideoElement) => Promise<string | null>;
type Estado = "iniciando" | "camara" | "sin-camara" | "sin-lector";

/** Lector de respaldo para iPhone (Safari no trae BarcodeDetector). Se carga del CDN solo si hace falta. */
const JSQR = "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/+esm";

/** Convierte lo leído (URL de la etiqueta o código) en la ruta del equipo. */
function rutaDe(texto: string): string | null {
  const t = texto.trim();
  try {
    const u = new URL(t);
    const m = u.pathname.match(/^\/a\/([^/?#]+)/);
    if (m) return `/a/${m[1]}`;
  } catch { /* no es URL */ }
  const c = t.toUpperCase().match(/PK-[A-Z]{2,5}-\d{1,5}/);
  return c ? `/a/${encodeURIComponent(c[0])}` : null;
}

export function normalizarCodigo(v: string) {
  let c = v.trim().toUpperCase().replace(/\s+/g, "-").replace(/_/g, "-");
  if (c && !c.startsWith("PK-")) c = `PK-${c}`;
  return c;
}

async function crearLector(): Promise<Lector | null> {
  const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } };
  if (W.BarcodeDetector) {
    try {
      const d = new W.BarcodeDetector({ formats: ["qr_code"] });
      return async (v) => (await d.detect(v))[0]?.rawValue ?? null;
    } catch { /* sigue con el respaldo */ }
  }
  try {
    const mod = (await import(/* webpackIgnore: true */ JSQR)) as { default: (d: Uint8ClampedArray, w: number, h: number) => { data: string } | null };
    const jsQR = mod.default;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    return async (v) => {
      if (!v.videoWidth) return null;
      const k = Math.min(1, 640 / Math.max(v.videoWidth, v.videoHeight));
      canvas.width = Math.round(v.videoWidth * k);
      canvas.height = Math.round(v.videoHeight * k);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(img.data, img.width, img.height)?.data ?? null;
    };
  } catch {
    return null;
  }
}

/** Escáner del QR de la etiqueta del equipo, para tiendas sin cuenta. */
export default function Escaner() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<Estado>("iniciando");
  const [codigo, setCodigo] = useState(false);
  const [valor, setValor] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [luz, setLuz] = useState<boolean | null>(null); // null: el celular no tiene linterna controlable
  const [leido, setLeido] = useState(false);

  const ir = useCallback((ruta: string) => {
    setLeido(true);
    if (navigator.vibrate) navigator.vibrate(60);
    stream.current?.getTracks().forEach((t) => t.stop());
    router.push(ruta);
  }, [router]);

  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setEstado("sin-camara"); return; }
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
        if (!vivo) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play().catch(() => undefined);
        const pista = s.getVideoTracks()[0];
        const caps = (pista.getCapabilities?.() ?? {}) as { torch?: boolean };
        setLuz(caps.torch ? false : null);
        setEstado("camara");
        const leer = await crearLector();
        if (!leer) { setEstado("sin-lector"); return; }
        const ciclo = async () => {
          if (!vivo) return;
          try {
            const txt = await leer(v);
            if (txt) {
              const r = rutaDe(txt);
              if (r) return ir(r);
              setAviso("Ese QR no es de un equipo Pasteko. Busca la etiqueta naranja del equipo.");
            }
          } catch { /* cuadro sin leer */ }
          timer = setTimeout(ciclo, 250);
        };
        ciclo();
      } catch {
        if (vivo) setEstado("sin-camara");
      }
    })();
    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, [ir]);

  async function alternarLuz() {
    const pista = stream.current?.getVideoTracks()[0];
    if (!pista || luz === null) return;
    try {
      await pista.applyConstraints({ advanced: [{ torch: !luz } as MediaTrackConstraintSet] });
      setLuz(!luz);
    } catch { setLuz(null); }
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    const c = normalizarCodigo(valor);
    if (!/^PK-[A-Z]{2,5}-\d{1,5}$/.test(c)) return setAviso("Escribe el código como aparece en la etiqueta, por ejemplo PK-CAF-001.");
    ir(`/a/${encodeURIComponent(c)}`);
  }

  const sinVideo = estado === "sin-camara";

  return (
    <main className="esc">
      <video ref={video} className="esc-video" playsInline muted aria-hidden="true" />
      <div className="esc-velo" aria-hidden="true" />

      <div className="esc-barra">
        <Link href="/login" className="esc-btn" aria-label="Volver">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
        </Link>
        <b>Reportar una falla</b>
        {luz !== null ? (
          <button type="button" className={`esc-btn${luz ? " on" : ""}`} aria-pressed={luz} aria-label="Linterna" onClick={alternarLuz}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 2h8l-1 6H9zM9 8h6v3l-1 11h-4L9 11z" /><path d="M12 13v3" /></svg>
          </button>
        ) : <span className="esc-btn vacio" aria-hidden="true" />}
      </div>

      {!sinVideo && (
        <>
          <p className="esc-guia">{leido ? "¡Listo! Abriendo el equipo…" : estado === "iniciando" ? "Abriendo la cámara…" : "Apunta al QR de la etiqueta del equipo"}</p>
          <div className={`esc-visor${leido ? " ok" : ""}`} aria-hidden="true">
            <i className="e1" /><i className="e2" /><i className="e3" /><i className="e4" />
            {!leido && <b className="esc-linea" />}
          </div>
        </>
      )}

      <section className="esc-hoja">
        {!codigo ? (
          <>
            {sinVideo || estado === "sin-lector" ? (
              <div className="esc-teko">
                <img src="/mascota.webp" alt="" />
                <p>
                  <b>{sinVideo ? "No pudimos abrir la cámara aquí." : "Tu navegador no puede leer el QR."}</b>{" "}
                  Abre la <b>cámara de tu celular</b>, apunta al QR de la etiqueta y toca el enlace que aparece. O escribe el código del equipo.
                </p>
              </div>
            ) : (
              <div className="esc-teko">
                <img src="/mascota.webp" alt="" />
                <p><b>La etiqueta naranja está pegada en el equipo.</b> En cuanto se lea el QR, te llevo a reportar la falla.</p>
              </div>
            )}
            <ol className="esc-pasos">
              <li><b>1</b>Escanea</li>
              <li><b>2</b>Di qué falla</li>
              <li><b>3</b>Sigue el ticket</li>
            </ol>
            {aviso && <p className="esc-aviso" role="status">{aviso}</p>}
            <button type="button" className="esc-codigo" onClick={() => { setCodigo(true); setAviso(null); }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" /></svg>
              {sinVideo ? "Escribir el código del equipo" : "¿No lee? Escribe el código del equipo"}
            </button>
          </>
        ) : (
          <form onSubmit={enviar} className="esc-form">
            <div className="esc-form-cab">
              <b>Código del equipo</b>
              <button type="button" onClick={() => { setCodigo(false); setAviso(null); }}>{sinVideo ? "Cancelar" : "Volver a escanear"}</button>
            </div>
            <label>
              Viene abajo del QR, en la pastilla negra.
              <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ej. PK-CAF-001" autoCapitalize="characters" autoComplete="off" autoFocus inputMode="text" />
            </label>
            {aviso && <p className="esc-aviso" role="alert">{aviso}</p>}
            <button type="submit" className="esc-seguir">
              Continuar
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
