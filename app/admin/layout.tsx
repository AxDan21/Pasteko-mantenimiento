import type { ReactNode } from "react";
import Header from "@/components/Header";
import AdminTabs from "@/components/AdminTabs";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { perfil } = await requireAdmin();
  return (
    <>
      <Header items={[{ href: "/servicio", label: "Mis hojas" }]} salir sub={perfil.nombre} />
      <AdminTabs />
      {children}
    </>
  );
}
