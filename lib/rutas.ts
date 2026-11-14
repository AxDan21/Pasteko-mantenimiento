/**
 * Plan inteligente de preventivos: agrupa los preventivos pendientes en "salidas" por técnico,
 * juntando sucursales cercanas, ordena la ruta y estima kilómetros. Funciones puras.
 */
import { kmCarretera, type Punto } from "@/lib/geo";
import { diasEntre, sumarDias } from "@/lib/panel";

export type PrevPend = { id: number; fecha: string; sucursal_id: number; equipo: string; tarea: string; tecnico_id: string | null };
export type SucUbi = { id: number; nombre: string; zona: string; lat: number; lng: number };
export type TecBase = { id: string; nombre: string; base: string; lat: number; lng: number };

export type Parada = { sucursal: SucUbi; preventivos: PrevPend[]; vencidos: number; fechaMin: string; kmDesdeAnterior: number };
export type Salida = {
  clave: string; tecnico: TecBase; fecha: string; paradas: Parada[];
  km: number; kmSeparadas: number; ahorroKm: number; urgente: boolean; preventivos: number;
};

export type Opciones = { hoy: string; radioKm?: number; maxParadas?: number; ventanaDias?: number };

/** Siguiente día hábil (lunes a sábado) a partir de una fecha. */
export function diaHabil(f: string) {
  let d = f;
  for (let i = 0; i < 7; i++) {
    const [y, m, dd] = d.split("-").map(Number);
    if (new Date(Date.UTC(y, m - 1, dd)).getUTCDay() !== 0) return d;
    d = sumarDias(d, 1);
  }
  return d;
}

/** Ordena paradas con "vecino más cercano" saliendo de la base del técnico. */
function ordenar(base: Punto, ps: Parada[]) {
  const restantes = [...ps], ruta: Parada[] = [];
  let actual: Punto = base;
  while (restantes.length) {
    let mejor = 0, dist = Infinity;
    restantes.forEach((p, i) => { const d = kmCarretera(actual, p.sucursal); if (d < dist) { dist = d; mejor = i; } });
    const [p] = restantes.splice(mejor, 1);
    ruta.push({ ...p, kmDesdeAnterior: dist });
    actual = p.sucursal;
  }
  return ruta;
}

export function planear(prevs: PrevPend[], sucursales: SucUbi[], tecnicos: TecBase[], o: Opciones) {
  const radio = o.radioKm ?? 35, max = o.maxParadas ?? 6, ventana = o.ventanaDias ?? 21;
  const sucPorId = new Map(sucursales.map((s) => [s.id, s]));
  const tecPorId = new Map(tecnicos.map((t) => [t.id, t]));
  const sinUbicacion = new Set<number>();
  const sinTecnico: PrevPend[] = [];

  // 1. Paradas por técnico: respeta el técnico ya asignado; si no, el más cercano
  const paradas = new Map<string, Map<number, Parada>>();
  for (const p of prevs) {
    const s = sucPorId.get(p.sucursal_id);
    if (!s) { sinUbicacion.add(p.sucursal_id); continue; }
    const t = (p.tecnico_id && tecPorId.get(p.tecnico_id)) ||
      [...tecnicos].sort((a, b) => kmCarretera(a, s) - kmCarretera(b, s))[0];
    if (!t) { sinTecnico.push(p); continue; }
    if (!paradas.has(t.id)) paradas.set(t.id, new Map());
    const m = paradas.get(t.id)!;
    const par = m.get(s.id) ?? { sucursal: s, preventivos: [], vencidos: 0, fechaMin: p.fecha, kmDesdeAnterior: 0 };
    par.preventivos.push(p);
    if (p.fecha < o.hoy) par.vencidos++;
    if (p.fecha < par.fechaMin) par.fechaMin = p.fecha;
    m.set(s.id, par);
  }

  // 2. Agrupa paradas cercanas en salidas (la más urgente primero)
  const salidas: Salida[] = [];
  for (const [tid, m] of paradas) {
    const t = tecPorId.get(tid) ?? tecnicos.find((x) => x.id === tid)!;
    const pendientes = [...m.values()].sort((a, b) => b.vencidos - a.vencidos || a.fechaMin.localeCompare(b.fechaMin));
    while (pendientes.length) {
      const semilla = pendientes.shift()!;
      const grupo = [semilla];
      // Fecha tentativa de la salida: mañana si hay algo vencido, si no la fecha del más urgente
      const tentativa = semilla.vencidos || semilla.fechaMin <= o.hoy ? sumarDias(o.hoy, 1) : semilla.fechaMin;
      const limite = sumarDias(tentativa, ventana); // no adelantar más de 3 semanas un preventivo
      for (let i = 0; i < pendientes.length && grupo.length < max;) {
        const cerca = pendientes[i].fechaMin <= limite && grupo.some((g) => kmCarretera(g.sucursal, pendientes[i].sucursal) <= radio);
        if (cerca) grupo.push(pendientes.splice(i, 1)[0]);
        else i++;
      }
      const ruta = ordenar(t, grupo);
      const ultima = ruta[ruta.length - 1].sucursal;
      const km = ruta.reduce((s, p) => s + p.kmDesdeAnterior, 0) + kmCarretera(ultima, t);
      const kmSeparadas = ruta.reduce((s, p) => s + 2 * kmCarretera(t, p.sucursal), 0);
      const urgente = ruta.some((p) => p.vencidos > 0);
      const fechaMin = ruta.map((p) => p.fechaMin).sort()[0];
      const fecha = diaHabil(urgente || fechaMin <= o.hoy ? sumarDias(o.hoy, 1) : fechaMin);
      salidas.push({
        clave: `${t.id}-${ruta.map((p) => p.sucursal.id).join("-")}`,
        tecnico: t, fecha, paradas: ruta, km, kmSeparadas, ahorroKm: Math.max(0, kmSeparadas - km), urgente,
        preventivos: ruta.reduce((s, p) => s + p.preventivos.length, 0),
      });
    }
  }
  salidas.sort((a, b) => Number(b.urgente) - Number(a.urgente) || a.fecha.localeCompare(b.fecha) || b.preventivos - a.preventivos);
  return { salidas, sinUbicacion: [...sinUbicacion], sinTecnico };
}

