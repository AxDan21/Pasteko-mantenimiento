import type { ReactNode } from "react";

export type Tono = "ok" | "warn" | "bad" | "info" | "neutral";

/**
 * Estado de un registro (reporte, hoja, preventivo, garantía…): pastilla redondeada con punto.
 * `tono` usa las mismas claves que ya devuelven ESTADOS, estadoPreventivo, etc. (`clase`).
 */
export function Estado({ tono = "neutral", children }: { tono?: Tono | string; children: ReactNode }) {
  return <span className={`ui-estado ${tono}`}>{children}</span>;
}

/**
 * Prioridad de un reporte: etiqueta cuadrada con barras de nivel, para no confundirla con el estado.
 * Recibe las claves reales de la base: alta | media | baja.
 */
export function Prioridad({ nivel, children }: { nivel: "alta" | "media" | "baja"; children: ReactNode }) {
  const llenas = nivel === "alta" ? 3 : nivel === "media" ? 2 : 1;
  return (
    <span className={`ui-prio ${nivel}`}>
      <svg viewBox="0 0 12 12" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <rect key={i} x={1 + i * 4} y={7 - i * 3} width="2" height={4 + i * 3} fill="currentColor" opacity={i < llenas ? 1 : 0.25} />
        ))}
      </svg>
      {children}
    </span>
  );
}
