/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mxn } from "@/lib/format";
import { enlaces } from "@/lib/datos";
import { qrPng, urlActivo } from "@/lib/qr";
import { edadAnios, estadoGarantia, fCorta, hoy, recomendacion } from "@/lib/panel";
import type { Activo, GastoV } from "@/lib/types";
import { actualizarActivo, subirGarantia, validarActivos } from "../../acciones-modulos";

export default async function FichaActivo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; error?: string; nuevo?: string }> }) {
  await requireAdmin();
  const [{ id }, { ok, error, nuevo }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const [{ data: a }, { data: g }, { data: suc }, { data: prov }, { data: eqs }, { data: prev }] = await Promise.all([
    supabase.from("activos").select("*").eq("id", id).maybeSingle<Activo>(),
    supabase.from("v_gastos").select("*").eq("activo_id", id).order("fecha", { ascending: false }),
    supabase.from("sucursales").select("id, nombre").order("nombre"),
    supabase.from("proveedores").select("id, nombre").order("nombre"),
    supabase.from("equipos").select("nombre").order("orden"),
    supabase.from("preventivos").select("id, fecha, tarea, hecho").eq("activo_id", id).order("fecha", { ascending: false }).limit(12),
  ]);
  if (!a) notFound();
  const h = hoy();
  const hist = (g ?? []) as GastoV[];
  const total = hist.reduce((s, x) => s + Number(x.monto), 0);
  const [qr, docs, fotos, { data: quien }] = await Promise.all([
    qrPng(urlActivo(a.id), 420),
    enlaces(supabase, "facturas", [a.garantia_path]),
    enlaces(supabase, "censo", [a.ficha_path, a.foto_path]),
    a.registrado_por ? supabase.from("perfiles").select("nombre").eq("id", a.registrado_por).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const fichaUrl = a.ficha_path ? fotos.get(a.ficha_path) : undefined;
  const fotoUrl = a.foto_path ? fotos.get(a.foto_path) : undefined;
  const docGarantia = a.garantia_path ? docs.get(a.garantia_path) : undefined;
  const esPdf = a.garantia_path?.toLowerCase().endsWith(".pdf");
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
      {nuevo && <div className="note ok" style={{ marginBottom: 14 }}>Equipo dado de alta. Imprime su etiqueta QR y pégala en el equipo.</div>}
      {ok && <div className="note ok" style={{ marginBottom: 14 }}>{ok === "garantia" ? "Documento de garantía guardado." : "Cambios guardados."}</div>}
      {error && <div className="note bad" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="kpis">
        <div className="kpi"><span className="eyebrow">Garantía</span><span className="v" style={{ fontSize: 20 }}><span className={`pill ${gar.clase}`}>{gar.texto}</span></span><span className="s">{a.garantia_hasta ? `Hasta el ${fCorta(a.garantia_hasta)}` : "Sin fecha registrada"}</span></div>
        <div className="kpi"><span className="eyebrow">Reparaciones acumuladas</span><span className="v">{mxn(total)}</span><span className="s">{a.costo > 0 ? `${((total / Number(a.costo)) * 100).toFixed(0)}% de su costo (${mxn(Number(a.costo))})` : "Sin costo registrado"}</span></div>
        <div className="kpi"><span className="eyebrow">Antigüedad</span><span className="v">{edad === null ? "—" : edad.toFixed(1)}</span><span className="s">de {a.vida_anios} años de vida útil</span></div>
        <div className="kpi"><span className="eyebrow">Recomendación</span><span className="v" style={{ fontSize: 20 }}><span className={`pill ${rec.clase}`}>{rec.texto}</span></span><span className="s">Por costo de reparación y edad</span></div>
      </div>

      {a.validado === false && (
        <form action={validarActivos} className="note warn censo-banner" style={{ marginBottom: 14 }}>
          <span>Registrado por {quien?.nombre ?? "un supervisor"} el {a.registrado ? fCorta(a.registrado) : ""}. Revisa la ficha técnica, completa costo y garantía, y valídalo.</span>
          <input type="hidden" name="id" value={a.id} />
          <input type="hidden" name="volver" value={`/admin/activos/${a.id}`} />
          <button className="btn primary small" type="submit">Validar equipo</button>
        </form>
      )}

      {(fichaUrl || fotoUrl || a.descripcion) && (
        <section className="card ficha-censo" style={{ marginBottom: 16 }}>
          <div className="validar-fotos grande">
            {fichaUrl && <a href={fichaUrl} target="_blank" rel="noopener noreferrer"><img src={fichaUrl} alt="Ficha técnica" /><small>Ficha técnica</small></a>}
            {fotoUrl && <a href={fotoUrl} target="_blank" rel="noopener noreferrer"><img src={fotoUrl} alt="Equipo" /><small>Equipo</small></a>}
          </div>
          <div>
            <h3>{a.descripcion || a.equipo}</h3>
            <p className="sub" style={{ margin: 0 }}>{a.equipo}{a.serie ? ` · Serie ${a.serie}` : " · Sin número de serie"}</p>
            {a.registrado_por && <p className="sub" style={{ margin: "4px 0 0" }}>Registrado por {quien?.nombre ?? "—"}{a.registrado ? ` el ${fCorta(a.registrado)}` : ""}</p>}
          </div>
        </section>
      )}

      <div className="qr-gar">
        <section className="card qr-card">
          <img src={qr} alt={`Código QR de ${a.id}`} className="qr-big" />
          <div className="stack" style={{ gap: 8 }}>
            <h3>Etiqueta QR</h3>
            <p className="sub" style={{ margin: 0 }}>Pégala en el equipo. El técnico la escanea con la cámara del celular y ve el historial; el personal de tienda ve la guía del equipo.</p>
            <p className="num sub" style={{ margin: 0, wordBreak: "break-all" }}>{urlActivo(a.id)}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link className="btn primary small" href={`/admin/activos/etiquetas?ids=${a.id}`}>Imprimir etiqueta</Link>
              <a className="btn small" href={qr} download={`qr-${a.id}.png`}>Descargar PNG</a>
              <Link className="btn small" href={`/a/${a.id}`}>Ver como técnico</Link>
            </div>
          </div>
        </section>
        <section className="card stack" style={{ gap: 10 }}>
          <h3>Documento de garantía</h3>
          {docGarantia ? (
            <>
              {esPdf ? (
                <a className="doc-file" href={docGarantia} target="_blank" rel="noopener noreferrer"><b>PDF</b><span>Ver garantía{a.garantia_hasta ? ` · vigente hasta el ${fCorta(a.garantia_hasta)}` : ""}</span></a>
              ) : (
                <a href={docGarantia} target="_blank" rel="noopener noreferrer"><img src={docGarantia} alt="Garantía" className="doc-img" /></a>
              )}
              <p className="sub" style={{ margin: 0 }}>Para reemplazarla, sube otro archivo.</p>
            </>
          ) : (
            <p className="sub" style={{ margin: 0 }}>{gar.clase === "neutral" && a.garantia_hasta ? "La garantía ya venció. Sube el documento solo si lo quieres archivar." : "Sube la póliza o carta de garantía (PDF o foto) para tenerla a la mano al reclamar."}</p>
          )}
          <form action={subirGarantia} className="stack" style={{ gap: 8 }}>
            <input type="hidden" name="id" value={a.id} />
            <input id="g-doc" name="garantia" type="file" accept="application/pdf,image/*" required aria-label="Archivo de garantía" />
            <button className="btn small" type="submit">{docGarantia ? "Reemplazar garantía" : "Subir garantía"}</button>
          </form>
        </section>
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
          <label className="field">Descripción<input id="e-desc" name="descripcion" defaultValue={a.descripcion ?? ""} placeholder="Ej. Refri vertical junto a caja" /></label>
          <label className="field">Tipo de equipo<select id="e-tipo" name="equipo" defaultValue={a.equipo}>{Array.from(new Set([a.equipo, ...(eqs ?? []).map((e) => e.nombre as string)])).map((n) => <option key={n}>{n}</option>)}</select></label>
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
