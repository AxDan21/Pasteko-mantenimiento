import Link from "next/link";
import ColaValidacion, { type EquipoPorValidar } from "@/components/ColaValidacion";
import Seccion from "@/components/Seccion";
import { requireAdmin } from "@/lib/auth";
import { enlaces } from "@/lib/datos";
import { diasEntre, fCorta, hoy } from "@/lib/panel";
import { vistasEquipos } from "@/lib/secciones";
import { createClient } from "@/lib/supabase/server";
import type { Activo } from "@/lib/types";
import { validarActivos } from "../../acciones-modulos";

type Suc = { id: number; nombre: string; zona: string; supervisor: string | null; censo_completo: boolean; censo_fecha: string | null };
type Est = "ok" | "proc" | "none";
type Fila = Suc & { est: Est; val: number; pend: number; total: number };
type F = { f?: string; suc?: string; ok?: string; error?: string };

const num = new Intl.NumberFormat("es-MX");
const n = (x: number) => num.format(x);
const pl = (x: number, uno: string, varios: string) => `${n(x)} ${x === 1 ? uno : varios}`;
const FILTROS: [string, string][] = [["todas", "Todas"], ["pend", "Con pendientes"], ["none", "Sin empezar"], ["ok", "Completas"]];
const COLOR: Record<Est, string> = { ok: "var(--verde)", proc: "var(--amarillo)", none: "var(--line)" };
const ESTADO: Record<Est, string> = { ok: "Completa", proc: "En proceso", none: "Sin empezar" };

/** Hoy, ayer, hace N días hasta una semana; después, la fecha. */
function cuando(fecha: string | undefined, h: string) {
  if (!fecha) return "Sin fecha";
  const d = diasEntre(fecha.slice(0, 10), h);
  if (d <= 0) return "Hoy";
  if (d === 1) return "Ayer";
  if (d <= 7) return `Hace ${d} días`;
  return fCorta(fecha);
}

