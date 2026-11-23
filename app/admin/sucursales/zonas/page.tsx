import CopiarTexto from "@/components/CopiarTexto";
import { Estado } from "@/components/Insignias";
import Kpi from "@/components/Kpi";
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
        titulo="Sucursales"
        sub="Ubicación, estado y pendientes de cada tienda; por zona, listo para la junta con su supervisor."
        vistas={vistasSucursales()}
        activa="zonas"
      />

      <div className="zona-barra">
        <div>
          <h2 className="zona-tit">{zona}</h2>
          <p className="sub eqp-cab-s">Supervisor: <b>{supervisor}</b> · {tiendas.length} tienda{tiendas.length !== 1 ? "s" : ""}</p>
        </div>
        <form method="get" className="zona-sel">
          <select id="s-zona" name="zona" defaultValue={zona} aria-label="Zona">{zonas.map((z) => <option key={z}>{z}</option>)}</select>
          <button className="btn" type="submit">Ver zona</button>
        </form>
      </div>

      <div className="rz-kpis srv-kpis">
        <Kpi icono="dinero" tono="marca" titulo="Gasto de la zona" valor={mxn(tot.gasto)} detalle={nombreMes(mes)} />
        <Kpi href={`/admin/preventivos?estado=Vencido&zona=${encodeURIComponent(zona)}`} icono="reloj" tono="bad" titulo="Preventivos vencidos" valor={tot.venc} alerta={tot.venc > 0} detalle={tot.venc ? "por reprogramar" : "Nada vencido"} />
        <Kpi icono="preventivos" tono="info" titulo="Próximos 30 días" valor={tot.pend - tot.venc} detalle="preventivos programados" />
        <Kpi icono="hojas" tono="ok" titulo="Hojas del mes" valor={tot.hojas} detalle="servicios realizados" />
      </div>

      <div className="prv-barra">
        <h2 className="ref-h">Tiendas de la zona</h2>
        <CopiarTexto texto={texto} etiqueta="Copiar pendientes para la junta" />
      </div>
      <div className="tbl-wrap">
        <table className="tbl-cards">
          <thead><tr><th>Tienda</th><th>Pendientes (30 días)</th><th className="r">Vencidos</th><th className="r">Hojas del mes</th><th className="r">Gasto del mes</th><th>Último servicio</th></tr></thead>
          <tbody>
            {filas.map((x) => (
              <tr key={x.t.id}>
                <td data-label="Tienda"><b>{x.t.nombre}</b>{x.t.lat != null && x.t.lng != null && <a className="llegar srv-sub" href={enlaceComoLlegar({ lat: x.t.lat, lng: x.t.lng })} target="_blank" rel="noopener noreferrer">Cómo llegar ↗</a>}</td>
                <td data-label="Pendientes (30 días)">{x.pend.length ? x.pend.map((p) => <small key={p.id} className="srv-sub zona-pend">{fCorta(p.fecha)} · {p.tarea}</small>) : <small className="srv-sub">Sin pendientes</small>}</td>
                <td data-label="Vencidos" className="r"><Estado tono={x.venc.length ? "bad" : "ok"}>{x.venc.length}</Estado></td>
                <td data-label="Hojas del mes" className="r num">{x.delMes}</td>
                <td data-label="Gasto del mes" className="r num">{mxn(x.gasto)}</td>
                <td data-label="Último servicio">{x.ultima ? <><span className="num">{fCorta(x.ultima.creada)}</span><small className="srv-sub">{x.ultima.equipo}</small></> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
