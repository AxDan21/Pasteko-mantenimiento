/** Mesa de ayuda: catálogo de síntomas, prioridades y estados. Se usa en servidor y navegador. */

export type EstadoTicket = "abierto" | "asignado" | "en_proceso" | "resuelto" | "cancelado";
export type Vender = "si" | "parcial" | "no";
export type Prioridad = "alta" | "media" | "baja";

export type Ticket = {
  id: string; folio: number; token: string; activo_id: string | null; sucursal_id: number; equipo: string;
  sintoma: string; desde: string | null; detalle: string | null; puede_vender: Vender; prioridad: Prioridad;
  reporta_nombre: string; reporta_tel: string | null; fotos: string[]; estado: EstadoTicket;
  tecnico_id: string | null; hoja_id: string | null; creado: string; actualizado: string;
  asignado_en: string | null; resuelto_en: string | null;
};
export type EventoTicket = { id?: number; creado: string; tipo: string; texto: string; publico?: boolean; autor?: string | null };

export const folioTicket = (n: number) => `MT-${String(n).padStart(4, "0")}`;

export const ESTADOS: Record<EstadoTicket, { nombre: string; clase: string }> = {
  abierto: { nombre: "Nuevo", clase: "bad" },
  asignado: { nombre: "Asignado", clase: "warn" },
  en_proceso: { nombre: "En camino", clase: "info" },
  resuelto: { nombre: "Resuelto", clase: "ok" },
  cancelado: { nombre: "Cancelado", clase: "neutral" },
};
export const ABIERTOS: EstadoTicket[] = ["abierto", "asignado", "en_proceso"];

export const VENDER: Record<Vender, { titulo: string; sub: string; prioridad: Prioridad }> = {
  no: { titulo: "No, nos detiene", sub: "No podemos vender un producto o atender", prioridad: "alta" },
  parcial: { titulo: "Con dificultad", sub: "Funciona a medias o hay que improvisar", prioridad: "media" },
  si: { titulo: "Sí, podemos seguir", sub: "Molesta, pero no afecta la venta", prioridad: "baja" },
};

/** Horas objetivo para resolver según prioridad. */
export const META_HORAS: Record<Prioridad, number> = { alta: 6, media: 24, baja: 72 };
export const PRIORIDAD: Record<Prioridad, { nombre: string; clase: string }> = {
  alta: { nombre: "Urgente", clase: "bad" },
  media: { nombre: "Media", clase: "warn" },
  baja: { nombre: "Baja", clase: "neutral" },
};

export const DESDE = ["Hoy", "Ayer", "Varios días", "Va y viene"] as const;

const BASE = ["No enciende", "Hace ruido raro", "Fuga de agua", "Funciona a medias", "Daño o pieza rota"];
const GRUPOS: { claves: RegExp; sintomas: string[] }[] = [
  { claves: /refri|congel|enfri|vitrina|camara|cámara|hielo|bebida|nevera|conserv/i,
    sintomas: ["No enfría", "Hace hielo o escarcha", "Gotea agua", "Hace ruido raro", "No enciende", "Puerta o empaque dañado"] },
  { claves: /cafe|café|espresso|molino|barista|capuch/i,
    sintomas: ["Fuga de agua", "Marca error", "Café insípido", "No enciende", "No sale agua"] },
  { claves: /horno|estufa|parrilla|plancha|freid|tostad|micro|gas/i,
    sintomas: ["No calienta", "No enciende", "Calienta disparejo", "Huele a gas", "Marca error", "Puerta dañada"] },
  { claves: /aire|clima|minisplit|extract|campana|ventil/i,
    sintomas: ["No enfría", "No enciende", "Gotea agua", "Hace ruido raro", "Huele mal", "No jala el humo"] },
  { claves: /luz|lamp|ilumin|electr|contacto|apag|anuncio/i,
    sintomas: ["No prende", "Parpadea", "Se bota la pastilla", "Contacto dañado", "Chispea o huele a quemado"] },
  { claves: /agua|bomba|tinaco|fregadero|lavab|baño|wc|drenaje|filtro|purific/i,
    sintomas: ["Sin agua", "Fuga de agua", "Tapado o no drena", "Mal olor", "Baja presión"] },
  { claves: /licuad|batidor|mezclad|procesad|exprimid/i,
    sintomas: ["No enciende", "Hace ruido raro", "Vaso o cuchilla dañados", "Se detiene sola", "Huele a quemado"] },
];

