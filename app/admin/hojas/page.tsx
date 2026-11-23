import Link from "next/link";
import BuscarEnLista from "@/components/BuscarEnLista";
import IconoUI from "@/components/IconoUI";
import { Estado } from "@/components/Insignias";
import Kpi from "@/components/Kpi";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fecha, folio, mxn } from "@/lib/format";
import { nombreMes } from "@/lib/panel";
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

  const [{ data, error }, { data: tecnicos }, vistas] = await Promise.all([
    q,
    supabase.from("perfiles").select("id, nombre").order("nombre"),
    vistasServicio(supabase),
  ]);
  const hojas = (data ?? []) as Hoja[];
  // Reportes de tiendas que cerró cada hoja
  const { data: tks } = hojas.length
    ? await supabase.from("tickets").select("id, folio, hoja_id").in("hoja_id", hojas.map((h) => h.id))
    : { data: [] as { id: string; folio: number; hoja_id: string }[] };
  const reporteDe = new Map<string, { id: string; folio: number }>((tks ?? []).map((t) => [t.hoja_id as string, { id: t.id as string, folio: t.folio as number }]));

  const total = hojas.reduce((s, h) => s + Number(h.total), 0);
  const prev = hojas.filter((h) => h.tipo === "Preventivo");
  const porRevisar = hojas.filter((h) => h.estado === "Enviada").length;
  const porSuc = new Map<string, number>();
  hojas.forEach((h) => porSuc.set(h.sucursal, (porSuc.get(h.sucursal) ?? 0) + Number(h.total)));
  const top = Array.from(porSuc.entries()).sort((a, b) => b[1] - a[1])[0];
  const hayFiltros = !!(f.tecnico || f.estado || f.tipo);
  const limpiar = `/admin/hojas?${new URLSearchParams({ ...(f.mes ? { mes: f.mes } : {}), ...(f.zona ? { zona: f.zona } : {}) })}`;
  const conFiltro = (extra: Record<string, string>) => `/admin/hojas?${new URLSearchParams({ ...(f.mes ? { mes: f.mes } : {}), ...(f.zona ? { zona: f.zona } : {}), ...extra })}`;

  return (
    <main className="wrap srv">
      <Seccion
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

      <div className="rz-kpis srv-kpis">
        <Kpi icono="hojas" tono="info" titulo={`Hojas de ${nombreMes(mes)}`} valor={hojas.length}
          detalle={`${prev.length} preventivas · ${hojas.length - prev.length} correctivas`} />
        <Kpi icono="dinero" tono="marca" titulo="Costo registrado" valor={mxn(total)} detalle="Refacciones y mano de obra" />
        <Kpi href={conFiltro({ estado: "Enviada" })} icono="check" tono="warn" titulo="Por revisar" valor={porRevisar} alerta={porRevisar > 0}
          detalle={porRevisar ? "esperan tu visto bueno" : "Todas revisadas"} />
        <Kpi icono="sucursales" tono="ok" titulo="Sucursal con más costo" valor={<span className="srv-kpi-txt">{top ? top[0] : "—"}</span>}
          detalle={top ? mxn(top[1]) : "Sin hojas"} />
      </div>

      {/* El mes y la zona se eligen en la barra superior; aquí se conservan para no perderlos al filtrar. */}
      <form className="srv-filtros" method="get">
        {f.mes && <input type="hidden" name="mes" value={f.mes} />}
        {f.zona && <input type="hidden" name="zona" value={f.zona} />}
        <label className="field">Técnico
          <select name="tecnico" defaultValue={f.tecnico ?? ""}>
            <option value="">Todos</option>
            {(tecnicos ?? []).map((t) => <option key={t.id as string} value={t.id as string}>{t.nombre as string}</option>)}
          </select>
        </label>
        <label className="field">Tipo
          <select name="tipo" defaultValue={f.tipo ?? ""}>
            <option value="">Todos</option><option>Correctivo</option><option>Preventivo</option>
          </select>
        </label>
        <label className="field">Estado
          <select name="estado" defaultValue={f.estado ?? ""}>
            <option value="">Todos</option><option>Enviada</option><option>Revisada</option>
          </select>
        </label>
        <button className="btn" type="submit">Aplicar</button>
        {hayFiltros && <Link className="btn ghost" href={limpiar}>Quitar filtros</Link>}
        {hojas.length > 0 && <BuscarEnLista objetivo="srv-hojas" placeholder="Folio, sucursal, equipo o técnico" etiqueta="Buscar hojas" />}
      </form>

      {error ? (
        <div className="ui-error"><b>No se pudieron cargar las hojas</b><p>Esto no significa que no haya hojas. Recarga la página para intentarlo de nuevo.</p></div>
      ) : hojas.length ? (
        <div className="tbl-wrap">
          <table className="tbl-cards">
            <thead>
              <tr><th>Folio</th><th>Fecha</th><th>Sucursal</th><th>Equipo</th><th>Tipo</th><th>Técnico</th><th>Reporte</th><th className="r">Total</th><th>Estado</th><th><span className="sr-only">Acción</span></th></tr>
            </thead>
            <tbody id="srv-hojas">
              {hojas.map((h) => {
                const rep = reporteDe.get(h.id);
                return (
                  <tr key={h.id} data-buscar={`${folio(h.folio)} ${h.folio} ${h.sucursal} ${h.zona} ${h.equipo} ${h.tecnico} ${h.tipo} ${rep ? folioTicket(rep.folio) : ""}`}>
                    <td data-label="Folio" className="num"><Link href={`/admin/hojas/${h.id}`}><b>{folio(h.folio)}</b></Link></td>
                    <td data-label="Fecha" className="num">{fecha(h.creada)}</td>
                    <td data-label="Sucursal"><b>{h.sucursal}</b><small className="srv-sub">{h.zona}</small></td>
                    <td data-label="Equipo">{h.equipo}</td>
                    <td data-label="Tipo"><Estado tono={h.tipo === "Preventivo" ? "ok" : "warn"}>{h.tipo}</Estado></td>
                    <td data-label="Técnico">{h.tecnico}</td>
                    <td data-label="Reporte" className="num">
                      {rep ? <Link className="srv-tk" href={`/admin/tickets/${rep.id}`}>{folioTicket(rep.folio)}</Link> : h.ticket ? `#${h.ticket}` : "—"}
                    </td>
                    <td data-label="Total" className="r num">{mxn(Number(h.total))}</td>
                    <td data-label="Estado"><Estado tono={h.estado === "Revisada" ? "ok" : "warn"}>{h.estado}</Estado></td>
                    <td className="srv-acc">
                      <Link className={`btn small${h.estado === "Enviada" ? " primary" : ""}`} href={`/admin/hojas/${h.id}`}>
                        {h.estado === "Enviada" ? "Revisar" : "Ver"}<IconoUI nombre="derecha" tam={14} grosor={2.2} />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ui-vacio">
          <b>Sin hojas con estos filtros</b>
          <p>Cambia el mes o la zona en la barra superior, o quita filtros. Las hojas aparecen aquí en cuanto un técnico las envía.</p>
          {hayFiltros && <Link className="btn small" href={limpiar}>Quitar filtros</Link>}
        </div>
      )}
    </main>
  );
}
