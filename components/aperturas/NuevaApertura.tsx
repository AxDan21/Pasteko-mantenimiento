"use client";
import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { crearApertura } from "@/app/aperturas/actions";
import { calcular, instalacionEnObra, PLANTILLA, aplica, type Config } from "@/lib/gantt";
import { diasEntre } from "@/lib/panel";

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const larga = (f: string) => {
  const [y, m, d] = f.split("-").map(Number);
  return `${DIAS[new Date(y, m - 1, d).getDay()]} ${d} ${MES[m - 1]}`;
};

function Crear({ n }: { n: number }) {
  const { pending } = useFormStatus();
  return <button className="nx-create" type="submit" disabled={pending}>{pending ? "Creando…" : `Crear Gantt con ${n} pasos`}</button>;
}

function Stepper({ titulo, ayuda, valor, min, max, set }: { titulo: string; ayuda: string; valor: number; min: number; max: number; set: (n: number) => void }) {
  return (
    <div className="nx-stepper">
      <span className="nx-st-t">{titulo}</span>
      <div>
        <button type="button" aria-label={`Menos días: ${titulo}`} onClick={() => set(Math.max(min, valor - 1))}>−</button>
        <label>
          <input type="number" inputMode="numeric" min={min} max={max} value={valor} onChange={(e) => set(Math.min(max, Math.max(min, Number(e.target.value) || min)))} aria-label={titulo} />
          <small>días</small>
        </label>
        <button type="button" aria-label={`Más días: ${titulo}`} onClick={() => set(Math.min(max, valor + 1))}>+</button>
      </div>
      <span className="nx-st-h">{ayuda}</span>
    </div>
  );
}

