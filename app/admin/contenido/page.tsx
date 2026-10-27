/* eslint-disable @next/next/no-img-element */
import QRCode from "qrcode";
import Icono, { ICONOS } from "@/components/Icono";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { youtubeId } from "@/lib/format";
import type { Equipo, Faq, Video } from "@/lib/types";
import { actualizarVideo, alternarPublicado, borrar, crearEquipo, crearFaq, crearVideo } from "../actions";

function Borrar({ tabla, id, que }: { tabla: string; id: number; que: string }) {
  return (
    <form action={borrar}>
      <input type="hidden" name="tabla" value={tabla} />
      <input type="hidden" name="id" value={id} />
      <button className="btn small danger" type="submit" aria-label={`Borrar ${que}`}>Borrar</button>
    </form>
  );
}

export default async function Contenido() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: e }, { data: v }, { data: f }] = await Promise.all([
    supabase.from("equipos").select("*").order("orden"),
    supabase.from("videos").select("*").order("orden"),
    supabase.from("faqs").select("*").order("orden"),
  ]);
  const equipos = (e ?? []) as Equipo[], videos = (v ?? []) as Video[], faqs = (f ?? []) as Faq[];
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const qrs = new Map(
    await Promise.all(
      equipos.map(async (eq) => [eq.id, await QRCode.toDataURL(`${base}/equipo/${eq.slug}`, { margin: 1, width: 240, color: { dark: "#111111", light: "#ffffff" } })] as const)
    )
  );

  return (
    <>
      <main className="wrap">
        <div className="head-row">
          <div>
            <p className="eyebrow">Panel de mantenimiento</p>
            <h1 className="page-h">Contenido para tiendas</h1>
            <p className="sub">Lo que publiques aquí aparece en la página pública en menos de 5 minutos. Imprime el QR de cada equipo y pégalo junto a él.</p>
          </div>
        </div>

        {equipos.map((eq) => {
          const vs = videos.filter((x) => x.equipo_id === eq.id), fs = faqs.filter((x) => x.equipo_id === eq.id);
          return (
            <details key={eq.id} className="card content-eq">
              <summary>
                <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span className="eq-ico"><Icono nombre={eq.icono} /></span>
                  <span>
                    <b style={{ fontSize: 18 }}>{eq.nombre}</b><br />
                    <small style={{ color: "var(--muted)" }}>{vs.length} videos · {fs.length} preguntas · /equipo/{eq.slug}</small>
                  </span>
                </span>
                <span className={`pill ${eq.publicado ? "ok" : "neutral"}`}>{eq.publicado ? "Publicado" : "Oculto"}</span>
              </summary>

              <div className="detail" style={{ marginTop: 16 }}>
                <div className="stack">
                  <div>
                    <p className="eyebrow">Videos</p>
                    {vs.map((x) => (
                      <div key={x.id} className="item-row">
                        <span style={{ minWidth: 0 }}>
                          <b>{x.titulo}</b> {x.duracion && <span className="num" style={{ color: "var(--muted)" }}>{x.duracion}</span>}
                          {!youtubeId(x.youtube_url) && <span className="pill warn" style={{ marginLeft: 6 }}>Falta enlace</span>}
                          <form action={actualizarVideo} style={{ display: "flex", gap: 6, marginTop: 6 }}>
                            <input type="hidden" name="id" value={x.id} />
                            <input name="youtube_url" defaultValue={x.youtube_url} aria-label="Enlace de YouTube" style={{ flex: 1, minWidth: 0, border: "1px solid var(--line)", borderRadius: 8, padding: 6, background: "var(--surface)" }} />
                            <button className="btn small" type="submit">Guardar</button>
                          </form>
                        </span>
                        <Borrar tabla="videos" id={x.id} que={x.titulo} />
                      </div>
                    ))}
                    <form action={crearVideo} className="inline-form">
                      <input type="hidden" name="equipo_id" value={eq.id} />
                      <label className="field w2">Título<input name="titulo" required /></label>
                      <label className="field">Duración<input name="duracion" placeholder="2:30" /></label>
                      <label className="field">Orden<input name="orden" type="number" defaultValue={vs.length + 1} /></label>
                      <label className="field w4">Enlace de YouTube (no listado)<input name="youtube_url" type="url" required placeholder="https://youtu.be/…" /></label>
                      <button className="btn primary" type="submit">Agregar video</button>
                    </form>
                  </div>

                  <div>
                    <p className="eyebrow">Problemas comunes</p>
                    {fs.map((x) => (
                      <div key={x.id} className="item-row">
                        <span><b>{x.pregunta}</b><br /><small style={{ color: "var(--muted)" }}>{x.pasos.length} pasos{x.aviso_seguridad ? " · con aviso de seguridad" : ""}</small></span>
                        <Borrar tabla="faqs" id={x.id} que={x.pregunta} />
                      </div>
                    ))}
                    <form action={crearFaq} className="inline-form">
                      <input type="hidden" name="equipo_id" value={eq.id} />
                      <label className="field w4">Problema (como lo diría la tienda)<input name="pregunta" required placeholder="Ej. La cafetera no calienta" /></label>
                      <label className="field w4">Pasos (uno por renglón)<textarea name="pasos" rows={4} required /></label>
                      <label className="field w2">Aviso de seguridad (opcional)<input name="aviso" /></label>
                      <label className="field">Orden<input name="orden" type="number" defaultValue={fs.length + 1} /></label>
                      <button className="btn primary" type="submit">Agregar</button>
                    </form>
                  </div>
                </div>

                <aside className="stack" style={{ alignItems: "flex-start" }}>
                  <p className="eyebrow">Código QR del equipo</p>
                  <img className="qr-img" src={qrs.get(eq.id)} alt={`QR de ${eq.nombre}`} />
                  <a className="btn small" href={qrs.get(eq.id)} download={`qr-${eq.slug}.png`}>Descargar QR</a>
                  {!base && <div className="note warn">Configura NEXT_PUBLIC_SITE_URL para que el QR apunte a tu dominio.</div>}
                  <form action={alternarPublicado}>
                    <input type="hidden" name="id" value={eq.id} />
                    <input type="hidden" name="publicado" value={String(!eq.publicado)} />
                    <button className="btn small" type="submit">{eq.publicado ? "Ocultar de tiendas" : "Publicar"}</button>
                  </form>
                  {!vs.length && !fs.length && <Borrar tabla="equipos" id={eq.id} que={eq.nombre} />}
                </aside>
              </div>
            </details>
          );
        })}

        <section className="card">
          <h3>Agregar equipo</h3>
          <form action={crearEquipo} className="inline-form">
            <label className="field w2">Nombre<input name="nombre" required placeholder="Ej. Freidora" /></label>
            <label className="field">Categoría<input name="categoria" placeholder="Ej. Cocina" /></label>
            <label className="field">Icono
              <select name="icono" defaultValue="general">{ICONOS.map((i) => <option key={i}>{i}</option>)}</select>
            </label>
            <label className="field">Orden<input name="orden" type="number" defaultValue={equipos.length + 1} /></label>
            <button className="btn primary" type="submit">Agregar equipo</button>
          </form>
        </section>
      </main>
    </>
  );
}
