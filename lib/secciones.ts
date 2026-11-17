import type { Vista } from "@/components/Seccion";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Servicio = reportes de tiendas + hojas de servicio (el ciclo completo de una falla). */
export async function vistasServicio(db: Db): Promise<Vista[]> {
  const [{ data: tk }, { count: porRevisar }] = await Promise.all([
    db.from("tickets").select("prioridad").in("estado", ["abierto", "asignado", "en_proceso"]),
    db.from("hojas_servicio").select("id", { count: "exact", head: true }).eq("estado", "Enviada"),
  ]);
  const abiertos = (tk ?? []).length;
  const urgentes = (tk ?? []).some((t) => t.prioridad === "alta");
  return [
    { clave: "reportes", href: "/admin/tickets", nombre: "Reportes de tiendas", cuenta: abiertos, alerta: urgentes },
    { clave: "hojas", href: "/admin/hojas", nombre: "Hojas de servicio", cuenta: porRevisar ?? 0 },
  ];
}

/** Equipos = inventario con garantías + censo de supervisores + etiquetas QR. */
export async function vistasEquipos(db: Db): Promise<Vista[]> {
  const { count: porValidar } = await db.from("activos").select("id", { count: "exact", head: true }).eq("activo", true).eq("validado", false);
  return [
    { clave: "inventario", href: "/admin/activos", nombre: "Inventario y garantías" },
    { clave: "censo", href: "/admin/activos/censo", nombre: "Censo", cuenta: porValidar ?? 0, alerta: (porValidar ?? 0) > 0 },
    { clave: "etiquetas", href: "/admin/activos/etiquetas", nombre: "Etiquetas QR" },
  ];
}
