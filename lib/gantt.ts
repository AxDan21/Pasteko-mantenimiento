/**
 * Gantt de aperturas: plantilla de pasos, dependencias, cálculo de fechas,
 * ruta crítica y proyección de riesgo. Funciones puras (sin servidor).
 * Todo en días naturales.
 */
import { diasEntre, MESES_LARGOS, sumarDias } from "@/lib/panel";

export type Ancla = "inicio" | "fin";
/** "proveedor" = días de entrega del proveedor configurados en la apertura. */
export type Dep = { paso: string; ancla: Ancla; dias: number | "proveedor" };
export type PasoPlantilla = {
  clave: string;
  actividad: string;
  responsable: string;
  /** días; 0 = hito de un solo día. La obra usa los días configurados en la apertura. */
  duracion: number;
  deps: Dep[];
  solo?: "franquicia" | "bebidas";
  hito?: "verde" | "amarillo";
  /** ocurre después de la apertura suave (no entra en la ruta crítica) */
  postApertura?: boolean;
};

/** Orden topológico: cada paso aparece después de los pasos de los que depende. */
export const PLANTILLA: PasoPlantilla[] = [
  { clave: "pago", actividad: "Pago de equipos", responsable: "Tesorería", duracion: 0, deps: [] },
  { clave: "kickoff", actividad: "Kickoff franquiciatario · Pasteko comercial: contratación de servicios y fechas estelares", responsable: "Comercial", duracion: 0, deps: [{ paso: "pago", ancla: "fin", dias: 3 }], solo: "franquicia" },
  { clave: "obra", actividad: "Habilitación de obra", responsable: "Arquitecto", duracion: 31, deps: [{ paso: "pago", ancla: "fin", dias: 7 }], hito: "verde" },
  { clave: "alta_digital", actividad: "Alta de sucursal en medios digitales", responsable: "MKT", duracion: 0, deps: [{ paso: "obra", ancla: "inicio", dias: 9 }] },
  { clave: "rrss", actividad: "Promoción en RRSS", responsable: "MKT", duracion: 0, deps: [{ paso: "obra", ancla: "inicio", dias: 9 }] },
  { clave: "cap_virtual", actividad: "Capacitación virtual", responsable: "SICAVI", duracion: 0, deps: [{ paso: "obra", ancla: "inicio", dias: 9 }] },
  { clave: "entrega_corp", actividad: "Entrega de equipos en corporativo", responsable: "Compras", duracion: 0, deps: [{ paso: "pago", ancla: "fin", dias: "proveedor" }] },
  { clave: "barradas", actividad: "Entrega de barradas en sucursal", responsable: "Compras", duracion: 0, deps: [{ paso: "entrega_corp", ancla: "fin", dias: 3 }] },
  { clave: "instalacion", actividad: "Envío e instalación de equipo", responsable: "Arquitecto/Mtto", duracion: 0, deps: [{ paso: "entrega_corp", ancla: "fin", dias: 6 }] },
  { clave: "pos", actividad: "Punto de venta y cámaras", responsable: "Sistemas/Mtto", duracion: 0, deps: [{ paso: "obra", ancla: "inicio", dias: 20 }] },
  { clave: "brandeo", actividad: "Brandeo", responsable: "MKT", duracion: 0, deps: [{ paso: "obra", ancla: "inicio", dias: 21 }] },
  { clave: "validacion", actividad: "Validación de equipos en sitio", responsable: "Excelencia Operativa", duracion: 0, deps: [{ paso: "instalacion", ancla: "fin", dias: 1 }] },
  { clave: "llave", actividad: "Entrega llave en mano", responsable: "Excelencia Operativa", duracion: 0, deps: [{ paso: "obra", ancla: "fin", dias: 0 }, { paso: "validacion", ancla: "fin", dias: 0 }], solo: "franquicia" },
  { clave: "cap_core", actividad: "Capacitación presencial core principal", responsable: "Excelencia Operativa", duracion: 0, deps: [{ paso: "obra", ancla: "fin", dias: 1 }] },
  { clave: "cap_bebidas", actividad: "Capacitación presencial de bebidas", responsable: "Excelencia Operativa", duracion: 0, deps: [{ paso: "obra", ancla: "fin", dias: 1 }], solo: "bebidas" },
  { clave: "primer_pedido", actividad: "Primer pedido", responsable: "ATC", duracion: 0, deps: [{ paso: "obra", ancla: "fin", dias: 2 }] },
  {
    clave: "apertura", actividad: "Apertura suave", responsable: "Excelencia Operativa - Franquicia", duracion: 0, hito: "amarillo",
    deps: [
      { paso: "obra", ancla: "fin", dias: 2 }, { paso: "validacion", ancla: "fin", dias: 1 }, { paso: "llave", ancla: "fin", dias: 0 },
      { paso: "cap_core", ancla: "fin", dias: 1 }, { paso: "cap_bebidas", ancla: "fin", dias: 1 }, { paso: "primer_pedido", ancla: "fin", dias: 0 },
    ],
  },
  { clave: "inauguracion", actividad: "Inauguración", responsable: "MKT - Franquicia", duracion: 0, deps: [{ paso: "apertura", ancla: "fin", dias: 8 }], postApertura: true },
  { clave: "fin_capacitacion", actividad: "Final de capacitación presencial", responsable: "Excelencia Operativa - Franquicia", duracion: 0, deps: [{ paso: "apertura", ancla: "fin", dias: 8 }], postApertura: true },
];
export const PASO = new Map(PLANTILLA.map((p) => [p.clave, p]));

