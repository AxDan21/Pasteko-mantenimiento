import Link from "next/link";
import GanttApertura from "@/components/GanttApertura";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { FilaGantt } from "@/lib/gantt";
import { diasEntre, fCorta, hoy, sumarDias } from "@/lib/panel";
import { borrarApertura, crearApertura } from "../acciones-modulos";

type Ap = { id: number; nombre: string; fecha: string; tipo: string };
type It = { id: number; apertura_id: number; texto: string; responsable: string | null; fecha: string | null; hecho: boolean; hito: "verde" | "amarillo" | null; orden: number };

export default async function Aperturas({ searchParams }: { searchParams: Promise<{ id?: string; error?: string; pasadas?: string }> }) {
  await requireAdmin();
  const f = await searchParams;
  const supabase = await createClient();
  const h = hoy();
  const [{ data: a }, { data: it }] = await Promise.all([
    supabase.from("aperturas").select("id, nombre, fecha, tipo").order("fecha"),
    supabase.from("apertura_items").select("id, apertura_id, texto, responsable, fecha, hecho, hito, orden").order("orden").order("id"),
  ]);
  const todas = (a ?? []) as Ap[];
  const items = (it ?? []) as It[];
  const visibles = f.pasadas ? todas : todas.filter((x) => diasEntre(h, x.fecha) >= -30 || x.id === Number(f.id));
  const sel = todas.find((x) => String(x.id) === f.id) ?? visibles.find((x) => x.fecha >= h) ?? visibles[0];
  const filasDe = (id: number): FilaGantt[] =>
    items.filter((x) => x.apertura_id === id).map((x) => ({ actividad: x.texto, responsable: x.responsable ?? "", fecha: x.fecha, hecho: x.hecho, hito: x.hito }));

  return (
    <main className="wrap">
      <div className="head-row">
        <div>
          <p className="eyebrow">Panel de mantenimiento</p>
          <h1 className="page-h">Aperturas</h1>
        </div>
        <Link className="btn small" href={f.pasadas ? "/admin/aperturas" : "/admin/aperturas?pasadas=1"}>{f.pasadas ? "Ocultar aperturas pasadas" : "Ver aperturas pasadas"}</Link>
      </div>
      {f.error && <div className="note bad" style={{ marginBottom: 14 }}>No se pudo crear: {f.error}</div>}

      <section className="card" style={{ marginBottom: 18 }}>
        <h3>Nueva apertura</h3>
        <p className="sub">Se crea con los 20 pasos estándar y las fechas calculadas a partir de la apertura suave. Después ajustas lo que cambie.</p>
        <form action={crearApertura} className="inline-form">
          <label className="field w2">Nombre de la sucursal<input id="ap-n" name="nombre" required placeholder="Pasteko - Zinapécuaro" /></label>
          <label className="field">Apertura suave<input id="ap-f" name="fecha" type="date" required defaultValue={sumarDias(h, 40)} /></label>
          <label className="field">Tipo<select id="ap-t" name="tipo" defaultValue="Franquicia"><option>Franquicia</option><option>Propia</option></select></label>
          <button className="btn primary" type="submit">Crear Gantt</button>
        </form>
      </section>

      {visibles.length ? (
        <>
          <div className="ap-strip">
            {visibles.map((x) => {
              const fl = filasDe(x.id);
              const hechos = fl.filter((r) => r.hecho).length, total = fl.filter((r) => r.fecha || r.hecho).length;
              const venc = fl.filter((r) => !r.hecho && r.fecha && r.fecha < h).length;
              const dias = diasEntre(h, x.fecha);
              return (
                <Link key={x.id} href={`/admin/aperturas?id=${x.id}${f.pasadas ? "&pasadas=1" : ""}`} className={`ap ${sel?.id === x.id ? "sel" : ""}`}>
                  <b>{x.nombre}</b>
                  <small>{x.tipo} · apertura suave {fCorta(x.fecha)} · {dias >= 0 ? `faltan ${dias} días` : "ya abrió"}</small>
                  <div className="bar" style={{ marginTop: 8 }}><i className={venc ? "bad" : ""} style={{ width: `${total ? (hechos / total) * 100 : 0}%` }} /></div>
                  <small className="num">{hechos} de {total} listos{venc ? ` · ${venc} vencidos` : ""}</small>
                </Link>
              );
            })}
          </div>

          {sel && (
            <>
              <GanttApertura key={sel.id} apertura={sel} filas={filasDe(sel.id)} hoy={h} />
              <form action={borrarApertura} style={{ marginTop: 12, textAlign: "right" }}>
                <input type="hidden" name="id" value={sel.id} />
                <button className="btn small danger" type="submit">Borrar esta apertura</button>
              </form>
            </>
          )}
        </>
      ) : (
        <div className="card"><h3>Sin aperturas próximas</h3><p className="sub">Crea la primera arriba. El Gantt queda listo para ajustar y copiar a Excel.</p></div>
      )}
    </main>
  );
}
