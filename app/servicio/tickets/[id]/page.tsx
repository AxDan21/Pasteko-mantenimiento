import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import BotonEnviar from "@/components/BotonEnviar";
import { requireTecnico } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { voyEnCamino } from "../actions";
import { ABIERTOS, ESTADOS, PRIORIDAD, VENDER, enlaceWhatsApp, folioTicket, hace, type Ticket } from "@/lib/tickets";

export const dynamic = "force-dynamic";

/** Reporte asignado, visto desde el celular del técnico. */
export default async function TicketTecnico({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { perfil } = await requireTecnico();
  const supabase = await createClient();
  const { data } = await supabase.from("tickets").select("*, sucursales(nombre, direccion, lat, lng)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const t = data as Ticket & { sucursales: { nombre: string; direccion: string | null; lat: number | null; lng: number | null } | null };
  const fotos = t.fotos.length ? (await supabase.storage.from("tickets").createSignedUrls(t.fotos, 3600)).data ?? [] : [];
  const folio = folioTicket(t.folio);
  const abierto = ABIERTOS.includes(t.estado);
  const wa = enlaceWhatsApp(t.reporta_tel, `Hola ${t.reporta_nombre.split(" ")[0]}, soy ${perfil.nombre.split(" ")[0]} de Mantenimiento, voy por el reporte ${folio} (${t.equipo}).`);
  const s = t.sucursales;
  const mapa = s?.lat != null && s?.lng != null ? `https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}` : null;

  return (
    <>
      <Header items={[{ href: "/servicio", label: "Mis hojas" }]} salir sub={perfil.nombre} />
      <main className="wrap" style={{ maxWidth: 760 }}>
        <Link href="/servicio" className="btn small" style={{ marginBottom: 14 }}>← Mis hojas</Link>
        <section className={`tkd-cab p-${t.prioridad}`}>
          <div className="tkd-cab-l">
            <div className="tkb-l1">
              <span className="num tkd-folio">{folio}</span>
              <span className={`pill ${ESTADOS[t.estado].clase}`}>{ESTADOS[t.estado].nombre}</span>
              <span className={`pill ${PRIORIDAD[t.prioridad].clase}`}>{PRIORIDAD[t.prioridad].nombre}</span>
            </div>
            <h1>{t.sintoma}</h1>
            <p>{s?.nombre} · {t.equipo} · hace {hace(t.creado)}</p>
          </div>
        </section>

        <section className="card stack" style={{ marginTop: 14 }}>
          <dl className="tkd-datos">
            <div><dt>¿Pueden vender?</dt><dd>{VENDER[t.puede_vender].titulo}</dd></div>
            <div><dt>Desde</dt><dd>{t.desde ?? "No indicado"}</dd></div>
            <div><dt>Reportó</dt><dd>{t.reporta_nombre}{t.reporta_tel ? ` · ${t.reporta_tel}` : ""}</dd></div>
            <div><dt>Equipo</dt><dd className="num">{t.activo_id ?? "—"}</dd></div>
          </dl>
          {t.detalle && <p className="tkd-detalle">“{t.detalle}”</p>}
          {fotos.length > 0 && (
            <div className="tkd-fotos">
              {fotos.map((f, i) => f.signedUrl && (
                <a key={i} href={f.signedUrl} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.signedUrl} alt={`Foto ${i + 1}`} />
                </a>
              ))}
            </div>
          )}
          <div className="tkd-btns">
            {mapa && <a className="btn" href={mapa} target="_blank" rel="noopener noreferrer">Cómo llegar</a>}
            {t.reporta_tel && <a className="btn" href={`tel:${t.reporta_tel.replace(/[^\d+]/g, "")}`}>Llamar</a>}
            {wa && <a className="btn" href={wa} target="_blank" rel="noopener noreferrer">WhatsApp</a>}
          </div>
        </section>

        {abierto && (
          <div className="tkt-acc">
            {t.estado !== "en_proceso" && (
              <form action={voyEnCamino}>
                <input type="hidden" name="id" value={t.id} />
                <BotonEnviar texto="Voy en camino" clase="btn big" />
              </form>
            )}
            {t.activo_id && <Link className="btn primary big" href={`/servicio/nueva?activo=${t.activo_id}&ticket=${folio}`}>Hacer hoja y cerrar {folio}</Link>}
          </div>
        )}
      </main>
    </>
  );
}
