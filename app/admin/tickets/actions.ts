"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { avisar } from "@/lib/push";
import { ESTADOS, folioTicket, type EstadoTicket } from "@/lib/tickets";

const refrescar = (id: string, token?: string) => {
  revalidatePath("/admin/tickets");
  revalidatePath(`/admin/tickets/${id}`);
  revalidatePath("/admin");
  if (token) revalidatePath(`/t/${token}`);
};

/** Asigna (o reasigna) un técnico y le avisa a su celular si activó notificaciones. */
export async function asignarTecnico(f: FormData) {
  const { perfil } = await requireAdmin();
  const id = String(f.get("id"));
  const tecnico = String(f.get("tecnico") || "");
  if (!tecnico) return;
  const supabase = await createClient();
  const [{ data: t }, { data: p }] = await Promise.all([
    supabase.from("tickets").select("folio, token, estado, equipo, sintoma, sucursales(nombre)").eq("id", id).single(),
    supabase.from("perfiles").select("nombre").eq("id", tecnico).single(),
  ]);
  if (!t || !p) return;
  const ahora = new Date().toISOString();
  await supabase.from("tickets").update({
    tecnico_id: tecnico, asignado_en: ahora, actualizado: ahora,
    estado: t.estado === "abierto" ? "asignado" : t.estado,
  }).eq("id", id);
  await supabase.from("ticket_eventos").insert({ ticket_id: id, tipo: "asignado", texto: `Asignado a ${p.nombre.split(" ")[0]}.`, autor: perfil.nombre });
  const suc = (t.sucursales as unknown as { nombre: string } | null)?.nombre ?? "";
  await avisar({ titulo: `Te asignaron ${folioTicket(t.folio)}`, cuerpo: `${suc} · ${t.equipo}: ${t.sintoma}`, url: `/servicio/tickets/${id}`, tag: id }, [tecnico]);
  refrescar(id, t.token);
}

/** Cambia el estado. "Resuelto" sin hoja queda registrado como cierre manual. */
export async function cambiarEstado(f: FormData) {
  const { perfil } = await requireAdmin();
  const id = String(f.get("id"));
  const estado = String(f.get("estado")) as EstadoTicket;
  if (!(estado in ESTADOS)) return;
  const supabase = await createClient();
  const { data: t } = await supabase.from("tickets").select("token, estado").eq("id", id).single();
  if (!t || t.estado === estado) return;
  const ahora = new Date().toISOString();
  const cierre = estado === "resuelto" || estado === "cancelado";
  await supabase.from("tickets").update({ estado, actualizado: ahora, resuelto_en: cierre ? ahora : null }).eq("id", id);
  const textos: Record<EstadoTicket, string> = {
    abierto: "Se reabrió el reporte.",
    asignado: "Reporte asignado.",
    en_proceso: "El técnico va en camino.",
    resuelto: "Mantenimiento marcó el reporte como resuelto.",
    cancelado: "Reporte cancelado por Mantenimiento.",
  };
  await supabase.from("ticket_eventos").insert({ ticket_id: id, tipo: "estado", texto: textos[estado], autor: perfil.nombre });
  refrescar(id, t.token);
}

/** Nota: pública (la ve la tienda en su enlace) o interna. */
export async function agregarNota(f: FormData) {
  const { perfil } = await requireAdmin();
  const id = String(f.get("id"));
  const texto = String(f.get("texto") ?? "").trim().slice(0, 1000);
  if (!texto) return;
  const publico = f.get("publico") === "on";
  const supabase = await createClient();
  const { data: t } = await supabase.from("tickets").select("token").eq("id", id).single();
  await supabase.from("ticket_eventos").insert({ ticket_id: id, tipo: "nota", texto, publico, autor: perfil.nombre });
  await supabase.from("tickets").update({ actualizado: new Date().toISOString() }).eq("id", id);
  refrescar(id, t?.token);
}
