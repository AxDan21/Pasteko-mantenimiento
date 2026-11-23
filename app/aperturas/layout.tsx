import type { ReactNode } from "react";
import Header from "@/components/Header";
import AdminShell from "@/components/AdminShell";
import AperturasTabs from "@/components/AperturasTabs";
import { requireAperturas } from "@/lib/auth";

export default async function AperturasLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { perfil, puedeEditar } = await requireAperturas();
  // El administrador ve Aperturas dentro del mismo panel; el rol de consulta conserva su encabezado simple.
  if (puedeEditar) {
    return (
      <AdminShell nombre={perfil.nombre}>
        <AperturasTabs admin />
        {children}
      </AdminShell>
    );
  }
  return (
    <>
      <Header salir sub={`${perfil.nombre} · solo consulta`} />
      <AperturasTabs admin={false} />
      {children}
    </>
  );
}
