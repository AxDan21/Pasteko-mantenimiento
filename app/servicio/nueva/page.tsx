import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import FormHoja from "@/components/FormHoja";
import { sesion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export default async function NuevaHoja({ searchParams }: { searchParams: Promise<{ activo?: string; ticket?: string }> }) {
  const { activo, ticket } = await searchParams;
  const s = await sesion();
  if (!s?.perfil) redirect("/login");
  if (s.perfil.rol === "supervisor") redirect("/censo");
  if (s.perfil.rol === "consulta") redirect("/aperturas");
  const supabase = await createClient();
  const [{ data: sucursales }, { data: equipos }, { data: activos }, { data: preventivos }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre, zona").eq("activa", true).order("zona").order("nombre"),
    supabase.from("equipos").select("nombre").eq("vigente", true).order("orden"),
    supabase.from("activos").select("id, sucursal_id, equipo, marca, modelo").eq("activo", true).order("id"),
    supabase.from("preventivos").select("id, fecha, sucursal_id, equipo, activo_id, tarea").eq("hecho", false).order("fecha"),
  ]);

  return (
    <>
      <Header items={[{ href: "/servicio", label: "Mis hojas" }]} salir sub={s.perfil.nombre} />
      <main className="wrap" style={{ maxWidth: 820 }}>
        <div className="detail-head">
          <Link href="/servicio" className="btn small">
            ← Mis hojas
          </Link>
          <div>
            <p className="eyebrow">Técnico · {s.perfil.nombre}</p>
            <h1>Nueva hoja de servicio</h1>
          </div>
        </div>
        <FormHoja
          sucursales={sucursales ?? []}
          equipos={(equipos ?? []).map((e) => e.nombre as string)}
          activos={activos ?? []}
          preventivos={preventivos ?? []}
          activoInicial={activo?.toUpperCase()}
          ticketInicial={ticket && /^MT-\d+$/i.test(ticket) ? ticket.toUpperCase() : undefined}
          propio={s.perfil.rol !== "admin" && (s.perfil.tipo_tecnico ?? "propio") === "propio"}
        />
      </main>
    </>
  );
}
