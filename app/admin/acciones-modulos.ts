"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sumarMeses } from "@/lib/panel";
import { filasDesdePlantilla, type FilaGantt } from "@/lib/gantt";

const txt = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => Number(f.get(k) ?? 0) || 0;
const opcNum = (f: FormData, k: string) => (txt(f, k) ? Number(txt(f, k)) : null);
const opcTxt = (f: FormData, k: string) => txt(f, k) || null;

async function db() {
  await requireAdmin();
  return createClient();
}

/** Sube el archivo del campo "factura" al bucket privado y devuelve su ruta, o null si no hay archivo. */
async function subirFactura(supabase: Awaited<ReturnType<typeof createClient>>, f: FormData, carpeta: string, campo = "factura") {
  const file = f.get(campo);
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
    pagado: txt(f, "pagado") === "true",
    fecha_pago: txt(f, "pagado") === "true" ? txt(f, "fecha_pago") || txt(f, "fecha") : null,
    referencia_pago: txt(f, "pagado") === "true" ? opcTxt(f, "referencia_pago") : null,
  });
  if (error) redirect(`/admin/gastos?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin", "layout");
  redirect(`/admin/gastos?mes=${txt(f, "fecha").slice(0, 7)}&ok=1`);
}

/**
 * Marca como pagados (o regresa a pendiente) uno o varios conceptos.
 * Cada "sel" viene como "gasto:<id>" u "hoja:<uuid>".
 */
export async function marcarPagos(f: FormData) {
  const supabase = await db();
  const pagado = txt(f, "pagado") !== "false";
  const fecha = pagado ? txt(f, "fecha_pago") || new Date().toISOString().slice(0, 10) : null;
  const referencia = pagado ? opcTxt(f, "referencia_pago") : null;
  const sel = f.getAll("sel").map(String);
  const ids = (origen: string) => sel.filter((x) => x.startsWith(`${origen}:`)).map((x) => x.slice(origen.length + 1));
  const cambios = { pagado, fecha_pago: fecha, referencia_pago: referencia };
  const gastos = ids("gasto").map(Number).filter(Boolean);
  const hojas = ids("hoja").filter((x) => /^[0-9a-f-]{36}$/.test(x));
  const regreso = txt(f, "volver") || "/admin/gastos";
  if (!gastos.length && !hojas.length) redirect(`${regreso}${regreso.includes("?") ? "&" : "?"}error=${encodeURIComponent("Selecciona al menos un concepto.")}#pendientes`);
  if (gastos.length) await supabase.from("gastos").update(cambios).in("id", gastos);
  if (hojas.length) await supabase.from("hojas_servicio").update(cambios).in("id", hojas);
  revalidatePath("/admin", "layout");
  const n = gastos.length + hojas.length;
  redirect(`${regreso}${regreso.includes("?") ? "&" : "?"}ok=${pagado ? `pagados-${n}` : "pendiente"}#pendientes`);
}

export async function borrarGasto(f: FormData) {
  const supabase = await db();
  await supabase.from("gastos").delete().eq("id", num(f, "id"));
  revalidatePath("/admin", "layout");
}

