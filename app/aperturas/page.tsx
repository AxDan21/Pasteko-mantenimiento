import Link from "next/link";
import { requireAperturas } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AP_COLS, cuando, IT_COLS, vistaApertura, type ApRow, type ItemRow, type Vista } from "@/lib/aperturas";
import { fechaCorta } from "@/lib/gantt";
import { diasEntre, hoy, MESES, sumarDias } from "@/lib/panel";
import { convertirApertura, crearApertura } from "./actions";

export const metadata = { title: "Aperturas · Pasteko" };

export default async function Portafolio({ searchParams }: { searchParams: Promise<{ error?: string; cerradas?: string }> }) {
  const { puedeEditar } = await requireAperturas();
  const f = await searchParams;
  const supabase = await createClient();
  const h = hoy();
  const [{ data: a }, { data: it }] = await Promise.all([
    supabase.from("aperturas").select(AP_COLS).order("fecha"),
    supabase.from("apertura_items").select(IT_COLS).order("orden").order("id"),
  ]);
  const aps = (a ?? []) as ApRow[];
  const items = (it ?? []) as ItemRow[];
  const deAp = (id: number) => items.filter((x) => x.apertura_id === id);

  const vistas = aps.filter((x) => x.modelo === "v2" && x.fecha_pago).map((x) => vistaApertura(x, deAp(x.id), h));
  const activas = vistas.filter((v) => !v.ap.cerrada).sort((x, y) => x.aperturaProyectada.localeCompare(y.aperturaProyectada));
  const cerradas = vistas.filter((v) => v.ap.cerrada);
  const anteriores = aps.filter((x) => x.modelo === "v1" || !x.fecha_pago);

  const enRiesgo = activas.filter((v) => v.riesgo > 0).length;
  const vencidos = activas.reduce((s, v) => s + v.vencidos, 0);
  const semana = activas.reduce((s, v) => s + v.filas.filter((r) => r.estado !== "hecho" && r.fin >= h && r.fin <= sumarDias(h, 7)).length, 0);

  return (
    <main className="wrap">
      <div className="head-row">
        <div>
          <p className="eyebrow">Aperturas de sucursales</p>
          <h1 className="page-h">Portafolio</h1>
        </div>
        {cerradas.length > 0 && (
          <Link className="btn small" href={f.cerradas ? "/aperturas" : "/aperturas?cerradas=1"}>
            {f.cerradas ? "Ocultar cerradas" : `Ver cerradas (${cerradas.length})`}
          </Link>
        )}
      </div>
      {f.error && <div className="note bad" style={{ marginBottom: 14 }}>{f.error}</div>}

      <div className="kpis">
        <div className="kpi"><span className="s">Aperturas en curso</span><span className="v">{activas.length}</span></div>
        <div className="kpi"><span className="s">En riesgo de retraso</span><span className="v" style={enRiesgo ? { color: "var(--bad)" } : undefined}>{enRiesgo}</span></div>
        <div className="kpi"><span className="s">Pasos vencidos</span><span className="v" style={vencidos ? { color: "var(--bad)" } : undefined}>{vencidos}</span></div>
        <div className="kpi"><span className="s">Vencen en 7 días</span><span className="v">{semana}</span></div>
      </div>

      {activas.length > 0 && <LineaTiempo vistas={activas} hoy={h} />}

      {activas.length ? (
        <div className="pf-grid">
          {activas.map((v) => <TarjetaApertura key={v.ap.id} v={v} hoy={h} />)}
        </div>
      ) : (
        <div className="card"><h3>Sin aperturas en curso</h3><p className="sub">{puedeEditar ? "Crea la primera abajo: el Gantt se arma solo a partir del pago de equipos." : "Cuando haya aperturas en curso aparecerán aquí."}</p></div>
      )}

      {f.cerradas && cerradas.length > 0 && (
        <>
          <h2 className="pf-h">Cerradas</h2>
          <div className="pf-grid">{cerradas.map((v) => <TarjetaApertura key={v.ap.id} v={v} hoy={h} />)}</div>
        </>
      )}

      {puedeEditar && (
        <details className="card pf-nueva" open={!activas.length}>
          <summary><b>+ Nueva apertura</b> <span className="sub">El Gantt arranca con el pago de equipos y se calcula solo.</span></summary>
          <form action={crearApertura} className="inline-form" style={{ marginTop: 12 }}>
            <label className="field w2">Sucursal<input name="nombre" required placeholder="Pasteko - Zinapécuaro" /></label>
            <label className="field">Tipo<select name="tipo" defaultValue="Franquicia"><option>Franquicia</option><option>Propia</option></select></label>
            <label className="field">Pago de equipos<input name="fecha_pago" type="date" required defaultValue={h} /></label>
            <label className="field">Días de obra<input name="dias_obra" type="number" min={1} max={365} defaultValue={31} /></label>
            <label className="field">Entrega del proveedor (días)<input name="dias_proveedor" type="number" min={1} max={180} defaultValue={30} /></label>
            <label className="inline-check"><input type="checkbox" name="lleva_bebidas" defaultChecked /> Lleva equipo de bebidas (máquina de hielos y licuadora)</label>
            <label className="field w2">Notas<input name="notas" placeholder="Opcional" /></label>
            <button className="btn primary" type="submit">Crear Gantt</button>
          </form>
        </details>
      )}

      {anteriores.length > 0 && (
        <section className="card" style={{ marginTop: 18 }}>
          <h3>Formato anterior</h3>
          <p className="sub">Estas aperturas se capturaron antes de las dependencias. {puedeEditar ? "Al convertirlas se conservan los pasos marcados como hechos." : ""}</p>
          {anteriores.map((x) => {
            const pagoViejo = deAp(x.id).find((i) => /pago/i.test(i.texto))?.fecha ?? "";
            return (
              <div key={x.id} className="pf-v1">
                <div><b>{x.nombre}</b><small>{x.tipo} · apertura suave {fechaCorta(x.fecha)}</small></div>
                {puedeEditar && (
                  <form action={convertirApertura} className="inline-form">
                    <input type="hidden" name="id" value={x.id} />
                    <label className="field">Pago de equipos<input name="fecha_pago" type="date" required defaultValue={pagoViejo} /></label>
                    <label className="inline-check"><input type="checkbox" name="lleva_bebidas" defaultChecked /> Lleva bebidas</label>
                    <button className="btn small" type="submit">Convertir</button>
                  </form>
                )}
              </div>
            );
          })}
        </section>
      )}
    </main>
  );
}

