import { mxn } from "@/lib/format";

/** Barras apiladas por mes: preventivo (naranja) y correctivo/otros (tinta). Muestra el % preventivo arriba. */
export default function GraficaTipo({ datos }: { datos: { etiqueta: string; preventivo: number; otros: number; actual?: boolean }[] }) {
  const W = 420, H = 250, pl = 8, pr = 8, pt = 22, pb = 26;
  const max = Math.max(1, ...datos.map((d) => d.preventivo + d.otros));
  const bw = (W - pl - pr) / Math.max(datos.length, 1);
  const alto = (v: number) => ((H - pt - pb) * v) / max;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Preventivo contra correctivo por mes">
      {datos.map((d, i) => {
        const x = pl + i * bw + bw * 0.22, w = bw * 0.56, base = H - pb;
        const hp = alto(d.preventivo), ho = alto(d.otros), tot = d.preventivo + d.otros;
        const pct = tot ? Math.round((d.preventivo / tot) * 100) : 0;
        return (
          <g key={d.etiqueta + i} opacity={d.actual ? 1 : 0.92}>
            <rect x={x} y={base - ho - hp} width={w} height={ho} rx="3" fill="var(--ink)" opacity=".82"><title>{`${d.etiqueta} · correctivo y otros: ${mxn(d.otros)}`}</title></rect>
            <rect x={x} y={base - hp} width={w} height={hp} rx="3" fill="var(--orange)"><title>{`${d.etiqueta} · preventivo: ${mxn(d.preventivo)}`}</title></rect>
            {tot > 0 && <text x={x + w / 2} y={base - ho - hp - 6} textAnchor="middle" fontSize="11" fontWeight="800" fill={pct >= 30 ? "var(--ok)" : "var(--muted)"}>{pct}%</text>}
            <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize="12" fontWeight={d.actual ? 800 : 400} fill={d.actual ? "var(--ink)" : "var(--muted)"}>{d.etiqueta}</text>
          </g>
        );
      })}
    </svg>
  );
}
