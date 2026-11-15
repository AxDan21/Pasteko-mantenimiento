"use client";
import { useFormStatus } from "react-dom";

/** Botón de envío que se desactiva mientras el servidor responde. */
export default function BotonEnviar({ texto, clase = "btn primary" }: { texto: string; clase?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={clase} disabled={pending}>{pending ? "Guardando…" : texto}</button>;
}
