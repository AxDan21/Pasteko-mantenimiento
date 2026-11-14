import Link from "next/link";
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
type F = { mes?: string; zona?: string; pago?: string; ok?: string; error?: string };
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
  const zonas = Array.from(new Set(sucursales.map((s) => s.zona)));
  const categorias = Array.from(new Set([...(eqs ?? []).map((e) => e.categoria as string), ...CATEGORIAS_EXTRA]));

  const hermanos = new Map<string, number>();
  delMes.forEach((x) => { if (x.origen === "gasto" && x.factura_uuid) hermanos.set(x.factura_uuid, (hermanos.get(x.factura_uuid) ?? 0) + 1); });
  const total = delMes.reduce((s, x) => s + Number(x.monto), 0);
  const pendMes = delMes.filter((x) => !x.pagado).reduce((s, x) => s + Number(x.monto), 0);
  const porCat = new Map<string, number>();
  delMes.forEach((x) => porCat.set(x.categoria, (porCat.get(x.categoria) ?? 0) + Number(x.monto)));
  const cats = Array.from(porCat.entries()).sort((a, b) => b[1] - a[1]);
  const maxCat = cats[0]?.[1] ?? 1;
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
  const volver = `/admin/gastos?mes=${mes}${f.zona ? `&zona=${encodeURIComponent(f.zona)}` : ""}${f.pago ? `&pago=${f.pago}` : ""}`;

  const okMsg = f.ok === "1" ? "Gasto registrado." : f.ok?.startsWith("partidas-") ? `Factura registrada como ${f.ok.slice(9)} gastos, uno por concepto.` : f.ok === "pendiente" ? "Concepto regresado a pendiente de pago." : f.ok?.startsWith("pagados-") ? `${f.ok.slice(8)} concepto(s) marcados como pagados.` : f.ok?.startsWith("pasadas-") ? `${f.ok.slice(8)} concepto(s) pasados a pago. Sus PDF y XML se borraron.` : f.ok === "regresadas" ? "Regresadas a «por pasar a pago»." : null;

  return (
    <main className="wrap">
      <div className="head-row">
        <div>
          <p className="eyebrow">Panel de mantenimiento · {nombreMes(mes)}</p>
          <h1 className="page-h">Gastos</h1>
        </div>
        <Link className="btn" href={`/admin/exportar?tabla=gastos&mes=${mes}`}>Descargar CSV del mes</Link>
      </div>

      {okMsg && <div className="note ok" style={{ marginBottom: 14 }}>{okMsg}</div>}
      {f.error && <div className="note bad" style={{ marginBottom: 14 }}>{f.error}</div>}

      <div className="panel-grid" style={{ marginBottom: 16 }}>
        <section className="card">
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
        <section className="card">
          <h3>Presupuesto de {nombreMes(mes)}</h3>
          <p className="sub">Realizado {mxn(total)} de {mxn(ajustes.presupuesto_mensual)}</p>
          <div className="kpi" style={{ border: 0, padding: 0 }}>
            <span className="v" style={{ color: restante < 0 ? "var(--bad)" : "var(--ink)" }}>{mxn(restante)}</span>
            <div className="bar" style={{ display: "flex" }}>
              <i className={restante < 0 ? "bad" : ""} style={{ width: `${Math.min(((total - pendMes) / (ajustes.presupuesto_mensual || 1)) * 100, 100)}%`, borderRadius: 0 }} />
              <i className="warn" style={{ width: `${Math.min((pendMes / (ajustes.presupuesto_mensual || 1)) * 100, 100)}%`, borderRadius: 0 }} />
            </div>
            <span className="s">{restante < 0 ? "Excedido" : "Disponible"} · pagado {mxn(total - pendMes)} · pendiente de pago {mxn(pendMes)}</span>
          </div>
          <form action={guardarAjustes} className="inline-form" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 16 }}>
            <label className="field">Presupuesto mensual<input id="a-pres" name="presupuesto_mensual" type="number" min="0" step="100" defaultValue={ajustes.presupuesto_mensual} /></label>
            <label className="field">Fondo de caja chica<input id="a-caja" name="fondo_caja_chica" type="number" min="0" step="100" defaultValue={ajustes.fondo_caja_chica} /></label>
            <button className="btn" type="submit">Guardar montos</button>
          </form>
        </section>
      </div>

      {/* ---------- Realizado pendiente de pago ---------- */}
      <section className="card pend-card" id="pendientes" style={{ marginBottom: 16 }}>
        <div className="head-row" style={{ marginBottom: 12 }}>
          <div>
            <p className="eyebrow">Para dirección</p>
            <h3 style={{ fontSize: 22 }}>Realizado pendiente de pago</h3>
            <p className="sub" style={{ margin: 0 }}>Trabajos y compras ya hechos que todavía no se pagan, de todos los meses.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <CopiarTexto texto={pendientes.length ? texto : ""} etiqueta="Copiar resumen para dirección" />
            <Link className="btn" href="/admin/exportar?tabla=pendientes">Descargar CSV</Link>
          </div>
        </div>

        <div className="kpis" style={{ marginBottom: 14 }}>
          <div className="kpi"><span className="eyebrow">Total pendiente</span><span className="v" style={{ color: totalPend ? "var(--warn)" : "var(--ok)" }}>{mxn(totalPend)}</span><span className="s">{pendientes.length} pago{pendientes.length !== 1 ? "s" : ""} por hacer · el más antiguo de {masAntiguo} días</span></div>
          <div className="kpi"><span className="eyebrow">1 · Por pasar a pago</span><span className="v">{mxn(suma(porPasar))}</span><span className="s">{porPasar.length} por entregar a Tesorería</span></div>
          <div className="kpi"><span className="eyebrow">2 · En trámite</span><span className="v">{mxn(suma(enTramite))}</span><span className="s">{enTramite.length ? `${enTramite.length} esperando · la más antigua desde ${fCorta(enTramite[0].solicitado_pago!)}` : "Nada en trámite"}</span></div>
          <div className="kpi"><span className="eyebrow">Con más de 30 días</span><span className="v" style={{ color: pendientes.some((x) => diasEntre(x.fecha, h) > 30) ? "var(--bad)" : undefined }}>{mxn(pendientes.filter((x) => diasEntre(x.fecha, h) > 30).reduce((s, x) => s + Number(x.monto), 0))}</span><span className="s">Priorizar con dirección</span></div>
          <div className="kpi"><span className="eyebrow">Por proveedor / técnico</span>
            <span className="s" style={{ display: "flex", flexDirection: "column", gap: 2, marginTop: 4 }}>
              {benef.slice(0, 3).map(([b, e]) => <span key={b} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>{b}</span><b className="num" style={{ color: "var(--ink)" }}>{mxn(e.monto)}</b></span>)}
              {!benef.length && "—"}
            </span>
          </div>
        </div>

        {!pendientes.length && <p className="sub">No hay trabajos pendientes de pago.</p>}

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
                <span className="sub" style={{ margin: 0 }}>Marca las que ya entregaste impresas y mandaste por correo. <b>Sus PDF y XML se borran</b>: descárgalos o imprímelos antes.</span>
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
                <span className="sub" style={{ margin: 0 }}>Marca lo que Tesorería ya pagó (las facturas se pagan completas):</span>
                <label className="field">Fecha de pago<input id="p-fecha" name="fecha_pago" type="date" defaultValue={h} /></label>
                <label className="field">Referencia<input id="p-ref" name="referencia_pago" placeholder="Transferencia, cheque…" /></label>
                <button className="btn primary" type="submit">Marcar como pagadas</button>
                <button className="btn" type="submit" formAction={pasarAPago} name="deshacer" value="1">Regresar a «por pasar»</button>
              </div>
            </form>
          </div>
        )}
      </section>

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
          <label className="field">Estado de pago<select id="f-pago" name="pago" defaultValue={f.pago ?? ""}><option value="">Todos</option><option>Pagado</option><option>Pendiente</option></select></label>
          <button className="btn primary" type="submit">Ver</button>
        </form>
      </div>

      {filas.length ? (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Origen</th><th>Sucursal</th><th>Categoría</th><th>Concepto</th><th className="r">Monto</th><th>Pago</th><th /></tr></thead>
            <tbody>
              {filas.map((x) => {
                const [o, oc] = ORIGEN[x.origen] ?? ["", "neutral"];
                const fac = x.origen === "gasto" ? facturas.get(x.ref) : null;
                const nFac = x.factura_uuid ? hermanos.get(x.factura_uuid) ?? 1 : 1;
                return (
                  <tr key={x.origen + x.ref}>
                    <td className="num">{fCorta(x.fecha)}</td>
                    <td><span className={`pill ${oc}`}>{o}</span></td>
                    <td>{x.sucursal ?? <span style={{ color: "var(--muted)" }}>General</span>}</td>
                    <td>{x.categoria}<br /><small style={{ color: "var(--muted)" }}>{x.tipo}</small></td>
                    <td>{x.origen === "hoja" ? <Link href={`/admin/hojas/${x.ref}`}>{x.concepto}</Link> : x.concepto}{x.beneficiario && x.origen !== "caja" && <><br /><small style={{ color: "var(--muted)" }}>{x.beneficiario}</small></>}{nFac > 1 && <><br /><span className="fac-tag" title="Se paga y se borra junto con los demás conceptos de la factura">{x.factura_ref} · {nFac} conceptos · total {mxn(Number(x.factura_total ?? 0))}</span></>}</td>
                    <td className="r num">{mxn(Number(x.monto))}</td>
                    <td>
                      {x.pagado ? (
                        <><span className="pill ok">Pagado</span>{x.fecha_pago && <><br /><small style={{ color: "var(--muted)" }}>{fCorta(x.fecha_pago)}{x.referencia_pago ? ` · ${x.referencia_pago}` : ""}</small></>}</>
                      ) : <span className="pill warn">Pendiente</span>}
                    </td>
                    <td className="r">
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        {x.origen !== "caja" && (
                          <form action={marcarPagos}>
                            <input type="hidden" name="volver" value={volver} />
                            <input type="hidden" name="sel" value={`${x.origen}:${x.ref}`} />
                            <input type="hidden" name="pagado" value={String(!x.pagado)} />
                            <button className="btn small" type="submit">{x.pagado ? (nFac > 1 ? "Regresar factura a pendiente" : "Regresar a pendiente") : nFac > 1 ? "Marcar factura pagada hoy" : "Marcar pagado hoy"}</button>
                          </form>
                        )}
                        {fac && urls.get(fac) && <a className="btn small" href={urls.get(fac)} target="_blank" rel="noopener noreferrer">Factura</a>}
                        {x.origen === "gasto" && (
                          <form action={borrarGasto}><input type="hidden" name="id" value={x.ref} /><button className="btn small danger" type="submit">{nFac > 1 ? `Borrar factura (${nFac})` : "Borrar"}</button></form>
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
        <div className="card"><h3>Sin gastos en {nombreMes(mes)}{f.pago ? ` con estado ${f.pago.toLowerCase()}` : ""}</h3><p className="sub">Registra el primero arriba o espera a que los técnicos envíen hojas con costo.</p></div>
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
                <td className="num">{fCorta(x.fecha)}</td>
                <td className="r"><span className={`pill ${d > 30 ? "bad" : d > 15 ? "warn" : "neutral"} num`}>{d}</span></td>
                <td><span className={`pill ${oc}`}>{o}</span></td>
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
                  {x.beneficiario ?? <span style={{ color: "var(--muted)" }}>—</span>}
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
