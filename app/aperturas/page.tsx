import Link from "next/link";
import type { CSSProperties } from "react";
import { requireAperturas } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AP_COLS, cuando, IT_COLS, NOMBRES_FASE_ACTUAL, vistaApertura, type ApRow, type ItemRow, type Vista } from "@/lib/aperturas";
import { corto, fechaCorta } from "@/lib/gantt";
import { diasEntre, hoy, MESES_LARGOS, sumarDias } from "@/lib/panel";
import { convertirApertura } from "./actions";

export const metadata = { title: "Aperturas · Pasteko" };

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const SEM = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)", neutral: "var(--muted)" } as const;
const corta = (n: string) => n.replace(/^Pasteko\s*-\s*/i, "");

export default async function Portafolio({ searchParams }: { searchParams: Promise<{ error?: string; cerradas?: string }> }) {
  const { puedeEditar } = await requireAperturas();
  const f = await searchParams;
  const supabase = await createClient();
  const h = hoy();
  const [{ data: a }, { data: it }] = await Promise.all([
    supabase.from("aperturas").select(AP_COLS).order("fecha"),
    supabase.from("apertura_items").select(IT_COLS).order("orden").order("id"),
  ]);
  const aps = (a ?? []) as ApRow[];
  const items = (it ?? []) as ItemRow[];
  const deAp = (id: number) => items.filter((x) => x.apertura_id === id);

  const vistas = aps.filter((x) => x.modelo === "v2" && x.fecha_pago).map((x) => vistaApertura(x, deAp(x.id), h));
  const activas = vistas.filter((v) => !v.ap.cerrada).sort((x, y) => x.aperturaProyectada.localeCompare(y.aperturaProyectada));
  const cerradas = vistas.filter((v) => v.ap.cerrada);
  const anteriores = aps.filter((x) => x.modelo === "v1" || !x.fecha_pago);

  const riesgo = activas.filter((v) => v.riesgo > 0);
  const vencidos = activas.flatMap((v) => v.filas.filter((r) => r.atraso > 0));
  const semana = activas.reduce((s, v) => s + v.filas.filter((r) => r.estado !== "hecho" && r.fin >= h && r.fin <= sumarDias(h, 7)).length, 0);
  const areasVenc = Array.from(new Set(vencidos.flatMap((r) => r.areas))).slice(0, 2).join(" y ");
  const franq = activas.filter((v) => v.ap.tipo === "Franquicia").length;

  const [y, m, d] = h.split("-").map(Number);
  const fechaHoy = `${DIAS[new Date(y, m - 1, d).getDay()]} ${d} de ${MESES_LARGOS[m - 1]}`;
  const titular = !activas.length
    ? "Sin aperturas en curso"
    : `${activas.length} ${activas.length === 1 ? "apertura" : "aperturas"} en curso`;
  const bajada = riesgo.length
    ? `${riesgo.length === 1 ? "Una necesita" : `${riesgo.length} necesitan`} decisión: ${riesgo.map((v) => `${corta(v.ap.nombre)} abre ${v.riesgo} ${v.riesgo === 1 ? "día" : "días"} tarde`).join(", ")}.`
    : vencidos.length
      ? `Ninguna en riesgo, pero hay ${vencidos.length} ${vencidos.length === 1 ? "paso vencido" : "pasos vencidos"} con margen.`
      : activas.length ? "Todo va en tiempo." : puedeEditar ? "Crea la primera: el Gantt se arma solo a partir del pago de equipos." : "Cuando haya aperturas en curso aparecerán aquí.";

  return (
    <main className="wrap ax">
      <div className="ax-head">
        <div>
          <p className="ax-eyebrow">{fechaHoy}</p>
          <h1 className="ax-h1">{titular}</h1>
          <p className="ax-lede">{bajada}</p>
        </div>
        <div className="ax-actions">
          {cerradas.length > 0 && (
            <Link className="btn small" href={f.cerradas ? "/aperturas" : "/aperturas?cerradas=1"}>
              {f.cerradas ? "Ocultar cerradas" : `Cerradas (${cerradas.length})`}
            </Link>
          )}
          {puedeEditar && (
            <Link className="ax-cta" href="/aperturas/nueva">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              Nueva apertura
            </Link>
          )}
        </div>
      </div>
      {f.error && <div className="ax-alert bad"><div><b>{f.error}</b></div></div>}

      <div className="ax-kpis">
        <Kpi v={activas.length} t="En curso" s={`${franq} ${franq === 1 ? "franquicia" : "franquicias"}, ${activas.length - franq} ${activas.length - franq === 1 ? "propia" : "propias"}`} tono="brand" />
        <Kpi v={riesgo.length} t="En riesgo" s={riesgo.length ? riesgo.map((v) => `${corta(v.ap.nombre)} +${v.riesgo} d`).join(", ") : "Ninguna retrasa su apertura"} tono={riesgo.length ? "bad" : "ok"} />
        <Kpi v={vencidos.length} t="Vencidos" s={vencidos.length ? areasVenc : "Nada vencido"} tono={vencidos.length ? "warn" : "ok"} href="/aperturas/semana?f=vencidos" />
        <Kpi v={semana} t="Esta semana" s={`Vencen antes del ${fechaCorta(sumarDias(h, 7))}`} tono="ok" href="/aperturas/semana" />
      </div>

      {activas.length > 0 && <Calendario vistas={activas} hoy={h} />}

      {activas.length > 0 && (
        <div className="ax-cards">{activas.map((v) => <Tarjeta key={v.ap.id} v={v} hoy={h} />)}</div>
      )}

      {f.cerradas && cerradas.length > 0 && (
        <>
          <h2 className="ax-h2">Cerradas</h2>
          <div className="ax-cards">{cerradas.map((v) => <Tarjeta key={v.ap.id} v={v} hoy={h} />)}</div>
        </>
      )}

      {anteriores.length > 0 && (
        <section className="ax-card" style={{ marginTop: 20 }}>
          <h3>Formato anterior</h3>
          <p className="sub">Se capturaron antes de las dependencias. {puedeEditar ? "Al convertirlas se conservan los pasos que ya estaban hechos." : ""}</p>
          {anteriores.map((x) => {
            const pagoViejo = deAp(x.id).find((i) => /pago/i.test(i.texto))?.fecha ?? "";
            return (
              <div key={x.id} className="ax-v1">
                <div><b>{x.nombre}</b><small>{x.tipo} · apertura suave {fechaCorta(x.fecha)}</small></div>
                {puedeEditar && (
                  <form action={convertirApertura} className="inline-form">
                    <input type="hidden" name="id" value={x.id} />
                    <label className="field">Pago de equipos<input name="fecha_pago" type="date" required defaultValue={pagoViejo} /></label>
                    <label className="inline-check"><input type="checkbox" name="lleva_bebidas" defaultChecked /> Lleva bebidas</label>
                    <button className="btn small" type="submit">Convertir</button>
                  </form>
                )}
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}

function Kpi({ v, t, s, tono, href }: { v: number; t: string; s: string; tono: "brand" | "bad" | "warn" | "ok"; href?: string }) {
  const cuerpo = (
    <>
      <span className={`ax-kpi-v t-${tono}`}>{v}</span>
      <span className="ax-kpi-t"><b>{t}</b><small>{s}</small></span>
    </>
  );
  return href ? <Link className="ax-kpi" href={href}>{cuerpo}</Link> : <div className="ax-kpi">{cuerpo}</div>;
}

function Tarjeta({ v, hoy: h }: { v: Vista; hoy: string }) {
  const pct = v.total ? Math.round((v.hechos / v.total) * 100) : 0;
  const faltan = diasEntre(h, v.aperturaProyectada);
  const color = SEM[v.semaforo.clase];
  const C = 2 * Math.PI * 36;
  const sig = v.siguiente;
  const c = sig ? cuando(sig.fin, h) : null;
  return (
    <Link href={`/aperturas/${v.ap.id}`} className="ax-ap" style={{ "--sem": color } as CSSProperties}>
      <div className="ax-ap-top">
        <span><b>{corta(v.ap.nombre)}</b><small>{v.ap.tipo} · {v.ap.lleva_bebidas ? "con bebidas" : "sin bebidas"}</small></span>
        <span className={`pill ${v.semaforo.clase}`}>{v.semaforo.texto}</span>
      </div>
      <div className="ax-ap-mid">
        <div className="ax-ring">
          <svg width="88" height="88" viewBox="0 0 88 88" role="img" aria-label={`${pct}% de avance`}>
            <circle cx="44" cy="44" r="36" fill="none" stroke="var(--surface-2)" strokeWidth="10" />
            <circle cx="44" cy="44" r="36" fill="none" stroke="var(--sem)" strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(C * pct) / 100} ${C}`} transform="rotate(-90 44 44)" />
          </svg>
          <span><b>{pct}%</b><small>{v.hechos} de {v.total}</small></span>
        </div>
        <dl className="ax-ap-dates">
          <div><dt>Meta</dt><dd>{fechaCorta(v.meta)}</dd></div>
          <div className={v.riesgo > 0 ? "bad" : undefined}><dt>Proyectada</dt><dd>{fechaCorta(v.aperturaProyectada)}</dd></div>
        </dl>
      </div>
      <div className="ax-phases">
        <div>
          {NOMBRES_FASE_ACTUAL.map((n, i) => (
            <i key={n} className={i < v.faseActual ? "done" : i === v.faseActual ? "now" : undefined} title={n} />
          ))}
        </div>
        <span>
          <span>Fase: <b>{v.faseActual >= 5 ? "Abierta" : NOMBRES_FASE_ACTUAL[v.faseActual]}</b></span>
          <span>{v.ap.cerrada ? "Cerrada" : faltan >= 0 ? `Faltan ${faltan} días` : `Abrió hace ${-faltan} días`}</span>
        </span>
      </div>
      {sig && c && !v.ap.cerrada && (
        <div className={`ax-next n-${sig.estado === "bloqueado" ? "bad" : c.clase}`}>
          <i aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
          </i>
          <span>
            <b>{corto(sig.actividad)}</b>
            <small>{c.texto}{sig.estado === "bloqueado" && sig.motivo ? ` · bloqueado: ${sig.motivo}` : ` · ${sig.responsable}`}</small>
          </span>
        </div>
      )}
    </Link>
  );
}

/** Todas las aperturas en un calendario: compras → obra → arranque, meta y hoy. */
function Calendario({ vistas, hoy: h }: { vistas: Vista[]; hoy: string }) {
  const ini = sumarDias(vistas.map((v) => v.cfg.fecha_pago).sort()[0], -3);
  const fin = sumarDias(vistas.map((v) => (v.aperturaProyectada > v.meta ? v.aperturaProyectada : v.meta)).sort().reverse()[0], 6);
  const total = Math.max(1, diasEntre(ini, fin));
  const x = (f: string) => Math.min(100, Math.max(0, (diasEntre(ini, f) / total) * 100));
  const meses: string[] = [];
  for (let mm = `${ini.slice(0, 7)}-01`; mm <= fin; mm = `${sumarDias(mm, 32).slice(0, 7)}-01`) if (mm > ini) meses.push(mm);

  return (
    <section className="ax-card ax-cal" aria-label="Calendario de aperturas">
      <div className="ax-cal-head">
        <h2>Todas las aperturas en el calendario</h2>
        <div className="ax-legend">
          <span><i className="lg compras" />Compras y proveedor</span>
          <span><i className="lg obra" />Obra</span>
          <span><i className="lg cap" />Capacitación y arranque</span>
          <span><i className="lg meta" />Meta</span>
          <span><i className="lg hoy" />Hoy</span>
        </div>
      </div>
      <div className="ax-cal-scroll">
        <div className="ax-cal-grid">
          <div className="ax-lane ax-lane-scale">
            <span />
            <div className="ax-lane-track">
              {meses.map((mm) => <span key={mm} className="ax-month" style={{ left: `${x(mm)}%` }}>{MESES_LARGOS[Number(mm.slice(5, 7)) - 1]}</span>)}
            </div>
          </div>
          {vistas.map((v) => {
            const o = v.filas.find((r) => r.clave === "obra");
            const color = SEM[v.semaforo.clase];
            return (
              <Link key={v.ap.id} href={`/aperturas/${v.ap.id}`} className="ax-lane">
                <span className="ax-lane-name"><b>{corta(v.ap.nombre)}</b><small style={{ color }}>{v.semaforo.texto}</small></span>
                <div className="ax-lane-track">
                  {meses.map((mm) => <i key={mm} className="ax-sep" style={{ left: `${x(mm)}%` }} />)}
                  {o && <i className="ax-seg compras" style={{ left: `${x(v.cfg.fecha_pago)}%`, width: `${x(o.inicio) - x(v.cfg.fecha_pago)}%` }} title={`Pago ${fechaCorta(v.cfg.fecha_pago)}`} />}
                  {o && <i className="ax-seg obra" style={{ left: `${x(o.inicio)}%`, width: `${x(o.fin) - x(o.inicio)}%` }} title={`Obra ${fechaCorta(o.inicio)} – ${fechaCorta(o.fin)}`} />}
                  {o && <i className="ax-seg cap" style={{ left: `${x(o.fin)}%`, width: `${Math.max(0.6, x(v.aperturaProyectada) - x(o.fin))}%` }} />}
                  <i className="ax-meta" style={{ left: `${x(v.meta)}%` }} title={`Meta ${fechaCorta(v.meta)}`} />
                  <span className="ax-pin" style={{ left: `${x(v.aperturaProyectada)}%`, background: color }} title={`Apertura proyectada ${fechaCorta(v.aperturaProyectada)}`}>{corta(v.ap.nombre).charAt(0)}</span>
                  {h >= ini && h <= fin && <i className="ax-today" style={{ left: `${x(h)}%` }} />}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
