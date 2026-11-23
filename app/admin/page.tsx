import Link from "next/link";
import type { ReactNode } from "react";
import GraficaMensual from "@/components/GraficaMensual";
import GraficaTipo from "@/components/GraficaTipo";
import IconoUI from "@/components/IconoUI";
import Kpi from "@/components/Kpi";
import { Estado } from "@/components/Insignias";
import SucursalesMes from "@/components/SucursalesMes";
import { Anillo, BarrasH, corto, Dona, Medidor, PALETA, Sparkline } from "@/components/Graficas";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { acumuladoPorActivo, leerAjustes } from "@/lib/datos";
import { mxn } from "@/lib/format";
import type { NombreIcono } from "@/lib/iconos";
import {
  diasEntre, estadoGarantia, estadoPreventivo, hoy, MESES, mesActual, mesCorto, mesValido, nombreMes,
  rangoFechas, recomendacion, sumarDias, sumarMeses,
} from "@/lib/panel";
import { duracion, folioTicket, hace, tiempo, type EstadoTicket, type Prioridad } from "@/lib/tickets";
import type { Activo, Preventivo } from "@/lib/types";

type G = { fecha: string; sucursal_id: number | null; sucursal: string | null; zona: string | null; categoria: string | null; tipo: string | null; monto: number; origen: string; beneficiario: string | null };
type Hoja = { sucursal_id: number; equipo: string; tipo: string; creada: string; total: number };
type TkAbierto = { prioridad: Prioridad; estado: EstadoTicket; sucursal_id: number; creado: string; resuelto_en: string | null };
type Evento = { id: number; creado: string; tipo: string; texto: string; autor: string | null; tickets: { folio: number; sucursal_id: number; equipo: string; sucursales: { nombre: string } | null } | null };

const zonaCorta = (z: string) => z.replace(/^Zona\s*\d+\s*·\s*/i, "");
const fechaHoja = (f: string) => f.slice(0, 10);
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

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

/** Una fuente que no respondió no es lo mismo que "sin datos". */
function ErrorDatos({ fuente }: { fuente: string }) {
  return (
    <div className="ui-error">
      <b>No se pudieron cargar {fuente}</b>
      <p>Esto no significa que no haya datos. Recarga la página para intentarlo de nuevo.</p>
    </div>
  );
}

/** Encabezado de sección (Operación, Dinero) con línea divisoria. */
function Seccion({ id, titulo, children, accion }: { id: string; titulo: string; children: ReactNode; accion?: ReactNode }) {
  return (
    <section className="rz-sec" aria-labelledby={id}>
      <div className="rz-sec-h"><h2 id={id}>{titulo}</h2><span aria-hidden="true" />{accion}</div>
      {children}
    </section>
  );
}

/** Tarjeta con título, descripción y enlace opcional. */
function Tarjeta({ id, titulo, sub, mas, className = "", children }: { id: string; titulo: string; sub?: string; mas?: { href: string; texto: string }; className?: string; children: ReactNode }) {
  return (
    <section className={`dcard rz-card ${className}`} aria-labelledby={id}>
      <header>
        <div><h3 id={id}>{titulo}</h3>{sub && <p>{sub}</p>}</div>
        {mas && <Link className="dash-more" href={mas.href}>{mas.texto}</Link>}
      </header>
      {children}
    </section>
  );
}

type Pendiente = { sev: "bad" | "warn"; icono: NombreIcono; titulo: string; detalle: string; href: string; accion: string };

