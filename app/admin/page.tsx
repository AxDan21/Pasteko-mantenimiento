import Link from "next/link";
import GraficaMensual from "@/components/GraficaMensual";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { acumuladoPorActivo, leerAjustes } from "@/lib/datos";
import { mxn } from "@/lib/format";
import { diasEntre, estadoGarantia, estadoPreventivo, hoy, MESES, mesActual, mesCorto, nombreMes, rangoFechas, recomendacion, sumarDias, sumarMeses } from "@/lib/panel";
import type { Activo, GastoV, Preventivo } from "@/lib/types";

export default async function Resumen() {
  await requireAdmin();
  const supabase = await createClient();
  const h = hoy(), mes = mesActual(), desde = sumarMeses(mes, -5);
  const [ini, fin] = rangoFechas(mes);

  const [ajustes, { data: g }, { data: p }, { data: a }, { data: r }, { data: c }, { count: porRevisar }, acum] = await Promise.all([
    leerAjustes(supabase),
    supabase.from("v_gastos").select("fecha, sucursal, tipo, monto, origen").gte("fecha", `${desde}-01`).lt("fecha", fin),
    supabase.from("preventivos").select("id, fecha, sucursal_id, equipo, tarea, hecho, sucursales(nombre)").lte("fecha", sumarDias(h, 60)).order("fecha"),
    supabase.from("activos").select("*").eq("activo", true),
    supabase.from("refacciones").select("stock, minimo"),
    supabase.from("caja_chica").select("monto, factura_path").gte("fecha", ini).lt("fecha", fin),
    supabase.from("hojas_servicio").select("id", { count: "exact", head: true }).eq("estado", "Enviada"),
    acumuladoPorActivo(supabase),
  ]);

  const gastos = (g ?? []) as Pick<GastoV, "fecha" | "sucursal" | "tipo" | "monto" | "origen">[];
  const prevs = (p ?? []) as unknown as (Pick<Preventivo, "id" | "fecha" | "sucursal_id" | "equipo" | "tarea" | "hecho"> & { sucursales: { nombre: string } | null })[];
  const activos = (a ?? []) as Activo[];

  // Gasto por mes (6 meses)
  const meses = Array.from({ length: 6 }, (_, i) => sumarMeses(desde, i));
  const porMes = new Map(meses.map((m) => [m, 0]));
  gastos.forEach((x) => porMes.set(x.fecha.slice(0, 7), (porMes.get(x.fecha.slice(0, 7)) ?? 0) + Number(x.monto)));
  const delMes = gastos.filter((x) => x.fecha >= ini);
  const total = porMes.get(mes) ?? 0;
  const pct = ajustes.presupuesto_mensual ? (total / ajustes.presupuesto_mensual) * 100 : 0;
  const diasMes = diasEntre(ini, fin), dia = diasEntre(ini, h) + 1, ritmo = (dia / diasMes) * 100;

  // Preventivos
  const prevMes = prevs.filter((x) => x.fecha >= ini && x.fecha < fin);
  const hechos = prevMes.filter((x) => x.hecho).length;
  const vencidos = prevs.filter((x) => estadoPreventivo(x, h).texto === "Vencido");
  const proximos = prevs.filter((x) => !x.hecho).slice(0, 6);

  // Sucursales y tipo
  const porSuc = new Map<string, number>();
  delMes.forEach((x) => x.sucursal && porSuc.set(x.sucursal, (porSuc.get(x.sucursal) ?? 0) + Number(x.monto)));
  const top = Array.from(porSuc.entries()).sort((x, y) => y[1] - x[1]).slice(0, 6);
  const maxTop = top[0]?.[1] ?? 1;
  const prevMonto = delMes.filter((x) => x.tipo === "Preventivo").reduce((s, x) => s + Number(x.monto), 0);

  // Alertas
  const garantias = activos.filter((x) => estadoGarantia(x.garantia_hasta, h).clase === "warn");
  const reemplazo = activos.filter((x) => recomendacion(x, acum.get(x.id)?.total ?? 0, h).clase === "bad");
  const pagadoGarantia = activos.filter((x) => x.garantia_hasta && (acum.get(x.id)?.filas ?? []).some((f) => f.tipo === "Correctivo" && f.fecha <= x.garantia_hasta!));
  const refBajas = (r ?? []).filter((x) => Number(x.stock) < Number(x.minimo)).length;
  const sinFactura = (c ?? []).filter((x) => !x.factura_path).length;
  const cajaUsada = (c ?? []).reduce((s, x) => s + Number(x.monto), 0);

  const alertas = [
    [vencidos.length, "bad", "preventivos vencidos", "/admin/preventivos?estado=Vencido"],
    [pagadoGarantia.length, "bad", "equipos con reparaciones pagadas en garantía", "/admin/activos?rec=garantia"],
    [reemplazo.length, "bad", "equipos para evaluar reemplazo", "/admin/activos?rec=Evaluar%20reemplazo"],
    [garantias.length, "warn", "garantías vencen en 60 días", "/admin/activos"],
    [refBajas, "warn", "refacciones debajo del mínimo", "/admin/refacciones"],
    [sinFactura, "warn", "gastos de caja chica sin factura", "/admin/caja"],
    [porRevisar ?? 0, "neutral", "hojas de servicio por revisar", "/admin/hojas?estado=Enviada"],
  ].filter((x) => Number(x[0]) > 0) as [number, string, string, string][];

  return (
    <main className="wrap">
      <div className="head-row">
        <div>
          <p className="eyebrow">Panel de mantenimiento · {nombreMes(mes)}</p>
          <h1 className="page-h">Resumen</h1>
        </div>
        <span className="pill neutral">Corte al {Number(h.slice(8))} de {MESES[Number(h.slice(5, 7)) - 1]}</span>
      </div>

      <div className="kpis">
        <div className="kpi">
          <span className="eyebrow">Gasto del mes</span>
          <span className="v">{mxn(total)}</span>
          <div className="bar"><i className={pct > 100 ? "bad" : pct > ritmo + 5 ? "warn" : ""} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
          <span className="s">{pct.toFixed(0)}% de {mxn(ajustes.presupuesto_mensual)} · mes al {ritmo.toFixed(0)}%</span>
        </div>
        <div className="kpi">
          <span className="eyebrow">Preventivos del mes</span>
          <span className="v">{hechos}<span style={{ fontSize: 18, color: "var(--muted)" }}> / {prevMes.length}</span></span>
          <div className="bar"><i style={{ width: `${prevMes.length ? (hechos / prevMes.length) * 100 : 0}%` }} /></div>
          <span className="s">{vencidos.length} vencido{vencidos.length !== 1 ? "s" : ""} por reprogramar</span>
        </div>
        <div className="kpi">
          <span className="eyebrow">Caja chica</span>
          <span className="v">{mxn(ajustes.fondo_caja_chica - cajaUsada)}</span>
          <div className="bar"><i className={cajaUsada > ajustes.fondo_caja_chica * 0.85 ? "warn" : ""} style={{ width: `${Math.min((cajaUsada / (ajustes.fondo_caja_chica || 1)) * 100, 100)}%` }} /></div>
          <span className="s">Saldo de {mxn(ajustes.fondo_caja_chica)}</span>
        </div>
        <div className="kpi">
          <span className="eyebrow">Hojas por revisar</span>
          <span className="v">{porRevisar ?? 0}</span>
          <span className="s">Enviadas por técnicos</span>
        </div>
      </div>

      {alertas.length > 0 && (
        <section className="card" style={{ marginBottom: 16 }}>
          <h3>Requiere tu atención</h3>
          <p className="sub">Toca una alerta para ir al detalle.</p>
          <div className="alerts">
            {alertas.map(([n, cl, t, href]) => (
              <Link key={t} href={href} className={`alert ${cl}`}>
                <b className="n num">{n}</b>
                <span>{t}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="panel-grid">
        <section className="card">
          <h3>Gasto mensual contra presupuesto</h3>
          <p className="sub">Hojas de servicio, gastos registrados y caja chica. {nombreMes(mes)} va al día {dia}.</p>
          <GraficaMensual datos={meses.map((m) => ({ etiqueta: mesCorto(m), valor: porMes.get(m) ?? 0, parcial: m === mes }))} presupuesto={ajustes.presupuesto_mensual} />
        </section>
        <section className="card">
          <h3>Próximos preventivos</h3>
          <p className="sub">Los vencidos aparecen primero.</p>
          {proximos.length ? (
            <div className="upcoming">
              {proximos.map((x) => {
                const e = estadoPreventivo(x, h);
                return (
                  <div key={x.id} className="up">
                    <div className="date-chip"><b>{Number(x.fecha.slice(8))}</b><small>{MESES[Number(x.fecha.slice(5, 7)) - 1]}</small></div>
                    <div className="t"><b>{x.sucursales?.nombre}</b><small>{x.equipo} · {x.tarea}</small></div>
                    <span className={`pill ${e.clase}`}>{e.texto}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="sub">Sin preventivos pendientes. <Link href="/admin/preventivos">Programa el primero</Link>.</p>
          )}
        </section>
        <section className="card">
          <h3>Sucursales con más gasto</h3>
          <p className="sub">{nombreMes(mes)}</p>
          {top.length ? (
            <div className="hbars">
              {top.map(([s, v]) => (
                <div key={s} className="hb"><span className="name">{s}</span><span className="track"><i style={{ width: `${(v / maxTop) * 100}%` }} /></span><span className="num">{mxn(v)}</span></div>
              ))}
            </div>
          ) : <p className="sub">Sin gastos este mes.</p>}
        </section>
        <section className="card">
          <h3>Preventivo contra correctivo</h3>
          <p className="sub">{nombreMes(mes)}</p>
          <div className="bar" style={{ height: 14, display: "flex" }}>
            <i style={{ width: `${total ? (prevMonto / total) * 100 : 0}%`, borderRadius: 0 }} />
            <i className="ink" style={{ width: `${total ? ((total - prevMonto) / total) * 100 : 0}%`, borderRadius: 0 }} />
          </div>
          <div className="hbars" style={{ marginTop: 14 }}>
            <div className="hb"><span className="name">Preventivo</span><span className="s">{total ? ((prevMonto / total) * 100).toFixed(0) : 0}%</span><span className="num">{mxn(prevMonto)}</span></div>
            <div className="hb"><span className="name">Correctivo y otros</span><span className="s">{total ? (((total - prevMonto) / total) * 100).toFixed(0) : 0}%</span><span className="num">{mxn(total - prevMonto)}</span></div>
          </div>
          <p className="sub" style={{ marginTop: 12 }}>Meta: que el preventivo crezca mes con mes y el correctivo baje.</p>
        </section>
      </div>
    </main>
  );
}
