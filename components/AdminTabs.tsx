"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const TABS = [
  ["/admin", "Resumen"],
  ["/admin/hojas", "Hojas de servicio"],
  ["/admin/preventivos", "Preventivos"],
  ["/admin/gastos", "Gastos"],
  ["/admin/activos", "Activos y garantías"],
  ["/admin/caja", "Caja chica"],
  ["/admin/tecnicos", "Técnicos y proveedores"],
  ["/admin/refacciones", "Refacciones"],
  ["/admin/supervisores", "Supervisores"],
  ["/admin/aperturas", "Aperturas"],
  ["/admin/reporte", "Reporte"],
  ["/admin/contenido", "Contenido de tiendas"],
] as const;

export default function AdminTabs() {
  const path = usePathname();
  const nav = useRef<HTMLElement>(null);
  const activo = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));

  useEffect(() => {
    nav.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [path]);

  return (
    <nav ref={nav} className="admin-tabs no-print" aria-label="Módulos del panel">
      <div className="wrap">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} aria-current={activo(href) ? "page" : undefined}>
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
