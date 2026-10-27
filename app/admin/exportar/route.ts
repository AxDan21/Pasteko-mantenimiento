import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mesValido, rangoFechas, rangoISO } from "@/lib/panel";
import type { Hoja } from "@/lib/types";

const celda = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (filas: unknown[][]) => filas.map((r) => r.map(celda).join(",")).join("\r\n");

/** Descarga CSV (abre en Excel y se importa en Power BI). ?tabla=hojas|gastos|preventivos|caja|activos|refacciones&mes=YYYY-MM */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (!esAdmin) return new NextResponse("No autorizado", { status: 403 });

  const p = req.nextUrl.searchParams;
  const tabla = p.get("tabla") ?? "hojas";
  const mes = mesValido(p.get("mes"));
  const [ini, fin] = rangoFechas(mes);
  let filas: unknown[][] = [];

  if (tabla === "hojas") {
    const [tIni, tFin] = rangoISO(mes);
    let q = supabase.from("v_hojas").select("*").gte("creada", tIni).lt("creada", tFin).order("creada");
    for (const k of ["zona", "estado", "tipo"] as const) if (p.get(k)) q = q.eq(k, p.get(k)!);
    if (p.get("tecnico")) q = q.eq("tecnico_id", p.get("tecnico")!);
    const { data } = await q;
    filas = [
      ["folio", "fecha", "sucursal", "zona", "equipo", "activo", "tipo", "ticket", "tecnico", "refacciones", "mano_obra", "total", "estado", "recibio"],
      ...((data ?? []) as (Hoja & { activo_id: string | null })[]).map((h) => [
        h.folio, h.creada, h.sucursal, h.zona, h.equipo, h.activo_id ?? "", h.tipo, h.ticket ?? "", h.tecnico,
        h.refacciones.reduce((s, r) => s + r.cantidad * r.costo, 0), h.mano_obra, h.total, h.estado, h.recibe_nombre,
      ]),
    ];
  } else if (tabla === "gastos") {
    const { data } = await supabase.from("v_gastos").select("*").gte("fecha", ini).lt("fecha", fin).order("fecha");
    filas = [
      ["fecha", "origen", "sucursal", "zona", "categoria", "tipo", "concepto", "activo", "monto"],
      ...(data ?? []).map((g) => [g.fecha, g.origen, g.sucursal ?? "General", g.zona ?? "", g.categoria, g.tipo, g.concepto, g.activo_id ?? "", g.monto]),
    ];
  } else if (tabla === "preventivos") {
    const { data } = await supabase.from("preventivos").select("*, sucursales(nombre, zona), perfiles(nombre)").gte("fecha", ini).lt("fecha", fin).order("fecha");
    filas = [
      ["fecha", "sucursal", "zona", "equipo", "activo", "tarea", "tecnico", "hecho"],
      ...((data ?? []) as Record<string, unknown>[]).map((x) => {
        const s = x.sucursales as { nombre: string; zona: string } | null, t = x.perfiles as { nombre: string } | null;
        return [x.fecha, s?.nombre, s?.zona, x.equipo, x.activo_id ?? "", x.tarea, t?.nombre ?? "", x.hecho ? "si" : "no"];
      }),
    ];
  } else if (tabla === "caja") {
    const { data } = await supabase.from("caja_chica").select("*, sucursales(nombre)").gte("fecha", ini).lt("fecha", fin).order("fecha");
    filas = [
      ["fecha", "concepto", "sucursal", "monto", "factura"],
      ...((data ?? []) as Record<string, unknown>[]).map((x) => [x.fecha, x.concepto, (x.sucursales as { nombre: string } | null)?.nombre ?? "General", x.monto, x.factura_path ? "si" : "no"]),
    ];
  } else if (tabla === "activos") {
    const { data } = await supabase.from("activos").select("*, sucursales(nombre, zona)").order("id");
    filas = [
      ["codigo", "sucursal", "zona", "equipo", "marca", "modelo", "serie", "compra", "garantia_hasta", "costo", "vida_anios", "en_uso"],
      ...((data ?? []) as Record<string, unknown>[]).map((x) => {
        const s = x.sucursales as { nombre: string; zona: string } | null;
        return [x.id, s?.nombre, s?.zona, x.equipo, x.marca, x.modelo, x.serie, x.fecha_compra, x.garantia_hasta, x.costo, x.vida_anios, x.activo ? "si" : "no"];
      }),
    ];
  } else if (tabla === "refacciones") {
    const { data } = await supabase.from("refacciones").select("*").order("nombre");
    filas = [
      ["codigo", "refaccion", "equipo", "ubicacion", "stock", "minimo", "costo"],
      ...((data ?? []) as Record<string, unknown>[]).map((x) => [x.codigo, x.nombre, x.equipo, x.ubicacion, x.stock, x.minimo, x.costo]),
    ];
  } else {
    return new NextResponse("Tabla no válida", { status: 400 });
  }

  const nombre = ["activos", "refacciones"].includes(tabla) ? tabla : `${tabla}-${mes}`;
  return new NextResponse("﻿" + csv(filas), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${nombre}.csv"` },
  });
}
