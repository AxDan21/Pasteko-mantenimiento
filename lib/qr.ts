import "server-only";
import QRCode from "qrcode";

/** Dirección pública de la app, sin diagonal final. */
export const sitio = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

/** Dirección que abre el QR pegado en un equipo. */
export const urlActivo = (id: string) => `${sitio()}/a/${encodeURIComponent(id)}`;

/** QR en PNG (data URL) listo para <img> o para descargar. */
export function qrPng(texto: string, ancho = 360, correccion: "L" | "M" | "Q" | "H" = "M") {
  return QRCode.toDataURL(texto, { errorCorrectionLevel: correccion, margin: 1, width: ancho, color: { dark: "#1d1d1b", light: "#ffffff" } });
}
