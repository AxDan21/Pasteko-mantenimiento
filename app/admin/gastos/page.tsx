import Link from "next/link";
import BotonIcono, { IconoAccion } from "@/components/BotonIcono";
import BuscarEnLista from "@/components/BuscarEnLista";
import Encabezado from "@/components/Encabezado";
import { Anillo, BarrasH } from "@/components/Graficas";
import IconoUI from "@/components/IconoUI";
import { Estado } from "@/components/Insignias";
import Kpi from "@/components/Kpi";
import CopiarTexto from "@/components/CopiarTexto";
import PaqueteFacturas, { type ArchivoFactura } from "@/components/PaqueteFacturas";
import RegistroCfdi from "@/components/RegistroCfdi";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { enlaces, leerAjustes } from "@/lib/datos";
import { mxn } from "@/lib/format";
import { CATEGORIAS_EXTRA, diasEntre, fCorta, hoy, mesValido, nombreMes, rangoFechas } from "@/lib/panel";
import type { Gasto, GastoV } from "@/lib/types";
import { borrarGasto, guardarAjustes, marcarPagos, pasarAPago } from "../acciones-modulos";

const ORIGEN: Record<string, [string, string]> = { hoja: ["Hoja de servicio", "neutral"], gasto: ["Gasto", "warn"], caja: ["Caja chica", "ok"] };
type F = { mes?: string; zona?: string; pago?: string; sel?: string; ok?: string; error?: string };
type Fila = GastoV & { partes?: GastoV[] };

/** Junta en un solo renglón los conceptos que vienen de la misma factura (se pagan juntos). */
function porFactura(lista: GastoV[]): Fila[] {
  const out: Fila[] = [];
  const grupos = new Map<string, Fila>();
  for (const x of lista) {
    const u = x.origen === "gasto" ? x.factura_uuid : null;
    if (!u) { out.push(x); continue; }
    const g = grupos.get(u);
    if (!g) {
      const nuevo: Fila = { ...x, partes: [x] };
      grupos.set(u, nuevo);
      out.push(nuevo);
    } else {
      g.partes!.push(x);
      g.monto = Number(g.monto) + Number(x.monto);
    }
  }
  for (const g of grupos.values()) {
    if (g.partes!.length > 1) {
      g.concepto = `${g.factura_ref ?? "Factura"} · ${g.partes!.length} conceptos`;
      g.categoria = Array.from(new Set(g.partes!.map((p) => p.categoria))).join(", ");
    } else delete g.partes;
  }
  return out;
}

