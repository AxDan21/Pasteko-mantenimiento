"use client";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { useFormStatus } from "react-dom";
import { actualizarPaso } from "@/app/aperturas/actions";
import type { Fila } from "@/lib/aperturas";
import { corto, ESTADOS, FASES, fechaCorta, ORDEN_FASES, type EstadoPaso } from "@/lib/gantt";
import { diasEntre, sumarDias } from "@/lib/panel";

type Props = {
  aperturaId: number;
  filas: Fila[];
  ini: string;
  fin: string;
  hoy: string;
  meta: string;
  puedeEditar: boolean;
  inicial?: string;
};

const MOTIVOS = ["Proveedor", "Pago pendiente", "Permisos", "Obra atrasada", "Otro"];
const ESTADOS_ORDEN: EstadoPaso[] = ["pendiente", "en_proceso", "bloqueado", "hecho"];
const keyDe = (r: Fila) => r.clave ?? `x${r.id}`;

export default function GanttTablero({ aperturaId, filas, ini, fin, hoy, meta, puedeEditar, inicial }: Props) {
  const total = Math.max(1, diasEntre(ini, fin));
  const PX = Math.max(12, Math.min(22, Math.round(860 / total)));
  const x = (f: string) => diasEntre(ini, f) * PX;
  const semanas = useMemo(() => {
    const s: string[] = [];
    for (let d = sumarDias(ini, 2); d <= fin; d = sumarDias(d, 7)) s.push(d);
    return s;
  }, [ini, fin]);
  const porDefecto = inicial && filas.some((r) => keyDe(r) === inicial)
    ? inicial
    : keyDe(filas.find((r) => r.estado !== "hecho" && r.atraso > 0) ?? filas.find((r) => r.estado !== "hecho") ?? filas[0]);
  const [sel, setSel] = useState(porDefecto);
  const panel = useRef<HTMLElement>(null);
  const actual = filas.find((r) => keyDe(r) === sel) ?? filas[0];

  const elegir = (k: string) => {
    setSel(k);
    if (window.matchMedia("(max-width: 980px)").matches) {
      requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const grupos = ORDEN_FASES.map((f) => ({ f, pasos: filas.filter((r) => r.fase === f) })).filter((g) => g.pasos.length);
  const ancho = total * PX;

  return (
    <div className="gx">
      <section className="gx-chart" aria-label="Gantt de la apertura">
        <div className="gx-legend">
          <span><i className="gx-sw solid" /> Hecho</span>
          <span><i className="gx-sw open" /> Pendiente</span>
          <span><i className="gx-sw bad" /> Vencido o bloqueado</span>
          <span><b className="gx-crit">Crítico</b> sin margen: si se atrasa, se atrasa la apertura</span>
          <span><i className="gx-sw hoy" /> Hoy</span>
          <span><i className="gx-sw meta" /> Meta</span>
        </div>
        <div className="gx-scroll">
          <div className="gx-inner" style={{ width: 300 + ancho }}>
            <div className="gx-row gx-head">
              <span className="gx-label gx-th">Paso</span>
              <div className="gx-track" style={{ width: ancho }}>
                {semanas.map((s) => <span key={s} className="gx-tick" style={{ left: x(s) }}>{fechaCorta(s)}</span>)}
                {hoy >= ini && hoy <= fin && <span className="gx-hoy-tag" style={{ left: x(hoy) }}>HOY</span>}
              </div>
            </div>
            {grupos.map(({ f, pasos }) => {
              const fase = FASES[f];
              const listos = pasos.filter((r) => r.estado === "hecho").length;
              return (
                <div key={f} style={{ "--fase": fase.color } as CSSProperties}>
                  <div className="gx-row gx-group">
                    <span className="gx-label"><i className="gx-dot" /> <b>{fase.nombre}</b> <small>{listos} de {pasos.length}</small></span>
                    <span />
                  </div>
                  {pasos.map((r) => {
                    const k = keyDe(r);
                    const malo = r.atraso > 0 || r.estado === "bloqueado";
                    const clase = r.estado === "hecho" ? "solid" : malo ? "bad" : "open";
                    const est = etiqueta(r, hoy);
                    return (
                      <button key={k} type="button" className={`gx-row gx-step${sel === k ? " sel" : ""}${r.estado === "hecho" ? " done" : ""}`} aria-pressed={sel === k} onClick={() => elegir(k)}>
                        <span className="gx-label">
                          <span className="gx-name">
                            <b>{corto(r.actividad)}</b>
                            {r.critica && r.estado !== "hecho" && <b className="gx-crit">Crítico</b>}
                          </span>
                          <span className="gx-meta">
                            <span className={`pill ${est.clase}`}>{est.texto}</span>
                            <span>{r.responsable} · {r.duracion > 0 ? `${fechaCorta(r.inicio)} – ${fechaCorta(r.fin)}` : fechaCorta(r.fin)}</span>
                          </span>
                        </span>
                        <span className="gx-track" style={{ width: ancho }}>
                          {semanas.map((s) => <i key={s} className="gx-week" style={{ left: x(s) }} />)}
                          {meta >= ini && meta <= fin && <i className="gx-metaline" style={{ left: x(meta) }} />}
                          {hoy >= ini && hoy <= fin && <i className="gx-hoyline" style={{ left: x(hoy) }} />}
                          {r.duracion > 0 ? (
                            <i className={`gx-bar ${clase}`} style={{ left: x(r.inicio), width: Math.max(8, x(r.fin) - x(r.inicio)) }}>
                              {r.estado === "en_proceso" && <em>{avanceObra(r, hoy)}%</em>}
                            </i>
                          ) : (
                            <>
                              <i className={`gx-diamond ${clase}`} style={{ left: x(r.fin) }} />
                              <em className="gx-date" style={{ left: x(r.fin) + 12 }}>{fechaCorta(r.fin)}</em>
                            </>
                          )}
                          {r.estado === "hecho" && r.fecha_real && r.fecha_real !== r.fin && <i className="gx-real" style={{ left: x(r.fecha_real) }} title={`Real ${fechaCorta(r.fecha_real)}`} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <aside ref={panel} className="gx-panel" aria-label="Detalle del paso" style={{ "--fase": FASES[actual.fase].color } as CSSProperties}>
        <PanelPaso key={keyDe(actual)} r={actual} aperturaId={aperturaId} hoy={hoy} puedeEditar={puedeEditar} />
      </aside>
    </div>
  );
}

function etiqueta(r: Fila, hoy: string) {
  if (r.estado === "hecho") return { texto: "Hecho", clase: "ok" };
  if (r.atraso > 0) return { texto: `Vencido ${r.atraso} d`, clase: "bad" };
  if (r.estado === "bloqueado") return { texto: "Bloqueado", clase: "bad" };
  if (r.fin === hoy) return { texto: "Hoy", clase: "warn" };
  if (r.estado === "en_proceso") return { texto: "En proceso", clase: "info" };
  return { texto: "Pendiente", clase: "neutral" };
}
const avanceObra = (r: Fila, hoy: string) =>
  Math.max(0, Math.min(100, Math.round((diasEntre(r.inicio, hoy) / Math.max(1, r.duracion)) * 100)));

function Guardar() {
  const { pending } = useFormStatus();
  return <button className="gx-save" type="submit" disabled={pending}>{pending ? "Guardando…" : "Guardar y recalcular"}</button>;
}

function PanelPaso({ r, aperturaId, hoy, puedeEditar }: { r: Fila; aperturaId: number; hoy: string; puedeEditar: boolean }) {
  const [estado, setEstado] = useState<EstadoPaso>(r.estado);
  const [cuando, setCuando] = useState<"hoy" | "ayer" | "otra">(r.fecha_real && r.fecha_real !== hoy ? "otra" : "hoy");
  const [real, setReal] = useState(r.fecha_real ?? hoy);
  const previo = MOTIVOS.find((m) => r.motivo === m || r.motivo?.startsWith(`${m}: `)) ?? "";
  const [motivo, setMotivo] = useState(previo);
  const [detalle, setDetalle] = useState(!r.motivo ? "" : previo ? r.motivo.slice(previo.length).replace(/^:\s*/, "") : r.motivo);
  const [fija, setFija] = useState(!!r.fecha_fija);

  const fechaReal = cuando === "hoy" ? hoy : cuando === "ayer" ? sumarDias(hoy, -1) : real;
  const motivoFinal = [motivo, detalle.trim()].filter(Boolean).join(": ");
  const fase = FASES[r.fase];
  const fijable = !!r.clave && r.clave !== "pago" && r.clave !== "apertura";
  const margen =
    r.holgura === null
      ? { t: r.post ? "Después de abrir" : "Sin dependencias", c: "neutral", d: r.post ? "Ocurre después de la apertura suave: no la puede retrasar." : "Paso con fecha manual; no mueve a otros." }
      : r.holgura <= 0
        ? { t: "Sin margen", c: "crit", d: "Ruta crítica: cada día que se atrase este paso, la apertura suave se mueve un día." }
        : { t: `${r.holgura} días`, c: "ok", d: `Puede atrasarse hasta ${r.holgura} ${r.holgura === 1 ? "día" : "días"} sin mover la apertura suave. Desde el día ${r.holgura + 1} de atraso, la apertura se recorre.` };

  return (
    <>
      <div className="gx-p-head">
        <span className="gx-p-fase">{fase.nombre}</span>
        <h2>{r.actividad}</h2>
        <div className="gx-chips">{r.areas.map((a) => <span key={a}>{a}</span>)}</div>
      </div>
      <div className="gx-p-body">
        <div className="gx-facts">
          <div><span>Fecha planeada</span><b>{r.duracion > 0 ? `${fechaCorta(r.inicio)} – ${fechaCorta(r.fin)}` : fechaCorta(r.fin)}</b>{r.desvio !== 0 && <small className={r.desvio > 0 ? "bad" : undefined}>{r.desvio > 0 ? "+" : ""}{r.desvio} d vs plan original</small>}</div>
          <div className={`m-${margen.c}`}><span>Margen</span><b>{margen.t}</b></div>
        </div>
        <p className="gx-impact">{margen.d}</p>

        {!puedeEditar || !r.id ? (
          <div className="gx-ro">
            <span className={`pill ${etiqueta(r, hoy).clase}`}>{etiqueta(r, hoy).texto}</span>
            {r.estado === "hecho" && r.fecha_real && <span>Terminado el {fechaCorta(r.fecha_real)}</span>}
            {r.estado === "bloqueado" && r.motivo && <span>Motivo: {r.motivo}</span>}
          </div>
        ) : (
          <form action={actualizarPaso} className="gx-form">
            <input type="hidden" name="id" value={r.id} />
            <input type="hidden" name="apertura_id" value={aperturaId} />
            <input type="hidden" name="volver" value={`/aperturas/${aperturaId}?paso=${r.clave ?? `x${r.id}`}`} />
            <input type="hidden" name="estado" value={estado} />
            <input type="hidden" name="fecha_real" value={fechaReal} />
            <input type="hidden" name="motivo" value={motivoFinal} />

            <fieldset>
              <legend>¿Cómo va?</legend>
              <div className="gx-states">
                {ESTADOS_ORDEN.map((e) => (
                  <button key={e} type="button" className={`gx-state s-${e}`} aria-pressed={estado === e} onClick={() => setEstado(e)}>
                    <i />{ESTADOS[e].texto}
                  </button>
                ))}
              </div>
            </fieldset>

            {estado === "hecho" && (
              <fieldset>
                <legend>¿Cuándo se terminó?</legend>
                <div className="gx-chiprow">
                  {(["hoy", "ayer", "otra"] as const).map((q) => (
                    <button key={q} type="button" className="gx-chip" aria-pressed={cuando === q} onClick={() => setCuando(q)}>
                      {q === "hoy" ? "Hoy" : q === "ayer" ? "Ayer" : "Otra fecha"}
                    </button>
                  ))}
                </div>
                {cuando === "otra" && (
                  <label className="field">Fecha real<input type="date" value={real} max={hoy} onChange={(e) => setReal(e.target.value)} /></label>
                )}
              </fieldset>
            )}

            {estado === "bloqueado" && (
              <fieldset>
                <legend>¿Qué lo detiene?</legend>
                <div className="gx-chiprow">
                  {MOTIVOS.map((m) => (
                    <button key={m} type="button" className="gx-chip bad" aria-pressed={motivo === m} onClick={() => setMotivo(m)}>{m}</button>
                  ))}
                </div>
                <label className="field">Detalle <span className="hint">opcional</span>
                  <input value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Ej. el proveedor no confirma la visita" />
                </label>
              </fieldset>
            )}

            {fijable && (
              <div className="gx-toggle">
                <label>
                  <span><b>Fecha especial</b><small>Reemplaza la fecha calculada y recorre lo que depende</small></span>
                  <input type="checkbox" checked={fija} onChange={(e) => setFija(e.target.checked)} />
                </label>
                {fija ? (
                  <input className="gx-date-in" type="date" name="fecha_fija" defaultValue={r.fecha_fija ?? r.fin} required aria-label="Fecha especial" />
                ) : (
                  <input type="hidden" name="fecha_fija" value="" />
                )}
              </div>
            )}
            {!r.clave && (
              <label className="field">Fecha<input type="date" name="fecha" defaultValue={r.fin} /></label>
            )}

            <details className="gx-more">
              <summary>Más opciones</summary>
              <div className="gx-more-grid">
                {r.clave && r.clave !== "apertura" && r.clave !== "pago" && (
                  <label className="field">Duración (días) <span className="hint">vacío = normal</span>
                    <input name="duracion" type="number" min={0} max={365} placeholder={String(r.duracion)} defaultValue={r.dur_manual ?? ""} />
                  </label>
                )}
                <label className="field">Responsable<input name="responsable" defaultValue={r.responsable} /></label>
              </div>
            </details>

            <Guardar />
          </form>
        )}

        <dl className="gx-deps">
          <dt>Depende de</dt><dd>{r.depende}</dd>
          <dt>Si se mueve, recorre</dt><dd>{r.mueve}</dd>
        </dl>
      </div>
    </>
  );
}
