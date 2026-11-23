import { Suspense, type ReactNode } from "react";
import AdminNav from "@/components/AdminNav";
import BarraPanel from "@/components/BarraPanel";
import { contadoresAdmin } from "@/lib/contadores";
import { createClient } from "@/lib/supabase/server";

/** Estructura del panel de administración: navegación lateral agrupada (barra inferior en móvil), barra superior y contenido. */
export default async function AdminShell({ nombre, children }: { nombre: string; children: ReactNode }) {
  const db = await createClient();
  const [contadores, { data: suc }] = await Promise.all([
    contadoresAdmin(db),
    db.from("sucursales").select("zona").eq("activa", true),
  ]);
  const zonas = Array.from(new Set((suc ?? []).map((s) => s.zona as string))).filter(Boolean).sort();
  return (
    <div className="ash">
      <AdminNav nombre={nombre} contadores={contadores} />
      <div className="ash-main">
        <Suspense fallback={<div className="bp" />}>
          <BarraPanel zonas={zonas} avisos={contadores.avisos} />
        </Suspense>
        {children}
      </div>
    </div>
  );
}
