import { notFound } from "next/navigation";
import Header from "@/components/Header";
import FormTicket from "@/components/FormTicket";
import { createClient } from "@/lib/supabase/server";
import { folioTicket, fotoEquipo, sintomasDe, type EstadoTicket } from "@/lib/tickets";
import { guiasActivas } from "@/lib/guias";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reportar falla · Pasteko Mantenimiento" };

type Publico = { id: string; equipo: string; sucursal: string; slug: string | null };

/** Reporte de falla desde el QR del equipo: ya sabe la tienda y el equipo. */
export default async function ReportarFalla({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const [{ data }, { data: abiertos }] = await Promise.all([
    supabase.rpc("activo_publico", { p_id: decodeURIComponent(id) }),
    supabase.rpc("ticket_abierto", { p_activo: decodeURIComponent(id) }),
  ]);
  const eq = ((data ?? []) as Publico[])[0];
  if (!eq) notFound();
  const abierto = ((abiertos ?? []) as { folio: number; token: string; estado: EstadoTicket; creado: string }[])[0];

  let categoria: string | null = null;
  let faqs: { pregunta: string; pasos: string[]; aviso_seguridad: string | null }[] = [];
  if (eq.slug) {
    const { data: e } = await supabase.from("equipos").select("id, categoria").eq("slug", eq.slug).maybeSingle();
    if (e) {
      categoria = e.categoria;
      const { data: f } = await supabase.from("faqs").select("pregunta, pasos, aviso_seguridad").eq("equipo_id", e.id).order("orden");
      faqs = guiasActivas() ? f ?? [] : []; // sin guías no se muestra el paso "Prueba rápida"
    }
  }

  return (
    <>
      <Header items={[]} />
      <main className="wrap tk-main">
        <FormTicket activo={{ id: eq.id, equipo: eq.equipo, sucursal: eq.sucursal }} sintomas={sintomasDe(eq.equipo, categoria)} faqs={faqs} abierto={abierto ? { folio: folioTicket(abierto.folio), token: abierto.token } : null} foto={fotoEquipo(eq.slug, eq.equipo)} />
      </main>
    </>
  );
}