export default function NuevaApertura({ hoy }: { hoy: string }) {
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<"Franquicia" | "Propia">("Franquicia");
  const [bebidas, setBebidas] = useState(true);
  const [pago, setPago] = useState(hoy);
  const [obra, setObra] = useState(31);
  const [prov, setProv] = useState(30);

  const cfg: Config = { tipo, fecha_pago: pago || hoy, dias_obra: obra, dias_proveedor: prov, lleva_bebidas: bebidas };
  const plan = useMemo(() => calcular(cfg, {}), [tipo, pago, obra, prov, bebidas]); // eslint-disable-line react-hooks/exhaustive-deps
  const nPasos = PLANTILLA.filter((p) => aplica(p, cfg)).length;
  const ap = plan.apertura.fin;
  const total = Math.max(1, diasEntre(cfg.fecha_pago, ap));
  const pct = (f: string) => Math.min(100, Math.max(0, (diasEntre(cfg.fecha_pago, f) / total) * 100));
  const inst = plan.instalacion, o = plan.obra;
  const dentro = instalacionEnObra(plan) ?? 0;
  const semaforo =
    inst.fin > o.fin
      ? { c: "bad", t: `La instalación (${larga(inst.fin)}) cae después del fin de obra. Pide al proveedor entregar antes o alarga la obra.` }
      : dentro < 35 || dentro > 85
        ? { c: "warn", t: `La instalación cae al ${dentro}% de la obra (${larga(inst.fin)}). Lo ideal es cerca de la mitad.` }
        : { c: "ok", t: `La instalación cae al ${dentro}% de la obra (${larga(inst.fin)}). Bien: a mitad de obra.` };

  const hitos = [
    { t: "Pago de equipos", r: "Tesorería", f: plan.pago.fin, c: "#2f6fdb" },
    { t: "Inicio de obra", r: "Arquitecto", f: o.inicio, c: "#fd7a0f" },
    { t: "Equipo en corporativo", r: "Compras", f: plan.entrega_corp.fin, c: "#2f6fdb" },
    { t: "Instalación de equipo", r: "Arquitecto / Mantenimiento", f: inst.fin, c: "#7a4fd6" },
    { t: "Fin de obra", r: "Arquitecto", f: o.fin, c: "#fd7a0f" },
    { t: "Apertura suave", r: tipo === "Franquicia" ? "Excelencia Operativa / Franquiciatario" : "Excelencia Operativa", f: ap, c: "#141210" },
    { t: "Inauguración", r: "MKT", f: plan.inauguracion.fin, c: "#c2337a" },
  ];

  return (
    <form action={crearApertura} className="nx">
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="dias_obra" value={obra} />
      <input type="hidden" name="dias_proveedor" value={prov} />
      {bebidas && <input type="hidden" name="lleva_bebidas" value="on" />}

      <div className="nx-form">
        <section className="ax-card nx-sec">
          <h2><span>1</span>¿Qué sucursal?</h2>
          <label className="field">Nombre
            <input name="nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Pasteko - Zinapécuaro" />
          </label>
          <div className="nx-tipos" role="radiogroup" aria-label="Tipo de sucursal">
            {([
              ["Franquicia", "Incluye kickoff con el franquiciatario y entrega llave en mano."],
              ["Propia", "Sin kickoff ni llave en mano: el equipo de Pasteko recibe la tienda."],
            ] as const).map(([t, d]) => (
              <button key={t} type="button" role="radio" aria-checked={tipo === t} className="nx-tipo" onClick={() => setTipo(t)}>
                <span><b>{t}</b><i /></span>
                <small>{d}</small>
              </button>
            ))}
          </div>
          <button type="button" className="nx-switch" aria-pressed={bebidas} onClick={() => setBebidas(!bebidas)}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h12l-1.5 17a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8L6 3z" /><path d="M6.5 8h11" /></svg>
            <span><b>Lleva equipo de bebidas</b><small>Máquina de hielos y licuadora: agrega la capacitación de bebidas</small></span>
            <i aria-hidden="true" />
          </button>
        </section>

        <section className="ax-card nx-sec">
          <h2><span>2</span>¿Cuándo pagó Tesorería los equipos?</h2>
          <p className="sub">Todo el Gantt se calcula a partir de esta fecha.</p>
          <label className="field nx-pago">Pago de equipos
            <input type="date" name="fecha_pago" required value={pago} onChange={(e) => setPago(e.target.value)} />
          </label>
        </section>

        <section className="ax-card nx-sec">
          <h2><span>3</span>Tiempos de esta apertura</h2>
          <div className="nx-steppers">
            <Stepper titulo="Duración de la obra" ayuda="Empieza 7 días después del pago" valor={obra} min={1} max={365} set={setObra} />
            <Stepper titulo="Entrega del proveedor" ayuda="Normalmente de 25 a 30 días" valor={prov} min={1} max={180} set={setProv} />
          </div>
          <label className="field">Notas <span className="hint">opcional</span><input name="notas" placeholder="Ej. local en plaza, horario de obra nocturno" /></label>
        </section>
      </div>

      <aside className="nx-preview" aria-live="polite">
        <section className="nx-hero">
          <span className="nx-k">Así quedaría</span>
          <span className="nx-l">Apertura suave</span>
          <b className="nx-ap">{larga(ap)}</b>
          <span className="nx-l">{total} días desde el pago · inauguración {larga(plan.inauguracion.fin)}</span>
          <div className="nx-line" aria-hidden="true">
            <i className="seg compras" style={{ left: 0, width: `${pct(o.inicio)}%` }} />
            <i className="seg obra" style={{ left: `${pct(o.inicio)}%`, width: `${pct(o.fin) - pct(o.inicio)}%` }} />
            <i className="seg cap" style={{ left: `${pct(o.fin)}%`, width: `${Math.max(1, 100 - pct(o.fin))}%` }} />
            <i className="mid" style={{ left: `${pct(o.inicio) + (pct(o.fin) - pct(o.inicio)) / 2}%` }} />
            <i className={`inst ${semaforo.c}`} style={{ left: `${pct(inst.fin)}%` }} />
          </div>
          <div className="nx-scale"><span>Pago</span><span>Mitad de obra ···</span><span>Apertura</span></div>
          <p className={`nx-sem ${semaforo.c}`}><i />{semaforo.t}</p>
        </section>
        <ol className="ax-card nx-hitos">
          {hitos.map((x) => (
            <li key={x.t}>
              <i style={{ background: x.c }} />
              <span><b>{x.t}</b><small>{x.r}</small></span>
              <b className="num">{larga(x.f)}</b>
            </li>
          ))}
        </ol>
        <Crear n={nPasos} />
      </aside>
    </form>
  );
}
