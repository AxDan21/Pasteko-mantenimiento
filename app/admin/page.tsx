import Link from "next/link";
import GraficaMensual from "@/components/GraficaMensual";
import GraficaTipo from "@/components/GraficaTipo";
import SucursalesMes from "@/components/SucursalesMes";
import { Anillo, Columnas, corto, Dona, Medidor, PALETA, Sparkline, Treemap } from "@/components/Graficas";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { acumuladoPorActivo, leerAjustes } from "@/lib/datos";
import { mxn } from "@/lib/format";
import {
  diasEntre, estadoGarantia, estadoPreventivo, hoy, MESES, mesActual, mesCorto, mesValido, nombreMes,
  rangoFechas, recomendacion, sumarDias, sumarMeses,
} from "@/lib/panel";
import type { Activo, Preventivo } from "@/lib/types";

type G = { fecha: string; sucursal_id: number | null; sucursal: string | null; zona: string | null; categoria: string | null; tipo: string | null; monto: number; origen: string; beneficiario: string | null };
type Hoja = { sucursal_id: number; equipo: string; tipo: string; creada: string; total: number };

const zonaCorta = (z: string) => z.replace(/^Zona\s*\d+\s*·\s*/i, "");
const fechaHoja = (f: string) => f.slice(0, 10);

/** Variación contra el periodo anterior. `subirEsMalo` para gastos y fallas. */
function Delta({ actual, anterior, subirEsMalo = true, texto = "vs mes anterior" }: { actual: number; anterior: number; subirEsMalo?: boolean; texto?: string }) {
  if (!anterior) return <span className="d-delta neutral">— {texto}</span>;
  const cambio = ((actual - anterior) / anterior) * 100;
  const malo = subirEsMalo ? cambio > 3 : cambio < -3, bueno = subirEsMalo ? cambio < -3 : cambio > 3;
  return (
    <span className={`d-delta ${malo ? "bad" : bueno ? "ok" : "neutral"}`}>
      <b>{cambio > 0.5 ? "▲" : cambio < -0.5 ? "▼" : "●"} {Math.abs(cambio).toFixed(0)}%</b> {texto}
    </span>
  );
}

function Icono({ d }: { d: string }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}
const IC = {
  dinero: "M12 2v20M17 6.5c0-1.9-2.2-3.5-5-3.5S7 4.6 7 6.5 9.2 10 12 10s5 1.6 5 3.5S14.8 17 12 17s-5-1.6-5-3.5",
  falla: "M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  escudo: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  meta: "M12 22a10 10 0 1 1 0-20 10 10 0 0 1 0 20zM12 18a6 6 0 1 1 0-12 6 6 0 0 1 0 12zM12 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4z",
};

