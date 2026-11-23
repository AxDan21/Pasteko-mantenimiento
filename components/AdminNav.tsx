"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cerrarSesion } from "@/app/login/actions";
import type { Contador, Contadores } from "@/lib/contadores";
import { CON_PERIODO, EVENTO_MES, GRUPOS, LLAVE_MES, type ItemMenu as Item } from "@/lib/menu-admin";
import { mesActual } from "@/lib/panel";

/** Trazos de 24×24 (stroke). */
const IC: Record<string, string> = {
  inicio: "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  servicio: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z",
  preventivos: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 10h18M8 3v4M16 3v4",
  aperturas: "M4 21V9l8-5 8 5v12M9 21v-6h6v6",
  equipos: "M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM8 7h8M8 11h8M8 15h5",
  refacciones: "M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8",
  sucursales: "M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  gastos: "M3 7h18v12H3zM12 10a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
  caja: "M5 7h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2zM8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  reporte: "M4 20V10M10 20V4M16 20v-8M22 20H2",
  personas: "M9 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM2 21a7 7 0 0 1 14 0M17 11a3 3 0 1 0 0-6M22 21a6 6 0 0 0-4-5.6",
  contenido: "M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM10 9l5 2.5-5 2.5z",
  hojas: "M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6",
  mas: "M5 12h.01M12 12h.01M19 12h.01",
  menu: "M4 6h16M4 12h16M4 18h16",
  cerrar: "M6 6l12 12M18 6 6 18",
};

/** Accesos de la barra inferior en móvil; el resto vive en "Más". */
const MOVIL = ["/admin", "/admin/tickets", "/admin/activos", "/admin/gastos"];
const TODOS = GRUPOS.flatMap((g) => g.items);

function Svg({ d }: { d: string }) {
  return (
    <svg className="ash-i" viewBox="0 0 24 24" aria-hidden="true">
      <path d={IC[d]} />
    </svg>
  );
}

function Cuenta({ c }: { c?: Contador }) {
  if (!c || c.n <= 0) return null;
  return <span className={`ash-n${c.alerta ? " alerta" : ""}`}>{c.n > 99 ? "99+" : c.n}</span>;
}

export default function AdminNav({ nombre, contadores }: { nombre: string; contadores: Contadores }) {
  const path = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState<string | null>(null);

  useEffect(() => {
    const leer = () => {
      try { const m = sessionStorage.getItem(LLAVE_MES); setMes(m && m !== mesActual() ? m : null); } catch { setMes(null); }
    };
    leer();
    window.addEventListener(EVENTO_MES, leer);
    return () => window.removeEventListener(EVENTO_MES, leer);
  }, []);
  /** Los módulos que se consultan por mes conservan el periodo elegido. */
  const destino = (href: string) => (mes && CON_PERIODO.includes(href) ? `${href}?mes=${mes}` : href);

  const activo = (it: Item) => {
    if (it.href === "/admin") return path === "/admin";
    return [it.href, ...(it.tambien ?? [])].some((h) => path === h || path.startsWith(`${h}/`));
  };

  useEffect(() => setAbierto(false), [path]);
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [abierto]);

  const iniciales = nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "A";
  const masActivo = TODOS.some((it) => !MOVIL.includes(it.href) && activo(it));
  const pendientesMas = TODOS.filter((it) => !MOVIL.includes(it.href) && it.clave).some((it) => (contadores[it.clave!]?.n ?? 0) > 0);

  return (
    <>
      {/* Barra superior solo en móvil */}
      <header className="ash-mtop no-print">
        <button type="button" className="ash-ibtn" onClick={() => setAbierto(true)} aria-label="Abrir menú" aria-expanded={abierto} aria-controls="ash-side">
          <Svg d="menu" />
        </button>
        <Link href="/admin" className="ash-brand">
          <span className="brand-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascota.webp" alt="" />
          </span>
          <b>Pasteko Mantenimiento</b>
        </Link>
      </header>

      {abierto && <div className="ash-scrim no-print" onClick={() => setAbierto(false)} aria-hidden="true" />}

      <aside id="ash-side" className={`ash-side no-print${abierto ? " open" : ""}`} aria-label="Navegación del panel">
        <div className="ash-side-top">
          <Link href="/admin" className="ash-brand">
            <span className="brand-mark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mascota.webp" alt="" />
            </span>
            <span>
              <b>Pasteko</b>
              <small>Mantenimiento</small>
            </span>
          </Link>
          <button type="button" className="ash-ibtn ash-close" onClick={() => setAbierto(false)} aria-label="Cerrar menú">
            <Svg d="cerrar" />
          </button>
        </div>

        <nav className="ash-nav" aria-label="Módulos del panel">
          {GRUPOS.map((g, i) => (
            <div key={g.titulo ?? i} className="ash-grp">
              {g.titulo && <span className="ash-grp-t">{g.titulo}</span>}
              {g.items.map((it) => (
                <Link key={it.href} href={destino(it.href)} className="ash-a" aria-current={activo(it) ? "page" : undefined}>
                  <Svg d={it.icono} />
                  <span>{it.label}</span>
                  <Cuenta c={it.clave ? contadores[it.clave] : undefined} />
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="ash-foot">
          <Link href="/servicio" className="ash-a">
            <Svg d="hojas" />
            <span>Mis hojas de servicio</span>
          </Link>
          <div className="ash-user">
            <span className="ash-avatar" aria-hidden="true">{iniciales}</span>
            <span className="ash-user-n"><b>{nombre}</b><small>Administración</small></span>
            <form action={cerrarSesion}>
              <button type="submit" className="ash-salir">Salir</button>
            </form>
          </div>
        </div>
      </aside>

      {/* Barra inferior solo en móvil */}
      <nav className="ash-bnav no-print" aria-label="Accesos rápidos">
        {MOVIL.map((href) => {
          const it = TODOS.find((x) => x.href === href)!;
          const c = it.clave ? contadores[it.clave] : undefined;
          return (
            <Link key={href} href={destino(href)} aria-current={activo(it) ? "page" : undefined}>
              <Svg d={it.icono} />
              <span>{it.label}</span>
              {c && c.n > 0 && <i className={c.alerta ? "alerta" : undefined} aria-label={`${c.n} pendientes`}>{c.n > 99 ? "99+" : c.n}</i>}
            </Link>
          );
        })}
        <button type="button" onClick={() => setAbierto(true)} aria-current={masActivo ? "page" : undefined} aria-controls="ash-side" aria-expanded={abierto}>
          <Svg d="mas" />
          <span>Más</span>
          {pendientesMas && <i className="punto" aria-hidden="true" />}
        </button>
      </nav>
    </>
  );
}
