import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mxn } from "@/lib/format";
import { edadAnios, estadoGarantia, fCorta, hoy, recomendacion } from "@/lib/panel";
import type { Activo, GastoV } from "@/lib/types";
import { actualizarActivo } from "../../acciones-modulos";

export default async function FichaActivo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string }> }) {
  await requireAdmin();
  const [{ id }, { ok }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const [{ data: a }, { data: g }, { data: suc }, { data: prov }, { data: prev }] = await Promise.all([
    supabase.from("activos").select("*").eq("id", id).maybeSingle<Activo>(),
    supabase.from("v_gastos").select("*").eq("activo_id", id).order("fecha", { ascending: false }),
    supabase.from("sucursales").select("id, nombre").order("nombre"),
    supabase.from("proveedores").select("id, nombre").order("nombre"),
    supabase.from("preventivos").select("id, fecha, tarea, hecho").eq("activo_id", id).order("fecha", { ascending: false }).limit(12),
  ]);
  if (!a) notFound();
  const h = hoy();
  const hist = (g ?? []) as GastoV[];
  const total = hist.reduce((s, x) => s + Number(x.monto), 0);
  const gar = estadoGarantia(a.garantia_hasta, h), rec = recomendacion(a, total, h), edad = edadAnios(a.fecha_compra, h);

  return (
    <main className="wrap">
      <div className="detail-head">
        <Link href="/admin/activos" className="btn small">← Activos</Link>
        <div>
          <p className="eyebrow num">{a.id}</p>
          <h1>{a.equipo}</h1>
          <p className="sub" style={{ margin: 0 }}>{[a.marca, a.modelo, a.serie && `Serie ${a.serie}`].filter(Boolean).join(" · ") || "Sin datos de marca"}</p>
        </div>
      </div>
      {ok && <div className="note ok" style={{ marginBottom: 14 }}>Cambios guardados.</div>}

      <div className="kpis">
        <div className="kpi"><span className="eyebrow">Garantía</span><span className="v" style={{ fontSize: 20 }}><span className={`pill ${gar.clase}`}>{gar.texto}</span></span><span className="s">{a.garantia_hasta ? `Hasta el ${fCorta(a.garantia_hasta)}` : "Sin fecha registrada"}</span></div>
        <div className="kpi"><span className="eyebrow">Reparaciones acumuladas</span><span className="v">{mxn(total)}</span><span className="s">{a.costo > 0 ? `${((total / Number(a.costo)) * 100).toFixed(0)}% de su costo (${mxn(Number(a.costo))})` : "Sin costo registrado"}</span></div>
        <div className="kpi"><span className="eyebrow">Antigüedad</span><span className="v">{edad === null ? "—" : edad.toFixed(1)}</span><span className="s">de {a.vida_anios} años de vida útil</span></div>
        <div className="kpi"><span className="eyebrow">Recomendación</span><span className="v" style={{ fontSize: 20 }}><span className={`pill ${rec.clase}`}>{rec.texto}</span></span><span className="s">Por costo de reparación y edad</span></div>
      </div>

      <div className="detail">
        <div className="stack">
          <section className="card">
            <h3>Historial de servicios y gastos</h3>
            {hist.length ? (
              <ul className="hist">
                {hist.map((x) => (
                  <li key={x.origen + x.ref}>
                    <span className="num">{fCorta(x.fecha)}</span>
                    <span>{x.origen === "hoja" ? <Link href={`/admin/hojas/${x.ref}`}>{x.concepto}</Link> : x.concepto}<small>{x.tipo} · {x.categoria}</small></span>
                    <span className="num">{mxn(Number(x.monto))}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="sub">Sin servicios ligados a este equipo todavía.</p>}
          </section>
          <section className="card">
            <h3>Preventivos</h3>
            {(prev ?? []).length ? (
              <ul className="hist">
                {(prev ?? []).map((p) => (
                  <li key={p.id as number}><span className="num">{fCorta(p.fecha as string)}</span><span>{p.tarea as string}</span><span className={`pill ${p.hecho ? "ok" : "neutral"}`}>{p.hecho ? "Hecho" : "Pendiente"}</span></li>
                ))}
              </ul>
            ) : <p className="sub">Sin preventivos ligados. Prográmalos en Preventivos eligiendo este código.</p>}
          </section>
        </div>

        <form action={actualizarActivo} className="card stack">
          <h3>Datos del equipo</h3>
          <input type="hidden" name="id" value={a.id} />
          <label className="field">Sucursal<select id="e-suc" name="sucursal_id" defaultValue={a.sucursal_id}>{(suc ?? []).map((s) => <option key={s.id as number} value={s.id as number}>{s.nombre as string}</option>)}</select></label>
          <div className="grid2">
            <label className="field">Marca<input id="e-marca" name="marca" defaultValue={a.marca ?? ""} /></label>
            <label className="field">Modelo<input id="e-modelo" name="modelo" defaultValue={a.modelo ?? ""} /></label>
            <label className="field">Serie<input id="e-serie" name="serie" defaultValue={a.serie ?? ""} /></label>
            <label className="field">Costo<input id="e-costo" name="costo" type="number" min="0" step="0.01" defaultValue={a.costo} /></label>
            <label className="field">Compra<input id="e-compra" name="fecha_compra" type="date" defaultValue={a.fecha_compra ?? ""} /></label>
            <label className="field">Garantía hasta<input id="e-gar" name="garantia_hasta" type="date" defaultValue={a.garantia_hasta ?? ""} /></label>
            <label className="field">Vida útil (años)<input id="e-vida" name="vida_anios" type="number" min="1" defaultValue={a.vida_anios} /></label>
            <label className="field">Estado<select id="e-act" name="activo" defaultValue={String(a.activo)}><option value="true">En uso</option><option value="false">Dado de baja</option></select></label>
          </div>
          <label className="field">Proveedor de garantía<select id="e-prov" name="proveedor_id" defaultValue={a.proveedor_id ?? ""}><option value="">Ninguno</option>{(prov ?? []).map((p) => <option key={p.id as number} value={p.id as number}>{p.nombre as string}</option>)}</select></label>
          <label className="field">Notas<textarea id="e-notas" name="notas" rows={3} defaultValue={a.notas ?? ""} /></label>
          <button className="btn primary" type="submit">Guardar</button>
        </form>
      </div>
    </main>
  );
}
