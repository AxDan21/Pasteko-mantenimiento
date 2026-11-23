import Link from "next/link";
import GraficaMensual from "@/components/GraficaMensual";
import GraficaTipo from "@/components/GraficaTipo";
import SucursalesMes from "@/components/SucursalesMes";
import Pestanas from "@/components/Pestanas";
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

type Pendiente = { sev: "bad" | "warn"; titulo: string; detalle: string; href: string; accion: string };

/** Una fuente que no respondió no es lo mismo que "sin datos". */
function ErrorDatos({ fuente }: { fuente: string }) {
  return <p className="rs-error">No se pudieron cargar {fuente}. Esto no significa que no haya datos; recarga la página para reintentar.</p>;
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

  const [ajustes, { data: g, error: eG }, { data: p, error: eP }, { data: a, error: eA }, { data: r, error: eR }, { data: c, error: eC }, { count: porRevisar, error: eRev }, { data: pp, error: ePP }, { data: hs, error: eH }, { data: suc }, acum] = await Promise.all([
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


  // ---------- Pendientes ----------
  const garantias = activos.filter((x) => estadoGarantia(x.garantia_hasta, h).clase === "warn");
  const reemplazo = activos.filter((x) => recomendacion(x, acum.get(x.id)?.total ?? 0, h).clase === "bad");
  const pagadoGarantia = activos.filter((x) => x.garantia_hasta && (acum.get(x.id)?.filas ?? []).some((f) => f.tipo === "Correctivo" && f.fecha <= x.garantia_hasta!));
  const porValidar = activos.filter((x) => !x.validado).length;
  const refBajas = (r ?? []).filter((x) => Number(x.stock) < Number(x.minimo)).length;
  const sinFactura = (c ?? []).filter((x) => !x.factura_path).length;
  const cajaUsada = (c ?? []).reduce((s, x) => s + Number(x.monto), 0);
  const cajaSaldo = ajustes.fondo_caja_chica - cajaUsada;
  const montoPP = (pp ?? []).reduce((s, x) => s + Number(x.monto), 0);
  const { data: tkA, error: eTk } = await supabase.from("tickets").select("prioridad, estado").in("estado", ["abierto", "asignado", "en_proceso"]);
  const tickets = tkA ?? [];
  const tkUrg = tickets.filter((x) => x.prioridad === "alta");
  const tkOtros = tickets.filter((x) => x.prioridad !== "alta");
  const sinAsignar = (l: typeof tickets) => l.filter((x) => x.estado === "abierto").length;
  const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

  /** Lo que hay que resolver hoy, ordenado por impacto: primero lo que detiene la venta o ya cuesta dinero. */
  const pendientes: Pendiente[] = [];
  if (tkUrg.length) pendientes.push({
    sev: "bad", href: "/admin/tickets", accion: "Atender",
    titulo: plural(tkUrg.length, "reporte urgente de tienda", "reportes urgentes de tiendas"),
    detalle: sinAsignar(tkUrg) ? `${sinAsignar(tkUrg)} sin técnico asignado` : "Todos tienen técnico asignado",
  });
  if (vencidos.length) pendientes.push({
    sev: "bad", href: "/admin/preventivos?estado=Vencido", accion: "Reprogramar",
    titulo: plural(vencidos.length, "preventivo vencido", "preventivos vencidos"),
    detalle: `El más antiguo venció hace ${plural(diasEntre(vencidos[0].fecha, h), "día", "días")}`,
  });
  if (esActual && proyeccion > presupuesto) pendientes.push({
    sev: "bad", href: "/admin/gastos", accion: "Ver gastos",
    titulo: "El cierre proyectado rebasa el presupuesto",
    detalle: `Cerrarías en ${mxn(proyeccion)}, ${mxn(proyeccion - presupuesto)} arriba de ${mxn(presupuesto)}`,
  });
  if (pagadoGarantia.length) pendientes.push({
    sev: "bad", href: "/admin/activos?rec=garantia", accion: "Revisar",
    titulo: plural(pagadoGarantia.length, "reparación pagada en garantía", "reparaciones pagadas en garantía"),
    detalle: "Se pagó un correctivo a un equipo que aún tenía garantía",
  });
  if (tkOtros.length) pendientes.push({
    sev: "warn", href: "/admin/tickets", accion: sinAsignar(tkOtros) ? "Asignar" : "Ver",
    titulo: plural(tkOtros.length, "reporte de tienda abierto", "reportes de tiendas abiertos"),
    detalle: sinAsignar(tkOtros) ? `${sinAsignar(tkOtros)} sin técnico asignado` : "En manos de un técnico",
  });
  if (porRevisar) pendientes.push({
    sev: "warn", href: "/admin/hojas?estado=Enviada", accion: "Revisar",
    titulo: plural(porRevisar, "hoja de servicio por revisar", "hojas de servicio por revisar"),
    detalle: "Enviadas por técnicos, esperan tu visto bueno",
  });
  if (cajaSaldo < ajustes.fondo_caja_chica * 0.15) pendientes.push({
    sev: "warn", href: "/admin/caja", accion: "Reponer",
    titulo: "Caja chica casi agotada",
    detalle: `Quedan ${mxn(Math.max(cajaSaldo, 0))} de ${mxn(ajustes.fondo_caja_chica)}`,
  });
  if (sinFactura) pendientes.push({
    sev: "warn", href: "/admin/caja", accion: "Completar",
    titulo: plural(sinFactura, "gasto de caja chica sin factura", "gastos de caja chica sin factura"),
    detalle: `Del mes de ${nombreMes(mes)}`,
  });

  /** Fuentes que no respondieron: se avisa en lugar de mostrar ceros. */
  const caidas = [
    eTk && "reportes de tiendas", eP && "preventivos", eG && "gastos", eA && "equipos", eRev && "hojas por revisar", eH && "hojas de servicio",
    eC && "caja chica", eR && "refacciones", ePP && "pagos pendientes",
  ].filter(Boolean) as string[];

  const semana: [string, string, string | number, string][] = ([
    [garantias.length, "Garantías que vencen en 60 días", garantias.length, "/admin/activos"],
    [(pp ?? []).length, `Pagos pendientes a proveedores · ${plural((pp ?? []).length, "pago", "pagos")}`, mxn(montoPP), "/admin/gastos#pendientes"],
    [refBajas, "Refacciones bajo el mínimo", refBajas, "/admin/refacciones"],
    [reemplazo.length, "Equipos para evaluar reemplazo", reemplazo.length, "/admin/activos?rec=Evaluar%20reemplazo"],
    [porValidar, "Equipos del censo por validar", porValidar, "/admin/activos/censo"],
  ] as [number, string, string | number, string][]).filter((x) => x[0] > 0).map(([, t, v, href]) => [t, String(v), v, href]);

  const zonaMayor = porZona[0];
  const equipoMayor = equiposFallan[0];
  const colorPres = pct > 100 ? "#d4005a" : pct > ritmo + 5 ? "#fab428" : "#ea5731";
  const urgentes = pendientes.filter((x) => x.sev === "bad").length;
  const fechaLarga = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Mexico_City" }).format(new Date());
  const titular = !esActual
    ? `Resumen de ${nombreMes(mes)}`
    : pendientes.length
      ? `${plural(pendientes.length, "pendiente requiere", "pendientes requieren")} tu atención`
      : "Todo en orden por hoy";

  return (
    <main className="wrap dash">
      {/* ---------- Encabezado ---------- */}
      <header className="rs-head">
        <div className="rs-tit">
          <p className="eyebrow">{esActual ? `${fechaLarga} · corte al día ${Number(h.slice(8))}` : "Mes cerrado"}</p>
          <h1 className="page-h">{titular}</h1>
          <p className="rs-lede">
            {eG ? <>No se pudieron cargar los gastos del mes.</> : total > 0 ? (
              <>
                {esActual ? "Llevas" : "Se gastaron"} <b className="num">{mxn(total)}</b>
                {esActual ? <> y cerrarías en <b className={`num${proyeccion > presupuesto ? " rs-mal" : ""}`}>{mxn(proyeccion)}</b>{presupuesto ? <> ({((proyeccion / presupuesto) * 100).toFixed(0)}% del presupuesto)</> : null}</> : null}.
              </>
            ) : <>Sin gastos registrados en {nombreMes(mes)}.</>}
            {zonaMayor?.actual ? <> Zona con más gasto: <b>{zonaCorta(zonaMayor.z)}</b>.</> : null}
            {equipoMayor ? <> Equipo que más falla: <b>{equipoMayor.equipo}</b>.</> : null}
          </p>
        </div>
      </header>

      {caidas.length > 0 && (
        <div className="rs-caida" role="alert">
          <Icono d={IC.falla} />
          <span>
            <b>No se pudo consultar: {caidas.join(", ")}.</b> Las cifras de esas secciones pueden estar incompletas; no significa que estén en cero.
          </span>
          <Link href={`/admin${esActual ? "" : `?mes=${mes}`}`} className="btn small">Reintentar</Link>
        </div>
      )}

      {/* ---------- Indicadores ---------- */}
      <div className="rs-kpis">
        <Link href="/admin/gastos" className="rs-kpi">
          <span className="rs-kpi-h"><span className="kpi-ic"><Icono d={IC.dinero} /></span>Gasto del mes</span>
          <span className="rs-kpi-row">
            <span className="rs-kpi-t">
              <b className="rs-kpi-v num">{eG ? "—" : mxn(total)}</b>
              {!eG && <Delta actual={esActual ? proyeccion : total} anterior={totalAnt} texto={esActual ? `proyectado vs ${mesCorto(anterior)}` : `vs ${mesCorto(anterior)}`} />}
            </span>
            {!eG && <Sparkline valores={serieGasto} />}
          </span>
        </Link>
        <Link href="/admin/reporte" className="rs-kpi">
          <span className="rs-kpi-h"><span className="kpi-ic"><Icono d={IC.meta} /></span>Presupuesto</span>
          <span className="rs-kpi-row">
            <span className="rs-kpi-t">
              <b className="rs-kpi-v num">{eG ? "—" : disponible >= 0 ? mxn(disponible) : `−${mxn(-disponible)}`}</b>
              <span className="rs-kpi-s">{disponible >= 0 ? "disponible" : "excedido"} de {corto(presupuesto)}{esActual ? ` · mes al ${ritmo.toFixed(0)}%` : ""}</span>
            </span>
            {!eG && <Anillo pct={pct} color={colorPres} tam={56} grosor={7}><b>{pct.toFixed(0)}%</b></Anillo>}
          </span>
        </Link>
        <Link href="/admin/hojas" className="rs-kpi">
          <span className="rs-kpi-h"><span className="kpi-ic"><Icono d={IC.falla} /></span>Fallas del mes</span>
          <span className="rs-kpi-row">
            <span className="rs-kpi-t">
              <b className="rs-kpi-v num">{eH ? "—" : fallasMes.length}<small> correctivos</small></b>
              {eH ? <span className="rs-kpi-s">Sin datos</span> : <Delta actual={fallasMes.length} anterior={fallasAnt.length} texto={`vs ${mesCorto(anterior)}`} />}
            </span>
            {!eH && <Sparkline valores={serieFallas} color="#d4005a" />}
          </span>
        </Link>
        <Link href="/admin/preventivos" className="rs-kpi">
          <span className="rs-kpi-h"><span className="kpi-ic"><Icono d={IC.escudo} /></span>Preventivo</span>
          <span className="rs-kpi-row">
            <span className="rs-kpi-t">
              <b className="rs-kpi-v num">{eP ? "—" : `${hechos} de ${prevMes.length}`}<small> hechos</small></b>
              <span className="rs-kpi-s">{eG ? "" : `${pctPrev.toFixed(0)}% del gasto fue preventivo`}</span>
            </span>
            {!eG && <Sparkline valores={seriePrev} color="#46ad48" />}
          </span>
        </Link>
      </div>

      {/* ---------- Bandeja ---------- */}
      <div className="rs-bandeja">
        <section className="dcard" aria-labelledby="rs-hoy">
          <header>
            <div><h3 id="rs-hoy">Requiere tu atención</h3><p>Ordenado por impacto: primero lo que detiene la venta o ya cuesta dinero.</p></div>
            {pendientes.length > 0 && <span className={`pill ${urgentes ? "bad" : "warn"}`}>{plural(pendientes.length, "pendiente", "pendientes")}</span>}
          </header>
          {pendientes.length ? (
            <ul className="rs-tareas">
              {pendientes.map((x) => (
                <li key={x.titulo} className={`rs-tarea ${x.sev}`}>
                  <span className="rs-sev" aria-hidden="true" />
                  <span className="rs-tarea-t">
                    <b>{x.titulo}</b>
                    <small>{x.detalle}</small>
                  </span>
                  <Link href={x.href} className={`btn small${x.sev === "bad" ? " primary" : ""}`}>{x.accion}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rs-calma">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
              {caidas.length ? "Nada pendiente en las fuentes que sí respondieron." : "Todo en orden. No hay nada urgente por ahora."}
            </p>
          )}
        </section>

        <section className="dcard" aria-labelledby="rs-semana">
          <header><div><h3 id="rs-semana">Para esta semana</h3><p>No es urgente, pero tiene fecha.</p></div></header>
          {semana.length ? (
            <ul className="rs-semana">
              {semana.map(([t, , v, href]) => (
                <li key={t}><Link href={href}><span>{t}</span><b className="num">{v}</b></Link></li>
              ))}
            </ul>
          ) : <p className="vacio">Nada programado para esta semana.</p>}
          <div className="rs-prox">
            <h4>Próximos preventivos</h4>
            {eP ? <ErrorDatos fuente="los preventivos" /> : proximos.length ? (
              <div className="upcoming">
                {proximos.slice(0, 3).map((x) => {
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
            <Link className="dash-more" href="/admin/preventivos/plan">Ver plan</Link>
          </div>
        </section>
      </div>

      {/* ---------- Análisis ---------- */}
      <section className="rs-analisis" aria-labelledby="rs-an">
        <h2 id="rs-an" className="rs-h2">Análisis de {nombreMes(mes)}</h2>
        <Pestanas nombre="Análisis del mes" etiquetas={["Dinero", "Equipos y fallas", "Sucursales"]}>
          <div className="bento">
            <section className="dcard s8">
              <header><div><h3>Gasto mensual contra presupuesto</h3><p>Hojas de servicio, gastos y caja chica · 6 meses</p></div><Link className="dash-more" href="/admin/reporte">Reporte</Link></header>
              {eG ? <ErrorDatos fuente="los gastos" /> : <GraficaMensual datos={meses.map((m, i) => ({ etiqueta: mesCorto(m), valor: serieGasto[i], parcial: m === mesHoy }))} presupuesto={presupuesto} />}
            </section>
            <section className="dcard s4">
              <header><div><h3>Gasto por zona</h3><p>{nombreMes(mes)}</p></div></header>
              {eG ? <ErrorDatos fuente="los gastos" /> : porZona.some((x) => x.actual > 0) ? (
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
              {eG ? <ErrorDatos fuente="los gastos" /> : categorias.length ? <Treemap datos={categorias} /> : <p className="vacio">Sin gastos este mes.</p>}
            </section>
            <section className="dcard s5">
              <header><div><h3>Proveedores y técnicos</h3><p>A quién se le pagó más en {nombreMes(mes)}</p></div></header>
              {eG ? <ErrorDatos fuente="los gastos" /> : topProv.length ? (
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
          </div>

          <div className="bento">
            <section className="dcard s7">
              <header><div><h3>Equipos que más fallan</h3><p>Correctivos en hojas de servicio · últimos 90 días</p></div><Link className="dash-more" href="/admin/hojas">Hojas</Link></header>
              {eH ? <ErrorDatos fuente="las hojas de servicio" /> : equiposFallan.length ? (
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
              <header><div><h3>Preventivo contra correctivo</h3><p>% del gasto que fue preventivo</p></div></header>
              {eG ? <ErrorDatos fuente="los gastos" /> : (
                <>
                  <GraficaTipo datos={meses.map((m) => { const t = tipoMes(deMes(m)); return { etiqueta: mesCorto(m), preventivo: t.prev, otros: t.tot - t.prev, actual: m === mes }; })} />
                  <div className="legend">
                    <span><i style={{ background: "var(--orange)" }} />Preventivo</span>
                    <span><i style={{ background: "var(--ink)" }} />Correctivo y otros</span>
                  </div>
                </>
              )}
            </section>
            <section className="dcard s12">
              <header><div><h3>Reparar o reemplazar</h3><p>Lo gastado en cada equipo contra lo que costó</p></div><Link className="dash-more" href="/admin/activos">Equipos</Link></header>
              {eA ? <ErrorDatos fuente="los equipos" /> : caros.length ? (
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
          </div>

          <div className="bento">
            <section className="dcard s12">
              <header>
                <div><h3>Sucursales del mes</h3><p>Dónde se movió el mantenimiento en {nombreMes(mes)}: gasto y fallas (correctivos) por tienda.</p></div>
                <Link className="dash-more" href="/admin/sucursales">Mapa</Link>
              </header>
              {eG || eH ? <ErrorDatos fuente={eG ? "los gastos" : "las hojas de servicio"} /> : (
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
              )}
            </section>
          </div>
        </Pestanas>
      </section>
    </main>
  );
}
