import Link from "next/link";
import BotonImprimir from "@/components/BotonImprimir";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sitio } from "@/lib/qr";
import HojaEtiquetas from "@/components/HojaEtiquetas";
import Seccion from "@/components/Seccion";
import { vistasEquipos } from "@/lib/secciones";

type F = { ids?: string; zona?: string; sucursal?: string; tam?: string; todas?: string };

/** Hoja carta con etiquetas QR para imprimir, recortar y pegar en cada equipo. */
export default async function Etiquetas({ searchParams }: { searchParams: Promise<F> }) {
  await requireAdmin();
  const f = await searchParams;
  const supabase = await createClient();
  const [{ data: a }, { data: suc }, vistas] = await Promise.all([
    supabase.from("activos").select("id, equipo, sucursal_id, marca, modelo, descripcion").eq("activo", true).order("sucursal_id").order("id"),
    supabase.from("sucursales").select("id, nombre, zona").order("zona").order("nombre"),
    vistasEquipos(supabase),
  ]);
  const sucursales = (suc ?? []) as { id: number; nombre: string; zona: string }[];
  const sucPorId = new Map(sucursales.map((s) => [s.id, s]));
  const zonas = Array.from(new Set(sucursales.map((s) => s.zona)));

  let activos = (a ?? []) as { id: string; equipo: string; sucursal_id: number; marca: string | null; modelo: string | null; descripcion: string | null }[];
  const ids = f.ids ? f.ids.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) : [];
  if (ids.length) activos = activos.filter((x) => ids.includes(x.id));
  if (f.zona) activos = activos.filter((x) => sucPorId.get(x.sucursal_id)?.zona === f.zona);
  if (f.sucursal) activos = activos.filter((x) => String(x.sucursal_id) === f.sucursal);
  const filtrado = f.todas === "1" || ids.length > 0 || !!f.zona || !!f.sucursal;
  const lista = filtrado ? activos : [];


  return (
    <main className="wrap eqp">
      <Seccion
        titulo="Equipos"
        sub="Imprime en hoja carta, recorta por la línea punteada y pega cada etiqueta en su equipo. Al escanearla se abre su historial y el reporte de fallas."
        vistas={vistas}
        activa="etiquetas"
        acciones={lista.length > 0 ? <BotonImprimir /> : undefined}
      />

      {!sitio() && <div className="note warn no-print eqp-nota">Configura NEXT_PUBLIC_SITE_URL con tu dirección de Vercel antes de imprimir; si no, los QR no abrirán nada.</div>}

      <form method="get" className="toolbar no-print">
        {/* La zona se elige en la barra superior; aquí se conserva al generar. */}
        {f.zona && <input type="hidden" name="zona" value={f.zona} />}
        <label className="field">Sucursal
          <select id="e-suc" name="sucursal" defaultValue={f.sucursal ?? ""}>
            <option value="">Todas</option>
            {zonas.filter((z) => !f.zona || z === f.zona).map((z) => <optgroup key={z} label={z}>{sucursales.filter((s) => s.zona === z).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</optgroup>)}
          </select>
        </label>
        <label className="field">Códigos (separados por coma)<input id="e-ids" name="ids" defaultValue={f.ids ?? ""} placeholder="PK-CAF-001, PK-REF-002" /></label>
        <button className="btn primary" type="submit">Generar</button>
        <Link className="btn" href={`/admin/activos/etiquetas?todas=1${f.zona ? `&zona=${encodeURIComponent(f.zona)}` : ""}`}>{f.zona ? "Todos los de la zona" : "Todos los equipos"}</Link>
      </form>

      {!filtrado ? (
        <div className="ui-vacio no-print"><b>Elige qué etiquetas imprimir</b><p>Elige la zona en la barra superior o una sucursal, escribe códigos, o genera las de todos los equipos.</p></div>
      ) : lista.length === 0 ? (
        <div className="ui-vacio no-print"><b>Sin equipos con estos filtros</b><p>Da de alta los equipos en Equipos › Inventario y garantías.</p></div>
      ) : (
        <>
          <p className="sub no-print">{lista.length} etiqueta{lista.length !== 1 ? "s" : ""} · {Math.ceil(lista.length / 4)} hoja{Math.ceil(lista.length / 4) !== 1 ? "s" : ""} carta aprox.</p>
          <HojaEtiquetas items={lista.map((x) => ({ id: x.id, equipo: x.equipo, descripcion: x.descripcion, sucursal: sucPorId.get(x.sucursal_id)?.nombre ?? "" }))} />
        </>
      )}
    </main>
  );
}
