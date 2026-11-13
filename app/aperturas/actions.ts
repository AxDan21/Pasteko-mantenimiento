"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { aplica, calcular, PLANTILLA, type EstadoPaso } from "@/lib/gantt";
import { AP_COLS, capturasDe, configDe, IT_COLS, type ApRow, type ItemRow } from "@/lib/aperturas";
import { hoy } from "@/lib/panel";

type DB = Awaited<ReturnType<typeof createClient>>;
const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(f.get(k) ?? 0) || 0;
const fecha = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const entero = (v: string, min: number, max: number, def: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && v !== "" ? Math.min(max, Math.max(min, n)) : def;
};
const ESTADOS: EstadoPaso[] = ["pendiente", "en_proceso", "bloqueado", "hecho"];

async function db() {
  await requireAdmin();
  return createClient();
}

/** Vuelve a la página desde la que se envió el formulario (solo rutas de aperturas). */
function volver(f: FormData, def: string): never {
  const v = txt(f, "volver");
  redirect(v.startsWith("/aperturas") ? v : def);
}

const refrescar = () => revalidatePath("/aperturas", "layout");

/**
 * Sincroniza los pasos guardados con la plantilla y recalcula las fechas:
 * crea los pasos que apliquen, quita los que ya no (p. ej. si cambió a Propia),
 * guarda inicio/fin planeados y la fecha de apertura suave en la apertura.
 * `rebase` = toma el plan actual como línea base (fecha_base y meta).
 */
async function recalcular(supabase: DB, id: number, rebase = false) {
  const { data: ap } = await supabase.from("aperturas").select(AP_COLS).eq("id", id).single<ApRow>();
  if (!ap || ap.modelo !== "v2" || !ap.fecha_pago) return;
  const { data: its } = await supabase.from("apertura_items").select(IT_COLS).eq("apertura_id", id);
  const items = (its ?? []) as ItemRow[];
  const cfg = configDe(ap);
  const plan = calcular(cfg, capturasDe(items));
  const porClave = new Map(items.filter((i) => i.clave).map((i) => [i.clave!, i]));

  const nuevos: Record<string, unknown>[] = [];
  for (const [orden, p] of PLANTILLA.entries()) {
    const c = plan[p.clave];
    const it = porClave.get(p.clave);
    if (!aplica(p, cfg)) {
      if (it) await supabase.from("apertura_items").delete().eq("id", it.id);
      continue;
    }
    if (!c) continue;
    if (!it) {
      nuevos.push({
        apertura_id: id, clave: p.clave, grupo: "Gantt", texto: p.actividad, responsable: p.responsable, hito: p.hito ?? null,
        orden, inicio: c.inicio, fecha: c.fin, fecha_base: c.fin, estado: "pendiente", hecho: false,
      });
    } else if (it.fecha !== c.fin || it.inicio !== c.inicio || it.orden !== orden || rebase) {
      await supabase.from("apertura_items")
        .update({ inicio: c.inicio, fecha: c.fin, orden, ...(rebase ? { fecha_base: c.fin } : {}) })
        .eq("id", it.id);
    }
  }
  if (nuevos.length) await supabase.from("apertura_items").insert(nuevos);
  await supabase.from("aperturas")
    .update({ fecha: plan.apertura.fin, ...(rebase || !ap.apertura_meta ? { apertura_meta: plan.apertura.fin } : {}) })
    .eq("id", id);
}

// ---------- Aperturas ----------
export async function crearApertura(f: FormData) {
  const supabase = await db();
  const pago = fecha(txt(f, "fecha_pago"));
  const nombre = txt(f, "nombre");
  if (!nombre || !pago) redirect("/aperturas/nueva?error=Falta el nombre o la fecha de pago de equipos");
  const { data, error } = await supabase
    .from("aperturas")
    .insert({
      nombre, fecha: pago, modelo: "v2", fecha_pago: pago, tipo: txt(f, "tipo") === "Propia" ? "Propia" : "Franquicia",
      dias_obra: entero(txt(f, "dias_obra"), 1, 365, 31), dias_proveedor: entero(txt(f, "dias_proveedor"), 1, 180, 30),
      lleva_bebidas: f.get("lleva_bebidas") === "on", notas: txt(f, "notas") || null,
    })
    .select("id")
    .single();
  if (error || !data) redirect(`/aperturas/nueva?error=${encodeURIComponent(error?.message ?? "No se pudo crear")}`);
  await recalcular(supabase, data.id, true);
  refrescar();
  redirect(`/aperturas/${data.id}`);
}

/** Cambia la configuración (nombre, tipo, pago, días de obra/proveedor, bebidas, notas, meta, cerrada). */
export async function actualizarApertura(f: FormData) {
  const supabase = await db();
  const id = num(f, "id");
  const cambios: Record<string, unknown> = {};
  if (f.has("nombre") && txt(f, "nombre")) cambios.nombre = txt(f, "nombre");
  if (f.has("tipo")) cambios.tipo = txt(f, "tipo") === "Propia" ? "Propia" : "Franquicia";
  if (f.has("fecha_pago") && fecha(txt(f, "fecha_pago"))) cambios.fecha_pago = txt(f, "fecha_pago");
  if (f.has("dias_obra")) cambios.dias_obra = entero(txt(f, "dias_obra"), 1, 365, 31);
  if (f.has("dias_proveedor")) cambios.dias_proveedor = entero(txt(f, "dias_proveedor"), 1, 180, 30);
  if (f.has("config")) cambios.lleva_bebidas = f.get("lleva_bebidas") === "on";
  if (f.has("notas")) cambios.notas = txt(f, "notas") || null;
  if (f.has("apertura_meta")) cambios.apertura_meta = fecha(txt(f, "apertura_meta"));
  if (f.has("cerrada")) cambios.cerrada = txt(f, "cerrada") === "true";
  if (Object.keys(cambios).length) await supabase.from("aperturas").update(cambios).eq("id", id);
  await recalcular(supabase, id, txt(f, "rebase") === "1");
  refrescar();
  volver(f, `/aperturas/${id}`);
}

