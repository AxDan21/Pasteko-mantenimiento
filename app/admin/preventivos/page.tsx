import Link from "next/link";
import BotonConfirmar from "@/components/BotonConfirmar";
import BuscarEnLista from "@/components/BuscarEnLista";
import Desplegable from "@/components/Desplegable";
import IconoUI from "@/components/IconoUI";
import { Estado } from "@/components/Insignias";
import Kpi from "@/components/Kpi";
import Seccion from "@/components/Seccion";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { diasEntre, estadoPreventivo, fCorta, hoy, nombreMes, rangoFechas, sumarDias } from "@/lib/panel";
import { vistasPreventivos } from "@/lib/secciones";
import type { Activo, Preventivo } from "@/lib/types";
import { actualizarPreventivo, borrarPreventivo, crearPreventivos } from "../acciones-modulos";

type F = { vista?: string; mes?: string; zona?: string; tecnico?: string; estado?: string; ok?: string; error?: string };
const ESTADOS = ["Vencido", "Programado", "Hecho"] as const;

export default async function Preventivos({ searchParams }: { searchParams: Promise<F> }) {
  await requireAdmin();
  const f = await searchParams;
  const supabase = await createClient();
  const h = hoy();
  const conMes = !!f.mes && /^\d{4}-\d{2}$/.test(f.mes);

  let q = supabase.from("preventivos").select("*").order("fecha");
  if (conMes) {
    const [ini, fin] = rangoFechas(f.mes!);
    q = q.gte("fecha", ini).lt("fecha", fin);
  } else {
    q = q.eq("hecho", false).lte("fecha", sumarDias(h, 90)); // vencidos + próximos 90 días
  }
  if (f.tecnico) q = q.eq("tecnico_id", f.tecnico);

  const [{ data: p, error }, { data: suc }, { data: eqs }, { data: act }, { data: tec }, { data: prov }, vistas] = await Promise.all([
    q,
    supabase.from("sucursales").select("id, nombre, zona").order("zona").order("nombre"),
    supabase.from("equipos").select("nombre").eq("vigente", true).order("orden"),
    supabase.from("activos").select("id, sucursal_id, equipo").eq("activo", true).order("id"),
    supabase.from("perfiles").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
    vistasPreventivos(supabase),
  ]);
  const sucursales = (suc ?? []) as { id: number; nombre: string; zona: string }[];
  const sucPorId = new Map(sucursales.map((s) => [s.id, s]));
  const tecPorId = new Map((tec ?? []).map((t) => [t.id as string, t.nombre as string]));
  const provPorId = new Map((prov ?? []).map((t) => [t.id as number, t.nombre as string]));
  const zonas = Array.from(new Set(sucursales.map((s) => s.zona)));

  let filas = (p ?? []) as Preventivo[];
  if (f.zona) filas = filas.filter((x) => sucPorId.get(x.sucursal_id)?.zona === f.zona);
  const base = filas;
  if (f.estado) filas = filas.filter((x) => estadoPreventivo(x, h).texto === f.estado);
  const vencidos = base.filter((x) => estadoPreventivo(x, h).texto === "Vencido");
  const semana = base.filter((x) => !x.hecho && x.fecha >= h && x.fecha <= sumarDias(h, 7)).length;
  const sinAsignar = base.filter((x) => !x.hecho && !x.tecnico_id && !x.proveedor_id).length;
  const hechos = base.filter((x) => x.hecho).length;

  // Enlaces que conservan los filtros que no se cambian
  const url = (cambios: Partial<F>) => {
    const q2 = new URLSearchParams(Object.entries({ mes: f.mes, zona: f.zona, tecnico: f.tecnico, estado: f.estado, ...cambios }).filter(([, v]) => v) as [string, string][]);
    const s = q2.toString();
    return s ? `/admin/preventivos?${s}` : "/admin/preventivos";
  };
  const asignado = (x: Preventivo) => (x.tecnico_id ? tecPorId.get(x.tecnico_id) : x.proveedor_id ? provPorId.get(x.proveedor_id) : null);

  return (
    <main className="wrap prv">
      <Seccion
        titulo="Preventivos"
        sub="Mantenimientos programados por fecha. El técnico asignado los ve al crear su hoja; al enviarla, el preventivo queda hecho y ligado a la hoja."
        vistas={vistas}
        activa="lista"
        acciones={<Link className="btn" href="/admin/preventivos/plan"><IconoUI nombre="sucursales" tam={16} />Plan de salidas</Link>}
      />

      {f.ok && <div className="note ok prv-nota" role="status">Se programaron {f.ok} preventivo{f.ok === "1" ? "" : "s"}.</div>}
      {f.error && <div className="note bad prv-nota" role="alert">{f.error === "datos" ? "Llena fecha, sucursal, equipo y tarea." : `No se pudo guardar: ${f.error}`}</div>}

      <div className="rz-kpis srv-kpis">
        <Kpi href={url({ estado: "Vencido" })} icono="reloj" tono="bad" titulo="Vencidos" valor={vencidos.length} alerta={vencidos.length > 0}
          detalle={vencidos.length ? `el más antiguo hace ${diasEntre(vencidos[0].fecha, h)} días` : "Nada vencido"} />
        <Kpi icono="preventivos" tono="info" titulo="Próximos 7 días" valor={semana} detalle={semana ? "por hacer esta semana" : "Semana sin preventivos"} />
        <Kpi icono="personas" tono="warn" titulo="Sin asignar" valor={sinAsignar} detalle={sinAsignar ? "sin técnico ni proveedor" : "Todos tienen responsable"} />
        <Kpi icono="escudo" tono="ok" titulo={conMes ? `Hechos en ${nombreMes(f.mes!)}` : "En la lista"}
          valor={conMes ? <>{hechos}<small> de {base.length}</small></> : base.length}
          detalle={conMes ? "del programa del mes" : "vencidos y próximos 90 días"} />
      </div>

      <Desplegable id="nuevo" titulo="Programar preventivo" abierto={!!f.error}
        detalle="Con «Repetir» creas de una vez todo el calendario del equipo (hasta 24 fechas).">
        <form action={crearPreventivos} className="prv-form">
          <fieldset>
            <legend>Qué y dónde</legend>
            <label className="field">Sucursal
              <select name="sucursal_id" required defaultValue="">
                <option value="" disabled>Elige</option>
                {zonas.map((z) => (
                  <optgroup key={z} label={z}>{sucursales.filter((s) => s.zona === z).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</optgroup>
                ))}
              </select>
            </label>
            <label className="field">Equipo
              <select name="equipo" required defaultValue="">
                <option value="" disabled>Elige</option>
                {(eqs ?? []).map((e) => <option key={e.nombre as string}>{e.nombre as string}</option>)}
                <option>Instalación eléctrica</option><option>Instalación hidráulica</option><option>Gas</option>
              </select>
            </label>
            <label className="field">Equipo con código (opcional)
              <select name="activo_id" defaultValue="">
                <option value="">Sin código</option>
                {((act ?? []) as Pick<Activo, "id" | "sucursal_id" | "equipo">[]).map((x) => <option key={x.id} value={x.id}>{x.id} · {sucPorId.get(x.sucursal_id)?.nombre}</option>)}
              </select>
            </label>
            <label className="field prv-ancho">Tarea<input name="tarea" required placeholder="Ej. Descalcificación" /></label>
          </fieldset>
          <fieldset>
            <legend>Cuándo y quién</legend>
            <label className="field">Primera fecha<input name="fecha" type="date" required defaultValue={sumarDias(h, 7)} /></label>
            <label className="field">Repetir
              <select name="cada_meses" defaultValue="0">
                <option value="0">Una sola vez</option>
                <option value="1">Cada mes</option>
                <option value="2">Cada 2 meses</option>
                <option value="3">Cada 3 meses</option>
                <option value="6">Cada 6 meses</option>
                <option value="12">Cada año</option>
              </select>
            </label>
            <label className="field">Veces<input name="veces" type="number" min={1} max={24} defaultValue={6} /><span className="ayuda">Solo si se repite</span></label>
            <label className="field">Técnico
              <select name="tecnico_id" defaultValue="">
                <option value="">Sin asignar</option>
                {(tec ?? []).map((t) => <option key={t.id as string} value={t.id as string}>{t.nombre as string}</option>)}
              </select>
            </label>
            <label className="field">Proveedor externo
              <select name="proveedor_id" defaultValue="">
                <option value="">Ninguno</option>
                {(prov ?? []).map((t) => <option key={t.id as number} value={t.id as number}>{t.nombre as string}</option>)}
              </select>
            </label>
          </fieldset>
          <div className="prv-form-pie"><button className="btn primary" type="submit">Programar</button></div>
        </form>
      </Desplegable>

      {/* La zona se elige en la barra superior; aquí se conserva para no perderla al filtrar. */}
      <div className="prv-barra">
        <nav className="tkb-filtros" aria-label="Estado">
          <Link href={url({ estado: undefined })} aria-current={!f.estado ? "page" : undefined}>Todos<span className="srv-n">{base.length}</span></Link>
          {ESTADOS.map((e) => (
            <Link key={e} href={url({ estado: e })} aria-current={f.estado === e ? "page" : undefined}>
              {e === "Vencido" ? "Vencidos" : e === "Programado" ? "Programados" : "Hechos"}
              {e === "Vencido" && vencidos.length > 0 && <span className="srv-n">{vencidos.length}</span>}
            </Link>
          ))}
        </nav>
        <form className="prv-filtros" method="get">
          {f.zona && <input type="hidden" name="zona" value={f.zona} />}
          {f.estado && <input type="hidden" name="estado" value={f.estado} />}
          <label className="field">Mes<input name="mes" type="month" defaultValue={f.mes ?? ""} /><span className="ayuda">Vacío: vencidos y próximos 90 días</span></label>
          <label className="field">Técnico
            <select name="tecnico" defaultValue={f.tecnico ?? ""}><option value="">Todos</option>{(tec ?? []).map((t) => <option key={t.id as string} value={t.id as string}>{t.nombre as string}</option>)}</select>
          </label>
          <button className="btn" type="submit">Aplicar</button>
          {(f.mes || f.tecnico) && <Link className="btn ghost" href={url({ mes: undefined, tecnico: undefined })}>Quitar</Link>}
        </form>
      </div>
      {f.estado === "Hecho" && !conMes && <p className="sub prv-aviso">Sin mes elegido solo se listan pendientes. Elige un mes para ver los hechos.</p>}

      {error ? (
        <div className="ui-error"><b>No se pudieron cargar los preventivos</b><p>Esto no significa que no haya. Recarga la página para intentarlo de nuevo.</p></div>
      ) : filas.length ? (
        <>
          <div className="prv-buscar"><BuscarEnLista key={`${f.estado}-${f.mes}`} objetivo="prv-filas" placeholder="Sucursal, equipo, tarea o técnico" etiqueta="Buscar preventivos" /></div>
          <div className="tbl-wrap">
            <table className="tbl-cards">
              <thead><tr><th>Fecha</th><th>Sucursal</th><th>Equipo y tarea</th><th>Responsable</th><th>Estado</th><th>Reprogramar</th><th><span className="sr-only">Acciones</span></th></tr></thead>
              <tbody id="prv-filas">
                {filas.map((x) => {
                  const e = estadoPreventivo(x, h), s = sucPorId.get(x.sucursal_id), quien = asignado(x);
                  return (
                    <tr key={x.id} className={e.clase === "bad" ? "prv-venc" : undefined} data-buscar={`${s?.nombre ?? ""} ${s?.zona ?? ""} ${x.equipo} ${x.activo_id ?? ""} ${x.tarea} ${quien ?? "sin asignar"} ${e.texto}`}>
                      <td data-label="Fecha" className="num">
                        <b>{fCorta(x.fecha)}</b>
                        {!x.hecho && <small className={`srv-sub${e.clase === "bad" ? " rz-mal" : ""}`}>{x.fecha < h ? `hace ${diasEntre(x.fecha, h)} días` : x.fecha === h ? "hoy" : `en ${diasEntre(h, x.fecha)} días`}</small>}
                      </td>
                      <td data-label="Sucursal"><b>{s?.nombre}</b><small className="srv-sub">{s?.zona}</small></td>
                      <td data-label="Equipo y tarea">{x.equipo}{x.activo_id && <Link className="num prv-cod" href={`/admin/activos/${x.activo_id}`}>{x.activo_id}</Link>}<small className="srv-sub">{x.tarea}</small></td>
                      <td data-label="Responsable">{quien ?? <b className="srv-sin">Sin asignar</b>}</td>
                      <td data-label="Estado">
                        <Estado tono={e.clase}>{e.texto}</Estado>
                        {x.hoja_id && <Link className="prv-hoja" href={`/admin/hojas/${x.hoja_id}`}>Ver hoja</Link>}
                      </td>
                      <td data-label="Reprogramar">
                        {!x.hecho ? (
                          <form action={actualizarPreventivo} className="prv-mover">
                            <input type="hidden" name="id" value={x.id} />
                            <input name="fecha" type="date" defaultValue={x.fecha} aria-label={`Nueva fecha para ${x.tarea} en ${s?.nombre ?? "la sucursal"}`} className="mini-input" />
                            <button className="btn small" type="submit">Mover</button>
                          </form>
                        ) : <span className="sub">—</span>}
                      </td>
                      <td className="prv-acc">
                        <form action={actualizarPreventivo}>
                          <input type="hidden" name="id" value={x.id} />
                          <input type="hidden" name="hecho" value={String(!x.hecho)} />
                          <button className="btn small" type="submit">{x.hecho ? "Reabrir" : <><IconoUI nombre="check" tam={14} grosor={2.4} />Marcar hecho</>}</button>
                        </form>
                        <form action={borrarPreventivo}>
                          <input type="hidden" name="id" value={x.id} />
                          <BotonConfirmar mensaje={`¿Borrar el preventivo "${x.tarea}" de ${s?.nombre ?? "la sucursal"} del ${fCorta(x.fecha)}? No se puede deshacer.`}>Borrar</BotonConfirmar>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="ui-vacio">
          <b>Sin preventivos con estos filtros</b>
          <p>Programa uno con «Programar preventivo». Con «Repetir» puedes crear todo el calendario del año de una vez.</p>
          <a className="btn small primary" href="#nuevo">Programar preventivo</a>
        </div>
      )}
    </main>
  );
}
