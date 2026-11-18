/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import LoginForm from "@/components/LoginForm";

/** QR decorativo (no se escanea). */
const QR = "M0 0h7v7H0zM1 1v5h5V1zM2 2h3v3H2zM22 0h7v7h-7zm1 1v5h5V1zm1 1h3v3h-3zM0 22h7v7H0zm1 1v5h5v-5zm1 1h3v3H2zM9 0h2v2H9zm3 1h3v2h-3zm4 0h2v4h-2zM9 4h3v2H9zm5 1h2v3h-2zm-5 4h2v2H9zm4 0h4v2h-4zm6 0h2v4h-2zm3 0h2v2h-2zm3 0h3v2h-3zM0 9h3v2H0zm4 1h3v2H4zm7 2h3v3h-3zm5 0h2v2h-2zm-14 2h2v3H2zm4 0h3v2H6zm16 0h2v3h-2zm3 1h4v2h-4zM9 16h2v2H9zm4 0h4v2h-4zm6 1h2v3h-2zm-7 3h3v2h-3zm5 2h3v2h-3zm5 0h2v2h-2zm4 0h2v4h-2zM9 22h2v3H9zm4 2h2v5h-2zm4 2h3v3h-3zm5 1h3v2h-3z";

export const metadata = { title: "Iniciar sesión · Pasteko Mantenimiento" };

const ERRORES: Record<string, string> = {
  credenciales: "Correo o contraseña incorrectos. Revisa e intenta de nuevo.",
  inactivo: "Tu usuario está desactivado. Pide a Mantenimiento que lo active.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <main className="lg-pagina">
      {/* Marca */}
      <section className="lg-marca">
        <span className="lg-anillo" aria-hidden="true" />
        <span className="lg-sol" aria-hidden="true" />
        <span className="lg-puntos" aria-hidden="true" />

        <div className="lg-logo">
          <span className="lg-logo-ic"><img src="/mascota.webp" alt="" /></span>
          <span className="lg-logo-t"><b>Pasteko</b><small>MANTENIMIENTO</small></span>
        </div>

        <img className="lg-teko" src="/mascota.webp" alt="Teko, la mascota de Pasteko" />

        <div className="lg-card lg-c1" aria-hidden="true">
          <span className="lg-card-ic">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
          </span>
          <span className="lg-card-t">
            <small>NUEVO REPORTE · AHORA</small>
            <b>MT-0014 · 24 Horas</b>
            <span>Cafetera BUNN: marca error E-12</span>
            <em><i />Técnico en camino</em>
          </span>
        </div>
        <div className="lg-chip lg-c2" aria-hidden="true"><i />Técnico en camino</div>
        <div className="lg-card lg-c3" aria-hidden="true">
          <span className="lg-ok">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          </span>
          <span className="lg-card-t"><b>Hoja de servicio firmada</b><span>Reporte resuelto</span></span>
        </div>

        <div className="lg-lema">
          <h2>Que ninguna tienda <span>se detenga.</span></h2>
          <p>Reportes de tiendas, hojas de servicio, preventivos y gastos de mantenimiento en un solo lugar.</p>
        </div>
      </section>

      {/* Formulario */}
      <section className="lg-form">
        <div className="lg-caja">
          <span className="lg-asa" aria-hidden="true" />
          <div className="lg-tit">
            <p className="lg-eyebrow">ACCESO AL PANEL</p>
            <h1>Hola de nuevo</h1>
            <p>Técnicos, supervisores y Mantenimiento: entra con el correo y la contraseña que te dio Mantenimiento.</p>
          </div>

          <LoginForm next={next} error={error ? ERRORES[error] ?? "No se pudo iniciar sesión." : null} />

          <Link className="lg-qr" href="/escanear">
            <span className="lg-qr-visor" aria-hidden="true">
              <svg width="40" height="40" viewBox="0 0 29 29" shapeRendering="crispEdges"><path fill="#1d1d1b" d={QR} /></svg>
              <i className="e1" /><i className="e2" /><i className="e3" /><i className="e4" />
              <b className="lg-qr-linea" />
            </span>
            <span className="lg-qr-t">
              <small>¿ERES TIENDA?</small>
              <b>Reporta una falla sin cuenta</b>
              <span>Escanea el QR de la etiqueta pegada en el equipo.</span>
            </span>
            <span className="lg-qr-ir" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </Link>
        </div>
      </section>
    </main>
  );
}
