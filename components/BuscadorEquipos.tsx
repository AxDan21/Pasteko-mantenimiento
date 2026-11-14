"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import Icono from "@/components/Icono";
import type { Equipo, Faq, Video } from "@/lib/types";

/** Quita acentos y mayúsculas conservando el largo (para poder resaltar la coincidencia). */
const norm = (s: string) => Array.from(s).map((c) => c.normalize("NFD").replace(/[̀-ͯ]/g, "") || c).join("").toLowerCase();

type Props = {
  equipos: Equipo[];
  faqs: Pick<Faq, "id" | "equipo_id" | "pregunta" | "pasos">[];
  videos: Pick<Video, "id" | "equipo_id" | "titulo">[];
  osticket?: string;
};

function Resaltar({ texto, buscado }: { texto: string; buscado: string }) {
  const i = buscado ? norm(texto).indexOf(buscado) : -1;
  if (i < 0) return <>{texto}</>;
  return <>{texto.slice(0, i)}<mark>{texto.slice(i, i + buscado.length)}</mark>{texto.slice(i + buscado.length)}</>;
}

const IcoVideo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z" /></svg>
);
const IcoPasos = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" /></svg>
);
const Flecha = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);

export default function BuscadorEquipos({ equipos, faqs, videos, osticket }: Props) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const porId = useMemo(() => new Map(equipos.map((e) => [e.id, e])), [equipos]);
  const t = norm(q.trim());

  const conteo = useMemo(() => {
    const m = new Map<number, { nv: number; nf: number }>();
    equipos.forEach((e) => m.set(e.id, { nv: 0, nf: 0 }));
    videos.forEach((v) => { const c = m.get(v.equipo_id); if (c) c.nv++; });
    faqs.forEach((f) => { const c = m.get(f.equipo_id); if (c) c.nf++; });
    return m;
  }, [equipos, videos, faqs]);

  const resultados = useMemo(() => {
    if (!t) return [];
    const r: { key: string; href: string; titulo: string; equipo: string; tipo: "Solución" | "Video" | "Equipo"; icono: string }[] = [];
    for (const e of equipos) {
      if (norm(e.nombre).includes(t)) r.push({ key: `e${e.id}`, href: `/equipo/${e.slug}`, titulo: e.nombre, equipo: e.categoria, tipo: "Equipo", icono: e.icono });
    }
    for (const f of faqs) {
      const e = porId.get(f.equipo_id);
      if (e && norm(`${f.pregunta} ${e.nombre} ${f.pasos.join(" ")}`).includes(t))
        r.push({ key: `f${f.id}`, href: `/equipo/${e.slug}#faq-${f.id}`, titulo: f.pregunta, equipo: e.nombre, tipo: "Solución", icono: e.icono });
    }
    for (const v of videos) {
      const e = porId.get(v.equipo_id);
      if (e && norm(`${v.titulo} ${e.nombre}`).includes(t))
        r.push({ key: `v${v.id}`, href: `/equipo/${e.slug}`, titulo: v.titulo, equipo: e.nombre, tipo: "Video", icono: e.icono });
    }
    return r;
  }, [t, equipos, faqs, videos, porId]);

  const categorias = useMemo(() => Array.from(new Set(equipos.map((e) => e.categoria).filter(Boolean))), [equipos]);
  // Primero los equipos que ya tienen contenido
  const lista = useMemo(() => {
    const con = (e: Equipo) => { const c = conteo.get(e.id)!; return c.nv + c.nf > 0 ? 0 : 1; };
    return equipos.filter((e) => !cat || e.categoria === cat).sort((a, b) => con(a) - con(b) || a.orden - b.orden);
  }, [equipos, cat, conteo]);
  const frecuentes = faqs.slice(0, 6).map((f) => ({ f, e: porId.get(f.equipo_id) })).filter((x): x is { f: Props["faqs"][number]; e: Equipo } => !!x.e);
  const atajos = frecuentes.slice(0, 4);

  return (
    <>
      {/* ---------- Encabezado ---------- */}
      <section className="pt-hero">
        <div className="pt-hero-txt">
          <p className="pt-kicker"><i aria-hidden="true" />Portal de sucursales</p>
          <h1>¿Qué equipo te está <em>dando problemas?</em></h1>
          <p className="pt-lede">Videos cortos y pasos sencillos para resolver lo más común en minutos. Si no se resuelve, te decimos cómo levantar el ticket.</p>

          <label className="pt-search">
            <span className="sr-only">Buscar un problema o equipo</span>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input id="buscar" type="search" placeholder="Describe el problema: no enfría, gotea, café aguado…" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
            {q && <button type="button" onClick={() => setQ("")} aria-label="Borrar búsqueda">×</button>}
          </label>

          {atajos.length > 0 && (
            <div className="pt-atajos">
              <span>Lo más buscado:</span>
              {atajos.map(({ f, e }) => (
                <Link key={f.id} href={`/equipo/${e.slug}#faq-${f.id}`}>{f.pregunta.length > 34 ? `${f.pregunta.slice(0, 32)}…` : f.pregunta}</Link>
              ))}
            </div>
          )}

          <ul className="pt-cifras" aria-label="Contenido disponible">
            <li><b>{equipos.length}</b> equipos</li>
            <li><b>{videos.length}</b> videos</li>
            <li><b>{faqs.length}</b> soluciones paso a paso</li>
          </ul>
        </div>
        <div className="pt-hero-art" aria-hidden="true">
          <span className="pt-sol" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascota.webp" alt="" />
        </div>
      </section>

      {t ? (
        /* ---------- Resultados ---------- */
        <section className="pt-sec">
          <div className="pt-sec-h">
            <h2>{resultados.length ? `${resultados.length} resultado${resultados.length > 1 ? "s" : ""} para “${q.trim()}”` : `Sin resultados para “${q.trim()}”`}</h2>
            <button type="button" className="pt-link" onClick={() => setQ("")}>Ver todos los equipos</button>
          </div>
          {resultados.length ? (
            <div className="pt-results">
              {resultados.map((r) => (
                <Link key={r.key} href={r.href} className="pt-res">
                  <span className="pt-res-ico"><Icono nombre={r.icono} size={22} /></span>
                  <span className="pt-res-txt"><b><Resaltar texto={r.titulo} buscado={t} /></b><small>{r.equipo}</small></span>
                  <span className={`pt-tag ${r.tipo === "Video" ? "video" : r.tipo === "Equipo" ? "equipo" : ""}`}>{r.tipo === "Video" && <IcoVideo />}{r.tipo}</span>
                  <span className="pt-go"><Flecha /></span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="pt-vacio">
              <b>No encontramos ese problema todavía.</b>
              <p>Prueba con el nombre del equipo o con lo que ves: “no enfría”, “gotea”, “no enciende”. Si no aparece, levanta un ticket y lo atendemos.</p>
              {osticket && <a className="pt-btn" href={osticket} target="_blank" rel="noopener noreferrer">Levantar ticket <Flecha /></a>}
            </div>
          )}
        </section>
      ) : (
        <>
          {/* ---------- Cómo funciona ---------- */}
          <ol className="pt-pasos" aria-label="Cómo funciona">
            <li><span>1</span><div><b>Elige tu equipo</b><small>O escribe arriba lo que le pasa.</small></div></li>
            <li><span>2</span><div><b>Sigue los pasos o mira el video</b><small>Soluciones de 2 a 5 minutos, sin herramienta.</small></div></li>
            <li><span>3</span><div><b>¿No se resolvió? Levanta ticket</b><small>Con foto y sucursal: Mantenimiento lo atiende.</small></div></li>
          </ol>

          {/* ---------- Equipos ---------- */}
          <section className="pt-sec">
            <div className="pt-sec-h">
              <h2>Elige tu equipo</h2>
              {categorias.length > 1 && (
                <div className="pt-filtros" role="group" aria-label="Filtrar por categoría">
                  <button type="button" aria-pressed={!cat} onClick={() => setCat("")}>Todos</button>
                  {categorias.map((c) => <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(cat === c ? "" : c)}>{c}</button>)}
                </div>
              )}
            </div>
            <div className="pt-grid">
              {lista.map((e) => {
                const { nv, nf } = conteo.get(e.id)!;
                const listo = nv + nf > 0;
                return (
                  <Link key={e.id} href={`/equipo/${e.slug}`} className={`pt-eq${listo ? "" : " pronto"}`}>
                    <span className="pt-eq-ico"><Icono nombre={e.icono} size={30} /></span>
                    <span className="pt-eq-txt">
                      <small>{e.categoria}</small>
                      <b>{e.nombre}</b>
                      {listo ? (
                        <span className="pt-eq-meta">
                          {nv > 0 && <span><IcoVideo />{nv} video{nv !== 1 ? "s" : ""}</span>}
                          {nf > 0 && <span><IcoPasos />{nf} solucion{nf !== 1 ? "es" : ""}</span>}
                        </span>
                      ) : (
                        <span className="pt-eq-meta"><span className="prep">Contenido en preparación</span></span>
                      )}
                    </span>
                    <span className="pt-go"><Flecha /></span>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* ---------- Problemas frecuentes ---------- */}
          {frecuentes.length > 0 && (
            <section className="pt-sec">
              <div className="pt-sec-h"><h2>Problemas frecuentes</h2></div>
              <div className="pt-frec">
                {frecuentes.map(({ f, e }) => (
                  <Link key={f.id} href={`/equipo/${e.slug}#faq-${f.id}`} className="pt-fq">
                    <span className="pt-fq-n">{f.pasos.length}<small>paso{f.pasos.length !== 1 ? "s" : ""}</small></span>
                    <span className="pt-res-txt"><b>{f.pregunta}</b><small>{e.nombre}</small></span>
                    <span className="pt-go"><Flecha /></span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ---------- Cierre: ticket ---------- */}
      <section className="pt-ticket">
        <div>
          <h2>¿No encontraste tu problema?</h2>
          <p>Levanta un ticket. Para atenderte más rápido ten a la mano:</p>
          <ul>
            <li>Sucursal y nombre de quien reporta</li>
            <li>Equipo y qué está pasando</li>
            <li>Una foto o video corto de la falla</li>
          </ul>
        </div>
        {osticket ? (
          <a className="pt-btn grande" href={osticket} target="_blank" rel="noopener noreferrer">Levantar ticket <Flecha /></a>
        ) : (
          <span className="pt-btn grande off">Levanta tu ticket en osTicket</span>
        )}
      </section>
    </>
  );
}
