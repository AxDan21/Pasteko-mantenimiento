import type { Vista } from "@/components/Seccion";
import type { createClient } from "@/lib/supabase/server";
import { hoy } from "@/lib/panel";

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

/** Sucursales = mapa + tablero por zona y supervisor (antes "Supervisores"). */
export function vistasSucursales(): Vista[] {
  return [
    { clave: "mapa", href: "/admin/sucursales", nombre: "Mapa" },
    { clave: "zonas", href: "/admin/sucursales/zonas", nombre: "Por zona y supervisor" },
  ];
}

/** Usuarios de la app (técnicos, supervisores, administradores, consulta) + proveedores externos. */
export async function vistasUsuarios(db: Db): Promise<Vista[]> {
  const [{ count: usuarios }, { count: proveedores }] = await Promise.all([
    db.from("perfiles").select("id", { count: "exact", head: true }).eq("activo", true),
    db.from("proveedores").select("id", { count: "exact", head: true }).eq("activo", true),
  ]);
  return [
    { clave: "usuarios", href: "/admin/usuarios", nombre: "Usuarios de la app", cuenta: usuarios ?? 0 },
    { clave: "proveedores", href: "/admin/usuarios/proveedores", nombre: "Proveedores externos", cuenta: proveedores ?? 0 },
  ];
}

/** Preventivos = lista programada + plan de salidas por técnico y cercanía. */
export async function vistasPreventivos(db: Db): Promise<Vista[]> {
  const { count: vencidos } = await db.from("preventivos").select("id", { count: "exact", head: true }).eq("hecho", false).lt("fecha", hoy());
  return [
    { clave: "lista", href: "/admin/preventivos", nombre: "Programados", cuenta: vencidos ?? 0, alerta: (vencidos ?? 0) > 0 },
    { clave: "plan", href: "/admin/preventivos/plan", nombre: "Plan de salidas" },
  ];
}
