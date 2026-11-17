import Link from "next/link";
import type { ReactNode } from "react";

export type Vista = { href: string; nombre: string; cuenta?: number; alerta?: boolean; clave: string };

/** Encabezado común de un módulo con varias vistas (pestañas internas con contador). */
export default function Seccion({ eyebrow, titulo, sub, vistas, activa, acciones }: {
  eyebrow?: string; titulo: string; sub?: string; vistas: Vista[]; activa: string; acciones?: ReactNode;
}) {
  return (
    <header className="secc no-print">
      <div className="secc-top">
        <div className="secc-tit">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1 className="page-h">{titulo}</h1>
          {sub && <p className="sub">{sub}</p>}
        </div>
        {acciones && <div className="secc-acc">{acciones}</div>}
      </div>
      <nav className="secc-nav" aria-label={`Vistas de ${titulo}`}>
        {vistas.map((v) => (
          <Link key={v.clave} href={v.href} aria-current={v.clave === activa ? "page" : undefined}>
            {v.nombre}
            {v.cuenta !== undefined && v.cuenta > 0 && <span className={`secc-n${v.alerta ? " alerta" : ""}`}>{v.cuenta}</span>}
          </Link>
        ))}
      </nav>
    </header>
  );
}