export function sintomasDe(equipo: string, categoria?: string | null) {
  // Primero por el nombre del equipo (más específico); la categoría solo si el nombre no dice nada.
  // Ej.: "Cafetera BUNN" con categoría "Bebidas" no debe caer en refrigeración.
  return (GRUPOS.find((g) => g.claves.test(equipo)) ?? GRUPOS.find((g) => g.claves.test(categoria ?? "")))?.sintomas ?? BASE;
}

/** Riesgo de seguridad: avisar a la tienda qué hacer mientras llega el técnico. */
export function avisoSeguridad(sintoma: string) {
  if (/gas/i.test(sintoma)) return "Cierra la llave del gas, no prendas ni apagues interruptores y ventila el área.";
  if (/chispea|quemado/i.test(sintoma)) return "Desconecta el equipo o baja su pastilla y no lo vuelvas a usar hasta que lo revise el técnico.";
  if (/fuga de agua/i.test(sintoma)) return "Si el agua está cerca de contactos o cables, desconecta el equipo.";
  return null;
}

const quitarAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Ordena las soluciones rápidas del equipo por parecido con el síntoma elegido. */
export function solucionesPara<T extends { pregunta: string; pasos: string[] }>(faqs: T[], sintoma: string) {
  const palabras = quitarAcentos(sintoma).split(/\W+/).filter((p) => p.length > 3);
  const puntos = (f: T) => {
    const t = quitarAcentos(`${f.pregunta} ${f.pasos.join(" ")}`);
    return palabras.reduce((n, p) => n + (t.includes(p.slice(0, 5)) ? 1 : 0), 0);
  };
  return faqs.map((f) => ({ f, p: puntos(f) })).sort((a, b) => b.p - a.p).slice(0, 3).map((x) => x.f);
}

/** Horas transcurridas y si ya venció la meta. */
export function tiempo(t: Pick<Ticket, "creado" | "resuelto_en" | "prioridad" | "estado">, ahora = Date.now()) {
  const fin = t.resuelto_en ? new Date(t.resuelto_en).getTime() : ahora;
  const horas = (fin - new Date(t.creado).getTime()) / 3_600_000;
  const meta = META_HORAS[t.prioridad];
  return { horas, meta, vencido: ABIERTOS.includes(t.estado) && horas > meta, proximo: ABIERTOS.includes(t.estado) && horas > meta * 0.75 };
}

export function duracion(horas: number) {
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 48) return `${Math.round(horas)} h`;
  return `${Math.round(horas / 24)} días`;
}

export function hace(fecha: string, ahora = Date.now()) {
  return duracion((ahora - new Date(fecha).getTime()) / 3_600_000);
}

/** Teléfono a formato wa.me (México, 10 dígitos → 52…). */
export function enlaceWhatsApp(tel: string | null, texto: string) {
  const d = (tel ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  const n = d.length === 10 ? `52${d}` : d;
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

/** Fotos de producto por tipo de equipo (archivos en /public/equipos). Sin foto se usa el ícono.
 *  Primero por slug del catálogo; si el tipo no está publicado (slug vacío), por el nombre del equipo.
 *  El orden importa: "cocción acelerada" antes que "horno". */
const FOTOS: Record<string, string> = {
  cafetera: "/equipos/cafetera.jpg",
  horno: "/equipos/horno.jpg",
  "horno-coccion-acelerada": "/equipos/horno-rapido.jpg",
  refresquero: "/equipos/refresquero.jpg",
  frigobar: "/equipos/frigobar.jpg",
  "maquina-hielos": "/equipos/hielos.jpg",
  licuadora: "/equipos/licuadora.jpg",
};
const FOTOS_NOMBRE: [RegExp, string][] = [
  [/bunn|crescendo/i, "/equipos/cafetera.jpg"],
  [/cocci[oó]n acelerada|speed|alta velocidad/i, "/equipos/horno-rapido.jpg"],
  [/horno/i, "/equipos/horno.jpg"],
  [/refresquero/i, "/equipos/refresquero.jpg"],
  [/frigobar/i, "/equipos/frigobar.jpg"],
  [/hielo/i, "/equipos/hielos.jpg"],
  [/licuadora/i, "/equipos/licuadora.jpg"],
];
export function fotoEquipo(slug: string | null | undefined, nombre?: string | null) {
  if (slug && FOTOS[slug]) return FOTOS[slug];
  return FOTOS_NOMBRE.find(([re]) => re.test(nombre ?? ""))?.[1] ?? null;
}

/** Síntomas que necesitan un dato extra (p. ej. el código de error que marca la pantalla). */
export const pideDetalle = (sintoma: string) => /marca error/i.test(sintoma);
