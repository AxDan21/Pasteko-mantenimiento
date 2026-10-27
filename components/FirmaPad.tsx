"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type FirmaHandle = { vacia: () => boolean; limpiar: () => void; aBlob: () => Promise<Blob | null> };

/** Área para firmar con el dedo o el mouse. */
const FirmaPad = forwardRef<FirmaHandle, { onCambio?: (vacia: boolean) => void }>(function FirmaPad({ onCambio }, ref) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const trazos = useRef(0);

  useEffect(() => {
    const cv = canvas.current!;
    const ctx = cv.getContext("2d")!;
    const preparar = () => {
      const dpr = window.devicePixelRatio || 1;
      const copia = trazos.current ? cv.toDataURL() : null;
      cv.width = cv.clientWidth * dpr;
      cv.height = cv.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.4;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111";
      if (copia) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, cv.clientWidth, cv.clientHeight);
        img.src = copia;
      }
    };
    preparar();

    let dibujando = false;
    const pos = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top] as const;
    };
    const down = (e: PointerEvent) => {
      dibujando = true;
      cv.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.1, y + 0.1);
      ctx.stroke();
    };
    const move = (e: PointerEvent) => {
      if (!dibujando) return;
      const [x, y] = pos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    };
    const up = () => {
      if (!dibujando) return;
      dibujando = false;
      trazos.current += 1;
      onCambio?.(false);
    };
    cv.addEventListener("pointerdown", down);
    cv.addEventListener("pointermove", move);
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    window.addEventListener("resize", preparar);
    return () => {
      cv.removeEventListener("pointerdown", down);
      cv.removeEventListener("pointermove", move);
      cv.removeEventListener("pointerup", up);
      cv.removeEventListener("pointercancel", up);
      window.removeEventListener("resize", preparar);
    };
  }, [onCambio]);

  useImperativeHandle(ref, () => ({
    vacia: () => trazos.current === 0,
    limpiar: () => {
      const cv = canvas.current!;
      cv.getContext("2d")!.clearRect(0, 0, cv.width, cv.height);
      trazos.current = 0;
      onCambio?.(true);
    },
    aBlob: () =>
      new Promise((res) => {
        if (!trazos.current) return res(null);
        canvas.current!.toBlob((b) => res(b), "image/png");
      }),
  }));

  return <canvas ref={canvas} className="firma" aria-label="Área de firma" />;
});

export default FirmaPad;
