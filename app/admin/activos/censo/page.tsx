/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { enlaces } from "@/lib/datos";
import { fCorta } from "@/lib/panel";
import type { Activo } from "@/lib/types";
import { validarActivos } from "../../acciones-modulos";

type Suc = { id: number; nombre: string; zona: string; supervisor: string | null; censo_completo: boolean; censo_fecha: string | null };

/** Avance del censo por zona y sucursal, y cola de equipos por validar. */
export default async function AvanceCenso({ searchParams }: { searchParams: Promise<{ zona?: string; ok?: string; error?: string }> }) {
  await requireAdmin();
  const f = await searchParams;
  const supabase = await createClient();
  const [{ data: suc }, { data: act }, { data: per }] = await Promise.all([
    supabase.from("sucursales").select("id, nombre, zona, supervisor, censo_completo, censo_fecha").eq("activa", true).order("zona").order("nombre"),
    supabase.from("activos").select("*").eq("activo", true).order("registrado", { ascending: false }),
    supabase.from("perfiles").select("id, nombre"),
  ]);
  const sucursales = (suc ?? []) as Suc[];
  const activos = (act ?? []) as Activo[];
  const nombreDe = new Map((per ?? []).map((p) => [p.id as string, p.nombre as string]));
  const sucDe = new Map(sucursales.map((s) => [s.id, s]));
  const zonas = Array.from(new Set(sucursales.map((s) => s.zona)));

  let pendientes = activos.filter((x) => !x.validado);
  if (f.zona) pendientes = pendientes.filter((x) => sucDe.get(x.sucursal_id)?.zona === f.zona);
  const urls = await enlaces(supabase, "censo", pendientes.flatMap((x) => [x.ficha_path, x.foto_path]));

  const porSuc = new Map<number, { total: number; pend: number }>();
  activos.forEach((x) => {
    const c = porSuc.get(x.sucursal_id) ?? { total: 0, pend: 0 };
    c.total += 1;
    if (!x.validado) c.pend += 1;
    porSuc.set(x.sucursal_id, c);
  });
  const completas = sucursales.filter((s) => s.censo_completo).length;
  const volver = `/admin/activos/censo${f.zona ? `?zona=${encodeURIComponent(f.zona)}` : ""}`;

  return (
    <main className="wrap">
      <div className="head-row">
        <div>
          <p className="eyebrow"><Link href="/admin/activos">Activos y garantías</Link></p>
          <h1 className="page-h">Censo de equipos</h1>
          <p className="sub" style={{ margin: 0 }}>Los supervisores registran los equipos de sus sucursales en /censo. Aquí revisas la foto de la ficha técnica y validas.</p>
        </div>
        <Link className="btn" href="/censo">Abrir el censo como supervisor</Link>
      </div>

      {f.ok?.startsWith("validados-") && <div className="note ok" style={{ marginBottom: 14 }}>{f.ok.slice(10)} equipo(s) validados.</div>}
      {f.error && <div className="note bad" style={{ marginBottom: 14 }}>{f.error}</div>}

      <div className="kpis">
        <div className="kpi"><span className="eyebrow">Sucursales completas</span><span className="v">{completas}<span style={{ fontSize: 18, color: "var(--muted)" }}> / {sucursales.length}</span></span><div className="bar"><i style={{ width: `${sucursales.length ? (completas / sucursales.length) * 100 : 0}%` }} /></div></div>
        <div className="kpi"><span className="eyebrow">Equipos registrados</span><span className="v">{activos.length}</span><span className="s">En todas las sucursales</span></div>
        <div className="kpi"><span className="eyebrow">Por validar</span><span className="v" style={{ color: activos.some((x) => !x.validado) ? "var(--warn)" : "var(--ok)" }}>{activos.filter((x) => !x.validado).length}</span><span className="s">Registrados por supervisores</span></div>
        <div className="kpi"><span className="eyebrow">Sin empezar</span><span className="v">{sucursales.filter((s) => !porSuc.get(s.id)).length}</span><span className="s">Sucursales sin equipos</span></div>
      </div>

      <section className="card" style={{ marginBottom: 18 }}>
        <h3>Avance por sucursal</h3>
        <div className="tbl-wrap" style={{ border: 0 }}>
          <table>
            <thead><tr><th>Zona</th><th>Sucursal</th><th>Supervisor</th><th className="r">Equipos</th><th className="r">Por validar</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {sucursales.map((s) => {
                const c = porSuc.get(s.id) ?? { total: 0, pend: 0 };
                const [t, cl] = s.censo_completo ? ["Completa", "ok"] : c.total ? ["En proceso", "warn"] : ["Sin empezar", "neutral"];
                return (
                  <tr key={s.id}>
                    <td><small>{s.zona}</small></td>
                    <td><b>{s.nombre}</b></td>
                    <td>{s.supervisor ?? "—"}</td>
                    <td className="r num">{c.total}</td>
                    <td className="r">{c.pend ? <span className="pill warn">{c.pend}</span> : <span className="num">0</span>}</td>
                    <td><span className={`pill ${cl}`}>{t}</span>{s.censo_fecha && <><br /><small style={{ color: "var(--muted)" }}>{fCorta(s.censo_fecha)}</small></>}</td>
                    <td className="r"><div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}><Link className="btn small" href={`/censo/${s.id}`}>Ver</Link>{c.total > 0 && <Link className="btn small" href={`/admin/activos/etiquetas?sucursal=${s.id}`}>QR</Link>}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card" id="validar">
        <div className="head-row" style={{ marginBottom: 10 }}>
          <div>
            <h3 style={{ fontSize: 20 }}>Por validar</h3>
            <p className="sub" style={{ margin: 0 }}>Revisa que la foto de la ficha técnica se lea y que el número de serie coincida. Para completar costo y garantía, abre el equipo.</p>
          </div>
          <form method="get" className="toolbar" style={{ margin: 0 }}>
            <label className="field">Zona<select id="v-zona" name="zona" defaultValue={f.zona ?? ""}><option value="">Todas</option>{zonas.map((z) => <option key={z}>{z}</option>)}</select></label>
            <button className="btn" type="submit">Filtrar</button>
          </form>
        </div>
        {pendientes.length ? (
          <form action={validarActivos}>
            <input type="hidden" name="volver" value={volver} />
            <div className="validar-grid">
              {pendientes.map((x) => {
                const ficha = x.ficha_path ? urls.get(x.ficha_path) : undefined;
                const foto = x.foto_path ? urls.get(x.foto_path) : undefined;
                return (
                  <label key={x.id} className="validar-item">
                    <input type="checkbox" name="id" value={x.id} className="sel-chk" />
                    <div className="validar-fotos">
                      {ficha ? <a href={ficha} target="_blank" rel="noopener noreferrer"><img src={ficha} alt={`Ficha técnica de ${x.id}`} /></a> : <span className="no-img">Sin ficha</span>}
                      {foto && <a href={foto} target="_blank" rel="noopener noreferrer"><img src={foto} alt={`Equipo ${x.id}`} /></a>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <Link href={`/admin/activos/${x.id}`} className="num"><b>{x.id}</b></Link>
                      <p style={{ margin: "2px 0" }}>{x.descripcion || x.equipo}</p>
                      <small>{x.equipo} · {sucDe.get(x.sucursal_id)?.nombre}</small>
                      <small>Serie: <b className="num">{x.serie ?? "sin serie"}</b>{x.marca ? ` · ${x.marca}` : ""}{x.modelo ? ` ${x.modelo}` : ""}</small>
                      <small>Registró {x.registrado_por ? nombreDe.get(x.registrado_por) ?? "—" : "—"} · {x.registrado ? fCorta(x.registrado) : ""}</small>
                    </div>
                  </label>
                );
              })}
            </div>
            <div className="pay-bar">
              <span className="sub" style={{ margin: 0 }}>Marca los equipos revisados:</span>
              <button className="btn primary" type="submit">Validar seleccionados</button>
            </div>
          </form>
        ) : (
          <p className="sub">No hay equipos por validar{f.zona ? " en esta zona" : ""}.</p>
        )}
      </section>
    </main>
  );
}
