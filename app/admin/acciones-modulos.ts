"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sumarMeses } from "@/lib/panel";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(f.get(k) ?? 0) || 0;
const opcNum = (f: FormData, k: string) => (txt(f, k) ? Number(txt(f, k)) : null);
const opcTxt = (f: FormData, k: string) => txt(f, k) || null;

async function db() {
  await requireAdmin();
  return createClient();
}

/** Sube el archivo del campo "factura" al bucket privado y devuelve su ruta, o null si no hay archivo. */
async function subirFactura(supabase: Awaited<ReturnType<typeof createClient>>, f: FormData, carpeta: string) {
  const file = f.get("factura");
  if (!(file instanceof File) || file.size === 0) return null;
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const ruta = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("facturas").upload(ruta, file, { contentType: file.type || undefined });
  if (error) throw new Error(`No se pudo subir la factura: ${error.message}`);
  return ruta;
}

// ---------- Ajustes ----------
export async function guardarAjustes(f: FormData) {
  const supabase = await db();
  await supabase.from("ajustes").upsert([
    { clave: "presupuesto_mensual", valor: num(f, "presupuesto_mensual") },
    { clave: "fondo_caja_chica", valor: num(f, "fondo_caja_chica") },
  ]);
  revalidatePath("/admin", "layout");
}

