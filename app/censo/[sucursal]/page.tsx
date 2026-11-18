/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import FormEquipoCenso from "@/components/FormEquipoCenso";
import { requireSupervisor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { enlaces } from "@/lib/datos";
import { fotoEquipo } from "@/lib/tickets";
import type { Activo } from "@/lib/types";
import { borrarEquipoCenso, marcarCenso } from "../actions";

export const dynamic = "force-dynamic";

const MSG: Record<string, string> = {
  completa: "Sucursal marcada como completa. Mantenimiento validará los equipos.",
  abierta: "Sucursal reabierta para seguir registrando.",
  borrado: "Equipo borrado.",
};

export default async function CensoSucursal({ params, searchParams }: { params: Promise<{ sucursal: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { perfil, userId } = await requireSupervisor();
  const [{ sucursal: sid }, f] = await Promise.all([params, searchParams]);
  const esAdmin = perfil.rol === "admin";
  const supabase = await createClient();

  const { data: s } = await supabase.from("sucursales").select("id, nombre, zona, censo_completo, censo_fecha").eq("id", Number(sid)).maybeSingle();
  if (!s || (!esAdmin && s.zona !== perfil.zona)) notFound();

  const [{ data: a }, { data: eqs }] = await Promise.all([
    supabase.from("activos").select("*").eq("sucursal_id", s.id).eq("activo", true).order("registrado", { ascending: false }),
    supabase.from("equipos").select("slug, nombre, categoria").eq("vigente", true).order("orden"),
  ]);
  const activos = (a ?? []) as Activo[];
  const urls = await enlaces(supabase, "censo", activos.flatMap((x) => [x.ficha_path, x.foto_path]));
  const pendientes = activos.filter((x) => !x.validado).length;
  const tipos = ((eqs ?? []) as { slug: string | null; nombre: string; categoria: string | null }[]).map((e) => ({
    nombre: e.nombre, categoria: e.categoria, foto: fotoEquipo(e.slug, e.nombre),
  }));

  const lista = (
    <section className="rc-lista">
      <div className="rc-lista-cab">
        <h2>Registrados en esta sucursal</h2>
        {activos.length > 0 && <Link className="btn small" href={`/censo/etiquetas?sucursal=${s.id}`}>Imprimir etiquetas QR</Link>}
      </div>
      {activos.length ? (
        <ul>
          {activos.map((x) => {
            const ficha = x.ficha_path ? urls.get(x.ficha_path) : undefined;
            const img = (x.foto_path && urls.get(x.foto_path)) || fotoEquipo(null, x.equipo) || ficha;
            return (
              <li key={x.id}>
                {img ? (
                  <a href={ficha ?? img} target="_blank" rel="noopener noreferrer" aria-label={`Ver la placa de ${x.id}`}><img src={img} alt="" /></a>
                ) : <span className="rc-sin">Sin foto</span>}
                <div className="rc-item">
                  <span className="rc-item-cab"><b className="num">{x.id}</b><span className={`pill ${x.validado ? "ok" : "warn"}`}>{x.validado ? "Validado" : "Por validar"}</span></span>
                  <p>{x.descripcion || x.equipo}</p>
                  <small>{x.equipo}{x.serie ? ` · Serie ${x.serie}` : " · Sin serie"}{x.marca ? ` · ${x.marca}` : ""}{x.modelo ? ` ${x.modelo}` : ""}</small>
                </div>
                {!x.validado && (esAdmin || x.registrado_por === userId) && (
                  <form action={borrarEquipoCenso}>
                    <input type="hidden" name="id" value={x.id} />
                    <input type="hidden" name="sucursal_id" value={s.id} />
                    <button className="rc-borrar" type="submit" aria-label={`Borrar ${x.id}`}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rc-vacio">Todavía no hay equipos. Empieza con el botón de arriba: refris, hornos, cafeteras, vitrinas, climas…</p>
      )}

      {!s.censo_completo && activos.length > 0 && (
        <form action={marcarCenso} className="rc-completa">
          <input type="hidden" name="sucursal_id" value={s.id} />
          <input type="hidden" name="completo" value="true" />
          <button type="submit">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            Ya registré todo: sucursal completa
          </button>
        </form>
      )}
    </section>
  );

  return (
    <>
      <Header items={[{ href: "/censo", label: "Censo" }, { href: "/censo/etiquetas", label: "Etiquetas QR" }]} salir sub={perfil.nombre} />
      <main className="wrap rc-main">
        <div className="rc-tienda">
          <Link href="/censo" className="rc-volver" aria-label="Mis sucursales">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
          </Link>
          <div>
            <small>{s.zona}</small>
            <h1>{s.nombre}</h1>
          </div>
          <span className="rc-cuenta">
            <b>{activos.length}</b> {activos.length === 1 ? "equipo" : "equipos"}
            {pendientes > 0 && <em>{pendientes} por validar</em>}
          </span>
        </div>

        {f.ok && MSG[f.ok] && <div className="note ok">{MSG[f.ok]}</div>}
        {f.error && <div className="note bad">{f.error}</div>}

        {s.censo_completo ? (
          <>
            <section className="rc-cerrada">
              <span aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
              <div>
                <b>Sucursal completa</b>
                <p>Si encontraste un equipo que faltaba, reábrela para registrarlo.</p>
              </div>
              <form action={marcarCenso}>
                <input type="hidden" name="sucursal_id" value={s.id} />
                <input type="hidden" name="completo" value="false" />
                <button className="btn" type="submit">Reabrir</button>
              </form>
            </section>
            {lista}
          </>
        ) : (
          <FormEquipoCenso sucursalId={s.id} sucursal={s.nombre} tipos={tipos} esAdmin={esAdmin}>{lista}</FormEquipoCenso>
        )}
      </main>
    </>
  );
}
