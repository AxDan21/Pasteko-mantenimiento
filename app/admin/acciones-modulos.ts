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
  const uuid = txt(f, "factura_uuid").toUpperCase() || null;
  if (uuid) {
    const { data: previo } = await supabase.from("gastos").select("fecha, concepto").eq("factura_uuid", uuid).limit(1).maybeSingle();
    if (previo) redirect(`/admin/gastos?error=${encodeURIComponent(`Esta factura ya está registrada (${previo.fecha} · ${previo.concepto}). No se volvió a guardar.`)}`);
  }
  const pagado = txt(f, "pagado") === "true";
  const carpeta = `gastos/${txt(f, "fecha").slice(0, 7)}`;
  const pdf = f.get("factura");
  // Facturas por XML: el PDF es obligatorio mientras esté pendiente de pago (va a Tesorería)
  if (uuid && !pagado && !(pdf instanceof File && pdf.size > 0)) {
    redirect(`/admin/gastos?error=${encodeURIComponent("Adjunta el PDF de la factura: se manda a Tesorería junto con el XML.")}`);
  }
  let factura: string | null = null, xml: string | null = null;
  try {
    // Ya pagada desde el registro: no hace falta guardar archivos
    if (!(uuid && pagado)) factura = await subirFactura(supabase, f, carpeta);
    const texto = String(f.get("xml_texto") ?? "");
    if (uuid && !pagado && texto) {
      xml = `${carpeta}/${uuid}.xml`;
      const { error: ex } = await supabase.storage.from("facturas").upload(xml, new Blob([texto], { type: "application/xml" }), { contentType: "application/xml", upsert: true });
      if (ex) throw new Error(`No se pudo guardar el XML: ${ex.message}`);
    }
  } catch (e) {
    if (factura) await supabase.storage.from("facturas").remove([factura]);
    redirect(`/admin/gastos?error=${encodeURIComponent((e as Error).message)}`);
  }
  const comun = {
    fecha: txt(f, "fecha"),
    sucursal_id: opcNum(f, "sucursal_id"),
    proveedor_id: opcNum(f, "proveedor_id"),
    activo_id: opcTxt(f, "activo_id"),
    factura_path: factura,
    xml_path: xml,
    pagado,
    fecha_pago: pagado ? txt(f, "fecha_pago") || txt(f, "fecha") : null,
    referencia_pago: pagado ? opcTxt(f, "referencia_pago") : null,
    factura_uuid: uuid,
    factura_ref: uuid ? opcTxt(f, "factura_ref") : null,
    factura_total: uuid ? num(f, "factura_total") || null : null,
  };
  // Factura dividida en un gasto por concepto (viene del lector de XML)
  const pDesc = f.getAll("p_desc").map((v) => String(v).trim());
  const pCat = f.getAll("p_cat").map(String), pTipo = f.getAll("p_tipo").map(String), pMonto = f.getAll("p_monto").map(Number);
  const filas = pDesc.length > 1 && pDesc.length === pMonto.length
    ? pDesc.map((d, i) => ({
        ...comun,
        concepto: d || txt(f, "concepto"),
        categoria: pCat[i] || txt(f, "categoria") || "Otros",
        tipo: ["Preventivo", "Correctivo", "Otro"].includes(pTipo[i]) ? pTipo[i] : txt(f, "tipo") || "Correctivo",
        monto: Math.round((pMonto[i] || 0) * 100) / 100,
      })).filter((r) => r.monto > 0)
    : [{ ...comun, categoria: txt(f, "categoria") || "Otros", tipo: txt(f, "tipo") || "Correctivo", concepto: txt(f, "concepto"), monto: num(f, "monto") }];
  const { error } = await supabase.from("gastos").insert(filas);
  if (error) {
    const subidos = [factura, xml].filter((x): x is string => !!x);
    if (subidos.length) await supabase.storage.from("facturas").remove(subidos);
    redirect(`/admin/gastos?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/gastos?mes=${txt(f, "fecha").slice(0, 7)}&ok=${filas.length > 1 ? `partidas-${filas.length}` : "1"}`);
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
  let gastos = ids("gasto").map(Number).filter(Boolean);
  const hojas = ids("hoja").filter((x) => /^[0-9a-f-]{36}$/.test(x));
  // Los conceptos de una misma factura se pagan (o regresan a pendiente) juntos
  if (gastos.length) gastos = await conFactura(supabase, gastos);
  const regreso = txt(f, "volver") || "/admin/gastos";
  if (!gastos.length && !hojas.length) redirect(`${regreso}${regreso.includes("?") ? "&" : "?"}error=${encodeURIComponent("Selecciona al menos un concepto.")}#pendientes`);
  if (gastos.length) await supabase.from("gastos").update(cambios).in("id", gastos);
  // Pagadas: el PDF y el XML ya no se necesitan, se borran para ahorrar espacio
  if (pagado && gastos.length) await borrarArchivos(supabase, gastos, true);
  if (hojas.length) await supabase.from("hojas_servicio").update(cambios).in("id", hojas);
  revalidatePath("/admin", "layout");
  const n = gastos.length + hojas.length;
  redirect(`${regreso}${regreso.includes("?") ? "&" : "?"}ok=${pagado ? `pagados-${n}` : "pendiente"}#pendientes`);
}

