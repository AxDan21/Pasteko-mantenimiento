import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { enlaces, leerAjustes } from "@/lib/datos";
import { mxn } from "@/lib/format";
import { CATEGORIAS_EXTRA, fCorta, hoy, mesValido, nombreMes, rangoFechas } from "@/lib/panel";
import type { Gasto, GastoV } from "@/lib/types";
import { borrarGasto, crearGasto, guardarAjustes } from "../acciones-modulos";

const ORIGEN: Record<string, [string, string]> = { hoja: ["Hoja de servicio", "neutral"], gasto: ["Gasto", "warn"], caja: ["Caja chica", "ok"] };

export default async function Gastos({ searchParams }: { searchParams: Promise<{ mes?: string; zona?: string; ok?: string; error?: string }> }) {
  await requireAdmin();
  const f = await searchParams;
  const mes = mesValido(f.mes);
  const [ini, fin] = rangoFechas(mes);
  const supabase = await createClient();

  let q = supabase.from("v_gastos").select("*").gte("fecha", ini).lt("fecha", fin).order("fecha", { ascending: false });
  if (f.zona) q = q.eq("zona", f.zona);
  const [ajustes, { data: v }, { data: gm }, { data: suc }, { data: eqs }, { data: prov }, { data: act }] = await Promise.all([
    leerAjustes(supabase),
    q,
    supabase.from("gastos").select("id, factura_path").gte("fecha", ini).lt("fecha", fin),
    supabase.from("sucursales").select("id, nombre, zona").order("zona").order("nombre"),
    supabase.from("equipos").select("categoria"),
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("activos").select("id").eq("activo", true).order("id"),
  ]);
  const filas = (v ?? []) as GastoV[];
  const facturas = new Map(((gm ?? []) as Pick<Gasto, "id" | "factura_path">[]).map((x) => [String(x.id), x.factura_path]));
  const urls = await enlaces(supabase, "facturas", Array.from(facturas.values()));
  const sucursales = (suc ?? []) as { id: number; nombre: string; zona: string }[];
  const zonas = Array.from(new Set(sucursales.map((s) => s.zona)));
  const categorias = Array.from(new Set([...(eqs ?? []).map((e) => e.categoria as string), ...CATEGORIAS_EXTRA]));

  const total = filas.reduce((s, x) => s + Number(x.monto), 0);
  const porCat = new Map<string, number>();
  filas.forEach((x) => porCat.set(x.categoria, (porCat.get(x.categoria) ?? 0) + Number(x.monto)));
  const cats = Array.from(porCat.entries()).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] ?? 1;
  const restante = ajustes.presupuesto_mensual - total;

  return (
    <main className="wrap">
      <div className="head-row">
        <div>
          <p className="eyebrow">Panel de mantenimiento · {nombreMes(mes)}</p>
          <h1 className="page-h">Gastos</h1>
        </div>
        <Link className="btn" href={`/admin/exportar?tabla=gastos&mes=${mes}`}>Descargar CSV</Link>
      </div>

      {f.ok && <div className="note ok" style={{ marginBottom: 14 }}>Gasto registrado.</div>}
      {f.error && <div className="note bad" style={{ marginBottom: 14 }}>{f.error}</div>}

      <div className="panel-grid" style={{ marginBottom: 16 }}>
        <section className="card">
          <h3>Registrar gasto</h3>
          <p className="sub">Facturas de proveedores, compras y servicios. Las hojas de servicio y la caja chica se suman solas.</p>
          <form action={crearGasto} className="inline-form">
            <label className="field">Fecha<input id="g-fecha" name="fecha" type="date" required defaultValue={hoy()} /></label>
            <label className="field">Sucursal
              <select id="g-suc" name="sucursal_id" defaultValue="">
                <option value="">General / varias</option>
                {zonas.map((z) => <optgroup key={z} label={z}>{sucursales.filter((s) => s.zona === z).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</optgroup>)}
              </select>
            </label>
            <label className="field">Categoría
              <select id="g-cat" name="categoria" defaultValue={categorias[0]}>{categorias.map((c) => <option key={c}>{c}</option>)}</select>
            </label>
            <label className="field">Tipo
              <select id="g-tipo" name="tipo" defaultValue="Correctivo"><option>Correctivo</option><option>Preventivo</option><option>Otro</option></select>
            </label>
            <label className="field w2">Concepto<input id="g-con" name="concepto" required placeholder="Ej. Cambio de compresor" /></label>
            <label className="field">Monto (MXN)<input id="g-monto" name="monto" type="number" min="0.01" step="0.01" required /></label>
            <label className="field">Proveedor
              <select id="g-prov" name="proveedor_id" defaultValue=""><option value="">Ninguno</option>{(prov ?? []).map((p) => <option key={p.id as number} value={p.id as number}>{p.nombre as string}</option>)}</select>
            </label>
            <label className="field">Activo (opcional)
              <select id="g-act" name="activo_id" defaultValue=""><option value="">Ninguno</option>{(act ?? []).map((a) => <option key={a.id as string}>{a.id as string}</option>)}</select>
            </label>
            <label className="field w2">Factura (foto o PDF)<input id="g-fac" name="factura" type="file" accept="image/*,application/pdf" /></label>
            <button className="btn primary" type="submit">Registrar</button>
          </form>
        </section>
        <section className="card">
          <h3>Presupuesto de {nombreMes(mes)}</h3>
          <p className="sub">Gastado {mxn(total)} de {mxn(ajustes.presupuesto_mensual)}</p>
          <div className="kpi" style={{ border: 0, padding: 0 }}>
            <span className="v" style={{ color: restante < 0 ? "var(--bad)" : "var(--ink)" }}>{mxn(restante)}</span>
            <div className="bar"><i className={restante < 0 ? "bad" : ""} style={{ width: `${Math.min((total / (ajustes.presupuesto_mensual || 1)) * 100, 100)}%` }} /></div>
            <span className="s">{restante < 0 ? "Excedido" : "Disponible"}</span>
          </div>
          <form action={guardarAjustes} className="inline-form" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 16 }}>
            <label className="field">Presupuesto mensual<input id="a-pres" name="presupuesto_mensual" type="number" min="0" step="100" defaultValue={ajustes.presupuesto_mensual} /></label>
            <label className="field">Fondo de caja chica<input id="a-caja" name="fondo_caja_chica" type="number" min="0" step="100" defaultValue={ajustes.fondo_caja_chica} /></label>
            <button className="btn" type="submit">Guardar montos</button>
          </form>
        </section>
      </div>

      <div className="panel-grid" style={{ marginBottom: 16 }}>
        <section className="card">
          <h3>Por categoría</h3>
          <p className="sub">{nombreMes(mes)} · total {mxn(total)}</p>
          {cats.length ? (
            <div className="hbars">{cats.map(([c, n]) => <div key={c} className="hb"><span className="name">{c}</span><span className="track"><i style={{ width: `${(n / maxCat) * 100}%` }} /></span><span className="num">{mxn(n)}</span></div>)}</div>
          ) : <p className="sub">Sin gastos en este mes.</p>}
        </section>
        <form className="card stack" method="get">
          <h3>Ver otro mes</h3>
          <label className="field">Mes<input id="f-mes" name="mes" type="month" defaultValue={mes} /></label>
          <label className="field">Zona<select id="f-zona" name="zona" defaultValue={f.zona ?? ""}><option value="">Todas</option>{zonas.map((z) => <option key={z}>{z}</option>)}</select></label>
          <button className="btn primary" type="submit">Ver</button>
        </form>
      </div>

      {filas.length ? (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Origen</th><th>Sucursal</th><th>Categoría</th><th>Tipo</th><th>Concepto</th><th className="r">Monto</th><th /></tr></thead>
            <tbody>
              {filas.map((x) => {
                const [o, oc] = ORIGEN[x.origen] ?? ["", "neutral"];
                const fac = x.origen === "gasto" ? facturas.get(x.ref) : null;
                return (
                  <tr key={x.origen + x.ref}>
                    <td className="num">{fCorta(x.fecha)}</td>
                    <td><span className={`pill ${oc}`}>{o}</span></td>
                    <td>{x.sucursal ?? <span style={{ color: "var(--muted)" }}>General</span>}</td>
                    <td>{x.categoria}</td>
                    <td>{x.tipo}</td>
                    <td>{x.origen === "hoja" ? <Link href={`/admin/hojas/${x.ref}`}>{x.concepto}</Link> : x.concepto}</td>
                    <td className="r num">{mxn(Number(x.monto))}</td>
                    <td className="r">
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        {fac && urls.get(fac) && <a className="btn small" href={urls.get(fac)} target="_blank" rel="noopener noreferrer">Factura</a>}
                        {x.origen === "gasto" && (
                          <form action={borrarGasto}><input type="hidden" name="id" value={x.ref} /><button className="btn small danger" type="submit">Borrar</button></form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card"><h3>Sin gastos en {nombreMes(mes)}</h3><p className="sub">Registra el primero arriba o espera a que los técnicos envíen hojas con costo.</p></div>
      )}
    </main>
  );
}
