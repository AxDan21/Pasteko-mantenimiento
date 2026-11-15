"use server";
import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { adminClient } from "@/lib/supabase/admin";
import { avisar } from "@/lib/push";
import { ABIERTOS, DESDE, VENDER, folioTicket, type Vender } from "@/lib/tickets";

type Res = { ok: true; token: string; nuevo: boolean } | { ok: false; error: string };

const limpio = (v: FormDataEntryValue | null, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/** La tienda reporta una falla desde el QR del equipo. No requiere sesión. */
export async function crearTicket(fd: FormData): Promise<Res> {
  if (limpio(fd.get("sitio_web"), 50)) return { ok: false, error: "No se pudo enviar." }; // trampa para bots
  const activoId = limpio(fd.get("activo"), 40).toUpperCase();
  const sintoma = limpio(fd.get("sintoma"), 80);
  const desde = limpio(fd.get("desde"), 20);
  const detalle = String(fd.get("detalle") ?? "").trim().slice(0, 1200);
  const vender = limpio(fd.get("vender"), 10) as Vender;
  const nombre = limpio(fd.get("nombre"), 60);
  const tel = limpio(fd.get("tel"), 20).replace(/[^\d+ ]/g, "");
  const fotos = fd.getAll("fotos").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 3);

  if (!sintoma) return { ok: false, error: "Elige qué le pasa al equipo." };
  if (!(vender in VENDER)) return { ok: false, error: "Indica si pueden seguir vendiendo." };
  if (nombre.length < 2) return { ok: false, error: "Escribe tu nombre." };
  if (desde && !(DESDE as readonly string[]).includes(desde)) return { ok: false, error: "Dato inválido." };
  if (fotos.some((f) => f.size > 5 * 1024 * 1024 || !/^image\/(jpeg|png|webp)$/.test(f.type))) return { ok: false, error: "Las fotos deben ser imágenes de menos de 5 MB." };

  const db = adminClient();
  const { data: activo } = await db.from("activos").select("id, sucursal_id, equipo, sucursales(nombre)").eq("id", activoId).eq("activo", true).maybeSingle();
  if (!activo) return { ok: false, error: "No encontramos este equipo. Vuelve a escanear el QR." };
  const sucursal = (activo.sucursales as unknown as { nombre: string } | null)?.nombre ?? "";

  // ¿Ya hay un reporte abierto de este mismo equipo? Se suma al existente en lugar de duplicarlo.
  const { data: abierto } = await db.from("tickets").select("id, folio, token, fotos").eq("activo_id", activoId).in("estado", ABIERTOS).order("creado", { ascending: false }).limit(1).maybeSingle();

  const id: string = abierto?.id ?? crypto.randomUUID();
  const rutas: string[] = [];
  for (const f of fotos) {
    const ruta = `${id}/${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${f.type === "image/png" ? "png" : f.type === "image/webp" ? "webp" : "jpg"}`;
    const { error } = await db.storage.from("tickets").upload(ruta, f, { contentType: f.type });
    if (!error) rutas.push(ruta);
  }

  const prioridad = VENDER[vender].prioridad;
  if (abierto) {
    await db.from("tickets").update({ fotos: [...(abierto.fotos ?? []), ...rutas], actualizado: new Date().toISOString() }).eq("id", abierto.id);
    await db.from("ticket_eventos").insert({
      ticket_id: abierto.id, tipo: "reporte", autor: nombre,
      texto: `${nombre} volvió a reportar: ${sintoma}.${detalle ? ` ${detalle}` : ""}${rutas.length ? ` (${rutas.length} foto${rutas.length > 1 ? "s" : ""})` : ""}`,
    });
    if (prioridad === "alta") await db.from("tickets").update({ prioridad }).eq("id", abierto.id);
    await avisar({ titulo: `${folioTicket(abierto.folio)} · otro reporte`, cuerpo: `${sucursal} · ${activo.equipo}: ${sintoma}`, url: `/admin/tickets/${abierto.id}`, tag: abierto.id });
    revalidatePath("/admin/tickets");
    return { ok: true, token: abierto.token, nuevo: false };
  }

  const { data: t, error } = await db.from("tickets").insert({
    id, activo_id: activoId, sucursal_id: activo.sucursal_id, equipo: activo.equipo, sintoma, desde: desde || null,
    detalle: detalle || null, puede_vender: vender, prioridad, reporta_nombre: nombre, reporta_tel: tel || null, fotos: rutas,
  }).select("folio, token").single();
  if (error || !t) {
    console.error(error);
    return { ok: false, error: "No se pudo guardar el reporte. Intenta de nuevo." };
  }
  await db.from("ticket_eventos").insert({ ticket_id: id, tipo: "creado", texto: "Reporte recibido por Mantenimiento.", autor: nombre });

  await avisar({
    titulo: `${prioridad === "alta" ? "🔴 Urgente · " : ""}${folioTicket(t.folio)} · ${sucursal}`,
    cuerpo: `${activo.equipo}: ${sintoma}. ${VENDER[vender].titulo}. Reporta ${nombre}.`,
    url: `/admin/tickets/${id}`,
    tag: id,
  });
  revalidatePath("/admin/tickets");
  revalidatePath("/admin");
  return { ok: true, token: t.token, nuevo: true };
}

/** La tienda indica que ya se resolvió sola (antes de que llegue el técnico). */
export async function cancelarTicket(fd: FormData) {
  const token = limpio(fd.get("token"), 64);
  const db = adminClient();
  const { data: t } = await db.from("tickets").select("id, folio, estado, reporta_nombre").eq("token", token).maybeSingle();
  if (!t || !ABIERTOS.includes(t.estado)) return;
  await db.from("tickets").update({ estado: "cancelado", resuelto_en: new Date().toISOString(), actualizado: new Date().toISOString() }).eq("id", t.id);
  await db.from("ticket_eventos").insert({ ticket_id: t.id, tipo: "cancelado", texto: "La tienda indicó que el equipo ya funciona.", autor: t.reporta_nombre });
  await avisar({ titulo: `${folioTicket(t.folio)} cancelado`, cuerpo: "La tienda dice que el equipo ya funciona.", url: `/admin/tickets/${t.id}`, tag: t.id });
  revalidatePath(`/t/${token}`);
  revalidatePath("/admin/tickets");
}

/** La tienda agrega un comentario a su ticket. */
export async function comentarTicket(fd: FormData) {
  const token = limpio(fd.get("token"), 64);
  const texto = String(fd.get("texto") ?? "").trim().slice(0, 600);
  if (!texto) return;
  const db = adminClient();
  const { data: t } = await db.from("tickets").select("id, folio, estado, reporta_nombre, prioridad").eq("token", token).maybeSingle();
  if (!t || !ABIERTOS.includes(t.estado)) return;
  await db.from("ticket_eventos").insert({ ticket_id: t.id, tipo: "reporte", texto, autor: `${t.reporta_nombre} (tienda)` });
  await db.from("tickets").update({ actualizado: new Date().toISOString() }).eq("id", t.id);
  await avisar({ titulo: `${folioTicket(t.folio)} · comentario de la tienda`, cuerpo: texto.slice(0, 140), url: `/admin/tickets/${t.id}`, tag: t.id });
  revalidatePath(`/t/${token}`);
}

export type { Res as ResTicket };
