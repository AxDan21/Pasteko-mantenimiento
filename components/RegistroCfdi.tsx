"use client";
import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { crearGasto } from "@/app/admin/acciones-modulos";
import { buscarProveedor, conceptoDe, conceptoPartida, leerCfdi, refFactura, TIPOS_CFDI, type Cfdi } from "@/lib/cfdi";
import { clasificar, sugerirTipo, type Contexto, type Sugerencia } from "@/lib/clasificador";
import { mxn } from "@/lib/format";

type Prov = { id: number; nombre: string };
type Suc = { id: number; nombre: string; zona: string };
type Partida = { desc: string; cat: string; tipo: string; monto: number; sug: Sugerencia };

type Props = Contexto & { proveedores: Prov[]; sucursales: Suc[]; activos: string[]; hoy: string };

function Registrar({ n, total }: { n: number; total: number }) {
  const { pending } = useFormStatus();
  return (
    <button className="cfdi-submit" type="submit" disabled={pending}>
      {pending ? "Registrando…" : `Registrar ${n === 1 ? "gasto" : `${n} gastos`} · ${mxn(total)}`}
    </button>
  );
}

function Pista({ s, elegida }: { s: Sugerencia; elegida: string }) {
  if (!s.categoria) return <span className="cfdi-sug baja">No la reconocí: elígela tú</span>;
  if (elegida !== s.categoria) return <span className="cfdi-sug manual">Elegida por ti · sugerí {s.categoria}</span>;
  return <span className={`cfdi-sug ${s.confianza}`}>{s.confianza === "alta" ? "Identificada" : s.confianza === "media" ? "Probable" : "Revisa"} · {s.razon}</span>;
}

/**
 * Registro de gastos a partir del XML de la factura (CFDI). Es la única forma de captura.
 * El XML se lee en el navegador; no se sube ni se guarda.
 */
