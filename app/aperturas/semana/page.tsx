import Link from "next/link";
import CopiarTexto from "@/components/CopiarTexto";
import { requireAperturas } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AP_COLS, cuando, estadoClase, IT_COLS, vistaApertura, type ApRow, type Fila, type ItemRow, type Vista } from "@/lib/aperturas";
import { ESTADOS, fechaCorta } from "@/lib/gantt";
import { diasEntre, hoy, sumarDias } from "@/lib/panel";
import { actualizarPaso } from "../actions";

export const metadata = { title: "Mi semana · Aperturas" };

type Pendiente = { v: Vista; r: Fila };

export default async function MiSemana({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const { puedeEditar } = await requireAperturas();
  const { vista } = await searchParams;
  const porApertura = vista === "apertura";
  const supabase = await createClient();
  const h = hoy(), limite = sumarDias(h, 7);
  const [{ data: a }, { data: it }] = await Promise.all([
    supabase.from("aperturas").select(AP_COLS).eq("modelo", "v2").eq("cerrada", false),
    supabase.from("apertura_items").select(IT_COLS), // todos: los hechos con fecha real mueven a los demás
  ]);
  const items = (it ?? []) as ItemRow[];
  const vistas = ((a ?? []) as ApRow[])
    .filter((x) => x.fecha_pago)
    .map((x) => vistaApertura(x, items.filter((i) => i.apertura_id === x.id), h));

  const pendientes: Pendiente[] = vistas
    .flatMap((v) => v.filas.map((r) => ({ v, r })))
    .filter(({ r }) => r.estado !== "hecho" && (r.fin <= limite || r.estado === "bloqueado"))
    .sort((x, y) => x.r.fin.localeCompare(y.r.fin));

  const grupos = new Map<string, Pendiente[]>();
  for (const p of pendientes) {
    for (const g of porApertura ? [p.v.ap.nombre] : p.r.areas) {
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g)!.push(p);
    }
  }
  const orden = [...grupos.entries()].sort(
    (x, y) => y[1].filter((p) => p.r.atraso).length - x[1].filter((p) => p.r.atraso).length || x[0].localeCompare(y[0], "es")
  );

  const vencidos = pendientes.filter((p) => p.r.atraso > 0).length;
  const deHoy = pendientes.filter((p) => p.r.fin === h).length;
  const bloqueados = pendientes.filter((p) => p.r.estado === "bloqueado").length;

  return (
    <main className="wrap">
      <div className="head-row">
        <div>
          <p className="eyebrow">Aperturas · del {fechaCorta(h)} al {fechaCorta(limite)}</p>
          <h1 className="page-h">Mi semana</h1>
        </div>
        <div className="seg-links">
          <Link href="/aperturas/semana" aria-current={!porApertura ? "page" : undefined}>Por área</Link>
          <Link href="/aperturas/semana?vista=apertura" aria-current={porApertura ? "page" : undefined}>Por apertura</Link>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi"><span className="s">Vencidos</span><span className="v" style={vencidos ? { color: "var(--bad)" } : undefined}>{vencidos}</span></div>
        <div className="kpi"><span className="s">Vencen hoy</span><span className="v">{deHoy}</span></div>
        <div className="kpi"><span className="s">Próximos 7 días</span><span className="v">{pendientes.length - vencidos - deHoy}</span></div>
        <div className="kpi"><span className="s">Bloqueados</span><span className="v" style={bloqueados ? { color: "var(--bad)" } : undefined}>{bloqueados}</span></div>
      </div>

      {!orden.length && (
        <div className="card"><h3>Semana despejada</h3><p className="sub">No hay pasos vencidos ni por vencer en los próximos 7 días.</p></div>
      )}

      <div className="sem-grid">
        {orden.map(([grupo, lista]) => (
          <section key={grupo} className="card sem-card">
            <div className="sem-head">
              <h3>{grupo}</h3>
              <span className="sub">{lista.length} {lista.length === 1 ? "pendiente" : "pendientes"}</span>
              {!porApertura && <CopiarTexto texto={mensaje(grupo, lista, h)} etiqueta="Copiar mensaje" className="btn small" />}
            </div>
            <ul className="sem-list">
              {lista.map(({ v, r }) => {
                const c = cuando(r.fin, h);
                return (
                  <li key={`${v.ap.id}-${r.clave ?? r.id}`} className={r.critica ? "crit" : undefined}>
                    <span className={`pill ${c.clase}`}>{c.texto}</span>
                    <div>
                      <b>{r.actividad.split(" · ")[0]}</b>
                      <small>
                        {porApertura ? r.responsable : <Link href={`/aperturas/${v.ap.id}`}>{v.ap.nombre}</Link>} · {fechaCorta(r.fin)}
                        {r.critica ? " · ruta crítica" : ""}
                      </small>
                      {r.estado !== "pendiente" && <span className={`pill ${estadoClase(r.estado)}`}>{ESTADOS[r.estado].texto}</span>}
                      {r.estado === "bloqueado" && r.motivo && <small className="gd-motivo">{r.motivo}</small>}
                    </div>
                    {puedeEditar && r.id && (
                      <div className="sem-acc no-print">
                        <form action={actualizarPaso}>
                          <Ocultos id={r.id} ap={v.ap.id} vista={vista} />
                          <input type="hidden" name="estado" value="hecho" />
                          <button className="btn small" type="submit">✓ Hecho</button>
                        </form>
                        {r.estado !== "en_proceso" && (
                          <form action={actualizarPaso}>
                            <Ocultos id={r.id} ap={v.ap.id} vista={vista} />
                            <input type="hidden" name="estado" value="en_proceso" />
                            <button className="link-btn" type="submit">En proceso</button>
                          </form>
                        )}
                        <details>
                          <summary className="link-btn">Bloquear</summary>
                          <form action={actualizarPaso} className="sem-bloq">
                            <Ocultos id={r.id} ap={v.ap.id} vista={vista} />
                            <input type="hidden" name="estado" value="bloqueado" />
                            <input className="mini-input" name="motivo" required placeholder="¿Por qué?" defaultValue={r.motivo ?? ""} aria-label="Motivo del bloqueo" />
                            <button className="btn small" type="submit">Guardar</button>
                          </form>
                        </details>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}

function Ocultos({ id, ap, vista }: { id: number; ap: number; vista?: string }) {
  return (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="apertura_id" value={ap} />
      <input type="hidden" name="volver" value={vista === "apertura" ? "/aperturas/semana?vista=apertura" : "/aperturas/semana"} />
    </>
  );
}

/** Mensaje listo para WhatsApp o correo, por área. */
function mensaje(area: string, lista: Pendiente[], h: string) {
  const lineas = lista.map(({ v, r }) => {
    const d = diasEntre(h, r.fin);
    const cuando = d < 0 ? `venció el ${fechaCorta(r.fin)} (${-d} ${-d === 1 ? "día" : "días"} de atraso)` : d === 0 ? "vence hoy" : `vence el ${fechaCorta(r.fin)}`;
    const extra = r.estado === "bloqueado" && r.motivo ? ` · bloqueado: ${r.motivo}` : "";
    return `• ${v.ap.nombre}: ${r.actividad.split(" · ")[0]} — ${cuando}${extra}`;
  });
  return [`Hola, equipo ${area}. Estos son los pendientes de aperturas de esta semana:`, "", ...lineas, "", "¿Me confirman avance o fecha compromiso? Gracias."].join("\n");
}
