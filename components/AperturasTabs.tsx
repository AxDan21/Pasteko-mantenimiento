"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/aperturas", "Portafolio"],
  ["/aperturas/semana", "Mi semana"],
] as const;

export default function AperturasTabs({ admin }: { admin: boolean }) {
  const path = usePathname();
  const activo = (href: string) =>
    href === "/aperturas" ? path === "/aperturas" || /^\/aperturas\/\d+/.test(path) : path.startsWith(href);
  return (
    <nav className="admin-tabs no-print" aria-label="Aperturas">
      <div className="wrap">
        {admin && <Link href="/admin">← Panel de mantenimiento</Link>}
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} aria-current={activo(href) ? "page" : undefined}>
            {label}
          </Link>
        ))}
        {admin && (
          <Link href="/aperturas/nueva" aria-current={path === "/aperturas/nueva" ? "page" : undefined}>
            + Nueva apertura
          </Link>
        )}
      </div>
    </nav>
  );
}