function TarjetaApertura({ v, hoy: h }: { v: Vista; hoy: string }) {
  const pct = v.total ? Math.round((v.hechos / v.total) * 100) : 0;
  const falta = diasEntre(h, v.aperturaProyectada);
  const sig = v.siguiente;
  return (
    <Link href={`/aperturas/${v.ap.id}`} className={`ap pf-card ${v.semaforo.clase}`}>
      <div className="pf-top">
        <b>{v.ap.nombre}</b>
        <span className={`pill ${v.semaforo.clase}`}>{v.semaforo.texto}</span>
      </div>
      <small>{v.ap.tipo}{v.ap.lleva_bebidas ? " · con bebidas" : ""}</small>
      <dl className="pf-fechas">
        <div><dt>Meta</dt><dd>{fechaCorta(v.meta)}</dd></div>
        <div><dt>Proyectada</dt><dd className={v.riesgo > 0 ? "bad" : undefined}>{fechaCorta(v.aperturaProyectada)}</dd></div>
        <div><dt>{falta >= 0 ? "Faltan" : "Abrió hace"}</dt><dd>{Math.abs(falta)} d</dd></div>
      </dl>
      <div className="bar"><i className={v.vencidos ? "bad" : ""} style={{ width: `${pct}%` }} /></div>
      <small className="num">{v.hechos} de {v.total} pasos · {pct}%{v.vencidos ? ` · ${v.vencidos} vencidos` : ""}{v.bloqueados ? ` · ${v.bloqueados} bloqueados` : ""}</small>
      {sig && !v.ap.cerrada && (
        <p className="pf-sig">
          <span>Sigue:</span> {sig.actividad.split(" · ")[0]} <small>· {sig.responsable}</small>{" "}
          <span className={`pill ${cuando(sig.fin, h).clase}`}>{cuando(sig.fin, h).texto}</span>
        </p>
      )}
    </Link>
  );
}

