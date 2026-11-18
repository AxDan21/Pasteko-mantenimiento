/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import Header from "@/components/Header";
import { requireSupervisor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fotoEquipo } from "@/lib/tickets";

export const dynamic = "force-dynamic";

type Est = "proc" | "nada" | "ok";
const ESTADO: Record<Est, { t: string; c: string }> = {
  proc: { t: "En proceso", c: "proc" },
  nada: { t: "Sin empezar", c: "nada" },
  ok: { t: "Completa", c: "ok" },
};
const FILTROS: [string, string][] = [["todas", "Todas"], ["proc", "En proceso"], ["nada", "Sin empezar"], ["ok", "Completas"]];
const plural = (n: number, s: string, p = `${s}s`) => `${n} ${n === 1 ? s : p}`;

function hace(f: string) {
  const d = Math.floor((Date.now() - new Date(f).getTime()) / 86400000);
  return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
}

/** Inicio del supervisor: avance del censo de su zona y sus sucursales. */
export default async function Censo({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { perfil, userId } = await requireSupervisor();
  const { f = "todas" } = await searchParams;
  const esAdmin = perfil.rol === "admin";
  const supabase = await createClient();

  let qs = supabase.from("sucursales").select("id, nombre, zona, censo_completo").eq("activa", true).order("zona").order("nombre");
  if (!esAdmin) qs = qs.eq("zona", perfil.zona ?? "__sin_zona__");
  const [{ data: suc }, { data: act }] = await Promise.all([
    qs,
    supabase.from("activos").select("sucursal_id, validado, equipo, registrado, registrado_por").eq("activo", true).order("registrado", { ascending: false }),
  ]);
  const sucursales = (suc ?? []) as { id: number; nombre: string; zona: string; censo_completo: boolean }[];
  const ids = new Set(sucursales.map((s) => s.id));
  const activos = ((act ?? []) as { sucursal_id: number; validado: boolean; equipo: string; registrado: string; registrado_por: string | null }[]).filter((a) => ids.has(a.sucursal_id));

  const info = new Map<number, { total: number; pendientes: number; fotos: string[]; ultimo: string | null }>();
  activos.forEach((a) => {
    const c = info.get(a.sucursal_id) ?? { total: 0, pendientes: 0, fotos: [], ultimo: null };
    c.total += 1;
    if (!a.validado) c.pendientes += 1;
    const foto = fotoEquipo(null, a.equipo);
    if (foto && !c.fotos.includes(foto) && c.fotos.length < 3) c.fotos.push(foto);
    if (!c.ultimo) c.ultimo = a.registrado;
    info.set(a.sucursal_id, c);
  });
  const estadoDe = (s: { id: number; censo_completo: boolean }): Est => (s.censo_completo ? "ok" : info.get(s.id)?.total ? "proc" : "nada");
  const cuenta = (e: Est) => sucursales.filter((s) => estadoDe(s) === e).length;
  const completas = cuenta("ok"), enProceso = cuenta("proc"), sinEmpezar = cuenta("nada");
  const total = sucursales.length;
  const pctComp = total ? Math.round((completas / total) * 100) : 0;
  const pctProc = total ? Math.round(((completas + enProceso) / total) * 100) : 0;

  // Continuar: la última sucursal no completa donde registró este usuario (o cualquiera de la zona).
  const abiertas = new Set(sucursales.filter((s) => !s.censo_completo).map((s) => s.id));
  const ult = activos.find((a) => a.registrado_por === userId && abiertas.has(a.sucursal_id)) ?? activos.find((a) => abiertas.has(a.sucursal_id));
  const seguir = ult ? sucursales.find((s) => s.id === ult.sucursal_id) : sucursales.find((s) => !s.censo_completo);
  const seguirInfo = seguir ? info.get(seguir.id) : undefined;

  const orden: Record<Est, number> = { proc: 0, nada: 1, ok: 2 };
  const lista = sucursales.filter((s) => f === "todas" || estadoDe(s) === f).sort((a, b) => orden[estadoDe(a)] - orden[estadoDe(b)] || a.nombre.localeCompare(b.nombre));
  const zonas = Array.from(new Set(lista.map((s) => s.zona)));

  return (
    <>
      <Header items={[{ href: "/censo", label: "Censo", activo: true }, { href: "/censo/etiquetas", label: "Etiquetas QR" }, ...(esAdmin ? [{ href: "/admin/activos/censo", label: "Panel" }] : [])]} salir sub={perfil.nombre} />
      <main className="wrap cz">
        {!esAdmin && !perfil.zona && (
          <div className="note warn">Tu usuario no tiene zona asignada. Pide a Mantenimiento que te la asigne para ver tus sucursales.</div>
        )}

        <div className="cz-top">
          <section className="cz-avance">
            <div className="cz-anillo" style={{ background: `conic-gradient(#46ad48 ${pctComp}%, #fab428 0 ${pctProc}%, var(--surface-2) 0)` }} aria-hidden="true">
              <span><b>{completas}<small>/{total}</small></b><small>completas</small></span>
            </div>
            <div className="cz-avance-t">
              <p className="cz-kicker">Censo de equipos · {esAdmin ? "todas las zonas" : perfil.zona ?? "sin zona"}</p>
              <h1>Equipos de mis sucursales</h1>
              <div className="cz-chips">
                <span className="ok"><i />{plural(completas, "completa")}</span>
                <span className="proc"><i />{enProceso} en proceso</span>
                <span className="nada"><i />{sinEmpezar} sin empezar</span>
                <span className="neg">{plural(activos.length, "equipo registrado", "equipos registrados")}</span>
              </div>
            </div>
          </section>

          {seguir && (
            <Link href={`/censo/${seguir.id}`} className="cz-seguir">
              <img src="/mascota.webp" alt="" />
              <small>{seguirInfo?.total ? "CONTINÚA DONDE TE QUEDASTE" : "EMPIEZA POR AQUÍ"}</small>
              <span className="cz-seguir-t">
                <b>{seguir.nombre}</b>
                <span>{seguirInfo?.total ? `${plural(seguirInfo.total, "equipo registrado", "equipos registrados")}${seguirInfo.ultimo ? ` · última vez ${hace(seguirInfo.ultimo)}` : ""}` : "Aún sin equipos"}</span>
              </span>
              <span className="cz-seguir-b">
                {seguirInfo?.total ? "Seguir registrando" : "Empezar"}
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </Link>
          )}
        </div>

        <section className="cz-pasos" aria-label="Cómo registrar">
          <div>
            <span className="a"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M5 9h14M8 5v1M8 12v3" /></svg></span>
            <p><b>1. Registra cada equipo</b>Refris, hornos, cafeteras, vitrinas, climas… todos.</p>
          </div>
          <div>
            <span className="b"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 8a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="4" /></svg></span>
            <p><b>2. Foto de la placa</b>Clara y legible; copia la serie tal cual.</p>
          </div>
          <div>
            <span className="c"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
            <p><b>3. Sucursal completa</b>Mantenimiento valida e imprime los QR.</p>
          </div>
        </section>

        <div className="cz-cab">
          <h2>Mis sucursales</h2>
          <nav className="cz-filtros" aria-label="Filtrar sucursales">
            {FILTROS.map(([id, label]) => {
              const n = id === "todas" ? total : cuenta(id as Est);
              return <Link key={id} href={id === "todas" ? "/censo" : `/censo?f=${id}`} className={f === id ? "on" : ""} aria-current={f === id ? "page" : undefined}>{label} · {n}</Link>;
            })}
          </nav>
        </div>

        {!lista.length && <p className="sub">No hay sucursales en este filtro.</p>}
        {zonas.map((z) => (
          <section key={z} className="cz-zona">
            {esAdmin && <h3 className="sec-title">{z}</h3>}
            <div className="cz-grid">
              {lista.filter((s) => s.zona === z).map((s, i) => {
                const c = info.get(s.id) ?? { total: 0, pendientes: 0, fotos: [], ultimo: null };
                const e = ESTADO[estadoDe(s)];
                return (
                  <Link key={s.id} href={`/censo/${s.id}`} className="cz-suc" style={{ animationDelay: `${i * 0.04}s` }}>
                    <span className="cz-suc-top">
                      <span>
                        <b>{s.nombre}</b>
                        <span className={`cz-pill ${e.c}`}><i />{e.t}</span>
                      </span>
                      <span className="cz-ir" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></span>
                    </span>
                    <span className="cz-suc-pie">
                      <span className="cz-n"><b>{c.total}</b>{c.total === 1 ? "equipo" : "equipos"}</span>
                      {c.fotos.length > 0 ? (
                        <span className="cz-fotos">{c.fotos.map((src) => <img key={src} src={src} alt="" />)}</span>
                      ) : !c.total ? <span className="cz-empezar">Empezar</span> : null}
                    </span>
                    {c.pendientes > 0 && <small className="cz-pend">{c.pendientes} por validar</small>}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
