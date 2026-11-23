import Link from "next/link";
import type { ReactNode } from "react";
import IconoUI from "@/components/IconoUI";
import type { NombreIcono } from "@/lib/iconos";

export type TonoKpi = "ok" | "warn" | "bad" | "info" | "marca";

/**
 * Tarjeta de indicador: ícono en color, valor, detalle y una gráfica pequeña opcional (tendencia o anillo).
 * Con `href` toda la tarjeta es un enlace al módulo que explica la cifra.
 */
export default function Kpi({ href, icono, tono, titulo, valor, detalle, grafica, alerta }: {
  href?: string; icono: NombreIcono; tono: TonoKpi; titulo: string; valor: ReactNode; detalle: ReactNode; grafica?: ReactNode;
  /** Resalta el valor en rojo (algo vencido o urgente). */
  alerta?: boolean;
}) {
  const cuerpo = (
    <>
      <span className="ui-kpi-h"><span className={`ui-ic ${tono}`}><IconoUI nombre={icono} tam={15} grosor={2} /></span>{titulo}</span>
      <span className="rz-kpi-row">
        <span className="rz-kpi-t">
          <b className={`ui-kpi-v${alerta ? " rz-mal" : ""}`}>{valor}</b>
          <span className="ui-kpi-s">{detalle}</span>
        </span>
        {grafica}
      </span>
    </>
  );
  return href ? <Link href={href} className="ui-kpi rz-kpi">{cuerpo}</Link> : <div className="ui-kpi rz-kpi">{cuerpo}</div>;
}
