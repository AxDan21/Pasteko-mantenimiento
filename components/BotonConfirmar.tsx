"use client";
import { useRef, useState, type ReactNode } from "react";
import DialogoConfirmar, { partirMensaje } from "./DialogoConfirmar";

/** Botón de envío que pide confirmación antes de una acción que no se puede deshacer (borrar). */
export default function BotonConfirmar({ mensaje, className = "btn small danger", children }: { mensaje: string; className?: string; children: ReactNode }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [titulo, detalle] = partirMensaje(mensaje);
  return (
    <>
      <button ref={btn} type="submit" className={className} onClick={(e) => { e.preventDefault(); setAbierto(true); }}>
        {children}
      </button>
      <DialogoConfirmar abierto={abierto} titulo={titulo} onCancelar={() => setAbierto(false)}
        onConfirmar={() => { setAbierto(false); btn.current?.form?.requestSubmit(btn.current); }}>
        {detalle && <p>{detalle}</p>}
      </DialogoConfirmar>
    </>
  );
}
