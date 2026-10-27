export type Sucursal = { id: number; nombre: string; zona: string; supervisor: string | null; activa: boolean };

export type Equipo = {
  id: number;
  slug: string;
  nombre: string;
  categoria: string;
  icono: string;
  orden: number;
  publicado: boolean;
};

export type Video = { id: number; equipo_id: number; titulo: string; youtube_url: string; duracion: string | null; orden: number };

export type Faq = {
  id: number;
  equipo_id: number;
  pregunta: string;
  pasos: string[];
  aviso_seguridad: string | null;
  orden: number;
};

export type Perfil = { id: string; nombre: string; rol: "tecnico" | "admin"; zona: string | null; activo: boolean };

export type Refaccion = { descripcion: string; cantidad: number; costo: number };

export type Hoja = {
  id: string;
  folio: number;
  tecnico_id: string;
  sucursal_id: number;
  equipo: string;
  tipo: "Preventivo" | "Correctivo";
  ticket: string | null;
  falla: string;
  trabajo: string;
  refacciones: Refaccion[];
  mano_obra: number;
  total: number;
  fotos: string[];
  firma_path: string;
  recibe_nombre: string;
  estado: "Enviada" | "Revisada";
  notas_admin: string | null;
  creada: string;
  activo_id?: string | null;
  preventivo_id?: number | null;
  // columnas de la vista v_hojas
  sucursal: string;
  zona: string;
  tecnico: string;
};

export type Ajustes = { presupuesto_mensual: number; fondo_caja_chica: number };

export type Proveedor = {
  id: number; nombre: string; especialidad: string; cobertura: string | null; contacto: string | null;
  telefono: string | null; correo: string | null; calificacion: number | null; notas: string | null; activo: boolean;
};

export type Activo = {
  id: string; sucursal_id: number; equipo: string; marca: string | null; modelo: string | null; serie: string | null;
  fecha_compra: string | null; garantia_hasta: string | null; costo: number; vida_anios: number;
  proveedor_id: number | null; activo: boolean; notas: string | null;
};

export type Preventivo = {
  id: number; fecha: string; sucursal_id: number; equipo: string; activo_id: string | null; tarea: string;
  tecnico_id: string | null; proveedor_id: number | null; hecho: boolean; hoja_id: string | null; notas: string | null;
};

export type GastoV = {
  origen: "hoja" | "gasto" | "caja"; ref: string; fecha: string; sucursal_id: number | null; sucursal: string | null;
  zona: string | null; categoria: string; tipo: string; concepto: string; monto: number; activo_id: string | null;
};

export type Gasto = {
  id: number; fecha: string; sucursal_id: number | null; categoria: string; tipo: string; concepto: string;
  monto: number; proveedor_id: number | null; activo_id: string | null; factura_path: string | null;
};

export type MovCaja = { id: number; fecha: string; concepto: string; sucursal_id: number | null; monto: number; factura_path: string | null };

export type Refaccion2 = { id: number; codigo: string | null; nombre: string; equipo: string | null; ubicacion: string; stock: number; minimo: number; costo: number };

export type Apertura = { id: number; nombre: string; fecha: string; notas: string | null };
export type AperturaItem = { id: number; apertura_id: number; grupo: string; texto: string; hecho: boolean; orden: number };
