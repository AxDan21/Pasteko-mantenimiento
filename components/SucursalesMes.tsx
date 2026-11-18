"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { corto } from "@/components/Graficas";
import { mxn } from "@/lib/format";

export type TiendaMapa = { id: number; nombre: string; gasto: number; fallas: number; hist: number[] };
export type ZonaMapa = { zona: string; tiendas: TiendaMapa[] };
type Metrica = "gasto" | "fallas" | "ppf";

const ESCALA = ["#fce9bf", "#fab428", "#f2862c", "#ea5731", "#b7492c"];
const zonaCorta = (z: string) => z.replace(/^Zona\s*\d+\s*·\s*/i, "");
const zonaNum = (z: string) => z.match(/^Zona\s*(\d+)/i)?.[1] ?? "";
const plural = (n: number, s: string, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;

/** Sucursales del mes: columnas por tienda con movimiento, zonas plegables y franja de zonas sin movimiento. */
export default function SucursalesMes({ zonas, mes, mesNombre, meses }: { zonas: ZonaMapa[]; mes: string; mesNombre: string; meses: string[] }) {
  const [m, setM] = useState<Metrica>("gasto");
  const [cerradas, setCerradas] = useState<Record<string, boolean>>({});
  const [quieta, setQuieta] = useState<string | null>(null);

  const todas = useMemo(() => zonas.flatMap((z) => z.tiendas.map((t) => ({ ...t, zona: z.zona }))), [zonas]);
  const mov = todas.filter((t) => t.gasto > 0 || t.fallas > 0);
  const total = todas.reduce((s, t) => s + t.gasto, 0);
  const fallas = todas.reduce((s, t) => s + t.fallas, 0);
  const conGasto = todas.filter((t) => t.gasto > 0);
  const top = [...todas].sort((a, b) => b.gasto - a.gasto)[0];
  const pendientes = mov.filter((t) => t.fallas > 0 && t.gasto === 0);

  const val = (t: TiendaMapa) => (m === "gasto" ? t.gasto : m === "fallas" ? t.fallas : t.fallas ? t.gasto / t.fallas : 0);
  const fmt = (v: number) => (m === "fallas" ? String(v) : v ? corto(v) : "$0");
  const max = Math.max(1, ...mov.map(val));

  const activas = zonas.filter((z) => z.tiendas.some((t) => t.gasto > 0 || t.fallas > 0));
  const quietas = zonas.filter((z) => !z.tiendas.some((t) => t.gasto > 0 || t.fallas > 0));
  const nQuietas = todas.length - mov.length;

  const [sel, setSel] = useState<number | null>(null);
  const s = todas.find((t) => t.id === sel) ?? (top && top.gasto > 0 ? top : mov[0]) ?? null;
  const hmax = Math.max(1, ...(s?.hist ?? [1]));

  if (!todas.length) return <p className="sub">Aún no hay sucursales registradas.</p>;

  return (
    <div className="ms">
      <div className="ms-top">
        <p className="ms-resumen">
          {total > 0 ? (
            <>En {mesNombre} se gastaron <b>{mxn(total)}</b> en {plural(conGasto.length, "tienda")}, con {plural(fallas, "falla")}.{top && top.gasto > 0 && <> <b>{top.nombre}</b> fue la más cara ({corto(top.gasto)}).</>}</>
          ) : fallas > 0 ? (
            <>En {mesNombre} no hay gasto por tienda, pero sí {plural(fallas, "falla")}.</>
          ) : (
            <>En {mesNombre} no hay gasto ni fallas por tienda.</>
          )}
          {" "}<span className="ms-cuenta">{mov.length} de {todas.length} tiendas con movimiento.</span>
        </p>
        <div className="ms-seg" role="group" aria-label="Medir por">
          {([["gasto", "Gasto"], ["fallas", "Fallas"], ["ppf", "Gasto por falla"]] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={m === id} className={m === id ? "on" : ""} onClick={() => setM(id)}>{label}</button>
          ))}
        </div>
      </div>

      {pendientes.length > 0 && (
        <div className="ms-alerta">
          <span className="ms-alerta-ic" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v5M12 16.5v.5" /><circle cx="12" cy="12" r="9" /></svg>
          </span>
          <span className="ms-alerta-t">
            <b>{pendientes.length === 1 ? `${pendientes[0].nombre} tiene ${plural(pendientes[0].fallas, "falla")} sin gasto.` : `${pendientes.length} tiendas tienen fallas sin gasto.`}</b>{" "}
            Puede estar sin costo o faltar la factura.
          </span>
          {pendientes.slice(0, 3).map((p) => (
            <button key={p.id} type="button" className="btn small dark" onClick={() => setSel(p.id)}>Ver {p.nombre}</button>
          ))}
        </div>
      )}

      <div className="ms-cuerpo">
        <div className="ms-zonas">
          {activas.length > 0 && (
            <div className="ms-cab">
              <span className="ms-rot">Zonas con movimiento</span>
              <span className="ms-ley">
                <span>{m === "fallas" ? "0" : "$0"}</span>
                <span className="ms-ley-esc" aria-hidden="true">{ESCALA.map((c) => <i key={c} style={{ background: c }} />)}</span>
                <span>{fmt(max)}</span>
                <span className="ms-ley-f">· altura = {m === "gasto" ? "gasto" : m === "fallas" ? "fallas" : "gasto por falla"} · <i aria-hidden="true" /> = 1 falla</span>
              </span>
            </div>
          )}

          {activas.map((z) => {
            const ts = z.tiendas.filter((t) => t.gasto > 0 || t.fallas > 0).sort((a, b) => val(b) - val(a) || b.fallas - a.fallas);
            const g = z.tiendas.reduce((a, t) => a + t.gasto, 0);
            const f = z.tiendas.reduce((a, t) => a + t.fallas, 0);
            const pct = total ? Math.round((g / total) * 100) : 0;
            const abierta = !cerradas[z.zona];
            const resto = z.tiendas.length - ts.length;
            return (
              <div key={z.zona} className="ms-zona">
                <button type="button" className="ms-zbtn" aria-expanded={abierta} onClick={() => setCerradas({ ...cerradas, [z.zona]: abierta })}>
                  <span className="ms-anillo" style={{ background: `conic-gradient(var(--orange) ${pct}%, var(--line) 0)` }} aria-hidden="true"><span>{pct}%</span></span>
                  <span className="ms-ztxt">
                    <b>{zonaNum(z.zona) ? `Zona ${zonaNum(z.zona)} · ` : ""}{zonaCorta(z.zona)}</b>
                    <small>{ts.length} de {z.tiendas.length} tiendas con movimiento · {plural(f, "falla")}</small>
                  </span>
                  <b className="ms-ztot">{corto(g)}</b>
                  <span className={`ms-flecha${abierta ? " on" : ""}`} aria-hidden="true">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                  </span>
                </button>
                {abierta && (
                  <div className="ms-panel">
                    <div className="ms-graf">
                      <div className="ms-eje" aria-hidden="true">
                        <span>{fmt(max)}</span>
                        <span>{m === "fallas" ? String(Math.round((max / 2) * 10) / 10) : corto(max / 2)}</span>
                        <span>{m === "fallas" ? "0" : "$0"}</span>
                      </div>
                      <div className="ms-area">
                        <div className="ms-guias" aria-hidden="true"><i /><i /><i /></div>
                        <div className="ms-cols">
                          {ts.map((t, j) => {
                            const v = val(t);
                            const sinGasto = t.gasto === 0 && t.fallas > 0 && m !== "fallas";
                            const st = v > 0 ? Math.min(4, Math.floor((v / max) * 5 - 1e-9)) : -1;
                            const on = s?.id === t.id;
                            const alto = v > 0 ? Math.max(8, Math.round((v / max) * 180)) : 24;
                            return (
                              <button key={t.id} type="button" className={`ms-col${on ? " on" : ""}`} aria-pressed={on} onClick={() => setSel(t.id)}
                                aria-label={`${t.nombre}: ${mxn(t.gasto)}, ${plural(t.fallas, "falla")}`}>
                                <span className="ms-col-caja">
                                  {t.fallas > 0 && <span className="ms-dots" aria-hidden="true">{Array.from({ length: Math.min(6, t.fallas) }, (_, x) => <i key={x} />)}{t.fallas > 6 && <small>+{t.fallas - 6}</small>}</span>}
                                  <b className={`ms-col-v${sinGasto ? " sin" : ""}`}>{sinGasto ? "Sin gasto" : fmt(v)}</b>
                                  <span className={`ms-barra${sinGasto ? " sin" : ""}`} style={{ height: alto, background: sinGasto ? undefined : st < 0 ? "var(--line)" : ESCALA[st], animationDelay: `${j * 0.06}s` }} />
                                </span>
                                <span className="ms-col-n">{t.nombre}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <small className="ms-resto">{resto ? `Otras ${plural(resto, "tienda")} de la zona sin gasto ni fallas.` : "Todas las tiendas de la zona tuvieron movimiento."}</small>
                  </div>
                )}
              </div>
            );
          })}

          {quietas.length > 0 && (
            <div className="ms-quietas">
              <div className="ms-q-cab">
                <span className="ms-rot">{activas.length ? "Sin gasto ni fallas este mes" : "Ninguna zona tuvo movimiento"}</span>
                <small>{plural(nQuietas, "tienda")} sin movimiento · toca una zona para ver cuáles</small>
              </div>
              <div className="ms-q-chips">
                {quietas.map((z) => (
                  <button key={z.zona} type="button" className={`ms-q${quieta === z.zona ? " on" : ""}`} aria-expanded={quieta === z.zona} onClick={() => setQuieta(quieta === z.zona ? null : z.zona)}>
                    {zonaNum(z.zona) ? `Z${zonaNum(z.zona)} · ` : ""}{zonaCorta(z.zona)} <span>{z.tiendas.length}</span>
                  </button>
                ))}
              </div>
              {quieta && (
                <div className="ms-q-lista">
                  {zonas.find((z) => z.zona === quieta)?.tiendas.map((t) => <span key={t.id}><i aria-hidden="true" />{t.nombre}</span>)}
                </div>
              )}
            </div>
          )}
        </div>

        {s && (
          <aside className="ms-det" aria-live="polite">
            <div className="ms-det-cab">
              <div>
                <span className="ms-det-z">{s.zona.toUpperCase()}</span>
                <h4>{s.nombre}</h4>
              </div>
              <span className="ms-det-p">{total ? `${Math.round((s.gasto / total) * 100)}% del mes` : "—"}</span>
            </div>
            <div className="ms-det-kpis">
              <div><small>Gasto</small><b>{mxn(s.gasto)}</b></div>
              <div><small>Fallas</small><b>{s.fallas}</b></div>
              <div><small>Por falla</small><b>{s.fallas && s.gasto ? corto(s.gasto / s.fallas) : "—"}</b></div>
            </div>
            {s.fallas > 0 && s.gasto === 0 && (
              <div className="ms-det-aviso"><b>Falla sin gasto.</b> ¿Ya se atendió sin costo o falta registrar la factura?</div>
            )}
            <div className="ms-hist">
              <small>Gasto de los últimos 6 meses</small>
              <div className="ms-hist-cols">
                {s.hist.map((v, j) => (
                  <div key={j} className={j === s.hist.length - 1 ? "on" : ""}>
                    <span>{v ? corto(v) : "—"}</span>
                    <i style={{ height: Math.max(4, Math.round((v / hmax) * 80)) }} />
                    <small>{meses[j]}</small>
                  </div>
                ))}
              </div>
            </div>
            <div className="ms-det-acc">
              <Link className="btn primary" href={`/admin/gastos?mes=${mes}&zona=${encodeURIComponent(s.zona)}`}>Ver gastos de la zona</Link>
              <Link className="btn" href="/admin/hojas">Ver hojas</Link>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
