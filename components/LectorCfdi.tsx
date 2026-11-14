"use client";
import { useRef, useState } from "react";
import {
  buscarProveedor, conceptoDe, conceptoPartida, leerCfdi, refFactura, sugerirCategoria, sugerirTipo, TIPOS_CFDI, type Cfdi,
} from "@/lib/cfdi";
import { mxn } from "@/lib/format";

type Prov = { id: number; nombre: string };
type Partida = { desc: string; cat: string; tipo: string; monto: number };

/** Escribe en un campo del formulario (no controlado) y lo resalta un momento. */
function poner(id: string, valor: string) {
  const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null;
  if (!el) return false;
  el.value = valor;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  el.classList.add("cfdi-lleno");
  setTimeout(() => el.classList.remove("cfdi-lleno"), 1600);
  return true;
}
const valorDe = (id: string) => (document.getElementById(id) as HTMLInputElement | HTMLSelectElement | null)?.value ?? "";

/**
 * Lee el XML de una factura en el navegador y llena "Registrar gasto".
 * Con varios conceptos se puede registrar como un solo gasto o como un gasto por concepto.
 * El XML no se sube ni se guarda: solo se usan sus datos.
 */
export default function LectorCfdi({ proveedores, categorias }: { proveedores: Prov[]; categorias: string[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [cfdi, setCfdi] = useState<Cfdi | null>(null);
  const [prov, setProv] = useState<Prov | null>(null);
  const [error, setError] = useState("");
  const [arrastrando, setArrastrando] = useState(false);
  const [dividir, setDividir] = useState(false);
  const [partidas, setPartidas] = useState<Partida[]>([]);

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
      if (c.fecha) poner("g-fecha", c.fecha);
      poner("g-con", conceptoDe(c));
      if (c.total > 0) poner("g-monto", c.total.toFixed(2));
      if (p) poner("g-prov", String(p.id));

      const catBase = valorDe("g-cat"), tipoBase = valorDe("g-tipo") || "Correctivo";
      const ps = c.conceptos.map((k) => ({
        desc: conceptoPartida(c, k),
        cat: sugerirCategoria(k.descripcion, categorias) ?? catBase,
        tipo: sugerirTipo(k.descripcion) ?? tipoBase,
        monto: k.total,
      }));
      // Si todos los conceptos apuntan a la misma categoría/tipo, se sugiere en el formulario
      const cats = new Set(ps.map((x) => x.cat)), tipos = new Set(ps.map((x) => x.tipo));
      if (ps.length && cats.size === 1) poner("g-cat", ps[0].cat);
      if (ps.length && tipos.size === 1) poner("g-tipo", ps[0].tipo);

      setCfdi(c);
      setProv(p);
      setPartidas(ps);
      setDividir(ps.length > 1 && cats.size > 1); // conceptos de distinta categoría: se sugiere dividir
    } catch (e) {
      setCfdi(null);
      setError((e as Error).message);
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  const cambiar = (i: number, campo: keyof Partida, v: string) =>
    setPartidas((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: v } : p)));

  const avisos: string[] = [];
  if (cfdi) {
    if (cfdi.tipo && cfdi.tipo !== "I") avisos.push(`Es un CFDI de tipo ${TIPOS_CFDI[cfdi.tipo] ?? cfdi.tipo}, no una factura de ingreso. Revisa si de verdad es un gasto.`);
    if (cfdi.moneda && cfdi.moneda !== "MXN") avisos.push(`La factura está en ${cfdi.moneda}. Los montos se capturaron tal cual: conviértelos a pesos.`);
    if (!prov && cfdi.emisor) avisos.push(`"${cfdi.emisor}" no está en tu catálogo de proveedores: elígelo a mano o dalo de alta.`);
  }
  const varios = (cfdi?.conceptos.length ?? 0) > 1;

  return (
    <div className="cfdi w4">
      {!cfdi ? (
        <label
          className={`cfdi-drop${arrastrando ? " on" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true); }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); leer(e.dataTransfer.files[0]); }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9.5 13.5 8 15l1.5 1.5M14.5 13.5 16 15l-1.5 1.5" />
          </svg>
          <span>
            <b>Llenar con el XML de la factura</b>
            <small>Arrástralo aquí o tócalo para elegirlo. Se lee en tu equipo; no se sube ni se guarda.</small>
          </span>
          {/* sin name: el XML nunca viaja al servidor */}
          <input ref={input} type="file" accept=".xml,text/xml,application/xml" onChange={(e) => leer(e.target.files?.[0])} />
        </label>
      ) : (
        <div className="cfdi-res">
          <div className="cfdi-res-head">
            <span className="pill ok">Formulario llenado con el XML</span>
            <button type="button" className="link-btn" onClick={() => input.current?.click()}>Leer otro</button>
            <input ref={input} type="file" accept=".xml,text/xml,application/xml" hidden onChange={(e) => leer(e.target.files?.[0])} />
          </div>

          <dl className="cfdi-dl">
            <div className="w2"><dt>Proveedor</dt><dd>{cfdi.emisor || "—"}<small>{cfdi.rfc}{prov ? ` · catálogo: ${prov.nombre}` : ""}</small></dd></div>
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
              <thead>
                <tr><th>Concepto</th><th className="num">Cant. × precio</th><th className="num">Subtotal</th><th className="num">IVA</th><th className="num">Total</th></tr>
              </thead>
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
              {varios && (
                <tfoot>
                  <tr><td colSpan={4}>Total de la factura</td><td className="num"><b>{mxn(cfdi.total)}</b></td></tr>
                </tfoot>
              )}
            </table>
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

          {varios && dividir && (
            <div className="cfdi-partidas">
              {partidas.map((p, i) => (
                <div key={i} className="cfdi-partida">
                  <span className="cfdi-n">{i + 1}</span>
                  <label className="field cfdi-desc">Concepto
                    <input name="p_desc" value={p.desc} required onChange={(e) => cambiar(i, "desc", e.target.value)} />
                  </label>
                  <label className="field">Categoría
                    <select name="p_cat" value={p.cat} onChange={(e) => cambiar(i, "cat", e.target.value)}>
                      {categorias.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="field">Tipo
                    <select name="p_tipo" value={p.tipo} onChange={(e) => cambiar(i, "tipo", e.target.value)}>
                      <option>Correctivo</option><option>Preventivo</option><option>Otro</option>
                    </select>
                  </label>
                  <span className="cfdi-monto"><small>Monto con IVA</small><b>{mxn(p.monto)}</b></span>
                  <input type="hidden" name="p_monto" value={p.monto.toFixed(2)} />
                </div>
              ))}
              <p className="cfdi-hint">Al registrar se crearán {partidas.length} gastos con la misma fecha, sucursal, proveedor, estado de pago y factura adjunta. La categoría y el tipo de arriba no se usan.</p>
            </div>
          )}

          {cfdi.uuid && <p className="cfdi-uuid">Folio fiscal (UUID): {cfdi.uuid}</p>}
          {avisos.map((a) => <p key={a} className="note warn">{a}</p>)}
          {!(varios && dividir) && <p className="cfdi-hint">Revisa la sucursal, la categoría y el tipo: esos datos no vienen en la factura.</p>}
        </div>
      )}
      {error && <p className="note bad">{error}</p>}
    </div>
  );
}
