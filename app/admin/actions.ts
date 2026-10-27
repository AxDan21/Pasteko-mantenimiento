"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(f.get(k) ?? 0) || 0;

function refrescarPublico() {
  revalidatePath("/");
  revalidatePath("/equipo/[slug]", "page");
  revalidatePath("/admin/contenido");
}

// ---------- Hojas ----------
export async function revisarHoja(f: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const id = txt(f, "id");
  const estado = txt(f, "estado") === "Revisada" ? "Revisada" : "Enviada";
  await supabase.from("hojas_servicio").update({ estado, notas_admin: txt(f, "notas") || null }).eq("id", id);
  revalidatePath("/admin/hojas");
  redirect(`/admin/hojas/${id}`);
}

// ---------- Contenido ----------
export async function crearEquipo(f: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const nombre = txt(f, "nombre");
  const slug = (txt(f, "slug") || nombre)
    .normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!nombre || !slug) return;
  await supabase.from("equipos").insert({ nombre, slug, categoria: txt(f, "categoria") || "General", icono: txt(f, "icono") || "general", orden: num(f, "orden") });
  refrescarPublico();
}

export async function alternarPublicado(f: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("equipos").update({ publicado: txt(f, "publicado") === "true" }).eq("id", num(f, "id"));
  refrescarPublico();
}

export async function crearVideo(f: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const titulo = txt(f, "titulo"), url = txt(f, "youtube_url");
  if (!titulo || !url) return;
  await supabase.from("videos").insert({ equipo_id: num(f, "equipo_id"), titulo, youtube_url: url, duracion: txt(f, "duracion") || null, orden: num(f, "orden") });
  refrescarPublico();
}

export async function actualizarVideo(f: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.from("videos").update({ youtube_url: txt(f, "youtube_url") }).eq("id", num(f, "id"));
  refrescarPublico();
}

export async function crearFaq(f: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const pregunta = txt(f, "pregunta");
  const pasos = txt(f, "pasos").split("\n").map((p) => p.replace(/^\s*\d+[.)-]?\s*/, "").trim()).filter(Boolean);
  if (!pregunta || !pasos.length) return;
  await supabase.from("faqs").insert({ equipo_id: num(f, "equipo_id"), pregunta, pasos, aviso_seguridad: txt(f, "aviso") || null, orden: num(f, "orden") });
  refrescarPublico();
}

export async function borrar(f: FormData) {
  await requireAdmin();
  const tabla = txt(f, "tabla");
  if (!["videos", "faqs", "equipos"].includes(tabla)) return;
  const supabase = await createClient();
  await supabase.from(tabla).delete().eq("id", num(f, "id"));
  refrescarPublico();
}

// ---------- Técnicos ----------
export async function crearTecnico(f: FormData) {
  await requireAdmin();
  const email = txt(f, "email"), nombre = txt(f, "nombre"), password = txt(f, "password");
  const rol = txt(f, "rol") === "admin" ? "admin" : "tecnico";
  if (!email || !nombre || password.length < 8) redirect("/admin/tecnicos?error=datos");

  const admin = adminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { nombre } });
  if (error || !data.user) redirect(`/admin/tecnicos?error=${encodeURIComponent(error?.message ?? "alta")}`);
  await admin.from("perfiles").update({ nombre, rol, zona: txt(f, "zona") || null }).eq("id", data.user.id);
  revalidatePath("/admin/tecnicos");
  redirect("/admin/tecnicos?ok=1");
}

export async function actualizarTecnico(f: FormData) {
  const { userId } = await requireAdmin();
  const id = txt(f, "id");
  const supabase = await createClient();
  const cambios: Record<string, unknown> = {};
  if (f.has("activo")) cambios.activo = txt(f, "activo") === "true";
  if (f.has("zona")) cambios.zona = txt(f, "zona") || null;
  if (id === userId && cambios.activo === false) return; // no desactivarse a sí mismo
  await supabase.from("perfiles").update(cambios).eq("id", id);
  revalidatePath("/admin/tecnicos");
}

export async function cambiarPassword(f: FormData) {
  await requireAdmin();
  const password = txt(f, "password");
  if (password.length < 8) redirect("/admin/tecnicos?error=password");
  const { error } = await adminClient().auth.admin.updateUserById(txt(f, "id"), { password });
  redirect(error ? `/admin/tecnicos?error=${encodeURIComponent(error.message)}` : "/admin/tecnicos?ok=password");
}
