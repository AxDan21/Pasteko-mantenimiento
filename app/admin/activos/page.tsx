import Link from "next/link";
import BuscarEnLista from "@/components/BuscarEnLista";
import Desplegable from "@/components/Desplegable";
import IconoUI from "@/components/IconoUI";
import { Estado } from "@/components/Insignias";
import Kpi from "@/components/Kpi";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { acumuladoPorActivo } from "@/lib/datos";
import { mxn } from "@/lib/format";
import { edadAnios, estadoGarantia, hoy, recomendacion } from "@/lib/panel";
import type { Activo } from "@/lib/types";
import { crearActivo } from "../acciones-modulos";
import PanelEquipo from "@/components/PanelEquipo";
import Seccion from "@/components/Seccion";
import { vistasEquipos } from "@/lib/secciones";

type F = { zona?: string; suc?: string; equipo?: string; rec?: string; bajas?: string; nuevo?: string; sel?: string; ok?: string; error?: string };

const RECS: [string, string][] = [["", "Todas"], ["validar", "Por validar (censo)"], ["Evaluar reemplazo", "Evaluar reemplazo"], ["Vigilar", "Vigilar"], ["Reparar", "Reparar"], ["garantia", "Pagado en garantía"]];

export default async function Activos({ searchParams }: { searchParams: Promise<F> }) {
  await requireAdmin();
  const f = await searchParams;
  const supabase = await createClient();
  const h = hoy();
  const [{ data: a, error }, { data: suc }, { data: eqs }, { data: prov }, acum, vistas] = await Promise.all([
    supabase.from("activos").select("*").order("id"),
    supabase.from("sucursales").select("id, nombre, zona").order("zona").order("nombre"),
    supabase.from("equipos").select("nombre").eq("vigente", true).order("orden"),
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
    acumuladoPorActivo(supabase),
    vistasEquipos(supabase),
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
  // Indicadores del ámbito elegido (zona de la barra superior)
  const ambito = f.zona ? info.filter((i) => sucPorId.get(i.x.sucursal_id)?.zona === f.zona) : info;
  let filas = ambito;
  if (f.suc) filas = filas.filter((i) => i.x.sucursal_id === Number(f.suc));
  if (f.equipo) filas = filas.filter((i) => i.x.equipo === f.equipo);
  if (f.rec === "garantia") filas = filas.filter((i) => i.pagadoGar > 0);
  else if (f.rec === "validar") filas = filas.filter((i) => !i.x.validado);
  else if (f.rec) filas = filas.filter((i) => i.rec.texto === f.rec);
  const porValidar = ambito.filter((i) => !i.x.validado).length;

  const porVencer = ambito.filter((i) => i.gar.clase === "warn").length;
  const reemplazo = ambito.filter((i) => i.rec.clase === "bad").length;
  const pagado = ambito.reduce((s, i) => s + i.pagadoGar, 0);
  const enUso = ambito.filter((i) => i.x.activo);

  // Filtros vigentes, para abrir y cerrar el panel de detalle sin perderlos.
  const filtros = new URLSearchParams(Object.entries({ zona: f.zona, suc: f.suc, equipo: f.equipo, rec: f.rec, bajas: f.bajas }).filter(([, v]) => v) as [string, string][]);
  const conSel = (id?: string) => { const q = new URLSearchParams(filtros); if (id) q.set("sel", id); const t = q.toString(); return t ? `/admin/activos?${t}` : "/admin/activos"; };
  const conRec = (rec: string) => { const q = new URLSearchParams(filtros); q.delete("sel"); if (rec) q.set("rec", rec); else q.delete("rec"); const t = q.toString(); return t ? `/admin/activos?${t}` : "/admin/activos"; };
  const hayFiltros = !!(f.suc || f.equipo || f.rec || f.bajas);

  return (
    <main className="wrap eqp">
      <Seccion
        titulo="Equipos"
        sub="Inventario con garantías y costo de reparaciones, el censo que hacen los supervisores y las etiquetas QR."
        vistas={vistas}
        activa="inventario"
        acciones={<Link className="btn" href="/admin/exportar?tabla=activos">Descargar CSV</Link>}
      />

      {f.suc && (
        <div className="note ok eqp-nota eqp-fila">
          <span>Mostrando los equipos de {sucPorId.get(Number(f.suc))?.nombre ?? "la sucursal"}.</span>
          <Link href={f.zona ? `/admin/activos?zona=${encodeURIComponent(f.zona)}` : "/admin/activos"}>Ver todos</Link>
        </div>
      )}
      {f.ok && <div className="note ok eqp-nota" role="status">Equipo dado de alta como {f.ok}. Imprime ese código en su etiqueta.</div>}
      {f.error && <div className="note bad eqp-nota" role="alert">No se pudo guardar: {f.error}</div>}

      {porValidar > 0 && (
        <Link href="/admin/activos/censo#validar" className="note warn censo-banner eqp-nota">
          <span><IconoUI nombre="censo" tam={16} grosor={2} /> {porValidar} equipo{porValidar !== 1 ? "s" : ""} registrado{porValidar !== 1 ? "s" : ""} por supervisores por validar.</span>
          <b>Revisar <IconoUI nombre="derecha" tam={14} grosor={2.4} /></b>
        </Link>
      )}

      <div className="rz-kpis srv-kpis">
        <Kpi icono="equipos" tono="info" titulo="Equipos en uso" valor={enUso.length} detalle={`valor ${mxn(enUso.reduce((s, i) => s + Number(i.x.costo), 0))}`} />
        <Kpi icono="escudo" tono="warn" titulo="Garantías por vencer" valor={porVencer} detalle="en los próximos 60 días" />
        <Kpi href={conRec("Evaluar reemplazo")} icono="falla" tono="bad" titulo="Evaluar reemplazo" valor={reemplazo} alerta={reemplazo > 0}
          detalle="reparaciones ≥ 50% del costo o al final de su vida útil" />
        <Kpi href={conRec("garantia")} icono="dinero" tono="marca" titulo="Pagado en garantía" valor={mxn(pagado)} alerta={pagado > 0}
          detalle={pagado ? "correctivos con garantía vigente: reclamar" : "Nada pagado en garantía"} />
      </div>

      <Desplegable id="nuevo" titulo="Dar de alta equipo" abierto={!!f.nuevo || !!f.error}
        detalle="Si dejas el código vacío se genera solo (ej. PK-CAF-004). Al guardar se abre su ficha con la etiqueta QR.">
        <form action={crearActivo} className="prv-form">
          <fieldset>
            <legend>Identificación</legend>
            <label className="field">Sucursal
              <select name="sucursal_id" required defaultValue="">
                <option value="" disabled>Elige</option>
                {zonas.map((z) => <optgroup key={z} label={z}>{sucursales.filter((s) => s.zona === z).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</optgroup>)}
              </select>
            </label>
            <label className="field">Equipo
              <select name="equipo" required defaultValue="">
                <option value="" disabled>Elige</option>
                {(eqs ?? []).map((e) => <option key={e.nombre as string}>{e.nombre as string}</option>)}
              </select>
            </label>
            <label className="field">Código (opcional)<input name="id" placeholder="PK-CAF-004" /></label>
            <label className="field">Marca<input name="marca" /></label>
            <label className="field">Modelo<input name="modelo" /></label>
            <label className="field">Serie<input name="serie" /></label>
          </fieldset>
          <fieldset>
            <legend>Costo y garantía</legend>
            <label className="field">Costo (MXN)<input name="costo" type="number" min="0" step="0.01" required /></label>
            <label className="field">Vida útil (años)<input name="vida_anios" type="number" min="1" defaultValue={8} /></label>
            <label className="field">Fecha de compra<input name="fecha_compra" type="date" /></label>
            <label className="field">Garantía hasta<input name="garantia_hasta" type="date" /></label>
            <label className="field">Proveedor de garantía
              <select name="proveedor_id" defaultValue=""><option value="">Ninguno</option>{(prov ?? []).map((p) => <option key={p.id as number} value={p.id as number}>{p.nombre as string}</option>)}</select>
            </label>
            <label className="field">Garantía (PDF o foto)<input name="garantia" type="file" accept="application/pdf,image/*" /><span className="ayuda">Opcional</span></label>
          </fieldset>
          <div className="prv-form-pie"><button className="btn primary" type="submit">Dar de alta</button></div>
        </form>
      </Desplegable>

      {/* La zona se elige en la barra superior; aquí se conserva para no perderla al filtrar. */}
      <div className="prv-barra">
        <nav className="tkb-filtros" aria-label="Recomendación">
          {RECS.map(([v, n]) => (
            <Link key={v || "todas"} href={conRec(v)} aria-current={(f.rec ?? "") === v ? "page" : undefined}>
              {n}{v === "validar" && porValidar > 0 && <span className="srv-n">{porValidar}</span>}
            </Link>
          ))}
        </nav>
        <form className="prv-filtros" method="get">
          {f.zona && <input type="hidden" name="zona" value={f.zona} />}
          {f.rec && <input type="hidden" name="rec" value={f.rec} />}
          {f.suc && <input type="hidden" name="suc" value={f.suc} />}
          <label className="field">Tipo de equipo<select name="equipo" defaultValue={f.equipo ?? ""}><option value="">Todos</option>{(eqs ?? []).map((e) => <option key={e.nombre as string}>{e.nombre as string}</option>)}</select></label>
          <label className="field">Dados de baja<select name="bajas" defaultValue={f.bajas ?? ""}><option value="">Ocultar</option><option value="1">Mostrar</option></select></label>
          <button className="btn" type="submit">Aplicar</button>
          {hayFiltros && <Link className="btn ghost" href={f.zona ? `/admin/activos?zona=${encodeURIComponent(f.zona)}` : "/admin/activos"}>Quitar</Link>}
        </form>
      </div>

      {error ? (
        <div className="ui-error"><b>No se pudieron cargar los equipos</b><p>Esto no significa que no haya. Recarga la página para intentarlo de nuevo.</p></div>
      ) : filas.length ? (
        <>
          <div className="prv-buscar"><BuscarEnLista key={`${f.rec}-${f.equipo}`} objetivo="eqp-filas" placeholder="Código, sucursal, equipo, marca o serie" etiqueta="Buscar equipos" /></div>
          <div className={`lst${f.sel ? " con-panel" : ""}`}>
            <div className="tbl-wrap">
              <table className="tbl-sel tbl-cards">
                <thead><tr><th>Código</th><th>Sucursal</th><th>Equipo</th><th className="ocultable">Antigüedad</th><th className="ocultable">Garantía</th><th className="r ocultable">Reparaciones</th><th className="ocultable">Recomendación</th></tr></thead>
                <tbody id="eqp-filas">
                  {filas.map(({ x, total, gar, rec, pagadoGar }) => {
                    const pct = x.costo > 0 ? (total / Number(x.costo)) * 100 : 0;
                    const edad = edadAnios(x.fecha_compra, h);
                    const s = sucPorId.get(x.sucursal_id);
                    return (
                      <tr key={x.id} className={x.activo ? undefined : "eqp-baja"} aria-selected={f.sel === x.id}
                        data-buscar={`${x.id} ${s?.nombre ?? ""} ${s?.zona ?? ""} ${x.equipo} ${x.descripcion ?? ""} ${x.marca ?? ""} ${x.modelo ?? ""} ${x.serie ?? ""}`}>
                        <td data-label="Código" className="num"><Link href={conSel(x.id)} scroll={false} title="Ver detalle"><b>{x.id}</b></Link></td>
                        <td data-label="Sucursal">{s?.nombre}</td>
                        <td data-label="Equipo">{x.descripcion || x.equipo}<small className="srv-sub">{x.descripcion ? `${x.equipo} · ` : ""}{[x.marca, x.modelo].filter(Boolean).join(" ") || "—"}</small></td>
                        <td data-label="Antigüedad" className="num ocultable">{edad === null ? "—" : `${edad.toFixed(1)} / ${x.vida_anios} años`}</td>
                        <td data-label="Garantía" className="ocultable">
                          <span className="eqp-pills">
                            <Estado tono={gar.clase}>{gar.texto}</Estado>
                            {x.garantia_path && <Estado tono="neutral">PDF</Estado>}
                            {pagadoGar > 0 && <Estado tono="bad">Pagado en garantía</Estado>}
                          </span>
                        </td>
                        <td data-label="Reparaciones" className="r ocultable">
                          <span className="num">{mxn(total)}</span>
                          <div className="bar eqp-bar"><i className={pct >= 50 ? "bad" : pct >= 30 ? "warn" : ""} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
                          <small className="srv-sub">{pct.toFixed(0)}% de {mxn(Number(x.costo))}</small>
                        </td>
                        <td data-label="Recomendación" className="ocultable">{x.validado === false ? <Estado tono="warn">Por validar</Estado> : <Estado tono={x.activo ? rec.clase : "neutral"}>{x.activo ? rec.texto : "Dado de baja"}</Estado>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {f.sel && <PanelEquipo id={f.sel} cerrar={conSel()} />}
          </div>
        </>
      ) : (
        <div className="ui-vacio">
          <b>{hayFiltros || f.zona ? "Sin equipos con estos filtros" : "Sin equipos registrados"}</b>
          <p>{hayFiltros || f.zona ? "Cambia la zona en la barra superior o quita filtros." : "Da de alta los equipos de cada sucursal. Con el código podrás ligar hojas, gastos y preventivos a cada equipo."}</p>
        </div>
      )}
    </main>
  );
}
