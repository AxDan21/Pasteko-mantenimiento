/**
 * Guías de autoayuda (pasos y videos para que la tienda resuelva fallas comunes).
 * Apagadas hasta tener el contenido listo. Para encenderlas: en Vercel agrega
 * NEXT_PUBLIC_GUIAS_ACTIVAS=1 y vuelve a publicar.
 */
export const guiasActivas = () => process.env.NEXT_PUBLIC_GUIAS_ACTIVAS === "1";
