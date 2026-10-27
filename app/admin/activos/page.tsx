import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { acumuladoPorActivo } from "@/lib/datos";
import { mxn } from "@/lib/format";
import { edadAnios, estadoGarantia, hoy, recomendacion } from "@/lib/panel";
import type { Activo } from "@/lib/types";
import { crearActivo } from "../acciones-modulos";

type F = { zona?: string; equipo?: string; rec?: string; bajas?: string; ok?: string; error?: string };

export default async function Activos({ searchParams }: { searchParams: Promise<F> }) {
  await requireAdmin();
  const f = await searchParams;
  const supabase = await createClient();
  const h = hoy();
  const [{ data: a }, { data: suc }, { data: eqs }, { data: prov }, acum] = await Promise.all([
    supabase.from("activos").select("*").order("id"),
    supabase.from("sucursales").select("id, nombre, zona").order("zona").order("nombre"),
    supabase.from("equipos").select("nombre").order("orden"),
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
    acumuladoPorActivo(supabase),
  ]);
  const sucursales = (suc ?? []) as { id: number; nombre: string; zona: string }[];
  const sucPorId = new Map(sucursales.map((s) => [s.id, s]));
  const zonas = Array.from(new Set(sucursales.map((s) => s.zona)));
  const todos = ((a ?? []) as Activo[]).filter((x) => (f.bajas ? true : x.activo));

  const info = todos.map((x) => {
    const total = acum.get(x.id)?.total ?? 0;
    const enGarantia = x.garantia_hasta ? (acum.get(x.id)?.filas ?? []).filter((r) => r.tipo === "Correctivo" && r.fecha <= x.garantia_hasta!) : [];
    return { x, total, gar: estadoGarantia(x.garantia_hasta, h), rec: recomendacion(x, total, h), pagadoGar: enGarantia.reduce((s, r) => s + r.monto, 0) };
  });
  let filas = info;
  if (f.zona) filas = filas.filter((i) => sucPorId.get(i.x.sucursal_id)?.zona === f.zona);
  if (f.equipo) filas = filas.filter((i) => i.x.equipo === f.equipo);
  if (f.rec === "garantia") filas = filas.filter((i) => i.pagadoGar > 0);
  else if (f.rec) filas = filas.filter((i) => i.rec.texto === f.rec);

  const porVencer = info.filter((i) => i.gar.clase === "warn").length;
  const reemplazo = info.filter((i) => i.rec.clase === "bad").length;
  const pagado = info.reduce((s, i) => s + i.pagadoGar, 0);

  return (
    <main className="wrap">
      <div className="head-row">
        <div>
          <p className="eyebrow">Panel de mantenimiento</p>
          <h1 className="page-h">Activos y garantías</h1>
        </div>
        <Link className="btn" href="/admin/exportar?tabla=activos">Descargar CSV</Link>
      </div>

      {f.ok && <div className="note ok" style={{ marginBottom: 14 }}>Equipo dado de alta como {f.ok}. Imprime ese código en su etiqueta.</div>}
      {f.error && <div className="note bad" style={{ marginBottom: 14 }}>No se pudo guardar: {f.error}</div>}

      <div className="kpis">
        <div className="kpi"><span className="eyebrow">Equipos activos</span><span className="v">{info.filter((i) => i.x.activo).length}</span><span className="s">Valor {mxn(info.reduce((s, i) => s + Number(i.x.costo), 0))}</span></div>
        <div className="kpi"><span className="eyebrow">Garantías por vencer</span><span className="v" style={{ color: porVencer ? "var(--warn)" : undefined }}>{porVencer}</span><span className="s">En los próximos 60 días</span></div>
        <div className="kpi"><span className="eyebrow">Evaluar reemplazo</span><span className="v" style={{ color: reemplazo ? "var(--bad)" : undefined }}>{reemplazo}</span><span className="s">Reparaciones ≥ 50% del costo o al final de su vida útil</span></div>
        <div className="kpi"><span className="eyebrow">Pagado en garantía</span><span className="v" style={{ color: pagado ? "var(--bad)" : undefined }}>{mxn(pagado)}</span><span className="s">Correctivos con garantía vigente: reclamar</span></div>
      </div>

      <section className="card" style={{ marginBottom: 18 }}>
        <h3>Dar de alta equipo</h3>
        <p className="sub">Si dejas el código vacío se genera solo (ej. PK-CAF-004). Ese código va en la etiqueta del equipo.</p>
        <form action={crearActivo} className="inline-form">
          <label className="field">Código (opcional)<input id="a-id" name="id" placeholder="PK-CAF-004" /></label>
          <label className="field">Sucursal
            <select id="a-suc" name="sucursal_id" required defaultValue="">
              <option value="" disabled>Elige</option>
              {zonas.map((z) => <optgroup key={z} label={z}>{sucursales.filter((s) => s.zona === z).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</optgroup>)}
            </select>
          </label>
          <label className="field">Equipo
            <select id="a-eq" name="equipo" required defaultValue="">
              <option value="" disabled>Elige</option>
              {(eqs ?? []).map((e) => <option key={e.nombre as string}>{e.nombre as string}</option>)}
            </select>
          </label>
          <label className="field">Marca<input id="a-marca" name="marca" /></label>
          <label className="field">Modelo<input id="a-modelo" name="modelo" /></label>
          <label className="field">Serie<input id="a-serie" name="serie" /></label>
          <label className="field">Costo (MXN)<input id="a-costo" name="costo" type="number" min="0" step="0.01" required /></label>
          <label className="field">Vida útil (años)<input id="a-vida" name="vida_anios" type="number" min="1" defaultValue={8} /></label>
          <label className="field">Fecha de compra<input id="a-compra" name="fecha_compra" type="date" /></label>
          <label className="field">Garantía hasta<input id="a-gar" name="garantia_hasta" type="date" /></label>
          <label className="field">Proveedor de garantía
            <select id="a-prov" name="proveedor_id" defaultValue=""><option value="">Ninguno</option>{(prov ?? []).map((p) => <option key={p.id as number} value={p.id as number}>{p.nombre as string}</option>)}</select>
          </label>
          <button className="btn primary" type="submit">Dar de alta</button>
        </form>
      </section>

      <form className="toolbar" method="get">
        <label className="field">Zona<select id="f-zona" name="zona" defaultValue={f.zona ?? ""}><option value="">Todas</option>{zonas.map((z) => <option key={z}>{z}</option>)}</select></label>
        <label className="field">Equipo<select id="f-eq" name="equipo" defaultValue={f.equipo ?? ""}><option value="">Todos</option>{(eqs ?? []).map((e) => <option key={e.nombre as string}>{e.nombre as string}</option>)}</select></label>
        <label className="field">Recomendación
          <select id="f-rec" name="rec" defaultValue={f.rec ?? ""}>
            <option value="">Todas</option><option>Evaluar reemplazo</option><option>Vigilar</option><option>Reparar</option><option value="garantia">Pagado en garantía</option>
          </select>
        </label>
        <label className="field">Dados de baja<select id="f-bajas" name="bajas" defaultValue={f.bajas ?? ""}><option value="">Ocultar</option><option value="1">Mostrar</option></select></label>
        <button className="btn primary" type="submit">Filtrar</button>
      </form>

      {filas.length ? (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Código</th><th>Sucursal</th><th>Equipo</th><th>Antigüedad</th><th>Garantía</th><th className="r">Reparaciones</th><th>Recomendación</th></tr></thead>
            <tbody>
              {filas.map(({ x, total, gar, rec, pagadoGar }) => {
                const pct = x.costo > 0 ? (total / Number(x.costo)) * 100 : 0;
                const edad = edadAnios(x.fecha_compra, h);
                return (
                  <tr key={x.id} style={x.activo ? undefined : { opacity: 0.55 }}>
                    <td className="num"><Link href={`/admin/activos/${x.id}`}><b>{x.id}</b></Link></td>
                    <td>{sucPorId.get(x.sucursal_id)?.nombre}</td>
                    <td>{x.equipo}<br /><small style={{ color: "var(--muted)" }}>{[x.marca, x.modelo].filter(Boolean).join(" ") || "—"}</small></td>
                    <td className="num">{edad === null ? "—" : `${edad.toFixed(1)} / ${x.vida_anios} años`}</td>
                    <td><span className={`pill ${gar.clase}`}>{gar.texto}</span>{pagadoGar > 0 && <> <span className="pill bad">Pagado en garantía</span></>}</td>
                    <td className="r">
                      <span className="num">{mxn(total)}</span>
                      <div className="bar" style={{ marginTop: 4 }}><i className={pct >= 50 ? "bad" : pct >= 30 ? "warn" : ""} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                      <small style={{ color: "var(--muted)" }}>{pct.toFixed(0)}% de {mxn(Number(x.costo))}</small>
                    </td>
                    <td><span className={`pill ${rec.clase}`}>{x.activo ? rec.texto : "Dado de baja"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card"><h3>Sin equipos registrados</h3><p className="sub">Da de alta los equipos de cada sucursal. Con el código podrás ligar hojas, gastos y preventivos a cada equipo.</p></div>
      )}
    </main>
  );
}
