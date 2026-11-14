import MapaSucursales, { type PinSucursal, type PinTecnico } from "@/components/MapaSucursales";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { kmCarretera } from "@/lib/geo";
import { fCorta, hoy, mesActual, rangoFechas, sumarDias } from "@/lib/panel";

export const metadata = { title: "Sucursales · Pasteko" };

export default async function Sucursales() {
  await requireAdmin();
  const supabase = await createClient();
  const h = hoy(), en7 = sumarDias(h, 7);
  const [ini, fin] = rangoFechas(mesActual());

  const [{ data: s }, { data: t }, { data: p }, { data: hs }, { data: a }, { data: g }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre, zona, supervisor, direccion, lat, lng").eq("activa", true).order("nombre"),
    supabase.from("perfiles").select("id, nombre, base_nombre, base_lat, base_lng").eq("rol", "tecnico").eq("activo", true),
    supabase.from("preventivos").select("sucursal_id, fecha, tarea, equipo").eq("hecho", false).lte("fecha", en7).order("fecha"),
    supabase.from("hojas_servicio").select("sucursal_id, creada, equipo").order("creada", { ascending: false }).limit(2000),
    supabase.from("activos").select("sucursal_id").eq("activo", true),
    supabase.from("v_gastos").select("sucursal_id, monto").gte("fecha", ini).lt("fecha", fin),
  ]);

  const tecnicos: PinTecnico[] = ((t ?? []) as { id: string; nombre: string; base_nombre: string | null; base_lat: number | null; base_lng: number | null }[])
    .filter((x) => x.base_lat != null && x.base_lng != null)
    .map((x) => ({ id: x.id, nombre: x.nombre, base: x.base_nombre ?? "", lat: x.base_lat!, lng: x.base_lng! }));

  const prevs = (p ?? []) as { sucursal_id: number; fecha: string; tarea: string; equipo: string }[];
  const hojas = (hs ?? []) as { sucursal_id: number; creada: string; equipo: string }[];
  const equipos = new Map<number, number>();
  ((a ?? []) as { sucursal_id: number }[]).forEach((x) => equipos.set(x.sucursal_id, (equipos.get(x.sucursal_id) ?? 0) + 1));
  const gasto = new Map<number, number>();
  ((g ?? []) as { sucursal_id: number | null; monto: number }[]).forEach((x) => { if (x.sucursal_id) gasto.set(x.sucursal_id, (gasto.get(x.sucursal_id) ?? 0) + Number(x.monto)); });

  const todas = (s ?? []) as { id: number; nombre: string; zona: string; supervisor: string | null; direccion: string | null; lat: number | null; lng: number | null }[];
  const pins: PinSucursal[] = todas.filter((x) => x.lat != null && x.lng != null).map((x) => {
    const mias = prevs.filter((pr) => pr.sucursal_id === x.id);
    const vencidos = mias.filter((pr) => pr.fecha < h);
    const proximos = mias.filter((pr) => pr.fecha >= h);
    const ultima = hojas.find((hj) => hj.sucursal_id === x.id);
    const punto = { lat: x.lat!, lng: x.lng! };
    return {
      id: x.id, nombre: x.nombre, zona: x.zona, supervisor: x.supervisor, direccion: x.direccion, ...punto,
      estado: vencidos.length ? "rojo" : proximos.length ? "amarillo" : "verde",
      vencidos: vencidos.map((pr) => `${pr.tarea} · ${pr.equipo} (${fCorta(pr.fecha)})`),
      proximos: proximos.map((pr) => `${pr.tarea} · ${pr.equipo} (${fCorta(pr.fecha)})`),
      ultimaVisita: ultima ? `${fCorta(ultima.creada.slice(0, 10))} · ${ultima.equipo}` : null,
      equipos: equipos.get(x.id) ?? 0,
      gastoMes: gasto.get(x.id) ?? 0,
      cercanos: tecnicos.map((tc) => ({ nombre: tc.nombre, km: kmCarretera(tc, punto) })).sort((m, n) => m.km - n.km).slice(0, 3),
    };
  });
  const sinUbicacion = todas.filter((x) => x.lat == null || x.lng == null);

  return (
    <main className="wrap mapa-page">
      <div className="head-row">
        <div>
          <p className="eyebrow">Mapa</p>
          <h1 className="page-h">Sucursales</h1>
          <p className="sub" style={{ margin: 0 }}>
            {pins.length} de {todas.length} sucursales en el mapa · {tecnicos.length} técnico{tecnicos.length !== 1 ? "s" : ""} con base
          </p>
        </div>
      </div>

      {sinUbicacion.length > 0 && (
        <div className="note warn" style={{ marginBottom: 14 }}>
          Faltan {sinUbicacion.length} sucursal{sinUbicacion.length !== 1 ? "es" : ""} sin ubicación: {sinUbicacion.slice(0, 6).map((x) => x.nombre).join(", ")}{sinUbicacion.length > 6 ? "…" : ""}. Agrega su latitud y longitud en la tabla <code>sucursales</code> de Supabase.
        </div>
      )}

      {pins.length ? (
        <MapaSucursales sucursales={pins} tecnicos={tecnicos} />
      ) : (
        <div className="card">
          <h3>Todavía no hay sucursales con ubicación</h3>
          <p className="sub">Agrega la latitud y longitud de tus tiendas (tabla <code>sucursales</code>) y la base de tus técnicos (tabla <code>perfiles</code>: <code>base_lat</code>, <code>base_lng</code>) en Supabase; aparecerán aquí al instante.</p>
        </div>
      )}
    </main>
  );
}
