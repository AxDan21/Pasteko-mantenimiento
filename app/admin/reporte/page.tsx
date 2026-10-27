import CopiarTexto from "@/components/CopiarTexto";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { acumuladoPorActivo, leerAjustes } from "@/lib/datos";
import { mxn } from "@/lib/format";
import { estadoGarantia, estadoPreventivo, hoy, mesValido, nombreMes, rangoFechas, rangoISO, recomendacion } from "@/lib/panel";
import type { Activo, GastoV, Preventivo } from "@/lib/types";

const EXPORTS = [
  ["hojas", "Hojas de servicio"],
  ["gastos", "Gastos (todos los orígenes)"],
  ["preventivos", "Preventivos"],
  ["caja", "Caja chica"],
  ["activos", "Activos"],
  ["refacciones", "Refacciones"],
] as const;

export default async function Reporte({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  await requireAdmin();
  const mes = mesValido((await searchParams).mes);
  const [ini, fin] = rangoFechas(mes);
  const [tIni, tFin] = rangoISO(mes);
  const h = hoy();
  const supabase = await createClient();

  const [ajustes, { data: g }, { data: p }, { data: hs }, { data: a }, { data: c }, { data: r }, acum] = await Promise.all([
    leerAjustes(supabase),
    supabase.from("v_gastos").select("*").gte("fecha", ini).lt("fecha", fin),
    supabase.from("preventivos").select("*, sucursales(nombre)").gte("fecha", ini).lt("fecha", fin),
    supabase.from("hojas_servicio").select("tipo, equipo").gte("creada", tIni).lt("creada", tFin),
    supabase.from("activos").select("*").eq("activo", true),
    supabase.from("caja_chica").select("monto, factura_path").gte("fecha", ini).lt("fecha", fin),
    supabase.from("refacciones").select("nombre, stock, minimo"),
    acumuladoPorActivo(supabase),
  ]);

  const gastos = (g ?? []) as GastoV[];
  const total = gastos.reduce((s, x) => s + Number(x.monto), 0);
  const prev = gastos.filter((x) => x.tipo === "Preventivo").reduce((s, x) => s + Number(x.monto), 0);
  const porSuc = new Map<string, number>();
  gastos.forEach((x) => x.sucursal && porSuc.set(x.sucursal, (porSuc.get(x.sucursal) ?? 0) + Number(x.monto)));
  const top = Array.from(porSuc.entries()).sort((x, y) => y[1] - x[1]).slice(0, 3);
  const porCat = new Map<string, number>();
  gastos.forEach((x) => porCat.set(x.categoria, (porCat.get(x.categoria) ?? 0) + Number(x.monto)));
  const topCat = Array.from(porCat.entries()).sort((x, y) => y[1] - x[1]).slice(0, 3);

  const prevs = (p ?? []) as unknown as (Preventivo & { sucursales: { nombre: string } | null })[];
  const hechos = prevs.filter((x) => x.hecho).length;
  const venc = prevs.filter((x) => estadoPreventivo(x, h).texto === "Vencido");
  const hojas = (hs ?? []) as { tipo: string; equipo: string }[];
  const porEquipo = new Map<string, number>();
  hojas.filter((x) => x.tipo === "Correctivo").forEach((x) => porEquipo.set(x.equipo, (porEquipo.get(x.equipo) ?? 0) + 1));
  const fallas = Array.from(porEquipo.entries()).sort((x, y) => y[1] - x[1]).slice(0, 3);

  const activos = (a ?? []) as Activo[];
  const reemp = activos.filter((x) => recomendacion(x, acum.get(x.id)?.total ?? 0, h).clase === "bad");
  const gar = activos.filter((x) => estadoGarantia(x.garantia_hasta, h).clase === "warn");
  const caja = (c ?? []).reduce((s, x) => s + Number(x.monto), 0);
  const sinF = (c ?? []).filter((x) => !x.factura_path).length;
  const bajas = (r ?? []).filter((x) => Number(x.stock) < Number(x.minimo));
  const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}%` : "0%");

  const secciones: [string, string[]][] = [
    ["Gasto", [
      `${mxn(total)} de ${mxn(ajustes.presupuesto_mensual)} (${pct(total, ajustes.presupuesto_mensual)}).`,
      `Preventivo ${mxn(prev)} (${pct(prev, total)}) y correctivo u otros ${mxn(total - prev)} (${pct(total - prev, total)}).`,
      top.length ? `Sucursales con más gasto: ${top.map(([s, v]) => `${s} ${mxn(v)}`).join(", ")}.` : "Sin gasto por sucursal.",
      topCat.length ? `Categorías principales: ${topCat.map(([s, v]) => `${s} ${mxn(v)}`).join(", ")}.` : "",
    ].filter(Boolean)],
    ["Servicios", [
      `${hojas.length} hojas de servicio: ${hojas.filter((x) => x.tipo === "Preventivo").length} preventivas y ${hojas.filter((x) => x.tipo === "Correctivo").length} correctivas.`,
      fallas.length ? `Equipos con más correctivos: ${fallas.map(([e, n]) => `${e} (${n})`).join(", ")}.` : "Sin correctivos registrados.",
    ]],
    ["Preventivos", [
      `${hechos} de ${prevs.length} realizados (${pct(hechos, prevs.length)}).`,
      venc.length ? `${venc.length} vencidos: ${venc.map((x) => x.sucursales?.nombre).join(", ")}.` : "Sin preventivos vencidos.",
    ]],
    ["Equipos", [
      reemp.length ? `Evaluar reemplazo: ${reemp.map((x) => x.id).join(", ")}.` : "Ningún equipo requiere reemplazo.",
      gar.length ? `Garantías por vencer: ${gar.map((x) => x.id).join(", ")}.` : "Sin garantías por vencer en 60 días.",
    ]],
    ["Caja chica y almacén", [
      `Caja chica: ${mxn(caja)} de ${mxn(ajustes.fondo_caja_chica)}; ${sinF} gasto${sinF !== 1 ? "s" : ""} sin factura.`,
      bajas.length ? `Refacciones por pedir: ${bajas.map((x) => x.nombre).join(", ")}.` : "Refacciones en niveles correctos.",
    ]],
  ];
  const texto = `Reporte de mantenimiento · ${nombreMes(mes)}\n\n` + secciones.map(([t, l]) => `${t.toUpperCase()}\n${l.map((x) => `- ${x}`).join("\n")}`).join("\n\n");

  return (
    <main className="wrap">
      <div className="head-row">
        <div>
          <p className="eyebrow">Panel de mantenimiento</p>
          <h1 className="page-h">Reporte de {nombreMes(mes)}</h1>
        </div>
        <form method="get" className="toolbar" style={{ margin: 0 }}>
          <label className="field">Mes<input id="r-mes" name="mes" type="month" defaultValue={mes} /></label>
          <button className="btn" type="submit">Ver</button>
        </form>
      </div>
      <div className="panel-grid">
        <section className="card report">
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "start" }}>
            <div><h3>Resumen para dirección</h3><p className="sub">Se arma solo con los datos del portal.</p></div>
            <CopiarTexto texto={texto} etiqueta="Copiar reporte" className="btn primary" />
          </div>
          {secciones.map(([t, l]) => (
            <div key={t}>
              <p className="eyebrow" style={{ margin: "16px 0 4px" }}>{t}</p>
              <ul>{l.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          ))}
        </section>
        <section className="card">
          <h3>Exportar a Excel o Power BI</h3>
          <p className="sub">Archivos CSV de {nombreMes(mes)} (activos y refacciones: estado actual).</p>
          <div className="stack" style={{ gap: 8 }}>
            {EXPORTS.map(([k, l]) => (
              <a key={k} className="btn" href={`/admin/exportar?tabla=${k}&mes=${mes}`}>{l}</a>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
