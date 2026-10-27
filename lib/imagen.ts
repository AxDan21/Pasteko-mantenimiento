/** Reduce una foto del celular a JPEG de máximo 1600 px (~150-300 KB). Solo en el navegador. */
export async function comprimirFoto(file: File, max = 1600, calidad = 0.75): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  let w: number, h: number, dibujar: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

  if (bitmap) {
    w = bitmap.width;
    h = bitmap.height;
    dibujar = (ctx, cw, ch) => ctx.drawImage(bitmap, 0, 0, cw, ch);
  } else {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    URL.revokeObjectURL(url);
    w = img.naturalWidth;
    h = img.naturalHeight;
    dibujar = (ctx, cw, ch) => ctx.drawImage(img, 0, 0, cw, ch);
  }

  const k = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo procesar la foto");
  dibujar(ctx, canvas.width, canvas.height);

  return new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("No se pudo comprimir la foto"))), "image/jpeg", calidad)
  );
}

/**
 * UUID v4 que funciona también en http:// (red local). crypto.randomUUID()
 * solo existe en páginas seguras (https o localhost).
 */
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Intenta comprimir; si el navegador no puede, usa el archivo original si es un formato admitido. */
export async function prepararFoto(file: File): Promise<Blob> {
  try {
    return await comprimirFoto(file);
  } catch (e) {
    if (["image/jpeg", "image/png", "image/webp"].includes(file.type) && file.size <= 3 * 1024 * 1024) return file;
    throw e;
  }
}
