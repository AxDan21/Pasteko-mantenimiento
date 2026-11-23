import { ICONOS_UI, type NombreIcono } from "@/lib/iconos";

/**
 * Ícono de interfaz (trazo). Decorativo por omisión; con `titulo` se anuncia a lectores de pantalla.
 * Toma el color del texto (currentColor).
 */
export default function IconoUI({ nombre, tam = 18, grosor = 1.75, titulo, className }: {
  nombre: NombreIcono; tam?: number; grosor?: number; titulo?: string; className?: string;
}) {
  return (
    <svg
      className={className}
      width={tam}
      height={tam}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={grosor}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(titulo ? { role: "img", "aria-label": titulo } : { "aria-hidden": true })}
    >
      <path d={ICONOS_UI[nombre]} />
    </svg>
  );
}
