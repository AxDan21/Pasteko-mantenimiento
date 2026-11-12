import Link from "next/link";
import { notFound } from "next/navigation";
import BotonImprimir from "@/components/BotonImprimir";
import CopiarTexto from "@/components/CopiarTexto";
import { requireAperturas } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AP_COLS, cuando, estadoClase, IT_COLS, vistaApertura, type ApRow, type Fila, type ItemRow } from "@/lib/aperturas";
import { ESTADOS, fechaCorta, tablaExcel } from "@/lib/gantt";
import { diasEntre, hoy, sumarDias } from "@/lib/panel";
import { actualizarApertura, actualizarPaso, agregarPasoExtra, borrarApertura, borrarPasoExtra } from "../actions";

export default async function DetalleApertura({ params }: { params: Promise<{ id: string }> }) {
  const { puedeEditar } = await requireAperturas();
  const { id } = await params;
  const supabase = await createClient();
  const h = hoy();
  const [{ data: ap }, { data: it }] = await Promise.all([
    supabase.from("aperturas").select(AP_COLS).eq("id", Number(id)).maybeSingle<ApRow>(),
    supabase.from("apertura_items").select(IT_COLS).eq("apertura_id", Number(id)).order("orden").order("id"),
  ]);
  if (!ap) notFound();
  if (ap.modelo !== "v2" || !ap.fecha_pago) {
    return (
      <main className="wrap">
        <div className="card"><h3>{ap.nombre}</h3><p className="sub">Esta apertura está en el formato anterior. {puedeEditar ? "Conviértela desde el portafolio indicando la fecha de pago de equipos." : ""}</p><Link className="btn small" href="/aperturas">Ir al portafolio</Link></div>
      </main>
    );
  }
  const v = vistaApertura(ap, (it ?? []) as ItemRow[], h);
  const volver = `/aperturas/${ap.id}`;
  const obra = v.filas.find((r) => r.clave === "obra");

  // Escala del Gantt: del pago a lo último (inauguración, meta o proyección)
  const ultimo = [...v.filas.map((r) => r.fin), v.meta, v.aperturaProyectada].sort().reverse()[0];
  const ini = sumarDias(v.cfg.fecha_pago, -2), fin = sumarDias(ultimo, 3);
  const total = Math.max(1, diasEntre(ini, fin));
  const pos = (f: string) => Math.min(100, Math.max(0, (diasEntre(ini, f) / total) * 100));
  const semanas: string[] = [];
  for (let d = v.cfg.fecha_pago; d <= fin; d = sumarDias(d, 7)) semanas.push(d);

  const excel = tablaExcel(ap.nombre, v.filas.map((r) => ({
    actividad: r.actividad, responsable: r.responsable, inicio: r.inicio, fin: r.fin, duracion: r.duracion,
    estado: r.estado === "hecho" && r.fecha_real ? `Hecho ${fechaCorta(r.fecha_real)}` : ESTADOS[r.estado].texto,
  })));
  const pct = v.total ? Math.round((v.hechos / v.total) * 100) : 0;

  return (
    <main className="wrap">
      <div className="head-row">
        <div>
          <p className="eyebrow"><Link href="/aperturas">Aperturas</Link> · {ap.tipo}{ap.lleva_bebidas ? " · con bebidas" : ""}</p>
          <h1 className="page-h">{ap.nombre} <span className={`pill ${v.semaforo.clase}`} style={{ verticalAlign: "middle", fontSize: 14 }}>{v.semaforo.texto}</span></h1>
        </div>
        <div className="gantt-actions no-print" style={{ marginTop: 0 }}>
          <CopiarTexto texto={excel} etiqueta="Copiar para Excel" className="btn small" />
          <BotonImprimir />
        </div>
      </div>

      <div className="kpis gd-kpis">
        <div className="kpi"><span className="s">Pago de equipos</span><span className="v">{fechaCorta(v.cfg.fecha_pago)}</span></div>
        <div className="kpi"><span className="s">Obra · {v.cfg.dias_obra} días</span><span className="v">{obra ? `${fechaCorta(obra.inicio)} – ${fechaCorta(obra.fin)}` : "—"}</span></div>
        <div className="kpi"><span className="s">Apertura suave · meta</span><span className="v">{fechaCorta(v.meta)}</span><span className="s">{diasEntre(h, v.meta) >= 0 ? `faltan ${diasEntre(h, v.meta)} días` : "fecha pasada"}</span></div>
        <div className="kpi"><span className="s">Proyectada hoy</span><span className="v" style={v.riesgo > 0 ? { color: "var(--bad)" } : undefined}>{fechaCorta(v.aperturaProyectada)}</span><span className="s">{v.riesgo > 0 ? `${v.riesgo} días tarde` : "a tiempo"} · avance {pct}%</span></div>
      </div>

      {v.riesgo > 0 && !ap.cerrada && (
        <div className="note bad gd-note">
          Con los pasos vencidos, la apertura suave se proyecta al {fechaCorta(v.aperturaProyectada)}: {v.riesgo} días después de la meta. La meta no se mueve sola.
          {puedeEditar && (
            <form action={actualizarApertura} style={{ display: "inline" }}>
              <input type="hidden" name="id" value={ap.id} /><input type="hidden" name="volver" value={volver} />
              <input type="hidden" name="apertura_meta" value={v.aperturaProyectada} />
              <button className="btn small" type="submit">Aceptar {fechaCorta(v.aperturaProyectada)} como nueva meta</button>
            </form>
          )}
        </div>
      )}
      {v.avisos.map((a) => <div key={a} className="note warn gd-note">{a}</div>)}
      {ap.notas && <p className="sub">Notas: {ap.notas}</p>}

      <div className="tbl-wrap">
        <table className="gd-tbl">
          <thead>
            <tr>
              <th>#</th><th>Actividad</th><th>Estado</th><th>Fecha</th><th title="Días que puede atrasarse sin mover la apertura suave">Margen</th>
              <th className="gd-tl-th">
                <div className="gd-scale">
                  {semanas.map((s) => <span key={s} style={{ left: `${pos(s)}%` }}>{fechaCorta(s)}</span>)}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {v.filas.map((r, i) => (
              <tr key={r.clave ?? `x${r.id}`} className={[r.hito ? `hito-${r.hito}` : "", r.estado === "hecho" ? "is-done" : "", r.critica && r.estado !== "hecho" ? "is-crit" : ""].join(" ")}>
                <td className="num">{i + 1}</td>
                <td className="gd-act">
                  <b>{r.actividad}</b>
                  <small>{r.responsable}</small>
                  {puedeEditar && r.id && <EditorPaso r={r} aperturaId={ap.id} volver={volver} hoy={h} />}
                </td>
                <td>
                  <span className={`pill ${estadoClase(r.estado)}`}>{ESTADOS[r.estado].texto}</span>
                  {r.atraso > 0 && <span className="pill bad" style={{ marginLeft: 4 }}>Vencido {r.atraso} d</span>}
                  {r.estado === "bloqueado" && r.motivo && <small className="gd-motivo">{r.motivo}</small>}
                  {r.estado === "hecho" && r.fecha_real && <small className="gd-motivo">Real {fechaCorta(r.fecha_real)}{r.fecha_real !== r.fin ? ` (${diasEntre(r.fin, r.fecha_real) > 0 ? "+" : ""}${diasEntre(r.fin, r.fecha_real)} d)` : ""}</small>}
                  {puedeEditar && r.id && r.estado !== "hecho" && (
                    <form action={actualizarPaso} className="gd-rapido no-print">
                      <input type="hidden" name="id" value={r.id} /><input type="hidden" name="apertura_id" value={ap.id} /><input type="hidden" name="volver" value={volver} />
                      <input type="hidden" name="estado" value="hecho" />
                      <button className="link-btn" type="submit">✓ Hecho hoy</button>
                    </form>
                  )}
                </td>
                <td className="num gd-fecha">
                  {r.duracion > 0 ? `${fechaCorta(r.inicio)} – ${fechaCorta(r.fin)}` : fechaCorta(r.fin)}
                  {r.fecha_fija && <small className="gd-tag">fija</small>}
                  {r.desvio !== 0 && <small className={r.desvio > 0 ? "gd-desvio bad" : "gd-desvio"}>{r.desvio > 0 ? "+" : ""}{r.desvio} d vs base</small>}
                </td>
                <td className="num">
                  {r.holgura === null ? <span className="sub">—</span> : r.critica ? <span className="pill crit">Crítico</span> : `${r.holgura} d`}
                </td>
                <td className="gd-tl">
                  <div className="gd-track">
                    {semanas.map((s) => <i key={s} className="gd-week" style={{ left: `${pos(s)}%` }} />)}
                    {r.duracion > 0 ? (
                      <i className={`gd-bar ${claseBarra(r)}`} style={{ left: `${pos(r.inicio)}%`, width: `${Math.max(0.8, pos(r.fin) - pos(r.inicio))}%` }} title={`${fechaCorta(r.inicio)} – ${fechaCorta(r.fin)}`} />
                    ) : (
                      <i className={`gd-dot ${claseBarra(r)}`} style={{ left: `${pos(r.fin)}%` }} title={fechaCorta(r.fin)} />
                    )}
                    {r.estado === "hecho" && r.fecha_real && r.fecha_real !== r.fin && <i className="gd-real" style={{ left: `${pos(r.fecha_real)}%` }} title={`Real ${fechaCorta(r.fecha_real)}`} />}
                    <i className="gd-meta" style={{ left: `${pos(v.meta)}%` }} />
                    {h >= ini && h <= fin && <i className="gd-hoy" style={{ left: `${pos(h)}%` }} />}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tl-legend">
        <span><i className="gd-dot crit gd-leg" /> Ruta crítica (sin margen)</span>
        <span><i className="gd-dot gd-leg" /> Con margen</span>
        <span><i className="gd-dot ok gd-leg" /> Hecho</span>
        <span><i className="gd-dot bad gd-leg" /> Vencido o bloqueado</span>
        <span><i className="gd-meta gd-leg" /> Meta de apertura</span>
        <span><i className="gd-hoy gd-leg" /> Hoy</span>
      </div>

      {puedeEditar && (
        <div className="gd-admin no-print">
          <details className="card">
            <summary><b>Configuración de la apertura</b></summary>
            <p className="sub">Si cambias el pago, los días de obra o del proveedor, todo el Gantt se recalcula. La meta solo cambia si tú la cambias.</p>
            <form action={actualizarApertura} className="inline-form">
              <input type="hidden" name="id" value={ap.id} /><input type="hidden" name="volver" value={volver} /><input type="hidden" name="config" value="1" />
              <label className="field w2">Sucursal<input name="nombre" defaultValue={ap.nombre} required /></label>
              <label className="field">Tipo<select name="tipo" defaultValue={ap.tipo}><option>Franquicia</option><option>Propia</option></select></label>
              <label className="field">Pago de equipos<input name="fecha_pago" type="date" defaultValue={ap.fecha_pago} required /></label>
              <label className="field">Días de obra<input name="dias_obra" type="number" min={1} max={365} defaultValue={ap.dias_obra} /></label>
              <label className="field">Entrega proveedor (días)<input name="dias_proveedor" type="number" min={1} max={180} defaultValue={ap.dias_proveedor} /></label>
              <label className="field">Meta de apertura suave<input name="apertura_meta" type="date" defaultValue={v.meta} /></label>
              <label className="inline-check"><input type="checkbox" name="lleva_bebidas" defaultChecked={ap.lleva_bebidas} /> Lleva equipo de bebidas</label>
              <label className="field w4">Notas<input name="notas" defaultValue={ap.notas ?? ""} /></label>
              <button className="btn primary" type="submit">Guardar y recalcular</button>
            </form>
            <div className="gantt-actions">
              <form action={actualizarApertura}>
                <input type="hidden" name="id" value={ap.id} /><input type="hidden" name="volver" value={volver} /><input type="hidden" name="rebase" value="1" />
                <button className="btn small" type="submit" title="La fecha planeada actual de cada paso se vuelve la referencia para medir desvíos">Tomar el plan actual como línea base y meta</button>
              </form>
              <form action={actualizarApertura}>
                <input type="hidden" name="id" value={ap.id} /><input type="hidden" name="volver" value={volver} /><input type="hidden" name="cerrada" value={String(!ap.cerrada)} />
                <button className="btn small" type="submit">{ap.cerrada ? "Reabrir apertura" : "Cerrar apertura (ya abrió)"}</button>
              </form>
              <form action={borrarApertura}>
                <input type="hidden" name="id" value={ap.id} />
                <button className="btn small danger" type="submit">Borrar apertura</button>
              </form>
            </div>
          </details>

          <details className="card">
            <summary><b>Agregar paso extra</b> <span className="sub">fuera de la plantilla, con fecha manual</span></summary>
            <form action={agregarPasoExtra} className="inline-form">
              <input type="hidden" name="apertura_id" value={ap.id} /><input type="hidden" name="volver" value={volver} />
              <label className="field w2">Actividad<input name="texto" required placeholder="Permiso de Protección Civil" /></label>
              <label className="field">Responsable<input name="responsable" placeholder="Arquitecto" /></label>
              <label className="field">Fecha<input name="fecha" type="date" required defaultValue={h} /></label>
              <button className="btn primary" type="submit">Agregar</button>
            </form>
          </details>
        </div>
      )}
    </main>
  );
}

function claseBarra(r: Fila) {
  if (r.estado === "hecho") return "ok";
  if (r.atraso > 0 || r.estado === "bloqueado") return "bad";
  if (r.critica) return "crit";
  return "";
}

/** Editor en línea de un paso (solo administrador). */
function EditorPaso({ r, aperturaId, volver, hoy: h }: { r: Fila; aperturaId: number; volver: string; hoy: string }) {
  const extra = !r.clave;
  const fijable = r.clave && r.clave !== "pago" && r.clave !== "apertura";
  return (
    <details className="gd-edit no-print">
      <summary>Editar</summary>
      <p className="gd-dep">{r.depende}</p>
      <form action={actualizarPaso} className="gd-form">
        <input type="hidden" name="id" value={r.id ?? ""} /><input type="hidden" name="apertura_id" value={aperturaId} /><input type="hidden" name="volver" value={volver} />
        <label className="field">Estado
          <select name="estado" defaultValue={r.estado}>
            {Object.entries(ESTADOS).map(([k, e]) => <option key={k} value={k}>{e.texto}</option>)}
          </select>
        </label>
        <label className="field">Fecha real <span className="hint">si está hecho</span><input name="fecha_real" type="date" defaultValue={r.fecha_real ?? h} /></label>
        <label className="field gd-w2">Motivo <span className="hint">si está bloqueado</span><input name="motivo" defaultValue={r.motivo ?? ""} placeholder="Proveedor no confirma fecha" /></label>
        {fijable && <label className="field">Fecha fija <span className="hint">caso especial</span><input name="fecha_fija" type="date" defaultValue={r.fecha_fija ?? ""} /></label>}
        {extra && <label className="field">Fecha<input name="fecha" type="date" defaultValue={r.fin} /></label>}
        {r.clave && r.clave !== "apertura" && r.clave !== "pago" && (
          <label className="field">Duración (días) <span className="hint">vacío = normal</span><input name="duracion" type="number" min={0} max={365} placeholder={String(r.duracion)} defaultValue={r.dur_manual ?? ""} /></label>
        )}
        <label className="field gd-w2">Responsable<input name="responsable" defaultValue={r.responsable} /></label>
        <button className="btn primary small" type="submit">Guardar</button>
      </form>
      {r.clave === "pago" && <p className="sub">La fecha de pago se cambia en Configuración de la apertura.</p>}
      {fijable && r.fecha_fija && <p className="sub">Para volver a la fecha calculada, borra la fecha fija y guarda.</p>}
      {extra && (
        <form action={borrarPasoExtra}>
          <input type="hidden" name="id" value={r.id ?? ""} /><input type="hidden" name="apertura_id" value={aperturaId} /><input type="hidden" name="volver" value={volver} />
          <button className="link-btn" type="submit" style={{ color: "var(--bad)" }}>Borrar este paso</button>
        </form>
      )}
    </details>
  );
}
