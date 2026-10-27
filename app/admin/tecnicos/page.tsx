import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mxn } from "@/lib/format";
import { estadoPreventivo, fCorta, hoy, mesActual, nombreMes, rangoISO } from "@/lib/panel";
import type { Perfil, Proveedor } from "@/lib/types";
import { actualizarTecnico, cambiarPassword, crearTecnico } from "../actions";
import { actualizarProveedor, crearProveedor } from "../acciones-modulos";

const MSG: Record<string, string> = {
  datos: "Llena nombre y correo, y usa una contraseña de al menos 8 caracteres.",
  password: "La contraseña debe tener al menos 8 caracteres.",
};

export default async function Tecnicos({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { userId } = await requireAdmin();
  const { ok, error } = await searchParams;
  const supabase = await createClient();
  const mes = mesActual(), h = hoy();
  const [tIni, tFin] = rangoISO(mes);
  const [{ data: perfiles }, { data: zonas }, { data: conteo }, { data: delMes }, { data: prevs }, { data: provs }] = await Promise.all([
    supabase.from("perfiles").select("*").order("rol").order("nombre"),
    supabase.from("sucursales").select("zona"),
    supabase.from("hojas_servicio").select("tecnico_id"),
    supabase.from("hojas_servicio").select("tecnico_id, total, tipo, creada").gte("creada", tIni).lt("creada", tFin),
    supabase.from("preventivos").select("tecnico_id, fecha, hecho").not("tecnico_id", "is", null).lte("fecha", h),
    supabase.from("proveedores").select("*").order("activo", { ascending: false }).order("nombre"),
  ]);
  const ind = new Map<string, { hojas: number; costo: number; prev: number; ultima: string | null; vencidos: number }>();
  const reg = (id: string) => ind.get(id) ?? ind.set(id, { hojas: 0, costo: 0, prev: 0, ultima: null, vencidos: 0 }).get(id)!;
  (delMes ?? []).forEach((x) => {
    const r = reg(x.tecnico_id as string);
    r.hojas += 1; r.costo += Number(x.total); if (x.tipo === "Preventivo") r.prev += 1;
    if (!r.ultima || (x.creada as string) > r.ultima) r.ultima = x.creada as string;
  });
  (prevs ?? []).forEach((x) => { if (estadoPreventivo({ fecha: x.fecha as string, hecho: x.hecho as boolean }, h).texto === "Vencido") reg(x.tecnico_id as string).vencidos += 1; });
  const proveedores = (provs ?? []) as Proveedor[];
  const listaZonas = Array.from(new Set((zonas ?? []).map((z) => z.zona as string))).sort();
  const hojasPor = new Map<string, number>();
  (conteo ?? []).forEach((h) => hojasPor.set(h.tecnico_id as string, (hojasPor.get(h.tecnico_id as string) ?? 0) + 1));

  return (
    <>
      <main className="wrap">
        <div className="head-row">
          <div>
            <p className="eyebrow">Panel de mantenimiento</p>
            <h1 className="page-h">Técnicos y proveedores</h1>
          </div>
        </div>

        {ok && <div className="note ok" style={{ marginBottom: 14 }}>{ok === "password" ? "Contraseña actualizada." : "Usuario creado. Compártele su correo y contraseña."}</div>}
        {error && <div className="note bad" style={{ marginBottom: 14 }}>{MSG[error] ?? `No se pudo completar: ${error}`}</div>}

        <section className="card" style={{ marginBottom: 18 }}>
          <h3>Dar de alta técnico</h3>
          <p className="sub">Entra en /login con este correo y contraseña. Puede cambiarse después.</p>
          <form action={crearTecnico} className="inline-form">
            <label className="field">Nombre<input id="t-nombre" name="nombre" required /></label>
            <label className="field">Correo<input id="t-email" name="email" type="email" required /></label>
            <label className="field">Contraseña<input id="t-pass" name="password" type="text" minLength={8} required placeholder="Mínimo 8 caracteres" /></label>
            <label className="field">Zona
              <select id="t-zona" name="zona" defaultValue="">
                <option value="">Sin zona</option>
                {listaZonas.map((z) => <option key={z}>{z}</option>)}
              </select>
            </label>
            <label className="field">Rol
              <select id="t-rol" name="rol" defaultValue="tecnico">
                <option value="tecnico">Técnico</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            <button className="btn primary" type="submit">Dar de alta</button>
          </form>
        </section>

        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Nombre</th><th>Rol</th><th>Zona</th><th className="r">Hojas</th><th>Estado</th><th>Nueva contraseña</th></tr></thead>
            <tbody>
              {((perfiles ?? []) as Perfil[]).map((p) => (
                <tr key={p.id}>
                  <td><b>{p.nombre}</b></td>
                  <td>{p.rol === "admin" ? "Administrador" : "Técnico"}</td>
                  <td>
                    <form action={actualizarTecnico} style={{ display: "flex", gap: 6 }}>
                      <input type="hidden" name="id" value={p.id} />
                      <select name="zona" defaultValue={p.zona ?? ""} aria-label={`Zona de ${p.nombre}`} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 6, background: "var(--surface)" }}>
                        <option value="">Sin zona</option>
                        {listaZonas.map((z) => <option key={z}>{z}</option>)}
                      </select>
                      <button className="btn small" type="submit">Guardar</button>
                    </form>
                  </td>
                  <td className="r num">{hojasPor.get(p.id) ?? 0}</td>
                  <td>
                    <form action={actualizarTecnico} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="hidden" name="id" value={p.id} />
                      <input type="hidden" name="activo" value={String(!p.activo)} />
                      <span className={`pill ${p.activo ? "ok" : "bad"}`}>{p.activo ? "Activo" : "Desactivado"}</span>
                      {p.id !== userId && <button className="btn small" type="submit">{p.activo ? "Desactivar" : "Activar"}</button>}
                    </form>
                  </td>
                  <td>
                    <form action={cambiarPassword} style={{ display: "flex", gap: 6 }}>
                      <input type="hidden" name="id" value={p.id} />
                      <input name="password" type="text" minLength={8} placeholder="Mín. 8" aria-label={`Nueva contraseña de ${p.nombre}`} style={{ width: 110, border: "1px solid var(--line)", borderRadius: 8, padding: 6, background: "var(--surface)" }} />
                      <button className="btn small" type="submit">Cambiar</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sub" style={{ marginTop: 10 }}>Desactivar impide que el técnico entre y envíe hojas; sus hojas anteriores se conservan.</p>

        <section className="card" style={{ marginTop: 18 }}>
          <h3>Indicadores de {nombreMes(mes)}</h3>
          <p className="sub">Salen de las hojas de servicio enviadas y de los preventivos asignados a cada técnico.</p>
          <div className="tbl-wrap" style={{ border: 0 }}>
            <table>
              <thead><tr><th>Técnico</th><th>Zona</th><th className="r">Hojas</th><th className="r">Preventivas</th><th className="r">Costo registrado</th><th className="r">Preventivos vencidos</th><th>Última hoja</th></tr></thead>
              <tbody>
                {((perfiles ?? []) as Perfil[]).filter((p) => p.activo).map((p) => {
                  const r = ind.get(p.id);
                  return (
                    <tr key={p.id}>
                      <td><b>{p.nombre}</b></td>
                      <td>{p.zona ?? "—"}</td>
                      <td className="r num">{r?.hojas ?? 0}</td>
                      <td className="r num">{r?.prev ?? 0}</td>
                      <td className="r num">{mxn(r?.costo ?? 0)}</td>
                      <td className="r"><span className={`pill ${r?.vencidos ? "bad" : "ok"}`}>{r?.vencidos ?? 0}</span></td>
                      <td className="num">{r?.ultima ? fCorta(r.ultima) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card" style={{ marginTop: 18 }}>
          <h3>Proveedores externos</h3>
          <p className="sub">Para servicios que no hacen tus técnicos: gas, ductos, garantías de fábrica.</p>
          <form action={crearProveedor} className="inline-form" style={{ marginBottom: 14 }}>
            <label className="field w2">Proveedor<input id="pv-n" name="nombre" required /></label>
            <label className="field">Especialidad<input id="pv-e" name="especialidad" required placeholder="Ej. Refrigeración" /></label>
            <label className="field">Cobertura<input id="pv-c" name="cobertura" placeholder="Ej. CDMX y Edomex" /></label>
            <label className="field">Contacto<input id="pv-ct" name="contacto" /></label>
            <label className="field">Teléfono<input id="pv-t" name="telefono" type="tel" /></label>
            <label className="field">Correo<input id="pv-m" name="correo" type="email" /></label>
            <label className="field">Calificación<select id="pv-cal" name="calificacion" defaultValue=""><option value="">Sin calificar</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
            <button className="btn primary" type="submit">Agregar</button>
          </form>
          {proveedores.length ? (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Proveedor</th><th>Especialidad</th><th>Cobertura</th><th>Contacto</th><th>Calificación</th><th>Estado</th></tr></thead>
                <tbody>
                  {proveedores.map((p) => (
                    <tr key={p.id} style={p.activo ? undefined : { opacity: 0.55 }}>
                      <td><b>{p.nombre}</b></td>
                      <td>{p.especialidad}</td>
                      <td>{p.cobertura ?? "—"}</td>
                      <td>{[p.contacto, p.telefono, p.correo].filter(Boolean).join(" · ") || "—"}</td>
                      <td>
                        <form action={actualizarProveedor} style={{ display: "flex", gap: 6 }}>
                          <input type="hidden" name="id" value={p.id} />
                          <select name="calificacion" defaultValue={p.calificacion ?? ""} aria-label={`Calificación de ${p.nombre}`} className="mini-input">
                            <option value="">—</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>★ {n}</option>)}
                          </select>
                          <button className="btn small" type="submit">Guardar</button>
                        </form>
                      </td>
                      <td>
                        <form action={actualizarProveedor}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="activo" value={String(!p.activo)} />
                          <button className="btn small" type="submit">{p.activo ? "Desactivar" : "Activar"}</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="sub">Sin proveedores registrados.</p>}
        </section>
      </main>
    </>
  );
}