/** Avance del censo por zona y cola de equipos por validar, organizada por sucursal. */
export default async function AvanceCenso({ searchParams }: { searchParams: Promise<F> }) {
  await requireAdmin();
  const f = await searchParams;
  const filtro = FILTROS.some(([k]) => k === f.f) ? f.f! : "todas";
  const supabase = await createClient();
  const h = hoy();
  const [{ data: suc }, { data: act }, { data: per }, vistas] = await Promise.all([
    supabase.from("sucursales").select("id, nombre, zona, supervisor, censo_completo, censo_fecha").eq("activa", true).order("zona").order("nombre"),
    supabase.from("activos").select("*").eq("activo", true).order("registrado", { ascending: false }),
    supabase.from("perfiles").select("id, nombre"),
    vistasEquipos(supabase),
  ]);
  const activos = (act ?? []) as Activo[];
  const nombreDe = new Map((per ?? []).map((p) => [p.id as string, p.nombre as string]));

  // ---------- Avance por sucursal ----------
  const cuenta = new Map<number, { val: number; pend: number }>();
  activos.forEach((x) => {
    const c = cuenta.get(x.sucursal_id) ?? { val: 0, pend: 0 };
    if (x.validado === false) c.pend += 1; else c.val += 1;
    cuenta.set(x.sucursal_id, c);
  });
  const filas: Fila[] = ((suc ?? []) as Suc[]).map((s) => {
    const c = cuenta.get(s.id) ?? { val: 0, pend: 0 };
    const total = c.val + c.pend;
    return { ...s, ...c, total, est: s.censo_completo ? "ok" : total ? "proc" : "none" };
  });
  const sumaPend = (l: Fila[]) => l.reduce((a, s) => a + s.pend, 0);
  const zonas = Array.from(new Set(filas.map((s) => s.zona)))
    .map((zona) => {
      const sucs = filas.filter((s) => s.zona === zona).sort((a, b) => b.pend - a.pend || a.nombre.localeCompare(b.nombre, "es"));
      const supervisores = Array.from(new Set(sucs.map((s) => s.supervisor).filter((x): x is string => !!x)));
      return { zona, sucs, supervisores, pend: sumaPend(sucs), completas: sucs.filter((s) => s.est === "ok").length };
    })
    .sort((a, b) => b.pend - a.pend || a.zona.localeCompare(b.zona, "es"));

  const total = filas.length;
  const conteo = { ok: 0, proc: 0, none: 0 } as Record<Est, number>;
  filas.forEach((s) => conteo[s.est]++);
  const totalPend = sumaPend(filas);
  const cuantos: Record<string, number> = { todas: total, pend: filas.filter((s) => s.pend).length, none: conteo.none, ok: conteo.ok };
  const visible = (s: Fila) => filtro === "todas" || (filtro === "pend" ? s.pend > 0 : s.est === filtro);

  // ---------- Cola: una sucursal a la vez ----------
  const conPendientes = zonas.flatMap((z) => z.sucs.filter((s) => s.pend > 0));
  const elegida = conPendientes.find((s) => String(s.id) === f.suc) ?? conPendientes[0] ?? null;
  const qs = (p: Record<string, string | number | undefined>) => {
    const q = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => { if (v !== undefined && v !== "" && !(k === "f" && v === "todas")) q.set(k, String(v)); });
    const t = q.toString();
    return `/admin/activos/censo${t ? `?${t}` : ""}`;
  };
  let items: EquipoPorValidar[] = [];
  if (elegida) {
    const pendientes = activos.filter((x) => x.sucursal_id === elegida.id && x.validado === false);
    const urls = await enlaces(supabase, "censo", pendientes.flatMap((x) => [x.ficha_path, x.foto_path]));
    items = pendientes.map((x) => ({
      id: x.id, equipo: x.equipo, descripcion: x.descripcion ?? null, marca: x.marca, modelo: x.modelo, serie: x.serie,
      registro: x.registrado_por ? nombreDe.get(x.registrado_por) ?? null : null, cuando: cuando(x.registrado, h),
      ficha: x.ficha_path ? urls.get(x.ficha_path) ?? null : null, foto: x.foto_path ? urls.get(x.foto_path) ?? null : null,
    }));
  }

  return (
    <main className="wrap">
      <Seccion
        titulo="Equipos"
        sub="Los supervisores registran los equipos de sus sucursales. Aquí ves cuánto falta y validas lo que registraron."
        vistas={vistas}
        activa="censo"
        acciones={<Link className="btn" href="/censo">Abrir el censo como supervisor</Link>}
      />

      {f.ok?.startsWith("validados-") && <div className="note ok eqp-nota" role="status">{pl(Number(f.ok.slice(10)) || 0, "equipo validado", "equipos validados")}.</div>}
      {f.error && <div className="note bad eqp-nota" role="alert">{f.error}</div>}

      {/* ---------- Resumen ---------- */}
      <section className="card cs-res" aria-labelledby="cs-res-t">
        <div>
          <h2 id="cs-res-t">{total ? `${n(conteo.ok)} de ${pl(total, "sucursal", "sucursales")} ${conteo.ok === 1 || total === 1 ? "tiene" : "tienen"} su censo completo` : "Aún no hay sucursales en el censo"}</h2>
          <p className="sub" style={{ margin: "4px 0 0" }}>
            {total
              ? pl(activos.length, "equipo registrado", "equipos registrados") + (conteo.none ? ` · ${pl(conteo.none, "sucursal sin empezar", "sucursales sin empezar")}` : "")
              : "Cuando los supervisores registren equipos, aquí verás el avance de cada sucursal."}
          </p>
        </div>
        {totalPend > 0 && (
          <div className="cs-res-cta">
            <span>Por validar</span>
            <b className="num">{n(totalPend)}</b>
            <Link className="btn primary small" href="#cola">Revisar ahora ↓</Link>
          </div>
        )}
        {total > 0 && (
          <>
            <div className="cs-barra" role="img" aria-label={`${conteo.ok} completas, ${conteo.proc} en proceso, ${conteo.none} sin empezar`}>
              {(["ok", "proc", "none"] as Est[]).map((e) => <i key={e} style={{ width: `${(conteo[e] / total) * 100}%`, background: COLOR[e] }} />)}
            </div>
            <div className="cs-ley">
              {(["ok", "proc", "none"] as Est[]).map((e) => <span key={e}><i style={{ background: COLOR[e] }} />{e === "ok" ? "Completas" : ESTADO[e]} <b className="num">{n(conteo[e])}</b></span>)}
            </div>
          </>
        )}
      </section>

      {/* ---------- Avance por zona ---------- */}
      {total > 0 && (
        <section className="cs-av" aria-labelledby="cs-av-t">
          <div className="cs-av-h">
            <div>
              <h2 id="cs-av-t">Avance por zona</h2>
              <p className="sub" style={{ margin: "4px 0 0" }}>Primero las zonas con más pendiente. Cada barra: <b style={{ color: "var(--ok)" }}>validados</b> y <b style={{ color: "var(--warn)" }}>por validar</b>.</p>
            </div>
            <nav className="cs-chips" aria-label="Filtrar sucursales">
              {FILTROS.map(([k, t]) => (
                <Link key={k} href={qs({ f: k, suc: f.suc })} scroll={false} aria-current={filtro === k ? "page" : undefined}>{t} · {n(cuantos[k])}</Link>
              ))}
            </nav>
          </div>

          <div className="cs-zonas">
            {zonas.filter((z) => z.sucs.some(visible)).map((z) => (
              <details key={z.zona} className="card cs-zona" open>
                <summary>
                  <span className="cs-zona-t">
                    <h3>{z.zona}</h3>
                    <span className="cs-meta">
                      {z.supervisores.length === 0 ? "Sin supervisor asignado" : `${z.supervisores.length === 1 ? "Supervisor" : "Supervisores"}: ${z.supervisores.join(", ")}`}
                      {" · "}{z.pend ? <b style={{ color: "var(--warn)" }}>{n(z.pend)} por validar</b> : "nada por validar"}
                    </span>
                  </span>
                  <span className="cs-zona-n"><b className="num">{n(z.completas)}</b> de {n(z.sucs.length)} {z.sucs.length === 1 ? "completa" : "completas"}</span>
                  <span className="cs-mini" aria-hidden="true">{z.sucs.map((s) => <i key={s.id} style={{ background: COLOR[s.est] }} />)}</span>
                </summary>
                {/* Las que no han empezado se agrupan en una línea (salvo con el filtro "Sin empezar") para que no tapen las que avanzan. */}
                <ul className="cs-sucs">
                  {z.sucs.filter(visible).filter((s) => filtro === "none" || s.est !== "none").map((s) => (
                    <li key={s.id} className="cs-suc">
                      <span className="cs-dot" style={{ background: COLOR[s.est] }} title={ESTADO[s.est]} />
                      <span className="cs-suc-t">
                        <Link href={`/admin/activos?suc=${s.id}`}><b>{s.nombre}</b></Link>
                        <small>
                          {s.est === "ok" ? (s.censo_fecha ? `Completa · ${fCorta(s.censo_fecha)}` : "Completa") : s.est === "proc" ? "En proceso" : "Sin equipos registrados"}
                          {z.supervisores.length > 1 && s.supervisor ? ` · ${s.supervisor}` : ""}
                        </small>
                      </span>
                      <span className="cs-prog">
                        {s.total ? (
                          <>
                            <span className="cs-sbar"><i style={{ width: `${(s.val / s.total) * 100}%`, background: "var(--verde)" }} /><i style={{ width: `${(s.pend / s.total) * 100}%`, background: "var(--amarillo)" }} /></span>
                            <small>{n(s.val)} de {n(s.total)} {s.total === 1 ? "validado" : "validados"}</small>
                          </>
                        ) : <small>—</small>}
                      </span>
                      <span className="cs-suc-acc">
                        {s.pend ? <Link className="btn small primary" href={`${qs({ f: filtro, suc: s.id })}#cola`}>Revisar {n(s.pend)}</Link>
                          : s.val ? <Link className="btn small" href={`/admin/activos/etiquetas?sucursal=${s.id}`}>Imprimir QR</Link>
                          : <Link className="btn small" href={`/censo/${s.id}`}>Ver censo</Link>}
                      </span>
                    </li>
                  ))}
                </ul>
                {filtro === "todas" && (() => {
                  const sin = z.sucs.filter((s) => s.est === "none");
                  if (!sin.length) return null;
                  return (
                    <details className="cs-sin">
                      <summary>
                        <span className="cs-dot" style={{ background: COLOR.none }} />
                        <span><b>{pl(sin.length, "sucursal sin empezar", "sucursales sin empezar")}</b><small>{sin.map((s) => s.nombre).join(", ")}</small></span>
                        <span className="cs-sin-v">Ver</span>
                      </summary>
                      <ul>
                        {sin.map((s) => (
                          <li key={s.id}>
                            <span>{s.nombre}{z.supervisores.length > 1 && s.supervisor ? <small> · {s.supervisor}</small> : null}</span>
                            <Link className="btn small" href={`/censo/${s.id}`}>Ver censo</Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  );
                })()}
              </details>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Cola de validación ---------- */}
      <section className="card cs-cola" id="cola" aria-labelledby="cs-cola-t">
        {elegida ? (
          <div className="cs-cola-g">
            <nav className="cs-cola-suc" aria-label="Sucursales con equipos por validar">
              <span className="cs-cola-suc-t">Por validar · por sucursal</span>
              {conPendientes.map((s) => (
                <Link key={s.id} href={`${qs({ f: filtro, suc: s.id })}#cola`} scroll={false} aria-current={s.id === elegida.id ? "true" : undefined} title={s.nombre}>
                  <span className="cs-cs-n"><b>{s.nombre}</b></span>
                  <small>{s.zona}</small>
                  <span className="cs-cs-c num">{n(s.pend)}</span>
                </Link>
              ))}
            </nav>
            <div className="cs-cola-main">
              <header className="cs-cola-h">
                <h3 id="cs-cola-t">{elegida.nombre}</h3>
                <p>{elegida.zona} · {n(elegida.pend)} por validar</p>
              </header>
              <ColaValidacion
                key={elegida.id}
                items={items}
                sucursal={elegida.nombre}
                volver={`${qs({ f: filtro, suc: elegida.id })}#cola`}
                accion={validarActivos}
              />
            </div>
          </div>
        ) : (
          <div className="cs-cola-vacia">
            <h3 id="cs-cola-t">Nada por validar</h3>
            <p className="sub" style={{ margin: 0 }}>{total ? "Todos los equipos registrados ya están validados." : "Cuando un supervisor registre equipos, aparecerán aquí por sucursal."}</p>
          </div>
        )}
      </section>
    </main>
  );
}
