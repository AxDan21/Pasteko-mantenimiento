import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Icono from "@/components/Icono";
import FormTicket from "@/components/FormTicket";
import { createClient } from "@/lib/supabase/server";
import { ESTADOS, folioTicket, hace, sintomasDe, type EstadoTicket } from "@/lib/tickets";

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
      faqs = f ?? [];
    }
  }
  const icono = eq.slug === "refrigeracion" ? "refri" : eq.slug ?? "general";

  return (
    <>
      <Header items={[]} />
      <main className="wrap tk-main">
        <div className="tk-equipo">
          <span className="eq-ico"><Icono nombre={icono} size={26} /></span>
          <div>
            <p className="eyebrow">Reportar falla · {eq.sucursal}</p>
            <h1>{eq.equipo}</h1>
          </div>
        </div>

        {abierto && (
          <Link href={`/t/${abierto.token}`} className="tk-ya card">
            <span className={`pill ${ESTADOS[abierto.estado].clase}`}>{ESTADOS[abierto.estado].nombre}</span>
            <span>
              <b>Este equipo ya tiene un reporte abierto</b>
              <small>{folioTicket(abierto.folio)} · hace {hace(abierto.creado)}. Toca para ver el avance. Si envías otro, se suma a ese mismo.</small>
            </span>
          </Link>
        )}

        <FormTicket activo={{ id: eq.id, equipo: eq.equipo, sucursal: eq.sucursal }} sintomas={sintomasDe(eq.equipo, categoria)} faqs={faqs} />
      </main>
    </>
  );
}
