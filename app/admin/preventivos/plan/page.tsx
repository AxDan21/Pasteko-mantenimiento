import Link from "next/link";
import CopiarTexto from "@/components/CopiarTexto";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fCorta, hoy, sumarDias } from "@/lib/panel";
import { enlaceRuta, planear, sugerencias, type HojaMin, type PrevPend, type Salida, type SucUbi, type TecBase } from "@/lib/rutas";
import { crearSugeridos, programarSalida } from "../../acciones-modulos";

export const metadata = { title: "Plan de preventivos · Pasteko" };

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const diaLargo = (f: string) => {
  const [y, m, d] = f.split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${fCorta(f).replace(/ \d{2}$/, "")}`;
};
const PERIODOS = [14, 30, 60] as const;

export default async function PlanPreventivos({ searchParams }: { searchParams: Promise<{ dias?: string; ok?: string; error?: string }> }) {
  await requireAdmin();
  const f = await searchParams;
  const dias = PERIODOS.find((d) => String(d) === f.dias) ?? 30;
  const supabase = await createClient();
  const h = hoy(), limite = sumarDias(h, dias);
  const volver = `/admin/preventivos/plan?dias=${dias}`;

  const [{ data: p }, { data: todosPend }, { data: s }, { data: t }, { data: hs }, { data: a }] = await Promise.all([
    supabase.from("preventivos").select("id, fecha, sucursal_id, equipo, tarea, tecnico_id").eq("hecho", false).lte("fecha", limite).order("fecha"),
    supabase.from("preventivos").select("sucursal_id, equipo").eq("hecho", false),
    supabase.from("sucursales").select("id, nombre, zona, lat, lng").eq("activa", true),
    supabase.from("perfiles").select("id, nombre, base_nombre, base_lat, base_lng").eq("rol", "tecnico").eq("activo", true).order("nombre"),
    supabase.from("hojas_servicio").select("sucursal_id, equipo, tipo, creada, falla").gte("creada", `${sumarDias(h, -90)}T00:00:00`),
    supabase.from("activos").select("sucursal_id, equipo").eq("activo", true),
  ]);

  const todas = (s ?? []) as { id: number; nombre: string; zona: string; lat: number | null; lng: number | null }[];
  const nombreSuc = new Map(todas.map((x) => [x.id, x.nombre]));
  const ubicadas: SucUbi[] = todas.filter((x) => x.lat != null && x.lng != null).map((x) => ({ id: x.id, nombre: x.nombre, zona: x.zona, lat: x.lat!, lng: x.lng! }));
  const perfiles = (t ?? []) as { id: string; nombre: string; base_nombre: string | null; base_lat: number | null; base_lng: number | null }[];
  const tecnicos: TecBase[] = perfiles.filter((x) => x.base_lat != null && x.base_lng != null)
    .map((x) => ({ id: x.id, nombre: x.nombre, base: x.base_nombre ?? "", lat: x.base_lat!, lng: x.base_lng! }));
  const prevs = (p ?? []) as PrevPend[];

  const { salidas, sinUbicacion, sinTecnico } = planear(prevs, ubicadas, tecnicos, { hoy: h });
  const sugs = sugerencias((hs ?? []) as HojaMin[], (todosPend ?? []) as { sucursal_id: number; equipo: string }[], (a ?? []) as { sucursal_id: number; equipo: string }[], nombreSuc, h);

  const urgentes = salidas.filter((x) => x.urgente).length;
  const kmTotal = salidas.reduce((sum, x) => sum + x.km, 0);
  const ahorro = salidas.reduce((sum, x) => sum + x.ahorroKm, 0);
  const programada = (x: Salida) => x.paradas.every((pa) => pa.preventivos.every((pr) => pr.fecha === x.fecha && pr.tecnico_id === x.tecnico.id));

  const mensaje = (x: Salida) =>
    [`Salida de mantenimiento · ${diaLargo(x.fecha)}`, `Técnico: ${x.tecnico.nombre}`, "",
      ...x.paradas.flatMap((pa, i) => [`${i + 1}. ${pa.sucursal.nombre}`, ...pa.preventivos.map((pr) => `   • ${pr.tarea} · ${pr.equipo}`)]),
      "", `Ruta (~${x.km} km): ${enlaceRuta(x)}`].join("\n");

  return (
    <main className="wrap">
      <div className="head-row">
        <div>
          <p className="eyebrow"><Link href="/admin/preventivos">Preventivos</Link> · plan inteligente</p>
          <h1 className="page-h">Salidas de la semana y más</h1>
          <p className="sub" style={{ margin: 0 }}>Preventivos agrupados por técnico y cercanía, con la ruta lista para mandar.</p>
        </div>
        <nav className="seg-mini" aria-label="Periodo">
          {PERIODOS.map((d) => <Link key={d} href={`/admin/preventivos/plan?dias=${d}`} aria-current={d === dias ? "page" : undefined}>{d} días</Link>)}
        </nav>
      </div>

      {f.ok?.startsWith("programada-") && <div className="note ok" style={{ marginBottom: 14 }}>Salida programada: {f.ok.slice(11)} preventivo(s) movidos a esa fecha y asignados al técnico.</div>}
      {f.ok?.startsWith("creados-") && <div className="note ok" style={{ marginBottom: 14 }}>Se crearon {f.ok.slice(8)} preventivo(s). Ya aparecen en las salidas.</div>}
      {f.error && <div className="note bad" style={{ marginBottom: 14 }}>{f.error}</div>}

      <div className="kpis">
        <div className="kpi"><span className="eyebrow">Salidas propuestas</span><span className="v">{salidas.length}</span><span className="s">{prevs.length} preventivos en {dias} días</span></div>
        <div className="kpi"><span className="eyebrow">Urgentes</span><span className="v" style={urgentes ? { color: "var(--bad)" } : undefined}>{urgentes}</span><span className="s">Con preventivos vencidos</span></div>
        <div className="kpi"><span className="eyebrow">Kilómetros</span><span className="v">~{kmTotal.toLocaleString("es-MX")}</span><span className="s">Ida y vuelta, por carretera aprox.</span></div>
        <div className="kpi"><span className="eyebrow">Ahorro por agrupar</span><span className="v" style={{ color: "var(--ok)" }}>~{ahorro.toLocaleString("es-MX")} km</span><span className="s">Contra ir a cada tienda por separado</span></div>
      </div>

      {(!tecnicos.length || sinUbicacion.length > 0 || sinTecnico.length > 0) && (
        <div className="note warn" style={{ marginBottom: 14 }}>
          {!tecnicos.length && <>Ningún técnico tiene base (tabla perfiles: base_lat, base_lng); sin eso no se pueden armar rutas. </>}
          {sinUbicacion.length > 0 && <>Fuera del plan por no tener ubicación: {sinUbicacion.map((id) => nombreSuc.get(id) ?? id).join(", ")}. </>}
        </div>
      )}

      {sugs.length > 0 && (
        <section className="plan-sugs">
          <h2 className="plan-h">Adelántate a las fallas</h2>
          <div className="plan-sug-grid">
            {sugs.map((sg) => (
              <form key={sg.clave} action={crearSugeridos} className={`plan-sug ${sg.tipo}`}>
                <input type="hidden" name="volver" value={volver} />
                {sg.objetivos.map((o) => <input key={`${o.sucursal_id}|${o.equipo}`} type="hidden" name="objetivo" value={`${o.sucursal_id}|${o.equipo}`} />)}
                <span className="plan-sug-tag">{sg.tipo === "repetida" ? "Falla repetida" : "Campaña"}</span>
                <b>{sg.titulo}</b>
                <small>{sg.detalle}</small>
                {sg.tipo === "campana" && <small className="plan-sug-list">{sg.objetivos.map((o) => nombreSuc.get(o.sucursal_id)).join(" · ")}</small>}
                <div className="plan-sug-form">
                  <input name="tarea" defaultValue={sg.tipo === "repetida" ? "Revisión preventiva por fallas repetidas" : `Revisión preventiva de ${sg.objetivos[0].equipo.toLowerCase()}`} aria-label="Tarea" />
                  <input name="fecha" type="date" defaultValue={sumarDias(h, 7)} min={h} aria-label="Fecha" />
                  <button className="btn small primary" type="submit">Programar {sg.objetivos.length > 1 ? `${sg.objetivos.length}` : ""}</button>
                </div>
              </form>
            ))}
          </div>
        </section>
      )}

      <h2 className="plan-h">Salidas propuestas</h2>
      {!salidas.length && (
        <div className="card"><h3>Nada que programar</h3><p className="sub">No hay preventivos pendientes en los próximos {dias} días con sucursal ubicada y técnico con base.</p></div>
      )}
      <div className="plan-grid">
        {salidas.map((x) => {
          const lista = programada(x);
          return (
            <article key={x.clave} className={`plan-card${x.urgente ? " urgente" : ""}${lista ? " lista" : ""}`}>
              <header>
                <span className="plan-tec" aria-hidden="true">{x.tecnico.nombre.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}</span>
                <div>
                  <b>{x.tecnico.nombre}</b>
                  <small>{diaLargo(x.fecha)} · {x.paradas.length} sucursal{x.paradas.length !== 1 ? "es" : ""} · {x.preventivos} preventivo{x.preventivos !== 1 ? "s" : ""}</small>
                </div>
                {lista ? <span className="pill ok">Programada</span> : x.urgente ? <span className="pill bad">Urgente</span> : null}
              </header>

              <ol className="plan-ruta">
                <li className="base"><span>Sale de {x.tecnico.base || "su base"}</span></li>
                {x.paradas.map((pa) => (
                  <li key={pa.sucursal.id}>
                    <span className="plan-km">+{pa.kmDesdeAnterior} km</span>
                    <b>{pa.sucursal.nombre}</b>
                    <ul>
                      {pa.preventivos.map((pr) => (
                        <li key={pr.id} className={pr.fecha < h ? "venc" : undefined}>
                          {pr.tarea} · {pr.equipo} <em>{pr.fecha < h ? `vencido desde ${fCorta(pr.fecha).replace(/ \d{2}$/, "")}` : `vence ${fCorta(pr.fecha).replace(/ \d{2}$/, "")}`}</em>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
                <li className="base"><span>Regreso · total ~{x.km} km{x.ahorroKm > 0 ? ` (ahorra ~${x.ahorroKm} km)` : ""}</span></li>
              </ol>

              <form action={programarSalida} className="plan-form">
                <input type="hidden" name="volver" value={volver} />
                {x.paradas.flatMap((pa) => pa.preventivos).map((pr) => <input key={pr.id} type="hidden" name="prev" value={pr.id} />)}
                <label className="field">Fecha<input name="fecha" type="date" defaultValue={x.fecha} required /></label>
                <label className="field">Técnico
                  <select name="tecnico_id" defaultValue={x.tecnico.id}>
                    {perfiles.map((tc) => <option key={tc.id} value={tc.id}>{tc.nombre}</option>)}
                  </select>
                </label>
                <button className="btn primary" type="submit">{lista ? "Reprogramar" : "Programar salida"}</button>
              </form>
              <div className="plan-acts">
                <a className="btn small" href={enlaceRuta(x)} target="_blank" rel="noopener noreferrer">Ver ruta en Google Maps</a>
                <CopiarTexto className="btn small" etiqueta="Copiar mensaje para el técnico" texto={mensaje(x)} />
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
