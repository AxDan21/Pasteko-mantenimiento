import CajaCfdi from "@/components/CajaCfdi";
import BotonConfirmar from "@/components/BotonConfirmar";
import Encabezado from "@/components/Encabezado";
import { Anillo } from "@/components/Graficas";
import { Estado } from "@/components/Insignias";
import Kpi from "@/components/Kpi";
import CopiarTexto from "@/components/CopiarTexto";
import PaqueteFacturas, { type ArchivoFactura } from "@/components/PaqueteFacturas";
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
  const urls = await enlaces(supabase, "facturas", movs.flatMap((m) => [m.factura_path, m.xml_path ?? null]));
  const sucPorId = new Map((suc ?? []).map((s) => [s.id as number, s.nombre as string]));
  const gastado = movs.reduce((s, m) => s + Number(m.monto), 0);
  const saldo = ajustes.fondo_caja_chica - gastado;
  const sinF = movs.filter((m) => !m.factura_path);
  const paquete: ArchivoFactura[] = movs
    .filter((m) => m.factura_path || m.xml_path)
    .map((m) => ({
      nombre: `${m.fecha} - ${m.proveedor ?? m.concepto.slice(0, 40)} - ${m.factura_uuid ? `UUID ${m.factura_uuid.slice(0, 8)} - ` : ""}${mxn(Number(m.monto))}`,
      pdf: m.factura_path ? urls.get(m.factura_path) ?? null : null,
      xml: m.xml_path ? urls.get(m.xml_path) ?? null : null,
    }));

  const comprobacion =
    `Comprobación de caja chica · Mantenimiento · ${nombreMes(mes)}\n` +
    `Fondo: ${mxn(ajustes.fondo_caja_chica)} · Gastado: ${mxn(gastado)} · Saldo: ${mxn(saldo)}\n\n` +
    movs
      .slice()
      .reverse()
      .map((m) => `${fCorta(m.fecha)} | ${m.proveedor ? `${m.proveedor} · ` : ""}${m.concepto} | ${m.sucursal_id ? sucPorId.get(m.sucursal_id) : "General"} | ${mxn(Number(m.monto))} | ${m.factura_uuid ? `UUID ${m.factura_uuid}` : m.factura_path ? "Con comprobante" : "SIN FACTURA"}`)
      .join("\n");

  return (
    <main className="wrap caja">
      <Encabezado titulo="Caja chica" sub={`Gastos menores de ${nombreMes(mes)} con su comprobante. El fondo mensual se cambia en Gastos.`} />

      {f.ok && <div className="note ok eqp-nota" role="status">Movimiento registrado.</div>}
      {f.error && <div className="note bad eqp-nota" role="alert">{f.error}</div>}

      <div className="rz-kpis srv-kpis">
        <Kpi icono="caja" tono="info" titulo="Fondo mensual" valor={mxn(ajustes.fondo_caja_chica)} detalle="se cambia en Gastos" />
        <Kpi icono="dinero" tono="marca" titulo="Gastado" valor={mxn(gastado)} detalle={`${movs.length} movimiento${movs.length !== 1 ? "s" : ""}`}
          grafica={<Anillo pct={(gastado / (ajustes.fondo_caja_chica || 1)) * 100} color={gastado > ajustes.fondo_caja_chica * 0.85 ? "var(--bad)" : "var(--chart-1)"} tam={56} grosor={7}><b className="num">{Math.round((gastado / (ajustes.fondo_caja_chica || 1)) * 100)}%</b></Anillo>} />
        <Kpi icono="meta" tono={saldo < 0 ? "bad" : "ok"} titulo="Saldo" valor={mxn(saldo)} alerta={saldo < 0} detalle={`disponible en ${nombreMes(mes)}`} />
        <Kpi icono="falla" tono="bad" titulo="Sin factura" valor={sinF.length} alerta={sinF.length > 0} detalle={`${mxn(sinF.reduce((s, m) => s + Number(m.monto), 0))} por comprobar`} />
      </div>

      <section className="card caja-nueva" id="nuevo">
        <h3>Registrar factura</h3>
        <p className="sub">Suelta el XML y el PDF juntos: proveedor, conceptos, fecha y total se llenan solos. Solo elige la sucursal.</p>
        <CajaCfdi sucursales={(suc ?? []) as { id: number; nombre: string }[]} hoy={hoy()} saldo={saldo} />
        <details className="caja-manual">
          <summary>Gasto sin factura (ticket o nota)</summary>
          <form action={crearMovCaja} className="inline-form">
            <label className="field">Fecha<input id="c-fecha" name="fecha" type="date" required defaultValue={hoy()} /></label>
            <label className="field">Sucursal<select id="c-suc" name="sucursal_id" defaultValue=""><option value="">General</option>{(suc ?? []).map((s) => <option key={s.id as number} value={s.id as number}>{s.nombre as string}</option>)}</select></label>
            <label className="field w2">Concepto<input id="c-con" name="concepto" required placeholder="Ej. Material eléctrico" /></label>
            <label className="field">Monto<input id="c-monto" name="monto" type="number" min="0.01" step="0.01" required /></label>
            <label className="field w2">Foto del ticket<input id="c-fac" name="factura" type="file" accept="image/*,application/pdf" /></label>
            <button className="btn" type="submit">Registrar</button>
          </form>
        </details>
      </section>

      <div className="prv-barra">
        <h2 className="ref-h">Movimientos de {nombreMes(mes)}</h2>
        <div className="secc-acc">
          {paquete.length > 0 && <PaqueteFacturas facturas={paquete} etiqueta={nombreMes(mes)} titulo="Caja chica" />}
          <CopiarTexto texto={movs.length ? comprobacion : ""} etiqueta="Copiar comprobación" />
        </div>
      </div>
      {movs.length ? (
        <div className="tbl-wrap">
          <table className="tbl-cards">
            <thead><tr><th>Fecha</th><th>Concepto</th><th>Sucursal</th><th className="r">Monto</th><th>Factura</th><th><span className="sr-only">Acciones</span></th></tr></thead>
            <tbody>
              {movs.map((m) => (
                <tr key={m.id}>
                  <td data-label="Fecha" className="num">{fCorta(m.fecha)}</td>
                  <td data-label="Concepto">{m.proveedor && <b className="caja-prov">{m.proveedor}</b>}{m.concepto}</td>
                  <td data-label="Sucursal">{m.sucursal_id ? sucPorId.get(m.sucursal_id) : "General"}</td>
                  <td data-label="Monto" className="r num">{mxn(Number(m.monto))}</td>
                  <td data-label="Factura">
                    {m.factura_path ? (
                      <span className="caja-docs">
                        <a className="btn small" href={urls.get(m.factura_path)} target="_blank" rel="noopener noreferrer">{m.factura_uuid ? "PDF" : "Ver"}</a>
                        {m.xml_path && <a className="btn small" href={urls.get(m.xml_path)} target="_blank" rel="noopener noreferrer">XML</a>}
                      </span>
                    ) : (
                      <form action={adjuntarFacturaCaja} className="caja-subir">
                        <Estado tono="bad">Falta</Estado>
                        <input type="hidden" name="id" value={m.id} />
                        <input name="factura" type="file" accept="image/*,application/pdf" required aria-label={`Factura de ${m.concepto}`} />
                        <button className="btn small" type="submit">Subir</button>
                      </form>
                    )}
                  </td>
                  <td className="r"><form action={borrarMovCaja}><input type="hidden" name="id" value={m.id} /><BotonConfirmar mensaje={`¿Borrar el movimiento "${m.concepto}" de ${mxn(Number(m.monto))}? No se puede deshacer.`}>Borrar</BotonConfirmar></form></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="ui-vacio"><b>Sin movimientos en {nombreMes(mes)}</b><p>Registra el primero con «Registrar factura» o como gasto sin factura.</p></div>
      )}
    </main>
  );
}
