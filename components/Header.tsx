import Link from "next/link";
import { cerrarSesion } from "@/app/login/actions";

type Item = { href: string; label: string; activo?: boolean };

export default function Header({ items = [], salir = false, sub = "Portal de sucursales" }: { items?: Item[]; salir?: boolean; sub?: string }) {
  return (
    <header className="top">
      <div className="wrap">
        <Link href="/" className="brand">
          <span className="brand-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascota.webp" alt="" />
          </span>
          <span>
            <b>Pasteko Mantenimiento</b>
            <small>{sub}</small>
          </span>
        </Link>
        <nav className="nav" aria-label="Principal">
          {items.map((i) => (
            <Link key={i.href} href={i.href} className={i.activo ? "on" : undefined}>
              {i.label}
            </Link>
          ))}
          {salir && (
            <form action={cerrarSesion}>
              <button type="submit">Salir</button>
            </form>
          )}
        </nav>
      </div>
    </header>
  );
}
