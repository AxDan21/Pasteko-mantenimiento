"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { crearTicket } from "@/app/t/actions";
import { comprimirFoto } from "@/lib/imagen";
import { DESDE, VENDER, avisoSeguridad, solucionesPara, type Vender } from "@/lib/tickets";

type Faq = { pregunta: string; pasos: string[]; aviso_seguridad: string | null };
type Props = {
  activo: { id: string; equipo: string; sucursal: string };
  sintomas: string[];
  faqs: Faq[];
};
type Foto = { file: File; url: string };
const DATOS = "pk-reporta";

export default function FormTicket({ activo, sintomas, faqs }: Props) {
  const router = useRouter();
  const [paso, setPaso] = useState(1);
  const [sintoma, setSintoma] = useState("");
  const [otro, setOtro] = useState("");
  const [desde, setDesde] = useState("");
  const [vender, setVender] = useState<Vender | "">("");
  const [detalle, setDetalle] = useState("");
  const [nombre, setNombre] = useState("");
  const [tel, setTel] = useState("");
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
  const total = sugeridas.length ? 3 : 2;
  const pasoVisible = sugeridas.length ? paso : paso === 3 ? 2 : paso;

  async function agregarFotos(lista: FileList | null) {
    if (!lista) return;
    const nuevas: Foto[] = [];
    for (const f of Array.from(lista).slice(0, 3 - fotos.length)) {
      try {
        const blob = await comprimirFoto(f, 1400, 0.72);
        const file = new File([blob], "foto.jpg", { type: "image/jpeg" });
        nuevas.push({ file, url: URL.createObjectURL(blob) });
      } catch {}
    }
    setFotos((x) => [...x, ...nuevas].slice(0, 3));
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!vender) return setError("Indica si pueden seguir vendiendo.");
    if (nombre.trim().length < 2) return setError("Escribe tu nombre.");
    setEnviando(true);
    const fd = new FormData(e.currentTarget);
    fd.set("activo", activo.id);
    fd.set("sintoma", elegido);
    fd.set("desde", desde);
    fd.set("vender", vender);
    fotos.forEach((f) => fd.append("fotos", f.file));
    try {
      localStorage.setItem(DATOS, JSON.stringify({ nombre: nombre.trim(), tel: tel.trim() }));
    } catch {}
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
        <p className="sub">No se envió ningún reporte. Si vuelve a fallar, escanea de nuevo el QR del equipo.</p>
        <Link className="btn" href={`/a/${activo.id}`}>Volver al equipo</Link>
      </div>
    );
  }

  return (
    <form className="tk-form" onSubmit={enviar} noValidate>
      <div className="tk-prog" aria-label={`Paso ${pasoVisible} de ${total}`}>
        {Array.from({ length: total }, (_, i) => <span key={i} className={i < pasoVisible ? "on" : ""} />)}
      </div>

      {paso === 1 && (
        <section className="tk-paso">
          <h2>¿Qué le pasa al equipo?</h2>
          <div className="tk-sintomas">
            {[...sintomas, "Otro"].map((s) => (
              <button type="button" key={s} className={`tk-op ${sintoma === s ? "on" : ""}`} onClick={() => setSintoma(s)} aria-pressed={sintoma === s}>
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
          <p className="tk-lbl">¿Desde cuándo?</p>
          <div className="tk-chips">
            {DESDE.map((d) => (
              <button type="button" key={d} className={`tk-chip ${desde === d ? "on" : ""}`} onClick={() => setDesde(desde === d ? "" : d)} aria-pressed={desde === d}>{d}</button>
            ))}
          </div>
          {seguridad && <div className="note bad tk-seg">⚠️ {seguridad}</div>}
          <button type="button" className="btn primary big" disabled={!elegido} onClick={() => setPaso(sugeridas.length ? 2 : 3)}>Continuar</button>
        </section>
      )}

      {paso === 2 && (
        <section className="tk-paso">
          <h2>Antes de reportar, prueba esto</h2>
          <p className="sub">Muchas fallas se resuelven en minutos. Si no funciona, continúa y lo atendemos.</p>
          <div className="tk-sol">
            {sugeridas.map((f, i) => (
              <div key={i} className={`tk-sol-i ${abierta === i ? "on" : ""}`}>
                <button type="button" onClick={() => setAbierta(abierta === i ? null : i)} aria-expanded={abierta === i}>
                  <span>{f.pregunta}</span><span aria-hidden>{abierta === i ? "−" : "+"}</span>
                </button>
                {abierta === i && (
                  <div>
                    {f.aviso_seguridad && <p className="note warn">{f.aviso_seguridad}</p>}
                    <ol>{f.pasos.map((p, j) => <li key={j}>{p}</li>)}</ol>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="tk-dos">
            <button type="button" className="btn big" onClick={() => setResuelto(true)}>Ya funciona</button>
            <button type="button" className="btn primary big" onClick={() => setPaso(3)}>Sigue fallando</button>
          </div>
          <button type="button" className="tk-atras" onClick={() => setPaso(1)}>← Cambiar la falla</button>
        </section>
      )}

      {paso === 3 && (
        <section className="tk-paso">
          <h2>¿Pueden seguir vendiendo?</h2>
          <div className="tk-vender">
            {(Object.keys(VENDER) as Vender[]).map((k) => (
              <button type="button" key={k} className={`tk-v ${k} ${vender === k ? "on" : ""}`} onClick={() => setVender(k)} aria-pressed={vender === k}>
                <b>{VENDER[k].titulo}</b><span>{VENDER[k].sub}</span>
              </button>
            ))}
          </div>

          <label className="field">
            Algo más que debamos saber <span className="hint">(opcional)</span>
            <textarea name="detalle" rows={3} maxLength={1200} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Ej. Hace un clic y se apaga. Ya lo desconectamos y conectamos." />
          </label>

          <div className="tk-fotos">
            {fotos.map((f, i) => (
              <span key={i} className="tk-foto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt={`Foto ${i + 1}`} />
                <button type="button" aria-label="Quitar foto" onClick={() => setFotos((x) => x.filter((_, j) => j !== i))}>×</button>
              </span>
            ))}
            {fotos.length < 3 && (
              <label className="tk-foto add">
                <input type="file" accept="image/*" capture="environment" multiple onChange={(e) => { agregarFotos(e.target.files); e.target.value = ""; }} />
                <span aria-hidden>📷</span><small>{fotos.length ? "Otra foto" : "Agregar foto"}</small>
              </label>
            )}
          </div>

          <div className="grid2">
            <label className="field">
              Tu nombre
              <input name="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="name" maxLength={60} required />
            </label>
            <label className="field">
              Teléfono <span className="hint">(para que el técnico te ubique)</span>
              <input name="tel" value={tel} onChange={(e) => setTel(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" maxLength={20} placeholder="10 dígitos" />
            </label>
          </div>
          <input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" className="tk-trampa" aria-hidden />

          {error && <p className="note bad" role="alert">{error}</p>}
          <button className="btn primary big" disabled={enviando}>{enviando ? "Enviando…" : "Enviar reporte"}</button>
          <button type="button" className="tk-atras" onClick={() => setPaso(sugeridas.length ? 2 : 1)}>← Atrás</button>
        </section>
      )}

      <p className="tk-pie">{activo.equipo} · {activo.sucursal} · <span className="num">{activo.id}</span></p>
    </form>
  );
}
