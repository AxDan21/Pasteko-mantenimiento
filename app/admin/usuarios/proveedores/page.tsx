import Seccion from "@/components/Seccion";
import BuscarEnLista from "@/components/BuscarEnLista";
import Desplegable from "@/components/Desplegable";
import { Estado } from "@/components/Insignias";
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
        titulo="Usuarios"
        sub="Proveedores externos: servicios que no hacen tus técnicos, como gas, ductos o garantías de fábrica. No entran a la app."
        vistas={vistas}
        activa="proveedores"
      />

      <Desplegable id="nuevo" titulo="Agregar proveedor" detalle="Gas, ductos, garantías de fábrica u otros servicios externos.">
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
      </Desplegable>

      {proveedores.length > 0 && <div className="prv-buscar"><BuscarEnLista objetivo="prov-filas" placeholder="Proveedor, especialidad, cobertura o contacto" etiqueta="Buscar proveedores" /></div>}
      {proveedores.length ? (
        <div className="tbl-wrap">
          <table className="tbl-cards">
            <thead><tr><th>Proveedor</th><th>Especialidad</th><th>Cobertura</th><th>Contacto</th><th>Calificación</th><th>Estado</th></tr></thead>
            <tbody id="prov-filas">
              {proveedores.map((p) => (
                <tr key={p.id} className={p.activo ? undefined : "eqp-baja"} data-buscar={`${p.nombre} ${p.especialidad} ${p.cobertura ?? ""} ${p.contacto ?? ""} ${p.telefono ?? ""} ${p.correo ?? ""}`}>
                  <td data-label="Proveedor"><b>{p.nombre}</b>{!p.activo && <> <Estado tono="neutral">Inactivo</Estado></>}</td>
                  <td data-label="Especialidad">{p.especialidad}</td>
                  <td data-label="Cobertura">{p.cobertura ?? "—"}</td>
                  <td data-label="Contacto">{[p.contacto, p.telefono, p.correo].filter(Boolean).join(" · ") || "—"}</td>
                  <td data-label="Calificación">
                    <form action={actualizarProveedor} className="prv-mover">
                      <input type="hidden" name="id" value={p.id} />
                      <select name="calificacion" defaultValue={p.calificacion ?? ""} aria-label={`Calificación de ${p.nombre}`} className="mini-input">
                        <option value="">—</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>★ {n}</option>)}
                      </select>
                      <button className="btn small" type="submit">Guardar</button>
                    </form>
                  </td>
                  <td data-label="Estado">
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
      ) : <div className="ui-vacio"><b>Sin proveedores registrados</b><p>Agrega a quienes hacen servicios que no cubren tus técnicos.</p></div>}
    </main>
  );
}
