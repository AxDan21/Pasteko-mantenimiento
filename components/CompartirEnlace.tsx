"use client";
import { useState } from "react";

/** Comparte (o copia) el enlace de la página actual con un texto. */
export default function CompartirEnlace({ texto, etiqueta = "Compartir enlace" }: { texto: string; etiqueta?: string }) {
  const [ok, setOk] = useState(false);
  async function compartir() {
    const url = window.location.href.split("?")[0];
    try {
      if (navigator.share) return await navigator.share({ text: texto, url });
      await navigator.clipboard.writeText(`${texto} ${url}`);
      setOk(true);
      setTimeout(() => setOk(false), 2500);
    } catch {}
  }
  return <button type="button" className="btn" onClick={compartir}>{ok ? "Enlace copiado" : etiqueta}</button>;
}