export default function RegistroCfdi({ proveedores, sucursales, activos, hoy, categorias, equipos, historial }: Props) {
  const ctx: Contexto = { categorias, equipos, historial };
  const input = useRef<HTMLInputElement>(null);
  const [cfdi, setCfdi] = useState<Cfdi | null>(null);
  const [error, setError] = useState("");
  const [arrastrando, setArrastrando] = useState(false);
  const [provId, setProvId] = useState("");
  const [provAuto, setProvAuto] = useState(false);
  const [fecha, setFecha] = useState(hoy);
  const [dividir, setDividir] = useState(false);
  const [partidas, setPartidas] = useState<Partida[]>([]);
  const [uno, setUno] = useState<{ concepto: string; cat: string; tipo: string; sug: Sugerencia } | null>(null);
  const [pagado, setPagado] = useState(false);

  async function leer(archivo: File | undefined) {
    setError("");
    if (!archivo) return;
    if (!/\.xml$/i.test(archivo.name) && !archivo.type.includes("xml")) {
      setError("Ese archivo no es XML. Elige el .xml que acompaña a la factura (no el PDF).");
      return;
    }
    try {
      const c = leerCfdi(await archivo.text());
      const p = buscarProveedor(c, proveedores);
      const ps: Partida[] = c.conceptos.map((k) => {
        const sug = clasificar(k.descripcion, ctx);
        return { desc: conceptoPartida(c, k), cat: sug.categoria ?? "", tipo: sugerirTipo(k.descripcion), monto: k.total, sug };
      });
      // Para el gasto único: la categoría del concepto más caro (o la que se repite)
      const todo = c.conceptos.map((k) => k.descripcion).join(" ");
      const masCaro = [...c.conceptos].sort((a, b) => b.total - a.total)[0];
      const sugUno = clasificar(masCaro ? `${masCaro.descripcion} ${todo}` : todo, ctx);
      const cats = new Set(ps.map((x) => x.cat).filter(Boolean));

      setCfdi(c);
      setProvId(p ? String(p.id) : "");
      setProvAuto(!!p);
      setFecha(c.fecha || hoy);
      setPartidas(ps);
      setUno({ concepto: conceptoDe(c), cat: sugUno.categoria ?? "", tipo: sugerirTipo(todo), sug: sugUno });
      setDividir(ps.length > 1 && cats.size > 1);
      setPagado(false);
    } catch (e) {
      setCfdi(null);
      setError((e as Error).message);
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  const cambiar = (i: number, campo: "desc" | "cat" | "tipo", v: string) =>
    setPartidas((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: v } : p)));

  const zonas = Array.from(new Set(sucursales.map((s) => s.zona)));
  const elegir = (
    <input ref={input} type="file" accept=".xml,text/xml,application/xml" onChange={(e) => leer(e.target.files?.[0])} />
  );

  if (!cfdi || !uno) {
    return (
      <div className="cfdi">
        <label
          className={`cfdi-drop big${arrastrando ? " on" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); leer(e.dataTransfer.files[0]); }}
        >
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9.5 13.5 8 15l1.5 1.5M14.5 13.5 16 15l-1.5 1.5" />
          </svg>
          <span>
            <b>Carga el XML de la factura</b>
            <small>Arrástralo aquí o tócalo para elegirlo. Se lee en tu equipo: no se sube ni se guarda.</small>
          </span>
          {elegir}
        </label>
        {error && <p className="note bad">{error}</p>}
      </div>
    );
  }

  const avisos: string[] = [];
  if (cfdi.tipo && cfdi.tipo !== "I") avisos.push(`Es un CFDI de tipo ${TIPOS_CFDI[cfdi.tipo] ?? cfdi.tipo}, no una factura de ingreso. Revisa si de verdad es un gasto.`);
  if (cfdi.moneda && cfdi.moneda !== "MXN") avisos.push(`La factura está en ${cfdi.moneda}. Los montos se registran tal cual.`);
  if (!provAuto && cfdi.emisor) avisos.push(`"${cfdi.emisor}" no está en tu catálogo de proveedores: elígelo abajo o dalo de alta en Técnicos y proveedores.`);
  const varios = cfdi.conceptos.length > 1;
  const enPartidas = varios && dividir;
  const n = enPartidas ? partidas.length : 1;

  return (
    <form action={crearGasto} className="cfdi">
      <input type="hidden" name="factura_uuid" value={cfdi.uuid} />
      <input type="hidden" name="factura_ref" value={refFactura(cfdi)} />
      <input type="hidden" name="factura_total" value={cfdi.total.toFixed(2)} />
      <div className="cfdi-res">
        <div className="cfdi-res-head">
          <span className="pill ok">XML leído</span>
          <label className="link-btn cfdi-otro">Cargar otro XML{elegir}</label>
        </div>

        <dl className="cfdi-dl">
          <div className="w2"><dt>Proveedor</dt><dd>{cfdi.emisor || "—"}<small>{cfdi.rfc}</small></dd></div>
          <div><dt>Factura</dt><dd>{refFactura(cfdi) || "—"}<small>{cfdi.fecha}</small></dd></div>
          <div><dt>Pago</dt><dd>{cfdi.metodoPago === "PPD" ? "Diferido (PPD)" : cfdi.metodoPago === "PUE" ? "Una exhibición (PUE)" : cfdi.metodoPago || "—"}</dd></div>
          <div><dt>Subtotal</dt><dd>{mxn(cfdi.subtotal - cfdi.descuento)}</dd></div>
          <div><dt>IVA</dt><dd>{mxn(cfdi.iva)}</dd></div>
          {cfdi.retenciones > 0 && <div><dt>Retenciones</dt><dd>−{mxn(cfdi.retenciones)}</dd></div>}
          <div className="tot"><dt>Total</dt><dd>{mxn(cfdi.total)}</dd></div>
        </dl>

        <div className="cfdi-tbl-wrap">
          <table className="cfdi-tbl">
            <caption>{cfdi.conceptos.length} {cfdi.conceptos.length === 1 ? "concepto" : "conceptos"} en la factura</caption>
            <thead><tr><th>Concepto</th><th className="num">Cant. × precio</th><th className="num">Subtotal</th><th className="num">IVA</th><th className="num">Total</th></tr></thead>
            <tbody>
              {cfdi.conceptos.map((k, i) => (
                <tr key={i}>
                  <td>{k.descripcion}{k.unidad && <small>{k.unidad}</small>}</td>
                  <td className="num">{k.cantidad} × {mxn(k.valorUnitario)}</td>
                  <td className="num">{mxn(k.importe - k.descuento)}</td>
                  <td className="num">{mxn(k.iva)}</td>
                  <td className="num"><b>{mxn(k.total)}</b></td>
                </tr>
              ))}
            </tbody>
            {varios && <tfoot><tr><td colSpan={4}>Total de la factura</td><td className="num"><b>{mxn(cfdi.total)}</b></td></tr></tfoot>}
          </table>
        </div>
        {cfdi.uuid && <p className="cfdi-uuid">Folio fiscal (UUID): {cfdi.uuid}</p>}
        {avisos.map((a) => <p key={a} className="note warn">{a}</p>)}
      </div>

      {varios && (
        <fieldset className="cfdi-modo">
          <legend>¿Cómo lo registro?</legend>
          <div>
            <button type="button" aria-pressed={!dividir} onClick={() => setDividir(false)}>
              <b>Un solo gasto</b><small>{mxn(cfdi.total)} con todos los conceptos en la descripción</small>
            </button>
            <button type="button" aria-pressed={dividir} onClick={() => setDividir(true)}>
              <b>Un gasto por concepto</b><small>{cfdi.conceptos.length} gastos, cada uno con su categoría y costo</small>
            </button>
          </div>
        </fieldset>
      )}

      {enPartidas ? (
        <div className="cfdi-partidas">
          <input type="hidden" name="concepto" value={uno.concepto} />
          <input type="hidden" name="monto" value={cfdi.total.toFixed(2)} />
          {partidas.map((p, i) => (
            <div key={i} className="cfdi-partida">
              <span className="cfdi-n">{i + 1}</span>
              <label className="field cfdi-desc">Concepto
                <input name="p_desc" value={p.desc} required onChange={(e) => cambiar(i, "desc", e.target.value)} />
              </label>
              <label className="field">Categoría
                <select name="p_cat" value={p.cat} required onChange={(e) => cambiar(i, "cat", e.target.value)}>
                  <option value="" disabled>Elige…</option>
                  {categorias.map((c) => <option key={c}>{c}</option>)}
                </select>
                <Pista s={p.sug} elegida={p.cat} />
              </label>
              <label className="field">Tipo
                <select name="p_tipo" value={p.tipo} onChange={(e) => cambiar(i, "tipo", e.target.value)}>
                  <option>Correctivo</option><option>Preventivo</option><option>Otro</option>
                </select>
              </label>
              <span className="cfdi-monto"><small>Con IVA</small><b>{mxn(p.monto)}</b></span>
              <input type="hidden" name="p_monto" value={p.monto.toFixed(2)} />
            </div>
          ))}
        </div>
      ) : (
        <div className="cfdi-uno">
          <input type="hidden" name="monto" value={cfdi.total.toFixed(2)} />
          <label className="field cfdi-w3">Concepto
            <input name="concepto" required value={uno.concepto} onChange={(e) => setUno({ ...uno, concepto: e.target.value })} />
          </label>
          <label className="field">Categoría
            <select name="categoria" required value={uno.cat} onChange={(e) => setUno({ ...uno, cat: e.target.value })}>
              <option value="" disabled>Elige…</option>
              {categorias.map((c) => <option key={c}>{c}</option>)}
            </select>
            <Pista s={uno.sug} elegida={uno.cat} />
          </label>
          <label className="field">Tipo
            <select name="tipo" value={uno.tipo} onChange={(e) => setUno({ ...uno, tipo: e.target.value })}>
              <option>Correctivo</option><option>Preventivo</option><option>Otro</option>
            </select>
          </label>
        </div>
      )}

      <div className="cfdi-comun">
        <label className="field">Fecha del trabajo<input name="fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
        <label className="field">Sucursal
          <select name="sucursal_id" defaultValue="">
            <option value="">General / varias</option>
            {zonas.map((z) => <optgroup key={z} label={z}>{sucursales.filter((s) => s.zona === z).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</optgroup>)}
          </select>
        </label>
        <label className="field">Proveedor
          <select name="proveedor_id" value={provId} onChange={(e) => { setProvId(e.target.value); setProvAuto(false); }}>
            <option value="">Ninguno</option>
            {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          {provAuto && <span className="cfdi-sug alta">Identificado por el nombre del emisor</span>}
        </label>
        <label className="field">Activo (opcional)
          <select name="activo_id" defaultValue=""><option value="">Ninguno</option>{activos.map((a) => <option key={a}>{a}</option>)}</select>
        </label>
        <label className="field">Estado de pago
          <select name="pagado" value={String(pagado)} onChange={(e) => setPagado(e.target.value === "true")}>
            <option value="false">Pendiente de pago</option><option value="true">Pagado</option>
          </select>
        </label>
        {pagado && <label className="field">Fecha de pago<input name="fecha_pago" type="date" defaultValue={hoy} /></label>}
        {pagado && <label className="field">Referencia de pago<input name="referencia_pago" placeholder="Transferencia, cheque…" /></label>}
        <label className="field cfdi-w2">PDF o foto de la factura (opcional)<input name="factura" type="file" accept="image/*,application/pdf" /></label>
      </div>

      {enPartidas && (
        <p className="cfdi-link">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></svg>
          <span>Se crearán {n} gastos <b>ligados a la misma factura ({refFactura(cfdi)})</b>: cada uno cuenta en su categoría, pero en pendientes de pago aparecen como una sola factura de {mxn(cfdi.total)} y se pagan o se borran juntos.</span>
        </p>
      )}
      <div className="cfdi-actions">
        <button type="button" className="btn" onClick={() => { setCfdi(null); setUno(null); }}>Cancelar</button>
        <Registrar n={n} total={cfdi.total} />
      </div>
    </form>
  );
}