export default async function Resumen({ searchParams }: { searchParams: Promise<{ mes?: string; zona?: string }> }) {
  await requireAdmin();
  const { mes: mesParam, zona: zonaParam } = await searchParams;
  const supabase = await createClient();
  const h = hoy(), mesHoy = mesActual();
  const mes = mesValido(mesParam) > mesHoy ? mesHoy : mesValido(mesParam);
  const esActual = mes === mesHoy;
  const desde = sumarMeses(mes, -5), anterior = sumarMeses(mes, -1);
  const [ini, fin] = rangoFechas(mes);
  const corte = esActual ? h : sumarDias(fin, -1);
  const hace90 = sumarDias(corte, -90);
  const desdeHojas = hace90 < `${desde}-01` ? hace90 : `${desde}-01`;
  const hace30 = new Date(Date.now() - 30 * 864e5).toISOString();

  const [
    ajustes, { data: g, error: eG }, { data: p, error: eP }, { data: a, error: eA }, { data: r, error: eR }, { data: c, error: eC },
    { data: rev, error: eRev }, { data: pp, error: ePP }, { data: hs, error: eH }, { data: suc }, acum,
    { data: tkA, error: eTk }, { data: tkR }, { data: ev, error: eEv },
  ] = await Promise.all([
    leerAjustes(supabase),
    supabase.from("v_gastos").select("fecha, sucursal_id, sucursal, zona, categoria, tipo, monto, origen, beneficiario").gte("fecha", `${desde}-01`).lt("fecha", fin),
    supabase.from("preventivos").select("id, fecha, sucursal_id, equipo, tarea, hecho, sucursales(nombre)").lte("fecha", sumarDias(h, 60)).order("fecha"),
    supabase.from("activos").select("*").eq("activo", true),
    supabase.from("refacciones").select("stock, minimo"),
    supabase.from("caja_chica").select("monto, factura_path, sucursal_id").gte("fecha", ini).lt("fecha", fin),
    supabase.from("hojas_servicio").select("sucursal_id").eq("estado", "Enviada"),
    supabase.from("v_gastos").select("monto, zona, sucursal_id").eq("pagado", false),
    supabase.from("hojas_servicio").select("sucursal_id, equipo, tipo, creada, total").gte("creada", `${sumarDias(desdeHojas, -1)}T00:00:00`).lt("creada", `${fin}T06:00:00`),
    supabase.from("sucursales").select("id, nombre, zona").eq("activa", true).order("nombre"),
    acumuladoPorActivo(supabase),
    supabase.from("tickets").select("prioridad, estado, sucursal_id, creado, resuelto_en").in("estado", ["abierto", "asignado", "en_proceso"]),
    supabase.from("tickets").select("prioridad, estado, sucursal_id, creado, resuelto_en").eq("estado", "resuelto").gte("resuelto_en", hace30),
    supabase.from("ticket_eventos").select("id, creado, tipo, texto, autor, tickets(folio, sucursal_id, equipo, sucursales(nombre))").order("creado", { ascending: false }).limit(40),
  ]);

  // ---------- Ámbito: todas las zonas o una ----------
  const sucursales = (suc ?? []) as { id: number; nombre: string; zona: string }[];
  const nombreSuc = new Map(sucursales.map((s) => [s.id, s.nombre]));
  const zonaDe = new Map(sucursales.map((s) => [s.id, s.zona]));
  const todasZonas = Array.from(new Set(sucursales.map((s) => s.zona))).sort();
  const zona = zonaParam && todasZonas.includes(zonaParam) ? zonaParam : null;
  /** ¿El registro pertenece al ámbito elegido? Sin zona elegida, todo cuenta. */
  const enAmbito = (sid: number | null | undefined, z?: string | null) => !zona || (z ?? zonaDe.get(sid ?? -1)) === zona;
  const qs = (extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ ...(esActual ? {} : { mes }), ...(zona ? { zona } : {}), ...extra });
    const s = q.toString();
    return s ? `?${s}` : "";
  };
  const conZona = (href: string) => (zona ? `${href}${href.includes("?") ? "&" : "?"}zona=${encodeURIComponent(zona)}` : href);

  const gastosTodos = (g ?? []) as G[];
  const gastos = gastosTodos.filter((x) => enAmbito(x.sucursal_id, x.zona));
  const prevs = ((p ?? []) as unknown as (Pick<Preventivo, "id" | "fecha" | "sucursal_id" | "equipo" | "tarea" | "hecho"> & { sucursales: { nombre: string } | null })[])
    .filter((x) => enAmbito(x.sucursal_id));
  const activos = ((a ?? []) as Activo[]).filter((x) => enAmbito(x.sucursal_id));
  const hojas = ((hs ?? []) as Hoja[]).filter((x) => enAmbito(x.sucursal_id));
  const tickets = ((tkA ?? []) as TkAbierto[]).filter((x) => enAmbito(x.sucursal_id));
  const resueltos = ((tkR ?? []) as TkAbierto[]).filter((x) => enAmbito(x.sucursal_id) && x.resuelto_en);
  const eventos = ((ev ?? []) as unknown as Evento[]).filter((x) => x.tickets && enAmbito(x.tickets.sucursal_id)).slice(0, 6);
  const porRevisar = (rev ?? []).filter((x) => enAmbito(x.sucursal_id as number)).length;
  const caja = (c ?? []).filter((x) => enAmbito(x.sucursal_id as number | null));
  const ppAmb = (pp ?? []).filter((x) => enAmbito(x.sucursal_id as number | null, x.zona as string | null));

  // ---------- Series de 6 meses ----------
  const meses = Array.from({ length: 6 }, (_, i) => sumarMeses(desde, i));
  const suma = (l: G[]) => l.reduce((s, x) => s + Number(x.monto), 0);
  const deMes = (m: string, l = gastos) => l.filter((x) => x.fecha.slice(0, 7) === m);
  const correctivos = hojas.filter((x) => x.tipo === "Correctivo");
  const serieGasto = meses.map((m) => suma(deMes(m)));
  const serieFallas = meses.map((m) => correctivos.filter((x) => x.creada.slice(0, 7) === m).length);
  const tipoMes = (l: G[]) => ({ prev: suma(l.filter((x) => x.tipo === "Preventivo")), tot: suma(l) });
  const seriePrev = meses.map((m) => { const t = tipoMes(deMes(m)); return t.tot ? (t.prev / t.tot) * 100 : 0; });

  // ---------- Mes ----------
  const delMes = deMes(mes), delAnt = deMes(anterior);
  const total = suma(delMes), totalAnt = suma(delAnt);
  const totalGlobal = suma(deMes(mes, gastosTodos));
  const presupuesto = ajustes.presupuesto_mensual;
  const diasMes = diasEntre(ini, fin), dia = esActual ? diasEntre(ini, h) + 1 : diasMes;
  const ritmo = (dia / diasMes) * 100;
  const pct = presupuesto ? (total / presupuesto) * 100 : 0;
  const proyeccion = esActual && dia > 0 ? (total / dia) * diasMes : total;
  const disponible = presupuesto - total;
  const fallasMes = correctivos.filter((x) => x.creada.slice(0, 7) === mes);
  const fallasAnt = correctivos.filter((x) => x.creada.slice(0, 7) === anterior);
  const prevMes = prevs.filter((x) => x.fecha >= ini && x.fecha < fin);
  const hechos = prevMes.filter((x) => x.hecho).length;
  const vencidos = prevs.filter((x) => estadoPreventivo(x, h).texto === "Vencido");
  const proximos = prevs.filter((x) => !x.hecho).slice(0, 4);
  const pctPrev = seriePrev[5];

  // ---------- Reportes de tiendas ----------
  const ahora = Date.now();
  const porEstado = (e: EstadoTicket) => tickets.filter((x) => x.estado === e);
  const nuevos = porEstado("abierto"), asignados = porEstado("asignado"), enCamino = porEstado("en_proceso");
  const fuera = tickets.filter((x) => tiempo(x, ahora).vencido).length;
  const promedio = resueltos.length ? resueltos.reduce((n, x) => n + tiempo(x).horas, 0) / resueltos.length : null;
  const aTiempo = resueltos.length ? Math.round((resueltos.filter((x) => tiempo(x).horas <= tiempo(x).meta).length / resueltos.length) * 100) : null;
  const tkUrg = tickets.filter((x) => x.prioridad === "alta");
  const tkOtros = tickets.filter((x) => x.prioridad !== "alta");
  const sinAsignar = (l: TkAbierto[]) => l.filter((x) => x.estado === "abierto").length;

  // ---------- Gasto por zona (todas) o por sucursal (una zona) ----------
  const agrupar = (l: G[], clave: (x: G) => string | null) => {
    const m = new Map<string, number>();
    l.forEach((x) => { const kk = clave(x); if (kk) m.set(kk, (m.get(kk) ?? 0) + Number(x.monto)); });
    return Array.from(m.entries()).sort((x, y) => y[1] - x[1]);
  };
  const zonaGasto = (l: G[], z: string) => suma(l.filter((x) => (x.zona ?? zonaDe.get(x.sucursal_id ?? -1)) === z));
  const porZona = todasZonas.map((z) => ({ z, actual: zonaGasto(delMes, z), ant: zonaGasto(delAnt, z) })).sort((x, y) => y.actual - x.actual);
  const generales = suma(delMes.filter((x) => !x.sucursal_id));
  const sucGasto = (l: G[]) => new Map(agrupar(l, (x) => (x.sucursal_id ? String(x.sucursal_id) : null)).map(([id, v]) => [Number(id), v]));
  const gastoSuc = sucGasto(delMes), gastoSucAnt = sucGasto(delAnt);
  const porSucursal = Array.from(gastoSuc.entries()).sort((x, y) => y[1] - x[1]).slice(0, 8);

  // ---------- Categorías (dona) ----------
  const categoriasTodas = agrupar(delMes, (x) => x.categoria || "Sin categoría");
  const categorias = [
    ...categoriasTodas.slice(0, 5).map(([nombre, valor], i) => ({ nombre, valor, color: PALETA[i] })),
    ...(categoriasTodas.length > 5 ? [{ nombre: "Otras", valor: categoriasTodas.slice(5).reduce((s, [, v]) => s + v, 0), color: "var(--chart-neutral)" }] : []),
  ];

  // ---------- Mapa por sucursal ----------
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
  const equiposFallan = Array.from(porEquipo.entries()).map(([equipo, e]) => ({ equipo, ...e })).sort((x, y) => y.n - x.n || y.costo - x.costo).slice(0, 6);

  const topProv = agrupar(delMes.filter((x) => x.origen !== "caja"), (x) => x.beneficiario).slice(0, 6);
  const caros = activos
    .map((x) => ({ x, total: acum.get(x.id)?.total ?? 0, rec: recomendacion(x, acum.get(x.id)?.total ?? 0, h) }))
    .filter((e) => e.total > 0).sort((m, n) => n.total - m.total).slice(0, 4);

  // ---------- Pendientes ----------
  const garantias = activos.filter((x) => estadoGarantia(x.garantia_hasta, h).clase === "warn");
  const reemplazo = activos.filter((x) => recomendacion(x, acum.get(x.id)?.total ?? 0, h).clase === "bad");
  const pagadoGarantia = activos.filter((x) => x.garantia_hasta && (acum.get(x.id)?.filas ?? []).some((f) => f.tipo === "Correctivo" && f.fecha <= x.garantia_hasta!));
  const porValidar = activos.filter((x) => !x.validado).length;
  const refBajas = (r ?? []).filter((x) => Number(x.stock) < Number(x.minimo)).length;
  const sinFactura = caja.filter((x) => !x.factura_path).length;
  const cajaUsada = (c ?? []).reduce((s, x) => s + Number(x.monto), 0);
  const cajaSaldo = ajustes.fondo_caja_chica - cajaUsada;
  const montoPP = ppAmb.reduce((s, x) => s + Number(x.monto), 0);

  /** Lo que hay que resolver hoy, ordenado por impacto: primero lo que detiene la venta o ya cuesta dinero. */
  const pendientes: Pendiente[] = [];
  if (tkUrg.length) pendientes.push({
    sev: "bad", icono: "falla", href: "/admin/tickets", accion: "Atender",
    titulo: plural(tkUrg.length, "reporte urgente de tienda", "reportes urgentes de tiendas"),
    detalle: sinAsignar(tkUrg) ? `${sinAsignar(tkUrg)} sin técnico asignado` : "Todos tienen técnico asignado",
  });
  if (vencidos.length) pendientes.push({
    sev: "bad", icono: "reloj", href: conZona("/admin/preventivos?estado=Vencido"), accion: "Reprogramar",
    titulo: plural(vencidos.length, "preventivo vencido", "preventivos vencidos"),
    detalle: `El más antiguo venció hace ${plural(diasEntre(vencidos[0].fecha, h), "día", "días")}`,
  });
  if (!zona && esActual && proyeccion > presupuesto) pendientes.push({
    sev: "bad", icono: "dinero", href: "/admin/gastos", accion: "Ver gastos",
    titulo: "El cierre proyectado rebasa el presupuesto",
    detalle: `Cerrarías en ${mxn(proyeccion)}, ${mxn(proyeccion - presupuesto)} arriba de ${mxn(presupuesto)}`,
  });
  if (pagadoGarantia.length) pendientes.push({
    sev: "bad", icono: "escudo", href: "/admin/activos?rec=garantia", accion: "Revisar",
    titulo: plural(pagadoGarantia.length, "reparación pagada en garantía", "reparaciones pagadas en garantía"),
    detalle: "Se pagó un correctivo a un equipo que aún tenía garantía",
  });
  if (tkOtros.length) pendientes.push({
    sev: "warn", icono: "servicio", href: "/admin/tickets", accion: sinAsignar(tkOtros) ? "Asignar" : "Ver",
    titulo: plural(tkOtros.length, "reporte de tienda abierto", "reportes de tiendas abiertos"),
    detalle: sinAsignar(tkOtros) ? `${sinAsignar(tkOtros)} sin técnico asignado` : "En manos de un técnico",
  });
  if (porRevisar) pendientes.push({
    sev: "warn", icono: "hojas", href: conZona("/admin/hojas?estado=Enviada"), accion: "Revisar",
    titulo: plural(porRevisar, "hoja de servicio por revisar", "hojas de servicio por revisar"),
    detalle: "Enviadas por técnicos, esperan tu visto bueno",
  });
  if (!zona && cajaSaldo < ajustes.fondo_caja_chica * 0.15) pendientes.push({
    sev: "warn", icono: "caja", href: "/admin/caja", accion: "Reponer",
    titulo: "Caja chica casi agotada",
    detalle: `Quedan ${mxn(Math.max(cajaSaldo, 0))} de ${mxn(ajustes.fondo_caja_chica)}`,
  });
  if (sinFactura) pendientes.push({
    sev: "warn", icono: "caja", href: "/admin/caja", accion: "Completar",
    titulo: plural(sinFactura, "gasto de caja chica sin factura", "gastos de caja chica sin factura"),
    detalle: `Del mes de ${nombreMes(mes)}`,
  });

  /** Fuentes que no respondieron: se avisa en lugar de mostrar ceros. */
  const caidas = [
    eTk && "reportes de tiendas", eP && "preventivos", eG && "gastos", eA && "equipos", eRev && "hojas por revisar", eH && "hojas de servicio",
    eC && "caja chica", eR && "refacciones", ePP && "pagos pendientes", eEv && "actividad reciente",
  ].filter(Boolean) as string[];

  const semana = ([
    [garantias.length, "Garantías que vencen en 60 días", garantias.length, conZona("/admin/activos")],
    [ppAmb.length, `Pagos pendientes · ${plural(ppAmb.length, "pago", "pagos")}`, mxn(montoPP), conZona("/admin/gastos#pendientes")],
    [refBajas, "Refacciones bajo el mínimo (almacenes)", refBajas, "/admin/refacciones"],
    [reemplazo.length, "Equipos para evaluar reemplazo", reemplazo.length, conZona("/admin/activos?rec=Evaluar%20reemplazo")],
    [porValidar, "Equipos del censo por validar", porValidar, "/admin/activos/censo"],
  ] as [number, string, string | number, string][]).filter((x) => x[0] > 0);

  const zonaMayor = porZona[0];
  const equipoMayor = equiposFallan[0];
  const colorPres = pct > 100 ? "var(--bad)" : pct > ritmo + 5 ? "var(--chart-3)" : "var(--chart-1)";
  const urgentes = pendientes.filter((x) => x.sev === "bad").length;
  const fechaLarga = new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Mexico_City" }).format(new Date());
  const ambitoTxt = zona ? zonaCorta(zona) : "todas las zonas";
  const titular = !esActual
    ? `Resumen de ${nombreMes(mes)}`
    : pendientes.length
      ? `${plural(pendientes.length, "pendiente requiere", "pendientes requieren")} tu atención`
      : "Todo en orden por hoy";
  const abiertos = tickets.length;

  return (
    <main className="wrap dash rz">
      {/* ---------- Encabezado ---------- */}
      <header className="rs-head">
        <div className="rs-tit">
          <p className="eyebrow">{esActual ? `${fechaLarga} · corte al día ${Number(h.slice(8))}` : "Mes cerrado"} · {ambitoTxt}</p>
          <h1 className="page-h">{titular}</h1>
          <p className="rs-lede">
            {eG ? <>No se pudieron cargar los gastos del mes.</> : total > 0 ? (
              <>
                {esActual ? "Llevas" : "Se gastaron"} <b className="num">{mxn(total)}</b>
                {zona ? <> en {zonaCorta(zona)} ({totalGlobal ? Math.round((total / totalGlobal) * 100) : 0}% del gasto total)</> : null}
                {!zona && esActual ? <> y cerrarías en <b className={`num${proyeccion > presupuesto ? " rs-mal" : ""}`}>{mxn(proyeccion)}</b>{presupuesto ? <> ({((proyeccion / presupuesto) * 100).toFixed(0)}% del presupuesto)</> : null}</> : null}.
              </>
            ) : <>Sin gastos registrados en {nombreMes(mes)}{zona ? ` en ${zonaCorta(zona)}` : ""}.</>}
            {!zona && zonaMayor?.actual ? <> Zona con más gasto: <b>{zonaCorta(zonaMayor.z)}</b>.</> : null}
            {equipoMayor ? <> Equipo que más falla: <b>{equipoMayor.equipo}</b>.</> : null}
          </p>
        </div>
      </header>

      {caidas.length > 0 && (
        <div className="rs-caida" role="alert">
          <IconoUI nombre="falla" />
          <span>
            <b>No se pudo consultar: {caidas.join(", ")}.</b> Las cifras de esas secciones pueden estar incompletas; no significa que estén en cero.
          </span>
          <Link href={`/admin${qs()}`} className="btn small">Reintentar</Link>
        </div>
      )}

      {/* ---------- Atención + reportes abiertos ---------- */}
      <div className="rz-bandeja">
        <section className="dcard rz-card" aria-labelledby="rz-hoy">
          <header>
            <div><h3 id="rz-hoy">Requiere tu atención</h3><p>Ordenado por impacto: primero lo que detiene la venta o ya cuesta dinero.</p></div>
            {pendientes.length > 0 && <Estado tono={urgentes ? "bad" : "warn"}>{plural(pendientes.length, "pendiente", "pendientes")}</Estado>}
          </header>
          {pendientes.length ? (
            <ul className="rz-tareas">
              {pendientes.map((x) => (
                <li key={x.titulo}>
                  <span className={`ui-ic lg ${x.sev}`}><IconoUI nombre={x.icono} tam={17} grosor={2} /></span>
                  <span className="rz-tarea-t"><b>{x.titulo}</b><small>{x.detalle}</small></span>
                  <Link href={x.href} className={`btn small${x.sev === "bad" ? " primary" : ""}`}>{x.accion}</Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rs-calma">
              <IconoUI nombre="check" tam={18} grosor={2.4} />
              {caidas.length ? "Nada pendiente en las fuentes que sí respondieron." : "Todo en orden. No hay nada urgente por ahora."}
            </p>
          )}
        </section>

        <section className="dcard rz-card" aria-labelledby="rz-rep">
          <header>
            <div><h3 id="rz-rep">Reportes de tiendas abiertos</h3><p>Lo que las tiendas reportaron desde el QR y sigue sin resolverse.</p></div>
            <Link className="dash-more" href="/admin/tickets">Servicio</Link>
          </header>
          {eTk ? <ErrorDatos fuente="los reportes" /> : abiertos ? (
            <>
              <div className="rz-flujo-barra" role="img" aria-label={`${abiertos} abiertos: ${nuevos.length} nuevos, ${asignados.length} asignados, ${enCamino.length} en camino`}>
                {nuevos.length > 0 && <i className="bad" style={{ flexGrow: nuevos.length }} />}
                {asignados.length > 0 && <i className="warn" style={{ flexGrow: asignados.length }} />}
                {enCamino.length > 0 && <i className="info" style={{ flexGrow: enCamino.length }} />}
              </div>
              <div className="rz-flujo">
                {([["Nuevos", nuevos.length, "sin técnico", "bad", "sin_asignar"], ["Asignados", asignados.length, "por salir", "warn", "abiertos"], ["En camino", enCamino.length, "técnico en ruta", "info", "abiertos"]] as const).map(([n, v, s, t, f]) => (
                  <Link key={n} href={`/admin/tickets?f=${f}`} className="rz-flujo-i">
                    <span className={`rz-punto ${t}`}>{n}</span>
                    <b className="num">{v}</b>
                    <small>{s}</small>
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <div className="ui-vacio"><b>Sin reportes abiertos</b><p>Cuando una tienda escanee el QR de un equipo y reporte una falla, aparecerá aquí.</p></div>
          )}
          <div className="rz-pie">
            {aTiempo !== null && (
              <Anillo pct={aTiempo} color={aTiempo >= 80 ? "var(--ok-fuerte)" : aTiempo >= 60 ? "var(--chart-3)" : "var(--bad)"} tam={46} grosor={6}><b className="num">{aTiempo}%</b></Anillo>
            )}
            <span>
              {promedio === null ? "Sin reportes resueltos en los últimos 30 días." : <>A tiempo en 30 días · resolución media <b>{duracion(promedio)}</b></>}
              <br />
              {fuera > 0 && <><b className="rz-mal">{plural(fuera, "fuera de tiempo", "fuera de tiempo")}</b> · </>}
              <Link href={conZona("/admin/hojas?estado=Enviada")}>{plural(porRevisar, "hoja por revisar", "hojas por revisar")}</Link>
            </span>
          </div>
        </section>
      </div>

      {/* ---------- OPERACIÓN ---------- */}
      <Seccion id="rz-op" titulo="Operación">
        <div className="rz-kpis">
          <Kpi href={`/admin/hojas${qs({ tipo: "Correctivo" })}`} icono="falla" tono="bad" titulo="Correctivos del mes"
            valor={eH ? "—" : fallasMes.length}
            detalle={eH ? "Sin datos" : <Delta actual={fallasMes.length} anterior={fallasAnt.length} texto={`vs ${mesCorto(anterior)}`} />}
            grafica={!eH && <Sparkline valores={serieFallas} color="var(--bad)" />} />
          <Kpi href={conZona("/admin/preventivos")} icono="escudo" tono="ok" titulo="Preventivos del mes"
            valor={eP ? "—" : <>{hechos}<small> de {prevMes.length}</small></>}
            detalle={eP ? "Sin datos" : prevMes.length ? "hechos del programa" : "Nada programado este mes"}
            grafica={!eP && prevMes.length > 0 && <Anillo pct={(hechos / prevMes.length) * 100} color="var(--ok-fuerte)" tam={56} grosor={7}><b className="num">{Math.round((hechos / prevMes.length) * 100)}%</b></Anillo>} />
          <Kpi href={conZona("/admin/preventivos?estado=Vencido")} icono="reloj" tono="warn" titulo="Preventivos vencidos"
            valor={eP ? "—" : <span className={vencidos.length ? "rz-mal" : undefined}>{vencidos.length}</span>}
            detalle={eP ? "Sin datos" : vencidos.length ? `en ${plural(new Set(vencidos.map((x) => x.sucursal_id)).size, "sucursal", "sucursales")}` : "Nada vencido"} />
          <Kpi href="/admin/activos/censo" icono="censo" tono="info" titulo="Equipos por validar"
            valor={eA ? "—" : porValidar}
            detalle={eA ? "Sin datos" : porValidar ? "del censo de supervisores" : "Censo al día"} />
        </div>

        <div className="rz-grid">
          <Tarjeta id="rz-semana" titulo="Para esta semana" sub="No es urgente, pero tiene fecha." mas={{ href: "/admin/preventivos/plan", texto: "Plan" }}>
            {semana.length > 0 && (
              <ul className="rs-semana">
                {semana.map(([, t, v, href]) => <li key={t}><Link href={href}><span>{t}</span><b className="num">{v}</b></Link></li>)}
              </ul>
            )}
            <h4 className="rz-h4">Próximos preventivos</h4>
            {eP ? <ErrorDatos fuente="los preventivos" /> : proximos.length ? (
              <div className="upcoming">
                {proximos.map((x) => {
                  const e = estadoPreventivo(x, h);
                  return (
                    <div key={x.id} className="up">
                      <div className="date-chip"><b>{Number(x.fecha.slice(8))}</b><small>{MESES[Number(x.fecha.slice(5, 7)) - 1]}</small></div>
                      <div className="t"><b>{x.sucursales?.nombre}</b><small>{x.equipo} · {x.tarea}</small></div>
                      <Estado tono={e.clase}>{e.texto}</Estado>
                    </div>
                  );
                })}
              </div>
            ) : <div className="ui-vacio"><b>Sin preventivos pendientes</b><p><Link href="/admin/preventivos#nuevo">Programa el primero</Link>.</p></div>}
          </Tarjeta>

          <Tarjeta id="rz-act" titulo="Actividad reciente" sub="Historial de los reportes de tiendas" mas={{ href: "/admin/tickets?f=todos", texto: "Todos" }}>
            {eEv ? <ErrorDatos fuente="la actividad" /> : eventos.length ? (
              <ol className="rz-act">
                {eventos.map((x) => (
                  <li key={x.id}>
                    <span className="rz-act-h num" title={new Date(x.creado).toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}>hace {hace(x.creado, ahora)}</span>
                    <span className="rz-act-t">
                      <b className="num">{x.tickets ? folioTicket(x.tickets.folio) : "—"}</b> · {x.texto}
                      <small>{x.tickets?.sucursales?.nombre ?? nombreSuc.get(x.tickets?.sucursal_id ?? -1) ?? "—"} · {x.tickets?.equipo}{x.autor ? ` · ${x.autor}` : ""}</small>
                    </span>
                  </li>
                ))}
              </ol>
            ) : <div className="ui-vacio"><b>Sin actividad todavía</b><p>Aquí verás las asignaciones, cambios de estado y notas de los reportes.</p></div>}
          </Tarjeta>

          <Tarjeta id="rz-fallan" titulo="Equipos que más fallan" sub="Correctivos en hojas de servicio · últimos 90 días" mas={{ href: conZona("/admin/hojas"), texto: "Hojas" }}>
            {eH ? <ErrorDatos fuente="las hojas de servicio" /> : equiposFallan.length ? (
              <BarrasH
                descripcion="Correctivos por tipo de equipo en los últimos 90 días"
                datos={equiposFallan.map((e, i) => ({
                  etiqueta: e.equipo, valor: e.n, texto: String(e.n), color: i === 0 ? "var(--bad)" : "var(--bad-soft)",
                  detalle: `${plural(e.tiendas.size, "tienda", "tiendas")} · ${corto(e.costo)}`,
                }))}
              />
            ) : <div className="ui-vacio"><b>Sin correctivos en 90 días</b><p>Cuando los técnicos registren correctivos, verás aquí los equipos que más fallan.</p></div>}
          </Tarjeta>

          <Tarjeta id="rz-tipo" titulo="Preventivo contra correctivo" sub="Reparto del gasto de cada mes · la meta es que crezca el preventivo">
            {eG ? <ErrorDatos fuente="los gastos" /> : (
              <>
                <GraficaTipo datos={meses.map((m) => { const t = tipoMes(deMes(m)); return { etiqueta: mesCorto(m), preventivo: t.prev, otros: t.tot - t.prev, actual: m === mes }; })} />
                <div className="legend">
                  <span><i style={{ background: "var(--orange)" }} />Preventivo</span>
                  <span><i style={{ background: "var(--ink)" }} />Correctivo y otros</span>
                </div>
              </>
            )}
          </Tarjeta>
        </div>
      </Seccion>

      {/* ---------- DINERO ---------- */}
      <Seccion id="rz-din" titulo="Dinero" accion={<Link className="dash-more" href={`/admin/reporte${esActual ? "" : `?mes=${mes}`}`}>Reporte del mes</Link>}>
        <div className="rz-kpis">
          <Kpi href={`/admin/gastos${qs()}`} icono="dinero" tono="marca" titulo={zona ? `Gasto de ${zonaCorta(zona)}` : "Gasto del mes"}
            valor={eG ? "—" : mxn(total)}
            detalle={eG ? "Sin datos" : <Delta actual={!zona && esActual ? proyeccion : total} anterior={totalAnt} texto={!zona && esActual ? `proyectado vs ${mesCorto(anterior)}` : `vs ${mesCorto(anterior)}`} />}
            grafica={!eG && <Sparkline valores={serieGasto} />} />
          {zona ? (
            <Kpi href={`/admin/gastos${qs()}`} icono="meta" tono="marca" titulo="Parte del gasto total"
              valor={eG ? "—" : `${totalGlobal ? Math.round((total / totalGlobal) * 100) : 0}%`}
              detalle={eG ? "Sin datos" : `de ${mxn(totalGlobal)} en todas las zonas`}
              grafica={!eG && <Anillo pct={totalGlobal ? (total / totalGlobal) * 100 : 0} tam={56} grosor={7} />} />
          ) : (
            <Kpi href="/admin/reporte" icono="meta" tono="marca" titulo="Presupuesto"
              valor={eG ? "—" : disponible >= 0 ? mxn(disponible) : `−${mxn(-disponible)}`}
              detalle={`${disponible >= 0 ? "disponible" : "excedido"} de ${corto(presupuesto)}${esActual ? ` · mes al ${ritmo.toFixed(0)}%` : ""}`}
              grafica={!eG && <Anillo pct={pct} color={colorPres} tam={56} grosor={7}><b className="num">{pct.toFixed(0)}%</b></Anillo>} />
          )}
          <Kpi href={conZona("/admin/gastos#pendientes")} icono="pago" tono="warn" titulo="Pendiente de pago"
            valor={ePP ? "—" : mxn(montoPP)}
            detalle={ePP ? "Sin datos" : ppAmb.length ? plural(ppAmb.length, "pago a proveedor", "pagos a proveedores") : "Todo pagado"} />
          <Kpi href={`/admin/gastos${qs()}`} icono="escudo" tono="ok" titulo="Gasto preventivo"
            valor={eG ? "—" : `${pctPrev.toFixed(0)}%`}
            detalle="del gasto del mes · 6 meses"
            grafica={!eG && <Sparkline valores={seriePrev} color="var(--ok-fuerte)" />} />
        </div>

        <div className="rz-grid">
          <Tarjeta id="rz-mensual" titulo="Gasto mensual contra presupuesto" sub={`Hojas de proveedores, gastos con factura y caja chica · 6 meses${zona ? ` · ${zonaCorta(zona)} contra el presupuesto global` : ""}`} className="rz-ancha">
            {eG ? <ErrorDatos fuente="los gastos" /> : <GraficaMensual datos={meses.map((m, i) => ({ etiqueta: mesCorto(m), valor: serieGasto[i], parcial: m === mesHoy }))} presupuesto={presupuesto} />}
          </Tarjeta>

          <Tarjeta id="rz-zona" titulo={zona ? `Gasto por sucursal · ${zonaCorta(zona)}` : "Gasto por zona"} sub={`${nombreMes(mes)} contra ${mesCorto(anterior)}`}>
            {eG ? <ErrorDatos fuente="los gastos" /> : zona ? (
              porSucursal.length ? (
                <BarrasH descripcion={`Gasto por sucursal en ${zona}`}
                  datos={porSucursal.map(([id, v]) => ({ etiqueta: nombreSuc.get(id) ?? "—", valor: v, texto: corto(v), detalle: <Delta actual={v} anterior={gastoSucAnt.get(id) ?? 0} texto="" /> }))} />
              ) : <div className="ui-vacio"><b>Sin gastos este mes</b><p>No hay gastos registrados en las sucursales de {zonaCorta(zona)}.</p></div>
            ) : porZona.some((x) => x.actual > 0) || generales > 0 ? (
              <BarrasH descripcion="Gasto por zona"
                datos={[
                  ...porZona.map((x) => ({ etiqueta: zonaCorta(x.z), valor: x.actual, texto: corto(x.actual), detalle: <Delta actual={x.actual} anterior={x.ant} texto="" />, href: `/admin?${new URLSearchParams({ ...(esActual ? {} : { mes }), zona: x.z })}` })),
                  ...(generales > 0 ? [{ etiqueta: "Generales", valor: generales, texto: corto(generales), detalle: "sin sucursal", color: "var(--chart-neutral)" }] : []),
                ]} />
            ) : <div className="ui-vacio"><b>Sin gastos este mes</b><p>Cuando se registren gastos, verás aquí cómo se reparten por zona.</p></div>}
          </Tarjeta>

          <Tarjeta id="rz-cat" titulo="¿En qué se va el dinero?" sub="Gasto por categoría de equipo" mas={{ href: `/admin/gastos${qs()}`, texto: "Gastos" }}>
            {eG ? <ErrorDatos fuente="los gastos" /> : categorias.length ? <Dona centro={corto(total)} sub="total del mes" datos={categorias} /> : <div className="ui-vacio"><b>Sin gastos este mes</b><p>Aún no hay gastos que repartir por categoría.</p></div>}
          </Tarjeta>

          <Tarjeta id="rz-prov" titulo="Proveedores y técnicos" sub={`A quién se le pagó más en ${nombreMes(mes)}`}>
            {eG ? <ErrorDatos fuente="los gastos" /> : topProv.length ? (
              <BarrasH descripcion="Pagos por proveedor o técnico"
                datos={topProv.map(([n, v], i) => ({ etiqueta: n, valor: v, texto: corto(v), detalle: `${total ? Math.round((v / total) * 100) : 0}% del gasto`, color: PALETA[i % 6] }))} />
            ) : <div className="ui-vacio"><b>Sin pagos este mes</b><p>No hay pagos a proveedores ni a técnicos externos.</p></div>}
          </Tarjeta>

          <Tarjeta id="rz-caros" titulo="Reparar o reemplazar" sub="Lo gastado en cada equipo contra lo que costó" mas={{ href: conZona("/admin/activos"), texto: "Equipos" }} className="rz-ancha">
            {eA ? <ErrorDatos fuente="los equipos" /> : caros.length ? (
              <div className="caros">
                {caros.map(({ x, total: t, rec }) => {
                  const pv = x.costo > 0 ? (t / x.costo) * 100 : 0;
                  const col = rec.clase === "bad" ? "var(--bad)" : rec.clase === "warn" ? "var(--chart-3)" : "var(--ok-fuerte)";
                  return (
                    <Link key={x.id} href={`/admin/activos/${x.id}`} className="caro">
                      <div className="caro-g">
                        <Medidor pct={pv} color={col} />
                        <b>{x.costo > 0 ? `${pv.toFixed(0)}%` : "—"}</b>
                      </div>
                      <b className="caro-n">{x.equipo}</b>
                      <small>{nombreSuc.get(x.sucursal_id) ?? "—"} · {x.id}</small>
                      <small>{mxn(t)} de {x.costo > 0 ? mxn(x.costo) : "costo sin capturar"}</small>
                      <Estado tono={rec.clase}>{rec.texto}</Estado>
                    </Link>
                  );
                })}
              </div>
            ) : <div className="ui-vacio"><b>Aún sin historial de reparaciones</b><p>Al ligar hojas de servicio a un equipo (QR), aquí verás cuáles conviene reemplazar.</p></div>}
          </Tarjeta>

          <Tarjeta id="rz-suc" titulo="Sucursales del mes" sub={`Dónde se movió el mantenimiento en ${nombreMes(mes)}: gasto y fallas (correctivos) por tienda.`} mas={{ href: "/admin/sucursales", texto: "Mapa" }} className="rz-ancha">
            {eG || eH ? <ErrorDatos fuente={eG ? "los gastos" : "las hojas de servicio"} /> : (
              <SucursalesMes
                mes={mes}
                mesNombre={nombreMes(mes)}
                meses={meses.map((x) => mesCorto(x))}
                zonas={(zona ? [zona] : todasZonas).map((z) => ({
                  zona: z,
                  tiendas: sucursales.filter((s) => s.zona === z).map((s) => ({
                    id: s.id, nombre: s.nombre, gasto: gastoSuc.get(s.id) ?? 0, fallas: fallasSuc.get(s.id) ?? 0,
                    hist: meses.map((x) => gastoSucMes.get(`${s.id}|${x}`) ?? 0),
                  })),
                }))}
              />
            )}
          </Tarjeta>
        </div>
      </Seccion>
    </main>
  );
}
