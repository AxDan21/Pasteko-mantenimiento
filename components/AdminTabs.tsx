"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const TABS = [
  ["/admin", "Resumen"],
  ["/admin/tickets", "Servicio"],
  ["/admin/preventivos", "Preventivos"],
  ["/admin/gastos", "Gastos"],
  ["/admin/activos", "Equipos"],
  ["/admin/caja", "Caja chica"],
  ["/admin/refacciones", "Refacciones"],
  ["/admin/sucursales", "Sucursales"],
  ["/admin/usuarios", "Usuarios"],
  ["/aperturas", "Aperturas"],
  ["/admin/reporte", "Reporte"],
  ["/admin/contenido", "Contenido de tiendas"],
] as const;

export default function AdminTabs() {
  const path = usePathname();
  const nav = useRef<HTMLElement>(null);
  const activo = (href: string) => {
    if (href === "/admin") return path === "/admin";
    if (href === "/admin/tickets") return path.startsWith("/admin/tickets") || path.startsWith("/admin/hojas");
    return path.startsWith(href);
  };

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
