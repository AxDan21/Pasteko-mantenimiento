import type { ReactNode } from "react";

/** Encabezado de un módulo sin pestañas internas: título, descripción y acciones (mismo estilo que Seccion). */
export default function Encabezado({ titulo, sub, acciones, eyebrow }: { titulo: string; sub?: ReactNode; acciones?: ReactNode; eyebrow?: string }) {
  return (
    <header className="secc ui-enc no-print">
      <div className="secc-top">
        <div className="secc-tit">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="page-h">{titulo}</h1>
          {sub && <p className="sub">{sub}</p>}
        </div>
        {acciones && <div className="secc-acc">{acciones}</div>}
      </div>
    </header>
  );
}
