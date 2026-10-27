/** Utilidades de fechas y reglas del panel. Sin dependencias de servidor. */

const TZ = "America/Mexico_City";
export const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** Fecha de hoy en Ciudad de México, YYYY-MM-DD. */
export const hoy = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
export const mesActual = () => hoy().slice(0, 7);
export const mesValido = (m?: string | null) => (m && /^\d{4}-\d{2}$/.test(m) ? m : mesActual());

/** Suma meses a YYYY-MM. */
export function sumarMeses(mes: string, n: number) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Suma días a YYYY-MM-DD. */
export function sumarDias(fecha: string, n: number) {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** [primer día, primer día del mes siguiente] como YYYY-MM-DD (columnas tipo date). */
export const rangoFechas = (mes: string) => [`${mes}-01`, `${sumarMeses(mes, 1)}-01`] as const;

/** Mismo rango en ISO con hora de CDMX (columnas timestamptz). */
export function rangoISO(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return [new Date(Date.UTC(y, m - 1, 1, 6)).toISOString(), new Date(Date.UTC(y, m, 1, 6)).toISOString()] as const;
}

export const nombreMes = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return `${MESES_LARGOS[m - 1]} ${y}`;
};
export const mesCorto = (mes: string) => MESES[Number(mes.slice(5, 7)) - 1];

/** "12 oct 26" a partir de YYYY-MM-DD. */
export function fCorta(f: string | null | undefined) {
  if (!f) return "—";
  const [y, m, d] = f.slice(0, 10).split("-").map(Number);
  return `${d} ${MESES[m - 1]} ${String(y).slice(2)}`;
}

export const diasEntre = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export type Estado = { texto: string; clase: "ok" | "warn" | "bad" | "neutral" };

export function estadoPreventivo(p: { fecha: string; hecho: boolean }, ref = hoy()): Estado {
  if (p.hecho) return { texto: "Hecho", clase: "ok" };
  return p.fecha < ref ? { texto: "Vencido", clase: "bad" } : { texto: "Programado", clase: "neutral" };
}

export function estadoGarantia(garantia: string | null, ref = hoy()): Estado {
  if (!garantia) return { texto: "Sin garantía", clase: "neutral" };
  const d = diasEntre(ref, garantia);
  if (d < 0) return { texto: "Vencida", clase: "neutral" };
  if (d <= 60) return { texto: `Vence en ${d} días`, clase: "warn" };
  return { texto: "Vigente", clase: "ok" };
}

/** Recomendación por reparaciones acumuladas contra costo y por edad contra vida útil. */
export function recomendacion(a: { costo: number; fecha_compra: string | null; vida_anios: number }, acumulado: number, ref = hoy()): Estado {
  const r = a.costo > 0 ? acumulado / a.costo : 0;
  const e = a.fecha_compra ? diasEntre(a.fecha_compra, ref) / 365.25 / a.vida_anios : 0;
  if (r >= 0.5 || e >= 0.9) return { texto: "Evaluar reemplazo", clase: "bad" };
  if (r >= 0.3 || e >= 0.7) return { texto: "Vigilar", clase: "warn" };
  return { texto: "Reparar", clase: "ok" };
}

export const edadAnios = (fecha: string | null, ref = hoy()) => (fecha ? diasEntre(fecha, ref) / 365.25 : null);

export const CATEGORIAS_EXTRA = ["Eléctrico", "Plomería", "Obra civil", "Herrería", "Otros"];
