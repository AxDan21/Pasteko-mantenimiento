import Link from "next/link";
import Header from "@/components/Header";
import { requireSupervisor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Inicio del supervisor: sucursales de su zona y avance del censo. */
export default async function Censo() {
  const { perfil } = await requireSupervisor();
  const esAdmin = perfil.rol === "admin";
  const supabase = await createClient();

  let qs = supabase.from("sucursales").select("id, nombre, zona, censo_completo").eq("activa", true).order("zona").order("nombre");
  if (!esAdmin) qs = qs.eq("zona", perfil.zona ?? "__sin_zona__");
  const [{ data: suc }, { data: act }] = await Promise.all([qs, supabase.from("activos").select("sucursal_id, validado").eq("activo", true)]);
  const sucursales = (suc ?? []) as { id: number; nombre: string; zona: string; censo_completo: boolean }[];
  const conteo = new Map<number, { total: number; pendientes: number }>();
  (act ?? []).forEach((a) => {
    const c = conteo.get(a.sucursal_id as number) ?? { total: 0, pendientes: 0 };
    c.total += 1;
    if (!a.validado) c.pendientes += 1;
    conteo.set(a.sucursal_id as number, c);
  });
  const completas = sucursales.filter((s) => s.censo_completo).length;
  const zonas = Array.from(new Set(sucursales.map((s) => s.zona)));

  return (
    <>
      <Header items={[{ href: "/censo", label: "Censo", activo: true }, { href: "/censo/etiquetas", label: "Etiquetas QR" }, ...(esAdmin ? [{ href: "/admin/activos/censo", label: "Panel" }] : [])]} salir sub={perfil.nombre} />
      <main className="wrap">
        <div className="head-row">
          <div>
            <p className="eyebrow">Censo de equipos · {esAdmin ? "todas las zonas" : perfil.zona ?? "sin zona asignada"}</p>
            <h1 className="page-h">Equipos de mis sucursales</h1>
          </div>
          <span className="pill neutral">{completas} de {sucursales.length} sucursales completas</span>
        </div>

        {!esAdmin && !perfil.zona && (
          <div className="note warn" style={{ marginBottom: 16 }}>Tu usuario no tiene zona asignada. Pide a Mantenimiento que te la asigne para ver tus sucursales.</div>
        )}

        <section className="card censo-pasos" style={{ marginBottom: 18 }}>
          <h3>Cómo registrar</h3>
          <ol>
            <li>Entra a la sucursal y registra <b>cada equipo</b>: refrigeradores, mesas frías, hornos, cafeteras, vitrinas, campanas, minisplits y cualquier otro.</li>
            <li>Toma una foto <b>clara y legible</b> de la placa de datos (ficha técnica) y escribe el número de serie tal como aparece.</li>
            <li>Al terminar la tienda, toca <b>&quot;Sucursal completa&quot;</b>. Mantenimiento valida los datos e imprime las etiquetas QR.</li>
          </ol>
        </section>

        {zonas.map((z) => (
          <section key={z} style={{ marginBottom: 18 }}>
            {esAdmin && <h2 className="sec-title">{z}</h2>}
            <div className="censo-grid">
              {sucursales.filter((s) => s.zona === z).map((s) => {
                const c = conteo.get(s.id) ?? { total: 0, pendientes: 0 };
                return (
                  <Link key={s.id} href={`/censo/${s.id}`} className={`censo-suc ${s.censo_completo ? "done" : ""}`}>
                    <b>{s.nombre}</b>
                    <span className="num">{c.total} equipo{c.total !== 1 ? "s" : ""}</span>
                    <span className={`pill ${s.censo_completo ? "ok" : c.total ? "warn" : "neutral"}`}>
                      {s.censo_completo ? "Completa" : c.total ? "En proceso" : "Sin empezar"}
                    </span>
                    {c.pendientes > 0 && <small>{c.pendientes} por validar</small>}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </>
  );
}