export default async function Gastos({ searchParams }: { searchParams: Promise<F> }) {
  await requireAdmin();
  const f = await searchParams;
  const mes = mesValido(f.mes);
  const [ini, fin] = rangoFechas(mes);
  const h = hoy();
  const supabase = await createClient();

  let q = supabase.from("v_gastos").select("*").gte("fecha", ini).lt("fecha", fin).order("fecha", { ascending: false });
  if (f.zona) q = q.eq("zona", f.zona);
  const [ajustes, { data: v }, { data: pend }, { data: gm }, { data: suc }, { data: eqs }, { data: prov }, { data: act }, { data: hist }, { data: arch }] = await Promise.all([
    leerAjustes(supabase),
    q,
    supabase.from("v_gastos").select("*").eq("pagado", false).order("fecha"),
    supabase.from("gastos").select("id, factura_path").gte("fecha", ini).lt("fecha", fin),
    supabase.from("sucursales").select("id, nombre, zona").order("zona").order("nombre"),
    supabase.from("equipos").select("nombre, categoria").eq("vigente", true).order("orden"),
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("activos").select("id").eq("activo", true).order("id"),
    supabase.from("gastos").select("concepto, categoria").order("creado", { ascending: false }).limit(500),
    supabase.from("gastos").select("id, factura_path, xml_path").eq("pagado", false).not("factura_uuid", "is", null),
  ]);
  const delMes = (v ?? []) as GastoV[];
  const filas = f.pago === "Pendiente" ? delMes.filter((x) => !x.pagado) : f.pago === "Pagado" ? delMes.filter((x) => x.pagado) : delMes;
  const pendientes = porFactura((pend ?? []) as GastoV[]);
  const porPasar = pendientes.filter((x) => !x.solicitado_pago);
  const enTramite = pendientes.filter((x) => x.solicitado_pago).sort((a, b) => (a.solicitado_pago ?? "").localeCompare(b.solicitado_pago ?? ""));
  const suma = (l: Fila[]) => l.reduce((s, x) => s + Number(x.monto), 0);
  // PDF y XML de las facturas pendientes (se borran al pagarlas)
  const archivos = new Map(((arch ?? []) as { id: number; factura_path: string | null; xml_path: string | null }[]).map((x) => [String(x.id), x]));
  const urlsPend = await enlaces(supabase, "facturas", Array.from(archivos.values()).flatMap((x) => [x.factura_path, x.xml_path]));
  const archivosDe = (x: Fila) => {
    const a = x.origen === "gasto" ? archivos.get(x.ref) : undefined;
    return { pdf: a?.factura_path ? urlsPend.get(a.factura_path) ?? null : null, xml: a?.xml_path ? urlsPend.get(a.xml_path) ?? null : null };
  };
  const paquete: ArchivoFactura[] = porPasar
    .filter((x) => x.origen === "gasto" && x.factura_uuid)
    .map((x) => ({ nombre: `${x.beneficiario ?? "Proveedor"} - ${x.factura_ref ?? x.factura_uuid} - ${mxn(Number(x.monto))}`, ...archivosDe(x) }));
  const facturas = new Map(((gm ?? []) as Pick<Gasto, "id" | "factura_path">[]).map((x) => [String(x.id), x.factura_path]));
  const urls = await enlaces(supabase, "facturas", Array.from(facturas.values()));
  const sucursales = (suc ?? []) as { id: number; nombre: string; zona: string }[];
  const categorias = Array.from(new Set([...(eqs ?? []).map((e) => e.categoria as string), ...CATEGORIAS_EXTRA]));

  const hermanos = new Map<string, number>();
  delMes.forEach((x) => { if (x.origen === "gasto" && x.factura_uuid) hermanos.set(x.factura_uuid, (hermanos.get(x.factura_uuid) ?? 0) + 1); });
  const total = delMes.reduce((s, x) => s + Number(x.monto), 0);
  const pendMes = delMes.filter((x) => !x.pagado).reduce((s, x) => s + Number(x.monto), 0);
  const porCat = new Map<string, number>();
  delMes.forEach((x) => porCat.set(x.categoria, (porCat.get(x.categoria) ?? 0) + Number(x.monto)));
  const cats = Array.from(porCat.entries()).sort((a, b) => b[1] - a[1]);
  const restante = ajustes.presupuesto_mensual - total;

  // Pendientes de pago (todos los meses)
  const totalPend = pendientes.reduce((s, x) => s + Number(x.monto), 0);
  const masAntiguo = pendientes[0] ? diasEntre(pendientes[0].fecha, h) : 0;
  const porBenef = new Map<string, { monto: number; n: number }>();
  pendientes.forEach((x) => {
    const k = x.beneficiario ?? "Sin proveedor asignado";
    const e = porBenef.get(k) ?? { monto: 0, n: 0 };
    e.monto += Number(x.monto); e.n += 1;
    porBenef.set(k, e);
  });
  const benef = Array.from(porBenef.entries()).sort((a, b) => b[1].monto - a[1].monto);
  const texto =
    `Mantenimiento · trabajos realizados pendientes de pago (corte ${fCorta(h)})\n` +
    `Total pendiente: ${mxn(totalPend)} en ${pendientes.length} pago${pendientes.length !== 1 ? "s" : ""}\n` +
    `En trámite con Tesorería: ${mxn(suma(enTramite))} · Por pasar a pago: ${mxn(suma(porPasar))}\n\n` +
    benef.map(([b, e]) => `${b}: ${mxn(e.monto)} (${e.n})`).join("\n") +
    "\n\nDetalle:\n" +
    pendientes.map((x) => `${fCorta(x.fecha)} | ${x.sucursal ?? "General"} | ${x.concepto} | ${x.beneficiario ?? "—"} | ${mxn(Number(x.monto))} | ${diasEntre(x.fecha, h)} días | ${x.solicitado_pago ? `en trámite desde ${fCorta(x.solicitado_pago)}` : "por pasar a pago"}` +
      (x.partes ? x.partes.map((p) => `\n    · ${p.categoria}: ${p.concepto.split(" · ")[0]} ${mxn(Number(p.monto))}`).join("") : "")).join("\n");
  const seleccion = f.sel ? delMes.find((x) => `${x.origen}:${x.ref}` === f.sel) ?? null : null;
  const volver = `/admin/gastos?mes=${mes}${f.zona ? `&zona=${encodeURIComponent(f.zona)}` : ""}${f.pago ? `&pago=${f.pago}` : ""}`;
  const conPago = (pago: string) => `/admin/gastos?${new URLSearchParams({ mes, ...(f.zona ? { zona: f.zona } : {}), ...(pago ? { pago } : {}) })}#lista`;
  const mas30 = pendientes.filter((x) => diasEntre(x.fecha, h) > 30).reduce((s, x) => s + Number(x.monto), 0);

  const okMsg = f.ok === "1" ? "Gasto registrado." : f.ok?.startsWith("partidas-") ? `Factura registrada como ${f.ok.slice(9)} gastos, uno por concepto.` : f.ok === "pendiente" ? "Concepto regresado a pendiente de pago." : f.ok?.startsWith("pagados-") ? `${f.ok.slice(8)} concepto(s) marcados como pagados.` : f.ok?.startsWith("pasadas-") ? `${f.ok.slice(8)} concepto(s) pasados a pago. Sus PDF y XML se borraron.` : f.ok === "regresadas" ? "Regresadas a «por pasar a pago»." : null;

  return (
    <main className="wrap gst">
      <Encabezado
        titulo="Gastos"
        sub={`${nombreMes(mes)}${f.zona ? ` · ${f.zona}` : ""}: hojas de servicio de proveedores, gastos con factura y caja chica. El mes y la zona se cambian en la barra superior.`}
        acciones={<Link className="btn" href={`/admin/exportar?tabla=gastos&mes=${mes}`}>Descargar CSV del mes</Link>}
      />

      {okMsg && <div className="note ok eqp-nota" role="status">{okMsg}</div>}
      {f.error && <div className="note bad eqp-nota" role="alert">{f.error}</div>}

      <div className="rz-kpis srv-kpis">
        <Kpi icono="dinero" tono="marca" titulo="Realizado del mes" valor={mxn(total)} detalle={`pagado ${mxn(total - pendMes)} · pendiente ${mxn(pendMes)}`} />
        <Kpi icono="meta" tono={restante < 0 ? "bad" : "ok"} titulo="Presupuesto" valor={mxn(restante)} alerta={restante < 0}
          detalle={`${restante < 0 ? "excedido" : "disponible"} de ${mxn(ajustes.presupuesto_mensual)}`}
          grafica={<Anillo pct={(total / (ajustes.presupuesto_mensual || 1)) * 100} color={restante < 0 ? "var(--bad)" : "var(--chart-1)"} tam={56} grosor={7}><b className="num">{Math.round((total / (ajustes.presupuesto_mensual || 1)) * 100)}%</b></Anillo>} />
        <Kpi href="#pendientes" icono="pago" tono="warn" titulo="Pendiente de pago" valor={mxn(totalPend)}
          detalle={`${pendientes.length} pago${pendientes.length !== 1 ? "s" : ""} · todos los meses`} />
        <Kpi href="#pendientes" icono="reloj" tono="bad" titulo="Con más de 30 días" valor={mxn(mas30)} alerta={mas30 > 0} detalle="priorizar con dirección" />
      </div>

      <div className="panel-grid gst-alta">
        <section className="card" id="nuevo">
          <h3>Registrar gasto</h3>
          <p className="sub">Con el XML de la factura. Las hojas de servicio y la caja chica se suman solas.</p>
          <RegistroCfdi
            hoy={h}
            proveedores={(prov ?? []) as { id: number; nombre: string }[]}
            sucursales={sucursales}
            activos={(act ?? []).map((x) => x.id as string)}
            categorias={categorias}
            equipos={(eqs ?? []) as { nombre: string; categoria: string }[]}
            historial={(hist ?? []) as { concepto: string; categoria: string }[]}
          />
        </section>
        <section className="card gst-pres">
          <h3>Presupuesto de {nombreMes(mes)}</h3>
          <p className="sub">Realizado {mxn(total)} de {mxn(ajustes.presupuesto_mensual)}</p>
          <div className="gst-barra" role="img" aria-label={`Pagado ${mxn(total - pendMes)}, pendiente de pago ${mxn(pendMes)}, presupuesto ${mxn(ajustes.presupuesto_mensual)}`}>
            <i className={restante < 0 ? "bad" : "ok"} style={{ width: `${Math.min(((total - pendMes) / (ajustes.presupuesto_mensual || 1)) * 100, 100)}%` }} />
            <i className="warn" style={{ width: `${Math.min((pendMes / (ajustes.presupuesto_mensual || 1)) * 100, 100)}%` }} />
          </div>
          <div className="legend">
            <span><i className="gst-ley ok" />Pagado {mxn(total - pendMes)}</span>
            <span><i className="gst-ley warn" />Pendiente {mxn(pendMes)}</span>
            <span><i className="gst-ley libre" />{restante < 0 ? `Excedido ${mxn(-restante)}` : `Disponible ${mxn(restante)}`}</span>
          </div>
          <details className="gst-montos">
            <summary>Cambiar presupuesto y fondo de caja chica</summary>
            <form action={guardarAjustes} className="gst-montos-f">
              <label className="field">Presupuesto mensual<input name="presupuesto_mensual" type="number" min="0" step="100" defaultValue={ajustes.presupuesto_mensual} /></label>
              <label className="field">Fondo de caja chica<input name="fondo_caja_chica" type="number" min="0" step="100" defaultValue={ajustes.fondo_caja_chica} /></label>
              <button className="btn" type="submit">Guardar montos</button>
            </form>
          </details>
        </section>
      </div>

      {/* ---------- Realizado pendiente de pago ---------- */}
      <section className="card pend-card gst-pend" id="pendientes">
        <div className="gst-pend-h">
          <div>
            <p className="eyebrow">Para dirección</p>
            <h2 className="ref-h">Realizado pendiente de pago</h2>
            <p className="sub eqp-cab-s">Trabajos y compras ya hechos que todavía no se pagan, de todos los meses.</p>
          </div>
          <div className="secc-acc">
            <CopiarTexto texto={pendientes.length ? texto : ""} etiqueta="Copiar resumen para dirección" />
            <Link className="btn" href="/admin/exportar?tabla=pendientes">Descargar CSV</Link>
          </div>
        </div>

        {pendientes.length > 0 && (
          <div className="gst-flujo">
            <div className="gst-flujo-pasos">
              <div className="gst-paso"><span className="gst-paso-n">1</span><span><small>Por pasar a pago</small><b className="num">{mxn(suma(porPasar))}</b><small>{porPasar.length} por entregar a Tesorería</small></span></div>
              <IconoUI nombre="derecha" tam={18} grosor={2} className="gst-flecha" />
              <div className="gst-paso"><span className="gst-paso-n">2</span><span><small>En trámite</small><b className="num">{mxn(suma(enTramite))}</b><small>{enTramite.length ? `${enTramite.length} esperando · desde ${fCorta(enTramite[0].solicitado_pago!)}` : "Nada en trámite"}</small></span></div>
              <IconoUI nombre="derecha" tam={18} grosor={2} className="gst-flecha" />
              <div className="gst-paso fin"><span className="gst-paso-n"><IconoUI nombre="check" tam={14} grosor={2.6} /></span><span><small>Total pendiente</small><b className="num">{mxn(totalPend)}</b><small>el más antiguo de {masAntiguo} días</small></span></div>
            </div>
            <div className="gst-benef">
              <h3 className="rz-h4">Por proveedor o técnico</h3>
              <BarrasH descripcion="Pendiente de pago por proveedor o técnico" datos={benef.slice(0, 5).map(([b, e], i) => ({ etiqueta: b, valor: e.monto, texto: mxn(e.monto), detalle: `${e.n} pago${e.n !== 1 ? "s" : ""}`, color: i === 0 ? "var(--warn)" : "var(--warn-soft)" }))} />
            </div>
          </div>
        )}

        {!pendientes.length && <div className="ui-vacio"><b>Todo pagado</b><p>No hay trabajos ni compras pendientes de pago.</p></div>}

        {pendientes.length > 0 && (
        <details className="pend-det" open={!!f.ok?.match(/^(pasadas|regresadas|pagados|pendiente)/) || !!f.error}>
          <summary>
            <span>Ver detalle por etapa</span>
            <small>{porPasar.length} por pasar a pago · {enTramite.length} en trámite</small>
            <svg className="chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </summary>

        {porPasar.length > 0 && (
          <div className="etapa">
            <div className="etapa-head">
              <span className="etapa-n">1</span>
              <div><h4>Por pasar a pago</h4><small>{porPasar.length} · {mxn(suma(porPasar))} · imprime y manda por correo a Tesorería</small></div>
            </div>
            <PaqueteFacturas facturas={paquete} etiqueta={fCorta(h)} />
            <form action={pasarAPago}>
              <input type="hidden" name="volver" value={volver} />
              <TablaPend lista={porPasar} hoy={h} archivosDe={archivosDe} />
              <div className="pay-bar">
                <span className="sub tkp-nota">Marca las que ya entregaste impresas y mandaste por correo. <b>Sus PDF y XML se borran</b>: descárgalos o imprímelos antes.</span>
                <label className="field">Fecha de entrega<input name="fecha_solicitud" type="date" defaultValue={h} /></label>
                <button className="btn primary" type="submit">Pasar a pago las seleccionadas</button>
              </div>
            </form>
          </div>
        )}

        {enTramite.length > 0 && (
          <div className="etapa">
            <div className="etapa-head">
              <span className="etapa-n">2</span>
              <div><h4>En trámite con Tesorería</h4><small>{enTramite.length} · {mxn(suma(enTramite))} · ya entregadas, esperando el pago</small></div>
            </div>
            <form action={marcarPagos}>
              <input type="hidden" name="volver" value={volver} />
              <TablaPend lista={enTramite} hoy={h} archivosDe={archivosDe} tramite />
              <div className="pay-bar">
                <span className="sub tkp-nota">Marca lo que Tesorería ya pagó (las facturas se pagan completas):</span>
                <label className="field">Fecha de pago<input id="p-fecha" name="fecha_pago" type="date" defaultValue={h} /></label>
                <label className="field">Referencia<input id="p-ref" name="referencia_pago" placeholder="Transferencia, cheque…" /></label>
                <button className="btn primary" type="submit">Marcar como pagadas</button>
                <button className="btn" type="submit" formAction={pasarAPago} name="deshacer" value="1">Regresar a «por pasar»</button>
              </div>
            </form>
          </div>
        )}
        </details>
        )}
      </section>

      <section className="dcard rz-card gst-cat" aria-labelledby="gst-cat">
        <header><div><h3 id="gst-cat">Por categoría</h3><p>{nombreMes(mes)} · total {mxn(total)}</p></div></header>
        {cats.length ? (
          <BarrasH descripcion={`Gasto por categoría en ${nombreMes(mes)}`} datos={cats.map(([c, n], i) => ({ etiqueta: c, valor: n, texto: mxn(n), color: i === 0 ? "var(--chart-1)" : "var(--brand-soft)" }))} />
        ) : <p className="sub">Sin gastos en este mes.</p>}
      </section>

      <div className="prv-barra" id="lista">
        <nav className="tkb-filtros" aria-label="Estado de pago">
          {([["", "Todos"], ["Pendiente", "Pendientes"], ["Pagado", "Pagados"]] as const).map(([v, n]) => (
            <Link key={v || "todos"} href={conPago(v)} aria-current={(f.pago ?? "") === v ? "page" : undefined}>{n}</Link>
          ))}
        </nav>
        {filas.length > 0 && <BuscarEnLista key={f.pago ?? ""} objetivo="gst-filas" placeholder="Concepto, sucursal, proveedor o categoría" etiqueta="Buscar gastos" />}
      </div>

      {filas.length ? (
        <div className={`lst${seleccion ? " con-panel" : ""}`}>
        <div className="tbl-wrap">
          <table className="tbl-sel tbl-cards">
            <thead><tr><th>Fecha</th><th className="ocultable">Origen</th><th>Sucursal</th><th className="ocultable">Categoría</th><th>Concepto</th><th className="r">Monto</th><th className="ocultable">Pago</th><th className="ocultable" /></tr></thead>
            <tbody id="gst-filas">
              {filas.map((x) => {
                const [o, oc] = ORIGEN[x.origen] ?? ["", "neutral"];
                const fac = x.origen === "gasto" ? facturas.get(x.ref) : null;
                const nFac = x.factura_uuid ? hermanos.get(x.factura_uuid) ?? 1 : 1;
                return (
                  <tr key={x.origen + x.ref} aria-selected={f.sel === `${x.origen}:${x.ref}`}
                    data-buscar={`${x.concepto} ${x.sucursal ?? "General"} ${x.zona ?? ""} ${x.categoria} ${x.tipo} ${x.beneficiario ?? ""} ${o} ${x.factura_ref ?? ""}`}>
                    <td data-label="Fecha" className="num nw">{fCorta(x.fecha).replace(/ \d{2}$/, "")}</td>
                    <td data-label="Origen" className="ocultable"><Estado tono={oc}>{o}</Estado></td>
                    <td data-label="Sucursal">{x.sucursal ?? <span className="srv-sub">General</span>}</td>
                    <td data-label="Categoría" className="ocultable">{x.categoria}<small className="srv-sub">{x.tipo}</small></td>
                    <td data-label="Concepto"><Link href={`${volver}&sel=${x.origen}:${x.ref}#lista`} scroll={false} title="Ver detalle">{x.concepto}</Link>{x.beneficiario && x.origen !== "caja" && <small className="srv-sub">{x.beneficiario}</small>}{nFac > 1 && <span className="fac-tag" title="Se paga y se borra junto con los demás conceptos de la factura">{x.factura_ref} · {nFac} conceptos · total {mxn(Number(x.factura_total ?? 0))}</span>}</td>
                    <td data-label="Monto" className="r num">{mxn(Number(x.monto))}</td>
                    <td data-label="Pago" className="ocultable">
                      {x.pagado ? (
                        <><Estado tono="ok">Pagado</Estado>{x.fecha_pago && <small className="srv-sub">{fCorta(x.fecha_pago)}{x.referencia_pago ? ` · ${x.referencia_pago}` : ""}</small>}</>
                      ) : <Estado tono="warn">Pendiente</Estado>}
                    </td>
                    <td className="r ocultable">
                      <div className="iacts">
                        {x.origen !== "caja" && (
                          <form action={marcarPagos}>
                            <input type="hidden" name="volver" value={volver} />
                            <input type="hidden" name="sel" value={`${x.origen}:${x.ref}`} />
                            <input type="hidden" name="pagado" value={String(!x.pagado)} />
                            {x.pagado
                              ? <BotonIcono icono="regresar" texto={nFac > 1 ? `Regresar factura a pendiente (${nFac} conceptos)` : "Regresar a pendiente"} />
                              : <BotonIcono icono="pagar" tono="ok" cuenta={nFac} texto={nFac > 1 ? `Marcar factura pagada hoy (${nFac} conceptos)` : "Marcar pagado hoy"} />}
                          </form>
                        )}
                        {fac && urls.get(fac) && (
                          <a className="ibtn" href={urls.get(fac)} target="_blank" rel="noopener noreferrer" title="Ver factura" aria-label="Ver factura"><IconoAccion nombre="factura" /></a>
                        )}
                        {x.origen === "gasto" && (
                          <form action={borrarGasto}>
                            <input type="hidden" name="id" value={x.ref} />
                            <BotonIcono icono="borrar" tono="danger" cuenta={nFac}
                              texto={nFac > 1 ? `Borrar factura (${nFac} conceptos)` : "Borrar gasto"}
                              confirmar={nFac > 1 ? `¿Borrar la factura completa (${nFac} conceptos)? No se puede deshacer.` : "¿Borrar este gasto? No se puede deshacer."} />
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {seleccion && (
          <PanelGasto
            x={seleccion}
            conceptos={seleccion.factura_uuid ? delMes.filter((y) => y.factura_uuid === seleccion.factura_uuid) : []}
            factura={seleccion.origen === "gasto" ? urls.get(facturas.get(seleccion.ref) ?? "") ?? null : null}
            volver={volver}
          />
        )}
        </div>
      ) : (
        <div className="ui-vacio"><b>Sin gastos en {nombreMes(mes)}{f.pago ? ` con estado ${f.pago.toLowerCase()}` : ""}</b><p>Registra el primero con «Registrar gasto» o espera a que los técnicos envíen hojas con costo.</p></div>
      )}
    </main>
  );
}

/** Tabla de pendientes de pago (etapa 1 o 2) con selección por factura. */
function TablaPend({ lista, hoy: h, archivosDe, tramite }: { lista: Fila[]; hoy: string; archivosDe: (x: Fila) => { pdf: string | null; xml: string | null }; tramite?: boolean }) {
  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th style={{ width: 36 }} /><th>Fecha</th><th className="r">Días</th><th>Origen</th><th>Sucursal</th><th>Concepto</th><th>Proveedor / técnico</th>
            {tramite && <th>Entregada</th>}<th className="r">Monto</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((x) => {
            const d = diasEntre(x.fecha, h);
            const [o, oc] = ORIGEN[x.origen] ?? ["", "neutral"];
            const a = archivosDe(x);
            const espera = x.solicitado_pago ? diasEntre(x.solicitado_pago, h) : 0;
            return (
              <tr key={x.origen + x.ref}>
                <td><input type="checkbox" name="sel" value={`${x.origen}:${x.ref}`} aria-label={`Seleccionar ${x.concepto}`} className="sel-chk" /></td>
                <td className="num nw">{fCorta(x.fecha).replace(/ \d{2}$/, "")}</td>
                <td className="r"><Estado tono={d > 30 ? "bad" : d > 15 ? "warn" : "neutral"}>{d}</Estado></td>
                <td><Estado tono={oc}>{o}</Estado></td>
                <td>{x.sucursal ?? "General"}</td>
                <td>
                  {x.origen === "hoja" ? <Link href={`/admin/hojas/${x.ref}`}>{x.concepto}</Link> : x.concepto}
                  {x.partes && (
                    <ul className="fac-partes">
                      {x.partes.map((p) => <li key={p.ref}><span>{p.categoria} · {p.concepto.split(" · ")[0]}</span><b>{mxn(Number(p.monto))}</b></li>)}
                    </ul>
                  )}
                </td>
                <td>
                  {x.beneficiario ?? <span className="srv-sub">—</span>}
                  {(a.pdf || a.xml) && (
                    <span className="fac-files">
                      {a.pdf && <a href={a.pdf} target="_blank" rel="noopener noreferrer">PDF</a>}
                      {a.xml && <a href={a.xml} target="_blank" rel="noopener noreferrer">XML</a>}
                    </span>
                  )}
                  {!tramite && x.origen === "gasto" && x.factura_uuid && !a.pdf && <span className="fac-files"><em>Sin PDF guardado</em></span>}
                </td>
                {tramite && <td className="num">{fCorta(x.solicitado_pago!)}<br /><small className={espera > 15 ? "bad-txt" : undefined}>{espera} días esperando</small></td>}
                <td className="r num"><b>{mxn(Number(x.monto))}</b></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Detalle de un gasto junto a la lista: de dónde viene, a quién se le paga, su factura y en qué va el pago. */
function PanelGasto({ x, conceptos, factura, volver }: { x: GastoV; conceptos: GastoV[]; factura: string | null; volver: string }) {
  const [o, oc] = ORIGEN[x.origen] ?? ["", "neutral"];
  const n = Math.max(conceptos.length, 1);
  return (
    <aside className="lp card" aria-label="Detalle del gasto">
      <header className="tkp-cab">
        <div className="tkp-cab-t">
          <div className="tkb-l1">
            <Estado tono={oc}>{o}</Estado>
            {x.pagado ? <Estado tono="ok">Pagado</Estado> : x.solicitado_pago ? <Estado tono="warn">En trámite</Estado> : <Estado tono="warn">Pendiente</Estado>}
          </div>
          <h2>{x.concepto}</h2>
          <p>{x.sucursal ?? "General"}{x.zona ? ` · ${x.zona}` : ""}</p>
        </div>
        <Link href={`${volver}#lista`} className="tkp-x" scroll={false} aria-label="Cerrar detalle"><IconoUI nombre="cerrar" tam={20} /></Link>
      </header>

      <div className="lp-gauge">
        <div className="lp-gauge-t"><b className="num">{mxn(Number(x.monto))}</b><span>{fCorta(x.fecha)}</span></div>
      </div>

      <dl className="tkd-datos">
        <div><dt>Categoría</dt><dd>{x.categoria}</dd></div>
        <div><dt>Tipo</dt><dd>{x.tipo}</dd></div>
        <div><dt>{x.origen === "caja" ? "Origen" : "Proveedor o técnico"}</dt><dd>{x.origen === "caja" ? "Caja chica" : x.beneficiario ?? "—"}</dd></div>
        <div><dt>Equipo</dt><dd>{x.activo_id ? <Link className="num" href={`/admin/activos?sel=${encodeURIComponent(x.activo_id)}`}>{x.activo_id}</Link> : "Sin equipo ligado"}</dd></div>
        <div><dt>Pago</dt><dd>{x.pagado ? `${fCorta(x.fecha_pago)}${x.referencia_pago ? ` · ${x.referencia_pago}` : ""}` : x.solicitado_pago ? `Entregado a Tesorería el ${fCorta(x.solicitado_pago)}` : "Por pasar a pago"}</dd></div>
        {x.factura_ref && <div><dt>Factura</dt><dd className="num">{x.factura_ref}</dd></div>}
      </dl>

      {conceptos.length > 1 && (
        <section className="lp-sec">
          <h3>Conceptos de la misma factura · total {mxn(Number(x.factura_total ?? 0))}</h3>
          <ul className="lp-lista">
            {conceptos.map((c) => <li key={c.ref}><span>{c.categoria} · {c.concepto.split(" · ")[0]}</span><b className="num">{mxn(Number(c.monto))}</b></li>)}
          </ul>
          <p className="sub tkp-nota">Se pagan y se borran juntos.</p>
        </section>
      )}

      <div className="tkp-acc">
        {x.origen === "hoja" && <Link className="btn small" href={`/admin/hojas/${x.ref}`}>Ver hoja de servicio</Link>}
        {factura && <a className="btn small" href={factura} target="_blank" rel="noopener noreferrer">Ver factura</a>}
        {x.origen !== "caja" && (
          <form action={marcarPagos}>
            <input type="hidden" name="volver" value={`${volver}&sel=${x.origen}:${x.ref}`} />
            <input type="hidden" name="sel" value={`${x.origen}:${x.ref}`} />
            <input type="hidden" name="pagado" value={String(!x.pagado)} />
            <button className={`btn small${x.pagado ? "" : " primary"}`} type="submit">
              {x.pagado ? (n > 1 ? `Regresar factura a pendiente (${n})` : "Regresar a pendiente") : n > 1 ? `Marcar factura pagada hoy (${n})` : "Marcar pagado hoy"}
            </button>
          </form>
        )}
        {x.origen === "caja" && <Link className="btn small" href="/admin/caja">Ver caja chica</Link>}
      </div>
      {x.origen === "gasto" && (
        <form action={borrarGasto} className="lp-borrar">
          <input type="hidden" name="id" value={x.ref} />
          <BotonIcono icono="borrar" tono="danger" cuenta={n}
            texto={n > 1 ? `Borrar factura (${n} conceptos)` : "Borrar gasto"}
            confirmar={n > 1 ? `¿Borrar la factura completa (${n} conceptos)? No se puede deshacer.` : "¿Borrar este gasto? No se puede deshacer."} />
          <span>{n > 1 ? `Borrar la factura completa (${n} conceptos)` : "Borrar este gasto"}</span>
        </form>
      )}
    </aside>
  );
}
