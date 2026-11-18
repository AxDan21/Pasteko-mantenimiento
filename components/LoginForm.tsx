"use client";
import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { iniciarSesion } from "@/app/login/actions";

const GUARDADO = "pk-correo";

function Entrar() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="lg-entrar" disabled={pending}>
      {pending ? (
        <>
          <svg className="lg-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M21 12a9 9 0 1 1-6.2-8.6" /></svg>
          Entrando…
        </>
      ) : (
        <>
          Entrar
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </>
      )}
    </button>
  );
}

/** Formulario de acceso: recuerda el correo en este dispositivo y permite ver la contraseña. */
export default function LoginForm({ next, error }: { next?: string; error?: string | null }) {
  const [ver, setVer] = useState(false);
  const [correo, setCorreo] = useState("");

  useEffect(() => {
    try { setCorreo(localStorage.getItem(GUARDADO) ?? ""); } catch {}
  }, []);

  return (
    <form action={iniciarSesion} className="lg-campos" onSubmit={() => { try { localStorage.setItem(GUARDADO, correo.trim()); } catch {} }}>
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="lg-l">
        Correo
        <span className="lg-campo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg>
          <input id="email" name="email" type="email" autoComplete="email" required placeholder="tu@pasteko.com" value={correo} onChange={(e) => setCorreo(e.target.value)} />
        </span>
      </label>
      <label className="lg-l">
        Contraseña
        <span className="lg-campo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
          <input id="password" name="password" type={ver ? "text" : "password"} autoComplete="current-password" required placeholder="••••••••" autoFocus={!!correo} />
          <button type="button" className="lg-ojo" onClick={() => setVer(!ver)} aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={ver}>
            {ver ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
            )}
          </button>
        </span>
      </label>
      {error && <p className="lg-error" role="alert">{error}</p>}
      <Entrar />
      <p className="lg-olvido">¿Olvidaste tu contraseña? Pídela a Mantenimiento.</p>
    </form>
  );
}
