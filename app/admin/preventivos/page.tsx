import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { estadoPreventivo, fCorta, hoy, rangoFechas, sumarDias } from "@/lib/panel";
import type { Activo, Preventivo } from "@/lib/types";
import { actualizarPreventivo, borrarPreventivo, crearPreventivos } from "../acciones-modulos";

type F = { vista?: string; mes?: string; zona?: string; tecnico?: string; estado?: string; ok?: string; error?: string };

export default async function Preventivos({ searchParams }: { searchParams: Promise<F> }) {
  await requireAdmin();
  const f = await searchParams;
  const supabase = await createClient();
  const h = hoy();

  let q = supabase.from("preventivos").select("*").order("fecha");
  if (f.mes && /^\d{4}-\d{2}$/.test(f.mes)) {
    const [ini, fin] = rangoFechas(f.mes);
    q = q.gte("fecha", ini).lt("fecha", fin);
  } else {
    q = q.eq("hecho", false).lte("fecha", sumarDias(h, 90)); // vencidos + próximos 90 días
  }
  if (f.tecnico) q = q.eq("tecnico_id", f.tecnico);

  const [{ data: p }, { data: suc }, { data: eqs }, { data: act }, { data: tec }, { data: prov }] = await Promise.all([
    q,
    supabase.from("sucursales").select("id, nombre, zona").order("zona").order("nombre"),
    supabase.from("equipos").select("nombre").order("orden"),
    supabase.from("activos").select("id, sucursal_id, equipo").eq("activo", true).order("id"),
    supabase.from("perfiles").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
  ]);
  const sucursales = (suc ?? []) as { id: number; nombre: string; zona: string }[];
  const sucPorId = new Map(sucursales.map((s) => [s.id, s]));
  const tecPorId = new Map((tec ?? []).map((t) => [t.id as string, t.nombre as string]));
  const provPorId = new Map((prov ?? []).map((t) => [t.id as number, t.nombre as string]));
  const zonas = Array.from(new Set(sucursales.map((s) => s.zona)));

  let filas = (p ?? []) as Preventivo[];
  if (f.zona) filas = filas.filter((x) => sucPorId.get(x.sucursal_id)?.zona === f.zona);
  if (f.estado) filas = filas.filter((x) => estadoPreventivo(x, h).texto === f.estado);
  const vencidos = filas.filter((x) => estadoPreventivo(x, h).texto === "Vencido").length;

  return (
    <main className="wrap">
      <div className="head-row">
        <div>
          <p className="eyebrow">Panel de mantenimiento</p>
          <h1 className="page-h">Preventivos</h1>
        </div>
      </div>

      {f.ok && <div className="note ok" style={{ marginBottom: 14 }}>Se programaron {f.ok} preventivo{f.ok === "1" ? "" : "s"}.</div>}
      {f.error && <div className="note bad" style={{ marginBottom: 14 }}>{f.error === "datos" ? "Llena fecha, sucursal, equipo y tarea." : `No se pudo guardar: ${f.error}`}</div>}

      <section className="card" style={{ marginBottom: 18 }}>
        <h3>Programar preventivo</h3>
        <p className="sub">El técnico asignado lo verá al crear su hoja de servicio; al enviarla, el preventivo se marca como hecho.</p>
        <form action={crearPreventivos} className="inline-form" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))" }}>
          <label className="field">Fecha<input id="p-fecha" name="fecha" type="date" required defaultValue={sumarDias(h, 7)} /></label>
          <label className="field">Sucursal
            <select id="p-suc" name="sucursal_id" required defaultValue="">
              <option value="" disabled>Elige</option>
              {zonas.map((z) => (
                <optgroup key={z} label={z}>{sucursales.filter((s) => s.zona === z).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</optgroup>
              ))}
            </select>
          </label>
          <label className="field">Equipo
            <select id="p-eq" name="equipo" required defaultValue="">
              <option value="" disabled>Elige</option>
              {(eqs ?? []).map((e) => <option key={e.nombre as string}>{e.nombre as string}</option>)}
              <option>Instalación eléctrica</option><option>Instalación hidráulica</option><option>Gas</option>
            </select>
          </label>
          <label className="field">Activo (opcional)
            <select id="p-act" name="activo_id" defaultValue="">
              <option value="">Sin activo</option>
              {((act ?? []) as Pick<Activo, "id" | "sucursal_id" | "equipo">[]).map((x) => <option key={x.id} value={x.id}>{x.id} · {sucPorId.get(x.sucursal_id)?.nombre}</option>)}
            </select>
          </label>
          <label className="field w2">Tarea<input id="p-tarea" name="tarea" required placeholder="Ej. Descalcificación" /></label>
          <label className="field">Técnico
            <select id="p-tec" name="tecnico_id" defaultValue="">
              <option value="">Sin asignar</option>
              {(tec ?? []).map((t) => <option key={t.id as string} value={t.id as string}>{t.nombre as string}</option>)}
            </select>
          </label>
          <label className="field">Proveedor externo
            <select id="p-prov" name="proveedor_id" defaultValue="">
              <option value="">Ninguno</option>
              {(prov ?? []).map((t) => <option key={t.id as number} value={t.id as number}>{t.nombre as string}</option>)}
            </select>
          </label>
          <label className="field">Repetir
            <select id="p-rep" name="cada_meses" defaultValue="0">
              <option value="0">Una sola vez</option>
              <option value="1">Cada mes</option>
              <option value="2">Cada 2 meses</option>
              <option value="3">Cada 3 meses</option>
              <option value="6">Cada 6 meses</option>
              <option value="12">Cada año</option>
            </select>
          </label>
          <label className="field">Veces<input id="p-veces" name="veces" type="number" min={1} max={24} defaultValue={6} /></label>
          <button className="btn primary" type="submit">Programar</button>
        </form>
      </section>

      <form className="toolbar" method="get">
        <label className="field">Mes (vacío = pendientes)<input id="f-mes" name="mes" type="month" defaultValue={f.mes ?? ""} /></label>
        <label className="field">Zona
          <select id="f-zona" name="zona" defaultValue={f.zona ?? ""}><option value="">Todas</option>{zonas.map((z) => <option key={z}>{z}</option>)}</select>
        </label>
        <label className="field">Técnico
          <select id="f-tec" name="tecnico" defaultValue={f.tecnico ?? ""}><option value="">Todos</option>{(tec ?? []).map((t) => <option key={t.id as string} value={t.id as string}>{t.nombre as string}</option>)}</select>
        </label>
        <label className="field">Estado
          <select id="f-est" name="estado" defaultValue={f.estado ?? ""}><option value="">Todos</option><option>Vencido</option><option>Programado</option><option>Hecho</option></select>
        </label>
        <button className="btn primary" type="submit">Filtrar</button>
        <span className="sub" style={{ margin: "0 0 10px" }}>{filas.length} preventivos · {vencidos} vencidos</span>
      </form>

      {filas.length ? (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Sucursal</th><th>Equipo y tarea</th><th>Asignado</th><th>Estado</th><th>Reprogramar</th><th /></tr></thead>
            <tbody>
              {filas.map((x) => {
                const e = estadoPreventivo(x, h), s = sucPorId.get(x.sucursal_id);
                return (
                  <tr key={x.id}>
                    <td className="num">{fCorta(x.fecha)}</td>
                    <td><b>{s?.nombre}</b><br /><small style={{ color: "var(--muted)" }}>{s?.zona}</small></td>
                    <td>{x.equipo}{x.activo_id && <span className="num" style={{ color: "var(--muted)" }}> · {x.activo_id}</span>}<br /><small>{x.tarea}</small></td>
                    <td>{x.tecnico_id ? tecPorId.get(x.tecnico_id) : x.proveedor_id ? provPorId.get(x.proveedor_id) : <span style={{ color: "var(--muted)" }}>Sin asignar</span>}</td>
                    <td><span className={`pill ${e.clase}`}>{e.texto}</span>{x.hoja_id && <><br /><a href={`/admin/hojas/${x.hoja_id}`} style={{ fontSize: 13 }}>Ver hoja</a></>}</td>
                    <td>
                      {!x.hecho && (
                        <form action={actualizarPreventivo} style={{ display: "flex", gap: 6 }}>
                          <input type="hidden" name="id" value={x.id} />
                          <input name="fecha" type="date" defaultValue={x.fecha} aria-label="Nueva fecha" className="mini-input" />
                          <button className="btn small" type="submit">Mover</button>
                        </form>
                      )}
                    </td>
                    <td className="r">
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <form action={actualizarPreventivo}>
                          <input type="hidden" name="id" value={x.id} />
                          <input type="hidden" name="hecho" value={String(!x.hecho)} />
                          <button className="btn small" type="submit">{x.hecho ? "Reabrir" : "Marcar hecho"}</button>
                        </form>
                        <form action={borrarPreventivo}>
                          <input type="hidden" name="id" value={x.id} />
                          <button className="btn small danger" type="submit">Borrar</button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card"><h3>Sin preventivos con estos filtros</h3><p className="sub">Programa uno arriba. Con &quot;Repetir&quot; puedes crear todo el calendario del año de una vez.</p></div>
      )}
    </main>
  );
}