// ---------- Fases (agrupan los pasos y les dan color) ----------
export type FaseClave = "compras" | "obra" | "equipo" | "mkt" | "cap" | "ap" | "extra";
export const FASES: Record<FaseClave, { nombre: string; color: string }> = {
  compras: { nombre: "Compras y proveedor", color: "#008c93" },
  obra: { nombre: "Obra", color: "#ea5731" },
  equipo: { nombre: "Equipo y sistemas", color: "#6f1c75" },
  mkt: { nombre: "Marketing", color: "#d4005a" },
  cap: { nombre: "Capacitación", color: "#46ad48" },
  ap: { nombre: "Apertura", color: "#636361" },
  extra: { nombre: "Pasos extra", color: "#929291" },
};
export const ORDEN_FASES: FaseClave[] = ["compras", "obra", "equipo", "mkt", "cap", "ap", "extra"];
const FASE_DE: Record<string, FaseClave> = {
  pago: "compras", kickoff: "compras", entrega_corp: "compras", barradas: "compras",
  obra: "obra",
  instalacion: "equipo", pos: "equipo", validacion: "equipo",
  alta_digital: "mkt", rrss: "mkt", brandeo: "mkt", inauguracion: "mkt",
  cap_virtual: "cap", cap_core: "cap", cap_bebidas: "cap", fin_capacitacion: "cap",
  llave: "ap", primer_pedido: "ap", apertura: "ap",
};
export const faseDe = (clave: string | null): FaseClave => (clave ? FASE_DE[clave] ?? "extra" : "extra");
/** Nombre corto de una actividad (sin el detalle después de " · "). */
export const corto = (actividad: string) => actividad.split(" · ")[0];
/** Pasos que dependen directamente de `clave`. */
export const dependientesDe = (clave: string) => PLANTILLA.filter((p) => p.deps.some((d) => d.paso === clave)).map((p) => p.clave);

/** En qué porcentaje de la obra cae la instalación de equipo (lo ideal: cerca de la mitad). */
export function instalacionEnObra(calc: Record<string, { inicio: string; fin: string; duracion: number }>) {
  const o = calc.obra, i = calc.instalacion;
  if (!o || !i || o.duracion <= 0) return null;
  return Math.round((diasEntre(o.inicio, i.fin) / o.duracion) * 100);
}

export type Config = { tipo: string; fecha_pago: string; dias_obra: number; dias_proveedor: number; lleva_bebidas: boolean };
export type EstadoPaso = "pendiente" | "en_proceso" | "bloqueado" | "hecho";
export type Captura = { duracion?: number | null; fecha_fija?: string | null; estado?: EstadoPaso | string | null; fecha_real?: string | null };
export type Calculo = { clave: string; inicio: string; fin: string; duracion: number };

export const ESTADOS: Record<EstadoPaso, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "neutral" },
  en_proceso: { texto: "En proceso", clase: "info" },
  bloqueado: { texto: "Bloqueado", clase: "bad" },
  hecho: { texto: "Hecho", clase: "ok" },
};

export const aplica = (p: PasoPlantilla, cfg: Config) =>
  p.solo === "franquicia" ? cfg.tipo === "Franquicia" : p.solo === "bebidas" ? cfg.lleva_bebidas : true;

const diasDep = (d: Dep, cfg: Config) => (d.dias === "proveedor" ? cfg.dias_proveedor : d.dias);
const duracionDe = (p: PasoPlantilla, cfg: Config, cap?: Captura) =>
  cap?.duracion != null ? cap.duracion : p.clave === "obra" ? cfg.dias_obra : p.duracion;

/**
 * Calcula las fechas hacia adelante desde el pago de equipos.
 * - Un paso hecho con fecha real empuja a sus dependientes con esa fecha.
 * - Una fecha fija (caso especial) reemplaza la calculada.
 * - Con `hoy`, además proyecta: lo vencido y no hecho se considera terminado hoy (para medir riesgo).
 */
