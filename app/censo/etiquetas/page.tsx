import Link from "next/link";
import BotonImprimir from "@/components/BotonImprimir";
import Header from "@/components/Header";
import HojaEtiquetas from "@/components/HojaEtiquetas";
import { requireSupervisor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Etiquetas QR de las sucursales del supervisor, para imprimir y pegar. */
export default async function EtiquetasCenso({ searchParams }: { searchParams: Promise<{ sucursal?: string; tam?: string }> }) {
  const { perfil } = await requireSupervisor();
  const f = await searchParams;
  const esAdmin = perfil.rol === "admin";
  const supabase = await createClient();

  let qs = supabase.from("sucursales").select("id, nombre, zona").order("nombre");
  if (!esAdmin) qs = qs.eq("zona", perfil.zona ?? "__sin_zona__");
  const { data: suc } = await qs;
  const sucursales = (suc ?? []) as { id: number; nombre: string; zona: string }[];
  const nombre = new Map(sucursales.map((s) => [s.id, s.nombre]));

  let q = supabase.from("activos").select("id, equipo, descripcion, sucursal_id").eq("activo", true).order("id");
  q = f.sucursal ? q.eq("sucursal_id", Number(f.sucursal)) : q.in("sucursal_id", sucursales.map((s) => s.id));
  const { data: a } = sucursales.length ? await q : { data: [] };
  const items = ((a ?? []) as { id: string; equipo: string; descripcion: string | null; sucursal_id: number }[])
    .filter((x) => nombre.has(x.sucursal_id))
    .map((x) => ({ id: x.id, equipo: x.equipo, descripcion: x.descripcion, sucursal: nombre.get(x.sucursal_id) ?? "" }));

  return (
    <>
      <Header items={[{ href: "/censo", label: "Censo" }, { href: "/censo/etiquetas", label: "Etiquetas QR", activo: true }]} salir sub={perfil.nombre} />
      <main className="wrap">
        <div className="head-row no-print">
          <div>
            <p className="eyebrow"><Link href="/censo">Censo de equipos</Link></p>
            <h1 className="page-h">Etiquetas QR</h1>
            <p className="sub" style={{ margin: 0 }}>Imprime en hoja carta, recorta por la línea punteada y pega cada etiqueta en su equipo, en un lugar visible y lejos de calor directo.</p>
          </div>
          {items.length > 0 && <BotonImprimir />}
        </div>
        <form method="get" className="toolbar no-print">
          <label className="field">Sucursal
            <select id="et-suc" name="sucursal" defaultValue={f.sucursal ?? ""}>
              <option value="">Todas mis sucursales</option>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </label>
          <button className="btn primary" type="submit">Ver</button>
        </form>
        {items.length ? (
          <>
            <p className="sub no-print">{items.length} etiqueta{items.length !== 1 ? "s" : ""}. Usa papel adhesivo o lamina las etiquetas.</p>
            <HojaEtiquetas items={items} />
          </>
        ) : (
          <div className="card"><h3>Sin equipos registrados</h3><p className="sub">Registra los equipos de la sucursal y aquí aparecerán sus etiquetas.</p></div>
        )}
      </main>
    </>
  );
}
