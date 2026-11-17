"use client";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { useFormStatus } from "react-dom";
import { crearMovCajaCfdi } from "@/app/admin/acciones-modulos";
import { conceptoDe, leerCfdi, refFactura, TIPOS_CFDI, type Cfdi } from "@/lib/cfdi";
import { mxn } from "@/lib/format";

type Props = { sucursales: { id: number; nombre: string }[]; hoy: string; saldo: number };

function Registrar({ total }: { total: number }) {
  const { pending } = useFormStatus();
  return <button className="btn primary" type="submit" disabled={pending}>{pending ? "Guardando…" : `Registrar ${mxn(total)}`}</button>;
}

/** Caja chica: arrastra el XML y el PDF de la factura y se registra sola. Sin categorías. */
export default function CajaCfdi({ sucursales, hoy, saldo }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const [cfdi, setCfdi] = useState<Cfdi | null>(null);
  const [xml, setXml] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [concepto, setConcepto] = useState("");
  const [fecha, setFecha] = useState(hoy);
  const [error, setError] = useState("");
  const [arrastrando, setArrastrando] = useState(false);

  // Coloca en el formulario el PDF que llegó junto con el XML
  useEffect(() => {
    if (!pdf || !pdfInput.current) return;
    try {
      const dt = new DataTransfer();
      dt.items.add(pdf);
      pdfInput.current.files = dt.files;
    } catch {}
  }, [pdf, cfdi]);

  async function leer(lista: FileList | null | undefined) {
    setError("");
    const archivos = Array.from(lista ?? []);
    if (input.current) input.current.value = "";
    if (!archivos.length) return;
    const x = archivos.find((a) => /\.xml$/i.test(a.name) || a.type.includes("xml"));
    const p = archivos.find((a) => /\.pdf$/i.test(a.name) || a.type === "application/pdf") ?? null;
    if (!x) {
      if (p && cfdi) return setPdf(p);
      return setError(p ? "Falta el XML: suelta el PDF y el XML juntos." : "Esos archivos no son XML ni PDF.");
    }
    try {
      const texto = await x.text();
      const c = leerCfdi(texto);
      setCfdi(c);
      setXml(texto);
      setConcepto(conceptoDe(c));
      setFecha(c.fecha || hoy);
      setPdf(p);
    } catch (e) {
      setCfdi(null);
      setError((e as Error).message);
    }
  }

  const elegir = <input ref={input} type="file" multiple accept=".xml,text/xml,application/xml,.pdf,application/pdf" onChange={(e) => leer(e.target.files)} />;
  const soltar = {
    onDragOver: (e: DragEvent) => { e.preventDefault(); setArrastrando(true); },
    onDragLeave: () => setArrastrando(false),
    onDrop: (e: DragEvent) => { e.preventDefault(); setArrastrando(false); leer(e.dataTransfer.files); },
  };

  if (!cfdi) {
    return (
      <div className="cfdi">
        <label className={`cfdi-drop big${arrastrando ? " on" : ""}`} {...soltar}>
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M9.5 13.5 8 15l1.5 1.5M14.5 13.5 16 15l-1.5 1.5" />
          </svg>
          <span>
            <b>Suelta aquí el XML y el PDF de la factura</b>
            <small>O tócalo para elegir los dos. Se leen proveedor, conceptos, fecha y total.</small>
          </span>
          {elegir}
        </label>
        {error && <p className="note bad">{error}</p>}
      </div>
    );
  }

  const avisos: string[] = [];
  if (cfdi.tipo && cfdi.tipo !== "I") avisos.push(`Es un CFDI de tipo ${TIPOS_CFDI[cfdi.tipo] ?? cfdi.tipo}, no una factura de compra.`);
  if (cfdi.total > saldo) avisos.push(`El total rebasa el saldo disponible de la caja (${mxn(saldo)}).`);
  if (!pdf) avisos.push("Falta el PDF: suéltalo aquí o elígelo abajo.");

  return (
    <form action={crearMovCajaCfdi} className="cfdi" {...soltar}>
      <input type="hidden" name="factura_uuid" value={cfdi.uuid} />
      <input type="hidden" name="factura_ref" value={refFactura(cfdi)} />
      <input type="hidden" name="proveedor" value={cfdi.emisor} />
      <input type="hidden" name="rfc" value={cfdi.rfc} />
      <input type="hidden" name="monto" value={cfdi.total.toFixed(2)} />
      <input type="hidden" name="xml_texto" value={xml} />

      <div className={`cfdi-res${arrastrando ? " on" : ""}`}>
        <div className="cfdi-res-head">
          <span className="pill ok">XML leído{pdf ? " · PDF listo" : ""}</span>
          <label className="link-btn cfdi-otro">Otra factura{elegir}</label>
        </div>
        <dl className="cfdi-dl">
          <div className="w2"><dt>Proveedor</dt><dd>{cfdi.emisor || "—"}<small>{cfdi.rfc}</small></dd></div>
          <div><dt>Factura</dt><dd>{refFactura(cfdi) || "—"}<small>{cfdi.fecha}</small></dd></div>
          <div className="tot"><dt>Total</dt><dd>{mxn(cfdi.total)}</dd></div>
        </dl>
        {cfdi.conceptos.length > 0 && (
          <details className="cfdi-con" open={cfdi.conceptos.length <= 4}>
            <summary>{cfdi.conceptos.length} {cfdi.conceptos.length === 1 ? "concepto" : "conceptos"}</summary>
            <ul>{cfdi.conceptos.map((k, i) => <li key={i}><span>{k.cantidad !== 1 ? `${k.cantidad} × ` : ""}{k.descripcion}</span><b>{mxn(k.total)}</b></li>)}</ul>
          </details>
        )}
        {avisos.map((a) => <p key={a} className="note warn">{a}</p>)}
      </div>

      <div className="inline-form">
        <label className="field">Fecha<input name="fecha" type="date" required value={fecha} onChange={(e) => setFecha(e.target.value)} /></label>
        <label className="field">Sucursal
          <select name="sucursal_id" defaultValue=""><option value="">General</option>{sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
        </label>
        <label className="field w2">Concepto<input name="concepto" required value={concepto} onChange={(e) => setConcepto(e.target.value)} /></label>
        <label className="field w2">PDF de la factura
          <input ref={pdfInput} name="factura" type="file" accept="application/pdf,.pdf" required onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
        </label>
        <Registrar total={cfdi.total} />
      </div>
    </form>
  );
}
