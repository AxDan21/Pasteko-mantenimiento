import Link from "next/link";
import Seccion from "@/components/Seccion";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { mxn } from "@/lib/format";
import { vistasUsuarios } from "@/lib/secciones";
import { estadoPreventivo, fCorta, hoy, mesActual, nombreMes, rangoISO } from "@/lib/panel";
import type { Perfil } from "@/lib/types";
import { actualizarTecnico, cambiarPassword, crearTecnico } from "../actions";

export const metadata = { title: "Usuarios · Pasteko" };

type Rol = Perfil["rol"];
const ROLES: { rol: Rol; nombre: string; plural: string; hace: string; icono: string }[] = [
  { rol: "tecnico", nombre: "Técnico", plural: "Técnicos", hace: "Atienden reportes y llenan hojas de servicio", icono: "🔧" },
  { rol: "supervisor", nombre: "Supervisor", plural: "Supervisores", hace: "Hacen el censo de equipos de su zona", icono: "📋" },
  { rol: "admin", nombre: "Administrador", plural: "Administradores", hace: "Acceso completo al panel", icono: "🛡" },
  { rol: "consulta", nombre: "Consulta", plural: "Consulta", hace: "Solo ven el avance de aperturas", icono: "👁" },
];
const MSG: Record<string, string> = {
  zona: "Para un supervisor elige su zona: solo verá y registrará equipos de esas sucursales.",
  datos: "Llena nombre y correo, y usa una contraseña de al menos 8 caracteres.",
  password: "La contraseña debe tener al menos 8 caracteres.",
};
const iniciales = (n: string) => n.split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

