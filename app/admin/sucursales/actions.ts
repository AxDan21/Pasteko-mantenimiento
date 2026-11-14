"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { coordenadasDe, enMexico, esEnlaceCorto, lugarDe, type Punto } from "@/lib/geo";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const volver = (q: string): never => redirect(`/admin/sucursales?${q}`);

/** Sigue las redirecciones de un enlace corto de Maps (maps.app.goo.gl) hasta el enlace largo. */
async function expandir(url: string) {
  let actual = url;
  for (let i = 0; i < 6; i++) {
    const r = await fetch(actual, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0 (Macintosh) PastekoMantenimiento" }, cache: "no-store" });
    const sig = r.headers.get("location");
    if (r.status >= 300 && r.status < 400 && sig) { actual = new URL(sig, actual).toString(); continue; }
    // Sin más redirecciones: a veces las coordenadas solo vienen dentro de la página
    if (!coordenadasDe(actual) && r.ok) {
      const html = (await r.text()).slice(0, 400_000);
      const m = html.match(/center=(-?\d{1,2}\.\d+)(?:%2C|,)(-?\d{1,3}\.\d+)/) ?? html.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/);
      if (m) return `${m[1]},${m[2]}`;
    }
    break;
  }
  return actual;
}

/** Interpreta lo que pegó el usuario: enlace de Maps (corto o largo) o coordenadas. */
async function interpretar(texto: string): Promise<{ punto: Punto | null; lugar: string | null; error?: string }> {
  if (!texto) return { punto: null, lugar: null, error: "Pega un enlace de Google Maps o unas coordenadas." };
  let t = texto;
  if (esEnlaceCorto(t)) {
    try { t = await expandir(t); } catch { return { punto: null, lugar: null, error: "No pude abrir ese enlace corto. Copia las coordenadas desde Maps (clic derecho sobre el pin)." }; }
  }
  const punto = coordenadasDe(t);
  if (!punto) return { punto: null, lugar: null, error: "No encontré coordenadas en ese texto. En Google Maps: clic derecho sobre la tienda → copia las coordenadas que aparecen arriba." };
  return { punto, lugar: lugarDe(t) };
}

/** Busca una ciudad o colonia en OpenStreetMap (para la base de los técnicos). */
async function geocodificar(lugar: string): Promise<Punto | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=mx&q=${encodeURIComponent(lugar)}`;
    const r = await fetch(url, { headers: { "User-Agent": "PastekoMantenimiento/1.0 (mantenimiento interno)", "Accept-Language": "es" }, cache: "no-store" });
    if (!r.ok) return null;
    const d = (await r.json()) as { lat: string; lon: string }[];
    return d[0] ? { lat: Math.round(Number(d[0].lat) * 1e6) / 1e6, lng: Math.round(Number(d[0].lon) * 1e6) / 1e6 } : null;
  } catch {
    return null;
  }
}

export async function guardarUbicacion(f: FormData) {
  const { userId } = await requireAdmin();
  const id = Number(f.get("id"));
  const { punto, lugar, error } = await interpretar(txt(f, "ubicacion"));
  if (!punto) volver(`error=${encodeURIComponent(error ?? "Ubicación no válida")}&s=${id}#s${id}`);
  const supabase = await createClient();
  const direccion = txt(f, "direccion") || lugar;
  const { error: e } = await supabase.from("sucursales").update({
    lat: punto!.lat, lng: punto!.lng, ubicacion_fuente: /maps|goo\.gl/i.test(txt(f, "ubicacion")) ? "maps" : "manual",
    ubicacion_precision: null, ubicacion_fecha: new Date().toISOString(), ubicacion_por: userId,
    ...(direccion ? { direccion } : {}),
  }).eq("id", id);
  if (e) volver(`error=${encodeURIComponent(e.message)}#s${id}`);
  revalidatePath("/admin", "layout");
  volver(`ok=${enMexico(punto!) ? "suc" : "suc-fuera"}&s=${id}#s${id}`);
}

export async function quitarUbicacion(f: FormData) {
  await requireAdmin();
  const id = Number(f.get("id"));
  const supabase = await createClient();
  await supabase.from("sucursales").update({ lat: null, lng: null, ubicacion_fuente: null, ubicacion_precision: null, ubicacion_fecha: null, ubicacion_por: null }).eq("id", id);
  revalidatePath("/admin", "layout");
  volver(`ok=quitada#s${id}`);
}

/** Base del técnico: ciudad o colonia (se ubica sola) o un enlace/coordenadas si se quiere más precisión. */
export async function guardarBase(f: FormData) {
  await requireAdmin();
  const id = txt(f, "id");
  const nombre = txt(f, "base_nombre");
  const extra = txt(f, "ubicacion");
  if (!nombre && !extra) volver(`error=${encodeURIComponent("Escribe la ciudad o colonia base del técnico.")}#t-${id}`);
  let punto: Punto | null = null;
  if (extra) {
    const r = await interpretar(extra);
    if (!r.punto) volver(`error=${encodeURIComponent(r.error ?? "Ubicación no válida")}#t-${id}`);
    punto = r.punto;
  } else {
    punto = await geocodificar(nombre);
    if (!punto) volver(`error=${encodeURIComponent(`No encontré "${nombre}" en el mapa. Agrega el estado (ej. "Tula, Hidalgo") o pega un enlace de Maps.`)}#t-${id}`);
  }
  const supabase = await createClient();
  const { error } = await supabase.from("perfiles").update({ base_nombre: nombre || null, base_lat: punto!.lat, base_lng: punto!.lng }).eq("id", id);
  if (error) volver(`error=${encodeURIComponent(error.message)}#t-${id}`);
  revalidatePath("/admin", "layout");
  volver(`ok=base#t-${id}`);
}
