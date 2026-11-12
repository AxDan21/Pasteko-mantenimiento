/**
 * Vista calculada de una apertura: une la configuración y lo capturado en cada paso
 * con el motor del Gantt (lib/gantt). Sin servidor: lo usan las páginas y las acciones.
 */
import {
  areasDe, avisos, calcular, holguras, PASO, PLANTILLA, riesgo,
  type Captura, type Config, type EstadoPaso,
} from "@/lib/gantt";
import { diasEntre } from "@/lib/panel";

export type ApRow = {
  id: number; nombre: string; fecha: string; tipo: string; notas: string | null; modelo: "v1" | "v2";
  fecha_pago: string | null; dias_obra: number; dias_proveedor: number; lleva_bebidas: boolean;
  apertura_meta: string | null; cerrada: boolean;
};
export type ItemRow = {
  id: number; apertura_id: number; clave: string | null; texto: string; responsable: string | null;
  fecha: string | null; inicio: string | null; duracion: number | null; hito: "verde" | "amarillo" | null;
  fecha_base: string | null; fecha_fija: string | null; fecha_real: string | null;
  estado: EstadoPaso; motivo: string | null; hecho: boolean; orden: number;
};
export const AP_COLS = "id, nombre, fecha, tipo, notas, modelo, fecha_pago, dias_obra, dias_proveedor, lleva_bebidas, apertura_meta, cerrada";
export const IT_COLS = "id, apertura_id, clave, texto, responsable, fecha, inicio, duracion, hito, fecha_base, fecha_fija, fecha_real, estado, motivo, hecho, orden";

export type Fila = {
  id: number | null; clave: string | null; actividad: string; responsable: string; areas: string[];
  inicio: string; fin: string; duracion: number; hito: "verde" | "amarillo" | null; post: boolean;
  estado: EstadoPaso; motivo: string | null; fecha_real: string | null; fecha_fija: string | null; fecha_base: string | null;
  holgura: number | null; critica: boolean;
  /** días de atraso (positivo) si ya venció y no está hecho */
  atraso: number;
  /** diferencia contra la fecha planeada original (positivo = se movió hacia adelante) */
  desvio: number;
  depende: string;
  /** duración capturada a mano (null = la de la plantilla o la configuración) */
  dur_manual: number | null;
};

export type Vista = {
  ap: ApRow; cfg: Config; filas: Fila[]; avisos: string[];
  aperturaPlan: string; aperturaProyectada: string; meta: string; riesgo: number;
  hechos: number; total: number; vencidos: number; bloqueados: number;
  semaforo: { texto: string; clase: "ok" | "warn" | "bad" | "neutral" };
  siguiente: Fila | null;
};

export const configDe = (ap: ApRow): Config => ({
  tipo: ap.tipo, fecha_pago: ap.fecha_pago ?? ap.fecha, dias_obra: ap.dias_obra,
  dias_proveedor: ap.dias_proveedor, lleva_bebidas: ap.lleva_bebidas,
});

export const capturasDe = (items: ItemRow[]): Record<string, Captura> =>
  Object.fromEntries(items.filter((i) => i.clave).map((i) => [i.clave!, i]));

function textoDeps(clave: string) {
  const p = PASO.get(clave);
  if (!p || !p.deps.length) return "Arranque del Gantt";
  return p.deps
    .map((d) => {
      const otro = PASO.get(d.paso)?.actividad.split(" · ")[0] ?? d.paso;
      const dias = d.dias === "proveedor" ? "días del proveedor" : `${d.dias} d`;
      return `${d.ancla === "inicio" ? "inicio de " : ""}${otro} + ${dias}`;
    })
    .join(" · ");
}

