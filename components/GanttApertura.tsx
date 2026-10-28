"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { guardarGantt } from "@/app/admin/acciones-modulos";
import { fechaExcel, tablaExcel, type FilaGantt } from "@/lib/gantt";
import { diasEntre, fCorta, MESES, sumarDias } from "@/lib/panel";

type Props = {
  apertura: { id: number; nombre: string; fecha: string; tipo: string };
  filas: FilaGantt[];
  hoy: string;
};

type Fila = FilaGantt & { key: string };
let n = 0;
const conKey = (f: FilaGantt): Fila => ({ ...f, key: `f${n++}` });

function estado(r: FilaGantt, hoy: string) {
  if (r.hecho) return { t: "Hecho", c: "ok" };
  if (!r.fecha) return { t: "No aplica", c: "neutral" };
  const d = diasEntre(hoy, r.fecha);
  if (d < 0) return { t: `Vencido ${-d} d`, c: "bad" };
  if (d <= 7) return { t: d === 0 ? "Hoy" : `En ${d} d`, c: "warn" };
  return { t: "Pendiente", c: "neutral" };
}

export default function GanttApertura({
  apertura,
  filas: inicial,
  hoy,
}: Props) {
  const router = useRouter();
  const [nombre, setNombre] = useState(apertura.nombre);
  const [fecha, setFecha] = useState(apertura.fecha);
  const [tipo, setTipo] = useState(apertura.tipo);
  const [mover, setMover] = useState(true);
  const [filas, setFilas] = useState<Fila[]>(() => inicial.map(conKey));
  const [sucio, setSucio] = useState(false);
  const [msg, setMsg] = useState<{ t: string; c: string } | null>(null);
  const [copia, setCopia] = useState<"" | "ok" | "manual">("");
  const [guardando, start] = useTransition();

  const cambiar = (key: string, campo: keyof FilaGantt, valor: unknown) => {
    setFilas((p) =>
      p.map((r) => (r.key === key ? { ...r, [campo]: valor } : r)),
    );
    setSucio(true);
  };
  const mueve = (i: number, d: number) => {
    setFilas((p) => {
      const j = i + d;
      if (j < 0 || j >= p.length) return p;
      const c = p.slice();
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    setSucio(true);
  };

  function cambiarApertura(v: string) {
    if (mover && fecha && v) {
      const delta = diasEntre(fecha, v);
      setFilas((p) =>
        p.map((r) =>
          r.fecha ? { ...r, fecha: sumarDias(r.fecha, delta) } : r,
        ),
      );
    }
    setFecha(v);
    setSucio(true);
  }

  function guardar() {
    setMsg(null);
    start(async () => {
      const r = await guardarGantt({
        id: apertura.id,
        nombre,
        fecha,
        tipo,
        filas: filas.map(({ key: _k, ...f }) => f),
      });
      if (r.ok) {
        setSucio(false);
        setMsg({ t: "Gantt guardado.", c: "ok" });
        router.refresh();
      } else setMsg({ t: r.error ?? "No se pudo guardar.", c: "bad" });
    });
  }

  const texto = tablaExcel(nombre, filas);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopia("ok");
      setTimeout(() => setCopia(""), 2500);
    } catch {
      setCopia("manual");
    }
  }
  function descargar() {
    const csv =
      "﻿" +
      texto
        .split("\n")
        .map((l) =>
          l
            .split("\t")
            .map((c) => (/[",]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c))
            .join(","),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `gantt-${nombre.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Línea de tiempo
  const { ini, total, semanas } = useMemo(() => {
    const fechas = [
      fecha,
      hoy,
      ...filas.map((r) => r.fecha).filter((x): x is string => !!x),
    ].sort();
    const a = sumarDias(fechas[0], -2),
      b = sumarDias(fechas[fechas.length - 1], 2);
    const t = Math.max(diasEntre(a, b), 1);
    const s: { pos: number; etiqueta: string }[] = [];
    for (let d = 0; d <= t; d += 7) {
      const f = sumarDias(a, d);
      s.push({
        pos: (d / t) * 100,
        etiqueta: `${Number(f.slice(8))} ${MESES[Number(f.slice(5, 7)) - 1]}`,
      });
    }
    return { ini: a, total: t, semanas: s };
  }, [filas, fecha, hoy]);
  const pos = (f: string) => (diasEntre(ini, f) / total) * 100;

  const hechos = filas.filter((r) => r.hecho).length;
  const aplica = filas.filter((r) => r.fecha || r.hecho).length;
  const vencidos = filas.filter((r) => estado(r, hoy).c === "bad").length;
  const misPasos = filas.filter(
    (r) => /mtto|manten/i.test(r.responsable) && !r.hecho,
  ).length;

  return (
    <section className="card gantt">
      <div className="gantt-head">
        <label className="field" style={{ flex: "2 1 240px" }}>
          Nombre de la sucursal
          <input
            id="g-nombre"
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value);
              setSucio(true);
            }}
          />
        </label>
        <label className="field" style={{ flex: "1 1 150px" }}>
          Apertura suave
          <input
            id="g-fecha"
            type="date"
            value={fecha}
            onChange={(e) => cambiarApertura(e.target.value)}
          />
        </label>
        <label className="field" style={{ flex: "1 1 130px" }}>
          Tipo
          <select
            id="g-tipo"
            value={tipo}
            onChange={(e) => {
              setTipo(e.target.value);
              setSucio(true);
            }}
          >
            <option>Franquicia</option>
            <option>Propia</option>
          </select>
        </label>
        <label className="mover">
          <input
            type="checkbox"
            checked={mover}
            onChange={(e) => setMover(e.target.checked)}
          />{" "}
          Mover todas las fechas al cambiar la apertura
        </label>
      </div>

      <div className="gantt-kpis">
        <span>
          <b className="num">
            {hechos}/{aplica}
          </b>{" "}
          pasos listos
        </span>
        <span className={vencidos ? "bad" : ""}>
          <b className="num">{vencidos}</b> vencidos
        </span>
        <span>
          <b className="num">{misPasos}</b> pendientes de Mantenimiento
        </span>
        <span>
          Faltan <b className="num">{Math.max(diasEntre(hoy, fecha), 0)}</b>{" "}
          días para la apertura suave
        </span>
      </div>

      <div className="tbl-wrap">
        <table className="gantt-tbl">
          <thead>
            <tr>
              <th style={{ width: 52 }}>Paso</th>
              <th>Actividad</th>
              <th style={{ width: 170 }}>Responsable</th>
              <th style={{ width: 150 }}>Entrega</th>
              <th style={{ width: 120 }}>Estado</th>
              <th className="tl-th">
                <div className="tl-scale">
                  {semanas.map((s) => (
                    <span key={s.pos} style={{ left: `${s.pos}%` }}>
                      {s.etiqueta}
                    </span>
                  ))}
                </div>
              </th>
              <th style={{ width: 92 }} />
            </tr>
          </thead>
          <tbody>
            {filas.map((r, i) => {
              const e = estado(r, hoy);
              const mtto = /mtto|manten/i.test(r.responsable);
              return (
                <tr
                  key={r.key}
                  className={`${r.hito ? `hito-${r.hito}` : ""} ${r.hecho ? "is-done" : ""}`}
                >
                  <td className="num" style={{ textAlign: "center" }}>
                    <label className="chk" title="Marcar como hecho">
                      <input
                        type="checkbox"
                        checked={r.hecho}
                        onChange={(ev) =>
                          cambiar(r.key, "hecho", ev.target.checked)
                        }
                        aria-label={`Paso ${i + 1} hecho`}
                      />
                      <span>{i + 1}</span>
                    </label>
                  </td>
                  <td>
                    <textarea
                      className="cell"
                      rows={1}
                      value={r.actividad}
                      onChange={(ev) =>
                        cambiar(r.key, "actividad", ev.target.value)
                      }
                      aria-label={`Actividad del paso ${i + 1}`}
                    />
                  </td>
                  <td>
                    <input
                      className="cell"
                      value={r.responsable}
                      onChange={(ev) =>
                        cambiar(r.key, "responsable", ev.target.value)
                      }
                      aria-label={`Responsable del paso ${i + 1}`}
                    />
                    {mtto && (
                      <span className="pill warn" style={{ marginTop: 4 }}>
                        Mtto
                      </span>
                    )}
                  </td>
                  <td>
                    {r.fecha !== null ? (
                      <input
                        className="cell"
                        type="date"
                        value={r.fecha}
                        onChange={(ev) =>
                          cambiar(r.key, "fecha", ev.target.value || null)
                        }
                        aria-label={`Fecha del paso ${i + 1}`}
                      />
                    ) : (
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => cambiar(r.key, "fecha", fecha)}
                      >
                        No aplica · poner fecha
                      </button>
                    )}
                    {r.fecha !== null && (
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => cambiar(r.key, "fecha", null)}
                      >
                        No aplica
                      </button>
                    )}
                  </td>
                  <td>
                    <span className={`pill ${e.c}`}>{e.t}</span>
                  </td>
                  <td className="tl-cell">
                    <div className="tl-track">
                      {semanas.map((s) => (
                        <i
                          key={s.pos}
                          className="tl-week"
                          style={{ left: `${s.pos}%` }}
                        />
                      ))}
                      <i
                        className="tl-today"
                        style={{ left: `${pos(hoy)}%` }}
                        title={`Hoy ${fCorta(hoy)}`}
                      />
                      <i
                        className="tl-open"
                        style={{ left: `${pos(fecha)}%` }}
                        title={`Apertura suave ${fCorta(fecha)}`}
                      />
                      {r.fecha && (
                        <b
                          className={`tl-dot ${e.c} ${r.hito ? "diamond" : ""}`}
                          style={{ left: `${pos(r.fecha)}%` }}
                          title={`${r.actividad}: ${fechaExcel(r.fecha)}`}
                        />
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="row-tools">
                      <button
                        type="button"
                        onClick={() => mueve(i, -1)}
                        aria-label="Subir paso"
                        disabled={i === 0}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => mueve(i, 1)}
                        aria-label="Bajar paso"
                        disabled={i === filas.length - 1}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          cambiar(r.key, "hito", r.hito ? null : "verde")
                        }
                        aria-label="Marcar como hito"
                        title="Hito"
                      >
                        ◆
                      </button>
                      <button
                        type="button"
                        className="danger"
                        onClick={() => {
                          setFilas((p) => p.filter((x) => x.key !== r.key));
                          setSucio(true);
                        }}
                        aria-label="Borrar paso"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="tl-legend">
        <span>
          <i className="tl-today" /> Hoy
        </span>
        <span>
          <i className="tl-open" /> Apertura suave
        </span>
        <span>
          <b className="tl-dot diamond neutral" /> Hito
        </span>
      </div>

      <div className="gantt-actions">
        <button
          type="button"
          className="btn"
          onClick={() => {
            setFilas((p) => [
              ...p,
              conKey({
                actividad: "",
                responsable: "",
                fecha,
                hecho: false,
                hito: null,
              }),
            ]);
            setSucio(true);
          }}
        >
          + Agregar paso
        </button>
        <span style={{ flex: 1 }} />
        <button type="button" className="btn" onClick={copiar}>
          {copia === "ok" ? "Copiado. Pégalo en Excel" : "Copiar para Excel"}
        </button>
        <button type="button" className="btn" onClick={descargar}>
          Descargar CSV
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={guardar}
          disabled={guardando || !sucio}
        >
          {guardando ? "Guardando…" : sucio ? "Guardar cambios" : "Guardado"}
        </button>
      </div>
      {msg && (
        <div className={`note ${msg.c}`} style={{ marginTop: 10 }}>
          {msg.t}
        </div>
      )}
      {copia === "manual" && (
        <textarea
          className="input num"
          rows={8}
          readOnly
          value={texto}
          onFocus={(e) => e.currentTarget.select()}
          style={{ marginTop: 10 }}
        />
      )}
    </section>
  );
}
