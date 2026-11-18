/* eslint-disable @next/next/no-img-element */
import { qrPng, urlActivo } from "@/lib/qr";

export type ItemEtiqueta = { id: string; equipo: string; sucursal: string; descripcion?: string | null };

/** Imagen de Teko sobre el QR. Si tienes a Teko señalando hacia abajo, guárdalo en /public y cambia esta ruta. */
const TEKO = "/mascota.webp";

/** Etiquetas de 9 × 11.6 cm con QR de 7.5 × 7.5 cm; Teko rompe el marco por arriba (4 por hoja carta). */
export default async function HojaEtiquetas({ items }: { items: ItemEtiqueta[]; grande?: boolean }) {
  const qrs = await Promise.all(items.map((x) => qrPng(urlActivo(x.id), 900, "Q")));
  return (
    <div className="etiquetas">
      {items.map((x, i) => (
        <div key={x.id} className="etq">
          <div className="etq-in">
            <span className="etq-marco" aria-hidden="true" />
            <span className="etq-sol" aria-hidden="true" />
            <img src={TEKO} alt="" className="etq-teko" />
            <div className="etq-tit">
              <span className="etq-pre">¿El equipo falla?</span>
              <span className="etq-esc">¡Escanéame!</span>
              <span className="etq-sub">Con la cámara de tu celular</span>
            </div>
            <div className="etq-qrbox">
              <img src={qrs[i]} alt={`QR ${x.id}`} className="etq-qr" />
              <i className="etq-esq a" /><i className="etq-esq b" /><i className="etq-esq c" /><i className="etq-esq d" />
            </div>
            <b className="etq-cod">{x.id}</b>
          </div>
        </div>
      ))}
    </div>
  );
}
