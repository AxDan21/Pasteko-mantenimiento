"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState } from "react";
import BotonEnviar from "@/components/BotonEnviar";

export type EquipoPorValidar = {
  id: string; equipo: string; descripcion: string | null; marca: string | null; modelo: string | null; serie: string | null;
  registro: string | null; cuando: string; ficha: string | null; foto: string | null;
};

const num = new Intl.NumberFormat("es-MX");

/**
 * Cola de una sucursal: lista con selección múltiple y panel de revisión con la ficha en grande
 * junto a la serie registrada, para compararlas sin salir de la página.
 */
export default function ColaValidacion({ items, sucursal, volver, accion }: {
  items: EquipoPorValidar[];
  sucursal: string;
  volver: string;
  accion: (f: FormData) => Promise<void>;
}) {
  const [cursor, setCursor] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [verFoto, setVerFoto] = useState(false);

  // Al validar, el servidor devuelve la lista sin esos equipos: se reinicia en el primero.
  const claves = items.map((x) => x.id).join("|");
  useEffect(() => { setCursor(0); setSel(new Set()); setVerFoto(false); }, [claves]);

  const x = items[Math.min(cursor, items.length - 1)];
  const marcaModelo = (e: EquipoPorValidar) => [e.marca, e.modelo].filter(Boolean).join(" ") || "Sin marca";
  const todos = sel.size === items.length && items.length > 0;
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const abrir = (i: number) => {
    setCursor(i); setVerFoto(false);
    // En pantallas angostas el panel queda debajo de la lista: se lleva a la vista.
    if (window.matchMedia("(max-width: 1100px)").matches) {
      requestAnimationFrame(() => document.querySelector(".cv-rev")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  return (
    <div className="cv">
      <form action={accion} className="cv-lista">
        <input type="hidden" name="volver" value={volver} />
        <div className="cv-acc">
          <button type="button" className="btn small" onClick={() => setSel(todos ? new Set() : new Set(items.map((e) => e.id)))}>
            {todos ? "Quitar selección" : "Seleccionar todos"}
          </button>
        </div>
        <ul className="cv-items">
          {items.map((e, i) => (
            <li key={e.id} className="cv-item" aria-current={e.id === x?.id ? "true" : undefined}>
              <input type="checkbox" name="id" value={e.id} className="sel-chk" checked={sel.has(e.id)} onChange={() => alternar(e.id)} aria-label={`Seleccionar ${e.id}`} />
              <button type="button" className="cv-abrir" onClick={() => abrir(i)} aria-label={`Revisar ${e.id}`}>
                <span className="cv-thumb">{e.ficha ? <img src={e.ficha} alt="" loading="lazy" /> : <span>Sin ficha</span>}</span>
                <span className="cv-t">
                  <b className="num">{e.id}</b>
                  <small className="cv-un">{e.descripcion || e.equipo} · {marcaModelo(e)}</small>
                  <small className="cv-serie">Serie <span className="num">{e.serie || "sin serie"}</span></small>
                </span>
                {e.ficha ? <span className="pill neutral">{e.cuando}</span> : <span className="pill bad">Sin ficha</span>}
              </button>
            </li>
          ))}
        </ul>
        <div className="cv-barra">
          <span>{sel.size ? `${num.format(sel.size)} de ${num.format(items.length)} ${sel.size === 1 ? "seleccionado" : "seleccionados"} en ${sucursal}` : "Ninguno seleccionado"}</span>
          {sel.size > 0 ? <BotonEnviar texto={`Validar ${num.format(sel.size)}`} /> : <button type="button" className="btn primary" disabled>Validar seleccionados</button>}
        </div>
      </form>

      {x && (
        <aside className="cv-rev" aria-label={`Revisión de ${x.id}`}>
          <div>
            <p className="eyebrow">{sucursal} · {num.format(cursor + 1)} de {num.format(items.length)}</p>
            <h3 className="num cv-id">{x.id}</h3>
            <p className="sub" style={{ margin: 0 }}>{x.descripcion || x.equipo}</p>
          </div>
          <div className="cv-big">
            {verFoto && x.foto ? (
              <a href={x.foto} target="_blank" rel="noopener noreferrer"><img src={x.foto} alt={`Foto del equipo ${x.id}`} /></a>
            ) : x.ficha ? (
              <a href={x.ficha} target="_blank" rel="noopener noreferrer"><img src={x.ficha} alt={`Ficha técnica de ${x.id}`} /></a>
            ) : <span>El supervisor no subió la ficha técnica</span>}
          </div>
          {(x.ficha || x.foto) && (
            <div className="cv-fotos" role="group" aria-label="Imagen">
              {x.ficha && <button type="button" aria-pressed={!verFoto} onClick={() => setVerFoto(false)}><img src={x.ficha} alt="" />Ficha</button>}
              {x.foto && <button type="button" aria-pressed={verFoto} onClick={() => setVerFoto(true)}><img src={x.foto} alt="" />Equipo</button>}
            </div>
          )}
          <dl className="cv-cmp">
            <dt>Serie registrada</dt><dd>{x.serie ? <span className="cv-s">{x.serie}</span> : "Sin serie: pídela al supervisor"}</dd>
            <dt>Marca y modelo</dt><dd>{marcaModelo(x)}</dd>
            <dt>Registró</dt><dd>{x.registro ?? "Un usuario eliminado"} · {x.cuando.toLowerCase()}</dd>
          </dl>
          <p className="sub" style={{ margin: 0 }}>{x.ficha ? "Compara la serie resaltada con la de la placa." : "Sin ficha no se puede comparar la serie: pide la foto al supervisor."}</p>
          <div className="cv-btns">
            <form action={accion}>
              <input type="hidden" name="volver" value={volver} />
              <input type="hidden" name="id" value={x.id} />
              {x.ficha ? <BotonEnviar texto="Validar y seguir →" /> : <button type="button" className="btn primary" disabled>Validar y seguir →</button>}
            </form>
            {items.length > 1 && <button type="button" className="btn" onClick={() => abrir((cursor + 1) % items.length)}>Saltar</button>}
            <Link className="btn" href={`/admin/activos/${encodeURIComponent(x.id)}`}>Editar equipo</Link>
          </div>
        </aside>
      )}
    </div>
  );
}