/** Enlace de Google Maps con la ruta completa: sale de la base, visita las sucursales y regresa. */
export function enlaceRuta(s: Salida) {
  const p = (x: Punto) => `${x.lat},${x.lng}`;
  const q = new URLSearchParams({
    api: "1", origin: p(s.tecnico), destination: p(s.tecnico), travelmode: "driving",
    waypoints: s.paradas.slice(0, 9).map((x) => p(x.sucursal)).join("|"),
  });
  return `https://www.google.com/maps/dir/?${q.toString()}`;
}

// ---------- Sugerencias para adelantarse a las fallas ----------
export type HojaMin = { sucursal_id: number; equipo: string; tipo: string; creada: string; falla: string };
export type Sugerencia = {
  clave: string; tipo: "repetida" | "campana"; titulo: string; detalle: string;
  objetivos: { sucursal_id: number; equipo: string }[];
};

/**
 * - Fallas repetidas: el mismo equipo en la misma sucursal con 2+ correctivos en 90 días y sin preventivo pendiente.
 * - Campañas: el mismo tipo de equipo falló en 3+ sucursales en 60 días → revisar en las demás que lo tienen.
 */
export function sugerencias(
  hojas: HojaMin[], pendientes: { sucursal_id: number; equipo: string }[], equiposPorSucursal: { sucursal_id: number; equipo: string }[],
  nombreSuc: Map<number, string>, hoy: string,
): Sugerencia[] {
  const tiene = new Set(pendientes.map((p) => `${p.sucursal_id}|${p.equipo.toLowerCase()}`));
  const corr = hojas.filter((x) => x.tipo === "Correctivo");
  const out: Sugerencia[] = [];

  const rep = new Map<string, HojaMin[]>();
  for (const x of corr.filter((x) => diasEntre(x.creada.slice(0, 10), hoy) <= 90)) {
    const k = `${x.sucursal_id}|${x.equipo.toLowerCase()}`;
    rep.set(k, [...(rep.get(k) ?? []), x]);
  }
  for (const [k, l] of rep) {
    if (l.length < 2 || tiene.has(k)) continue;
    const { sucursal_id, equipo } = l[0];
    out.push({
      clave: `r-${k}`, tipo: "repetida",
      titulo: `${equipo} en ${nombreSuc.get(sucursal_id) ?? "sucursal"}: ${l.length} correctivos en 90 días`,
      detalle: l.slice(0, 3).map((x) => `${x.creada.slice(5, 10).split("-").reverse().join("/")} ${x.falla}`).join(" · "),
      objetivos: [{ sucursal_id, equipo }],
    });
  }

  const porEquipo = new Map<string, Set<number>>();
  for (const x of corr.filter((x) => diasEntre(x.creada.slice(0, 10), hoy) <= 60)) {
    const e = x.equipo;
    porEquipo.set(e, (porEquipo.get(e) ?? new Set()).add(x.sucursal_id));
  }
  for (const [equipo, fallaron] of porEquipo) {
    if (fallaron.size < 3) continue;
    const objetivos = Array.from(new Set(equiposPorSucursal.filter((a) => a.equipo.toLowerCase() === equipo.toLowerCase()).map((a) => a.sucursal_id)))
      .filter((sid) => !tiene.has(`${sid}|${equipo.toLowerCase()}`))
      .map((sucursal_id) => ({ sucursal_id, equipo }));
    if (!objetivos.length) continue;
    out.push({
      clave: `c-${equipo}`, tipo: "campana",
      titulo: `${equipo}: falló en ${fallaron.size} sucursales en 60 días`,
      detalle: `Revisión preventiva en ${objetivos.length} sucursal${objetivos.length !== 1 ? "es" : ""} que tienen este equipo y no tienen preventivo pendiente.`,
      objetivos,
    });
  }
  return out;
}
