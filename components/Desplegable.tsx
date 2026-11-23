"use client";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Sección que se abre y cierra (formularios de alta largos). Se abre sola si la URL trae su #id
 * (los accesos de "+ Nuevo" usan /modulo#nuevo) o si `abierto` es verdadero (p. ej. hubo un error).
 */
export default function Desplegable({ id, titulo, detalle, abierto = false, children }: {
  id: string; titulo: string; detalle?: string; abierto?: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const revisar = () => {
      if (window.location.hash === `#${id}` && ref.current) {
        ref.current.open = true;
        ref.current.querySelector<HTMLElement>("input, select, textarea")?.focus({ preventScroll: true });
      }
    };
    revisar();
    window.addEventListener("hashchange", revisar);
    return () => window.removeEventListener("hashchange", revisar);
  }, [id]);
  return (
    <details ref={ref} id={id} className="ui-desp" open={abierto || undefined}>
      <summary>
        <span className="ui-desp-t"><b>{titulo}</b>{detalle && <small>{detalle}</small>}</span>
        <span className="ui-desp-ic" aria-hidden="true" />
      </summary>
      <div className="ui-desp-c">{children}</div>
    </details>
  );
}
