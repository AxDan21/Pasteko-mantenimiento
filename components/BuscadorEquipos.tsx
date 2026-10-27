"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import Icono from "@/components/Icono";
import type { Equipo, Faq, Video } from "@/lib/types";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Props = {
  equipos: Equipo[];
  faqs: Pick<Faq, "id" | "equipo_id" | "pregunta" | "pasos">[];
  videos: Pick<Video, "id" | "equipo_id" | "titulo">[];
};

export default function BuscadorEquipos({ equipos, faqs, videos }: Props) {
  const [q, setQ] = useState("");
  const porId = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);

  const resultados = useMemo(() => {
    const t = norm(q.trim());
    if (!t) return [];
    const r: { key: string; href: string; titulo: string; equipo: string; tipo: "Pregunta" | "Video" }[] = [];
    for (const f of faqs) {
      const e = porId.get(f.equipo_id);
      if (e && norm(`${f.pregunta} ${e.nombre} ${f.pasos.join(" ")}`).includes(t))
        r.push({ key: `f${f.id}`, href: `/equipo/${e.slug}#faq-${f.id}`, titulo: f.pregunta, equipo: e.nombre, tipo: "Pregunta" });
    }
    for (const v of videos) {
      const e = porId.get(v.equipo_id);
      if (e && norm(`${v.titulo} ${e.nombre}`).includes(t))
        r.push({ key: `v${v.id}`, href: `/equipo/${e.slug}`, titulo: v.titulo, equipo: e.nombre, tipo: "Video" });
    }
    return r;
  }, [q, faqs, videos, porId]);

  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">Tiendas y supervisores</p>
          <h1>
            ¿Qué equipo te está <em>dando problemas?</em>
          </h1>
          <p>Videos cortos y pasos sencillos para resolver lo más común. Si no se resuelve, te decimos cómo levantar el ticket.</p>
        </div>
        <div>
          <label className="search">
            <span className="eyebrow" style={{ display: "block", marginBottom: 6, color: "var(--hero-muted)" }}>
              Buscar
            </span>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ top: "calc(50% + 13px)" }} aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              id="buscar"
              type="search"
              placeholder="Ej. no enfría, gotea, café aguado"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              autoComplete="off"
            />
          </label>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mascota" src="/mascota.webp" alt="Mascota de Pasteko saludando" />
      </section>

      {q.trim() ? (
        resultados.length ? (
          <>
            <p className="eyebrow" style={{ marginBottom: 10 }}>
              {resultados.length} resultado{resultados.length > 1 ? "s" : ""}
            </p>
            <div className="results">
              {resultados.map((r) => (
                <Link key={r.key} href={r.href} className="res">
                  <span>
                    <b>{r.titulo}</b>
                    <small>{r.equipo}</small>
                  </span>
                  <span className={`pill ${r.tipo === "Video" ? "ok" : "neutral"}`}>{r.tipo}</span>
                </Link>
              ))}
            </div>
          </>
        ) : (
          <div className="card">
            <h3>No encontramos &quot;{q}&quot;</h3>
            <p className="sub">
              Prueba con el nombre del equipo o lo que ves, por ejemplo &quot;no enfría&quot; o &quot;gotea&quot;. Si no aparece,
              levanta un ticket en osTicket.
            </p>
          </div>
        )
      ) : (
        <div className="grid-eq">
          {equipos.map((e) => {
            const nv = videos.filter((v) => v.equipo_id === e.id).length;
            const nf = faqs.filter((f) => f.equipo_id === e.id).length;
            return (
              <Link key={e.id} href={`/equipo/${e.slug}`} className="eq">
                <span className="eq-ico">
                  <Icono nombre={e.icono} />
                </span>
                <span>
                  <h3>{e.nombre}</h3>
                  <span>
                    {nv} video{nv !== 1 ? "s" : ""} · {nf} problema{nf !== 1 ? "s" : ""} comunes
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
