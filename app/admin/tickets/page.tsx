import Link from "next/link";
import ActivarAvisos from "@/components/ActivarAvisos";
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

  const conteo = (clave: (t: Fila) => string) => {
    const m = new Map<string, number>();
    mes.forEach((t) => m.set(clave(t), (m.get(clave(t)) ?? 0) + 1));
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5);
  };
  const cuentas: Record<string, number> = {
    abiertos: abiertos.length,
    sin_asignar: abiertos.filter((t) => t.estado === "abierto").length,
    por_revisar: porRevisar.length,
  };
  const porSucursal = conteo((t) => t.sucursales?.nombre ?? "—");
  const porEquipo = conteo((t) => t.equipo);

  return (
    <main className="wrap">
      <Seccion
        eyebrow="Panel de mantenimiento"
        titulo="Servicio"
        sub="Las tiendas reportan desde el QR del equipo; el técnico lo atiende y su hoja de servicio cierra el reporte."
        vistas={vistas}
        activa="reportes"
        acciones={<ActivarAvisos />}
      />

      <div className="tkb-kpis">
        <div className={`tkb-k ${abiertos.length ? "" : "cero"}`}><span>Abiertos</span><b className="num">{abiertos.length}</b><small>{abiertos.filter((t) => t.estado === "abierto").length} sin asignar</small></div>
        <div className={`tkb-k ${abiertos.some((t) => t.prioridad === "alta") ? "alerta" : "cero"}`}><span>Urgentes</span><b className="num">{abiertos.filter((t) => t.prioridad === "alta").length}</b><small>no pueden vender</small></div>
        <div className={`tkb-k ${vencidos ? "alerta" : "cero"}`}><span>Fuera de tiempo</span><b className="num">{vencidos}</b><small>meta 6 h · 24 h · 72 h</small></div>
        <div className="tkb-k"><span>Resolución media</span><b className="num">{promedio === null ? "—" : duracion(promedio)}</b><small>{aTiempo === null ? "últimos 30 días" : `${aTiempo}% a tiempo · 30 días`}</small></div>
      </div>

      <div className={`tkb-grid${sel ? " con-panel" : ""}`}>
        <section>
          <nav className="tkb-filtros" aria-label="Filtro">
            {FILTROS.map(([k, n]) => (
              <Link key={k} href={`/admin/tickets?f=${k}`} aria-current={f === k ? "page" : undefined}>
                {n}{cuentas[k] ? ` · ${cuentas[k]}` : ""}
              </Link>
            ))}
          </nav>
          {f === "por_revisar" ? (
            porRevisar.length === 0 ? (
              <div className="tkb-vacio card">
                <b>Sin hojas por revisar</b>
                <span className="sub">Cuando un técnico envíe una hoja de servicio, aparecerá aquí para tu visto bueno.</span>
              </div>
            ) : (
              <ul className="tkb-lista">
                {porRevisar.map((x) => (
                  <li key={x.id}>
                    <Link href={`/admin/hojas/${x.id}`} className={`tkb-item ${x.tipo === "Correctivo" ? "p-media" : "p-baja"}`}>
                      <div className="tkb-l1">
                        <span className="num tkb-folio">Hoja #{x.folio}</span>
                        <span className="pill warn">Por revisar</span>
                        <span className="pill neutral">{x.tipo}</span>
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
            <div className="tkb-vacio card">
              <b>{f === "abiertos" ? "Sin reportes abiertos" : f === "sin_asignar" ? "Todos los reportes tienen técnico" : "Sin reportes en los últimos 30 días"}</b>
              <span className="sub">Cuando una tienda escanee el QR de un equipo y reporte una falla, aparecerá aquí y te llegará una notificación.</span>
            </div>
          ) : (
            <ul className="tkb-lista">
              {lista.map((t) => {
                const tm = tiempo(t, ahora);
                return (
                  <li key={t.id}>
                    <Link href={`/admin/tickets?f=${f}&sel=${t.id}`} scroll={false} className={`tkb-item p-${t.prioridad}`} aria-current={sel === t.id ? "true" : undefined}>
                      <div className="tkb-l1">
                        <span className="num tkb-folio">{folioTicket(t.folio)}</span>
                        <span className={`pill ${ESTADOS[t.estado].clase}`}>{ESTADOS[t.estado].nombre}</span>
                        {ABIERTOS.includes(t.estado) && <span className={`pill ${PRIORIDAD[t.prioridad].clase}`}>{PRIORIDAD[t.prioridad].nombre}</span>}
                        <span className={`tkb-t ${tm.vencido ? "bad" : tm.proximo ? "warn" : ""}`}>
                          {ABIERTOS.includes(t.estado) ? `hace ${hace(t.creado, ahora)}` : `en ${duracion(tm.horas)}`}
                        </span>
                      </div>
                      <b className="tkb-tit">{t.sucursales?.nombre} · {t.equipo}</b>
                      <span className="tkb-l3">
                        {t.sintoma} · {VENDER[t.puede_vender].titulo}
                        {t.fotos.length > 0 && ` · 📷 ${t.fotos.length}`}
                        {t.tecnico_id && ` · ${nombreTec.get(t.tecnico_id) ?? "Técnico"}`}
                        {t.hoja_id && " · con hoja de servicio"}
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
          <div className="card">
            <h3>Tiendas que más reportan</h3>
            <p className="sub">Últimos 30 días</p>
            {porSucursal.length ? (
              <ol className="tkb-top">
                {porSucursal.map(([n, c]) => <li key={n}><span>{n}</span><b className="num">{c}</b></li>)}
              </ol>
            ) : <p className="sub">Sin datos todavía.</p>}
          </div>
          <div className="card">
            <h3>Equipos más reportados</h3>
            <p className="sub">Últimos 30 días</p>
            {porEquipo.length ? (
              <ol className="tkb-top">
                {porEquipo.map(([n, c]) => <li key={n}><span>{n}</span><b className="num">{c}</b></li>)}
              </ol>
            ) : <p className="sub">Sin datos todavía.</p>}
          </div>
        </aside>
        )}
      </div>
    </main>
  );
}
