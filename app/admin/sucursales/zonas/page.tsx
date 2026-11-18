import CopiarTexto from "@/components/CopiarTexto";
import Seccion from "@/components/Seccion";
import { vistasSucursales } from "@/lib/secciones";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mxn } from "@/lib/format";
import { enlaceComoLlegar } from "@/lib/geo";
import { estadoPreventivo, fCorta, hoy, mesActual, nombreMes, rangoFechas, sumarDias } from "@/lib/panel";
import type { Preventivo } from "@/lib/types";

export default async function SucursalesPorZona({ searchParams }: { searchParams: Promise<{ zona?: string }> }) {
  await requireAdmin();
  const f = await searchParams;
  const supabase = await createClient();
  const h = hoy(), mes = mesActual();
  const [ini, fin] = rangoFechas(mes);

  const { data: suc } = await supabase.from("sucursales").select("id, nombre, zona, supervisor, lat, lng").eq("activa", true).order("nombre");
  const sucursales = (suc ?? []) as { id: number; nombre: string; zona: string; supervisor: string | null; lat: number | null; lng: number | null }[];
  const zonas = Array.from(new Set(sucursales.map((s) => s.zona))).sort();
  const zona = f.zona && zonas.includes(f.zona) ? f.zona : zonas[0];
  const tiendas = sucursales.filter((s) => s.zona === zona);
  const ids = tiendas.map((t) => t.id);
  const supervisor = tiendas.find((t) => t.supervisor)?.supervisor ?? "Sin supervisor";

  const [{ data: p }, { data: g }, { data: hs }] = await Promise.all([
    ids.length ? supabase.from("preventivos").select("*").in("sucursal_id", ids).eq("hecho", false).lte("fecha", sumarDias(h, 30)).order("fecha") : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("v_gastos").select("sucursal_id, monto").in("sucursal_id", ids).gte("fecha", ini).lt("fecha", fin) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("hojas_servicio").select("sucursal_id, creada, equipo, falla").in("sucursal_id", ids).order("creada", { ascending: false }).limit(300) : Promise.resolve({ data: [] }),
  ]);
  const prevs = (p ?? []) as Preventivo[];
  const filas = tiendas.map((t) => {
    const pend = prevs.filter((x) => x.sucursal_id === t.id);
    const venc = pend.filter((x) => estadoPreventivo(x, h).texto === "Vencido");
    const gasto = ((g ?? []) as { sucursal_id: number; monto: number }[]).filter((x) => x.sucursal_id === t.id).reduce((s, x) => s + Number(x.monto), 0);
    const hojas = ((hs ?? []) as { sucursal_id: number; creada: string; equipo: string; falla: string }[]).filter((x) => x.sucursal_id === t.id);
    const delMes = hojas.filter((x) => x.creada.slice(0, 7) === mes).length;
    return { t, pend, venc, gasto, delMes, ultima: hojas[0] };
  });
  const tot = {
    gasto: filas.reduce((s, x) => s + x.gasto, 0),
    venc: filas.reduce((s, x) => s + x.venc.length, 0),
    pend: filas.reduce((s, x) => s + x.pend.length, 0),
    hojas: filas.reduce((s, x) => s + x.delMes, 0),
  };

  const texto =
    `Pendientes de mantenimiento · ${zona} (${supervisor}) · corte ${fCorta(h)}\n\n` +
    filas
      .filter((x) => x.pend.length)
      .map((x) => `${x.t.nombre}\n` + x.pend.map((p) => `  - ${fCorta(p.fecha)}: ${p.tarea} (${p.equipo})${estadoPreventivo(p, h).texto === "Vencido" ? " [VENCIDO]" : ""}`).join("\n"))
      .join("\n\n") +
    `\n\nGasto de la zona en ${nombreMes(mes)}: ${mxn(tot.gasto)}`;

  return (
    <main className="wrap">
      <Seccion
        eyebrow="Panel de mantenimiento"
        titulo="Sucursales"
        sub="Ubicación, estado y pendientes de cada tienda; por zona, listo para la junta con su supervisor."
        vistas={vistasSucursales()}
        activa="zonas"
      />

      <div className="zona-barra">
        <div>
          <h2 className="zona-tit">{zona}</h2>
          <p className="sub" style={{ margin: 0 }}>Supervisor: <b>{supervisor}</b> · {tiendas.length} tienda{tiendas.length !== 1 ? "s" : ""}</p>
        </div>
        <form method="get" className="zona-sel">
          <select id="s-zona" name="zona" defaultValue={zona} aria-label="Zona">{zonas.map((z) => <option key={z}>{z}</option>)}</select>
          <button className="btn" type="submit">Ver zona</button>
        </form>
      </div>

      <div className="kpis">
        <div className="kpi"><span className="eyebrow">Gasto de la zona</span><span className="v">{mxn(tot.gasto)}</span><span className="s">{nombreMes(mes)}</span></div>
        <div className="kpi"><span className="eyebrow">Preventivos vencidos</span><span className="v" style={{ color: tot.venc ? "var(--bad)" : "var(--ok)" }}>{tot.venc}</span><span className="s">Por reprogramar</span></div>
        <div className="kpi"><span className="eyebrow">Próximos 30 días</span><span className="v">{tot.pend - tot.venc}</span><span className="s">Preventivos programados</span></div>
        <div className="kpi"><span className="eyebrow">Hojas del mes</span><span className="v">{tot.hojas}</span><span className="s">Servicios realizados</span></div>
      </div>

      <div className="toolbar" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 17 }}>Tiendas de la zona</h3>
        <CopiarTexto texto={texto} etiqueta="Copiar pendientes para la junta" />
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Tienda</th><th>Pendientes (30 días)</th><th className="r">Vencidos</th><th className="r">Hojas del mes</th><th className="r">Gasto del mes</th><th>Último servicio</th></tr></thead>
          <tbody>
            {filas.map((x) => (
              <tr key={x.t.id}>
                <td><b>{x.t.nombre}</b>{x.t.lat != null && x.t.lng != null && <><br /><a className="llegar" href={enlaceComoLlegar({ lat: x.t.lat, lng: x.t.lng })} target="_blank" rel="noopener noreferrer">Cómo llegar ↗</a></>}</td>
                <td>{x.pend.length ? x.pend.map((p) => <small key={p.id} style={{ display: "block" }}>{fCorta(p.fecha)} · {p.tarea}</small>) : <small style={{ color: "var(--muted)" }}>Sin pendientes</small>}</td>
                <td className="r"><span className={`pill ${x.venc.length ? "bad" : "ok"}`}>{x.venc.length}</span></td>
                <td className="r num">{x.delMes}</td>
                <td className="r num">{mxn(x.gasto)}</td>
                <td>{x.ultima ? <><span className="num">{fCorta(x.ultima.creada)}</span><br /><small style={{ color: "var(--muted)" }}>{x.ultima.equipo}</small></> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
