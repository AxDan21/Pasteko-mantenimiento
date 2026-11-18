import Seccion from "@/components/Seccion";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { vistasUsuarios } from "@/lib/secciones";
import type { Proveedor } from "@/lib/types";
import { actualizarProveedor, crearProveedor } from "../../acciones-modulos";

export const metadata = { title: "Proveedores · Pasteko" };

export default async function Proveedores() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: provs }, vistas] = await Promise.all([
    supabase.from("proveedores").select("*").order("activo", { ascending: false }).order("nombre"),
    vistasUsuarios(supabase),
  ]);
  const proveedores = (provs ?? []) as Proveedor[];

  return (
    <main className="wrap">
      <Seccion
        eyebrow="Panel de mantenimiento"
        titulo="Usuarios"
        sub="Proveedores externos: servicios que no hacen tus técnicos, como gas, ductos o garantías de fábrica. No entran a la app."
        vistas={vistas}
        activa="proveedores"
      />

      <details className="card alta-det">
        <summary><h3>Agregar proveedor</h3><span className="btn primary small">+ Nuevo proveedor</span></summary>
        <form action={crearProveedor} className="inline-form">
          <label className="field w2">Proveedor<input id="pv-n" name="nombre" required /></label>
          <label className="field">Especialidad<input id="pv-e" name="especialidad" required placeholder="Ej. Refrigeración" /></label>
          <label className="field">Cobertura<input id="pv-c" name="cobertura" placeholder="Ej. CDMX y Edomex" /></label>
          <label className="field">Contacto<input id="pv-ct" name="contacto" /></label>
          <label className="field">Teléfono<input id="pv-t" name="telefono" type="tel" /></label>
          <label className="field">Correo<input id="pv-m" name="correo" type="email" /></label>
          <label className="field">Calificación<select id="pv-cal" name="calificacion" defaultValue=""><option value="">Sin calificar</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          <button className="btn primary" type="submit">Agregar</button>
        </form>
      </details>

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
      ) : <div className="card"><p className="sub" style={{ margin: 0 }}>Sin proveedores registrados.</p></div>}
    </main>
  );
}
