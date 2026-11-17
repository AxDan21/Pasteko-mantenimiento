import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fecha, folio, mxn } from "@/lib/format";
import type { Hoja } from "@/lib/types";
import Seccion from "@/components/Seccion";
import { vistasServicio } from "@/lib/secciones";
import { folioTicket } from "@/lib/tickets";

type Filtros = { mes?: string; zona?: string; tecnico?: string; estado?: string; tipo?: string };

function rangoMes(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  const ini = new Date(Date.UTC(y, m - 1, 1, 6)); // 00:00 en Ciudad de México
  const fin = new Date(Date.UTC(y, m, 1, 6));
  return [ini.toISOString(), fin.toISOString()];
}

export default async function PanelHojas({ searchParams }: { searchParams: Promise<Filtros> }) {
  await requireAdmin();
  const f = await searchParams;
  const hoy = new Date();
  const mesActual = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(hoy);
  const mes = /^\d{4}-\d{2}$/.test(f.mes ?? "") ? f.mes! : mesActual;
  const [ini, fin] = rangoMes(mes);

  const supabase = await createClient();
  let q = supabase
    .from("v_hojas")
    .select("id, folio, creada, sucursal, zona, tecnico, tecnico_id, equipo, tipo, ticket, total, estado")
    .gte("creada", ini)
    .lt("creada", fin)
    .order("creada", { ascending: false });
  if (f.zona) q = q.eq("zona", f.zona);
  if (f.tecnico) q = q.eq("tecnico_id", f.tecnico);
  if (f.estado) q = q.eq("estado", f.estado);
  if (f.tipo) q = q.eq("tipo", f.tipo);

  const [{ data }, { data: zonas }, { data: tecnicos }, vistas] = await Promise.all([
    q,
    supabase.from("sucursales").select("zona").order("zona"),
    supabase.from("perfiles").select("id, nombre").order("nombre"),
    vistasServicio(supabase),
  ]);
  const hojas = (data ?? []) as Hoja[];
  // Reportes de tiendas que cerró cada hoja
  const { data: tks } = hojas.length
    ? await supabase.from("tickets").select("id, folio, hoja_id").in("hoja_id", hojas.map((h) => h.id))
    : { data: [] as { id: string; folio: number; hoja_id: string }[] };
  const reporteDe = new Map<string, { id: string; folio: number }>((tks ?? []).map((t) => [t.hoja_id as string, { id: t.id as string, folio: t.folio as number }]));
  const listaZonas = Array.from(new Set((zonas ?? []).map((z) => z.zona as string)));

  const total = hojas.reduce((s, h) => s + Number(h.total), 0);
  const prev = hojas.filter((h) => h.tipo === "Preventivo");
  const porRevisar = hojas.filter((h) => h.estado === "Enviada").length;
  const porSuc = new Map<string, number>();
  hojas.forEach((h) => porSuc.set(h.sucursal, (porSuc.get(h.sucursal) ?? 0) + Number(h.total)));
  const top = Array.from(porSuc.entries()).sort((a, b) => b[1] - a[1])[0];

  return (
    <>
      <main className="wrap">
        <Seccion
          eyebrow="Panel de mantenimiento"
          titulo="Servicio"
          sub="Las tiendas reportan desde el QR del equipo; el técnico lo atiende y su hoja de servicio cierra el reporte."
          vistas={vistas}
          activa="hojas"
          acciones={
            <a className="btn" href={`/admin/exportar?${new URLSearchParams({ ...f, mes } as Record<string, string>).toString()}`}>
              Descargar CSV
            </a>
          }
        />

        <div className="kpis">
          <div className="kpi"><span className="eyebrow">Hojas del mes</span><span className="v">{hojas.length}</span><span className="s">{prev.length} preventivas · {hojas.length - prev.length} correctivas</span></div>
          <div className="kpi"><span className="eyebrow">Costo registrado</span><span className="v">{mxn(total)}</span><span className="s">Refacciones y mano de obra</span></div>
          <div className="kpi"><span className="eyebrow">Por revisar</span><span className="v" style={{ color: porRevisar ? "var(--warn)" : "var(--ok)" }}>{porRevisar}</span><span className="s">Hojas sin marcar como revisadas</span></div>
          <div className="kpi"><span className="eyebrow">Sucursal con más costo</span><span className="v" style={{ fontSize: 20 }}>{top ? top[0] : "—"}</span><span className="s">{top ? mxn(top[1]) : "Sin hojas"}</span></div>
        </div>

        <form className="toolbar" method="get">
          <label className="field">Mes<input id="f-mes" type="month" name="mes" defaultValue={mes} /></label>
          <label className="field">Zona
            <select id="f-zona" name="zona" defaultValue={f.zona ?? ""}>
              <option value="">Todas</option>
              {listaZonas.map((z) => <option key={z}>{z}</option>)}
            </select>
          </label>
          <label className="field">Técnico
            <select id="f-tec" name="tecnico" defaultValue={f.tecnico ?? ""}>
              <option value="">Todos</option>
              {(tecnicos ?? []).map((t) => <option key={t.id as string} value={t.id as string}>{t.nombre as string}</option>)}
            </select>
          </label>
          <label className="field">Tipo
            <select id="f-tipo" name="tipo" defaultValue={f.tipo ?? ""}>
              <option value="">Todos</option><option>Correctivo</option><option>Preventivo</option>
            </select>
          </label>
          <label className="field">Estado
            <select id="f-estado" name="estado" defaultValue={f.estado ?? ""}>
              <option value="">Todos</option><option>Enviada</option><option>Revisada</option>
            </select>
          </label>
          <button className="btn primary" type="submit">Filtrar</button>
        </form>

        {hojas.length ? (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr><th>Folio</th><th>Fecha</th><th>Sucursal</th><th>Equipo</th><th>Tipo</th><th>Técnico</th><th>Reporte</th><th className="r">Total</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {hojas.map((h) => (
                  <tr key={h.id}>
                    <td className="num"><Link href={`/admin/hojas/${h.id}`}><b>{folio(h.folio)}</b></Link></td>
                    <td className="num">{fecha(h.creada)}</td>
                    <td><b>{h.sucursal}</b><br /><small style={{ color: "var(--muted)" }}>{h.zona}</small></td>
                    <td>{h.equipo}</td>
                    <td><span className={`pill ${h.tipo === "Preventivo" ? "neutral" : "warn"}`}>{h.tipo}</span></td>
                    <td>{h.tecnico}</td>
                    <td className="num">
                      {reporteDe.get(h.id) ? (
                        <Link className="pill info hoja-tk" href={`/admin/tickets/${reporteDe.get(h.id)!.id}`}>{folioTicket(reporteDe.get(h.id)!.folio)}</Link>
                      ) : h.ticket ? `#${h.ticket}` : "—"}
                    </td>
                    <td className="r num">{mxn(Number(h.total))}</td>
                    <td><span className={`pill ${h.estado === "Revisada" ? "ok" : "neutral"}`}>{h.estado}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card"><h3>Sin hojas con estos filtros</h3><p className="sub">Cambia el mes o quita filtros. Las hojas aparecen aquí en cuanto un técnico las envía.</p></div>
        )}
      </main>
    </>
  );
}
