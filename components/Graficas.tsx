/**
 * Gráficas del Resumen, en SVG/HTML puro (se dibujan en el servidor, sin librerías).
 */
import type { ReactNode } from "react";
import { mxn } from "@/lib/format";

export const PALETA = ["#fd7a0f", "#2f6fdb", "#0f8a7e", "#7a4fd6", "#c2337a", "#e8a317", "#5b6b7a", "#9a6b4f"];
export const corto = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(v >= 100000 ? 0 : 1)}k` : `$${Math.round(v)}`;

/** Línea pequeña de tendencia con área. */
export function Sparkline({ valores, color = "#fd7a0f", alto = 36 }: { valores: number[]; color?: string; alto?: number }) {
  const W = 120, H = alto, n = valores.length;
  if (n < 2) return null;
  const max = Math.max(...valores, 1), min = Math.min(...valores, 0);
  const x = (i: number) => (i / (n - 1)) * (W - 4) + 2;
  const y = (v: number) => H - 3 - ((v - min) / (max - min || 1)) * (H - 8);
  const pts = valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`2,${H} ${pts} ${W - 2},${H}`} fill={color} opacity=".16" />
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={x(n - 1)} cy={y(valores[n - 1])} r="3" fill={color} />
    </svg>
  );
}

/** Anillo de avance (0–100+). */
export function Anillo({ pct, color = "#fd7a0f", tam = 76, grosor = 9, children }: { pct: number; color?: string; tam?: number; grosor?: number; children?: ReactNode }) {
  const r = (tam - grosor) / 2, C = 2 * Math.PI * r, p = Math.max(0, Math.min(pct, 100));
  return (
    <div className="anillo" style={{ width: `${tam}px`, height: `${tam}px` }}>
      <svg width={tam} height={tam} viewBox={`0 0 ${tam} ${tam}`} aria-hidden="true">
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke="currentColor" strokeOpacity=".14" strokeWidth={grosor} />
        <circle cx={tam / 2} cy={tam / 2} r={r} fill="none" stroke={color} strokeWidth={grosor} strokeLinecap="round"
          strokeDasharray={`${(C * p) / 100} ${C}`} transform={`rotate(-90 ${tam / 2} ${tam / 2})`} />
      </svg>
      <span>{children}</span>
    </div>
  );
}

/** Dona con leyenda. */
export function Dona({ datos, centro, sub }: { datos: { nombre: string; valor: number; color: string; extra?: ReactNode }[]; centro: string; sub: string }) {
  const total = datos.reduce((s, d) => s + d.valor, 0);
  const R = 70, G = 22, C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="dona">
      <div className="dona-svg">
        <svg viewBox="0 0 180 180" role="img" aria-label={`Distribución: ${datos.map((d) => `${d.nombre} ${mxn(d.valor)}`).join(", ")}`}>
          <circle cx="90" cy="90" r={R} fill="none" stroke="currentColor" strokeOpacity=".08" strokeWidth={G} />
          {total > 0 && datos.filter((d) => d.valor > 0).map((d) => {
            const len = (d.valor / total) * C, gap = datos.length > 1 ? 2 : 0;
            const el = (
              <circle key={d.nombre} cx="90" cy="90" r={R} fill="none" stroke={d.color} strokeWidth={G}
                strokeDasharray={`${Math.max(0, len - gap)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 90 90)">
                <title>{`${d.nombre}: ${mxn(d.valor)} (${Math.round((d.valor / total) * 100)}%)`}</title>
              </circle>
            );
            acc += len;
            return el;
          })}
        </svg>
        <span className="dona-centro"><b>{centro}</b><small>{sub}</small></span>
      </div>
      <ul className="dona-ley">
        {datos.map((d) => (
          <li key={d.nombre}>
            <i style={{ background: d.color }} />
            <span className="n">{d.nombre}</span>
            <span className="p">{total ? Math.round((d.valor / total) * 100) : 0}%</span>
            <b className="v">{corto(d.valor)}</b>
            {d.extra && <span className="x">{d.extra}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Mapa de árbol (treemap) "squarified": el área de cada bloque es proporcional a su valor. */
export function Treemap({ datos }: { datos: { nombre: string; valor: number; color: string }[] }) {
  const items = datos.filter((d) => d.valor > 0).sort((a, b) => b.valor - a.valor);
  const total = items.reduce((s, d) => s + d.valor, 0);
  if (!total) return null;
  const W = 160, H = 100;
  const areas = items.map((d) => ({ d, a: (d.valor / total) * W * H }));
  const out: { d: (typeof items)[number]; x: number; y: number; w: number; h: number }[] = [];
  let rx = 0, ry = 0, rw = W, rh = H;
  const peor = (fila: number[], lado: number) => {
    const s = fila.reduce((m, n) => m + n, 0), mx = Math.max(...fila), mn = Math.min(...fila);
    return Math.max((lado * lado * mx) / (s * s), (s * s) / (lado * lado * mn));
  };
  const colocar = (fila: typeof areas) => {
    const s = fila.reduce((m, n) => m + n.a, 0);
    if (rw >= rh) {
      const w = s / rh; let yy = ry;
      fila.forEach((f) => { const h = f.a / w; out.push({ d: f.d, x: rx, y: yy, w, h }); yy += h; });
      rx += w; rw -= w;
    } else {
      const h = s / rw; let xx = rx;
      fila.forEach((f) => { const w = f.a / h; out.push({ d: f.d, x: xx, y: ry, w, h }); xx += w; });
      ry += h; rh -= h;
    }
  };
  let fila: typeof areas = [];
  for (let i = 0; i < areas.length;) {
    const lado = Math.min(rw, rh);
    const con = [...fila, areas[i]].map((f) => f.a);
    if (!fila.length || peor(con, lado) <= peor(fila.map((f) => f.a), lado)) { fila.push(areas[i]); i++; }
    else { colocar(fila); fila = []; }
  }
  if (fila.length) colocar(fila);
  return (
    <div className="treemap" role="img" aria-label={`Gasto por categoría: ${items.map((d) => `${d.nombre} ${mxn(d.valor)}`).join(", ")}`}>
      {out.map(({ d, x, y, w, h }) => {
        const chico = w * h < 900, mini = w < 22 || h < 16;
        return (
          <div key={d.nombre} className="tm" title={`${d.nombre}: ${mxn(d.valor)}`}
            style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`, width: `${(w / W) * 100}%`, height: `${(h / H) * 100}%`, background: d.color }}>
            {!mini && (
              <span>
                <b>{d.nombre}</b>
                {!chico && <em>{corto(d.valor)} · {Math.round((d.valor / total) * 100)}%</em>}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Columnas verticales con valor arriba y detalle abajo. */
export function Columnas({ datos, color = "#fd7a0f" }: { datos: { etiqueta: string; valor: number; arriba: string; abajo?: string }[]; color?: string }) {
  const max = Math.max(1, ...datos.map((d) => d.valor));
  return (
    <div className="cols" role="img" aria-label={datos.map((d) => `${d.etiqueta}: ${d.arriba}`).join(", ")}>
      {datos.map((d, i) => (
        <div key={d.etiqueta} className="col">
          <div className="col-area">
            <b className="col-v">{d.arriba}</b>
            <i style={{ height: `${Math.max(4, (d.valor / max) * 100)}%`, background: color, opacity: 1 - i * 0.08 }} />
          </div>
          <span className="col-n" title={d.etiqueta}>{d.etiqueta}</span>
          {d.abajo && <small className="col-s">{d.abajo}</small>}
        </div>
      ))}
    </div>
  );
}

/** Medidor de media luna (0–100%). */
export function Medidor({ pct, color }: { pct: number; color: string }) {
  const p = Math.max(0, Math.min(pct, 100)), R = 40, L = Math.PI * R;
  return (
    <svg className="medidor" viewBox="0 0 100 56" aria-hidden="true">
      <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="10" strokeLinecap="round" />
      <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${(L * p) / 100} ${L}`} />
    </svg>
  );
}
