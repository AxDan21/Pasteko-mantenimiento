import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { distanciaKm, enlaceMaps, enMexico, kmCarretera, type Punto } from "@/lib/geo";
import { fCorta } from "@/lib/panel";
import { guardarBase, guardarUbicacion, quitarUbicacion } from "./actions";

export const metadata = { title: "Sucursales · Pasteko" };

type Suc = {
  id: number; nombre: string; zona: string; supervisor: string | null; direccion: string | null;
  lat: number | null; lng: number | null; ubicacion_fuente: string | null; ubicacion_precision: number | null; ubicacion_fecha: string | null;
};
type Tec = { id: string; nombre: string; zona: string | null; rol: string; base_nombre: string | null; base_lat: number | null; base_lng: number | null };

const MSG: Record<string, string> = {
  suc: "Ubicación guardada.",
  "suc-fuera": "Ubicación guardada, pero cae fuera de México: revisa que las coordenadas estén bien (latitud primero, luego longitud).",
  quitada: "Ubicación quitada.",
  base: "Base del técnico guardada.",
};
const FUENTE: Record<string, string> = { gps: "GPS en tienda", maps: "Google Maps", manual: "Coordenadas" };
const punto = (lat: number | null, lng: number | null): Punto | null => (lat != null && lng != null ? { lat, lng } : null);

