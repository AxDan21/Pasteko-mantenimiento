import Link from "next/link";
import ActivarAvisos from "@/components/ActivarAvisos";
import BuscarEnLista from "@/components/BuscarEnLista";
import { Anillo, BarrasH } from "@/components/Graficas";
import IconoUI from "@/components/IconoUI";
import { Estado, Prioridad } from "@/components/Insignias";
import Kpi from "@/components/Kpi";
import PanelTicket from "@/components/PanelTicket";
import Seccion from "@/components/Seccion";
import { vistasServicio } from "@/lib/secciones";
import { mxn } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { ABIERTOS, ESTADOS, PRIORIDAD, VENDER, duracion, folioTicket, hace, tiempo, type Ticket } from "@/lib/tickets";

export const dynamic = "force-dynamic";

type Fila = Ticket & { sucursales: { nombre: string; zona: string } | null };
const FILTROS = [
  ["abiertos", "Abiertos"],
  ["sin_asignar", "Sin asignar"],
  ["por_revisar", "Hojas por revisar"],
  ["resueltos", "Resueltos"],
  ["todos", "Todos"],
] as const;
type HojaRev = { id: string; folio: number; creada: string; sucursal: string; tecnico: string | null; equipo: string; tipo: string; total: number };

export default async function MesaDeAyuda({ searchParams }: { searchParams: Promise<{ f?: string; sel?: string }> }) {
  const { f = "abiertos", sel } = await searchParams;
  const supabase = await createClient();
  const desde = new Date(Date.now() - 30 * 864e5).toISOString();
  const [{ data: abiertosD }, { data: recientes }, { data: tecnicos }, vistas, { data: revD }] = await Promise.all([
    supabase.from("tickets").select("*, sucursales(nombre, zona)").in("estado", ABIERTOS),
    supabase.from("tickets").select("*, sucursales(nombre, zona)").gte("creado", desde).order("creado", { ascending: false }),
    supabase.from("perfiles").select("id, nombre"),
    vistasServicio(supabase),
    supabase.from("v_hojas").select("id, folio, creada, sucursal, tecnico, equipo, tipo, total").eq("estado", "Enviada").order("creada", { ascending: false }),
  ]);
  const porRevisar = (revD ?? []) as HojaRev[];
  const abiertos = (abiertosD ?? []) as Fila[];
  const mes = (recientes ?? []) as Fila[];
  const nombreTec = new Map((tecnicos ?? []).map((p) => [p.id as string, (p.nombre as string).split(" ")[0]]));
  const ahora = Date.now();

  const peso = { alta: 0, media: 1, baja: 2 } as const;
  const lista: Fila[] =
    f === "abiertos"
      ? [...abiertos].sort((a, b) => peso[a.prioridad] - peso[b.prioridad] || +new Date(a.creado) - +new Date(b.creado))
      : f === "sin_asignar"
        ? abiertos.filter((t) => t.estado === "abierto").sort((a, b) => peso[a.prioridad] - peso[b.prioridad] || +new Date(a.creado) - +new Date(b.creado))
      : f === "resueltos"
        ? mes.filter((t) => !ABIERTOS.includes(t.estado))
        : mes;

  const cerrados = mes.filter((t) => t.estado === "resuelto" && t.resuelto_en);
  const promedio = cerrados.length ? cerrados.reduce((n, t) => n + tiempo(t).horas, 0) / cerrados.length : null;
  const aTiempo = cerrados.length ? Math.round((cerrados.filter((t) => tiempo(t).horas <= tiempo(t).meta).length / cerrados.length) * 100) : null;
  const vencidos = abiertos.filter((t) => tiempo(t, ahora).vencido).length;
  const urgentes = abiertos.filter((t) => t.prioridad === "alta").length;
  const sinTecnico = abiertos.filter((t) => t.estado === "abierto").length;

  const conteo = (clave: (t: Fila) => string) => {
    const m = new Map<string, number>();
    mes.forEach((t) => m.set(clave(t), (m.get(clave(t)) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5);
  };
  const cuentas: Record<string, number> = { abiertos: abiertos.length, sin_asignar: sinTecnico, por_revisar: porRevisar.length };
  const porSucursal = conteo((t) => t.sucursales?.nombre ?? "—");
  const porEquipo = conteo((t) => t.equipo);
  const vacio = f === "por_revisar" ? porRevisar.length === 0 : lista.length === 0;

  return (
    <main className="wrap srv">
      <Seccion
        titulo="Servicio"
        sub="Las tiendas reportan desde el QR del equipo; el técnico lo atiende y su hoja de servicio cierra el reporte."
        vistas={vistas}
        activa="reportes"
        acciones={<ActivarAvisos />}
      />

      <div className="rz-kpis srv-kpis">
        <Kpi href="/admin/tickets?f=abiertos" icono="servicio" tono="info" titulo="Abiertos" valor={abiertos.length}
          detalle={abiertos.length ? `${sinTecnico} sin técnico` : "Nada pendiente"} />
        <Kpi href="/admin/tickets?f=abiertos" icono="falla" tono="bad" titulo="Urgentes" valor={urgentes} alerta={urgentes > 0}
          detalle={urgentes ? "la tienda no puede vender" : "Ninguno detiene la venta"} />
        <Kpi icono="reloj" tono="warn" titulo="Fuera de tiempo" valor={vencidos} alerta={vencidos > 0}
          detalle="metas: urgente 6 h · media 24 h · baja 72 h" />
        <Kpi icono="check" tono="ok" titulo="Resolución media" valor={promedio === null ? "—" : duracion(promedio)}
          detalle={aTiempo === null ? "sin resueltos en 30 días" : `${aTiempo}% a tiempo · 30 días`}
          grafica={aTiempo !== null && <Anillo pct={aTiempo} color={aTiempo >= 80 ? "var(--ok-fuerte)" : aTiempo >= 60 ? "var(--chart-3)" : "var(--bad)"} tam={56} grosor={7}><b className="num">{aTiempo}%</b></Anillo>} />
      </div>

      <div className={`tkb-grid${sel ? " con-panel" : ""}`}>
        <section aria-label="Reportes">
          <div className="srv-barra">
            <nav className="tkb-filtros" aria-label="Filtro">
              {FILTROS.map(([k, n]) => (
                <Link key={k} href={`/admin/tickets?f=${k}`} aria-current={f === k ? "page" : undefined}>
                  {n}{cuentas[k] ? <span className="srv-n">{cuentas[k]}</span> : null}
                </Link>
              ))}
            </nav>
            {!vacio && <BuscarEnLista key={f} objetivo="srv-lista" placeholder="Folio, sucursal, equipo, síntoma o técnico" etiqueta="Buscar reportes" />}
          </div>

          {f === "por_revisar" ? (
            porRevisar.length === 0 ? (
              <div className="ui-vacio">
                <b>Sin hojas por revisar</b>
                <p>Cuando un técnico envíe una hoja de servicio, aparecerá aquí para tu visto bueno.</p>
              </div>
            ) : (
              <ul className="tkb-lista" id="srv-lista">
                {porRevisar.map((x) => (
                  <li key={x.id} data-buscar={`${x.folio} ${x.sucursal} ${x.equipo} ${x.tecnico ?? ""} ${x.tipo}`}>
                    <Link href={`/admin/hojas/${x.id}`} className={`tkb-item ${x.tipo === "Correctivo" ? "p-media" : "p-baja"}`}>
                      <div className="tkb-l1">
                        <span className="num tkb-folio">Hoja #{x.folio}</span>
                        <Estado tono="warn">Por revisar</Estado>
                        <Estado tono="neutral">{x.tipo}</Estado>
                        <span className="tkb-t">hace {hace(x.creada, ahora)}</span>
                      </div>
                      <b className="tkb-tit">{x.sucursal} · {x.equipo}</b>
                      <span className="tkb-l3">{x.tecnico ?? "Técnico"} · <span className="num">{mxn(Number(x.total))}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )
          ) : lista.length === 0 ? (
            <div className="ui-vacio">
              <b>{f === "abiertos" ? "Sin reportes abiertos" : f === "sin_asignar" ? "Todos los reportes tienen técnico" : "Sin reportes en los últimos 30 días"}</b>
              <p>Cuando una tienda escanee el QR de un equipo y reporte una falla, aparecerá aquí y te llegará una notificación.</p>
            </div>
          ) : (
            <ul className="tkb-lista" id="srv-lista">
              {lista.map((t) => {
                const tm = tiempo(t, ahora);
                const abierto = ABIERTOS.includes(t.estado);
                const tec = t.tecnico_id ? nombreTec.get(t.tecnico_id) ?? "Técnico" : null;
                return (
                  <li key={t.id} data-buscar={`${folioTicket(t.folio)} ${t.sucursales?.nombre ?? ""} ${t.sucursales?.zona ?? ""} ${t.equipo} ${t.sintoma} ${tec ?? ""} ${ESTADOS[t.estado].nombre}`}>
                    <Link href={`/admin/tickets?f=${f}&sel=${t.id}`} scroll={false} className={`tkb-item p-${t.prioridad}`} aria-current={sel === t.id ? "true" : undefined}>
                      <div className="tkb-l1">
                        <span className="num tkb-folio">{folioTicket(t.folio)}</span>
                        <Estado tono={ESTADOS[t.estado].clase}>{ESTADOS[t.estado].nombre}</Estado>
                        {abierto && <Prioridad nivel={t.prioridad}>{PRIORIDAD[t.prioridad].nombre}</Prioridad>}
                        <span className={`tkb-t ${tm.vencido ? "bad" : tm.proximo ? "warn" : ""}`}>
                          {abierto ? <>{tm.vencido && <IconoUI nombre="reloj" tam={13} grosor={2.2} />} hace {hace(t.creado, ahora)}</> : `en ${duracion(tm.horas)}`}
                        </span>
                      </div>
                      <b className="tkb-tit">{t.sucursales?.nombre} · {t.equipo}</b>
                      <span className="tkb-l3">
                        <span>{t.sintoma} · {VENDER[t.puede_vender].titulo}</span>
                        {t.fotos.length > 0 && <span className="srv-meta"><IconoUI nombre="foto" tam={14} titulo="Fotos" /> {t.fotos.length}</span>}
                        <span className="srv-meta">{tec ? <><IconoUI nombre="personas" tam={14} /> {tec}</> : <b className="srv-sin">Sin técnico</b>}</span>
                        {t.hoja_id && <span className="srv-meta"><IconoUI nombre="hojas" tam={14} /> con hoja</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {sel ? <PanelTicket id={sel} cerrar={`/admin/tickets?f=${f}`} /> : (
          <aside className="tkb-lado">
            <section className="dcard rz-card" aria-labelledby="srv-tiendas">
              <header><div><h3 id="srv-tiendas">Tiendas que más reportan</h3><p>Últimos 30 días</p></div></header>
              {porSucursal.length ? (
                <BarrasH descripcion="Reportes por tienda en 30 días" datos={porSucursal.map(([n, c], i) => ({ etiqueta: n, valor: c, texto: String(c), color: i === 0 ? "var(--chart-1)" : "var(--brand-soft)" }))} />
              ) : <p className="sub">Sin reportes todavía.</p>}
            </section>
            <section className="dcard rz-card" aria-labelledby="srv-equipos">
              <header><div><h3 id="srv-equipos">Equipos más reportados</h3><p>Últimos 30 días</p></div></header>
              {porEquipo.length ? (
                <BarrasH descripcion="Reportes por equipo en 30 días" datos={porEquipo.map(([n, c], i) => ({ etiqueta: n, valor: c, texto: String(c), color: i === 0 ? "var(--bad)" : "var(--bad-soft)" }))} />
              ) : <p className="sub">Sin reportes todavía.</p>}
            </section>
          </aside>
        )}
      </div>
    </main>
  );
}
