"use client";
import { useState } from "react";

export type ArchivoFactura = {
  nombre: string;          // "Proveedor - UUID CAE29802 - $5,600.00"
  pdf: string | null;      // enlace temporal
  xml: string | null;
};

const limpio = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);

function bajar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Paquete de facturas pendientes de pago para Tesorería:
 * un ZIP con PDF y XML de cada una (para adjuntar al correo) y un solo PDF para imprimir.
 * Todo se arma en el navegador con los archivos guardados en la app.
 */
export default function PaqueteFacturas({ facturas, etiqueta, titulo = "Facturas pendientes de pago" }: { facturas: ArchivoFactura[]; etiqueta: string; titulo?: string }) {
  const [estado, setEstado] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const conPdf = facturas.filter((f) => f.pdf).length;

  async function zip() {
    setOcupado(true);
    setEstado("Preparando ZIP…");
    try {
      const JSZip = (await import("jszip")).default;
      const z = new JSZip();
      let faltan = 0;
      for (const [i, f] of facturas.entries()) {
        const base = `${String(i + 1).padStart(2, "0")}. ${limpio(f.nombre)}`;
        setEstado(`Descargando ${i + 1} de ${facturas.length}…`);
        for (const [url, ext] of [[f.pdf, "pdf"], [f.xml, "xml"]] as const) {
          if (!url) { faltan++; continue; }
          const r = await fetch(url);
          if (!r.ok) { faltan++; continue; }
          z.file(`${base}.${ext}`, await r.blob());
        }
      }
      setEstado("Comprimiendo…");
      bajar(await z.generateAsync({ type: "blob" }), `${titulo} - ${etiqueta}.zip`);
      setEstado(faltan ? `ZIP listo. Faltaron ${faltan} archivo(s): revisa las facturas sin PDF o XML.` : "ZIP listo: adjúntalo al correo para Tesorería.");
    } catch (e) {
      setEstado(`No se pudo armar el ZIP: ${(e as Error).message}`);
    } finally {
      setOcupado(false);
    }
  }

  async function imprimir() {
    // La ventana se abre antes de armar el PDF para que el navegador no la bloquee
    const ventana = window.open("", "_blank");
    setOcupado(true);
    setEstado("Uniendo PDFs…");
    try {
      const { PDFDocument } = await import("pdf-lib");
      const unido = await PDFDocument.create();
      let n = 0;
      for (const [i, f] of facturas.entries()) {
        if (!f.pdf) continue;
        setEstado(`Uniendo ${i + 1} de ${facturas.length}…`);
        const r = await fetch(f.pdf);
        if (!r.ok) continue;
        const doc = await PDFDocument.load(await r.arrayBuffer(), { ignoreEncryption: true });
        const paginas = await unido.copyPages(doc, doc.getPageIndices());
        paginas.forEach((p) => unido.addPage(p));
        n++;
      }
      if (!n) { ventana?.close(); setEstado("No hay PDFs para imprimir."); return; }
      const bytes = await unido.save();
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
      if (ventana) ventana.location.href = url;
      else bajar(new Blob([bytes as BlobPart], { type: "application/pdf" }), `Facturas para imprimir - ${etiqueta}.pdf`);
      setEstado(`${n} factura(s) en un solo PDF: usa Imprimir en la pestaña que se abrió.`);
    } catch (e) {
      ventana?.close();
      setEstado(`No se pudieron unir los PDFs: ${(e as Error).message}`);
    } finally {
      setOcupado(false);
    }
  }

  if (!facturas.length) return null;
  return (
    <div className="paquete no-print">
      <div className="paquete-txt">
        <b>Paquete para Tesorería</b>
        <small>{facturas.length} pendiente{facturas.length !== 1 ? "s" : ""} con archivos · {conPdf} PDF{conPdf !== 1 ? "s" : ""}. Un solo ZIP con todas; al pasarlas a pago, su PDF y XML se borran.</small>
      </div>
      <div className="paquete-btns">
        <button type="button" className="btn" disabled={ocupado} onClick={zip}>Descargar PDF y XML (ZIP)</button>
        <button type="button" className="btn" disabled={ocupado || !conPdf} onClick={imprimir}>Imprimir todas</button>
      </div>
      {estado && <p className="paquete-estado" aria-live="polite">{estado}</p>}
    </div>
  );
}
