import Header from "@/components/Header";
import BuscadorEquipos from "@/components/BuscadorEquipos";
import { publicClient } from "@/lib/supabase/public";
import type { Equipo, Faq, Video } from "@/lib/types";

export const revalidate = 300; // el contenido se actualiza al guardar en el panel

export default async function Inicio() {
  const db = publicClient();
  const [{ data: equipos }, { data: faqs }, { data: videos }] = await Promise.all([
    db.from("equipos").select("*").eq("publicado", true).order("orden"),
    db.from("faqs").select("id, equipo_id, pregunta, pasos").order("orden"),
    db.from("videos").select("id, equipo_id, titulo").order("orden"),
  ]);

  return (
    <>
      <Header items={[{ href: "/login", label: "Acceso técnicos" }]} />
      <main className="wrap">
        <BuscadorEquipos
          equipos={(equipos ?? []) as Equipo[]}
          faqs={(faqs ?? []) as Pick<Faq, "id" | "equipo_id" | "pregunta" | "pasos">[]}
          videos={(videos ?? []) as Pick<Video, "id" | "equipo_id" | "titulo">[]}
        />
      </main>
    </>
  );
}
