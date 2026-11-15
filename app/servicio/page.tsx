import Link from "next/link";
import { redirect } from "next/navigation";
import Header from "@/components/Header";
import { sesion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { fecha, folio, mxn } from "@/lib/format";
import type { Hoja } from "@/lib/types";
import ActivarAvisos from "@/components/ActivarAvisos";
import { ABIERTOS, ESTADOS, PRIORIDAD, folioTicket, hace, type Ticket } from "@/lib/tickets";

export default async function MisHojas() {
  const s = await sesion();
  if (!s?.perfil) redirect("/login");
  if (s.perfil.rol === "supervisor") redirect("/censo");
  if (s.perfil.rol === "consulta") redirect("/aperturas");
  const supabase = await createClient();
  const { data } = await supabase
    .from("v_hojas")
    .select("id, folio, sucursal, equipo, tipo, creada, total, estado")
    .eq("tecnico_id", s.userId)
    .order("creada", { ascending: false })
    .limit(30);
  const { data: tk } = await supabase.from("tickets").select("*, sucursales(nombre)").eq("tecnico_id", s.userId).in("estado", ABIERTOS).order("creado");
  const tickets = (tk ?? []) as (Ticket & { sucursales: { nombre: string } | null })[];
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
        {tickets.length > 0 && (
          <section className="tks">
            <h2 className="sec-title">Reportes asignados a ti · {tickets.length}</h2>
            <div className="tks-lista">
              {tickets.map((t) => (
                <Link key={t.id} href={`/servicio/tickets/${t.id}`} className={`tkb-item p-${t.prioridad}`}>
                  <div className="tkb-l1">
                    <span className="num tkb-folio">{folioTicket(t.folio)}</span>
                    <span className={`pill ${PRIORIDAD[t.prioridad].clase}`}>{PRIORIDAD[t.prioridad].nombre}</span>
                    <span className={`pill ${ESTADOS[t.estado].clase}`}>{ESTADOS[t.estado].nombre}</span>
                    <span className="tkb-t">hace {hace(t.creado)}</span>
                  </div>
                  <b className="tkb-tit">{t.sucursales?.nombre} · {t.equipo}</b>
                  <span className="tkb-l3">{t.sintoma}</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        <div style={{ marginBottom: 18 }}><ActivarAvisos compacto /></div>
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
