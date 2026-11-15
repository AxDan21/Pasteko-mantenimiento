"use server";
import { revalidatePath } from "next/cache";
import { sesion } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { avisar } from "@/lib/push";
import { folioTicket } from "@/lib/tickets";

/** El técnico asignado avisa que va en camino (la tienda lo ve en su enlace). */
export async function voyEnCamino(f: FormData) {
  const s = await sesion();
  if (!s?.perfil?.activo) return;
  const id = String(f.get("id"));
  const db = adminClient();
  const { data: t } = await db.from("tickets").select("folio, token, estado, tecnico_id").eq("id", id).maybeSingle();
  if (!t || t.tecnico_id !== s.userId || !["abierto", "asignado"].includes(t.estado)) return;
  await db.from("tickets").update({ estado: "en_proceso", actualizado: new Date().toISOString() }).eq("id", id);
  await db.from("ticket_eventos").insert({ ticket_id: id, tipo: "estado", texto: `${s.perfil.nombre.split(" ")[0]} va en camino.`, autor: s.perfil.nombre });
  if (s.perfil.rol !== "admin") await avisar({ titulo: `${folioTicket(t.folio)} · técnico en camino`, cuerpo: `${s.perfil.nombre} va a atender el reporte.`, url: `/admin/tickets/${id}`, tag: id });
  revalidatePath(`/servicio/tickets/${id}`);
  revalidatePath("/servicio");
  revalidatePath(`/t/${t.token}`);
}
