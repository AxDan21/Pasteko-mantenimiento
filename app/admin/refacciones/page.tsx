import Link from "next/link";
import CopiarTexto from "@/components/CopiarTexto";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mxn } from "@/lib/format";
import type { Refaccion2 } from "@/lib/types";
import { ajustarStock, borrarRefaccion, crearRefaccion } from "../acciones-modulos";

export default async function Refacciones() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: r }, { data: eqs }] = await Promise.all([
    supabase.from("refacciones").select("*").order("nombre"),
    supabase.from("equipos").select("nombre").order("orden"),
  ]);
  const refs = (r ?? []) as Refaccion2[];
  const bajas = refs.filter((x) => x.stock < x.minimo);
  const ubicaciones = Array.from(new Set(["Almacén Pachuca", "Almacén CDMX", ...refs.map((x) => x.ubicacion)]));
  const pedido =
    "Pedido de refacciones · Mantenimiento Pasteko\n\n" +
    bajas.map((x) => `${x.codigo ?? "s/c"} | ${x.nombre} | Pedir ${Math.max(x.minimo * 2 - x.stock, 1)} pzas | Entregar en ${x.ubicacion}`).join("\n");

  return (
    <main className="wrap">
      <div className="head-row">
        <div>
          <p className="eyebrow">Panel de mantenimiento</p>
          <h1 className="page-h">Refacciones</h1>
        </div>
        <Link className="btn" href="/admin/exportar?tabla=refacciones">Descargar CSV</Link>
      </div>

      <div className="kpis">
        <div className="kpi"><span className="eyebrow">Artículos</span><span className="v">{refs.length}</span><span className="s">{refs.reduce((s, x) => s + x.stock, 0)} piezas en almacén</span></div>
        <div className="kpi"><span className="eyebrow">Valor en almacén</span><span className="v">{mxn(refs.reduce((s, x) => s + x.stock * Number(x.costo), 0))}</span><span className="s">A costo de compra</span></div>
        <div className="kpi"><span className="eyebrow">Por pedir</span><span className="v" style={{ color: bajas.length ? "var(--warn)" : undefined }}>{bajas.filter((x) => x.stock > 0).length}</span><span className="s">Debajo del mínimo</span></div>
        <div className="kpi"><span className="eyebrow">Sin stock</span><span className="v" style={{ color: refs.some((x) => x.stock === 0) ? "var(--bad)" : undefined }}>{refs.filter((x) => x.stock === 0).length}</span><span className="s">Pueden detener una reparación</span></div>
      </div>

      <section className="card" style={{ marginBottom: 18 }}>
        <h3>Agregar refacción</h3>
        <form action={crearRefaccion} className="inline-form">
          <label className="field">Código<input id="r-cod" name="codigo" placeholder="Opcional" /></label>
          <label className="field w2">Refacción<input id="r-nom" name="nombre" required placeholder="Ej. Capacitor de arranque 35 µF" /></label>
          <label className="field">Equipo<select id="r-eq" name="equipo" defaultValue=""><option value="">General</option>{(eqs ?? []).map((e) => <option key={e.nombre as string}>{e.nombre as string}</option>)}</select></label>
          <label className="field">Ubicación<select id="r-ub" name="ubicacion" defaultValue={ubicaciones[0]}>{ubicaciones.map((u) => <option key={u}>{u}</option>)}</select></label>
          <label className="field">Stock<input id="r-st" name="stock" type="number" min="0" defaultValue={1} /></label>
          <label className="field">Mínimo<input id="r-min" name="minimo" type="number" min="0" defaultValue={1} /></label>
          <label className="field">Costo unitario<input id="r-costo" name="costo" type="number" min="0" step="0.01" required /></label>
          <button className="btn primary" type="submit">Agregar</button>
        </form>
      </section>

      <div className="toolbar" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 17 }}>Inventario</h3>
        <CopiarTexto texto={bajas.length ? pedido : ""} etiqueta={`Copiar lista de pedido (${bajas.length})`} />
      </div>
      {refs.length ? (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Código</th><th>Refacción</th><th>Equipo</th><th>Ubicación</th><th>Stock</th><th className="r">Mínimo</th><th className="r">Costo</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {refs.map((x) => {
                const [t, c] = x.stock === 0 ? ["Sin stock", "bad"] : x.stock < x.minimo ? ["Pedir", "warn"] : ["OK", "ok"];
                return (
                  <tr key={x.id}>
                    <td className="num">{x.codigo ?? "—"}</td>
                    <td><b>{x.nombre}</b></td>
                    <td>{x.equipo ?? "General"}</td>
                    <td>{x.ubicacion}</td>
                    <td>
                      <span className="stepper">
                        <form action={ajustarStock}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="delta" value="-1" /><button type="submit" aria-label={`Restar una pieza de ${x.nombre}`}>−</button></form>
                        <b className="num">{x.stock}</b>
                        <form action={ajustarStock}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="delta" value="1" /><button type="submit" aria-label={`Sumar una pieza de ${x.nombre}`}>+</button></form>
                      </span>
                    </td>
                    <td className="r num">{x.minimo}</td>
                    <td className="r num">{mxn(Number(x.costo))}</td>
                    <td><span className={`pill ${c}`}>{t}</span></td>
                    <td className="r"><form action={borrarRefaccion}><input type="hidden" name="id" value={x.id} /><button className="btn small danger" type="submit">Borrar</button></form></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card"><h3>Sin refacciones registradas</h3><p className="sub">Agrega lo que tienes en almacén y define un mínimo para saber cuándo pedir.</p></div>
      )}
    </main>
  );
}
