"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSupervisor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Marca la sucursal como censada (o la reabre). Valida la zona en la base de datos. */
export async function marcarCenso(f: FormData) {
  await requireSupervisor();
  const id = Number(f.get("sucursal_id"));
  const completo = String(f.get("completo")) === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("marcar_censo", { p_sucursal: id, p_completo: completo });
  if (error) redirect(`/censo/${id}?error=${encodeURIComponent("No se pudo actualizar: " + error.message)}`);
  revalidatePath("/censo");
  revalidatePath("/admin/activos/censo");
  redirect(`/censo/${id}?ok=${completo ? "completa" : "abierta"}`);
}

/** Borra un equipo mal registrado (solo si aún no lo valida Mantenimiento). */
export async function borrarEquipoCenso(f: FormData) {
  await requireSupervisor();
  const id = String(f.get("id") ?? "");
  const sucursal = String(f.get("sucursal_id") ?? "");
  const supabase = await createClient();
  const { data } = await supabase.from("activos").select("ficha_path, foto_path, validado").eq("id", id).maybeSingle();
  if (!data) redirect(`/censo/${sucursal}?error=${encodeURIComponent("No encontramos ese equipo.")}`);
  if (data.validado) redirect(`/censo/${sucursal}?error=${encodeURIComponent("Ese equipo ya fue validado. Pide a Mantenimiento que lo corrija.")}`);
  const { error } = await supabase.from("activos").delete().eq("id", id);
  if (error) redirect(`/censo/${sucursal}?error=${encodeURIComponent("Solo puedes borrar equipos que tú registraste.")}`);
  revalidatePath(`/censo/${sucursal}`);
  redirect(`/censo/${sucursal}?ok=borrado`);
}

/** Guarda la ubicación GPS de la tienda (el supervisor está en ella). Responde al botón, sin recargar. */
export async function guardarUbicacionGps(sucursalId: number, lat: number, lng: number, precision: number) {
  await requireSupervisor();
  if (![lat, lng, precision].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { ok: false, error: "Ubicación no válida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("guardar_ubicacion_gps", {
    p_sucursal: sucursalId, p_lat: Math.round(lat * 1e6) / 1e6, p_lng: Math.round(lng * 1e6) / 1e6, p_precision: Math.round(precision),
  });
  if (error) return { ok: false, error: `No se pudo guardar: ${error.message}` };
  revalidatePath(`/censo/${sucursalId}`);
  revalidatePath("/admin/sucursales");
  return { ok: true, error: "" };
}