/** Agrega a la lista todos los gastos que comparten factura (UUID) con los indicados. */
async function conFactura(supabase: Awaited<ReturnType<typeof db>>, ids: number[]) {
  const { data } = await supabase.from("gastos").select("factura_uuid").in("id", ids).not("factura_uuid", "is", null);
  const uuids = Array.from(new Set((data ?? []).map((x) => x.factura_uuid as string)));
  if (!uuids.length) return ids;
  const { data: hermanos } = await supabase.from("gastos").select("id").in("factura_uuid", uuids);
  return Array.from(new Set([...ids, ...(hermanos ?? []).map((x) => x.id as number)]));
}

/** Borra un gasto; si viene de una factura dividida, borra la factura completa para no dejarla incompleta. */
/** Borra del almacenamiento el PDF y XML de facturas (CFDI) y limpia las rutas. */
async function borrarArchivos(supabase: Awaited<ReturnType<typeof db>>, ids: number[], soloCfdi: boolean) {
  let q = supabase.from("gastos").select("id, factura_path, xml_path").in("id", ids);
  if (soloCfdi) q = q.not("factura_uuid", "is", null);
  const { data } = await q;
  const filas = (data ?? []) as { id: number; factura_path: string | null; xml_path: string | null }[];
  const rutas = Array.from(new Set(filas.flatMap((x) => [x.factura_path, x.xml_path]).filter((x): x is string => !!x)));
  if (!rutas.length) return;
  await supabase.storage.from("facturas").remove(rutas);
  await supabase.from("gastos").update({ factura_path: null, xml_path: null }).in("id", filas.map((x) => x.id));
}