export default async function Usuarios({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; rol?: string }> }) {
  const { userId } = await requireAdmin();
  const f = await searchParams;
  const supabase = await createClient();
  const mes = mesActual(), h = hoy();
  const [tIni, tFin] = rangoISO(mes);

  const [{ data: per }, { data: suc }, { data: delMes }, { data: prevs }, { data: act }, vistas] = await Promise.all([
    supabase.from("perfiles").select("*").order("nombre"),
    supabase.from("sucursales").select("id, nombre, zona").eq("activa", true).order("nombre"),
    supabase.from("hojas_servicio").select("tecnico_id, total, creada, pagado, refacciones").gte("creada", tIni).lt("creada", tFin),
    supabase.from("preventivos").select("tecnico_id, fecha, hecho").not("tecnico_id", "is", null).eq("hecho", false).lte("fecha", h),
    supabase.from("activos").select("sucursal_id, validado").eq("activo", true),
    vistasUsuarios(supabase),
  ]);

  // Correos de acceso (vienen de la autenticación, no de perfiles)
  const correos = new Map<string, string>();
  try {
    const { data } = await adminClient().auth.admin.listUsers({ perPage: 500 });
    data.users.forEach((u) => u.email && correos.set(u.id, u.email));
  } catch {}

  const perfiles = (per ?? []) as Perfil[];
  const sucursales = (suc ?? []) as { id: number; nombre: string; zona: string }[];
  const zonas = Array.from(new Set(sucursales.map((s) => s.zona))).sort();
  const zonaDe = new Map(sucursales.map((s) => [s.id, s.zona]));

  const tec = new Map<string, { hojas: number; costo: number; refs: number; pendiente: number; ultima: string | null; vencidos: number }>();
  const t = (id: string) => tec.get(id) ?? tec.set(id, { hojas: 0, costo: 0, refs: 0, pendiente: 0, ultima: null, vencidos: 0 }).get(id)!;
  (delMes ?? []).forEach((x) => {
    const r = t(x.tecnico_id as string);
    r.hojas += 1; r.costo += Number(x.total);
    if (!x.pagado) r.pendiente += Number(x.total);
    r.refs += ((x.refacciones ?? []) as { cantidad: number; costo: number }[]).reduce((s, y) => s + Number(y.cantidad) * Number(y.costo), 0);
    if (!r.ultima || (x.creada as string) > r.ultima) r.ultima = x.creada as string;
  });
  (prevs ?? []).forEach((x) => { if (estadoPreventivo({ fecha: x.fecha as string, hecho: false }, h).texto === "Vencido") t(x.tecnico_id as string).vencidos += 1; });

  const censo = new Map<string, { equipos: number; porValidar: number }>();
  ((act ?? []) as { sucursal_id: number; validado: boolean }[]).forEach((a) => {
    const z = zonaDe.get(a.sucursal_id);
    if (!z) return;
    const c = censo.get(z) ?? censo.set(z, { equipos: 0, porValidar: 0 }).get(z)!;
    c.equipos += 1; if (!a.validado) c.porValidar += 1;
  });

  const filtro = ROLES.find((r) => r.rol === f.rol)?.rol;
  const grupos = ROLES.filter((r) => !filtro || r.rol === filtro).map((r) => ({ ...r, gente: perfiles.filter((p) => p.rol === r.rol) })).filter((g) => g.gente.length);
  const sinZona = perfiles.filter((p) => p.rol === "supervisor" && p.activo && !p.zona).length;

  return (
    <main className="wrap">
      <Seccion
        eyebrow="Panel de mantenimiento"
        titulo="Usuarios"
        sub="Quién entra a la app y qué puede hacer. Las tiendas no necesitan usuario: reportan desde el QR."
        vistas={vistas}
        activa="usuarios"
      />

      {f.ok && <div className="note ok" style={{ marginBottom: 14 }}>{f.ok === "password" ? "Contraseña actualizada. Compártela por privado." : "Usuario creado. Compártele su correo y contraseña por privado."}</div>}
      {f.error && <div className="note bad" style={{ marginBottom: 14 }}>{MSG[f.error] ?? `No se pudo completar: ${f.error}`}</div>}
      {sinZona > 0 && <div className="note warn" style={{ marginBottom: 14 }}>{sinZona} supervisor{sinZona > 1 ? "es" : ""} sin zona: no verán ninguna sucursal en el censo. Asígnales una en Ajustes.</div>}

      <nav className="usr-roles" aria-label="Filtrar por rol">
        <Link href="/admin/usuarios" className={!filtro ? "on" : ""}><b className="num">{perfiles.filter((p) => p.activo).length}</b><span>Todos</span><small>usuarios activos</small></Link>
        {ROLES.map((r) => (
          <Link key={r.rol} href={`/admin/usuarios?rol=${r.rol}`} className={filtro === r.rol ? "on" : ""}>
            <b className="num">{perfiles.filter((p) => p.rol === r.rol && p.activo).length}</b>
            <span>{r.icono} {r.plural}</span><small>{r.hace}</small>
          </Link>
        ))}
      </nav>

      <details className="card alta-det" open={!!f.error && f.error !== "password"}>
        <summary><h3>Dar de alta usuario</h3><span className="btn primary small">+ Nuevo usuario</span></summary>
        <p className="sub">Entra con este correo y contraseña. Si es supervisor, su zona define qué sucursales ve en el censo.</p>
        <form action={crearTecnico} className="inline-form">
          <label className="field">Rol
            <select id="u-rol" name="rol" defaultValue={filtro ?? "tecnico"}>
              {ROLES.map((r) => <option key={r.rol} value={r.rol}>{r.nombre}</option>)}
            </select>
          </label>
          <label className="field">Nombre<input id="u-nombre" name="nombre" required /></label>
          <label className="field">Correo<input id="u-email" name="email" type="email" required /></label>
          <label className="field">Contraseña<input id="u-pass" name="password" type="text" minLength={8} required placeholder="Mínimo 8 caracteres" /></label>
          <label className="field">Si es técnico
            <select id="u-tipo" name="tipo_tecnico" defaultValue="propio">
              <option value="propio">Propio (sueldo)</option>
              <option value="proveedor">Proveedor (cobra por servicio)</option>
            </select>
          </label>
          <label className="field">Zona
            <select id="u-zona" name="zona" defaultValue="">
              <option value="">Sin zona</option>
              {zonas.map((z) => <option key={z}>{z}</option>)}
            </select>
          </label>
          <button className="btn primary" type="submit">Dar de alta</button>
        </form>
      </details>

      {grupos.map((g) => (
        <section key={g.rol} className="usr-grupo">
          <h2 className="sec-title">{g.icono} {g.plural} <span className="sub">· {g.gente.filter((p) => p.activo).length} activos</span></h2>
          <ul className="usr-lista">
            {g.gente.map((p) => {
              const r = tec.get(p.id);
              const c = p.zona ? censo.get(p.zona) : undefined;
              const tiendas = p.zona ? sucursales.filter((s) => s.zona === p.zona) : [];
              return (
                <li key={p.id} className={`usr ${p.activo ? "" : "off"}`}>
                  <span className={`usr-av r-${p.rol}`} aria-hidden>{iniciales(p.nombre)}</span>
                  <div className="usr-id">
                    <b>{p.nombre}{p.id === userId && <span className="pill neutral" style={{ marginLeft: 8 }}>Tú</span>}</b>
                    <span className="usr-mail">{correos.get(p.id) ?? "—"}</span>
                    <span className="usr-zona">{p.zona ?? (p.rol === "supervisor" ? "⚠ Sin zona" : "Sin zona")}</span>
                    {p.rol === "tecnico" && (
                      <span className={`usr-tipo ${p.tipo_tecnico === "proveedor" ? "prov" : ""}`}>{p.tipo_tecnico === "proveedor" ? "Proveedor · cobra por servicio" : "Propio · sueldo"}</span>
                    )}
                  </div>

                  <div className="usr-dato">
                    {p.rol === "tecnico" && (
                      <>
                        <div><b className="num">{r?.hojas ?? 0}</b><small>hojas en {nombreMes(mes).split(" ")[0].toLowerCase()}</small></div>
                        {p.tipo_tecnico === "proveedor" ? (
                          <div><b className="num">{mxn(r?.costo ?? 0)}</b><small>a pagarle en el mes{r?.pendiente ? ` · ${mxn(r.pendiente)} pendiente` : ""}</small></div>
                        ) : (
                          <div><b className="num">{mxn(r?.refs ?? 0)}</b><small>refacciones (referencia)</small></div>
                        )}
                        <div><b className={`num ${r?.vencidos ? "rojo" : ""}`}>{r?.vencidos ?? 0}</b><small>preventivos vencidos</small></div>
                        <div><b className="num">{r?.ultima ? fCorta(r.ultima) : "—"}</b><small>última hoja</small></div>
                      </>
                    )}
                    {p.rol === "supervisor" && (
                      <>
                        <div><b className="num">{tiendas.length}</b><small>{tiendas.length === 1 ? "sucursal" : "sucursales"}</small></div>
                        <div><b className="num">{c?.equipos ?? 0}</b><small>equipos en censo</small></div>
                        <div><b className={`num ${c?.porValidar ? "ambar" : ""}`}>{c?.porValidar ?? 0}</b><small>por validar</small></div>
                        <div className="usr-tiendas"><small>{tiendas.map((s) => s.nombre).join(" · ") || "—"}</small></div>
                      </>
                    )}
                  </div>

                  <div className="usr-acc">
                    <span className={`pill ${p.activo ? "ok" : "bad"}`}>{p.activo ? "Activo" : "Desactivado"}</span>
                    <details className="usr-aj">
                      <summary className="btn small">Ajustes</summary>
                      <div className="usr-pop">
                        <form action={actualizarTecnico} className="usr-f">
                          <input type="hidden" name="id" value={p.id} />
                          <label className="field">Zona
                            <select name="zona" defaultValue={p.zona ?? ""} aria-label={`Zona de ${p.nombre}`}>
                              <option value="">Sin zona</option>
                              {zonas.map((z) => <option key={z}>{z}</option>)}
                            </select>
                          </label>
                          <button className="btn small" type="submit">Guardar zona</button>
                        </form>
                        {p.rol === "tecnico" && (
                          <form action={actualizarTecnico} className="usr-f">
                            <input type="hidden" name="id" value={p.id} />
                            <label className="field">Tipo de técnico
                              <select name="tipo_tecnico" defaultValue={p.tipo_tecnico ?? "propio"} aria-label={`Tipo de técnico de ${p.nombre}`}>
                                <option value="propio">Propio (sueldo): sus hojas no generan pago</option>
                                <option value="proveedor">Proveedor: se le paga por servicio</option>
                              </select>
                            </label>
                            <button className="btn small" type="submit">Guardar tipo</button>
                          </form>
                        )}
                        <form action={cambiarPassword} className="usr-f">
                          <input type="hidden" name="id" value={p.id} />
                          <label className="field">Nueva contraseña
                            <input name="password" type="text" minLength={8} placeholder="Mínimo 8 caracteres" aria-label={`Nueva contraseña de ${p.nombre}`} />
                          </label>
                          <button className="btn small" type="submit">Cambiar</button>
                        </form>
                        {p.id !== userId && (
                          <form action={actualizarTecnico}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="activo" value={String(!p.activo)} />
                            <button className={`btn small ${p.activo ? "peligro" : ""}`} type="submit">{p.activo ? "Desactivar acceso" : "Volver a activar"}</button>
                          </form>
                        )}
                      </div>
                    </details>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <p className="sub" style={{ marginTop: 10 }}>Desactivar impide entrar a la app; su historial (hojas, censo) se conserva.</p>
    </main>
  );
}
