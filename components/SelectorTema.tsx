"use client";
import { useEffect, useState } from "react";
import IconoUI from "@/components/IconoUI";
import { LLAVE_TEMA, type Tema } from "@/lib/tema";

const consulta = "(prefers-color-scheme: dark)";

/** Tema que se ve ahora: el elegido o, sin elección, el del sistema. */
function temaActual(): Tema {
  const elegido = document.documentElement.getAttribute("data-theme");
  if (elegido === "light" || elegido === "dark") return elegido;
  return window.matchMedia(consulta).matches ? "dark" : "light";
}

/**
 * Botón para cambiar entre tema claro y oscuro. La elección se recuerda en este navegador;
 * mientras no se elija nada, la app sigue el tema del sistema operativo.
 */
export default function SelectorTema({ className = "ui-ibtn" }: { className?: string }) {
  const [tema, setTema] = useState<Tema | null>(null);

  useEffect(() => {
    setTema(temaActual());
    const mq = window.matchMedia(consulta);
    const alCambiar = () => setTema(temaActual());
    mq.addEventListener("change", alCambiar);
    return () => mq.removeEventListener("change", alCambiar);
  }, []);

  const cambiar = () => {
    const nuevo: Tema = temaActual() === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", nuevo);
    try { localStorage.setItem(LLAVE_TEMA, nuevo); } catch { /* sin almacenamiento: dura hasta recargar */ }
    setTema(nuevo);
  };

  const etiqueta = tema === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro";
  return (
    <button type="button" className={className} onClick={cambiar} aria-label={etiqueta} title={etiqueta}>
      {/* Antes de montar no se sabe el tema: se muestra la luna para no mover el diseño. */}
      <IconoUI nombre={tema === "dark" ? "sol" : "luna"} />
    </button>
  );
}
