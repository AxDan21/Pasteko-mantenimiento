import Link from "next/link";
import type { CSSProperties } from "react";
import CopiarTexto from "@/components/CopiarTexto";
import { requireAperturas } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AP_COLS, cuando, IT_COLS, vistaApertura, type ApRow, type Fila, type ItemRow, type Vista } from "@/lib/aperturas";
import { corto, fechaCorta } from "@/lib/gantt";
import { diasEntre, hoy, sumarDias } from "@/lib/panel";
import { actualizarPaso } from "../actions";

export const metadata = { title: "Mi semana · Aperturas" };

type Pendiente = { v: Vista; r: Fila; color: string };
const COLORES = ["#fd7a0f", "#2f6fdb", "#0f8a7e", "#7a4fd6", "#c2337a", "#a35a00"];
const MOTIVOS = ["Proveedor", "Pago pendiente", "Permisos", "Obra atrasada", "Otro"];
const FILTROS = [
  ["todo", "Todo"],
  ["vencidos", "Vencidos"],
  ["hoy", "Hoy"],
  ["bloqueados", "Bloqueados"],
] as const;
const corta = (n: string) => n.replace(/^Pasteko\s*-\s*/i, "");

export default async function MiSemana({ searchParams }: { searchParams: Promise<{ vista?: string; f?: string }> }) {
  const { puedeEditar } = await requireAperturas();
  const sp = await searchParams;
  const porApertura = sp.vista === "apertura";
  const filtro = FILTROS.some(([k]) => k === sp.f) ? sp.f! : "todo";
  const supabase = await createClient();
  const h = hoy(), limite = sumarDias(h, 7);
  const [{ data: a }, { data: it }] = await Promise.all([
    supabase.from("aperturas").select(AP_COLS).eq("modelo", "v2").eq("cerrada", false).order("fecha"),
    supabase.from("apertura_items").select(IT_COLS), // todos: los hechos con fecha real mueven a los demás
  ]);
  const items = (it ?? []) as ItemRow[];
  const vistas = ((a ?? []) as ApRow[])
    .filter((x) => x.fecha_pago)
    .map((x) => vistaApertura(x, items.filter((i) => i.apertura_id === x.id), h));

  const todos: Pendiente[] = vistas
    .flatMap((v, i) => v.filas.map((r) => ({ v, r, color: COLORES[i % COLORES.length] })))
    .filter(({ r }) => r.estado !== "hecho" && (r.fin <= limite || r.estado === "bloqueado"))
    .sort((x, y) => x.r.fin.localeCompare(y.r.fin));
  const pasa = ({ r }: Pendiente) =>
    filtro === "vencidos" ? r.atraso > 0 : filtro === "hoy" ? r.fin === h : filtro === "bloqueados" ? r.estado === "bloqueado" : true;
  const lista = todos.filter(pasa);
  const cuenta = {
    todo: todos.length,
    vencidos: todos.filter((p) => p.r.atraso > 0).length,
    hoy: todos.filter((p) => p.r.fin === h).length,
    bloqueados: todos.filter((p) => p.r.estado === "bloqueado").length,
  } as Record<string, number>;

  const grupos = new Map<string, Pendiente[]>();
  for (const p of lista) {
    for (const g of porApertura ? [corta(p.v.ap.nombre)] : p.r.areas) {
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g)!.push(p);
    }
  }
  const orden = [...grupos.entries()].sort(
    (x, y) => y[1].filter((p) => p.r.atraso).length - x[1].filter((p) => p.r.atraso).length || x[0].localeCompare(y[0], "es")
  );
  const url = (cambios: { f?: string; vista?: string }) => {
    const q = new URLSearchParams();
    const f = cambios.f ?? filtro, v = cambios.vista ?? (porApertura ? "apertura" : "");
    if (f !== "todo") q.set("f", f);
    if (v) q.set("vista", v);
    const s = q.toString();
    return `/aperturas/semana${s ? `?${s}` : ""}`;
  };
  const volver = url({});
  const todosLosMensajes = porApertura ? "" : orden.map(([g, l]) => mensaje(g, l, h)).join("\n\n— — —\n\n");

  return (
    <main className="wrap ax">
      <section className="sx-band">
        <div className="sx-band-top">
          <div>
            <p className="ax-eyebrow sx-eyebrow">{fechaCorta(h)} – {fechaCorta(limite)}</p>
            <h1 className="ax-h1">Mi semana</h1>
          </div>
          <div className="sx-count"><b>{cuenta.todo}</b><span>pendientes</span></div>
        </div>
        <div className="sx-controls">
          <nav className="sx-filters" aria-label="Filtro">
            {FILTROS.map(([k, t]) => (
              <Link key={k} href={url({ f: k })} aria-current={filtro === k ? "page" : undefined}>{t} · {cuenta[k]}</Link>
            ))}
          </nav>
          <nav className="sx-seg" aria-label="Agrupar">
            <Link href={url({ vista: "" })} aria-current={!porApertura ? "page" : undefined}>Por área</Link>
            <Link href={url({ vista: "apertura" })} aria-current={porApertura ? "page" : undefined}>Por apertura</Link>
          </nav>
        </div>
      </section>

      {!orden.length && (
        <div className="ax-card sx-empty">
          <h3>{filtro === "todo" ? "Semana despejada" : "Nada en este filtro"}</h3>
          <p className="sub">{filtro === "todo" ? "No hay pasos vencidos ni por vencer en los próximos 7 días." : "Prueba con otro filtro."}</p>
        </div>
      )}

      <div className="sx-grid">
        {orden.map(([grupo, ps]) => (
          <section key={grupo} className="sx-group">
            <div className="sx-group-head">
              <h2>{grupo}</h2>
              <span>{ps.length} {ps.length === 1 ? "pendiente" : "pendientes"}</span>
              {!porApertura && <CopiarTexto texto={mensaje(grupo, ps, h)} etiqueta="Copiar mensaje" className="btn small" />}
            </div>
            {ps.map(({ v, r, color }) => {
              const c = cuando(r.fin, h);
              return (
                <article key={`${v.ap.id}-${r.clave ?? r.id}`} className="sx-item" style={{ "--ap": color } as CSSProperties}>
                  <div className="sx-item-top">
                    <span>
                      <b>{corto(r.actividad)}</b>
                      <small>{porApertura ? r.responsable : <Link href={`/aperturas/${v.ap.id}?paso=${r.clave ?? `x${r.id}`}`}>{corta(v.ap.nombre)}</Link>} · {fechaCorta(r.fin)}</small>
                    </span>
                    <span className={`pill ${c.clase}`}>{c.texto}</span>
                  </div>
                  {r.estado === "bloqueado" && <p className="sx-bloq">Bloqueado{r.motivo ? `: ${r.motivo}` : ""}</p>}
                  {r.estado === "en_proceso" && <p className="sx-proc">En proceso</p>}
                  {r.critica && <p className="sx-crit">Ruta crítica · si se atrasa, se atrasa la apertura</p>}
                  {puedeEditar && r.id && (
                    <div className="sx-acts no-print">
                      <form action={actualizarPaso}>
                        <Ocultos id={r.id} ap={v.ap.id} volver={volver} />
                        <input type="hidden" name="estado" value="hecho" />
                        <button className="sx-done" type="submit">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
                          Hecho
                        </button>
                      </form>
                      {r.estado === "bloqueado" ? (
                        <form action={actualizarPaso}>
                          <Ocultos id={r.id} ap={v.ap.id} volver={volver} />
                          <input type="hidden" name="estado" value="en_proceso" />
                          <button className="sx-sec" type="submit">Desbloquear</button>
                        </form>
                      ) : (
                        <details className="sx-block">
                          <summary className="sx-sec">Bloquear</summary>
                          <form action={actualizarPaso}>
                            <Ocultos id={r.id} ap={v.ap.id} volver={volver} />
                            <input type="hidden" name="estado" value="bloqueado" />
                            <fieldset>
                              <legend>¿Qué lo detiene?</legend>
                              <div className="sx-motivos">
                                {MOTIVOS.map((m, i) => (
                                  <label key={m}><input type="radio" name="motivo" value={m} defaultChecked={i === 0} /><span>{m}</span></label>
                                ))}
                              </div>
                            </fieldset>
                            <button className="btn small" type="submit">Marcar bloqueado</button>
                          </form>
                        </details>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        ))}
      </div>

      {todosLosMensajes && (
        <div className="sx-copyall no-print">
          <CopiarTexto texto={todosLosMensajes} etiqueta="Copiar mensajes de todas las áreas" className="sx-copy-btn" />
        </div>
      )}
    </main>
  );
}

function Ocultos({ id, ap, volver }: { id: number; ap: number; volver: string }) {
  return (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="apertura_id" value={ap} />
      <input type="hidden" name="volver" value={volver} />
    </>
  );
}

/** Mensaje listo para WhatsApp o correo, por área. */
function mensaje(area: string, lista: Pendiente[], h: string) {
  const lineas = lista.map(({ v, r }) => {
    const d = diasEntre(h, r.fin);
    const cuandoTxt = d < 0 ? `venció el ${fechaCorta(r.fin)} (${-d} ${-d === 1 ? "día" : "días"} de atraso)` : d === 0 ? "vence hoy" : `vence el ${fechaCorta(r.fin)}`;
    const extra = r.estado === "bloqueado" && r.motivo ? ` · bloqueado: ${r.motivo}` : "";
    return `• ${v.ap.nombre}: ${corto(r.actividad)} — ${cuandoTxt}${extra}`;
  });
  return [`Hola, equipo ${area}. Estos son los pendientes de aperturas de esta semana:`, "", ...lineas, "", "¿Me confirman avance o fecha compromiso? Gracias."].join("\n");
}
