"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { buscarPanel, type Resultado } from "@/app/admin/buscar";
import IconoUI from "@/components/IconoUI";
import SelectorTema from "@/components/SelectorTema";
import type { Contador } from "@/lib/contadores";
import { CON_PERIODO, CON_ZONA, CREAR, EVENTO_MES, GRUPOS, LLAVE_MES, LLAVE_ZONA, ubicacion } from "@/lib/menu-admin";
import { mesActual, nombreMes, sumarMeses } from "@/lib/panel";

const MODULOS: Resultado[] = GRUPOS.flatMap((g) => g.items.map((it) => ({ grupo: "Ir a", titulo: it.label, detalle: g.titulo, href: it.href })));
const ACCIONES: Resultado[] = CREAR.map((c) => ({ grupo: "Crear", titulo: c.label, detalle: c.detalle, href: c.href }));
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Barra superior del panel: ruta, periodo y ámbito (zona) compartidos entre módulos, tema, avisos,
 * búsqueda (⌘K) y "+ Nuevo".
 */
export default function BarraPanel({ zonas = [], avisos }: { zonas?: string[]; avisos?: Contador }) {
  const path = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const conPeriodo = CON_PERIODO.includes(path);
  const conZona = CON_ZONA.includes(path) && zonas.length > 1;
  const hoyMes = mesActual();
  const mesUrl = params.get("mes");
  const mes = mesUrl && /^\d{4}-\d{2}$/.test(mesUrl) && mesUrl <= hoyMes ? mesUrl : hoyMes;
  const zonaUrl = params.get("zona");
  const zona = zonaUrl && zonas.includes(zonaUrl) ? zonaUrl : "";
  const donde = ubicacion(path);

  // La URL es la que manda; el periodo y el ámbito se recuerdan para los demás módulos que los usan.
  useEffect(() => {
    if (!conPeriodo) return;
    try {
      if (mes === hoyMes) sessionStorage.removeItem(LLAVE_MES);
      else sessionStorage.setItem(LLAVE_MES, mes);
      window.dispatchEvent(new Event(EVENTO_MES));
    } catch { /* sin almacenamiento: el periodo solo vive en la URL */ }
  }, [conPeriodo, mes, hoyMes]);
  useEffect(() => {
    if (!CON_ZONA.includes(path)) return;
    try {
      if (zona) sessionStorage.setItem(LLAVE_ZONA, zona);
      else sessionStorage.removeItem(LLAVE_ZONA);
      window.dispatchEvent(new Event(EVENTO_MES));
    } catch { /* sin almacenamiento: el ámbito solo vive en la URL */ }
  }, [path, zona]);

  const irZona = (z: string) => {
    const q = new URLSearchParams(params.toString());
    if (z) q.set("zona", z); else q.delete("zona");
    const s = q.toString();
    router.push(s ? `${path}?${s}` : path);
  };

  const irMes = (m: string) => {
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    const q = new URLSearchParams(params.toString());
    if (m >= hoyMes) q.delete("mes"); else q.set("mes", m);
    const s = q.toString();
    router.push(s ? `${path}?${s}` : path);
  };

  // ---------- + Nuevo ----------
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const fuera = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [menu]);

  // ---------- Búsqueda ----------
  const [busca, setBusca] = useState(false);
  const [q, setQ] = useState("");
  const [remotos, setRemotos] = useState<Resultado[]>([]);
  const [sel, setSel] = useState(0);
  const [cargando, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  const abrirBusca = useCallback(() => { setBusca(true); setQ(""); setRemotos([]); setSel(0); }, []);
  useEffect(() => {
    const atajo = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setBusca((b) => !b); setQ(""); setRemotos([]); setSel(0); }
    };
    document.addEventListener("keydown", atajo);
    return () => document.removeEventListener("keydown", atajo);
  }, []);
  useEffect(() => { if (busca) entrada.current?.focus(); }, [busca]);
  useEffect(() => { setBusca(false); setMenu(false); }, [path]);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) { setRemotos([]); return; }
    const id = setTimeout(() => iniciar(async () => {
      try { setRemotos(await buscarPanel(t)); } catch { setRemotos([]); }
    }), 220);
    return () => clearTimeout(id);
  }, [q]);

  const lista = useMemo(() => {
    const t = sinAcentos(q.trim());
    const locales = [...MODULOS, ...ACCIONES].filter((r) => !t || sinAcentos(`${r.titulo} ${r.detalle ?? ""}`).includes(t));
    return t ? [...remotos, ...locales] : locales;
  }, [q, remotos]);
  useEffect(() => { setSel((s) => Math.min(s, Math.max(lista.length - 1, 0))); }, [lista.length]);

  const ir = (r: Resultado) => { setBusca(false); router.push(r.href); };
  const teclas = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setBusca(false);
    else if (e.key === "ArrowDown") { setSel((s) => Math.min(s + 1, lista.length - 1)); e.preventDefault(); }
    else if (e.key === "ArrowUp") { setSel((s) => Math.max(s - 1, 0)); e.preventDefault(); }
    else if (e.key === "Enter" && lista[sel]) { ir(lista[sel]); e.preventDefault(); }
  };
  useEffect(() => { document.getElementById(`bp-r-${sel}`)?.scrollIntoView({ block: "nearest" }); }, [sel]);

  return (
    <div className="bp no-print">
      <div className="bp-izq">
        {donde && (
          <nav className="bp-ruta" aria-label="Ruta">
            <span>Panel</span>
            {donde.grupo && <><IconoUI nombre="derecha" tam={14} /><span>{donde.grupo}</span></>}
            <IconoUI nombre="derecha" tam={14} />
            <b aria-current="page">{donde.modulo}</b>
          </nav>
        )}
        {conPeriodo && (
          <div className="bp-mes" role="group" aria-label="Periodo">
            <button type="button" onClick={() => irMes(sumarMeses(mes, -1))} aria-label="Mes anterior"><IconoUI nombre="izquierda" tam={18} grosor={2.2} /></button>
            <label>
              <span className="bp-mes-n">{nombreMes(mes)}</span>
              <small>{mes === hoyMes ? "Mes en curso" : "Mes cerrado"}</small>
              <input type="month" value={mes} max={hoyMes} onChange={(e) => irMes(e.target.value)} aria-label="Elegir mes" />
            </label>
            <button type="button" onClick={() => irMes(sumarMeses(mes, 1))} disabled={mes >= hoyMes} aria-label="Mes siguiente"><IconoUI nombre="derecha" tam={18} grosor={2.2} /></button>
            {mes !== hoyMes && <button type="button" className="bp-hoy" onClick={() => irMes(hoyMes)}>Ir a hoy</button>}
          </div>
        )}
        {conZona && (
          <label className={`bp-ambito${zona ? " activo" : ""}`}>
            <IconoUI nombre="sucursales" tam={16} />
            <span className="sr-only">Ámbito</span>
            <select value={zona} onChange={(e) => irZona(e.target.value)}>
              <option value="">Todas las zonas</option>
              {zonas.map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="bp-der">
        <SelectorTema />
        <Link href="/admin/tickets?f=sin_asignar" className="ui-ibtn bp-avisos"
          aria-label={avisos?.n ? `Avisos: ${avisos.n} ${avisos.n === 1 ? "reporte nuevo" : "reportes nuevos"} sin técnico` : "Avisos: no hay reportes nuevos sin técnico"}
          title="Reportes nuevos sin técnico">
          <IconoUI nombre="campana" />
          {avisos && avisos.n > 0 && <span className={`bp-avisos-n${avisos.alerta ? " alerta" : ""}`} aria-hidden="true">{avisos.n > 99 ? "99+" : avisos.n}</span>}
        </Link>
        <button type="button" className="bp-buscar" onClick={abrirBusca} aria-haspopup="dialog" aria-label="Buscar">
          <IconoUI nombre="buscar" tam={17} grosor={2} />
          <span>Buscar</span>
          <kbd>⌘K</kbd>
        </button>
        <div className="bp-nuevo" ref={menuRef}>
          <button type="button" className="btn primary" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu" aria-label="Nuevo">+<span className="bp-nuevo-t"> Nuevo</span></button>
          {menu && (
            <div className="bp-menu" role="menu">
              {CREAR.map((c) => (
                <Link key={c.href} href={c.href} role="menuitem" onClick={() => setMenu(false)}>
                  <b>{c.label}</b><small>{c.detalle}</small>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {busca && (
        <div className="bp-velo" onMouseDown={(e) => { if (e.target === e.currentTarget) setBusca(false); }}>
          <div className="bp-dialogo" role="dialog" aria-modal="true" aria-label="Buscar o ir a">
            <input
              ref={entrada}
              value={q}
              onChange={(e) => { setQ(e.target.value); setSel(0); }}
              onKeyDown={teclas}
              placeholder="Busca un módulo, sucursal, equipo o folio…"
              role="combobox"
              aria-expanded="true"
              aria-controls="bp-lista"
              aria-activedescendant={lista[sel] ? `bp-r-${sel}` : undefined}
              autoComplete="off"
            />
            <ul id="bp-lista" className="bp-lista" role="listbox">
              {lista.map((r, i) => (
                <li key={`${r.grupo}-${r.href}-${i}`} role="presentation">
                  {(i === 0 || lista[i - 1].grupo !== r.grupo) && <span className="bp-grupo">{r.grupo}</span>}
                  <button
                    type="button" id={`bp-r-${i}`} role="option" aria-selected={i === sel}
                    onMouseEnter={() => setSel(i)} onClick={() => ir(r)}
                  >
                    <b>{r.titulo}</b>{r.detalle && <small>{r.detalle}</small>}
                  </button>
                </li>
              ))}
              {lista.length === 0 && !cargando && <li className="bp-vacio">Sin resultados para “{q}”. Prueba con el nombre de la sucursal, el código del equipo o el folio.</li>}
            </ul>
            <p className="bp-pie">{cargando ? "Buscando…" : "↑↓ para moverte · Enter para abrir · Esc para cerrar"}</p>
          </div>
        </div>
      )}
    </div>
  );
}
