"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type Props = {
  abierto: boolean;
  titulo: string;
  children?: ReactNode;
  accion?: string;
  onConfirmar: () => void;
  onCancelar: () => void;
};

/**
 * Ventana de confirmación propia (reemplaza window.confirm).
 * Usa <dialog> nativo: atrapa el foco, cierra con Esc y oscurece el fondo.
 * Se monta en <body> para no quedar dentro del <form> ni de la tabla.
 */
export default function DialogoConfirmar({ abierto, titulo, children, accion = "Borrar", onConfirmar, onCancelar }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (abierto && !d.open) d.showModal();
    if (!abierto && d.open) d.close();
  }, [abierto, montado]);

  if (!montado) return null;
  return createPortal(
    <dialog
      ref={ref}
      className="dlg-conf"
      aria-labelledby="dlg-conf-t"
      onCancel={(e) => { e.preventDefault(); onCancelar(); }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancelar(); }}
    >
      <div className="dlg-conf-in">
        <span className="dlg-conf-ico" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 7h16M10 11v6M14 11v6" /><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
          </svg>
        </span>
        <h2 id="dlg-conf-t">{titulo}</h2>
        {children && <div className="dlg-conf-txt">{children}</div>}
        <div className="dlg-conf-acc">
          <button type="button" className="btn" onClick={onCancelar} autoFocus>Cancelar</button>
          <button type="button" className="btn dlg-conf-si" onClick={onConfirmar}>{accion}</button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
}

/** Separa "¿Pregunta? Detalle." en título y detalle. */
export function partirMensaje(mensaje: string): [string, string] {
  const i = mensaje.indexOf("?");
  return i < 0 ? [mensaje, ""] : [mensaje.slice(0, i + 1).trim(), mensaje.slice(i + 1).trim()];
}
