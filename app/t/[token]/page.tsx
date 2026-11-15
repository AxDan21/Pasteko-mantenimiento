import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import CompartirEnlace from "@/components/CompartirEnlace";
import { createClient } from "@/lib/supabase/server";
import { cancelarTicket, comentarTicket } from "@/app/t/actions";
import { ABIERTOS, ESTADOS, VENDER, folioTicket, hace, type EstadoTicket, type Vender } from "@/lib/tickets";

export const dynamic = "force-dynamic";
export const metadata = { title: "Seguimiento de reporte · Pasteko Mantenimiento", robots: { index: false } };

type Publico = {
  folio: number; estado: EstadoTicket; equipo: string; activo_id: string | null; sucursal: string; sintoma: string;
  detalle: string | null; puede_vender: Vender; reporta_nombre: string; creado: string; asignado_en: string | null;
  resuelto_en: string | null; tecnico: string | null; hoja_folio: number | null;
  eventos: { creado: string; tipo: string; texto: string }[];
};

const PASOS: { clave: EstadoTicket; nombre: string }[] = [
  { clave: "abierto", nombre: "Recibido" },
  { clave: "asignado", nombre: "Técnico asignado" },
  { clave: "en_proceso", nombre: "En camino" },
  { clave: "resuelto", nombre: "Resuelto" },
];
const fmt = (s: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(s));

/** Enlace que recibe la tienda para seguir su reporte. */
export default async function Seguimiento({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ nuevo?: string; sumado?: string }> }) {
  const { token } = await params;
  const q = await searchParams;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("ticket_publico", { p_token: token });
  const t = data as Publico | null;
  if (!t) notFound();

  const abierto = ABIERTOS.includes(t.estado);
  const idx = t.estado === "cancelado" ? -1 : PASOS.findIndex((p) => p.clave === t.estado);
  const folio = folioTicket(t.folio);

  return (
    <>
      <Header items={[]} />
      <main className="wrap tk-main">
        {q.nuevo && (
          <div className="tk-ok">
            <span aria-hidden>✓</span>
            <div><b>Reporte enviado</b><small>Mantenimiento ya recibió el aviso. Guarda esta página para ver el avance.</small></div>
          </div>
        )}
        {q.sumado && (
          <div className="tk-ok">
            <span aria-hidden>✓</span>
            <div><b>Se agregó a este reporte</b><small>El equipo ya tenía un reporte abierto; tu información se sumó para no duplicarlo.</small></div>
          </div>
        )}

        <section className="tk-cab card">
          <div className="tk-cab-top">
            <span className="num tk-folio">{folio}</span>
            <span className={`pill ${ESTADOS[t.estado].clase}`}>{ESTADOS[t.estado].nombre}</span>
          </div>
          <h1>{t.equipo}</h1>
          <p className="sub">{t.sucursal} · {t.sintoma} · {VENDER[t.puede_vender].titulo}</p>

          {t.estado === "cancelado" ? (
            <p className="note warn">Reporte cancelado.</p>
          ) : (
            <ol className="tk-pasos">
              {PASOS.map((p, i) => (
                <li key={p.clave} className={i < idx ? "hecho" : i === idx ? "actual" : ""}>
                  <span className="tk-dot" aria-hidden>{i < idx || t.estado === "resuelto" ? "✓" : i + 1}</span>
                  <span>{p.nombre}{p.clave === "asignado" && t.tecnico && i <= idx ? `: ${t.tecnico}` : ""}</span>
                </li>
              ))}
            </ol>
          )}
          {t.hoja_folio && <p className="sub" style={{ margin: "10px 0 0" }}>Hoja de servicio <span className="num">#{t.hoja_folio}</span></p>}
        </section>

        <section className="card">
          <h3>Historial</h3>
          <ol className="tk-tl">
            {[...t.eventos].reverse().map((e, i) => (
              <li key={i} className={e.tipo}>
                <time>{fmt(e.creado)}</time>
                <p>{e.texto}</p>
              </li>
            ))}
          </ol>
        </section>

        {abierto && (
          <section className="card stack">
            <form action={comentarTicket} className="tk-coment">
              <input type="hidden" name="token" value={token} />
              <label className="field">
                Agregar un comentario para Mantenimiento
                <textarea name="texto" rows={2} maxLength={600} required placeholder="Ej. Ahora también gotea agua" />
              </label>
              <button className="btn">Enviar comentario</button>
            </form>
            <form action={cancelarTicket} className="tk-cancel">
              <input type="hidden" name="token" value={token} />
              <span className="sub" style={{ margin: 0 }}>¿El equipo ya funciona solo?</span>
              <button className="btn small">Ya funciona, cancelar reporte</button>
            </form>
          </section>
        )}

        <div className="tk-share">
          <CompartirEnlace texto={`Reporte ${folio} · ${t.equipo} (${t.sucursal}). Seguimiento:`} />
          {t.activo_id && <Link className="btn" href={`/a/${t.activo_id}`}>Ver el equipo</Link>}
        </div>
        <p className="tk-pie">Reportado por {t.reporta_nombre} hace {hace(t.creado)}. Esta página se actualiza al recargarla.</p>
      </main>
    </>
  );
}
