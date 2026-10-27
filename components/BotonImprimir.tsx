"use client";

export default function BotonImprimir() {
  return (
    <button type="button" className="btn small no-print" onClick={() => window.print()}>
      Imprimir / PDF
    </button>
  );
}
