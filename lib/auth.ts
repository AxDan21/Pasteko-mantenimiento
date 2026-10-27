import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Perfil } from "@/lib/types";

/** Usuario y perfil actuales, o null si no hay sesión. */
export async function sesion(): Promise<{ userId: string; perfil: Perfil | null } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("perfiles").select("*").eq("id", user.id).maybeSingle<Perfil>();
  return { userId: user.id, perfil: data };
}

/** Exige sesión de administrador; si no, redirige. */
export async function requireAdmin() {
  const s = await sesion();
  if (!s) redirect("/login?next=/admin");
  if (!s.perfil || s.perfil.rol !== "admin" || !s.perfil.activo) redirect("/servicio");
  return { userId: s.userId, perfil: s.perfil };
}