export default async function Resumen({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requireAdmin();
  const { mes: mesParam } = await searchParams;
  const supabase = await createClient();
  const h = hoy(), mesHoy = mesActual();
  const mes = mesValido(mesParam) > mesHoy ? mesHoy : mesValido(mesParam);
  const esActual = mes === mesHoy;
  const desde = sumarMeses(mes, -5), anterior = sumarMeses(mes, -1);
  const [ini, fin] = rangoFechas(mes);
  const corte = esActual ? h : sumarDias(fin, -1);
  const hace90 = sumarDias(corte, -90);
  const desdeHojas = hace90 < `${desde}-01` ? hace90 : `${desde}-01`;

  const [ajustes, { data: g }, { data: p }, { data: a }, { data: r }, { data: c }, { count: porRevisar }, { data: pp }, { data: hs }, { data: suc }, acum] = await Promise.all([
    leerAjustes(supabase),
    supabase.from("v_gastos").select("fecha, sucursal_id, sucursal, zona, categoria, tipo, monto, origen, beneficiario").gte("fecha", `${desde}-01`).lt("fecha", fin),
    supabase.from("preventivos").select("id, fecha, sucursal_id, equipo, tarea, hecho, sucursales(nombre)").lte("fecha", sumarDias(h, 60)).order("fecha"),
    supabase.from("activos").select("*").eq("activo", true),
    supabase.from("refacciones").select("stock, minimo"),
    supabase.from("caja_chica").select("monto, factura_path").gte("fecha", ini).lt("fecha", fin),
    supabase.from("hojas_servicio").select("id", { count: "exact", head: true }).eq("estado", "Enviada"),
    supabase.from("v_gastos").select("monto").eq("pagado", false),
    supabase.from("hojas_servicio").select("sucursal_id, equipo, tipo, creada, total").gte("creada", `${sumarDias(desdeHojas, -1)}T00:00:00`).lt("creada", `${fin}T06:00:00`),
    supabase.from("sucursales").select("id, nombre, zona").eq("activa", true).order("nombre"),
    acumuladoPorActivo(supabase),
  ]);

  const gastos = (g ?? []) as G[];
  const prevs = (p ?? []) as unknown as (Pick<Preventivo, "id" | "fecha" | "sucursal_id" | "equipo" | "tarea" | "hecho"> & { sucursales: { nombre: string } | null })[];
  const activos = (a ?? []) as Activo[];
  const hojas = (hs ?? []) as Hoja[];
  const sucursales = (suc ?? []) as { id: number; nombre: string; zona: string }[];
  const nombreSuc = new Map(sucursales.map((s) => [s.id, s.nombre]));
  const zonaDe = new Map(sucursales.map((s) => [s.id, s.zona]));

  // ---------- Series de 6 meses ----------
  const meses = Array.from({ length: 6 }, (_, i) => sumarMeses(desde, i));
  const suma = (l: G[]) => l.reduce((s, x) => s + Number(x.monto), 0);
  const deMes = (m: string) => gastos.filter((x) => x.fecha.slice(0, 7) === m);
  const correctivos = hojas.filter((x) => x.tipo === "Correctivo");
  const serieGasto = meses.map((m) => suma(deMes(m)));
  const serieFallas = meses.map((m) => correctivos.filter((x) => x.creada.slice(0, 7) === m).length);
  const tipoMes = (l: G[]) => ({ prev: suma(l.filter((x) => x.tipo === "Preventivo")), tot: suma(l) });
  const seriePrev = meses.map((m) => { const t = tipoMes(deMes(m)); return t.tot ? (t.prev / t.tot) * 100 : 0; });

  // ---------- Mes ----------
  const delMes = deMes(mes), delAnt = deMes(anterior);
  const total = suma(delMes), totalAnt = suma(delAnt);
  const presupuesto = ajustes.presupuesto_mensual;
  const diasMes = diasEntre(ini, fin), dia = esActual ? diasEntre(ini, h) + 1 : diasMes;
  const ritmo = (dia / diasMes) * 100;
  const pct = presupuesto ? (total / presupuesto) * 100 : 0;
  const proyeccion = esActual && dia > 0 ? (total / dia) * diasMes : total;
  const disponible = presupuesto - total;
  const fallasMes = correctivos.filter((x) => x.creada.slice(0, 7) === mes);
  const fallasAnt = correctivos.filter((x) => x.creada.slice(0, 7) === anterior);
  const costoFallas = fallasMes.reduce((s, x) => s + Number(x.total), 0);
  const prevMes = prevs.filter((x) => x.fecha >= ini && x.fecha < fin);
  const hechos = prevMes.filter((x) => x.hecho).length;
  const vencidos = prevs.filter((x) => estadoPreventivo(x, h).texto === "Vencido");
  const proximos = prevs.filter((x) => !x.hecho).slice(0, 5);
  const pctPrev = seriePrev[5];

  // ---------- Zonas (dona) ----------
  const zonas = Array.from(new Set(sucursales.map((s) => s.zona))).sort();
  const zonaGasto = (l: G[], z: string) => suma(l.filter((x) => (x.zona ?? zonaDe.get(x.sucursal_id ?? -1)) === z));
  const porZona = zonas.map((z, i) => ({
    z, color: PALETA[i % PALETA.length], actual: zonaGasto(delMes, z), ant: zonaGasto(delAnt, z),
  })).sort((x, y) => y.actual - x.actual);
  const generales = suma(delMes.filter((x) => !x.sucursal_id));

  // ---------- Categorías (treemap) ----------
  const agrupar = (l: G[], clave: (x: G) => string | null) => {
    const m = new Map<string, number>();
    l.forEach((x) => { const kk = clave(x); if (kk) m.set(kk, (m.get(kk) ?? 0) + Number(x.monto)); });
    return Array.from(m.entries()).sort((x, y) => y[1] - x[1]);
  };
  const categorias = agrupar(delMes, (x) => x.categoria || "Sin categoría").slice(0, 8).map(([nombre, valor], i) => ({ nombre, valor, color: PALETA[i % PALETA.length] }));

  // ---------- Mapa de calor por sucursal ----------
  const gastoSuc = new Map(agrupar(delMes, (x) => (x.sucursal_id ? String(x.sucursal_id) : null)).map(([id, v]) => [Number(id), v]));
  const fallasSuc = new Map<number, number>();
  fallasMes.forEach((x) => fallasSuc.set(x.sucursal_id, (fallasSuc.get(x.sucursal_id) ?? 0) + 1));
  const gastoSucMes = new Map<string, number>();
  gastos.forEach((x) => { if (x.sucursal_id) { const kk = `${x.sucursal_id}|${x.fecha.slice(0, 7)}`; gastoSucMes.set(kk, (gastoSucMes.get(kk) ?? 0) + Number(x.monto)); } });

  // ---------- Equipos que más fallan (90 días) ----------
  const ventana = correctivos.filter((x) => fechaHoja(x.creada) >= hace90 && fechaHoja(x.creada) <= corte);
  const porEquipo = new Map<string, { n: number; costo: number; tiendas: Set<number> }>();
  ventana.forEach((x) => {
    const e = porEquipo.get(x.equipo) ?? { n: 0, costo: 0, tiendas: new Set<number>() };
    e.n++; e.costo += Number(x.total); e.tiendas.add(x.sucursal_id);
    porEquipo.set(x.equipo, e);
  });
  const equiposFallan = Array.from(porEquipo.entries()).map(([equipo, e]) => ({ equipo, ...e })).sort((x, y) => y.n - x.n || y.costo - x.costo).slice(0, 7);

  // ---------- Proveedores ----------
  const topProv = agrupar(delMes.filter((x) => x.origen !== "caja"), (x) => x.beneficiario).slice(0, 6);

  // ---------- Equipos más caros de mantener ----------
  const caros = activos
    .map((x) => ({ x, total: acum.get(x.id)?.total ?? 0, rec: recomendacion(x, acum.get(x.id)?.total ?? 0, h) }))
    .filter((e) => e.total > 0).sort((m, n) => n.total - m.total).slice(0, 4);

  // ---------- Alertas ----------
  const garantias = activos.filter((x) => estadoGarantia(x.garantia_hasta, h).clase === "warn");
  const reemplazo = activos.filter((x) => recomendacion(x, acum.get(x.id)?.total ?? 0, h).clase === "bad");
  const pagadoGarantia = activos.filter((x) => x.garantia_hasta && (acum.get(x.id)?.filas ?? []).some((f) => f.tipo === "Correctivo" && f.fecha <= x.garantia_hasta!));
  const refBajas = (r ?? []).filter((x) => Number(x.stock) < Number(x.minimo)).length;
  const sinFactura = (c ?? []).filter((x) => !x.factura_path).length;
  const cajaUsada = (c ?? []).reduce((s, x) => s + Number(x.monto), 0);
  const cajaSaldo = ajustes.fondo_caja_chica - cajaUsada;
  const { data: tkA } = await supabase.from("tickets").select("prioridad, estado").in("estado", ["abierto", "asignado", "en_proceso"]);
  const tkUrg = (tkA ?? []).filter((x) => x.prioridad === "alta").length;
  const alertas = [
    [tkUrg, "bad", "reportes urgentes de tiendas", "/admin/tickets"],
    [(tkA ?? []).length - tkUrg, "warn", "reportes de tiendas abiertos", "/admin/tickets"],
    [vencidos.length, "bad", "preventivos vencidos", "/admin/preventivos?estado=Vencido"],
    [pagadoGarantia.length, "bad", "reparaciones pagadas en garantía", "/admin/activos?rec=garantia"],
    [reemplazo.length, "bad", "equipos para evaluar reemplazo", "/admin/activos?rec=Evaluar%20reemplazo"],
    [esActual && proyeccion > presupuesto ? 1 : 0, "bad", "cierre proyectado rebasa el presupuesto", "/admin/gastos"],
    [garantias.length, "warn", "garantías vencen en 60 días", "/admin/activos"],
    [refBajas, "warn", "refacciones bajo el mínimo", "/admin/refacciones"],
    [sinFactura, "warn", "caja chica sin factura", "/admin/caja"],
    [cajaSaldo < ajustes.fondo_caja_chica * 0.15 ? 1 : 0, "warn", "caja chica casi agotada", "/admin/caja"],
    [porRevisar ?? 0, "neutral", "hojas por revisar", "/admin/hojas?estado=Enviada"],
    [(pp ?? []).length, "warn", `pendientes de pago · ${corto((pp ?? []).reduce((s, x) => s + Number(x.monto), 0))}`, "/admin/gastos#pendientes"],
  ].filter((x) => Number(x[0]) > 0) as [number, string, string, string][];

  const zonaMayor = porZona[0];
  const equipoMayor = equiposFallan[0];
  const colorPres = pct > 100 ? "#d4005a" : pct > ritmo + 5 ? "#fab428" : "#ea5731";

  return (
    <main className="wrap dash">
      {/* ---------- Encabezado ---------- */}
      <section className="dash-hero">
        <div className="dash-hero-top">
          <div>
            <p className="dash-kicker">Panel de mantenimiento</p>
            <h1>Resumen de {nombreMes(mes)}</h1>
            <p className="dash-lede">
              {total > 0 ? <>Llevas <b>{mxn(total)}</b>{esActual ? <> y cerrarías en <b className={proyeccion > presupuesto ? "warn-txt" : undefined}>{mxn(proyeccion)}</b></> : null}.</> : <>Sin gastos registrados.</>}
              {zonaMayor?.actual ? <> Zona con más gasto: <b>{zonaCorta(zonaMayor.z)}</b>.</> : null}
              {equipoMayor ? <> Equipo que más falla: <b>{equipoMayor.equipo}</b>.</> : null}
            </p>
          </div>
          <nav className="dash-mes" aria-label="Mes">
            <Link href={`/admin?mes=${anterior}`} aria-label="Mes anterior">‹</Link>
            <span><b>{nombreMes(mes)}</b><small>{esActual ? `Corte al ${Number(h.slice(8))} de ${MESES[Number(h.slice(5, 7)) - 1]}` : "Mes cerrado"}</small></span>
            {esActual ? <span className="off" aria-hidden="true">›</span> : <Link href={`/admin?mes=${sumarMeses(mes, 1)}`} aria-label="Mes siguiente">›</Link>}
          </nav>
        </div>

        <div className="dash-kpis">
          <div className="dash-kpi">
            <div className="kpi-h"><span className="kpi-ic"><Icono d={IC.dinero} /></span>Gasto del mes</div>
            <div className="kpi-row">
              <div>
                <b className="kpi-v">{mxn(total)}</b>
                <Delta actual={esActual ? proyeccion : total} anterior={totalAnt} texto={esActual ? "proyectado" : "vs mes anterior"} />
              </div>
              <Sparkline valores={serieGasto} />
            </div>
          </div>
          <div className="dash-kpi">
            <div className="kpi-h"><span className="kpi-ic"><Icono d={IC.meta} /></span>Presupuesto</div>
            <div className="kpi-row">
              <div>
                <b className="kpi-v">{disponible >= 0 ? mxn(disponible) : `−${mxn(-disponible)}`}</b>
                <span className="kpi-s">{disponible >= 0 ? "disponible" : "excedido"} de {corto(presupuesto)}{esActual ? ` · mes al ${ritmo.toFixed(0)}%` : ""}</span>
              </div>
              <Anillo pct={pct} color={colorPres} tam={64} grosor={8}><b>{pct.toFixed(0)}%</b></Anillo>
            </div>
          </div>
          <div className="dash-kpi">
            <div className="kpi-h"><span className="kpi-ic"><Icono d={IC.falla} /></span>Fallas del mes</div>
            <div className="kpi-row">
              <div>
                <b className="kpi-v">{fallasMes.length}<small> correctivos</small></b>
                <Delta actual={fallasMes.length} anterior={fallasAnt.length} />
              </div>
              <Sparkline valores={serieFallas} color="#d4005a" />
            </div>
            <span className="kpi-s">{fallasMes.length ? `${mxn(costoFallas / fallasMes.length)} por falla en promedio` : "Sin correctivos este mes"}</span>
          </div>
          <div className="dash-kpi">
            <div className="kpi-h"><span className="kpi-ic"><Icono d={IC.escudo} /></span>Preventivo</div>
            <div className="kpi-row">
              <div>
                <b className="kpi-v">{pctPrev.toFixed(0)}%<small> del gasto</small></b>
                <span className="kpi-s">{hechos} de {prevMes.length} hechos · {vencidos.length} vencido{vencidos.length !== 1 ? "s" : ""}</span>
              </div>
              <Sparkline valores={seriePrev} color="#46ad48" />
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Alertas ---------- */}
      {alertas.length > 0 && (
        <nav className="dash-alertas" aria-label="Requiere tu atención">
          <span className="dash-alertas-t">Requiere atención</span>
          {alertas.map(([n, cl, t, href]) => (
            <Link key={t} href={href} className={`chip-alerta ${cl}`}><b>{n}</b>{t}</Link>
          ))}
        </nav>
      )}

      <div className="bento">
        <section className="dcard s8">
          <header><div><h3>Gasto mensual contra presupuesto</h3><p>Hojas de servicio, gastos y caja chica · 6 meses</p></div><Link className="dash-more" href="/admin/reporte">Reporte</Link></header>
          <GraficaMensual datos={meses.map((m, i) => ({ etiqueta: mesCorto(m), valor: serieGasto[i], parcial: m === mesHoy }))} presupuesto={presupuesto} />
        </section>

        <section className="dcard s4">
          <header><div><h3>Gasto por zona</h3><p>{nombreMes(mes)}</p></div></header>
          {porZona.some((x) => x.actual > 0) ? (
            <Dona
              centro={corto(total)} sub="total del mes"
              datos={[
                ...porZona.map((x) => ({ nombre: zonaCorta(x.z), valor: x.actual, color: x.color, extra: <Delta actual={x.actual} anterior={x.ant} texto="" /> })),
                ...(generales > 0 ? [{ nombre: "General", valor: generales, color: "#929291" }] : []),
              ]}
            />
          ) : <p className="vacio">Sin gastos este mes.</p>}
        </section>

        <section className="dcard s7">
          <header><div><h3>¿En qué se va el dinero?</h3><p>Gasto por categoría · cada bloque es proporcional al gasto</p></div><Link className="dash-more" href="/admin/gastos">Gastos</Link></header>
          {categorias.length ? <Treemap datos={categorias} /> : <p className="vacio">Sin gastos este mes.</p>}
        </section>

        <section className="dcard s5">
          <header><div><h3>Preventivo contra correctivo</h3><p>% del gasto que fue preventivo</p></div></header>
          <GraficaTipo datos={meses.map((m) => { const t = tipoMes(deMes(m)); return { etiqueta: mesCorto(m), preventivo: t.prev, otros: t.tot - t.prev, actual: m === mes }; })} />
          <div className="legend">
            <span><i style={{ background: "var(--orange)" }} />Preventivo</span>
            <span><i style={{ background: "var(--ink)" }} />Correctivo y otros</span>
          </div>
        </section>

        <section className="dcard s12">
          <header>
            <div><h3>Sucursales del mes</h3><p>Dónde se movió el mantenimiento en {nombreMes(mes)}: gasto y fallas (correctivos) por tienda.</p></div>
          </header>
          <SucursalesMes
            mes={mes}
            mesNombre={nombreMes(mes)}
            meses={meses.map((x) => mesCorto(x))}
            zonas={zonas.map((z) => ({
              zona: z,
              tiendas: sucursales.filter((s) => s.zona === z).map((s) => ({
                id: s.id, nombre: s.nombre, gasto: gastoSuc.get(s.id) ?? 0, fallas: fallasSuc.get(s.id) ?? 0,
                hist: meses.map((x) => gastoSucMes.get(`${s.id}|${x}`) ?? 0),
              })),
            }))}
          />
        </section>

        <section className="dcard s7">
          <header><div><h3>Equipos que más fallan</h3><p>Correctivos en hojas de servicio · últimos 90 días</p></div><Link className="dash-more" href="/admin/hojas">Hojas</Link></header>
          {equiposFallan.length ? (
            <Columnas
              color="#d4005a"
              datos={equiposFallan.map((e) => ({
                etiqueta: e.equipo, valor: e.n, arriba: `${e.n}`,
                abajo: `${e.tiendas.size} tienda${e.tiendas.size !== 1 ? "s" : ""} · ${corto(e.costo)}`,
              }))}
            />
          ) : <p className="vacio">Sin correctivos en los últimos 90 días.</p>}
        </section>

        <section className="dcard s5">
          <header><div><h3>Proveedores y técnicos</h3><p>A quién se le pagó más en {nombreMes(mes)}</p></div></header>
          {topProv.length ? (
            <div className="prov-grid">
              {topProv.map(([n, v], i) => (
                <div key={n} className="prov">
                  <Anillo pct={total ? (v / total) * 100 : 0} color={PALETA[i % PALETA.length]} tam={54} grosor={7}><b>{total ? Math.round((v / total) * 100) : 0}%</b></Anillo>
                  <span><b title={n}>{n}</b><small>{mxn(v)}</small></span>
                </div>
              ))}
            </div>
          ) : <p className="vacio">Sin pagos a proveedores este mes.</p>}
        </section>

        <section className="dcard s8">
          <header><div><h3>Reparar o reemplazar</h3><p>Lo gastado en cada equipo contra lo que costó</p></div><Link className="dash-more" href="/admin/activos">Equipos</Link></header>
          {caros.length ? (
            <div className="caros">
              {caros.map(({ x, total: t, rec }) => {
                const pv = x.costo > 0 ? (t / x.costo) * 100 : 0;
                const col = rec.clase === "bad" ? "#d4005a" : rec.clase === "warn" ? "#fab428" : "#46ad48";
                return (
                  <Link key={x.id} href={`/admin/activos/${x.id}`} className="caro">
                    <div className="caro-g">
                      <Medidor pct={pv} color={col} />
                      <b>{x.costo > 0 ? `${pv.toFixed(0)}%` : "—"}</b>
                    </div>
                    <b className="caro-n">{x.equipo}</b>
                    <small>{nombreSuc.get(x.sucursal_id) ?? "—"} · {x.id}</small>
                    <small>{mxn(t)} de {x.costo > 0 ? mxn(x.costo) : "costo sin capturar"}</small>
                    <span className={`pill ${rec.clase}`}>{rec.texto}</span>
                  </Link>
                );
              })}
            </div>
          ) : <p className="vacio">Al ligar hojas de servicio a un equipo (QR), aquí verás cuáles conviene reemplazar.</p>}
        </section>

        <section className="dcard s4">
          <header><div><h3>Próximos preventivos</h3><p>Los vencidos primero</p></div><Link className="dash-more" href="/admin/preventivos/plan">Plan</Link></header>
          {proximos.length ? (
            <div className="upcoming">
              {proximos.map((x) => {
                const e = estadoPreventivo(x, h);
                return (
                  <div key={x.id} className="up">
                    <div className="date-chip"><b>{Number(x.fecha.slice(8))}</b><small>{MESES[Number(x.fecha.slice(5, 7)) - 1]}</small></div>
                    <div className="t"><b>{x.sucursales?.nombre}</b><small>{x.equipo} · {x.tarea}</small></div>
                    <span className={`pill ${e.clase}`}>{e.texto}</span>
                  </div>
                );
              })}
            </div>
          ) : <p className="vacio">Sin preventivos pendientes. <Link href="/admin/preventivos">Programa el primero</Link>.</p>}
        </section>
      </div>
    </main>
  );
}