// ---------- Activos ----------
export async function crearActivo(f: FormData) {
  const supabase = await db();
  const pedido = txt(f, "id").toUpperCase().replace(/[^A-Z0-9-]/g, "");
  const equipo = txt(f, "equipo");
  // Sin código: la base de datos asigna el siguiente (PK-CAF-012) sin riesgo de duplicados.
  const { data: nuevo, error } = await supabase.from("activos").insert({
    ...(pedido ? { id: pedido } : {}),
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
    descripcion: opcTxt(f, "descripcion"),
    validado: true,
  }).select("id").single();
  if (error || !nuevo) redirect(`/admin/activos?error=${encodeURIComponent(error?.message ?? "No se pudo dar de alta")}`);
  const id = nuevo.id as string;
  try {
    const ruta = await subirFactura(supabase, f, `garantias/${id}`, "garantia");
    if (ruta) await supabase.from("activos").update({ garantia_path: ruta }).eq("id", id);
  } catch (e) {
    redirect(`/admin/activos/${id}?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath("/admin/activos");
  redirect(`/admin/activos/${id}?nuevo=1`);
}

/** Sube o reemplaza el documento de garantía (PDF o foto) de un equipo. */
export async function subirGarantia(f: FormData) {
  const supabase = await db();
  const id = txt(f, "id");
  let ruta: string | null = null;
  try {
    ruta = await subirFactura(supabase, f, `garantias/${id}`, "garantia");
  } catch (e) {
    redirect(`/admin/activos/${id}?error=${encodeURIComponent((e as Error).message)}`);
  }
  if (!ruta) redirect(`/admin/activos/${id}?error=${encodeURIComponent("Elige un archivo PDF o una foto de la garantía.")}`);
  const { data: previo } = await supabase.from("activos").select("garantia_path").eq("id", id).single();
  await supabase.from("activos").update({ garantia_path: ruta }).eq("id", id);
  if (previo?.garantia_path) await supabase.storage.from("facturas").remove([previo.garantia_path]);
  revalidatePath(`/admin/activos/${id}`);
  redirect(`/admin/activos/${id}?ok=garantia`);
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
      descripcion: opcTxt(f, "descripcion"),
      equipo: txt(f, "equipo") || undefined,
    })
    .eq("id", id);
  revalidatePath("/admin/activos");
  redirect(`/admin/activos/${id}?ok=1`);
}

/** Valida uno o varios equipos registrados por supervisores. */
export async function validarActivos(f: FormData) {
  const { userId } = await requireAdmin();
  const supabase = await createClient();
  const ids = f.getAll("id").map(String).filter(Boolean);
  const volver = txt(f, "volver") || "/admin/activos/censo";
  if (!ids.length) redirect(`${volver}${volver.includes("?") ? "&" : "?"}error=${encodeURIComponent("Selecciona al menos un equipo.")}`);
  await supabase.from("activos").update({ validado: true, validado_por: userId, validado_en: new Date().toISOString() }).in("id", ids);
  revalidatePath("/admin/activos", "layout");
  redirect(`${volver}${volver.includes("?") ? "&" : "?"}ok=validados-${ids.length}`);
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

// ---------- Aperturas (Gantt) ----------
export async function crearApertura(f: FormData) {
  const supabase = await db();
  const fecha = txt(f, "fecha");
  const { data, error } = await supabase
    .from("aperturas")
    .insert({ nombre: txt(f, "nombre"), fecha, tipo: txt(f, "tipo") === "Propia" ? "Propia" : "Franquicia", notas: opcTxt(f, "notas") })
    .select("id")
    .single();
  if (error || !data) redirect(`/admin/aperturas?error=${encodeURIComponent(error?.message ?? "alta")}`);
  const items = filasDesdePlantilla(fecha).map((r, i) => ({ apertura_id: data.id, grupo: "Gantt", orden: i, texto: r.actividad, responsable: r.responsable, fecha: r.fecha, hito: r.hito, hecho: false }));
  await supabase.from("apertura_items").insert(items);
  revalidatePath("/admin/aperturas");
  redirect(`/admin/aperturas?id=${data.id}`);
}

/** Guarda todo el Gantt de una apertura (encabezado y pasos) desde el editor. */
export async function guardarGantt(datos: { id: number; nombre: string; fecha: string; tipo: string; filas: FilaGantt[] }) {
  const supabase = await db();
  const fechaOk = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  if (!datos.nombre.trim() || !fechaOk(datos.fecha)) return { ok: false, error: "Falta el nombre o la fecha de apertura." };
  const filas = datos.filas.filter((r) => r.actividad.trim());
  const { error: e1 } = await supabase
    .from("aperturas")
    .update({ nombre: datos.nombre.trim(), fecha: datos.fecha, tipo: datos.tipo === "Propia" ? "Propia" : "Franquicia" })
    .eq("id", datos.id);
  if (e1) return { ok: false, error: e1.message };
  const { error: e2 } = await supabase.from("apertura_items").delete().eq("apertura_id", datos.id);
  if (e2) return { ok: false, error: e2.message };
  if (filas.length) {
    const { error: e3 } = await supabase.from("apertura_items").insert(
      filas.map((r, i) => ({
        apertura_id: datos.id, grupo: "Gantt", orden: i, texto: r.actividad.trim(), responsable: r.responsable.trim() || null,
        fecha: fechaOk(r.fecha), hecho: !!r.hecho, hito: r.hito === "verde" || r.hito === "amarillo" ? r.hito : null,
      }))
    );
    if (e3) return { ok: false, error: e3.message };
  }
  revalidatePath("/admin/aperturas");
  return { ok: true as const };
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