/** Arma la vista completa de una apertura (modelo con dependencias). */
export function vistaApertura(ap: ApRow, items: ItemRow[], hoy: string): Vista {
  const cfg = configDe(ap);
  const caps = capturasDe(items);
  const plan = calcular(cfg, caps);
  const proy = calcular(cfg, caps, { hoy });
  const holg = holguras(plan, cfg);
  const porClave = new Map(items.filter((i) => i.clave).map((i) => [i.clave!, i]));

  const filas: Fila[] = [];
  for (const p of PLANTILLA) {
    const c = plan[p.clave];
    if (!c) continue;
    const it = porClave.get(p.clave);
    const estado = (it?.estado ?? "pendiente") as EstadoPaso;
    const h = holg[p.clave] ?? null;
    filas.push({
      id: it?.id ?? null, clave: p.clave, actividad: p.actividad, responsable: it?.responsable || p.responsable,
      areas: areasDe(it?.responsable || p.responsable), inicio: c.inicio, fin: c.fin, duracion: c.duracion,
      hito: p.hito ?? null, post: !!p.postApertura, estado, motivo: it?.motivo ?? null,
      fecha_real: it?.fecha_real ?? null, fecha_fija: it?.fecha_fija ?? null, fecha_base: it?.fecha_base ?? null,
      holgura: h, critica: h !== null && h <= 0,
      atraso: estado !== "hecho" && c.fin < hoy ? diasEntre(c.fin, hoy) : 0,
      desvio: it?.fecha_base ? diasEntre(it.fecha_base, c.fin) : 0,
      depende: textoDeps(p.clave), dur_manual: it?.duracion ?? null,
    });
  }
  // Pasos extra capturados a mano (sin dependencias), al final y por fecha
  const extras = items.filter((i) => !i.clave && i.fecha).sort((a, b) => a.fecha!.localeCompare(b.fecha!));
  for (const it of extras) {
    filas.push({
      id: it.id, clave: null, actividad: it.texto, responsable: it.responsable ?? "", areas: areasDe(it.responsable ?? "Sin área"),
      inicio: it.fecha!, fin: it.fecha!, duracion: 0, hito: null, post: false, estado: it.estado, motivo: it.motivo,
      fecha_real: it.fecha_real, fecha_fija: null, fecha_base: it.fecha_base, holgura: null, critica: false,
      atraso: it.estado !== "hecho" && it.fecha! < hoy ? diasEntre(it.fecha!, hoy) : 0,
      desvio: 0, depende: "Paso extra (fecha manual)", dur_manual: null,
    });
  }

  const aperturaPlan = plan.apertura.fin;
  const meta = ap.apertura_meta ?? aperturaPlan;
  const r = riesgo(proy, meta);
  const hechos = filas.filter((f) => f.estado === "hecho").length;
  const vencidos = filas.filter((f) => f.atraso > 0).length;
  const bloqueados = filas.filter((f) => f.estado === "bloqueado").length;
  const semaforo: Vista["semaforo"] = ap.cerrada
    ? { texto: "Cerrada", clase: "neutral" }
    : r.dias > 0
      ? { texto: `En riesgo · +${r.dias} d`, clase: "bad" }
      : bloqueados || vencidos
        ? { texto: "Atención", clase: "warn" }
        : { texto: "En tiempo", clase: "ok" };

  return {
    ap, cfg, filas, avisos: avisos(plan), aperturaPlan, aperturaProyectada: r.proyectada ?? aperturaPlan, meta,
    riesgo: r.dias, hechos, total: filas.length, vencidos, bloqueados, semaforo,
    siguiente: filas.filter((f) => f.estado !== "hecho").sort((a, b) => a.fin.localeCompare(b.fin))[0] ?? null,
  };
}

/** Texto corto del vencimiento: "Vencido 3 d", "Hoy", "En 4 d". */
export function cuando(fin: string, hoy: string) {
  const d = diasEntre(hoy, fin);
  if (d < 0) return { texto: `Vencido ${-d} d`, clase: "bad" as const };
  if (d === 0) return { texto: "Hoy", clase: "warn" as const };
  if (d <= 7) return { texto: `En ${d} d`, clase: "warn" as const };
  return { texto: `En ${d} d`, clase: "neutral" as const };
}

/** Une la etiqueta del estado con el vencimiento, para pills. */
export const estadoClase = (e: EstadoPaso) =>
  e === "hecho" ? "ok" : e === "bloqueado" ? "bad" : e === "en_proceso" ? "info" : "neutral";
