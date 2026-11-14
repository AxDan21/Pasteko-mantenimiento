"use client";
import { useRef, useState } from "react";
import { buscarProveedor, conceptoDe, leerCfdi, TIPOS_CFDI, type Cfdi } from "@/lib/cfdi";
import { mxn } from "@/lib/format";

type Prov = { id: number; nombre: string };

/** Escribe en un campo del formulario (no controlado) y avisa a React/al navegador del cambio. */
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

/**
 * Lee el XML de una factura en el navegador y llena el formulario de "Registrar gasto".
 * El XML no se sube ni se guarda: solo se usan sus datos.
 */
export default function LectorCfdi({ proveedores }: { proveedores: Prov[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [cfdi, setCfdi] = useState<Cfdi | null>(null);
  const [prov, setProv] = useState<Prov | null>(null);
  const [error, setError] = useState("");
  const [arrastrando, setArrastrando] = useState(false);

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
      setCfdi(c);
      setProv(p);
    } catch (e) {
      setCfdi(null);
      setError((e as Error).message);
    } finally {
      if (input.current) input.current.value = "";
    }
  }

  const avisos: string[] = [];
  if (cfdi) {
    if (cfdi.tipo && cfdi.tipo !== "I") avisos.push(`Es un CFDI de tipo ${TIPOS_CFDI[cfdi.tipo] ?? cfdi.tipo}, no una factura de ingreso. Revisa si de verdad es un gasto.`);
    if (cfdi.moneda && cfdi.moneda !== "MXN") avisos.push(`La factura está en ${cfdi.moneda}. El monto se capturó tal cual: conviértelo a pesos.`);
    if (!prov && cfdi.emisor) avisos.push(`"${cfdi.emisor}" no está en tu catálogo de proveedores: elígelo a mano o dalo de alta.`);
  }

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
            <div><dt>Folio</dt><dd>{`${cfdi.serie}${cfdi.folio}` || "—"}<small>{cfdi.fecha}</small></dd></div>
            <div><dt>Pago</dt><dd>{cfdi.metodoPago === "PPD" ? "Diferido (PPD)" : cfdi.metodoPago === "PUE" ? "Una exhibición (PUE)" : cfdi.metodoPago || "—"}</dd></div>
            <div><dt>Subtotal</dt><dd>{mxn(cfdi.subtotal - cfdi.descuento)}</dd></div>
            <div><dt>IVA</dt><dd>{mxn(cfdi.iva)}</dd></div>
            {cfdi.retenciones > 0 && <div><dt>Retenciones</dt><dd>−{mxn(cfdi.retenciones)}</dd></div>}
            <div className="tot"><dt>Total</dt><dd>{mxn(cfdi.total)}</dd></div>
          </dl>
          {cfdi.conceptos.length > 1 && (
            <details className="cfdi-con">
              <summary>{cfdi.conceptos.length} conceptos en la factura</summary>
              <ul>{cfdi.conceptos.map((c, i) => <li key={i}><span>{c.cantidad} × {c.descripcion}</span><b>{mxn(c.importe)}</b></li>)}</ul>
            </details>
          )}
          {cfdi.uuid && <p className="cfdi-uuid">Folio fiscal (UUID): {cfdi.uuid}</p>}
          {avisos.map((a) => <p key={a} className="note warn">{a}</p>)}
          <p className="cfdi-hint">Revisa la sucursal, la categoría y el tipo: esos datos no vienen en la factura.</p>
        </div>
      )}
      {error && <p className="note bad">{error}</p>}
    </div>
  );
}
