/** Módulos del panel de administración: una sola definición para la barra lateral y la búsqueda. */
export type ClaveContador = "servicio" | "preventivos" | "equipos" | "refacciones" | "gastos";
export type ItemMenu = { href: string; label: string; icono: string; clave?: ClaveContador; tambien?: string[] };

export const GRUPOS: { titulo?: string; items: ItemMenu[] }[] = [
  { items: [{ href: "/admin", label: "Resumen", icono: "inicio" }] },
  {
    titulo: "Operación",
    items: [
      { href: "/admin/tickets", label: "Servicio", icono: "servicio", clave: "servicio", tambien: ["/admin/hojas"] },
      { href: "/admin/preventivos", label: "Preventivos", icono: "preventivos", clave: "preventivos" },
      { href: "/aperturas", label: "Aperturas", icono: "aperturas" },
    ],
  },
  {
    titulo: "Inventario",
    items: [
      { href: "/admin/activos", label: "Equipos", icono: "equipos", clave: "equipos" },
      { href: "/admin/refacciones", label: "Refacciones", icono: "refacciones", clave: "refacciones" },
      { href: "/admin/sucursales", label: "Sucursales", icono: "sucursales" },
    ],
  },
  {
    titulo: "Dinero",
    items: [
      { href: "/admin/gastos", label: "Gastos", icono: "gastos", clave: "gastos" },
      { href: "/admin/caja", label: "Caja chica", icono: "caja" },
      { href: "/admin/reporte", label: "Reporte", icono: "reporte" },
    ],
  },
  {
    titulo: "Ajustes",
    items: [
      { href: "/admin/usuarios", label: "Personas y proveedores", icono: "personas" },
      { href: "/admin/contenido", label: "Contenido de tiendas", icono: "contenido" },
    ],
  },
];

/** Lo que se puede crear desde "+ Nuevo" y desde la búsqueda. */
export const CREAR: { href: string; label: string; detalle: string }[] = [
  { href: "/servicio/nueva", label: "Hoja de servicio", detalle: "Registrar el trabajo de un técnico" },
  { href: "/admin/gastos#nuevo", label: "Gasto con factura", detalle: "Sube el XML del proveedor" },
  { href: "/admin/caja#nuevo", label: "Gasto de caja chica", detalle: "Factura, ticket o nota" },
  { href: "/admin/preventivos#nuevo", label: "Preventivo", detalle: "Programar un mantenimiento" },
  { href: "/admin/activos?nuevo=1#nuevo", label: "Equipo", detalle: "Alta con etiqueta QR" },
  { href: "/aperturas/nueva", label: "Apertura de sucursal", detalle: "Nuevo proyecto en el portafolio" },
];

/** Módulos que se consultan por mes: el periodo elegido viaja entre ellos. */
export const CON_PERIODO = ["/admin", "/admin/gastos", "/admin/caja", "/admin/reporte", "/admin/hojas"];
export const LLAVE_MES = "pasteko.mes";
export const EVENTO_MES = "pasteko:mes";
