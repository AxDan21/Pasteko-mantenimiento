import { Suspense, type ReactNode } from "react";
import AdminNav from "@/components/AdminNav";
import BarraPanel from "@/components/BarraPanel";
import { contadoresAdmin } from "@/lib/contadores";
import { createClient } from "@/lib/supabase/server";

/** Estructura del panel de administración: navegación lateral agrupada (barra inferior en móvil), barra superior y contenido. */
export default async function AdminShell({ nombre, children }: { nombre: string; children: ReactNode }) {
  const contadores = await contadoresAdmin(await createClient());
  return (
    <div className="ash">
      <AdminNav nombre={nombre} contadores={contadores} />
      <div className="ash-main">
        <Suspense fallback={<div className="bp" />}>
          <BarraPanel />
        </Suspense>
        {children}
      </div>
    </div>
  );
}
