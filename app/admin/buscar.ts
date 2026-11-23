"use server";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { folioTicket } from "@/lib/tickets";

export type Resultado = { grupo: string; titulo: string; detalle?: string; href: string };

/** Búsqueda rápida del panel (⌘K): equipos, sucursales, reportes de tiendas y hojas de servicio. */
export async function buscarPanel(texto: string): Promise<Resultado[]> {
  await requireAdmin();
  // Sin caracteres que alteren el filtro de PostgREST (comas, paréntesis, comodines).
  const q = texto.replace(/[%_,()*\\]/g, " ").trim().slice(0, 60);
  if (q.length < 2) return [];
  const db = await createClient();
  const like = `%${q}%`;
  const numero = Number(q.replace(/^(mt|hs|#)-?/i, "").replace(/^0+/, "")) || null;

  const [suc, act, tk, hs] = await Promise.all([
    db.from("sucursales").select("id, nombre, zona").ilike("nombre", like).order("nombre").limit(5),
    db.from("activos").select("id, equipo, marca, modelo, sucursales(nombre)").or(`id.ilike.${like},equipo.ilike.${like},serie.ilike.${like},marca.ilike.${like}`).eq("activo", true).limit(6),
    numero
      ? db.from("tickets").select("id, folio, equipo, sintoma, sucursales(nombre)").eq("folio", numero).limit(3)
      : db.from("tickets").select("id, folio, equipo, sintoma, sucursales(nombre)").or(`equipo.ilike.${like},sintoma.ilike.${like}`).order("creado", { ascending: false }).limit(5),
    numero
      ? db.from("v_hojas").select("id, folio, equipo, sucursal").eq("folio", numero).limit(3)
      : Promise.resolve({ data: [] as { id: string; folio: number; equipo: string; sucursal: string }[] }),
  ]);

  const nombre = (x: unknown) => (x as { nombre?: string } | null)?.nombre ?? "";
  return [
    ...(tk.data ?? []).map((t) => ({
      grupo: "Reportes de tiendas", titulo: `${folioTicket(t.folio)} · ${t.equipo}`,
      detalle: `${nombre(t.sucursales)} · ${t.sintoma}`, href: `/admin/tickets?f=todos&sel=${t.id}`,
    })),
    ...(hs.data ?? []).map((x) => ({
      grupo: "Hojas de servicio", titulo: `Hoja #${x.folio} · ${x.equipo}`, detalle: x.sucursal, href: `/admin/hojas/${x.id}`,
    })),
    ...(act.data ?? []).map((x) => ({
      grupo: "Equipos", titulo: `${x.id} · ${x.equipo}`,
      detalle: [nombre(x.sucursales), [x.marca, x.modelo].filter(Boolean).join(" ")].filter(Boolean).join(" · "), href: `/admin/activos/${encodeURIComponent(x.id)}`,
    })),
    ...(suc.data ?? []).map((x) => ({
      grupo: "Sucursales", titulo: x.nombre, detalle: `${x.zona} · ver sus equipos`, href: `/admin/activos?suc=${x.id}`,
    })),
  ];
}
