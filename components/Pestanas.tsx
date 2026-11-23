"use client";
import { Children, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

const LLAVE = "pasteko.resumen.pestana";

/** Pestañas accesibles: todos los paneles se renderizan en el servidor y solo se muestra el activo. */
export default function Pestanas({ etiquetas, children, nombre }: { etiquetas: string[]; children: ReactNode; nombre: string }) {
  const [activa, setActiva] = useState(0);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const paneles = Children.toArray(children);

  useEffect(() => {
    try {
      const v = Number(localStorage.getItem(LLAVE));
      if (v > 0 && v < etiquetas.length) setActiva(v);
    } catch { /* sin almacenamiento: queda la primera */ }
  }, [etiquetas.length]);

  const elegir = (i: number, foco = false) => {
    setActiva(i);
    try { localStorage.setItem(LLAVE, String(i)); } catch { /* opcional */ }
    if (foco) botones.current[i]?.focus();
  };

  const teclas = (e: KeyboardEvent) => {
    const n = etiquetas.length;
    if (e.key === "ArrowRight") elegir((activa + 1) % n, true);
    else if (e.key === "ArrowLeft") elegir((activa - 1 + n) % n, true);
    else if (e.key === "Home") elegir(0, true);
    else if (e.key === "End") elegir(n - 1, true);
    else return;
    e.preventDefault();
  };

  return (
    <div className="pst">
      <div className="pst-tabs" role="tablist" aria-label={nombre} onKeyDown={teclas}>
        {etiquetas.map((t, i) => (
          <button
            key={t}
            ref={(el) => { botones.current[i] = el; }}
            type="button"
            role="tab"
            id={`pst-t-${i}`}
            aria-selected={i === activa}
            aria-controls={`pst-p-${i}`}
            tabIndex={i === activa ? 0 : -1}
            onClick={() => elegir(i)}
          >
            {t}
          </button>
        ))}
      </div>
      {paneles.map((p, i) => (
        <div key={i} role="tabpanel" id={`pst-p-${i}`} aria-labelledby={`pst-t-${i}`} hidden={i !== activa} className="pst-panel">
          {p}
        </div>
      ))}
    </div>
  );
}
