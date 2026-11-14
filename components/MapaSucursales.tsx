"use client";
import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import CopiarTexto from "@/components/CopiarTexto";
import { enlaceComoLlegar, enlaceMaps } from "@/lib/geo";
import { mxn } from "@/lib/format";

export type PinSucursal = {
  id: number; nombre: string; zona: string; supervisor: string | null; direccion: string | null; lat: number; lng: number;
  estado: "rojo" | "amarillo" | "verde";
  vencidos: string[]; proximos: string[]; ultimaVisita: string | null; equipos: number; gastoMes: number;
  cercanos: { nombre: string; km: number }[];
};
export type PinTecnico = { id: string; nombre: string; base: string; lat: number; lng: number };

const ESTADOS = {
  rojo: { t: "Preventivo vencido", corto: "Vencidos", orden: 0 },
  amarillo: { t: "Preventivo en 7 días", corto: "Próximos", orden: 1 },
  verde: { t: "Al día", corto: "Al día", orden: 2 },
} as const;
type Estado = keyof typeof ESTADOS;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const iniciales = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const TILES = {
  claro: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
  oscuro: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
};
const ATRIBUCION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

export default function MapaSucursales({ sucursales, tecnicos }: { sucursales: PinSucursal[]; tecnicos: PinTecnico[] }) {
  const caja = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const L = useRef<typeof Leaflet | null>(null);
  const mapa = useRef<Leaflet.Map | null>(null);
  const capa = useRef<Leaflet.LayerGroup | null>(null);
  const [listo, setListo] = useState(false);
  const [zona, setZona] = useState("");
  const [filtro, setFiltro] = useState<Estado | "">("");
  const [verTec, setVerTec] = useState(true);
  const [sel, setSel] = useState<number | null>(null);

  const zonas = useMemo(() => Array.from(new Set(sucursales.map((s) => s.zona))), [sucursales]);
  const enZona = sucursales.filter((s) => !zona || s.zona === zona);
  const visibles = enZona.filter((s) => !filtro || s.estado === filtro)
    .sort((a, b) => ESTADOS[a.estado].orden - ESTADOS[b.estado].orden || a.nombre.localeCompare(b.nombre, "es"));
  const actual = sucursales.find((s) => s.id === sel) ?? null;

  // Crear el mapa una sola vez (Leaflet solo existe en el navegador)
  useEffect(() => {
    let vivo = true;
    let quitarTema: (() => void) | undefined;
    (async () => {
      const mod = await import("leaflet");
      // Leaflet se publica como CommonJS: según el empaquetador llega en .default o directo
      const lib = ((mod as unknown as { default?: typeof Leaflet }).default ?? mod) as typeof Leaflet;
      if (!vivo || !caja.current || mapa.current) return;
      L.current = lib;
      const m = lib.map(caja.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: true });
      const oscuro = window.matchMedia("(prefers-color-scheme: dark)");
      let fondo = lib.tileLayer(oscuro.matches ? TILES.oscuro : TILES.claro, { attribution: ATRIBUCION, maxZoom: 19, subdomains: "abcd" }).addTo(m);
      const cambiarTema = () => { m.removeLayer(fondo); fondo = lib.tileLayer(oscuro.matches ? TILES.oscuro : TILES.claro, { attribution: ATRIBUCION, maxZoom: 19, subdomains: "abcd" }).addTo(m); };
      oscuro.addEventListener("change", cambiarTema);
      quitarTema = () => oscuro.removeEventListener("change", cambiarTema);
      capa.current = lib.layerGroup().addTo(m);
      const puntos = [...sucursales, ...tecnicos].map((p) => [p.lat, p.lng] as [number, number]);
      if (puntos.length > 1) m.fitBounds(puntos, { padding: [40, 40], maxZoom: 13 });
      else m.setView(puntos[0] ?? [20.1, -98.75], 13);
      mapa.current = m;
      setListo(true);
    })();
    return () => {
      vivo = false;
      quitarTema?.();
      mapa.current?.remove();
      mapa.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Dibujar pines según filtros y selección
  useEffect(() => {
    const lib = L.current, grupo = capa.current;
    if (!listo || !lib || !grupo) return;
    grupo.clearLayers();
    if (verTec) {
      for (const t of tecnicos) {
        lib.marker([t.lat, t.lng], {
          icon: lib.divIcon({ className: "", html: `<span class="mtec" title="${esc(t.nombre)}">${esc(iniciales(t.nombre))}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
          keyboard: false, zIndexOffset: -100,
        }).bindTooltip(`<b>${esc(t.nombre)}</b><br>Base: ${esc(t.base || "—")}`, { direction: "top", offset: [0, -14] }).addTo(grupo);
      }
    }
    for (const s of visibles) {
      const activo = s.id === sel;
      const m = lib.marker([s.lat, s.lng], {
        icon: lib.divIcon({ className: "", html: `<span class="mpin ${s.estado}${activo ? " sel" : ""}"></span>`, iconSize: activo ? [30, 30] : [22, 22], iconAnchor: activo ? [15, 15] : [11, 11] }),
        title: s.nombre, riseOnHover: true, zIndexOffset: activo ? 1000 : ESTADOS[s.estado].orden === 0 ? 500 : 0,
      });
      m.bindTooltip(esc(s.nombre), { direction: "top", offset: [0, -12] });
      m.on("click", () => elegir(s.id, false));
      m.addTo(grupo);
    }
  }, [listo, visibles.map((s) => s.id).join(","), sel, verTec]); // eslint-disable-line react-hooks/exhaustive-deps

  // Al cambiar de zona, encuadrar sus sucursales
  useEffect(() => {
    const m = mapa.current;
    if (!listo || !m || !enZona.length) return;
    const pts = enZona.map((s) => [s.lat, s.lng] as [number, number]);
    if (pts.length > 1) m.flyToBounds(pts, { padding: [40, 40], maxZoom: 13, duration: 0.6 });
    else m.flyTo(pts[0], 14, { duration: 0.6 });
  }, [zona, listo]); // eslint-disable-line react-hooks/exhaustive-deps

  function elegir(id: number, volar = true) {
    setSel(id);
    const s = sucursales.find((x) => x.id === id);
    if (s && volar && mapa.current) mapa.current.flyTo([s.lat, s.lng], Math.max(mapa.current.getZoom(), 14), { duration: 0.6 });
    if (window.matchMedia("(max-width: 900px)").matches) requestAnimationFrame(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const cuenta = (e: Estado) => enZona.filter((s) => s.estado === e).length;

  return (
    <div className="mapa">
      <div className="mapa-bar">
        <label className="field mapa-zona">Zona
          <select value={zona} onChange={(e) => { setZona(e.target.value); setSel(null); }}>
            <option value="">Todas las zonas</option>
            {zonas.map((z) => <option key={z}>{z}</option>)}
          </select>
        </label>
        <div className="mapa-chips" role="group" aria-label="Filtrar por estado">
          <button type="button" aria-pressed={!filtro} onClick={() => setFiltro("")}>Todas · {enZona.length}</button>
          {(Object.keys(ESTADOS) as Estado[]).map((e) => (
            <button key={e} type="button" aria-pressed={filtro === e} onClick={() => setFiltro(filtro === e ? "" : e)}>
              <i className={`mdot ${e}`} />{ESTADOS[e].corto} · {cuenta(e)}
            </button>
          ))}
        </div>
        {tecnicos.length > 0 && (
          <label className="mapa-tec"><input type="checkbox" checked={verTec} onChange={(e) => setVerTec(e.target.checked)} /> Técnicos</label>
        )}
      </div>

      <div className="mapa-body">
        <div className="mapa-map" ref={caja} role="region" aria-label="Mapa de sucursales" />

        <aside className="mapa-side" ref={panel}>
          {actual ? (
            <div className="mapa-ficha">
              <div className="mapa-ficha-head">
                <span className={`mdot ${actual.estado} big`} aria-hidden="true" />
                <div>
                  <h3>{actual.nombre}</h3>
                  <small>{actual.zona}{actual.supervisor ? ` · ${actual.supervisor}` : ""}</small>
                </div>
                <button type="button" className="mapa-x" aria-label="Cerrar ficha" onClick={() => setSel(null)}>×</button>
              </div>
              <p className={`mapa-estado ${actual.estado}`}>{ESTADOS[actual.estado].t}</p>

              <div className="mapa-acts">
                <a className="btn primary" href={enlaceComoLlegar(actual)} target="_blank" rel="noopener noreferrer">Cómo llegar</a>
                <CopiarTexto
                  className="btn"
                  etiqueta="Copiar ruta para el técnico"
                  texto={`Ruta a ${actual.nombre}${actual.direccion ? ` (${actual.direccion})` : ""}:\n${enlaceComoLlegar(actual)}`}
                />
              </div>

              <dl className="mapa-datos">
                <div><dt>Equipos</dt><dd>{actual.equipos}</dd></div>
                <div><dt>Gasto del mes</dt><dd>{mxn(actual.gastoMes)}</dd></div>
                <div className="w2"><dt>Última visita</dt><dd>{actual.ultimaVisita ?? "Sin hojas de servicio"}</dd></div>
              </dl>

              {actual.vencidos.length > 0 && (
                <div className="mapa-lista bad"><b>Vencidos</b><ul>{actual.vencidos.map((x) => <li key={x}>{x}</li>)}</ul></div>
              )}
              {actual.proximos.length > 0 && (
                <div className="mapa-lista warn"><b>Próximos 7 días</b><ul>{actual.proximos.map((x) => <li key={x}>{x}</li>)}</ul></div>
              )}

              <div className="mapa-lista">
                <b>Técnico más cercano</b>
                {actual.cercanos.length ? (
                  <ol>{actual.cercanos.map((c) => <li key={c.nombre}><span>{c.nombre}</span><span className="num">~{c.km} km</span></li>)}</ol>
                ) : (
                  <p className="sub" style={{ margin: 0 }}>Captura la base de tus técnicos en <Link href="/admin/sucursales#tecnicos">Sucursales</Link>.</p>
                )}
              </div>

              <div className="mapa-links">
                <a href={enlaceMaps(actual)} target="_blank" rel="noopener noreferrer">Ver en Google Maps</a>
                <Link href={`/admin/supervisores?zona=${encodeURIComponent(actual.zona)}`}>Pendientes de la zona</Link>
                <Link href={`/admin/sucursales?s=${actual.id}#s${actual.id}`}>Corregir ubicación</Link>
              </div>
            </div>
          ) : (
            <p className="mapa-hint">Toca un pin o una sucursal de la lista para ver su ficha.</p>
          )}

          <ul className="mapa-list" aria-label="Sucursales">
            {visibles.map((s) => (
              <li key={s.id}>
                <button type="button" aria-pressed={s.id === sel} onClick={() => elegir(s.id)}>
                  <i className={`mdot ${s.estado}`} aria-hidden="true" />
                  <span><b>{s.nombre}</b><small>{s.vencidos.length ? `${s.vencidos.length} vencido${s.vencidos.length > 1 ? "s" : ""}` : s.proximos.length ? `${s.proximos.length} en 7 días` : "Al día"}{s.cercanos[0] ? ` · ${s.cercanos[0].nombre.split(" ")[0]} a ~${s.cercanos[0].km} km` : ""}</small></span>
                </button>
              </li>
            ))}
            {!visibles.length && <li className="mapa-vacio">Ninguna sucursal con este filtro.</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}
