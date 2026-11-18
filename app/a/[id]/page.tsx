import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Icono from "@/components/Icono";
import { sesion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fecha, folio } from "@/lib/format";
import { estadoGarantia, fCorta, hoy } from "@/lib/panel";
import { ESTADOS, folioTicket, fotoEquipo, hace, type EstadoTicket } from "@/lib/tickets";
import { guiasActivas } from "@/lib/guias";

export const dynamic = "force-dynamic";

type Publico = { id: string; equipo: string; sucursal: string; slug: string | null };
type Servicio = {
  id: string; creada: string; folio: number; tipo: string; falla: string; trabajo: string; tecnico: string;
  refacciones: { descripcion: string; cantidad: number }[];
};

/** Página que abre el QR pegado en el equipo. Tienda: guía. Técnico: historial. Admin: además, enlace a la ficha completa. */
export default async function EquipoEscaneado({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("activo_publico", { p_id: decodeURIComponent(id) });
  const eq = ((data ?? []) as Publico[])[0];
  if (!eq) notFound();

  const s = await sesion();
  const interno = !!s?.perfil?.activo && s.perfil.rol !== "supervisor" && s.perfil.rol !== "consulta";
  const supervisor = s?.perfil?.rol === "supervisor" && s.perfil.activo;
  const admin = s?.perfil?.rol === "admin";
  const { data: ab } = await supabase.rpc("ticket_abierto", { p_activo: eq.id });
  const abierto = ((ab ?? []) as { folio: number; token: string; estado: EstadoTicket; creado: string }[])[0];

  let servicios: Servicio[] = [];
  let ficha: { marca: string | null; modelo: string | null; serie: string | null; garantia_hasta: string | null; ficha_path: string | null; descripcion: string | null } | null = null;
  let fichaUrl: string | undefined;
  if (interno) {
    const [{ data: h }, { data: a }] = await Promise.all([
      supabase.rpc("historial_activo", { p_id: eq.id }),
      supabase.from("activos").select("marca, modelo, serie, garantia_hasta, ficha_path, descripcion").eq("id", eq.id).maybeSingle(),
    ]);
    servicios = (h ?? []) as Servicio[];
    ficha = a;
    if (a?.ficha_path) {
      const { data: u } = await supabase.storage.from("censo").createSignedUrl(a.ficha_path, 3600);
      fichaUrl = u?.signedUrl;
    }
  }
  const gar = ficha ? estadoGarantia(ficha.garantia_hasta, hoy()) : null;
  const icono = eq.slug === "refrigeracion" ? "refri" : eq.slug ?? "general";
  const guia = guiasActivas() && !!eq.slug;
  const foto = fotoEquipo(eq.slug);

  return (
    <>
      <Header items={interno ? [{ href: "/servicio", label: "Mis hojas" }, ...(admin ? [{ href: "/admin", label: "Panel" }] : [])] : supervisor ? [{ href: "/censo", label: "Censo" }] : []} salir={interno || !!supervisor} />
      <main className="wrap" style={{ maxWidth: 760 }}>
        {!interno && !supervisor ? (
          <div className="qr">
            <section className={`qr-estudio${foto ? "" : " sin-foto"}`}>
              <span className="qr-sombra" aria-hidden="true" />
              {foto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={foto} alt={eq.equipo} className="qr-foto" />
              ) : (
                <span className="qr-icono"><Icono nombre={icono} size={64} /></span>
              )}
              <span className="qr-esq a" aria-hidden="true" /><span className="qr-esq b" aria-hidden="true" />
              <span className="qr-esq c" aria-hidden="true" /><span className="qr-esq d" aria-hidden="true" />
              <span className="qr-linea" aria-hidden="true" />
              <span className="qr-suc">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
                {eq.sucursal}
              </span>
              <span className="qr-cod num">{eq.id}</span>
              <span className="qr-ok">
                <span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
                Equipo identificado
              </span>
            </section>

            <div className="qr-nombre">
              <h1>{eq.equipo}</h1>
              <p>Sucursal {eq.sucursal} · ya sabemos qué equipo es</p>
            </div>

            {abierto && (
              <Link href={`/t/${abierto.token}`} className="qa-abierto">
                <span className={`pill ${ESTADOS[abierto.estado].clase}`}>{ESTADOS[abierto.estado].nombre}</span>
                <span className="qa-abierto-t">
                  <b>Ya hay un reporte en atención</b>
                  <small>{folioTicket(abierto.folio)} · abierto hace {hace(abierto.creado)}</small>
                </span>
                <span className="qa-ver">Ver avance →</span>
              </Link>
            )}

            <div className="qr-accion">
              <Link href={`/a/${eq.id}/reportar`} className="qr-cta">
                <span className="qr-punto" aria-hidden="true"><i /><i /></span>
                <span className="qr-cta-t">{abierto ? "Reportar algo más" : "Reportar una falla"}</span>
                <span className="qr-flecha" aria-hidden="true">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </span>
              </Link>
              <p className="qr-tiempo">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2M9 2h6" /></svg>
                {abierto ? `Se suma al reporte ${folioTicket(abierto.folio)}` : "3 preguntas · menos de 1 minuto"}
              </p>
            </div>

            {guia && (
              <Link href={`/equipo/${eq.slug}`} className="qa-op">
                <span className="qa-op-ic" aria-hidden>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M8 7h7M8 11h5" /></svg>
                </span>
                <span className="qa-op-t"><b>Intentar resolverlo</b><small>Pasos y videos de las fallas más comunes</small></span>
                <span className="qa-flecha" aria-hidden>→</span>
              </Link>
            )}

            <ol className="qr-pasos" aria-label="Cómo funciona">
              <li><b>1</b>Dinos qué<br />falla</li>
              <li><b>2</b>Mantenimiento<br />recibe el aviso</li>
              <li><b>3</b>Sigue el avance<br />en tu celular</li>
            </ol>

            <p className="qa-pie">¿Eres técnico o supervisor? <Link href={`/login?next=/a/${eq.id}`}>Inicia sesión</Link></p>
          </div>
        ) : (
          <div className="detail-head">
            <span className="eq-ico"><Icono nombre={icono} size={28} /></span>
            <div>
              <p className="eyebrow num">{eq.id} · {eq.sucursal}</p>
              <h1>{eq.equipo}</h1>
              {ficha && <p className="sub" style={{ margin: 0 }}>{[ficha.marca, ficha.modelo, ficha.serie && `Serie ${ficha.serie}`].filter(Boolean).join(" · ") || "Sin datos de marca"}</p>}
            </div>
          </div>
        )}

        {supervisor && (
          <div className="stack">
            <div className="note ok">Este equipo ya está registrado en el censo. <Link href="/censo">Ir al censo</Link></div>
            {guia && (
              <Link href={`/equipo/${eq.slug}`} className="card scan-cta">
                <b>Guía rápida del equipo</b>
                <span>Videos y pasos para resolver lo más común →</span>
              </Link>
            )}
          </div>
        )}

        {interno && (
          <div className="stack">
            {gar && gar.clase !== "neutral" && (
              <div className={`note ${gar.clase === "warn" ? "warn" : "ok"}`}>
                Equipo en garantía hasta el {fCorta(ficha!.garantia_hasta)}. Antes de reparar, confirma con Mantenimiento si se reclama al proveedor.
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link className="btn primary" href={`/servicio/nueva?activo=${eq.id}${abierto ? `&ticket=${folioTicket(abierto.folio)}` : ""}`}>+ Hoja de servicio{abierto ? ` (cierra ${folioTicket(abierto.folio)})` : " para este equipo"}</Link>
              {admin && <Link className="btn" href={`/admin/activos/${eq.id}`}>Ficha completa con costos</Link>}
              {guia && <Link className="btn" href={`/equipo/${eq.slug}`}>Guía de la tienda</Link>}
            </div>

            {fichaUrl && (
              <section className="card ficha-censo">
                <a href={fichaUrl} target="_blank" rel="noopener noreferrer" className="validar-fotos grande">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={fichaUrl} alt="Ficha técnica" />
                </a>
                <div><h3>Ficha técnica</h3><p className="sub" style={{ margin: 0 }}>{ficha?.descripcion ?? eq.equipo}. Toca la foto para ampliarla y revisar modelo, voltaje y refrigerante.</p></div>
              </section>
            )}

            <section className="card">
              <h3>Historial de reparaciones</h3>
              <p className="sub">{servicios.length ? `${servicios.length} servicio${servicios.length !== 1 ? "s" : ""} registrados, del más reciente al más antiguo.` : "Este equipo todavía no tiene hojas de servicio."}</p>
              {servicios.length > 0 && (
                <ol className="timeline">
                  {servicios.map((x) => (
                    <li key={x.id}>
                      <div className="tl-head">
                        <span className={`pill ${x.tipo === "Preventivo" ? "neutral" : "warn"}`}>{x.tipo}</span>
                        <span className="num">{folio(x.folio)}</span>
                        <span className="sub" style={{ margin: 0 }}>{fecha(x.creada)} · {x.tecnico}</span>
                      </div>
                      <p><b>Falla:</b> {x.falla}</p>
                      <p><b>Trabajo:</b> {x.trabajo}</p>
                      {x.refacciones.length > 0 && (
                        <p className="sub" style={{ margin: 0 }}>Refacciones: {x.refacciones.map((r) => `${r.cantidad} × ${r.descripcion}`).join(", ")}</p>
                      )}
                      {admin && <Link href={`/admin/hojas/${x.id}`} style={{ fontSize: 13 }}>Ver hoja completa</Link>}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        )}
      </main>
    </>
  );
}
