/* eslint-disable @next/next/no-img-element */
import QRCode from "qrcode";
import BotonConfirmar from "@/components/BotonConfirmar";
import Desplegable from "@/components/Desplegable";
import Encabezado from "@/components/Encabezado";
import { Estado } from "@/components/Insignias";
import Icono, { ICONOS } from "@/components/Icono";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { youtubeId } from "@/lib/format";
import type { Equipo, Faq, Video } from "@/lib/types";
import { actualizarVideo, alternarPublicado, alternarVigente, borrar, crearEquipo, crearFaq, crearVideo } from "../actions";

function Borrar({ tabla, id, que }: { tabla: string; id: number; que: string }) {
  return (
    <form action={borrar}>
      <input type="hidden" name="tabla" value={tabla} />
      <input type="hidden" name="id" value={id} />
      <BotonConfirmar mensaje={`¿Borrar "${que}"? Dejará de verse en la página de tiendas y no se puede deshacer.`}>Borrar<span className="sr-only"> {que}</span></BotonConfirmar>
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
      equipos.map(async (eq) => [eq.id, await QRCode.toDataURL(`${base}/equipo/${eq.slug}`, { margin: 1, width: 240, color: { dark: "#1d1d1b", light: "#ffffff" } })] as const)
    )
  );

  return (
    <>
      <main className="wrap cnt">
        <Encabezado titulo="Contenido para tiendas" sub="Videos y problemas comunes por tipo de equipo. Lo que publiques aparece en la página pública en menos de 5 minutos. Imprime el QR de cada equipo y pégalo junto a él." />

        {equipos.map((eq) => {
          const vs = videos.filter((x) => x.equipo_id === eq.id), fs = faqs.filter((x) => x.equipo_id === eq.id);
          return (
            <details key={eq.id} className="card content-eq">
              <summary>
                <span className="cnt-eq">
                  <span className="eq-ico"><Icono nombre={eq.icono} /></span>
                  <span>
                    <b className="cnt-eq-n">{eq.nombre}</b>
                    <small className="srv-sub">{eq.categoria}{eq.prefijo ? ` · código PK-${eq.prefijo}` : ""} · {vs.length} videos · {fs.length} preguntas</small>
                  </span>
                </span>
                {eq.vigente === false ? <Estado tono="neutral">Fuera de catálogo</Estado> : <Estado tono={eq.publicado ? "ok" : "neutral"}>{eq.publicado ? "Con guía para tiendas" : "Sin guía (solo censo)"}</Estado>}
              </summary>

              <div className="detail cnt-det">
                <div className="stack">
                  <div>
                    <p className="eyebrow">Videos</p>
                    {vs.map((x) => (
                      <div key={x.id} className="item-row">
                        <span className="cnt-item">
                          <b>{x.titulo}</b> {x.duracion && <span className="num srv-sub cnt-dur">{x.duracion}</span>}
                          {!youtubeId(x.youtube_url) && <> <Estado tono="warn">Falta enlace</Estado></>}
                          <form action={actualizarVideo} className="cnt-url">
                            <input type="hidden" name="id" value={x.id} />
                            <input name="youtube_url" defaultValue={x.youtube_url} aria-label={`Enlace de YouTube de ${x.titulo}`} className="mini-input" />
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
                        <span><b>{x.pregunta}</b><small className="srv-sub">{x.pasos.length} pasos{x.aviso_seguridad ? " · con aviso de seguridad" : ""}</small></span>
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

                <aside className="stack cnt-lado">
                  <p className="eyebrow">Código QR del equipo</p>
                  <img className="qr-img" src={qrs.get(eq.id)} alt={`QR de ${eq.nombre}`} />
                  <a className="btn small" href={qrs.get(eq.id)} download={`qr-${eq.slug}.png`}>Descargar QR</a>
                  {!base && <div className="note warn">Configura NEXT_PUBLIC_SITE_URL para que el QR apunte a tu dominio.</div>}
                  <form action={alternarPublicado}>
                    <input type="hidden" name="id" value={eq.id} />
                    <input type="hidden" name="publicado" value={String(!eq.publicado)} />
                    <button className="btn small" type="submit">{eq.publicado ? "Ocultar de tiendas" : "Publicar"}</button>
                  </form>
                  <form action={alternarVigente}>
                    <input type="hidden" name="id" value={eq.id} />
                    <input type="hidden" name="vigente" value={String(eq.vigente === false)} />
                    <button className="btn small" type="submit">{eq.vigente === false ? "Regresar al catálogo" : "Sacar del catálogo"}</button>
                  </form>
                  {!vs.length && !fs.length && <Borrar tabla="equipos" id={eq.id} que={eq.nombre} />}
                </aside>
              </div>
            </details>
          );
        })}

        <Desplegable id="nuevo" titulo="Agregar tipo de equipo" detalle="Aparece en el catálogo del censo; publícalo para que las tiendas vean su guía.">
          <form action={crearEquipo} className="inline-form">
            <label className="field w2">Nombre<input name="nombre" required placeholder="Ej. Freidora" /></label>
            <label className="field">Categoría<input name="categoria" list="cats" placeholder="Ej. Refrigeración" /><datalist id="cats">{Array.from(new Set(equipos.filter((e) => e.vigente !== false).map((e) => e.categoria))).map((c) => <option key={c} value={c} />)}</datalist></label>
            <label className="field">Icono
              <select name="icono" defaultValue="general">{ICONOS.map((i) => <option key={i}>{i}</option>)}</select>
            </label>
            <label className="field">Orden<input name="orden" type="number" defaultValue={equipos.length + 1} /></label>
            <label className="field">Prefijo del código<input name="prefijo" maxLength={4} placeholder="Ej. FRE" className="cnt-pref" /></label>
            <label className="field">Guía para tiendas<select name="publicado" defaultValue="false"><option value="false">No (solo censo)</option><option value="true">Sí, publicar</option></select></label>
            <button className="btn primary" type="submit">Agregar equipo</button>
          </form>
        </Desplegable>
      </main>
    </>
  );
}
