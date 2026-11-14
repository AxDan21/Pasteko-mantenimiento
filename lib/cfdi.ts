/**
 * Lectura de facturas electrónicas (CFDI 3.3 y 4.0) en el navegador.
 * No sube nada: recibe el texto del XML y devuelve los datos que interesan para registrar un gasto.
 */
export type Cfdi = {
  version: string;
  tipo: string;            // I ingreso · E egreso (nota de crédito) · P pago · T traslado · N nómina
  fecha: string;           // AAAA-MM-DD
  serie: string;
  folio: string;
  uuid: string;
  emisor: string;
  rfc: string;
  receptor: string;
  subtotal: number;
  descuento: number;
  iva: number;
  retenciones: number;
  total: number;
  moneda: string;
  metodoPago: string;      // PUE una exhibición · PPD parcialidades o diferido
  formaPago: string;
  conceptos: { descripcion: string; cantidad: number; importe: number }[];
};

const num = (v: string | null | undefined) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
const uno = (doc: Document | Element, tag: string) => doc.getElementsByTagNameNS("*", tag)[0] ?? null;
const attr = (el: Element | null, nombre: string) => el?.getAttribute(nombre) ?? el?.getAttribute(nombre.toLowerCase()) ?? "";

export function leerCfdi(xml: string): Cfdi {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("El archivo no es un XML válido.");
  const comp = uno(doc, "Comprobante");
  if (!comp) throw new Error("El XML no es una factura electrónica (CFDI).");
  const emisor = uno(comp, "Emisor");
  const receptor = uno(comp, "Receptor");
  const timbre = uno(doc, "TimbreFiscalDigital");

  // Impuestos del comprobante (no los de cada concepto)
  let iva = 0, retenciones = 0;
  const imp = Array.from(comp.children).find((c) => c.localName === "Impuestos") ?? null;
  if (imp) {
    retenciones = num(attr(imp, "TotalImpuestosRetenidos"));
    const traslados = Array.from(imp.getElementsByTagNameNS("*", "Traslado"));
    iva = traslados.filter((t) => attr(t, "Impuesto") === "002").reduce((s, t) => s + num(attr(t, "Importe")), 0);
    if (!iva) iva = num(attr(imp, "TotalImpuestosTrasladados"));
  }

  const conceptos = Array.from(comp.getElementsByTagNameNS("*", "Concepto")).map((c) => ({
    descripcion: attr(c, "Descripcion").replace(/\s+/g, " ").trim(),
    cantidad: num(attr(c, "Cantidad")),
    importe: num(attr(c, "Importe")),
  }));

  return {
    version: attr(comp, "Version"),
    tipo: attr(comp, "TipoDeComprobante"),
    fecha: attr(comp, "Fecha").slice(0, 10),
    serie: attr(comp, "Serie"),
    folio: attr(comp, "Folio"),
    uuid: attr(timbre, "UUID").toUpperCase(),
    emisor: attr(emisor, "Nombre").trim(),
    rfc: attr(emisor, "Rfc").toUpperCase(),
    receptor: attr(receptor, "Nombre").trim(),
    subtotal: num(attr(comp, "SubTotal")),
    descuento: num(attr(comp, "Descuento")),
    iva,
    retenciones,
    total: num(attr(comp, "Total")),
    moneda: attr(comp, "Moneda") || "MXN",
    metodoPago: attr(comp, "MetodoPago"),
    formaPago: attr(comp, "FormaPago"),
    conceptos,
  };
}

/** Texto para el campo "Concepto": la descripción principal y el folio de la factura. */
export function conceptoDe(c: Cfdi, max = 180) {
  const principal = [...c.conceptos].sort((a, b) => b.importe - a.importe)[0]?.descripcion ?? "Factura";
  const resto = c.conceptos.length > 1 ? ` y ${c.conceptos.length - 1} concepto${c.conceptos.length > 2 ? "s" : ""} más` : "";
  const folio = `${c.serie}${c.folio}`.trim();
  const sufijo = folio ? ` · Fact. ${folio}` : "";
  const base = principal.length + resto.length + sufijo.length > max ? principal.slice(0, Math.max(20, max - resto.length - sufijo.length - 1)) + "…" : principal;
  return `${base}${resto}${sufijo}`;
}

const LIMPIAR = /\b(s\.?\s?a\.?|s\.?\s?a\.?\s?p\.?\s?i\.?|de|c\.?\s?v\.?|s\.?\s?de\s?r\.?\s?l\.?|s\.?\s?c\.?|del|la|el|y)\b/g;
const normal = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.,]/g, " ").replace(LIMPIAR, " ").replace(/\s+/g, " ").trim();

/** Busca el proveedor del catálogo que más se parece al emisor de la factura. */
export function buscarProveedor<T extends { id: number; nombre: string }>(c: Cfdi, proveedores: T[]): T | null {
  const e = normal(c.emisor);
  if (!e) return null;
  const pe = new Set(e.split(" ").filter((w) => w.length > 2));
  let mejor: T | null = null, puntos = 0;
  for (const p of proveedores) {
    const n = normal(p.nombre);
    if (!n) continue;
    if (n === e || e.includes(n) || n.includes(e)) return p;
    const pn = n.split(" ").filter((w) => w.length > 2);
    const comunes = pn.filter((w) => pe.has(w)).length;
    const s = pn.length ? comunes / Math.max(pn.length, pe.size) : 0;
    if (s > puntos) { puntos = s; mejor = p; }
  }
  return puntos >= 0.5 ? mejor : null;
}

export const TIPOS_CFDI: Record<string, string> = { I: "Ingreso", E: "Egreso (nota de crédito)", P: "Complemento de pago", T: "Traslado", N: "Nómina" };
