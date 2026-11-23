"use client";
import type { ReactNode } from "react";

/** Botón de envío que pide confirmación antes de una acción que no se puede deshacer (borrar). */
export default function BotonConfirmar({ mensaje, className = "btn small danger", children }: { mensaje: string; className?: string; children: ReactNode }) {
  return (
    <button type="submit" className={className} onClick={(e) => { if (!window.confirm(mensaje)) e.preventDefault(); }}>
      {children}
    </button>
  );
}
