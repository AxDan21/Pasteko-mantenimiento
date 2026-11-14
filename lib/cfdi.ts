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
  conceptos: Concepto[];
};
/** Un renglón de la factura. `total` = importe − descuento + IVA y otros traslados − retenciones. */
export type Concepto = {
  descripcion: string; cantidad: number; unidad: string; valorUnitario: number;
  importe: number; descuento: number; iva: number; retenciones: number; total: number;
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

  const conceptos: Concepto[] = Array.from(comp.getElementsByTagNameNS("*", "Concepto"))
    .filter((c) => c.parentElement?.localName === "Conceptos")
    .map((c) => {
      const traslados = Array.from(c.getElementsByTagNameNS("*", "Traslado"));
      const rets = Array.from(c.getElementsByTagNameNS("*", "Retencion"));
      const importe = num(attr(c, "Importe")), descuento = num(attr(c, "Descuento"));
      const ivaC = traslados.filter((t) => attr(t, "Impuesto") === "002").reduce((s, t) => s + num(attr(t, "Importe")), 0);
      const otros = traslados.filter((t) => attr(t, "Impuesto") !== "002").reduce((s, t) => s + num(attr(t, "Importe")), 0);
      const retenciones = rets.reduce((s, t) => s + num(attr(t, "Importe")), 0);
      return {
        descripcion: mayus(attr(c, "Descripcion").replace(/\s+/g, " ").trim()),
        cantidad: num(attr(c, "Cantidad")), unidad: attr(c, "Unidad") || attr(c, "ClaveUnidad"),
        valorUnitario: num(attr(c, "ValorUnitario")), importe, descuento, iva: ivaC, retenciones,
        total: importe - descuento + ivaC + otros - retenciones,
      };
    });
  // Cada concepto a centavos; el último absorbe el redondeo para que la suma sea exactamente el total
  const totalFactura = num(attr(comp, "Total"));
  let acumulado = 0;
  conceptos.forEach((k, i) => {
    k.total = i < conceptos.length - 1 ? Math.round(k.total * 100) / 100 : Math.round((totalFactura - acumulado) * 100) / 100;
    acumulado += k.total;
  });

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

const mayus = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const pesos = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Referencia corta de la factura: serie y folio, o el inicio del folio fiscal si no trae folio. */
export const refFactura = (c: Cfdi) => {
  const folio = `${c.serie}${c.folio}`.trim();
  return folio ? `Fact. ${folio}` : c.uuid ? `UUID ${c.uuid.slice(0, 8)}` : "";
};

/** Texto para el campo "Concepto" con TODOS los conceptos y su costo con IVA. */
export function conceptoDe(c: Cfdi) {
  const ref = refFactura(c);
  if (!c.conceptos.length) return ref || "Factura";
  const partes = c.conceptos.length === 1
    ? [c.conceptos[0].descripcion]
    : c.conceptos.map((k) => `${k.cantidad !== 1 ? `${k.cantidad} × ` : ""}${k.descripcion} (${pesos(k.total)})`);
  return `${partes.join(" + ")}${ref ? ` · ${ref}` : ""}`;
}

/** Concepto de una sola partida, cuando la factura se divide en varios gastos. */
export const conceptoPartida = (c: Cfdi, k: Concepto) => {
  const ref = refFactura(c);
  return `${k.cantidad !== 1 ? `${k.cantidad} × ` : ""}${k.descripcion}${ref ? ` · ${ref}` : ""}`;
};

const PALABRAS: [RegExp, string[]][] = [
  [/horno|charola|resistencia|termostato/, ["horno"]],
  [/refriger|congelad|compresor|camara fria|enfriador|vitrina|gas refrigerante|evaporador|condensador/, ["refriger", "congel"]],
  [/cafeter|espresso|molino de cafe/, ["cafet"]],
  [/espiguero/, ["espiguero"]],
  [/hielo/, ["hielo"]],
  [/licuadora/, ["licuadora"]],
  [/letra|letrero|anuncio|luminos|fuente de poder|electric|contacto|apagador|iluminacion|lampara|luminaria|plomer|tuberia|fuga|pintura|impermeab|puerta|chapa|cortina|aire acondicionado|minisplit|extractor|campana/, ["instalaciones"]],
];
/** Sugiere la categoría de un concepto por palabras clave (si existe en tu lista). */
export function sugerirCategoria(descripcion: string, categorias: string[]): string | null {
  const d = normal(descripcion);
  const cats = categorias.map((c) => ({ c, n: normal(c) }));
  const directa = cats.find(({ n }) => n.length > 3 && d.includes(n.replace(/s$/, "")));
  if (directa) return directa.c;
  for (const [re, claves] of PALABRAS) {
    if (!re.test(d)) continue;
    const hit = cats.find(({ n }) => claves.some((k) => n.includes(k)));
    if (hit) return hit.c;
  }
  return null;
}
export const sugerirTipo = (descripcion: string) =>
  /preventiv/i.test(descripcion) ? "Preventivo" : /correctiv|cambio|reparaci|sustituc|reemplaz/i.test(descripcion) ? "Correctivo" : null;

const LIMPIAR = /\b(s\.?\s?a\.?|s\.?\s?a\.?\s?p\.?\s?i\.?|de|c\.?\s?v\.?|s\.?\s?de\s?r\.?\s?l\.?|s\.?\s?c\.?|del|la|el|y)\b/g;
const normal = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.,]/g, " ").replace(LIMPIAR, " ").replace(/\s+/g, " ").trim();

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
