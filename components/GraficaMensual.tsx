import { mxn } from "@/lib/format";

/** Barras de gasto mensual contra una línea de presupuesto (SVG, sin librerías). */
export default function GraficaMensual({ datos, presupuesto }: { datos: { etiqueta: string; valor: number; parcial?: boolean }[]; presupuesto: number }) {
  const W = 560, H = 240, pl = 52, pr = 12, pt = 18, pb = 30;
  const maxDato = Math.max(presupuesto, ...datos.map((d) => d.valor), 1);
  const paso = maxDato > 150000 ? 50000 : maxDato > 60000 ? 30000 : maxDato > 20000 ? 10000 : 5000;
  const max = Math.ceil((maxDato * 1.1) / paso) * paso;
  const y = (v: number) => pt + (H - pt - pb) * (1 - v / max);
  const bw = (W - pl - pr) / Math.max(datos.length, 1);
  const ticks = Array.from({ length: Math.floor(max / paso) + 1 }, (_, i) => i * paso);
  const k = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : String(v));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Gasto mensual contra presupuesto">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pl} x2={W - pr} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={pl - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--muted)">{k(t)}</text>
          </g>
        ))}
        {datos.map((d, i) => {
          const x = pl + i * bw + bw * 0.2, w = bw * 0.6, over = d.valor > presupuesto;
          return (
            <g key={d.etiqueta + i}>
              <rect x={x} y={y(d.valor)} width={w} height={Math.max(0, y(0) - y(d.valor))} rx="4" fill={over ? "var(--bad)" : "var(--orange)"} opacity={d.parcial ? 0.7 : 1}>
                <title>{`${d.etiqueta}: ${mxn(d.valor)}`}</title>
              </rect>
              <text x={x + w / 2} y={H - 10} textAnchor="middle" fontSize="12" fill="var(--muted)">{d.etiqueta}</text>
              {d.valor > 0 && <text x={x + w / 2} y={y(d.valor) - 6} textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--ink)">{k(Math.round(d.valor))}</text>}
            </g>
          );
        })}
        <line x1={pl} x2={W - pr} y1={y(presupuesto)} y2={y(presupuesto)} stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="5 4" />
      </svg>
      <div className="legend">
        <span><i style={{ background: "var(--orange)" }} />Dentro de presupuesto</span>
        <span><i style={{ background: "var(--bad)" }} />Excedido</span>
        <span><i style={{ background: "transparent", borderTop: "2px dashed var(--ink)", height: 0, borderRadius: 0 }} />Presupuesto {mxn(presupuesto)}</span>
      </div>
    </div>
  );
}
