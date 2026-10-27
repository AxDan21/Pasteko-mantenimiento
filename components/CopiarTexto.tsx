"use client";
import { useState } from "react";

/** Botón que copia un texto; si el navegador no lo permite, muestra el texto para copiarlo a mano. */
export default function CopiarTexto({ texto, etiqueta, className = "btn" }: { texto: string; etiqueta: string; className?: string }) {
  const [estado, setEstado] = useState<"" | "ok" | "manual">("");
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("ok");
      setTimeout(() => setEstado(""), 2500);
    } catch {
      setEstado("manual");
    }
  }
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", gap: 8 }}>
      <button type="button" className={className} onClick={copiar} disabled={!texto}>
        {estado === "ok" ? "Copiado" : etiqueta}
      </button>
      {estado === "manual" && (
        <textarea className="input num" rows={8} readOnly value={texto} onFocus={(e) => e.currentTarget.select()} />
      )}
    </span>
  );
}
