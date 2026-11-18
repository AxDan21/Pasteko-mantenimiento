import { redirect } from "next/navigation";
import { inicioDe, sesion } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Punto de entrada de la app instalada: lleva a cada quien a su sección según su rol. */
export default async function Inicio() {
  const s = await sesion();
  if (!s?.perfil?.activo) redirect("/login");
  redirect(inicioDe(s.perfil.rol));
}
