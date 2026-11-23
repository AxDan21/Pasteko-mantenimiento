import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { hoy } from "@/lib/panel";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Pendientes de un módulo. `alerta` pinta el contador en rojo (algo detiene la operación o ya venció). */
export type Contador = { n: number; alerta?: boolean };
/** `avisos` = reportes de tiendas nuevos que aún no tienen técnico (indicador de la campana). */
export type Contadores = Partial<Record<"servicio" | "preventivos" | "equipos" | "refacciones" | "gastos" | "avisos", Contador>>;

/**
 * Consultas ligeras (conteos y columnas mínimas) para los contadores de la navegación del panel.
 * Si una consulta falla, ese módulo queda sin contador en lugar de mostrar un cero engañoso.
 */
export async function contadoresAdmin(db: Db): Promise<Contadores> {
  const h = hoy();
  const [tk, hojas, prev, censo, ref, pp] = await Promise.all([
    db.from("tickets").select("prioridad, estado").in("estado", ["abierto", "asignado", "en_proceso"]),
    db.from("hojas_servicio").select("id", { count: "exact", head: true }).eq("estado", "Enviada"),
    db.from("preventivos").select("id", { count: "exact", head: true }).eq("hecho", false).lt("fecha", h),
    db.from("activos").select("id", { count: "exact", head: true }).eq("activo", true).eq("validado", false),
    db.from("refacciones").select("stock, minimo"),
    db.from("v_gastos").select("monto", { count: "exact", head: true }).eq("pagado", false),
  ]);

  const c: Contadores = {};
  if (!tk.error && !hojas.error) {
    const abiertos = tk.data ?? [];
    c.servicio = { n: abiertos.length + (hojas.count ?? 0), alerta: abiertos.some((t) => t.prioridad === "alta") };
  }
  if (!tk.error) {
    const nuevos = (tk.data ?? []).filter((t) => t.estado === "abierto");
    c.avisos = { n: nuevos.length, alerta: nuevos.some((t) => t.prioridad === "alta") };
  }
  if (!prev.error) c.preventivos = { n: prev.count ?? 0, alerta: true };
  if (!censo.error) c.equipos = { n: censo.count ?? 0 };
  if (!ref.error) c.refacciones = { n: (ref.data ?? []).filter((x) => Number(x.stock) < Number(x.minimo)).length };
  if (!pp.error) c.gastos = { n: pp.count ?? 0 };
  return c;
}
