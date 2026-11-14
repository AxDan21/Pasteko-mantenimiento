/**
 * Sugiere la categoría de un concepto de factura combinando tres fuentes:
 *  1. Reglas por palabra clave (horno, compresor, letrero…).
 *  2. Tu catálogo de equipos (si la descripción menciona un equipo, toma su categoría).
 *  3. Tus gastos anteriores (aprende de cómo clasificaste conceptos parecidos).
 * Corre en el navegador; no consulta nada externo.
 */
export type Contexto = {
  categorias: string[];
  equipos: { nombre: string; categoria: string }[];
  historial: { concepto: string; categoria: string }[];
};
export type Sugerencia = { categoria: string | null; razon: string; confianza: "alta" | "media" | "baja" };

const VACIAS = new Set([
  "para", "con", "por", "del", "las", "los", "una", "uno", "unos", "unas", "que", "sin", "como", "este", "esta", "sus", "fact", "uuid",
  "servicio", "servicios", "mantenimiento", "trabajo", "trabajos", "suministro", "instalacion", "cambio", "pieza", "piezas", "material",
  "materiales", "mano", "obra", "unidad", "general", "sucursal", "tienda", "pasteko", "equipo", "equipos", "revision", "reparacion",
]);
export const normal = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
const raiz = (w: string) => (w.length > 5 ? w.replace(/(es|s)$/, "") : w);
const tokens = (s: string) => normal(s).split(" ").filter((w) => w.length > 2 && !VACIAS.has(w) && !/^\d+$/.test(w)).map(raiz);

/** Reglas: expresión → palabras que debe contener el nombre de la categoría. */
const REGLAS: [RegExp, string[]][] = [
  [/\b(horno|hornos|charola|charolas|resistencia|termostato|quemador|piloto|termopar)\b/, ["horno"]],
  [/\b(refriger\w*|congelador\w*|compresor\w*|camara fria|mesa fria|enfriador\w*|vitrina\w*|evaporador\w*|condensador\w*|gas r\d+|r134|r404|r290|termometro)\b/, ["refriger", "congel"]],
  [/\b(cafetera\w*|espresso|cafe|molino)\b/, ["cafet"]],
  [/\b(espiguero\w*|espiga\w*)\b/, ["espiguero"]],
  [/\b(hielo|hielos|fabricadora)\b/, ["hielo"]],
  [/\b(licuadora\w*|vaso licuador)\b/, ["licuadora"]],
  [/\b(letra|letras|letrero\w*|anuncio\w*|luminos\w*|fuente de poder|electric\w*|contacto\w*|apagador\w*|centro de carga|pastilla|breaker|cableado|iluminacion|lampara\w*|luminaria\w*|led|plomer\w*|tuberia\w*|fuga|drenaje|tinaco|bomba de agua|pintura|impermeab\w*|puerta\w*|chapa\w*|cerradura\w*|cortina\w*|aire acondicionado|minisplit|clima|extractor\w*|campana\w*|piso|azulejo|tablaroca|herreria|vidrio\w*|cristal\w*)\b/, ["instalac"]],
];

export function clasificar(descripcion: string, ctx: Contexto): Sugerencia {
  const d = normal(descripcion);
  const cats = ctx.categorias.map((c) => ({ c, n: normal(c) }));
  const puntos = new Map<string, { p: number; razon: string }>();
  const sumar = (cat: string, p: number, razon: string) => {
    const e = puntos.get(cat);
    if (!e) puntos.set(cat, { p, razon });
    else { e.p += p; if (p > 0 && e.razon.length < 4) e.razon = razon; }
  };

  // 1. Menciona la categoría por su nombre
  for (const { c, n } of cats) {
    const base = raiz(n.split(" ")[0] ?? "");
    if (base.length > 3 && d.includes(base)) sumar(c, 5, `menciona "${c}"`);
  }
  // 2. Menciona un equipo del catálogo
  for (const e of ctx.equipos) {
    const n = normal(e.nombre);
    const tk = tokens(e.nombre);
    if (!ctx.categorias.includes(e.categoria) || !tk.length) continue;
    if (d.includes(n) || tk.every((t) => d.includes(t))) sumar(e.categoria, 4, `equipo "${e.nombre}"`);
    else {
      // basta una palabra distintiva del equipo (marca o modelo: "Crescendo", "Rational"…)
      const propia = tk.find((t) => t.length >= 5 && !normal(e.categoria).includes(t) && new RegExp(`\\b${t}`).test(d));
      if (propia) sumar(e.categoria, 3, `equipo "${e.nombre}"`);
    }
  }
  // 3. Reglas por palabra clave
  for (const [re, claves] of REGLAS) {
    const m = d.match(re);
    if (!m) continue;
    const hit = cats.find(({ n }) => claves.some((k) => n.includes(k)));
    if (hit) sumar(hit.c, 3, `palabra "${m[0]}"`);
  }
  // 4. Gastos anteriores parecidos (similitud de palabras)
  const mios = new Set(tokens(descripcion));
  if (mios.size) {
    const votos = new Map<string, { s: number; ej: string }>();
    for (const g of ctx.historial) {
      if (!ctx.categorias.includes(g.categoria)) continue;
      const otros = new Set(tokens(g.concepto.split(" · ")[0]));
      if (!otros.size) continue;
      let comunes = 0;
      mios.forEach((t) => { if (otros.has(t)) comunes++; });
      const sim = comunes / Math.min(mios.size, otros.size);
      if (comunes >= 1 && sim >= 0.5) {
        const v = votos.get(g.categoria) ?? { s: 0, ej: g.concepto.split(" · ")[0] };
        v.s += sim;
        votos.set(g.categoria, v);
      }
    }
    for (const [c, v] of votos) sumar(c, Math.min(4, 1.5 * v.s), `como "${v.ej.slice(0, 40)}${v.ej.length > 40 ? "…" : ""}"`);
  }

  const orden = [...puntos.entries()].sort((a, b) => b[1].p - a[1].p);
  if (!orden.length) return { categoria: null, razon: "No la reconocí: elígela tú", confianza: "baja" };
  const [cat, { p, razon }] = orden[0];
  const segundo = orden[1]?.[1].p ?? 0;
  const confianza = (p >= 4 && p - segundo >= 2) || (p >= 3 && segundo === 0) ? "alta" : p >= 2 ? "media" : "baja";
  return { categoria: cat, razon, confianza };
}

export const sugerirTipo = (descripcion: string) =>
  /preventiv/i.test(descripcion) ? "Preventivo" : /correctiv|cambio|reparaci|sustituc|reemplaz|falla|compostur/i.test(descripcion) ? "Correctivo" : "Correctivo";
