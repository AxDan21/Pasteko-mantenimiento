/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import FormEquipoCenso from "@/components/FormEquipoCenso";
import { requireSupervisor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { enlaces } from "@/lib/datos";
import type { Activo } from "@/lib/types";
import { borrarEquipoCenso, marcarCenso } from "../actions";

export const dynamic = "force-dynamic";

const MSG: Record<string, string> = {
  completa: "Sucursal marcada como completa. Mantenimiento validará los equipos.",
  abierta: "Sucursal reabierta para seguir registrando.",
  borrado: "Equipo borrado.",
};

export default async function CensoSucursal({ params, searchParams }: { params: Promise<{ sucursal: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { perfil, userId } = await requireSupervisor();
  const [{ sucursal: sid }, f] = await Promise.all([params, searchParams]);
  const esAdmin = perfil.rol === "admin";
  const supabase = await createClient();

  const { data: s } = await supabase.from("sucursales").select("id, nombre, zona, censo_completo, censo_fecha").eq("id", Number(sid)).maybeSingle();
  if (!s || (!esAdmin && s.zona !== perfil.zona)) notFound();

  const [{ data: a }, { data: eqs }] = await Promise.all([
    supabase.from("activos").select("*").eq("sucursal_id", s.id).eq("activo", true).order("registrado", { ascending: false }),
    supabase.from("equipos").select("nombre").order("orden"),
  ]);
  const activos = (a ?? []) as Activo[];
  const urls = await enlaces(supabase, "censo", activos.flatMap((x) => [x.ficha_path, x.foto_path]));
  const pendientes = activos.filter((x) => !x.validado).length;

  return (
    <>
      <Header items={[{ href: "/censo", label: "Censo" }, { href: "/censo/etiquetas", label: "Etiquetas QR" }]} salir sub={perfil.nombre} />
      <main className="wrap" style={{ maxWidth: 900 }}>
        <div className="detail-head">
          <Link href="/censo" className="btn small">← Mis sucursales</Link>
          <div>
            <p className="eyebrow">{s.zona}</p>
            <h1>{s.nombre}</h1>
            <p className="sub" style={{ margin: 0 }}>
              {activos.length} equipo{activos.length !== 1 ? "s" : ""} registrado{activos.length !== 1 ? "s" : ""}
              {pendientes ? ` · ${pendientes} por validar` : ""}
            </p>
          </div>
          <span className={`pill ${s.censo_completo ? "ok" : "warn"}`} style={{ marginLeft: "auto" }}>{s.censo_completo ? "Completa" : "En proceso"}</span>
        </div>

        {f.ok && MSG[f.ok] && <div className="note ok" style={{ marginBottom: 14 }}>{MSG[f.ok]}</div>}
        {f.error && <div className="note bad" style={{ marginBottom: 14 }}>{f.error}</div>}

        <div className="censo-layout">
          <div>
            {s.censo_completo ? (
              <section className="card">
                <h3>Sucursal completa</h3>
                <p className="sub">Si encontraste un equipo que faltaba, reábrela para registrarlo.</p>
                <form action={marcarCenso}>
                  <input type="hidden" name="sucursal_id" value={s.id} />
                  <input type="hidden" name="completo" value="false" />
                  <button className="btn" type="submit">Reabrir para agregar equipos</button>
                </form>
              </section>
            ) : (
              <FormEquipoCenso sucursalId={s.id} sucursal={s.nombre} equipos={(eqs ?? []).map((e) => e.nombre as string)} esAdmin={esAdmin} />
            )}
          </div>

          <div className="stack">
            <section className="card">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }}>
                <h3>Equipos registrados</h3>
                {activos.length > 0 && <Link className="btn small" href={`/censo/etiquetas?sucursal=${s.id}`}>Imprimir etiquetas QR</Link>}
              </div>
              {activos.length ? (
                <ul className="censo-list">
                  {activos.map((x) => {
                    const ficha = x.ficha_path ? urls.get(x.ficha_path) : undefined;
                    return (
                      <li key={x.id}>
                        {ficha ? (
                          <a href={ficha} target="_blank" rel="noopener noreferrer"><img src={ficha} alt={`Ficha técnica de ${x.id}`} /></a>
                        ) : (
                          <span className="no-img">Sin foto</span>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <b className="num">{x.id}</b> <span className={`pill ${x.validado ? "ok" : "warn"}`}>{x.validado ? "Validado" : "Por validar"}</span>
                          <p>{x.descripcion || x.equipo}</p>
                          <small>{x.equipo}{x.serie ? ` · Serie ${x.serie}` : " · Sin serie"}{x.marca ? ` · ${x.marca}` : ""}{x.modelo ? ` ${x.modelo}` : ""}</small>
                        </div>
                        {!x.validado && (esAdmin || x.registrado_por === userId) && (
                          <form action={borrarEquipoCenso}>
                            <input type="hidden" name="id" value={x.id} />
                            <input type="hidden" name="sucursal_id" value={s.id} />
                            <button className="btn small danger" type="submit" aria-label={`Borrar ${x.id}`}>Borrar</button>
                          </form>
                        )}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="sub">Todavía no hay equipos. Registra el primero.</p>
              )}
            </section>

            {!s.censo_completo && activos.length > 0 && (
              <section className="card">
                <h3>¿Terminaste esta sucursal?</h3>
                <p className="sub">Confirma que registraste todos los equipos de cocina, refrigeración, bebidas, exhibición y clima.</p>
                <form action={marcarCenso}>
                  <input type="hidden" name="sucursal_id" value={s.id} />
                  <input type="hidden" name="completo" value="true" />
                  <button className="btn primary" type="submit">Sucursal completa</button>
                </form>
              </section>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
