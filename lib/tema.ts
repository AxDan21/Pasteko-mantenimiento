/** Preferencias de apariencia: se guardan en este navegador y se aplican como atributos de <html>. */
export const LLAVE_TEMA = "pasteko.tema";
/** Menú lateral del panel contraído a solo íconos (solo en pantallas anchas). */
export const LLAVE_NAV = "pasteko.nav";
export type Tema = "light" | "dark";

/**
 * Se ejecuta en <head> antes de pintar para evitar parpadeos:
 * - data-theme="light|dark" si se eligió un tema (sin elección, el CSS sigue al sistema operativo);
 * - data-nav="mini" si se contrajo el menú lateral.
 */
export const SCRIPT_TEMA = `try{var d=document.documentElement,t=localStorage.getItem(${JSON.stringify(LLAVE_TEMA)});if(t==="light"||t==="dark")d.setAttribute("data-theme",t);if(localStorage.getItem(${JSON.stringify(LLAVE_NAV)})==="mini")d.setAttribute("data-nav","mini")}catch(e){}`;
