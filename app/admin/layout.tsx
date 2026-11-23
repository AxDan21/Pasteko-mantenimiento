import type { ReactNode } from "react";
import AdminShell from "@/components/AdminShell";
import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const { perfil } = await requireAdmin();
  return <AdminShell nombre={perfil.nombre}>{children}</AdminShell>;
}