export default async function Sucursales({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; s?: string }> }) {
  await requireAdmin();
  const f = await searchParams;
  const supabase = await createClient();
  const [{ data: s }, { data: t }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre, zona, supervisor, direccion, lat, lng, ubicacion_fuente, ubicacion_precision, ubicacion_fecha").eq("activa", true).order("zona").order("nombre"),
    supabase.from("perfiles").select("id, nombre, zona, rol, base_nombre, base_lat, base_lng").eq("rol", "tecnico").eq("activo", true).order("nombre"),
  ]);
  const sucursales = (s ?? []) as Suc[];
  const tecnicos = (t ?? []) as Tec[];
  const zonas = Array.from(new Set(sucursales.map((x) => x.zona)));
  const conUbi = sucursales.filter((x) => x.lat != null).length;
  const conBase = tecnicos.filter((x) => x.base_lat != null).length;
  const pct = sucursales.length ? Math.round((conUbi / sucursales.length) * 100) : 0;

  // Técnico más cercano a cada tienda (ya se puede ver en cuanto haya bases)
  const bases = tecnicos.map((x) => ({ x, p: punto(x.base_lat, x.base_lng) })).filter((b): b is { x: Tec; p: Punto } => !!b.p);
  const cercano = (p: Punto) => bases.map((b) => ({ ...b, km: kmCarretera(b.p, p) })).sort((a, b) => a.km - b.km)[0] ?? null;

  return (
    <main className="wrap">
      <div className="head-row">
        <div>
          <p className="eyebrow">Ubicaciones</p>
          <h1 className="page-h">Sucursales y técnicos</h1>
          <p className="sub" style={{ margin: 0 }}>La base para el mapa, el técnico más cercano y las rutas de preventivos.</p>
        </div>
      </div>

      {f.ok && MSG[f.ok] && <div className={`note ${f.ok === "suc-fuera" ? "warn" : "ok"}`} style={{ marginBottom: 14 }}>{MSG[f.ok]}</div>}
      {f.error && <div className="note bad" style={{ marginBottom: 14 }}>{f.error}</div>}

      <div className="kpis">
        <div className="kpi">
          <span className="eyebrow">Sucursales ubicadas</span>
          <span className="v">{conUbi}<span style={{ fontSize: 16, color: "var(--muted)" }}> de {sucursales.length}</span></span>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="kpi">
          <span className="eyebrow">Técnicos con base</span>
          <span className="v">{conBase}<span style={{ fontSize: 16, color: "var(--muted)" }}> de {tecnicos.length}</span></span>
          <span className="s">Ciudad o colonia, no su domicilio</span>
        </div>
        <div className="kpi">
          <span className="eyebrow">Con GPS de supervisor</span>
          <span className="v">{sucursales.filter((x) => x.ubicacion_fuente === "gps").length}</span>
          <span className="s">La más exacta: tomada en la tienda</span>
        </div>
        <div className="kpi">
          <span className="eyebrow">Zonas</span>
          <span className="v">{zonas.length}</span>
          <span className="s">{zonas.map((z) => `${z.replace(/^Zona\s*\d+\s*·\s*/i, "")} ${sucursales.filter((x) => x.zona === z && x.lat != null).length}/${sucursales.filter((x) => x.zona === z).length}`).join(" · ")}</span>
        </div>
      </div>

      <details className="card ubi-ayuda">
        <summary><b>¿Cómo saco la ubicación de Google Maps?</b></summary>
        <ol>
          <li><b>Opción rápida (en la computadora):</b> busca la tienda en Google Maps, dale <b>clic derecho sobre el pin</b> y da clic en las coordenadas que aparecen hasta arriba (por ejemplo <code>20.1234, -98.7654</code>): se copian solas. Pégalas aquí.</li>
          <li><b>Con el enlace:</b> en Maps toca <b>Compartir → Copiar vínculo</b> y pégalo aquí. Funciona con enlaces cortos (maps.app.goo.gl) y largos.</li>
          <li><b>La más exacta:</b> pide al supervisor que, estando en la tienda, toque <b>“Estoy en la tienda: guardar ubicación”</b> en su pantalla del censo.</li>
        </ol>
      </details>

      {zonas.map((z) => {
        const lista = sucursales.filter((x) => x.zona === z);
        return (
          <section key={z} className="card ubi-zona">
            <div className="ubi-zona-head">
              <h3>{z}</h3>
              <span className="sub">{lista.find((x) => x.supervisor)?.supervisor ?? "Sin supervisor"} · {lista.filter((x) => x.lat != null).length} de {lista.length} ubicadas</span>
            </div>
            <ul className="ubi-list">
              {lista.map((x) => {
                const p = punto(x.lat, x.lng);
                const c = p ? cercano(p) : null;
                return (
                  <li key={x.id} id={`s${x.id}`} className={f.s === String(x.id) ? "flash" : undefined}>
                    <div className="ubi-name">
                      <span className={`ubi-dot ${p ? (enMexico(p) ? "ok" : "warn") : ""}`} aria-hidden="true" />
                      <span>
                        <b>{x.nombre}</b>
                        {p ? (
                          <small>
                            {FUENTE[x.ubicacion_fuente ?? ""] ?? "Ubicada"}{x.ubicacion_precision ? ` ± ${x.ubicacion_precision} m` : ""}{x.ubicacion_fecha ? ` · ${fCorta(x.ubicacion_fecha.slice(0, 10))}` : ""}
                            {" · "}<a href={enlaceMaps(p)} target="_blank" rel="noopener noreferrer">ver en Maps</a>
                            {c && <> · técnico más cercano: <b>{c.x.nombre}</b> (~{c.km} km)</>}
                          </small>
                        ) : (
                          <small className="ubi-falta">Sin ubicación</small>
                        )}
                        {x.direccion && <small>{x.direccion}</small>}
                      </span>
                    </div>
                    <form action={guardarUbicacion} className="ubi-form">
                      <input type="hidden" name="id" value={x.id} />
                      <input name="ubicacion" required placeholder={p ? "Pega otro enlace o coordenadas para corregir" : "Pega enlace de Maps o coordenadas"} aria-label={`Ubicación de ${x.nombre}`} />
                      <button className="btn small primary" type="submit">{p ? "Cambiar" : "Guardar"}</button>
                    </form>
                    {p && (
                      <form action={quitarUbicacion} className="ubi-quitar">
                        <input type="hidden" name="id" value={x.id} />
                        <button className="link-btn" type="submit" title="Quitar ubicación">Quitar</button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <section className="card ubi-zona" id="tecnicos">
        <div className="ubi-zona-head">
          <h3>Base de cada técnico</h3>
          <span className="sub">Escribe la ciudad o colonia desde donde sale (ej. “Tula de Allende, Hidalgo”). Se ubica sola en el mapa.</span>
        </div>
        {tecnicos.length ? (
          <ul className="ubi-list">
            {tecnicos.map((x) => {
              const p = punto(x.base_lat, x.base_lng);
              const cubre = p ? sucursales.filter((s2) => s2.lat != null && distanciaKm(p, { lat: s2.lat!, lng: s2.lng! }) * 1.3 <= 60).length : 0;
              return (
                <li key={x.id} id={`t-${x.id}`}>
                  <div className="ubi-name">
                    <span className={`ubi-dot ${p ? "ok" : ""}`} aria-hidden="true" />
                    <span>
                      <b>{x.nombre}</b>
                      {p ? (
                        <small>{x.base_nombre ?? "Base"} · <a href={enlaceMaps(p)} target="_blank" rel="noopener noreferrer">ver en Maps</a> · {cubre} sucursal{cubre !== 1 ? "es" : ""} a menos de 60 km</small>
                      ) : (
                        <small className="ubi-falta">Sin base{x.zona ? ` · ${x.zona}` : ""}</small>
                      )}
                    </span>
                  </div>
                  <form action={guardarBase} className="ubi-form tec">
                    <input type="hidden" name="id" value={x.id} />
                    <input name="base_nombre" defaultValue={x.base_nombre ?? ""} placeholder="Ciudad o colonia, estado" aria-label={`Base de ${x.nombre}`} />
                    <input name="ubicacion" placeholder="Enlace o coordenadas (opcional)" aria-label={`Coordenadas de la base de ${x.nombre}`} />
                    <button className="btn small primary" type="submit">Guardar</button>
                  </form>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="sub">No hay técnicos activos. Dalos de alta en Técnicos y proveedores.</p>
        )}
      </section>
    </main>
  );
}
