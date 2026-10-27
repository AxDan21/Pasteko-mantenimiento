import CopiarTexto from "@/components/CopiarTexto";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { enlaces, leerAjustes } from "@/lib/datos";
import { mxn } from "@/lib/format";
import { fCorta, hoy, mesValido, nombreMes, rangoFechas } from "@/lib/panel";
import type { MovCaja } from "@/lib/types";
import { adjuntarFacturaCaja, borrarMovCaja, crearMovCaja } from "../acciones-modulos";

export default async function CajaChica({ searchParams }: { searchParams: Promise<{ mes?: string; ok?: string; error?: string }> }) {
  await requireAdmin();
  const f = await searchParams;
  const mes = mesValido(f.mes);
  const [ini, fin] = rangoFechas(mes);
  const supabase = await createClient();
  const [ajustes, { data: c }, { data: suc }] = await Promise.all([
    leerAjustes(supabase),
    supabase.from("caja_chica").select("*").gte("fecha", ini).lt("fecha", fin).order("fecha", { ascending: false }),
    supabase.from("sucursales").select("id, nombre").order("nombre"),
  ]);
  const movs = (c ?? []) as MovCaja[];
  const urls = await enlaces(supabase, "facturas", movs.map((m) => m.factura_path));
  const sucPorId = new Map((suc ?? []).map((s) => [s.id as number, s.nombre as string]));
  const gastado = movs.reduce((s, m) => s + Number(m.monto), 0);
  const saldo = ajustes.fondo_caja_chica - gastado;
  const sinF = movs.filter((m) => !m.factura_path);

  const comprobacion =
    `Comprobación de caja chica · Mantenimiento · ${nombreMes(mes)}\n` +
    `Fondo: ${mxn(ajustes.fondo_caja_chica)} · Gastado: ${mxn(gastado)} · Saldo: ${mxn(saldo)}\n\n` +
    movs
      .slice()
      .reverse()
      .map((m) => `${fCorta(m.fecha)} | ${m.concepto} | ${m.sucursal_id ? sucPorId.get(m.sucursal_id) : "General"} | ${mxn(Number(m.monto))} | ${m.factura_path ? "Con factura" : "SIN FACTURA"}`)
      .join("\n");

  return (
    <main className="wrap">
      <div className="head-row">
        <div>
          <p className="eyebrow">Panel de mantenimiento · {nombreMes(mes)}</p>
          <h1 className="page-h">Caja chica</h1>
        </div>
        <form method="get" className="toolbar" style={{ margin: 0 }}>
          <label className="field">Mes<input id="f-mes" name="mes" type="month" defaultValue={mes} /></label>
          <button className="btn" type="submit">Ver</button>
        </form>
      </div>

      {f.ok && <div className="note ok" style={{ marginBottom: 14 }}>Movimiento registrado.</div>}
      {f.error && <div className="note bad" style={{ marginBottom: 14 }}>{f.error}</div>}

      <div className="kpis">
        <div className="kpi"><span className="eyebrow">Fondo mensual</span><span className="v">{mxn(ajustes.fondo_caja_chica)}</span><span className="s">Se cambia en Gastos</span></div>
        <div className="kpi"><span className="eyebrow">Gastado</span><span className="v">{mxn(gastado)}</span><div className="bar"><i className={gastado > ajustes.fondo_caja_chica * 0.85 ? "warn" : ""} style={{ width: `${Math.min((gastado / (ajustes.fondo_caja_chica || 1)) * 100, 100)}%` }} /></div><span className="s">{movs.length} movimientos</span></div>
        <div className="kpi"><span className="eyebrow">Saldo</span><span className="v" style={{ color: saldo < 0 ? "var(--bad)" : undefined }}>{mxn(saldo)}</span><span className="s">Disponible en {nombreMes(mes)}</span></div>
        <div className="kpi"><span className="eyebrow">Sin factura</span><span className="v" style={{ color: sinF.length ? "var(--bad)" : "var(--ok)" }}>{sinF.length}</span><span className="s">{mxn(sinF.reduce((s, m) => s + Number(m.monto), 0))} por comprobar</span></div>
      </div>

      <section className="card" style={{ marginBottom: 18 }}>
        <h3>Registrar gasto de caja chica</h3>
        <p className="sub">Toma foto de la factura o ticket al pagar. También puedes subirla después.</p>
        <form action={crearMovCaja} className="inline-form">
          <label className="field">Fecha<input id="c-fecha" name="fecha" type="date" required defaultValue={hoy()} /></label>
          <label className="field">Sucursal<select id="c-suc" name="sucursal_id" defaultValue=""><option value="">General</option>{(suc ?? []).map((s) => <option key={s.id as number} value={s.id as number}>{s.nombre as string}</option>)}</select></label>
          <label className="field w2">Concepto<input id="c-con" name="concepto" required placeholder="Ej. Material eléctrico" /></label>
          <label className="field">Monto<input id="c-monto" name="monto" type="number" min="0.01" step="0.01" required /></label>
          <label className="field w2">Factura (foto o PDF)<input id="c-fac" name="factura" type="file" accept="image/*,application/pdf" /></label>
          <button className="btn primary" type="submit">Registrar</button>
        </form>
      </section>

      <div className="toolbar" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ fontSize: 17 }}>Movimientos de {nombreMes(mes)}</h3>
        <CopiarTexto texto={movs.length ? comprobacion : ""} etiqueta="Copiar comprobación para contabilidad" />
      </div>
      {movs.length ? (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Sucursal</th><th className="r">Monto</th><th>Factura</th><th /></tr></thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.id}>
                  <td className="num">{fCorta(m.fecha)}</td>
                  <td>{m.concepto}</td>
                  <td>{m.sucursal_id ? sucPorId.get(m.sucursal_id) : "General"}</td>
                  <td className="r num">{mxn(Number(m.monto))}</td>
                  <td>
                    {m.factura_path ? (
                      <a className="btn small" href={urls.get(m.factura_path)} target="_blank" rel="noopener noreferrer">Ver factura</a>
                    ) : (
                      <form action={adjuntarFacturaCaja} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="hidden" name="id" value={m.id} />
                        <input name="factura" type="file" accept="image/*,application/pdf" required aria-label="Factura" style={{ maxWidth: 190, fontSize: 13 }} />
                        <button className="btn small" type="submit">Subir</button>
                        <span className="pill bad">Falta</span>
                      </form>
                    )}
                  </td>
                  <td className="r"><form action={borrarMovCaja}><input type="hidden" name="id" value={m.id} /><button className="btn small danger" type="submit">Borrar</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="card"><h3>Sin movimientos en {nombreMes(mes)}</h3><p className="sub">Registra el primero arriba.</p></div>
      )}
    </main>
  );
}
