"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { inicioDe } from "@/lib/auth";

export async function iniciarSesion(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) redirect("/login?error=credenciales");

  const { data: perfil } = await supabase.from("perfiles").select("rol, activo").eq("id", data.user.id).maybeSingle();
  if (!perfil || !perfil.activo) {
    await supabase.auth.signOut();
    redirect("/login?error=inactivo");
  }

  const destino = next.startsWith("/") && !next.startsWith("//") ? next : inicioDe(perfil.rol);
  redirect(destino);
}

export async function cerrarSesion() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
