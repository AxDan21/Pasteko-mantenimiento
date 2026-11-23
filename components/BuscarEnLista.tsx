"use client";
import { useEffect, useId, useState } from "react";
import IconoUI from "@/components/IconoUI";

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Búsqueda instantánea sobre una lista o tabla que ya se dibujó en el servidor.
 * Cada fila que se pueda buscar lleva `data-buscar="texto"`; las que no coinciden se ocultan.
 * No cambia la consulta ni los filtros de la página: solo afina lo que ya está en pantalla.
 */
export default function BuscarEnLista({ objetivo, placeholder = "Buscar…", etiqueta = "Buscar en la lista" }: {
  /** id del contenedor de las filas */
  objetivo: string; placeholder?: string; etiqueta?: string;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [visibles, setVisibles] = useState<number | null>(null);

  useEffect(() => {
    const cont = document.getElementById(objetivo);
    if (!cont) return;
    const filas = Array.from(cont.querySelectorAll<HTMLElement>("[data-buscar]"));
    const t = normalizar(q);
    let n = 0;
    filas.forEach((f) => {
      const ok = !t || normalizar(f.dataset.buscar ?? "").includes(t);
      f.hidden = !ok;
      if (ok) n++;
    });
    setVisibles(t ? n : null);
  }, [q, objetivo]);

  return (
    <div className="ui-buscar">
      <label htmlFor={id} className="sr-only">{etiqueta}</label>
      <IconoUI nombre="buscar" tam={16} grosor={2} />
      <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }} placeholder={placeholder} autoComplete="off" />
      <span className="ui-buscar-n" role="status" aria-live="polite">
        {visibles === null ? "" : visibles === 0 ? "Sin coincidencias" : `${visibles} ${visibles === 1 ? "resultado" : "resultados"}`}
      </span>
    </div>
  );
}
