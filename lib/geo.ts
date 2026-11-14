/**
 * Utilidades de ubicación: leer coordenadas de enlaces de Google Maps, distancias y enlaces.
 * Funciones puras (sirven en servidor y navegador).
 */
export type Punto = { lat: number; lng: number };

const valido = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/** México continental aproximado (para avisar si una coordenada parece mal capturada). */
export const enMexico = (p: Punto) => p.lat >= 14 && p.lat <= 33 && p.lng >= -118.5 && p.lng <= -86;

/**
 * Saca coordenadas de un texto: enlace de Google Maps (largo), "19.43, -99.13" o "19.43 -99.13".
 * Prefiere el pin del lugar (!3d…!4d…) sobre el centro del mapa (@lat,lng).
 */
export function coordenadasDe(texto: string): Punto | null {
  if (!texto) return null;
  let t = texto.trim();
  try { t = decodeURIComponent(t); } catch { /* texto sin codificar */ }
  const patrones = [
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,                                  // pin del lugar
    /[?&](?:q|query|ll|destination|daddr|center|sll)=(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/, // parámetros
    /\/(?:search|dir|place)\/[^@]*?(-?\d{1,2}\.\d{3,})\s*,\s*\+?(-?\d{1,3}\.\d{3,})/, // /search/19.4,-99.1
    /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,                                         // centro del mapa
    /^\s*(-?\d{1,2}\.\d+)\s*[,\s]\s*(-?\d{1,3}\.\d+)\s*$/,                       // "19.43, -99.13"
  ];
  for (const re of patrones) {
    const m = t.match(re);
    if (m) {
      const lat = Number(m[1]), lng = Number(m[2]);
      if (valido(lat, lng)) return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
    }
  }
  return null;
}

/** Nombre del lugar en un enlace largo de Maps (/place/Pasteko+Centro/…). */
export function lugarDe(texto: string): string | null {
  const m = texto.match(/\/place\/([^/@?]+)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1].replace(/\+/g, " ")).trim() || null; } catch { return null; }
}

export const esEnlaceCorto = (t: string) => /^https?:\/\/(maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs)\//i.test(t.trim());

/** Distancia en línea recta (km) entre dos puntos. */
export function distanciaKm(a: Punto, b: Punto) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Kilómetros aproximados por carretera (la línea recta × 1.3 es una buena estimación en México). */
export const kmCarretera = (a: Punto, b: Punto) => Math.round(distanciaKm(a, b) * 1.3);

export const enlaceMaps = (p: Punto) => `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
export const enlaceComoLlegar = (p: Punto) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`;
