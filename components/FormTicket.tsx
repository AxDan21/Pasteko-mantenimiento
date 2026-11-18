"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { crearTicket } from "@/app/t/actions";
import { comprimirFoto } from "@/lib/imagen";
import { DESDE, VENDER, avisoSeguridad, solucionesPara, type Vender } from "@/lib/tickets";

type Faq = { pregunta: string; pasos: string[]; aviso_seguridad: string | null };
type Props = {
  activo: { id: string; equipo: string; sucursal: string };
  sintomas: string[];
  faqs: Faq[];
  abierto?: { folio: string; token: string } | null;
};
type Foto = { file: File; url: string };
type Paso = "falla" | "prueba" | "urgencia" | "datos";
const NOMBRES: Record<Paso, string> = { falla: "La falla", prueba: "Prueba rápida", urgencia: "Urgencia", datos: "Fotos y contacto" };
const DATOS = "pk-reporta";

/** Reporte de falla en pasos cortos: una pregunta por pantalla, botón principal siempre abajo. */
export default function FormTicket({ activo, sintomas, faqs, abierto }: Props) {
  const router = useRouter();
  const arriba = useRef<HTMLDivElement>(null);
  const [paso, setPaso] = useState<Paso>("falla");
  const [sintoma, setSintoma] = useState("");
  const [otro, setOtro] = useState("");
  const [desde, setDesde] = useState("");
  const [vender, setVender] = useState<Vender | "">("");
  const [detalle, setDetalle] = useState("");
  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
  const [trampa, setTrampa] = useState("");
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [abierta, setAbierta] = useState<number | null>(0);
  const [resuelto, setResuelto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const d = JSON.parse(localStorage.getItem(DATOS) ?? "null");
      if (d) { setNombre(d.nombre ?? ""); setTel(d.tel ?? ""); }
    } catch {}
  }, []);

  const elegido = sintoma === "Otro" ? otro.trim() : sintoma;
  const sugeridas = useMemo(() => (elegido ? solucionesPara(faqs, elegido) : []), [faqs, elegido]);
  const seguridad = elegido ? avisoSeguridad(elegido) : null;
  const pasos: Paso[] = sugeridas.length ? ["falla", "prueba", "urgencia", "datos"] : ["falla", "urgencia", "datos"];
  const i = Math.max(0, pasos.indexOf(paso));

  function ir(p: Paso) {
    setError(null);
    setPaso(p);
    requestAnimationFrame(() => arriba.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  const siguiente = () => ir(pasos[Math.min(i + 1, pasos.length - 1)]);
  const atras = () => (i === 0 ? router.push(`/a/${activo.id}`) : ir(pasos[i - 1]));

  async function agregarFotos(lista: FileList | null) {
    if (!lista) return;
    const nuevas: Foto[] = [];
    for (const f of Array.from(lista).slice(0, 3 - fotos.length)) {
      try {
        const blob = await comprimirFoto(f, 1400, 0.72);
        nuevas.push({ file: new File([blob], "foto.jpg", { type: "image/jpeg" }), url: URL.createObjectURL(blob) });
      } catch {}
    }
    setFotos((x) => [...x, ...nuevas].slice(0, 3));
  }

  async function enviar() {
    setError(null);
    if (!vender) return ir("urgencia");
    if (nombre.trim().length < 2) return setError("Escribe tu nombre para que el técnico sepa a quién buscar.");
    setEnviando(true);
    const fd = new FormData();
    fd.set("activo", activo.id);
    fd.set("sintoma", elegido);
    fd.set("desde", desde);
    fd.set("vender", vender);
    fd.set("detalle", detalle);
    fd.set("nombre", nombre);
    fd.set("tel", tel);
    fd.set("sitio_web", trampa);
    fotos.forEach((f) => fd.append("fotos", f.file));
    try { localStorage.setItem(DATOS, JSON.stringify({ nombre: nombre.trim(), tel: tel.trim() })); } catch {}
    const r = await crearTicket(fd).catch(() => ({ ok: false as const, error: "Sin conexión. Revisa tu señal e intenta de nuevo." }));
    if (!r.ok) {
      setEnviando(false);
      return setError(r.error);
    }
    router.push(`/t/${r.token}?${r.nuevo ? "nuevo" : "sumado"}=1`);
  }

  if (resuelto) {
    return (
      <div className="tk-fin card">
        <span className="tk-fin-ic" aria-hidden>✓</span>
        <h2>¡Qué bien que ya funciona!</h2>
        <p className="sub">No se envió ningún reporte. Si vuelve a fallar, escanea otra vez el QR del equipo.</p>
        <Link className="btn" href={`/a/${activo.id}`}>Volver al equipo</Link>
      </div>
    );
  }

  // Botón principal de cada paso (va fijo abajo en el celular)
  const accion =
    paso === "falla" ? <button type="button" className="btn primary big" disabled={!elegido} onClick={siguiente}>{elegido ? "Continuar" : "Elige una opción"}</button>
    : paso === "prueba" ? (
      <div className="tk-dos">
        <button type="button" className="btn big" onClick={() => setResuelto(true)}>Ya funciona</button>
        <button type="button" className="btn primary big" onClick={siguiente}>Sigue fallando</button>
      </div>
    )
    : paso === "urgencia" ? <button type="button" className="btn primary big" disabled={!vender} onClick={siguiente}>{vender ? "Continuar" : "Elige una opción"}</button>
    : <button type="button" className="btn primary big" disabled={enviando} onClick={enviar}>{enviando ? "Enviando…" : abierto ? `Agregar a ${abierto.folio}` : "Enviar reporte"}</button>;

  return (
    <div className="tk-form">
      <div className="tk-top" ref={arriba}>
        <button type="button" className="tk-back" onClick={atras} aria-label={i === 0 ? "Volver al equipo" : "Paso anterior"}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="tk-top-t">
          <small>Paso {i + 1} de {pasos.length}</small>
          <b>{NOMBRES[paso]}</b>
        </div>
        <span className="tk-top-eq" title={`${activo.equipo} · ${activo.sucursal}`}><b>{activo.equipo}</b>{activo.sucursal}</span>
      </div>
      <div className="tk-prog" aria-hidden>{pasos.map((p, k) => <span key={p} className={k <= i ? "on" : ""} />)}</div>

      {abierto && i === 0 && (
        <Link href={`/t/${abierto.token}`} className="tk-aviso">
          <b>Este equipo ya tiene el reporte {abierto.folio} en atención.</b>
          <span>Lo que envíes se sumará a ese mismo. Ver avance →</span>
        </Link>
      )}

      {paso === "falla" && (
        <section className="tk-paso">
          <h2>¿Qué le pasa al equipo?</h2>
          <div className="tk-sintomas" role="radiogroup" aria-label="Falla">
            {[...sintomas, "Otro"].map((s) => (
              <button type="button" key={s} role="radio" className={`tk-op ${sintoma === s ? "on" : ""}`} onClick={() => setSintoma(s)} aria-checked={sintoma === s}>
                {s}
              </button>
            ))}
          </div>
          {sintoma === "Otro" && (
            <label className="field">
              Descríbelo en pocas palabras
              <input value={otro} onChange={(e) => setOtro(e.target.value)} maxLength={80} placeholder="Ej. La pantalla no responde" autoFocus />
            </label>
          )}
          <p className="tk-lbl">¿Desde cuándo? <span className="hint">(opcional)</span></p>
          <div className="tk-chips">
            {DESDE.map((d) => (
              <button type="button" key={d} className={`tk-chip ${desde === d ? "on" : ""}`} onClick={() => setDesde(desde === d ? "" : d)} aria-pressed={desde === d}>{d}</button>
            ))}
          </div>
          {seguridad && <div className="note bad tk-seg">⚠️ {seguridad}</div>}
        </section>
      )}

      {paso === "prueba" && (
        <section className="tk-paso">
          <h2>Antes de reportar, prueba esto</h2>
          <p className="sub">Muchas fallas se resuelven en minutos. Si no funciona, sigue y lo atendemos.</p>
          <div className="tk-sol">
            {sugeridas.map((f, k) => (
              <div key={k} className={`tk-sol-i ${abierta === k ? "on" : ""}`}>
                <button type="button" onClick={() => setAbierta(abierta === k ? null : k)} aria-expanded={abierta === k}>
                  <span>{f.pregunta}</span><span aria-hidden>{abierta === k ? "−" : "+"}</span>
                </button>
                {abierta === k && (
                  <div>
                    {f.aviso_seguridad && <p className="note warn">{f.aviso_seguridad}</p>}
                    <ol>{f.pasos.map((p, j) => <li key={j}>{p}</li>)}</ol>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {paso === "urgencia" && (
        <section className="tk-paso">
          <h2>¿Pueden seguir vendiendo?</h2>
          <p className="sub">Así sabemos qué tan rápido tenemos que llegar.</p>
          <div className="tk-vender" role="radiogroup" aria-label="Urgencia">
            {(Object.keys(VENDER) as Vender[]).map((k) => (
              <button type="button" key={k} role="radio" className={`tk-v ${k} ${vender === k ? "on" : ""}`} aria-checked={vender === k}
                onClick={() => { setVender(k); setTimeout(() => ir("datos"), 220); }}>
                <b>{VENDER[k].titulo}</b><span>{VENDER[k].sub}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {paso === "datos" && (
        <section className="tk-paso">
          <h2>Último paso</h2>
          <div className="tk-resumen">
            <span><small>Falla</small><b>{elegido}{desde ? ` · ${desde.toLowerCase()}` : ""}</b></span>
            <span><small>Urgencia</small><b className={`tk-r-${vender}`}>{vender ? VENDER[vender].titulo : "—"}</b></span>
            <button type="button" className="link-btn" onClick={() => ir("falla")}>Cambiar</button>
          </div>

          <div>
            <p className="tk-lbl" style={{ marginBottom: 8 }}>Fotos <span className="hint">(opcional, ayudan al técnico)</span></p>
            <div className="tk-fotos">
              {fotos.map((f, k) => (
                <span key={k} className="tk-foto">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={`Foto ${k + 1}`} />
                  <button type="button" aria-label="Quitar foto" onClick={() => setFotos((x) => x.filter((_, j) => j !== k))}>×</button>
                </span>
              ))}
              {fotos.length < 3 && (
                <label className="tk-foto add">
                  <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => { agregarFotos(e.target.files); e.target.value = ""; }} />
                  <span aria-hidden>📷</span><small>{fotos.length ? "Otra foto" : "Tomar foto"}</small>
                </label>
              )}
            </div>
          </div>

          <label className="field">
            Algo más que debamos saber <span className="hint">(opcional)</span>
            <textarea rows={2} maxLength={1200} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Ej. Hace un clic y se apaga." />
          </label>
          <div className="grid2">
            <label className="field">
              Tu nombre
              <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={60} required />
            </label>
            <label className="field">
              Teléfono <span className="hint">(opcional)</span>
              <input value={tel} onChange={(e) => setTel(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="10 dígitos" />
            </label>
          </div>
          <input type="text" value={trampa} onChange={(e) => setTrampa(e.target.value)} tabIndex={-1} autoComplete="off" className="tk-trampa" aria-hidden />
          {error && <p className="note bad" role="alert">{error}</p>}
        </section>
      )}

      <div className="tk-barra">{accion}</div>
    </div>
  );
}
