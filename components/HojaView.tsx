/* eslint-disable @next/next/no-img-element */
import { createClient } from "@/lib/supabase/server";
import { fecha, folio, mxn } from "@/lib/format";
import type { Hoja } from "@/lib/types";
import BotonImprimir from "@/components/BotonImprimir";

/** Hoja de servicio lista para ver en pantalla o imprimir / guardar como PDF. */
export default async function HojaView({ hoja }: { hoja: Hoja }) {
  const supabase = await createClient();
  const rutas = [...hoja.fotos, hoja.firma_path];
  const { data: firmadas } = await supabase.storage.from("hojas").createSignedUrls(rutas, 60 * 60);
  const url = (ruta: string) => firmadas?.find((f) => f.path === ruta)?.signedUrl ?? "";
  const subtotal = hoja.refacciones.reduce((s, r) => s + r.cantidad * r.costo, 0);

  return (
    <article className="sheet">
      <header className="sheet-head">
        <div>
          <p className="eyebrow">Hoja de servicio · Mantenimiento Pasteko</p>
          <h1 className="page-h num">{folio(hoja.folio)}</h1>
          <p className="sub" style={{ margin: 0 }}>{fecha(hoja.creada)}</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span className={`pill ${hoja.tipo === "Preventivo" ? "neutral" : "warn"}`}>{hoja.tipo}</span>
          <span className={`pill ${hoja.estado === "Revisada" ? "ok" : "neutral"}`}>{hoja.estado}</span>
          <BotonImprimir />
        </div>
      </header>

      <dl>
        <div><dt>Sucursal</dt><dd>{hoja.sucursal}</dd></div>
        <div><dt>Zona</dt><dd>{hoja.zona}</dd></div>
        <div><dt>Equipo</dt><dd>{hoja.equipo}</dd></div>
        <div><dt>Técnico</dt><dd>{hoja.tecnico}</dd></div>
        <div><dt>Ticket osTicket</dt><dd className="num">{hoja.ticket ? `#${hoja.ticket}` : "—"}</dd></div>
        <div><dt>Total</dt><dd className="num">{mxn(Number(hoja.total))}</dd></div>
      </dl>

      <div className="block"><p className="eyebrow">Falla reportada</p><p>{hoja.falla}</p></div>
      <div className="block"><p className="eyebrow">Trabajo realizado</p><p>{hoja.trabajo}</p></div>

      <div className="block">
        <p className="eyebrow" style={{ marginBottom: 6 }}>Refacciones y costo</p>
        {hoja.refacciones.length ? (
          <div className="tbl-wrap">
            <table style={{ minWidth: 0 }}>
              <thead><tr><th>Refacción</th><th className="r">Cant.</th><th className="r">Costo c/u</th><th className="r">Importe</th></tr></thead>
              <tbody>
                {hoja.refacciones.map((r, i) => (
                  <tr key={i}>
                    <td>{r.descripcion}</td>
                    <td className="r num">{r.cantidad}</td>
                    <td className="r num">{mxn(r.costo)}</td>
                    <td className="r num">{mxn(r.cantidad * r.costo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="sub">Sin refacciones.</p>
        )}
        <p style={{ textAlign: "right", margin: "8px 0 0" }} className="num">
          Refacciones {mxn(subtotal)} · Mano de obra {mxn(Number(hoja.mano_obra))} · <b>Total {mxn(Number(hoja.total))}</b>
        </p>
      </div>

      <div className="block">
        <p className="eyebrow" style={{ marginBottom: 6 }}>Evidencia</p>
        <div className="photos">
          {hoja.fotos.map((r, i) => (
            <a key={r} href={url(r)} target="_blank" rel="noopener noreferrer">
              <img src={url(r)} alt={`Foto ${i + 1} del servicio`} />
            </a>
          ))}
        </div>
      </div>

      <div className="block">
        <p className="eyebrow" style={{ marginBottom: 6 }}>Conformidad de la tienda</p>
        <img className="firma-img" src={url(hoja.firma_path)} alt={`Firma de ${hoja.recibe_nombre}`} />
        <p style={{ margin: "6px 0 0" }}><b>{hoja.recibe_nombre}</b></p>
      </div>

      {hoja.notas_admin && (
        <div className="block"><p className="eyebrow">Notas de mantenimiento</p><p>{hoja.notas_admin}</p></div>
      )}
    </article>
  );
}
