"use client";
import type { ReactNode } from "react";

const ICONOS: Record<string, ReactNode> = {
  pagar: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.7 2.7L16 9.8" /></>,
  regresar: <><path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" /></>,
  factura: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  borrar: <><path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" /></>,
};

/** Dibujo de un icono de acción (trazo, hereda el color del texto). */
export function IconoAccion({ nombre }: { nombre: keyof typeof ICONOS | string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONOS[nombre]}
    </svg>
  );
}

/** Botón de solo icono para formularios; con `confirmar` pide confirmación antes de enviar. */
export default function BotonIcono({ icono, texto, tono, confirmar, cuenta }: { icono: string; texto: string; tono?: "ok" | "danger"; confirmar?: string; cuenta?: number }) {
  return (
    <button
      type="submit"
      className={`ibtn${tono ? ` ${tono}` : ""}`}
      title={texto}
      aria-label={texto}
      onClick={(e) => { if (confirmar && !window.confirm(confirmar)) e.preventDefault(); }}
    >
      <IconoAccion nombre={icono} />
      {cuenta && cuenta > 1 ? <span className="ibtn-n">{cuenta}</span> : null}
    </button>
  );
}