export function calcular(cfg: Config, capturas: Record<string, Captura>, opciones: { hoy?: string } = {}) {
  const r: Record<string, Calculo> = {};
  const ef: Record<string, { inicio: string; fin: string }> = {};
  for (const p of PLANTILLA) {
    if (!aplica(p, cfg)) continue;
    const cap = capturas[p.clave] ?? {};
    const dur = duracionDe(p, cfg, cap);
    let inicio = cfg.fecha_pago;
    if (p.clave !== "pago") {
      const cands = p.deps.filter((d) => ef[d.paso]).map((d) => sumarDias(ef[d.paso][d.ancla], diasDep(d, cfg)));
      if (cands.length) inicio = cands.sort()[cands.length - 1];
    }
    let fin = sumarDias(inicio, dur);
    if (cap.fecha_fija && p.clave !== "apertura") {
      fin = cap.fecha_fija;
      inicio = sumarDias(fin, -dur);
    }
    r[p.clave] = { clave: p.clave, inicio, fin, duracion: dur };

    let eFin = fin;
    if (cap.estado === "hecho" && cap.fecha_real) eFin = cap.fecha_real;
    else if (opciones.hoy && fin < opciones.hoy) eFin = opciones.hoy;
    ef[p.clave] = { inicio, fin: eFin };
  }
  return r;
}

/**
 * Holgura (días de margen) de cada paso antes de retrasar la apertura suave.
 * 0 o menos = ruta crítica. null = pasos posteriores a la apertura.
 */
export function holguras(calc: Record<string, Calculo>, cfg: Config): Record<string, number | null> {
  const ap = calc.apertura;
  if (!ap) return {};
  const pasos = PLANTILLA.filter((p) => calc[p.clave]);
  const LF: Record<string, string> = {};
  for (const p of [...pasos].reverse()) {
    if (p.postApertura) continue;
    if (p.clave === "apertura") { LF[p.clave] = ap.fin; continue; }
    let lf = ap.fin;
    for (const s of pasos) {
      if (s.postApertura || !LF[s.clave]) continue;
      for (const d of s.deps) {
        if (d.paso !== p.clave) continue;
        const sLS = sumarDias(LF[s.clave], -calc[s.clave].duracion);
        const lim = sumarDias(sLS, -diasDep(d, cfg));
        const pLF = d.ancla === "fin" ? lim : sumarDias(lim, calc[p.clave].duracion);
        if (pLF < lf) lf = pLF;
      }
    }
    LF[p.clave] = lf;
  }
  return Object.fromEntries(pasos.map((p) => [p.clave, p.postApertura ? null : diasEntre(calc[p.clave].fin, LF[p.clave])]));
}

/** Avisos de consistencia del plan. */
export function avisos(calc: Record<string, Calculo>): string[] {
  const a: string[] = [];
  const obra = calc.obra, inst = calc.instalacion;
  if (obra && inst && inst.fin > obra.fin) a.push(`La instalación de equipo (${fechaCorta(inst.fin)}) queda después del fin de obra (${fechaCorta(obra.fin)}). Debe hacerse a mitad de obra.`);
  if (obra && inst && inst.fin < obra.inicio) a.push(`La instalación de equipo queda antes de que empiece la obra.`);
  return a;
}

/** Riesgo de la apertura suave: proyección contra la meta (o contra el plan original). */
export function riesgo(proy: Record<string, Calculo>, objetivo: string | null) {
  const p = proy.apertura?.fin;
  if (!p || !objetivo) return { dias: 0, proyectada: p ?? null };
  return { dias: diasEntre(objetivo, p), proyectada: p };
}

// ---------- Áreas (para "Mi semana" y mensajes) ----------
const ALIAS: Record<string, string> = {
  mtto: "Mantenimiento", mantenimiento: "Mantenimiento", excelencia: "Excelencia Operativa",
  "excelencia operativa": "Excelencia Operativa", franquicia: "Franquiciatario", mkt: "MKT",
};
export function areasDe(responsable: string): string[] {
  const partes = responsable.split(/\s*\/\s*|\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set(partes.map((s) => ALIAS[s.toLowerCase()] ?? s)));
}

// ---------- Formato ----------
export const fechaCorta = (f: string) => {
  const [, m, d] = f.split("-").map(Number);
  return `${d} ${MESES_LARGOS[m - 1].slice(0, 3)}`;
};
/** "6 OCTUBRE", como en el formato de Excel. */
export function fechaExcel(f: string | null) {
  if (!f) return "NO APLICA";
  const [, m, d] = f.split("-").map(Number);
  return `${d} ${MESES_LARGOS[m - 1].toUpperCase()}`;
}

export type FilaExcel = { actividad: string; responsable: string; inicio: string | null; fin: string | null; duracion: number; estado: string };
/** Tabla separada por tabuladores: se pega directo en Excel respetando columnas. */
export function tablaExcel(nombre: string, filas: FilaExcel[]) {
  const limpio = (s: string) => s.replace(/[\t\r\n]+/g, " ").trim();
  return [
    ["Nombre de la sucursal", "", limpio(nombre), "", ""].join("\t"),
    ["Pasos", "Actividad", "Responsable", "Inicio", "Entrega", "Estado"].join("\t"),
    ...filas.map((r, i) => [i + 1, limpio(r.actividad), limpio(r.responsable), r.duracion > 0 ? fechaExcel(r.inicio) : "", fechaExcel(r.fin), r.estado].join("\t")),
  ].join("\n");
}
