"use server";
import { createClient } from "@/lib/supabase/server";
import { avisar } from "@/lib/push";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

/** Guarda la suscripción push del celular del usuario con sesión. */
export async function guardarSuscripcion(sub: Sub, dispositivo: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return { ok: false };
  if (!/^https:\/\//.test(sub.endpoint)) return { ok: false };
  await supabase.from("push_suscripciones").delete().eq("endpoint", sub.endpoint);
  const { error } = await supabase.from("push_suscripciones").insert({
    usuario_id: user.id, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, dispositivo: dispositivo.slice(0, 80),
  });
  return { ok: !error };
}

export async function quitarSuscripcion(endpoint: string) {
  const supabase = await createClient();
  await supabase.from("push_suscripciones").delete().eq("endpoint", endpoint);
  return { ok: true };
}

/** Manda una notificación de prueba a los dispositivos del usuario. */
export async function probarAviso() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { enviados: 0 };
  const enviados = await avisar({ titulo: "Avisos activados ✅", cuerpo: "Así te llegará cada reporte nuevo de las tiendas.", url: "/admin/tickets", tag: "prueba" }, [user.id]);
  return { enviados };
}
