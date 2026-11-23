"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cerrarSesion } from "@/app/login/actions";
import IconoUI from "@/components/IconoUI";
import type { Contador, Contadores } from "@/lib/contadores";
import { conFiltros, esActivo, EVENTO_MES, GRUPOS, LLAVE_MES, LLAVE_ZONA } from "@/lib/menu-admin";
import { mesActual } from "@/lib/panel";
import { LLAVE_NAV } from "@/lib/tema";

/** Accesos de la barra inferior en móvil; el resto vive en "Más". */
const MOVIL = ["/admin", "/admin/tickets", "/admin/activos", "/admin/gastos"];
const TODOS = GRUPOS.flatMap((g) => g.items);

function Cuenta({ c }: { c?: Contador }) {
  if (!c || c.n <= 0) return null;
  return <span className={`ash-n${c.alerta ? " alerta" : ""}`}>{c.n > 99 ? "99+" : c.n}</span>;
}

export default function AdminNav({ nombre, contadores }: { nombre: string; contadores: Contadores }) {
  const path = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState<string | null>(null);
  const [zona, setZona] = useState<string | null>(null);
  const [mini, setMini] = useState(false);

  // Periodo y ámbito elegidos en la barra superior: los enlaces del menú los conservan.
  useEffect(() => {
    const leer = () => {
      try {
        const m = sessionStorage.getItem(LLAVE_MES);
        setMes(m && m !== mesActual() ? m : null);
        setZona(sessionStorage.getItem(LLAVE_ZONA));
      } catch { setMes(null); setZona(null); }
    };
    leer();
    window.addEventListener(EVENTO_MES, leer);
    return () => window.removeEventListener(EVENTO_MES, leer);
  }, []);
  const destino = (href: string) => conFiltros(href, mes, zona);

  useEffect(() => setMini(document.documentElement.getAttribute("data-nav") === "mini"), []);
  const alternarMini = () => {
    const nuevo = !mini;
    if (nuevo) document.documentElement.setAttribute("data-nav", "mini");
    else document.documentElement.removeAttribute("data-nav");
    try { localStorage.setItem(LLAVE_NAV, nuevo ? "mini" : "completo"); } catch { /* opcional */ }
    setMini(nuevo);
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
  const masActivo = TODOS.some((it) => !MOVIL.includes(it.href) && esActivo(it, path));
  const pendientesMas = TODOS.filter((it) => !MOVIL.includes(it.href) && it.clave).some((it) => (contadores[it.clave!]?.n ?? 0) > 0);

  return (
    <>
      {/* Barra superior solo en móvil */}
      <header className="ash-mtop no-print">
        <button type="button" className="ash-ibtn" onClick={() => setAbierto(true)} aria-label="Abrir menú" aria-expanded={abierto} aria-controls="ash-side">
          <IconoUI nombre="menu" tam={22} />
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
          <Link href="/admin" className="ash-brand" title="Pasteko Mantenimiento">
            <span className="brand-mark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/mascota.webp" alt="" />
            </span>
            <span className="ash-txt">
              <b>Pasteko</b>
              <small>Mantenimiento</small>
            </span>
          </Link>
          <button type="button" className="ash-ibtn ash-close" onClick={() => setAbierto(false)} aria-label="Cerrar menú">
            <IconoUI nombre="cerrar" tam={20} />
          </button>
        </div>

        <nav className="ash-nav" aria-label="Módulos del panel">
          {GRUPOS.map((g, i) => (
            <div key={g.titulo ?? i} className="ash-grp">
              {g.titulo && <span className="ash-grp-t">{g.titulo}</span>}
              {g.items.map((it) => {
                const c = it.clave ? contadores[it.clave] : undefined;
                return (
                  <Link key={it.href} href={destino(it.href)} className="ash-a" aria-current={esActivo(it, path) ? "page" : undefined}
                    title={mini ? `${it.label}${c && c.n > 0 ? ` · ${c.n} pendientes` : ""}` : undefined}>
                    <IconoUI nombre={it.icono} className="ash-i" />
                    <span className="ash-txt">{it.label}</span>
                    <Cuenta c={c} />
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="ash-foot">
          <Link href="/servicio" className="ash-a" title={mini ? "Mis hojas de servicio" : undefined}>
            <IconoUI nombre="hojas" className="ash-i" />
            <span className="ash-txt">Mis hojas de servicio</span>
          </Link>
          <button type="button" className="ash-a ash-plegar" onClick={alternarMini} aria-pressed={mini}
            aria-label={mini ? "Expandir menú lateral" : "Contraer menú lateral"} title={mini ? "Expandir menú" : undefined}>
            <IconoUI nombre={mini ? "derecha" : "izquierda"} className="ash-i" />
            <span className="ash-txt">Contraer menú</span>
          </button>
          <div className="ash-user">
            <span className="ash-avatar" aria-hidden="true" title={nombre}>{iniciales}</span>
            <span className="ash-user-n ash-txt"><b>{nombre}</b><small>Administración</small></span>
            <form action={cerrarSesion} className="ash-salir-f">
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
            <Link key={href} href={destino(href)} aria-current={esActivo(it, path) ? "page" : undefined}>
              <IconoUI nombre={it.icono} className="ash-i" />
              <span>{it.label}</span>
              {c && c.n > 0 && <i className={c.alerta ? "alerta" : undefined} aria-label={`${c.n} pendientes`}>{c.n > 99 ? "99+" : c.n}</i>}
            </Link>
          );
        })}
        <button type="button" onClick={() => setAbierto(true)} aria-current={masActivo ? "page" : undefined} aria-controls="ash-side" aria-expanded={abierto}>
          <IconoUI nombre="menu" className="ash-i" />
          <span>Más</span>
          {pendientesMas && <i className="punto" aria-hidden="true" />}
        </button>
      </nav>
    </>
  );
}