/** Actualiza un paso: estado, fecha real, motivo de bloqueo, fecha fija (caso especial) y duración. */
export async function actualizarPaso(f: FormData) {
  const supabase = await db();
  const id = num(f, "id"), apertura = num(f, "apertura_id");
  const cambios: Record<string, unknown> = {};
  if (f.has("estado")) {
    const e = txt(f, "estado") as EstadoPaso;
    if (ESTADOS.includes(e)) {
      cambios.estado = e;
      cambios.hecho = e === "hecho";
      cambios.fecha_real = e === "hecho" ? fecha(txt(f, "fecha_real")) ?? hoy() : null;
      if (e !== "bloqueado") cambios.motivo = null;
    }
  }
  if (f.has("motivo") && cambios.estado === "bloqueado") cambios.motivo = txt(f, "motivo") || "Sin motivo capturado";
  if (f.has("fecha_fija")) cambios.fecha_fija = fecha(txt(f, "fecha_fija"));
  if (f.has("duracion")) cambios.duracion = txt(f, "duracion") === "" ? null : entero(txt(f, "duracion"), 0, 365, 0);
  if (f.has("responsable") && txt(f, "responsable")) cambios.responsable = txt(f, "responsable");
  if (f.has("fecha") && fecha(txt(f, "fecha"))) cambios.fecha = txt(f, "fecha"); // solo pasos extra
  if (Object.keys(cambios).length) await supabase.from("apertura_items").update(cambios).eq("id", id).eq("apertura_id", apertura);
  await recalcular(supabase, apertura);
  refrescar();
  volver(f, `/aperturas/${apertura}`);
}

/** Paso extra fuera de la plantilla (sin dependencias, con fecha manual). */
export async function agregarPasoExtra(f: FormData) {
  const supabase = await db();
  const apertura = num(f, "apertura_id"), texto = txt(f, "texto"), dia = fecha(txt(f, "fecha"));
  if (texto && dia) {
    await supabase.from("apertura_items").insert({
      apertura_id: apertura, grupo: "Extra", texto, responsable: txt(f, "responsable") || "Mantenimiento",
      fecha: dia, inicio: dia, fecha_base: dia, orden: 900, estado: "pendiente", hecho: false,
    });
  }
  refrescar();
  volver(f, `/aperturas/${apertura}`);
}

export async function borrarPasoExtra(f: FormData) {
  const supabase = await db();
  const apertura = num(f, "apertura_id");
  await supabase.from("apertura_items").delete().eq("id", num(f, "id")).eq("apertura_id", apertura).is("clave", null);
  refrescar();
  volver(f, `/aperturas/${apertura}`);
}

export async function borrarApertura(f: FormData) {
  const supabase = await db();
  await supabase.from("aperturas").delete().eq("id", num(f, "id"));
  refrescar();
  redirect("/aperturas");
}

/** Lleva una apertura del formato anterior al Gantt con dependencias, conservando lo que ya estaba hecho. */
const PALABRAS: Record<string, RegExp> = {
  pago: /pago/i, kickoff: /kick ?off/i, obra: /habilitaci[oó]n|obra/i, alta_digital: /medios digitales/i, rrss: /rrss|redes/i,
  cap_virtual: /virtual/i, entrega_corp: /corporativo/i, barradas: /barradas/i, instalacion: /instalaci[oó]n/i,
  pos: /punto de venta|c[aá]maras/i, brandeo: /brandeo/i, validacion: /validaci[oó]n/i, llave: /llave/i,
  cap_core: /core/i, cap_bebidas: /bebidas/i, primer_pedido: /primer pedido/i, apertura: /apertura suave/i,
  inauguracion: /inauguraci[oó]n/i, fin_capacitacion: /final de capacitaci[oó]n/i,
};
export async function convertirApertura(f: FormData) {
  const supabase = await db();
  const id = num(f, "id"), pago = fecha(txt(f, "fecha_pago"));
  if (!pago) redirect("/aperturas?error=Indica la fecha de pago de equipos para convertir");
  const { data: viejos } = await supabase.from("apertura_items").select("id, texto, hecho, fecha").eq("apertura_id", id);
  await supabase.from("aperturas").update({ modelo: "v2", fecha_pago: pago, apertura_meta: null, lleva_bebidas: f.get("lleva_bebidas") === "on" }).eq("id", id);
  // Asigna clave a los pasos viejos que coinciden con la plantilla; los que no, se borran.
  const usados = new Set<string>();
  for (const v of viejos ?? []) {
    const clave = Object.keys(PALABRAS).find((k) => !usados.has(k) && PALABRAS[k].test(v.texto));
    if (!clave) { await supabase.from("apertura_items").delete().eq("id", v.id); continue; }
    usados.add(clave);
    await supabase.from("apertura_items").update({
      clave, estado: v.hecho ? "hecho" : "pendiente", fecha_real: v.hecho ? v.fecha : null,
      texto: PLANTILLA.find((p) => p.clave === clave)!.actividad,
    }).eq("id", v.id);
  }
  await recalcular(supabase, id, true);
  refrescar();
  redirect(`/aperturas/${id}`);
}
