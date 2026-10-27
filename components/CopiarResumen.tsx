"use client";
import { useState } from "react";

export default function CopiarResumen({ equipo }: { equipo: string }) {
  const [estado, setEstado] = useState<"" | "ok" | "manual">("");
  const texto = `Sucursal: \nEquipo: ${equipo}\nNúmero de serie: \nFalla: \nDesde cuándo: \nPasos que ya intenté: \nAdjunto foto/video: sí / no`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setEstado("ok");
    } catch {
      setEstado("manual");
    }
  }

  return (
    <>
      <button type="button" className="btn dark" onClick={copiar}>
        {estado === "ok" ? "Copiado. Pégalo en el ticket" : "Copiar formato para el ticket"}
      </button>
      {estado === "manual" && (
        <textarea className="input num" rows={7} readOnly value={texto} onFocus={(e) => e.currentTarget.select()} />
      )}
    </>
  );
}
