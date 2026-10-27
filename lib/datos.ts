import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Ajustes } from "@/lib/types";

type Db = Awaited<ReturnType<typeof createClient>>;

export async function leerAjustes(db: Db): Promise<Ajustes> {
  const { data } = await db.from("ajustes").select("clave, valor");
  const m = new Map<string, number>(
    (data ?? []).map(
      (r: { clave: string; valor: number }) =>
        [r.clave, Number(r.valor)] as [string, number],
    ),
  );
  return {
    presupuesto_mensual: m.get("presupuesto_mensual") ?? 70000,
    fondo_caja_chica: m.get("fondo_caja_chica") ?? 10000,
  };
}

/** Enlaces temporales (1 h) para un conjunto de rutas de un bucket privado. */
export async function enlaces(
  db: Db,
  bucket: string,
  rutas: (string | null | undefined)[],
) {
  const validas = Array.from(new Set(rutas.filter((r): r is string => !!r)));
  if (!validas.length) return new Map<string, string>();
  const { data } = await db.storage
    .from(bucket)
    .createSignedUrls(validas, 3600);
  const m = new Map<string, string>();
  (data ?? []).forEach((d) => {
    if (d.path && d.signedUrl) m.set(d.path, d.signedUrl);
  });
  return m;
}

/** Suma de reparaciones (hojas, gastos) por activo. */
export async function acumuladoPorActivo(db: Db) {
  const { data } = await db
    .from("v_gastos")
    .select("activo_id, monto, fecha, tipo")
    .not("activo_id", "is", null);
  const m = new Map<
    string,
    { total: number; filas: { fecha: string; monto: number; tipo: string }[] }
  >();
  (data ?? []).forEach((r) => {
    const k = r.activo_id as string;
    const e = m.get(k) ?? { total: 0, filas: [] };
    e.total += Number(r.monto);
    e.filas.push({
      fecha: r.fecha as string,
      monto: Number(r.monto),
      tipo: r.tipo as string,
    });
    m.set(k, e);
  });
  return m;
}
