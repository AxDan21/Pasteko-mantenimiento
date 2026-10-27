import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { diasEntre, fCorta, hoy, sumarDias } from "@/lib/panel";
import type { Apertura, AperturaItem } from "@/lib/types";
import { agregarItem, alternarItem, borrarApertura, crearApertura } from "../acciones-modulos";

export default async function Aperturas({ searchParams }: { searchParams: Promise<{ id?: string; error?: string }> }) {
  await requireAdmin();
  const f = await searchParams;
  const supabase = await createClient();
  const [{ data: a }, { data: it }] = await Promise.all([
    supabase.from("aperturas").select("*").order("fecha"),
    supabase.from("apertura_items").select("*").order("orden").order("id"),
  ]);
  const aperturas = (a ?? []) as Apertura[];
  const items = (it ?? []) as AperturaItem[];
  const sel = aperturas.find((x) => String(x.id) === f.id) ?? aperturas[0];
  const h = hoy();
  const progreso = (id: number) => {
    const l = items.filter((x) => x.apertura_id === id);
    return [l.filter((x) => x.hecho).length, l.length] as const;
  };
  const grupos = sel ? Array.from(new Set(items.filter((x) => x.apertura_id === sel.id).map((x) => x.grupo))) : [];

  return (
    <main className="wrap">
      <div className="head-row">
        <div>
          <p className="eyebrow">Panel de mantenimiento</p>
          <h1 className="page-h">Aperturas</h1>
        </div>
      </div>
      {f.error && <div className="note bad" style={{ marginBottom: 14 }}>No se pudo crear: {f.error}</div>}

      <section className="card" style={{ marginBottom: 18 }}>
        <h3>Nueva apertura</h3>
        <p className="sub">Se crea con la lista estándar de instalaciones, equipos, registro y capacitación. Puedes agregar puntos después.</p>
        <form action={crearApertura} className="inline-form">
          <label className="field w2">Nombre de la sucursal<input id="ap-n" name="nombre" required /></label>
          <label className="field">Fecha de apertura<input id="ap-f" name="fecha" type="date" required defaultValue={sumarDias(h, 30)} /></label>
          <button className="btn primary" type="submit">Crear</button>
        </form>
      </section>

      {aperturas.length ? (
        <div className="ap-grid">
          <div className="stack">
            {aperturas.map((x) => {
              const [hechos, total] = progreso(x.id);
              const dias = diasEntre(h, x.fecha);
              return (
                <Link key={x.id} href={`/admin/aperturas?id=${x.id}`} className={`ap ${sel?.id === x.id ? "sel" : ""}`}>
                  <b>{x.nombre}</b>
                  <small>Abre el {fCorta(x.fecha)} · {dias >= 0 ? `faltan ${dias} días` : "ya abrió"}</small>
                  <div className="bar" style={{ marginTop: 8 }}><i className={total && hechos / total < 0.5 && dias < 30 && dias >= 0 ? "warn" : ""} style={{ width: `${total ? (hechos / total) * 100 : 0}%` }} /></div>
                  <small className="num">{hechos} de {total} listos</small>
                </Link>
              );
            })}
          </div>
          {sel && (
            <section className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div><h3>{sel.nombre}</h3><p className="sub">Apertura: {fCorta(sel.fecha)}</p></div>
                <form action={borrarApertura}><input type="hidden" name="id" value={sel.id} /><button className="btn small danger" type="submit">Borrar apertura</button></form>
              </div>
              {grupos.map((g) => (
                <div key={g}>
                  <p className="eyebrow" style={{ margin: "16px 0 4px" }}>{g}</p>
                  {items.filter((x) => x.apertura_id === sel.id && x.grupo === g).map((x) => (
                    <form key={x.id} action={alternarItem}>
                      <input type="hidden" name="id" value={x.id} />
                      <input type="hidden" name="hecho" value={String(!x.hecho)} />
                      <button type="submit" className={`check ${x.hecho ? "done" : ""}`} aria-pressed={x.hecho}>
                        <span className="box" aria-hidden="true">{x.hecho ? "✓" : ""}</span>
                        <span>{x.texto}</span>
                      </button>
                    </form>
                  ))}
                </div>
              ))}
              <form action={agregarItem} className="inline-form" style={{ marginTop: 16 }}>
                <input type="hidden" name="apertura_id" value={sel.id} />
                <label className="field">Grupo<select name="grupo" defaultValue={grupos[0] ?? "Otros"}>{[...grupos, "Otros"].filter((v, i, arr) => arr.indexOf(v) === i).map((g) => <option key={g}>{g}</option>)}</select></label>
                <label className="field w2">Nuevo punto<input name="texto" required /></label>
                <button className="btn" type="submit">Agregar</button>
              </form>
            </section>
          )}
        </div>
      ) : (
        <div className="card"><h3>Sin aperturas</h3><p className="sub">Crea una para llevar la lista de instalación de equipos de una sucursal nueva.</p></div>
      )}
    </main>
  );
}
