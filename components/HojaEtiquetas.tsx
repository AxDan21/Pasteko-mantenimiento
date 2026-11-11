/* eslint-disable @next/next/no-img-element */
import { qrPng, urlActivo } from "@/lib/qr";

export type ItemEtiqueta = {
  id: string;
  equipo: string;
  sucursal: string;
  descripcion?: string | null;
};

/** Hoja de etiquetas QR para imprimir en carta (chica 6.5 × 3.5 cm o grande 9 × 5 cm). */
export default async function HojaEtiquetas({
  items,
  grande = false,
}: {
  items: ItemEtiqueta[];
  grande?: boolean;
}) {
  const qrs = await Promise.all(
    items.map((x) => qrPng(urlActivo(x.id), grande ? 420 : 300)),
  );
  return (
    <div className={`etiquetas ${grande ? "grande" : ""}`}>
      {items.map((x, i) => (
        <div key={x.id} className="etq">
          <img src={qrs[i]} alt={`QR ${x.id}`} className="etq-qr" />
          <div className="etq-txt">
            <span className="etq-marca">
              <img src="/mascota.webp" alt="" /> Pasteko Mantenimiento
            </span>
            <b className="num">{x.id}</b>
            <span>{x.descripcion || x.equipo}</span>
            <small>{x.sucursal}</small>
            <small className="etq-hint">Escanea: guía y reportes</small>
          </div>
        </div>
      ))}
    </div>
  );
}
