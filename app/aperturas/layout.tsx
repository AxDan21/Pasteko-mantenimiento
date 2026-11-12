import type { ReactNode } from "react";
import Header from "@/components/Header";
import AperturasTabs from "@/components/AperturasTabs";
import { requireAperturas } from "@/lib/auth";

export default async function AperturasLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { perfil, puedeEditar } = await requireAperturas();
  return (
    <>
      <Header salir sub={puedeEditar ? perfil.nombre : `${perfil.nombre} · solo consulta`} />
      <AperturasTabs admin={puedeEditar} />
      {children}
    </>
  );
}
