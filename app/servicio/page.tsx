import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { sesion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fecha, folio, mxn } from "@/lib/format";
import type { Hoja } from "@/lib/types";

export default async function MisHojas() {
  const s = await sesion();
  if (!s?.perfil) redirect("/login");
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_hojas")
    .select("id, folio, sucursal, equipo, tipo, creada, total, estado")
    .eq("tecnico_id", s.userId)
    .order("creada", { ascending: false })
    .limit(30);
  const hojas = (data ?? []) as Pick<Hoja, "id" | "folio" | "sucursal" | "equipo" | "tipo" | "creada" | "total" | "estado">[];

  const items = [{ href: "/servicio", label: "Mis hojas", activo: true }];
  if (s.perfil.rol === "admin") items.push({ href: "/admin", label: "Panel", activo: false });

  return (
    <>
      <Header items={items} salir sub={s.perfil.nombre} />
      <main className="wrap">
        <div className="head-row">
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div>
              <p className="eyebrow">Técnico</p>
              <h1 className="page-h">Mis hojas de servicio</h1>
            </div>
          </div>
          <Link href="/servicio/nueva" className="btn primary">
            + Nueva hoja de servicio
          </Link>
        </div>
        {hojas.length ? (
          <div className="list-hojas">
            {hojas.map((h) => (
              <Link key={h.id} href={`/servicio/${h.id}`} className="hoja-card">
                <small className="num">{folio(h.folio)} · {fecha(h.creada)}</small>
                <b>{h.sucursal}</b>
                <small>{h.equipo} · {h.tipo}</small>
                <small className="num" style={{ marginTop: 6 }}>
                  {mxn(Number(h.total))} · <span className={`pill ${h.estado === "Revisada" ? "ok" : "neutral"}`}>{h.estado}</span>
                </small>
              </Link>
            ))}
          </div>
        ) : (
          <div className="card">
            <h3>Aún no tienes hojas de servicio</h3>
            <p className="sub">Al terminar cada visita, toca &quot;Nueva hoja de servicio&quot;, toma las fotos y pide la firma de la tienda.</p>
          </div>
        )}
      </main>
    </>
  );
}
