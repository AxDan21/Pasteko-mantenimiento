import IconoUI from "@/components/IconoUI";
import { Estado, Prioridad } from "@/components/Insignias";
import Link from "next/link";
import BotonEnviar from "@/components/BotonEnviar";
import { asignarTecnico, cambiarEstado } from "@/app/admin/tickets/actions";
import { hoy } from "@/lib/panel";
import { createClient } from "@/lib/supabase/server";
import { ABIERTOS, ESTADOS, PRIORIDAD, VENDER, duracion, enlaceWhatsApp, folioTicket, hace, tiempo, type EventoTicket, type Ticket } from "@/lib/tickets";

const fmt = (s: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(s));

const PASOS = ["Reportado", "Asignado", "En camino", "Cerrado"];

/** Detalle compacto de un reporte junto a la lista de Servicio, con las acciones de siempre. */
export default async function PanelTicket({ id, cerrar }: { id: string; cerrar: string }) {
  const supabase = await createClient();
  const { data } = await supabase.from("tickets").select("*, sucursales(nombre, zona)").eq("id", id).maybeSingle();
  if (!data) {
    return (
      <aside className="tkp card" aria-label="Detalle del reporte">
        <p className="sub tkp-nota">No se encontró el reporte. Puede que se haya borrado.</p>
        <Link href={cerrar} className="btn small" scroll={false}>Cerrar</Link>
      </aside>
    );
  }
  const t = data as Ticket & { sucursales: { nombre: string; zona: string } | null };

  const [{ data: ev }, { data: tecnicos }, { data: hoja }, garantia] = await Promise.all([
    supabase.from("ticket_eventos").select("*").eq("ticket_id", id).order("creado", { ascending: false }).limit(4),
    supabase.from("perfiles").select("id, nombre, rol").in("rol", ["tecnico", "admin"]).eq("activo", true).order("nombre"),
    t.hoja_id ? supabase.from("hojas_servicio").select("id, folio, total").eq("id", t.hoja_id).maybeSingle() : Promise.resolve({ data: null }),
    t.activo_id ? supabase.from("activos").select("garantia_hasta").eq("id", t.activo_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const eventos = (ev ?? []) as EventoTicket[];
  const folio = folioTicket(t.folio);
  const tm = tiempo(t);
  const abierto = ABIERTOS.includes(t.estado);
  const tecnico = (tecnicos ?? []).find((p) => p.id === t.tecnico_id);
  const wa = enlaceWhatsApp(t.reporta_tel, `Hola ${t.reporta_nombre.split(" ")[0]}, soy de Mantenimiento. Sobre tu reporte ${folio} (${t.equipo}): `);
  const paso = t.estado === "abierto" ? 0 : t.estado === "asignado" ? 1 : t.estado === "en_proceso" ? 2 : 3;
  const hoyISO = hoy();
  const garantiaHasta = (garantia.data as { garantia_hasta: string | null } | null)?.garantia_hasta;
  const enGarantia = !!garantiaHasta && garantiaHasta >= hoyISO;

  return (
    <aside className={`tkp card p-${t.prioridad}`} aria-label={`Detalle del reporte ${folio}`}>
      <header className="tkp-cab">
        <div className="tkp-cab-t">
          <div className="tkb-l1">
            <span className="num tkb-folio">{folio}</span>
            <Estado tono={ESTADOS[t.estado].clase}>{ESTADOS[t.estado].nombre}</Estado>
            {abierto && <Prioridad nivel={t.prioridad}>{PRIORIDAD[t.prioridad].nombre}</Prioridad>}
          </div>
          <h2>{t.sucursales?.nombre} · {t.equipo}</h2>
          <p>{t.sintoma}</p>
        </div>
        <Link href={cerrar} className="tkp-x" scroll={false} aria-label="Cerrar detalle"><IconoUI nombre="cerrar" tam={20} /></Link>
      </header>

      <ol className="tkp-pasos" aria-label="Etapa del reporte">
        {PASOS.map((p, i) => (
          <li key={p} className={i < paso || (i === paso && !abierto) ? "hecho" : i === paso ? "ahora" : undefined} aria-current={i === paso ? "step" : undefined}>
            {i === 3 && t.estado === "cancelado" ? "Cancelado" : p}
          </li>
        ))}
      </ol>

      <div className={`tkp-reloj ${abierto && tm.vencido ? "bad" : abierto && tm.proximo ? "warn" : ""}`}>
        <b className="num">{duracion(tm.horas)}</b>
        <span>{abierto ? `abierto · meta ${tm.meta} h${tm.vencido ? " · fuera de tiempo" : ""}` : t.estado === "resuelto" ? "en resolverse" : "cancelado"}</span>
      </div>

      <dl className="tkd-datos">
        <div><dt>¿Pueden vender?</dt><dd className={t.puede_vender === "no" ? "tkp-mal" : undefined}>{VENDER[t.puede_vender].titulo}</dd></div>
        <div><dt>Reportó</dt><dd>{t.reporta_nombre} · hace {hace(t.creado)}</dd></div>
        <div><dt>Técnico</dt><dd>{tecnico?.nombre ?? "Sin asignar"}</dd></div>
        <div><dt>Equipo</dt><dd>{t.activo_id ? <Link href={`/admin/activos/${t.activo_id}`} className="num">{t.activo_id}</Link> : "Sin código"}</dd></div>
      </dl>
      {t.detalle && <p className="tkd-detalle">“{t.detalle}”</p>}
      {enGarantia && <p className="note warn tkp-nota">Equipo en garantía hasta el {garantiaHasta}: llama al proveedor antes de pagar una reparación.</p>}

      {abierto && (
        <form action={asignarTecnico} className="tkp-asignar">
          <input type="hidden" name="id" value={t.id} />
          <label className="field">
            {tecnico ? "Reasignar técnico" : "Asignar técnico"}
            <select name="tecnico" defaultValue={t.tecnico_id ?? ""} required>
              <option value="" disabled>Elige técnico</option>
              {(tecnicos ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.rol === "admin" ? " (admin)" : ""}</option>)}
            </select>
          </label>
          <BotonEnviar texto={tecnico ? "Reasignar" : "Asignar"} />
        </form>
      )}

      <div className="tkp-acc">
        {abierto && t.activo_id && <Link className="btn primary small" href={`/servicio/nueva?activo=${t.activo_id}&ticket=${folio}`}>Hacer hoja de servicio</Link>}
        {abierto && t.estado !== "en_proceso" && <EstadoBtn id={t.id} estado="en_proceso" texto="Va en camino" />}
        {abierto && <EstadoBtn id={t.id} estado="resuelto" texto="Resuelto sin hoja" />}
        {!abierto && <EstadoBtn id={t.id} estado="abierto" texto="Reabrir" />}
        {wa && <a className="btn small" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp a la tienda</a>}
      </div>

      {hoja && (
        <Link className="tkd-hoja" href={`/admin/hojas/${hoja.id}`}><b>Hoja #{hoja.folio}</b><span>Ver hoja de servicio</span></Link>
      )}

      {eventos.length > 0 && (
        <ol className="tk-tl tkp-tl">
          {eventos.map((e) => (
            <li key={e.id} className={`${e.tipo} ${e.publico ? "" : "interna"}`}>
              <time>{fmt(e.creado)}{e.autor ? ` · ${e.autor}` : ""}</time>
              <p>{e.texto}</p>
            </li>
          ))}
        </ol>
      )}

      <Link href={`/admin/tickets/${t.id}`} className="tkp-full">Abrir reporte completo: fotos, notas e historial <IconoUI nombre="derecha" tam={14} grosor={2.2} /></Link>
    </aside>
  );
}

function EstadoBtn({ id, estado, texto }: { id: string; estado: string; texto: string }) {
  return (
    <form action={cambiarEstado}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="estado" value={estado} />
      <button className="btn small">{texto}</button>
    </form>
  );
}
