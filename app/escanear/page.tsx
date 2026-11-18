import Escaner from "@/components/Escaner";

export const metadata = { title: "Escanear QR · Pasteko Mantenimiento" };

/** Pública: la tienda escanea el QR del equipo para reportar una falla. */
export default function Escanear() {
  return <Escaner />;
}
