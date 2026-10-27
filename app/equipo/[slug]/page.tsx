import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import Icono from "@/components/Icono";
import CopiarResumen from "@/components/CopiarResumen";
import { publicClient } from "@/lib/supabase/public";
import { youtubeId } from "@/lib/format";
import type { Equipo, Faq, Video } from "@/lib/types";

export const revalidate = 300;

export async function generateStaticParams() {
  const { data } = await publicClient().from("equipos").select("slug").eq("publicado", true);
  return (data ?? []).map((e) => ({ slug: e.slug as string }));
}

export default async function FichaEquipo({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = publicClient();
  const { data: equipo } = await db.from("equipos").select("*").eq("slug", slug).eq("publicado", true).maybeSingle<Equipo>();
  if (!equipo) notFound();

  const [{ data: videos }, { data: faqs }] = await Promise.all([
    db.from("videos").select("*").eq("equipo_id", equipo.id).order("orden"),
    db.from("faqs").select("*").eq("equipo_id", equipo.id).order("orden"),
  ]);
  const osticket = process.env.NEXT_PUBLIC_OSTICKET_URL;

  return (
    <>
      <Header items={[{ href: "/login", label: "Acceso técnicos" }]} />
      <main className="wrap">
        <div className="detail-head">
          <Link href="/" className="btn small">
            ← Todos los equipos
          </Link>
          <span className="eq-ico">
            <Icono nombre={equipo.icono} size={28} />
          </span>
          <div>
            <p className="eyebrow">{equipo.categoria}</p>
            <h1>{equipo.nombre}</h1>
          </div>
        </div>

        <div className="detail">
          <div>
            {(videos as Video[] | null)?.length ? (
              <>
                <h2 className="sec-title">Videos de capacitación</h2>
                <div className="videos">
                  {(videos as Video[]).map((v) => {
                    const id = youtubeId(v.youtube_url);
                    return (
                      <div key={v.id} className="vid">
                        {id ? (
                          <iframe
                            src={`https://www.youtube-nocookie.com/embed/${id}?rel=0`}
                            title={v.titulo}
                            loading="lazy"
                            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        ) : (
                          <div className="ph">Video pendiente de publicar</div>
                        )}
                        <div className="vt">
                          <span>{v.titulo}</span>
                          {v.duracion && <span className="num" style={{ color: "var(--muted)", fontWeight: 400 }}>{v.duracion}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}

            <h2 className="sec-title">Problemas comunes</h2>
            {(faqs as Faq[] | null)?.length ? (
              (faqs as Faq[]).map((f) => (
                <details key={f.id} id={`faq-${f.id}`} className="faq">
                  <summary>{f.pregunta}</summary>
                  <ol>
                    {f.pasos.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ol>
                  {f.aviso_seguridad && <div className="note bad safety">⚠ {f.aviso_seguridad}</div>}
                </details>
              ))
            ) : (
              <p className="sub">Aún no hay problemas comunes para este equipo.</p>
            )}
          </div>

          <aside className="ticket">
            <p className="eyebrow">Si no se resolvió</p>
            <h3>Levanta un ticket en osTicket</h3>
            <p className="sub">Incluye esto para que el técnico llegue con lo necesario:</p>
            <ul>
              <li>Sucursal y equipo ({equipo.nombre})</li>
              <li>Número de serie de la etiqueta del equipo</li>
              <li>Qué pasa y desde cuándo</li>
              <li>Qué pasos de esta guía ya intentaste</li>
              <li>Foto o video corto de la falla</li>
            </ul>
            <div className="actions">
              <CopiarResumen equipo={equipo.nombre} />
              {osticket && (
                <a className="btn primary" href={osticket} target="_blank" rel="noopener noreferrer">
                  Abrir osTicket
                </a>
              )}
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
