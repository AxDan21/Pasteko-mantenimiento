import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Icono from "@/components/Icono";
import { sesion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fecha, folio } from "@/lib/format";
import { estadoGarantia, fCorta, hoy } from "@/lib/panel";
import { ESTADOS, folioTicket, hace, type EstadoTicket } from "@/lib/tickets";

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

  return (
    <>
      <Header items={interno ? [{ href: "/servicio", label: "Mis hojas" }, ...(admin ? [{ href: "/admin", label: "Panel" }] : [])] : supervisor ? [{ href: "/censo", label: "Censo" }] : [{ href: `/login?next=/a/${eq.id}`, label: "Acceso técnicos" }]} salir={interno || !!supervisor} />
      <main className="wrap" style={{ maxWidth: 760 }}>
        <div className="detail-head">
          <span className="eq-ico"><Icono nombre={icono} size={28} /></span>
          <div>
            <p className="eyebrow num">{eq.id} · {eq.sucursal}</p>
            <h1>{eq.equipo}</h1>
            {ficha && <p className="sub" style={{ margin: 0 }}>{[ficha.marca, ficha.modelo, ficha.serie && `Serie ${ficha.serie}`].filter(Boolean).join(" · ") || "Sin datos de marca"}</p>}
          </div>
        </div>

        {supervisor && (
          <div className="note ok" style={{ marginBottom: 14 }}>Este equipo ya está registrado en el censo. <Link href="/censo">Ir al censo</Link></div>
        )}

        {!interno && (
          <div className="stack">
            {!supervisor && abierto && (
              <Link href={`/t/${abierto.token}`} className="tk-ya card">
                <span className={`pill ${ESTADOS[abierto.estado].clase}`}>{ESTADOS[abierto.estado].nombre}</span>
                <span>
                  <b>Reporte {folioTicket(abierto.folio)} en atención</b>
                  <small>Abierto hace {hace(abierto.creado)}. Toca para ver el avance.</small>
                </span>
              </Link>
            )}
            {!supervisor && (
              <Link href={`/a/${eq.id}/reportar`} className="card scan-cta tk-cta">
                <b>¿Tiene una falla? Repórtala aquí</b>
                <span>Ya sabemos qué equipo es y de qué tienda. Toma menos de un minuto →</span>
              </Link>
            )}
            {eq.slug && (
              <Link href={`/equipo/${eq.slug}`} className="card scan-cta">
                <b>Guía rápida del equipo</b>
                <span>Videos y pasos para resolver lo más común →</span>
              </Link>
            )}
            {!supervisor && (
            <div className="card">
                <h3>¿Eres técnico de mantenimiento?</h3>
                <p className="sub">Inicia sesión para ver el historial de reparaciones de este equipo y crear su hoja de servicio.</p>
                <Link className="btn primary" href={`/login?next=/a/${eq.id}`}>Iniciar sesión</Link>
              </div>
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
              {eq.slug && <Link className="btn" href={`/equipo/${eq.slug}`}>Guía de la tienda</Link>}
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