export async function borrarGasto(f: FormData) {
  const supabase = await db();
  const ids = await conFactura(supabase, [num(f, "id")]);
  await borrarArchivos(supabase, ids, false);
  await supabase.from("gastos").delete().in("id", ids);
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
  // El ancla (#cola) va al final, después de los parámetros, para volver al mismo punto de la página.
  const [base, ancla] = (txt(f, "volver") || "/admin/activos/censo").split("#");
  const con = (p: string) => `${base}${base.includes("?") ? "&" : "?"}${p}${ancla ? `#${ancla}` : ""}`;
  if (!ids.length) redirect(con(`error=${encodeURIComponent("Selecciona al menos un equipo.")}`));
  await supabase.from("activos").update({ validado: true, validado_por: userId, validado_en: new Date().toISOString() }).in("id", ids);
  revalidatePath("/admin/activos", "layout");
  redirect(con(`ok=validados-${ids.length}`));
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

/** Caja chica desde el XML + PDF de la factura: los datos vienen del CFDI, solo se elige la sucursal. */
export async function crearMovCajaCfdi(f: FormData) {
  const supabase = await db();
  const fecha = txt(f, "fecha");
  const uuid = txt(f, "factura_uuid").toUpperCase();
  const volver = `/admin/caja?mes=${fecha.slice(0, 7)}`;
  if (!uuid) redirect(`${volver}&error=${encodeURIComponent("El XML no trae folio fiscal (UUID). Revisa que sea una factura timbrada.")}`);
  const [{ data: enCaja }, { data: enGastos }] = await Promise.all([
    supabase.from("caja_chica").select("fecha, concepto").eq("factura_uuid", uuid).limit(1).maybeSingle(),
    supabase.from("gastos").select("fecha, concepto").eq("factura_uuid", uuid).limit(1).maybeSingle(),
  ]);
  const previo = enCaja ?? enGastos;
  if (previo) redirect(`${volver}&error=${encodeURIComponent(`Esta factura ya está registrada en ${enCaja ? "caja chica" : "gastos"} (${previo.fecha} · ${previo.concepto}). No se volvió a guardar.`)}`);
  const pdf = f.get("factura");
  if (!(pdf instanceof File) || pdf.size === 0) redirect(`${volver}&error=${encodeURIComponent("Falta el PDF de la factura.")}`);

  const carpeta = `caja/${fecha.slice(0, 7)}`;
  let factura: string | null = null, xml: string | null = null;
  try {
    factura = await subirFactura(supabase, f, carpeta);
    const texto = String(f.get("xml_texto") ?? "");
    if (texto) {
      xml = `${carpeta}/${uuid}.xml`;
      const { error: ex } = await supabase.storage.from("facturas").upload(xml, new Blob([texto], { type: "application/xml" }), { contentType: "application/xml", upsert: true });
      if (ex) throw new Error(`No se pudo guardar el XML: ${ex.message}`);
    }
  } catch (e) {
    if (factura) await supabase.storage.from("facturas").remove([factura]);
    redirect(`${volver}&error=${encodeURIComponent((e as Error).message)}`);
  }
  const { error } = await supabase.from("caja_chica").insert({
    fecha,
    concepto: txt(f, "concepto") || "Factura",
    sucursal_id: opcNum(f, "sucursal_id"),
    monto: num(f, "monto"),
    factura_path: factura,
    xml_path: xml,
    factura_uuid: uuid,
    factura_ref: opcTxt(f, "factura_ref"),
    proveedor: opcTxt(f, "proveedor"),
    rfc: opcTxt(f, "rfc"),
  });
  if (error) {
    await supabase.storage.from("facturas").remove([factura, xml].filter((x): x is string => !!x));
    redirect(`${volver}&error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/admin", "layout");
  redirect(`${volver}&ok=1`);
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
  const { data: m } = await supabase.from("caja_chica").select("factura_path, xml_path").eq("id", num(f, "id")).maybeSingle();
  await supabase.from("caja_chica").delete().eq("id", num(f, "id"));
  const rutas = [m?.factura_path, m?.xml_path].filter((x): x is string => !!x);
  if (rutas.length) await supabase.storage.from("facturas").remove(rutas);
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
  revalidatePath("/admin/usuarios/proveedores");
}

export async function actualizarProveedor(f: FormData) {
  const supabase = await db();
  const cambios: Record<string, unknown> = {};
  if (f.has("activo")) cambios.activo = txt(f, "activo") === "true";
  if (f.has("calificacion")) cambios.calificacion = opcNum(f, "calificacion");
  await supabase.from("proveedores").update(cambios).eq("id", num(f, "id"));
  revalidatePath("/admin/usuarios/proveedores");
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

/**
 * Etapa 1 → 2: facturas entregadas a Tesorería (impresas y por correo).
 * Desde aquí ya no se necesitan el PDF ni el XML: se borran para ahorrar espacio.
 * Con "deshacer" regresan a "por pasar a pago" (los archivos ya no vuelven).
 */
export async function pasarAPago(f: FormData) {
  const supabase = await db();
  const deshacer = txt(f, "deshacer") === "1";
  const fecha = deshacer ? null : txt(f, "fecha_solicitud") || new Date().toISOString().slice(0, 10);
  const sel = f.getAll("sel").map(String);
  const ids = (origen: string) => sel.filter((x) => x.startsWith(`${origen}:`)).map((x) => x.slice(origen.length + 1));
  let gastos = ids("gasto").map(Number).filter(Boolean);
  const hojas = ids("hoja").filter((x) => /^[0-9a-f-]{36}$/.test(x));
  const volver = txt(f, "volver").startsWith("/admin/gastos") ? txt(f, "volver") : "/admin/gastos";
  if (!gastos.length && !hojas.length) redirect(`${volver}${volver.includes("?") ? "&" : "?"}error=${encodeURIComponent("Selecciona al menos una factura.")}#pendientes`);
  if (gastos.length) gastos = await conFactura(supabase, gastos);
  if (gastos.length) await supabase.from("gastos").update({ solicitado_pago: fecha }).in("id", gastos).eq("pagado", false);
  if (hojas.length) await supabase.from("hojas_servicio").update({ solicitado_pago: fecha }).in("id", hojas).eq("pagado", false);
  if (!deshacer && gastos.length) await borrarArchivos(supabase, gastos, true);
  revalidatePath("/admin", "layout");
  const n = gastos.length + hojas.length;
  redirect(`${volver}${volver.includes("?") ? "&" : "?"}ok=${deshacer ? "regresadas" : `pasadas-${n}`}#pendientes`);
}

// ---------- Plan inteligente de preventivos ----------
/** Programa una salida: mueve sus preventivos a la fecha elegida y los asigna al técnico. */
export async function programarSalida(f: FormData) {
  const supabase = await db();
  const ids = f.getAll("prev").map(Number).filter(Boolean);
  const fecha = txt(f, "fecha");
  const volver = txt(f, "volver").startsWith("/admin/preventivos") ? txt(f, "volver") : "/admin/preventivos/plan";
  const sep = volver.includes("?") ? "&" : "?";
  if (!ids.length || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) redirect(`${volver}${sep}error=${encodeURIComponent("Falta la fecha de la salida.")}`);
  const { error } = await supabase.from("preventivos")
    .update({ fecha, tecnico_id: opcTxt(f, "tecnico_id") })
    .in("id", ids).eq("hecho", false);
  if (error) redirect(`${volver}${sep}error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin", "layout");
  redirect(`${volver}${sep}ok=programada-${ids.length}`);
}

/** Crea los preventivos que sugiere el plan (fallas repetidas o campañas por tipo de equipo). */
export async function crearSugeridos(f: FormData) {
  const supabase = await db();
  const fecha = txt(f, "fecha");
  const tarea = txt(f, "tarea") || "Revisión preventiva";
  const volver = txt(f, "volver").startsWith("/admin/preventivos") ? txt(f, "volver") : "/admin/preventivos/plan";
  const sep = volver.includes("?") ? "&" : "?";
  const objetivos = f.getAll("objetivo").map(String).map((x) => {
    const i = x.indexOf("|");
    return { sucursal_id: Number(x.slice(0, i)), equipo: x.slice(i + 1) };
  }).filter((x) => x.sucursal_id && x.equipo);
  if (!objetivos.length || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) redirect(`${volver}${sep}error=${encodeURIComponent("Falta la fecha.")}`);
  // Liga cada preventivo al activo de esa sucursal si lo hay
  const { data: act } = await supabase.from("activos").select("id, sucursal_id, equipo").eq("activo", true)
    .in("sucursal_id", objetivos.map((o) => o.sucursal_id));
  const activoDe = (o: { sucursal_id: number; equipo: string }) =>
    ((act ?? []) as { id: string; sucursal_id: number; equipo: string }[]).find((a) => a.sucursal_id === o.sucursal_id && a.equipo.toLowerCase() === o.equipo.toLowerCase())?.id ?? null;
  const filas = objetivos.map((o) => ({ fecha, sucursal_id: o.sucursal_id, equipo: o.equipo, activo_id: activoDe(o), tarea, notas: "Sugerido por el plan inteligente" }));
  const { error } = await supabase.from("preventivos").insert(filas);
  if (error) redirect(`${volver}${sep}error=${encodeURIComponent(error.message)}`);
  revalidatePath("/admin", "layout");
  redirect(`${volver}${sep}ok=creados-${filas.length}`);
}
