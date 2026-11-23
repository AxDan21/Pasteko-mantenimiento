import Link from "next/link";
import IconoUI from "@/components/IconoUI";
import { Estado } from "@/components/Insignias";
import { createClient } from "@/lib/supabase/server";
import { mxn } from "@/lib/format";
import { edadAnios, estadoGarantia, estadoPreventivo, fCorta, hoy, recomendacion } from "@/lib/panel";
import { ESTADOS, folioTicket, type EstadoTicket } from "@/lib/tickets";
import type { Activo } from "@/lib/types";

/** Detalle compacto de un equipo junto a la lista de Equipos: costo contra reparaciones, garantía, reportes y próximos preventivos. */
export default async function PanelEquipo({ id, cerrar }: { id: string; cerrar: string }) {
  const db = await createClient();
  const h = hoy();
  const { data } = await db.from("activos").select("*, sucursales(nombre, zona), proveedores(nombre)").eq("id", id).maybeSingle();
  if (!data) {
    return (
      <aside className="lp card" aria-label="Detalle del equipo">
        <p className="sub tkp-nota">No se encontró el equipo {id}.</p>
        <Link href={cerrar} className="btn small" scroll={false}>Cerrar</Link>
      </aside>
    );
  }
  const x = data as Activo & { sucursales: { nombre: string; zona: string } | null; proveedores: { nombre: string } | null };

  const [{ data: g }, { data: tk }, { data: pv }] = await Promise.all([
    db.from("v_gastos").select("origen, ref, fecha, concepto, tipo, monto").eq("activo_id", id).order("fecha", { ascending: false }),
    db.from("tickets").select("id, folio, sintoma, estado, creado").eq("activo_id", id).order("creado", { ascending: false }).limit(3),
    db.from("preventivos").select("id, fecha, tarea, hecho").eq("activo_id", id).eq("hecho", false).order("fecha").limit(2),
  ]);
  const gastos = (g ?? []) as { origen: string; ref: string; fecha: string; concepto: string; tipo: string; monto: number }[];
  const total = gastos.reduce((s, r) => s + Number(r.monto), 0);
  const costo = Number(x.costo);
  const pct = costo > 0 ? (total / costo) * 100 : 0;
  const rec = recomendacion(x, total, h);
  const gar = estadoGarantia(x.garantia_hasta, h);
  const enGarantia = gar.clase === "ok" || gar.clase === "warn";
  const pagadoGar = x.garantia_hasta ? gastos.filter((r) => r.tipo === "Correctivo" && r.fecha <= x.garantia_hasta!).reduce((s, r) => s + Number(r.monto), 0) : 0;
  const edad = edadAnios(x.fecha_compra, h);

  return (
    <aside className="lp card" aria-label={`Detalle del equipo ${x.id}`}>
      <header className="tkp-cab">
        <div className="tkp-cab-t">
          <div className="tkb-l1">
            <span className="num tkb-folio">{x.id}</span>
            {x.validado === false ? <Estado tono="warn">Por validar</Estado> : <Estado tono={x.activo ? rec.clase : "neutral"}>{x.activo ? rec.texto : "Dado de baja"}</Estado>}
          </div>
          <h2>{x.descripcion || x.equipo}</h2>
          <p>{x.sucursales?.nombre ?? "Sin sucursal"}{x.sucursales?.zona ? ` · ${x.sucursales.zona}` : ""}</p>
        </div>
        <Link href={cerrar} className="tkp-x" scroll={false} aria-label="Cerrar detalle"><IconoUI nombre="cerrar" tam={20} /></Link>
      </header>

      <div className="lp-gauge">
        <div className="lp-gauge-t">
          <b className="num">{mxn(total)}</b>
          <span>en reparaciones de {costo > 0 ? mxn(costo) : "un costo sin capturar"}</span>
        </div>
        <div className="bar"><i className={pct >= 50 ? "bad" : pct >= 30 ? "warn" : ""} style={{ width: `${Math.min(pct, 100)}%` }} /></div>
        <small>{costo > 0 ? `${pct.toFixed(0)}% de lo que costó` : "Captura el costo para saber si conviene reemplazarlo"}{edad !== null ? ` · ${edad.toFixed(1)} de ${x.vida_anios} años de vida útil` : ""}</small>
      </div>

      <dl className="tkd-datos">
        <div><dt>Marca y modelo</dt><dd>{[x.marca, x.modelo].filter(Boolean).join(" ") || "—"}</dd></div>
        <div><dt>Serie</dt><dd className="num">{x.serie || "—"}</dd></div>
        <div><dt>Garantía</dt><dd><Estado tono={gar.clase}>{gar.texto}</Estado></dd></div>
        <div><dt>Proveedor</dt><dd>{x.proveedores?.nombre ?? "—"}</dd></div>
      </dl>
      {pagadoGar > 0 && <p className="note bad tkp-nota">Se pagaron {mxn(pagadoGar)} en correctivos con la garantía vigente: reclámalos al proveedor.</p>}
      {enGarantia && pagadoGar === 0 && <p className="note ok tkp-nota">En garantía: antes de pagar una reparación, llama al proveedor.</p>}

      <section className="lp-sec">
        <h3>Reportes de tiendas</h3>
        {(tk ?? []).length ? (
          <ul className="lp-lista">
            {(tk ?? []).map((t) => (
              <li key={t.id}>
                <Link href={`/admin/tickets?f=todos&sel=${t.id}`}><span className="num">{folioTicket(t.folio)}</span> {t.sintoma}</Link>
                <Estado tono={ESTADOS[t.estado as EstadoTicket].clase}>{ESTADOS[t.estado as EstadoTicket].nombre}</Estado>
              </li>
            ))}
          </ul>
        ) : <p className="sub">Sin reportes.</p>}
      </section>

      <section className="lp-sec">
        <h3>Últimos gastos</h3>
        {gastos.length ? (
          <ul className="lp-lista">
            {gastos.slice(0, 4).map((r) => (
              <li key={r.origen + r.ref}>
                <span><small className="num">{fCorta(r.fecha)}</small> {r.concepto}</span>
                <b className="num">{mxn(Number(r.monto))}</b>
              </li>
            ))}
          </ul>
        ) : <p className="sub">Sin gastos ligados a este equipo.</p>}
      </section>

      {(pv ?? []).length > 0 && (
        <section className="lp-sec">
          <h3>Próximos preventivos</h3>
          <ul className="lp-lista">
            {(pv ?? []).map((p) => {
              const e = estadoPreventivo(p, h);
              return <li key={p.id}><span><small className="num">{fCorta(p.fecha)}</small> {p.tarea}</span><Estado tono={e.clase}>{e.texto}</Estado></li>;
            })}
          </ul>
        </section>
      )}

      <div className="tkp-acc">
        <Link className="btn primary small" href={`/servicio/nueva?activo=${encodeURIComponent(x.id)}`}>Hacer hoja de servicio</Link>
        <Link className="btn small" href="/admin/preventivos#nuevo">Programar preventivo</Link>
      </div>
      <Link href={`/admin/activos/${encodeURIComponent(x.id)}`} className="tkp-full">Abrir ficha completa: etiqueta QR, historial y edición <IconoUI nombre="derecha" tam={14} grosor={2.2} /></Link>
    </aside>
  );
}