/** Todas las aperturas en una sola línea de tiempo: compras → obra → apertura suave. */
function LineaTiempo({ vistas, hoy: h }: { vistas: Vista[]; hoy: string }) {
  const ini = sumarDias(vistas.map((v) => v.cfg.fecha_pago).sort()[0], -3);
  const fin = sumarDias(vistas.map((v) => (v.aperturaProyectada > v.meta ? v.aperturaProyectada : v.meta)).sort().reverse()[0], 5);
  const total = Math.max(1, diasEntre(ini, fin));
  const x = (f: string) => `${Math.min(100, Math.max(0, (diasEntre(ini, f) / total) * 100))}%`;
  const meses: string[] = [];
  for (let m = `${ini.slice(0, 7)}-01`; m <= fin; m = sumarDias(m, 32).slice(0, 7) + "-01") if (m > ini) meses.push(m);
  const obra = (v: Vista) => v.filas.find((r) => r.clave === "obra");

  return (
    <section className="card pf-tl" aria-label="Línea de tiempo de aperturas">
      <div className="pf-tl-row pf-tl-scale">
        <span />
        <div className="pf-tl-track">
          {meses.map((m) => <span key={m} className="pf-mes" style={{ left: x(m) }}>{MESES[Number(m.slice(5, 7)) - 1]}</span>)}
        </div>
      </div>
      {vistas.map((v) => {
        const o = obra(v);
        return (
          <Link key={v.ap.id} href={`/aperturas/${v.ap.id}`} className="pf-tl-row">
            <span className="pf-tl-name">{v.ap.nombre.replace(/^Pasteko\s*-\s*/i, "")}</span>
            <div className="pf-tl-track">
              {meses.map((m) => <i key={m} className="pf-sep" style={{ left: x(m) }} />)}
              {o && <i className="pf-seg compra" style={{ left: x(v.cfg.fecha_pago), width: `calc(${x(o.inicio)} - ${x(v.cfg.fecha_pago)})` }} title="Pago a inicio de obra" />}
              {o && <i className="pf-seg obra" style={{ left: x(o.inicio), width: `calc(${x(o.fin)} - ${x(o.inicio)})` }} title={`Obra ${fechaCorta(o.inicio)} – ${fechaCorta(o.fin)}`} />}
              <i className="pf-meta" style={{ left: x(v.meta) }} title={`Meta ${fechaCorta(v.meta)}`} />
              <i className={`pf-ap ${v.semaforo.clase}`} style={{ left: x(v.aperturaProyectada) }} title={`Apertura proyectada ${fechaCorta(v.aperturaProyectada)}`} />
              {h >= ini && h <= fin && <i className="pf-hoy" style={{ left: x(h) }} />}
            </div>
          </Link>
        );
      })}
      <div className="tl-legend">
        <span><i className="pf-seg compra pf-leg" /> Proveedor y compras</span>
        <span><i className="pf-seg obra pf-leg" /> Obra</span>
        <span><i className="pf-ap ok pf-leg" /> Apertura suave proyectada</span>
        <span><i className="pf-meta pf-leg" /> Meta</span>
        <span><i className="pf-hoy pf-leg" /> Hoy</span>
      </div>
    </section>
  );
}