// ---------- Preventivos ----------
export async function crearPreventivos(f: FormData) {
  const supabase = await db();
  const fecha = txt(f, "fecha");
  const repetir = Math.max(0, num(f, "cada_meses"));
  const veces = repetir ? Math.min(Math.max(1, num(f, "veces")), 24) : 1;
  const base = {
    sucursal_id: num(f, "sucursal_id"),
    equipo: txt(f, "equipo"),
    activo_id: opcTxt(f, "activo_id"),
    tarea: txt(f, "tarea"),
    tecnico_id: opcTxt(f, "tecnico_id"),
    proveedor_id: opcNum(f, "proveedor_id"),
    notas: opcTxt(f, "notas"),
  };
  if (!fecha || !base.sucursal_id || !base.equipo || !base.tarea) redirect("/admin/preventivos?error=datos");
  const [y, m, d] = fecha.split("-");
  const filas = Array.from({ length: veces }, (_, i) => {
    const mes = sumarMeses(`${y}-${m}`, i * repetir);
    const ultimo = new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();
    return { ...base, fecha: `${mes}-${String(Math.min(Number(d), ultimo)).padStart(2, "0")}` };
  });
  const { error } = await supabase.from("preventivos").insert(filas);
  if (error) redirect(`/admin/preventivos?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/preventivos");
  redirect(`/admin/preventivos?ok=${filas.length}`);
}

export async function actualizarPreventivo(f: FormData) {
  const supabase = await db();
  const cambios: Record<string, unknown> = {};
  if (f.has("hecho")) cambios.hecho = txt(f, "hecho") === "true";
  if (txt(f, "fecha")) cambios.fecha = txt(f, "fecha");
  await supabase.from("preventivos").update(cambios).eq("id", num(f, "id"));
  revalidatePath("/admin/preventivos");
  revalidatePath("/admin");
}

export async function borrarPreventivo(f: FormData) {
  const supabase = await db();
  await supabase.from("preventivos").delete().eq("id", num(f, "id"));
  revalidatePath("/admin/preventivos");
}

// ---------- Gastos ----------
export async function crearGasto(f: FormData) {
  const supabase = await db();
  let factura: string | null = null;
  try {
    factura = await subirFactura(supabase, f, `gastos/${txt(f, "fecha").slice(0, 7)}`);
  } catch (e) {
    redirect(`/admin/gastos?error=${encodeURIComponent((e as Error).message)}`);
  }
  const { error } = await supabase.from("gastos").insert({
    fecha: txt(f, "fecha"),
    sucursal_id: opcNum(f, "sucursal_id"),
    categoria: txt(f, "categoria") || "Otros",
    tipo: txt(f, "tipo") || "Correctivo",
    concepto: txt(f, "concepto"),
    monto: num(f, "monto"),
    proveedor_id: opcNum(f, "proveedor_id"),
    activo_id: opcTxt(f, "activo_id"),
    factura_path: factura,
  });
  if (error) redirect(`/admin/gastos?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin", "layout");
  redirect(`/admin/gastos?mes=${txt(f, "fecha").slice(0, 7)}&ok=1`);
}

export async function borrarGasto(f: FormData) {
  const supabase = await db();
  await supabase.from("gastos").delete().eq("id", num(f, "id"));
  revalidatePath("/admin", "layout");
}

// ---------- Activos ----------
export async function crearActivo(f: FormData) {
  const supabase = await db();
  let id = txt(f, "id").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const equipo = txt(f, "equipo");
  if (!id) {
    const pref = equipo.normalize("NFD").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase() || "EQP";
    const { count } = await supabase.from("activos").select("id", { count: "exact", head: true }).like("id", `PK-${pref}-%`);
    id = `PK-${pref}-${String((count ?? 0) + 1).padStart(3, "0")}`;
  }
  const { error } = await supabase.from("activos").insert({
    id,
    sucursal_id: num(f, "sucursal_id"),
    equipo,
    marca: opcTxt(f, "marca"),
    modelo: opcTxt(f, "modelo"),
    serie: opcTxt(f, "serie"),
    fecha_compra: opcTxt(f, "fecha_compra"),
    garantia_hasta: opcTxt(f, "garantia_hasta"),
    costo: num(f, "costo"),
    vida_anios: num(f, "vida_anios") || 8,
    proveedor_id: opcNum(f, "proveedor_id"),
  });
  if (error) redirect(`/admin/activos?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin/activos");
  redirect(`/admin/activos?ok=${id}`);
}

export async function actualizarActivo(f: FormData) {
  const supabase = await db();
  const id = txt(f, "id");
  await supabase
    .from("activos")
    .update({
      sucursal_id: num(f, "sucursal_id"),
      marca: opcTxt(f, "marca"),
      modelo: opcTxt(f, "modelo"),
      serie: opcTxt(f, "serie"),
      fecha_compra: opcTxt(f, "fecha_compra"),
      garantia_hasta: opcTxt(f, "garantia_hasta"),
      costo: num(f, "costo"),
      vida_anios: num(f, "vida_anios") || 8,
      proveedor_id: opcNum(f, "proveedor_id"),
      activo: txt(f, "activo") !== "false",
      notas: opcTxt(f, "notas"),
    })
    .eq("id", id);
  revalidatePath("/admin/activos");
  redirect(`/admin/activos/${id}?ok=1`);
}

// ---------- Caja chica ----------
export async function crearMovCaja(f: FormData) {
  const supabase = await db();
  let factura: string | null = null;
  try {
    factura = await subirFactura(supabase, f, `caja/${txt(f, "fecha").slice(0, 7)}`);
  } catch (e) {
    redirect(`/admin/caja?error=${encodeURIComponent((e as Error).message)}`);
  }
  const { error } = await supabase.from("caja_chica").insert({
    fecha: txt(f, "fecha"),
    concepto: txt(f, "concepto"),
    sucursal_id: opcNum(f, "sucursal_id"),
    monto: num(f, "monto"),
    factura_path: factura,
  });
  if (error) redirect(`/admin/caja?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin", "layout");
  redirect(`/admin/caja?mes=${txt(f, "fecha").slice(0, 7)}&ok=1`);
}

export async function adjuntarFacturaCaja(f: FormData) {
  const supabase = await db();
  const id = num(f, "id");
  let ruta: string | null = null;
  try {
    ruta = await subirFactura(supabase, f, "caja/adjuntas");
  } catch (e) {
    redirect(`/admin/caja?error=${encodeURIComponent((e as Error).message)}`);
  }
  if (ruta) await supabase.from("caja_chica").update({ factura_path: ruta }).eq("id", id);
  revalidatePath("/admin", "layout");
}

export async function borrarMovCaja(f: FormData) {
  const supabase = await db();
  await supabase.from("caja_chica").delete().eq("id", num(f, "id"));
  revalidatePath("/admin", "layout");
}

// ---------- Proveedores ----------
export async function crearProveedor(f: FormData) {
  const supabase = await db();
  await supabase.from("proveedores").insert({
    nombre: txt(f, "nombre"),
    especialidad: txt(f, "especialidad"),
    cobertura: opcTxt(f, "cobertura"),
    contacto: opcTxt(f, "contacto"),
    telefono: opcTxt(f, "telefono"),
    correo: opcTxt(f, "correo"),
    calificacion: opcNum(f, "calificacion"),
  });
  revalidatePath("/admin/tecnicos");
}

export async function actualizarProveedor(f: FormData) {
  const supabase = await db();
  const cambios: Record<string, unknown> = {};
  if (f.has("activo")) cambios.activo = txt(f, "activo") === "true";
  if (f.has("calificacion")) cambios.calificacion = opcNum(f, "calificacion");
  await supabase.from("proveedores").update(cambios).eq("id", num(f, "id"));
  revalidatePath("/admin/tecnicos");
}

// ---------- Refacciones ----------
export async function crearRefaccion(f: FormData) {
  const supabase = await db();
  await supabase.from("refacciones").insert({
    codigo: opcTxt(f, "codigo"),
    nombre: txt(f, "nombre"),
    equipo: opcTxt(f, "equipo"),
    ubicacion: txt(f, "ubicacion") || "Almacén Pachuca",
    stock: num(f, "stock"),
    minimo: num(f, "minimo"),
    costo: num(f, "costo"),
  });
  revalidatePath("/admin/refacciones");
}

export async function ajustarStock(f: FormData) {
  const supabase = await db();
  const id = num(f, "id");
  const { data } = await supabase.from("refacciones").select("stock").eq("id", id).single();
  const nuevo = Math.max(0, Number(data?.stock ?? 0) + num(f, "delta"));
  await supabase.from("refacciones").update({ stock: nuevo }).eq("id", id);
  revalidatePath("/admin/refacciones");
}

export async function borrarRefaccion(f: FormData) {
  const supabase = await db();
  await supabase.from("refacciones").delete().eq("id", num(f, "id"));
  revalidatePath("/admin/refacciones");
}

// ---------- Aperturas ----------
const PLANTILLA: Record<string, string[]> = {
  Instalaciones: ["Instalación eléctrica revisada y con tierra física", "Gas con prueba de hermeticidad", "Agua y drenaje probados", "Extracción y ducto funcionando"],
  Equipos: ["Cafetera instalada y calibrada", "Horno instalado y probado", "Refrigeración en temperatura 24 h antes", "Vitrina caliente probada", "Aire acondicionado instalado"],
  Registro: ["Equipos dados de alta en Activos", "Garantías y facturas registradas", "QR pegados en cada equipo", "Primer preventivo programado"],
  Capacitación: ["Personal vio los videos de cada equipo", "Directorio de emergencia entregado"],
};

export async function crearApertura(f: FormData) {
  const supabase = await db();
  const { data, error } = await supabase
    .from("aperturas")
    .insert({ nombre: txt(f, "nombre"), fecha: txt(f, "fecha"), notas: opcTxt(f, "notas") })
    .select("id")
    .single();
  if (error || !data) redirect(`/admin/aperturas?error=${encodeURIComponent(error?.message ?? "alta")}`);
  let orden = 0;
  const items = Object.entries(PLANTILLA).flatMap(([grupo, lista]) => lista.map((texto) => ({ apertura_id: data.id, grupo, texto, orden: orden++ })));
  await supabase.from("apertura_items").insert(items);
  revalidatePath("/admin/aperturas");
  redirect(`/admin/aperturas?id=${data.id}`);
}

export async function alternarItem(f: FormData) {
  const supabase = await db();
  await supabase.from("apertura_items").update({ hecho: txt(f, "hecho") === "true" }).eq("id", num(f, "id"));
  revalidatePath("/admin/aperturas");
}

export async function agregarItem(f: FormData) {
  const supabase = await db();
  const texto = txt(f, "texto");
  if (texto) await supabase.from("apertura_items").insert({ apertura_id: num(f, "apertura_id"), grupo: txt(f, "grupo") || "Otros", texto, orden: 999 });
  revalidatePath("/admin/aperturas");
}

export async function borrarApertura(f: FormData) {
  const supabase = await db();
  await supabase.from("aperturas").delete().eq("id", num(f, "id"));
  revalidatePath("/admin/aperturas");
  redirect("/admin/aperturas");
}
