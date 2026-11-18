/* eslint-disable @next/next/no-img-element */
import LoginForm from "@/components/LoginForm";

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
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
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
            <p>Entra con el correo y la contraseña que te dio Mantenimiento.</p>
          </div>

          <LoginForm next={next} error={error ? ERRORES[error] ?? "No se pudo iniciar sesión." : null} />

          <div className="lg-para">
            <div className="lg-sep"><span />ESTE ACCESO ES PARA<span /></div>
            <ul>
              <li>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z" /></svg>
                Técnicos
              </li>
              <li>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3v2h6V3M9 11h6M9 15h4" /></svg>
                Supervisores
              </li>
              <li>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /></svg>
                Mantenimiento
              </li>
            </ul>
          </div>

          <div className="lg-tienda">
            <span>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v.01M14 21h3M21 18v3" /></svg>
            </span>
            <p><b>¿Eres tienda?</b>No necesitas cuenta: escanea el QR del equipo para reportar una falla.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
