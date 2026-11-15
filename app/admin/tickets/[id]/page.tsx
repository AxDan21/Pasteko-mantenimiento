import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import BotonEnviar from "@/components/BotonEnviar";
import { createClient } from "@/lib/supabase/server";
import { agregarNota, asignarTecnico, cambiarEstado } from "../actions";
import { ABIERTOS, ESTADOS, PRIORIDAD, VENDER, duracion, enlaceWhatsApp, folioTicket, hace, tiempo, type EventoTicket, type Ticket } from "@/lib/tickets";

export const dynamic = "force-dynamic";

const fmt = (s: string) =>
  new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Mexico_City" }).format(new Date(s));

export default async function DetalleTicket({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("tickets").select("*, sucursales(nombre, zona)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const t = data as Ticket & { sucursales: { nombre: string; zona: string } | null };

  const [{ data: ev }, { data: tecnicos }, { data: previos }, { data: hoja }] = await Promise.all([
    supabase.from("ticket_eventos").select("*").eq("ticket_id", id).order("creado", { ascending: false }),
    supabase.from("perfiles").select("id, nombre, rol").in("rol", ["tecnico", "admin"]).eq("activo", true).order("nombre"),
    t.activo_id
      ? supabase.from("tickets").select("id, folio, sintoma, creado, estado").eq("activo_id", t.activo_id).neq("id", id).order("creado", { ascending: false }).limit(5)
      : Promise.resolve({ data: [] as { id: string; folio: number; sintoma: string; creado: string; estado: Ticket["estado"] }[] }),
    t.hoja_id ? supabase.from("hojas_servicio").select("id, folio, total, trabajo").eq("id", t.hoja_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const eventos = (ev ?? []) as EventoTicket[];
  const fotos = t.fotos.length ? (await supabase.storage.from("tickets").createSignedUrls(t.fotos, 3600)).data ?? [] : [];

  const h = await headers();
  const origen = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const enlaceTienda = `${origen}/t/${t.token}`;
  const folio = folioTicket(t.folio);
  const wa = enlaceWhatsApp(t.reporta_tel, `Hola ${t.reporta_nombre.split(" ")[0]}, soy de Mantenimiento. Sobre tu reporte ${folio} (${t.equipo}): `);
  const tm = tiempo(t);
  const abierto = ABIERTOS.includes(t.estado);
  const tecnico = (tecnicos ?? []).find((p) => p.id === t.tecnico_id);

  return (
    <main className="wrap">
      <Link href="/admin/tickets" className="btn small" style={{ marginBottom: 14 }}>← Reportes</Link>

      <section className={`tkd-cab p-${t.prioridad}`}>
        <div className="tkd-cab-l">
          <div className="tkb-l1">
            <span className="num tkd-folio">{folio}</span>
            <span className={`pill ${ESTADOS[t.estado].clase}`}>{ESTADOS[t.estado].nombre}</span>
            <span className={`pill ${PRIORIDAD[t.prioridad].clase}`}>{PRIORIDAD[t.prioridad].nombre}</span>
          </div>
          <h1>{t.sintoma}</h1>
          <p>{t.sucursales?.nombre} · {t.equipo}{t.activo_id && <> · <Link href={`/admin/activos/${t.activo_id}`} className="num">{t.activo_id}</Link></>}</p>
        </div>
        <div className={`tkd-reloj ${tm.vencido ? "bad" : tm.proximo ? "warn" : ""}`}>
          <b className="num">{duracion(tm.horas)}</b>
          <span>{abierto ? `abierto · meta ${tm.meta} h` : t.estado === "resuelto" ? "en resolverse" : "cancelado"}</span>
        </div>
      </section>

      <div className="tkd-grid">
        <div className="stack">
          <section className="card">
            <dl className="tkd-datos">
              <div><dt>¿Pueden vender?</dt><dd>{VENDER[t.puede_vender].titulo}</dd></div>
              <div><dt>Desde</dt><dd>{t.desde ?? "No indicado"}</dd></div>
              <div><dt>Reportó</dt><dd>{t.reporta_nombre} · hace {hace(t.creado)}</dd></div>
              <div><dt>Zona</dt><dd>{t.sucursales?.zona ?? "—"}</dd></div>
            </dl>
            {t.detalle && <p className="tkd-detalle">“{t.detalle}”</p>}
            {fotos.length > 0 && (
              <div className="tkd-fotos">
                {fotos.map((f, i) => f.signedUrl && (
                  <a key={i} href={f.signedUrl} target="_blank" rel="noopener noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.signedUrl} alt={`Foto ${i + 1} del reporte`} />
                  </a>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h3>Historial</h3>
            <form action={agregarNota} className="tkd-nota">
              <input type="hidden" name="id" value={t.id} />
              <textarea name="texto" rows={2} maxLength={1000} required placeholder="Escribe una nota o un mensaje para la tienda…" />
              <div>
                <label className="tkd-check"><input type="checkbox" name="publico" defaultChecked /> La tienda puede verlo</label>
                <BotonEnviar texto="Agregar" />
              </div>
            </form>
            <ol className="tk-tl">
              {eventos.map((e) => (
                <li key={e.id} className={`${e.tipo} ${e.publico ? "" : "interna"}`}>
                  <time>{fmt(e.creado)}{e.autor ? ` · ${e.autor}` : ""}{!e.publico && " · interna"}</time>
                  <p>{e.texto}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="stack">
          <section className="card stack">
            <h3>Atender</h3>
            <form action={asignarTecnico} className="tkd-asignar">
              <input type="hidden" name="id" value={t.id} />
              <label className="field">
                Técnico
                <select name="tecnico" defaultValue={t.tecnico_id ?? ""} required>
                  <option value="" disabled>Elige técnico</option>
                  {(tecnicos ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre}{p.rol === "admin" ? " (yo/admin)" : ""}</option>)}
                </select>
              </label>
              <BotonEnviar texto={tecnico ? "Reasignar" : "Asignar"} />
            </form>
            <div className="tkd-estados">
              {abierto && t.estado !== "en_proceso" && <EstadoBtn id={t.id} estado="en_proceso" texto="Va en camino" />}
              {abierto && <EstadoBtn id={t.id} estado="resuelto" texto="Resuelto sin hoja" />}
              {abierto && <EstadoBtn id={t.id} estado="cancelado" texto="Cancelar" />}
              {!abierto && <EstadoBtn id={t.id} estado="abierto" texto="Reabrir" />}
            </div>
            {abierto && t.activo_id && (
              <Link className="btn primary" href={`/servicio/nueva?activo=${t.activo_id}&ticket=${folio}`}>Hacer hoja de servicio</Link>
            )}
            {hoja && (
              <Link className="tkd-hoja" href={`/admin/hojas/${hoja.id}`}>
                <b>Hoja #{hoja.folio}</b><span>{hoja.trabajo}</span>
              </Link>
            )}
          </section>

          <section className="card stack">
            <h3>Contacto</h3>
            <p className="tkd-contacto"><b>{t.reporta_nombre}</b>{t.reporta_tel && <a href={`tel:${t.reporta_tel.replace(/[^\d+]/g, "")}`} className="num">{t.reporta_tel}</a>}</p>
            <div className="tkd-btns">
              {wa && <a className="btn" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
              <a className="btn" href={enlaceTienda} target="_blank" rel="noopener noreferrer">Vista de la tienda</a>
            </div>
          </section>

          {(previos ?? []).length > 0 && (
            <section className="card">
              <h3>Reportes anteriores del equipo</h3>
              <ul className="tkd-previos">
                {(previos ?? []).map((p) => (
                  <li key={p.id}><Link href={`/admin/tickets/${p.id}`}><span className="num">{folioTicket(p.folio)}</span> {p.sintoma}</Link><small>{fmt(p.creado)}</small></li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
    </main>
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
