import Header from "@/components/Header";
import BuscadorEquipos from "@/components/BuscadorEquipos";
import { publicClient } from "@/lib/supabase/public";
import type { Equipo, Faq, Video } from "@/lib/types";
import Link from "next/link";
import { guiasActivas } from "@/lib/guias";

export const revalidate = 300; // el contenido se actualiza al guardar en el panel

export default async function Inicio() {
  if (!guiasActivas()) return <InicioSinGuias />;
  const db = publicClient();
  const [{ data: equipos }, { data: faqs }, { data: videos }] = await Promise.all([
    db.from("equipos").select("*").eq("publicado", true).order("orden"),
    db.from("faqs").select("id, equipo_id, pregunta, pasos").order("orden"),
    db.from("videos").select("id, equipo_id, titulo").order("orden"),
  ]);

  return (
    <>
      <Header items={[{ href: "/login", label: "Acceso técnicos" }]} />
      <main className="wrap pt">
        <BuscadorEquipos
          equipos={(equipos ?? []) as Equipo[]}
          faqs={(faqs ?? []) as Pick<Faq, "id" | "equipo_id" | "pregunta" | "pasos">[]}
          videos={(videos ?? []) as Pick<Video, "id" | "equipo_id" | "titulo">[]}
          osticket={process.env.NEXT_PUBLIC_OSTICKET_URL}
        />
        <footer className="pt-foot">
          <span>Pasteko · Mantenimiento</span>
          <span>Hecho para que la tienda no se detenga.</span>
        </footer>
      </main>
    </>
  );
}

/** Portada mientras las guías están apagadas: explica cómo reportar con el QR. */
function InicioSinGuias() {
  return (
    <>
      <Header items={[]} />
      <main className="wrap" style={{ maxWidth: 620 }}>
        <div className="qa" style={{ paddingTop: 10 }}>
          <section className="qa-eq">
            <p className="eyebrow">Pasteko · Mantenimiento</p>
            <h1 style={{ fontSize: 32 }}>¿Algo dejó de funcionar?</h1>
            <p className="sub" style={{ margin: "10px auto 0", maxWidth: 420 }}>Escanea el código QR pegado en el equipo con la cámara de tu celular y repórtalo en menos de un minuto.</p>
          </section>
          <ol className="qa-como" aria-label="Cómo reportar">
            <li><b>1</b>Escanea el QR del equipo</li>
            <li><b>2</b>Dinos qué falla</li>
            <li><b>3</b>Sigue el avance en tu celular</li>
          </ol>
          <p className="qa-pie">¿Eres técnico o supervisor? <Link href="/login">Inicia sesión</Link></p>
        </div>
      </main>
    </>
  );
}
