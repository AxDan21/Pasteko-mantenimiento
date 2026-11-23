import Link from "next/link";
import BotonConfirmar from "@/components/BotonConfirmar";
import BuscarEnLista from "@/components/BuscarEnLista";
import CopiarTexto from "@/components/CopiarTexto";
import Desplegable from "@/components/Desplegable";
import Encabezado from "@/components/Encabezado";
import { Estado } from "@/components/Insignias";
import Kpi from "@/components/Kpi";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mxn } from "@/lib/format";
import type { Refaccion2 } from "@/lib/types";
import { ajustarStock, borrarRefaccion, crearRefaccion } from "../acciones-modulos";

export default async function Refacciones() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: r, error }, { data: eqs }] = await Promise.all([
    supabase.from("refacciones").select("*").order("nombre"),
    supabase.from("equipos").select("nombre").eq("vigente", true).order("orden"),
  ]);
  const refs = (r ?? []) as Refaccion2[];
  const bajas = refs.filter((x) => x.stock < x.minimo);
  const ubicaciones = Array.from(new Set(["Almacén Pachuca", "Almacén CDMX", ...refs.map((x) => x.ubicacion)]));
  const pedido =
    "Pedido de refacciones · Mantenimiento Pasteko\n\n" +
    bajas.map((x) => `${x.codigo ?? "s/c"} | ${x.nombre} | Pedir ${Math.max(x.minimo * 2 - x.stock, 1)} pzas | Entregar en ${x.ubicacion}`).join("\n");

  const valor = refs.reduce((s, x) => s + x.stock * Number(x.costo), 0);
  const sinStock = refs.filter((x) => x.stock === 0).length;
  const porPedir = bajas.filter((x) => x.stock > 0).length;

  return (
    <main className="wrap ref">
      <Encabezado
        titulo="Refacciones"
        sub="Existencias en los almacenes, con mínimo para saber cuándo pedir. Ajusta el stock con − y + al usar o recibir piezas."
        acciones={<Link className="btn" href="/admin/exportar?tabla=refacciones">Descargar CSV</Link>}
      />

      <div className="rz-kpis srv-kpis">
        <Kpi icono="refacciones" tono="info" titulo="Artículos" valor={refs.length} detalle={`${refs.reduce((s, x) => s + x.stock, 0)} piezas en almacén`} />
        <Kpi icono="dinero" tono="marca" titulo="Valor en almacén" valor={mxn(valor)} detalle="a costo de compra" />
        <Kpi icono="reloj" tono="warn" titulo="Por pedir" valor={porPedir} detalle="debajo del mínimo" />
        <Kpi icono="falla" tono="bad" titulo="Sin stock" valor={sinStock} alerta={sinStock > 0} detalle="pueden detener una reparación" />
      </div>

      <Desplegable id="nuevo" titulo="Agregar refacción" detalle="Define un mínimo para que el panel te avise cuándo pedir.">
        <form action={crearRefaccion} className="prv-form">
          <fieldset>
            <legend>Pieza</legend>
            <label className="field prv-ancho">Refacción<input name="nombre" required placeholder="Ej. Capacitor de arranque 35 µF" /></label>
            <label className="field">Código<input name="codigo" placeholder="Opcional" /></label>
            <label className="field">Equipo<select name="equipo" defaultValue=""><option value="">General</option>{(eqs ?? []).map((e) => <option key={e.nombre as string}>{e.nombre as string}</option>)}</select></label>
            <label className="field">Ubicación<select name="ubicacion" defaultValue={ubicaciones[0]}>{ubicaciones.map((u) => <option key={u}>{u}</option>)}</select></label>
          </fieldset>
          <fieldset>
            <legend>Existencia y costo</legend>
            <label className="field">Stock<input name="stock" type="number" min="0" defaultValue={1} /></label>
            <label className="field">Mínimo<input name="minimo" type="number" min="0" defaultValue={1} /></label>
            <label className="field">Costo unitario<input name="costo" type="number" min="0" step="0.01" required /></label>
          </fieldset>
          <div className="prv-form-pie"><button className="btn primary" type="submit">Agregar</button></div>
        </form>
      </Desplegable>

      <div className="prv-barra">
        <h2 className="ref-h">Inventario</h2>
        <div className="secc-acc">
          {refs.length > 0 && <BuscarEnLista objetivo="ref-filas" placeholder="Pieza, código, equipo o almacén" etiqueta="Buscar refacciones" />}
          <CopiarTexto texto={bajas.length ? pedido : ""} etiqueta={`Copiar lista de pedido (${bajas.length})`} />
        </div>
      </div>
      {error ? (
        <div className="ui-error"><b>No se pudieron cargar las refacciones</b><p>Esto no significa que no haya. Recarga la página para intentarlo de nuevo.</p></div>
      ) : refs.length ? (
        <div className="tbl-wrap">
          <table className="tbl-cards">
            <thead><tr><th>Código</th><th>Refacción</th><th>Equipo</th><th>Ubicación</th><th>Stock</th><th className="r">Mínimo</th><th className="r">Costo</th><th>Estado</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody id="ref-filas">
              {refs.map((x) => {
                const [t, c] = x.stock === 0 ? ["Sin stock", "bad"] : x.stock < x.minimo ? ["Pedir", "warn"] : ["OK", "ok"];
                return (
                  <tr key={x.id} data-buscar={`${x.codigo ?? ""} ${x.nombre} ${x.equipo ?? "General"} ${x.ubicacion} ${t}`}>
                    <td data-label="Código" className="num">{x.codigo ?? "—"}</td>
                    <td data-label="Refacción"><b>{x.nombre}</b></td>
                    <td data-label="Equipo">{x.equipo ?? "General"}</td>
                    <td data-label="Ubicación">{x.ubicacion}</td>
                    <td data-label="Stock">
                      <span className="stepper">
                        <form action={ajustarStock}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="delta" value="-1" /><button type="submit" aria-label={`Restar una pieza de ${x.nombre}`}>−</button></form>
                        <b className="num">{x.stock}</b>
                        <form action={ajustarStock}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="delta" value="1" /><button type="submit" aria-label={`Sumar una pieza de ${x.nombre}`}>+</button></form>
                      </span>
                    </td>
                    <td data-label="Mínimo" className="r num">{x.minimo}</td>
                    <td data-label="Costo" className="r num">{mxn(Number(x.costo))}</td>
                    <td data-label="Estado"><Estado tono={c}>{t}</Estado></td>
                    <td className="r"><form action={borrarRefaccion}><input type="hidden" name="id" value={x.id} /><BotonConfirmar mensaje={`¿Borrar "${x.nombre}" del inventario? No se puede deshacer.`}>Borrar</BotonConfirmar></form></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ui-vacio"><b>Sin refacciones registradas</b><p>Agrega lo que tienes en almacén y define un mínimo para saber cuándo pedir.</p><a className="btn small primary" href="#nuevo">Agregar refacción</a></div>
      )}
    </main>
  );
}
