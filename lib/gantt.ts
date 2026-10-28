/** Plantilla y utilidades del Gantt de aperturas. Sin dependencias de servidor. */
import { sumarDias, MESES_LARGOS } from "@/lib/panel";

export type FilaGantt = {
  actividad: string;
  responsable: string;
  fecha: string | null; // YYYY-MM-DD; null = No aplica
  hecho: boolean;
  hito: "verde" | "amarillo" | null;
};

/**
 * Pasos estándar. "dias" es la distancia en días contra la apertura suave
 * (negativo = antes). null = No aplica.
 */
export const PLANTILLA_GANTT: { actividad: string; responsable: string; dias: number | null; hito?: "verde" | "amarillo" }[] = [
  { actividad: "Inicio de la habilitación", responsable: "Arquitecto", dias: -33 },
  { actividad: "Aviso de recurso para comprar de equipos", responsable: "Dir. de Franquicias", dias: -38 },
  { actividad: "Pago de equipo", responsable: "Finanzas", dias: -38 },
  { actividad: "Kickoff Franquiciatario _Pasteko comercial: validación de contratación de servicios, comunicación de fechas estelares", responsable: "Comercial", dias: null },
  { actividad: "Fin de la habilitación", responsable: "Arquitecto", dias: -2, hito: "verde" },
  { actividad: "Alta de sucursal en medios digitales", responsable: "MKT", dias: -24 },
  { actividad: "Promoción en RRSS", responsable: "MKT", dias: -24 },
  { actividad: "Capacitación virtual", responsable: "SICAVI", dias: -24 },
  { actividad: "Entrega equipos en corporativo", responsable: "Compras", dias: -16 },
  { actividad: "Entrega barradas en sucursal", responsable: "Compras", dias: -13 },
  { actividad: "Envío e instalación de equipo", responsable: "Arquitecto/Mtto", dias: -10 },
  { actividad: "Punto de venta y cámaras", responsable: "Sistemas/Mtto", dias: -13 },
  { actividad: "Brandeo", responsable: "MKT", dias: -12 },
  { actividad: "Validación de equipos", responsable: "Excelencia Operativa", dias: -13 },
  { actividad: "Entrega llave en mano", responsable: "Excelencia Operativa", dias: null },
  { actividad: "Primer pedido", responsable: "ATC", dias: 0 },
  { actividad: "Capacitación presencial bebidas y core principal", responsable: "Excelencia Operativa", dias: -1 },
  { actividad: "Apertura suave", responsable: "Excelencia - Franquicia", dias: 0, hito: "amarillo" },
  { actividad: "Inauguración", responsable: "MKT - Franquicia", dias: 8 },
  { actividad: "Final de capacitación presencial", responsable: "Excelencia - Franquicia", dias: 8 },
];

export function filasDesdePlantilla(aperturaSuave: string): FilaGantt[] {
  return PLANTILLA_GANTT.map((p) => ({
    actividad: p.actividad,
    responsable: p.responsable,
    fecha: p.dias === null ? null : sumarDias(aperturaSuave, p.dias),
    hecho: false,
    hito: p.hito ?? null,
  }));
}

/** "6 OCTUBRE", como en el formato de Excel. */
export function fechaExcel(f: string | null) {
  if (!f) return "NO APLICA";
  const [, m, d] = f.split("-").map(Number);
  return `${d} ${MESES_LARGOS[m - 1].toUpperCase()}`;
}

/** Tabla separada por tabuladores: se pega directo en Excel respetando columnas. */
export function tablaExcel(nombre: string, filas: FilaGantt[]) {
  const limpio = (s: string) => s.replace(/[\t\r\n]+/g, " ").trim();
  return [
    ["Nombre de la sucursal", "", limpio(nombre), ""].join("\t"),
    ["Pasos", "Actividad", "Responsable", "Entrega", "Estado"].join("\t"),
    ...filas.map((r, i) => [i + 1, limpio(r.actividad), limpio(r.responsable), fechaExcel(r.fecha), r.hecho ? "Hecho" : r.fecha ? "Pendiente" : "No aplica"].join("\t")),
  ].join("\n");
}
