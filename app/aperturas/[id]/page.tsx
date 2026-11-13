import Link from "next/link";
import { notFound } from "next/navigation";
import BotonImprimir from "@/components/BotonImprimir";
import CopiarTexto from "@/components/CopiarTexto";
import GanttTablero from "@/components/aperturas/GanttTablero";
import { requireAperturas } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AP_COLS, IT_COLS, vistaApertura, type ApRow, type ItemRow } from "@/lib/aperturas";
import { ESTADOS, fechaCorta, tablaExcel } from "@/lib/gantt";
import { diasEntre, hoy, sumarDias } from "@/lib/panel";
import { actualizarApertura, agregarPasoExtra, borrarApertura, borrarPasoExtra } from "../actions";

export default async function DetalleApertura({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ paso?: string }> }) {
  const { puedeEditar } = await requireAperturas();
  const { id } = await params;
  const { paso } = await searchParams;
  const supabase = await createClient();
  const h = hoy();
  const [{ data: ap }, { data: it }] = await Promise.all([
    supabase.from("aperturas").select(AP_COLS).eq("id", Number(id)).maybeSingle<ApRow>(),
    supabase.from("apertura_items").select(IT_COLS).eq("apertura_id", Number(id)).order("orden").order("id"),
  ]);
  if (!ap) notFound();
  if (ap.modelo !== "v2" || !ap.fecha_pago) {
    return (
      <main className="wrap ax">
        <div className="ax-card"><h3>{ap.nombre}</h3><p className="sub">Esta apertura está en el formato anterior. {puedeEditar ? "Conviértela desde el portafolio indicando la fecha de pago de equipos." : ""}</p><Link className="btn small" href="/aperturas">Ir al portafolio</Link></div>
      </main>
    );
  }
  const v = vistaApertura(ap, (it ?? []) as ItemRow[], h);
  const volver = `/aperturas/${ap.id}`;
  const ultimo = [...v.filas.map((r) => r.fin), v.meta, v.aperturaProyectada].sort().reverse()[0];
  const ini = sumarDias(v.cfg.fecha_pago, -2), fin = sumarDias(ultimo, 4);
  const faltan = diasEntre(h, v.aperturaProyectada);
  const extras = v.filas.filter((r) => !r.clave);

  const excel = tablaExcel(ap.nombre, v.filas.map((r) => ({
    actividad: r.actividad, responsable: r.responsable, inicio: r.inicio, fin: r.fin, duracion: r.duracion,
    estado: r.estado === "hecho" && r.fecha_real ? `Hecho ${fechaCorta(r.fecha_real)}` : ESTADOS[r.estado].texto,
  })));

  return (
    <main className="wrap ax">
      <div className="ax-head">
        <div>
          <p className="ax-eyebrow"><Link href="/aperturas">Aperturas</Link> · {ap.tipo} · {ap.lleva_bebidas ? "con bebidas" : "sin bebidas"} · obra de {v.cfg.dias_obra} días</p>
          <h1 className="ax-h1">{ap.nombre.replace(/^Pasteko\s*-\s*/i, "")}</h1>
        </div>
        <div className="ax-actions no-print">
          <CopiarTexto texto={excel} etiqueta="Copiar para Excel" className="btn small" />
          <BotonImprimir />
        </div>
      </div>

      <div className="ax-facts">
        <div><span>Pago de equipos</span><b>{fechaCorta(v.cfg.fecha_pago)}</b></div>
        <div><span>Meta de apertura</span><b>{fechaCorta(v.meta)}</b></div>
        <div className={v.riesgo > 0 ? "bad" : undefined}><span>Proyectada hoy</span><b>{fechaCorta(v.aperturaProyectada)}</b><small>{v.riesgo > 0 ? `${v.riesgo} días tarde` : "a tiempo"}</small></div>
        <div><span>{faltan >= 0 ? "Faltan" : "Abrió hace"}</span><b>{Math.abs(faltan)} días</b></div>
        <div><span>Avance</span><b>{v.hechos} de {v.total}</b><small>{Math.round((v.hechos / Math.max(1, v.total)) * 100)}%</small></div>
        <div className={`st-${v.semaforo.clase}`}><span>Estado</span><b>{v.semaforo.texto}</b></div>
      </div>

      {v.riesgo > 0 && !ap.cerrada && (
        <div className="ax-alert bad">
          <div>
            <b>La apertura suave se proyecta al {fechaCorta(v.aperturaProyectada)}, {v.riesgo} días después de la meta.</b>
            <span>Se calcula con los pasos vencidos. La meta no se mueve sola: decide si la aceptas o recuperas tiempo.</span>
          </div>
          {puedeEditar && (
            <form action={actualizarApertura}>
              <input type="hidden" name="id" value={ap.id} /><input type="hidden" name="volver" value={volver} />
              <input type="hidden" name="apertura_meta" value={v.aperturaProyectada} />
              <button className="btn small" type="submit">Aceptar {fechaCorta(v.aperturaProyectada)} como meta</button>
            </form>
          )}
        </div>
      )}
      {v.avisos.map((a) => <div key={a} className="ax-alert warn"><div><b>{a}</b></div></div>)}
      {ap.notas && <p className="ax-notas">Notas: {ap.notas}</p>}

      <GanttTablero aperturaId={ap.id} filas={v.filas} ini={ini} fin={fin} hoy={h} meta={v.meta} puedeEditar={puedeEditar} inicial={paso} />

      {puedeEditar && (
        <div className="ax-admin no-print">
          <details className="ax-card">
            <summary><b>Configuración de la apertura</b><span>Pago, días de obra y proveedor, meta, cierre</span></summary>
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
            <p className="sub" style={{ marginTop: 12 }}>Si cambias el pago o los días, todo el Gantt se recalcula. La meta solo cambia si tú la cambias.</p>
            <div className="ax-actions">
              <form action={actualizarApertura}>
                <input type="hidden" name="id" value={ap.id} /><input type="hidden" name="volver" value={volver} /><input type="hidden" name="rebase" value="1" />
                <button className="btn small" type="submit">Tomar el plan actual como línea base y meta</button>
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

          <details className="ax-card">
            <summary><b>Pasos extra</b><span>{extras.length ? `${extras.length} agregados` : "Fuera de la plantilla, con fecha manual"}</span></summary>
            <form action={agregarPasoExtra} className="inline-form">
              <input type="hidden" name="apertura_id" value={ap.id} /><input type="hidden" name="volver" value={volver} />
              <label className="field w2">Actividad<input name="texto" required placeholder="Permiso de Protección Civil" /></label>
              <label className="field">Responsable<input name="responsable" placeholder="Arquitecto" /></label>
              <label className="field">Fecha<input name="fecha" type="date" required defaultValue={h} /></label>
              <button className="btn primary" type="submit">Agregar</button>
            </form>
            {extras.length > 0 && (
              <ul className="ax-extras">
                {extras.map((r) => (
                  <li key={r.id}>
                    <span><b>{r.actividad}</b> · {r.responsable} · {fechaCorta(r.fin)}</span>
                    <form action={borrarPasoExtra}>
                      <input type="hidden" name="id" value={r.id ?? ""} /><input type="hidden" name="apertura_id" value={ap.id} /><input type="hidden" name="volver" value={volver} />
                      <button className="link-btn" type="submit">Quitar</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </div>
      )}
    </main>
  );
}
