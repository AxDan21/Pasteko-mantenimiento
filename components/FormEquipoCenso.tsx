"use client";
/* eslint-disable @next/next/no-img-element */
import { useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { prepararFoto, uuid } from "@/lib/imagen";

export type TipoCenso = { nombre: string; categoria: string | null; foto: string | null };
type Props = { sucursalId: number; sucursal: string; tipos: TipoCenso[]; esAdmin: boolean; children?: ReactNode };
type Foto = { blob: Blob; url: string } | null;
type Vista = "inicio" | "tipo" | "fotos" | "datos" | "listo";

const ICONOS: [RegExp, string][] = [
  [/clima|minisplit|aire/i, "M3 5h18v8H3zM6 9h12M7 17c0 1.5-1 2-1 3M12 17v4M17 17c0 1.5 1 2 1 3"],
  [/campana|extrac/i, "M8 3h8v5l5 6H3l5-6zM6 17h12"],
  [/vitrina|exhib/i, "M3 6h18v12H3zM3 12h18M8 18v3M16 18v3"],
  [/mesa/i, "M3 8h18v6H3zM5 14v6M19 14v6M7 11h2M15 11h2"],
  [/refri|cámara|camara|paletero|congela/i, "M12 2v20M4.9 7l14.2 10M4.9 17L19.1 7M9 4l3 2 3-2M9 20l3-2 3 2"],
  [/horno|espiguero|gas|estufa|freidora/i, "M12 3c3 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-7 1 2 1 3 3 4 0-3-1-5 0-8z"],
  [/cafe|café|bebida/i, "M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M8 2v3M12 2v3"],
];
const icono = (t: TipoCenso) => ICONOS.find(([re]) => re.test(t.nombre) || re.test(t.categoria ?? ""))?.[1] ?? "M4 4h16v16H4zM9 9h6v6H9z";

/** Marca y modelo que ya dice el nombre del tipo (el supervisor puede cambiarlos). */
function marcaModelo(nombre: string): [string, string] {
  if (/bunn|crescendo/i.test(nombre)) return ["BUNN", "Crescendo"];
  if (/kalerm/i.test(nombre)) return ["Kalerm", ""];
  if (/jura/i.test(nombre)) return ["Jura", ""];
  return ["", ""];
}
const RAPIDAS = ["Barra", "Cocina", "Junto a caja", "Bodega", "Área de clientes"];
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Alta de equipos del censo en 3 pasos (tipo → fotos → datos), pensada para el celular dentro de la tienda. */
export default function FormEquipoCenso({ sucursalId, sucursal, tipos, esAdmin, children }: Props) {
  const router = useRouter();
  const arriba = useRef<HTMLDivElement>(null);
  const [vista, setVista] = useState<Vista>("inicio");
  const [buscar, setBuscar] = useState("");
  const [tipo, setTipo] = useState<TipoCenso | null>(null);
  const [ficha, setFicha] = useState<Foto>(null);
  const [foto, setFoto] = useState<Foto>(null);
  const [procesando, setProcesando] = useState<"ficha" | "foto" | null>(null);
  const [sinSerie, setSinSerie] = useState(false);
  const [serie, setSerie] = useState("");
  const [desc, setDesc] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [estado, setEstado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ id: string; equipo: string } | null>(null);

  const filtrados = useMemo(() => {
    const q = sinAcentos(buscar.trim());
    return q ? tipos.filter((t) => sinAcentos(`${t.nombre} ${t.categoria ?? ""}`).includes(q)) : tipos;
  }, [buscar, tipos]);

  function ir(v: Vista) {
    setVista(v);
    setError(null);
    requestAnimationFrame(() => arriba.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function empezar() {
    setTipo(null); setFicha(null); setFoto(null); setSinSerie(false); setSerie(""); setDesc(""); setMarca(""); setModelo("");
    setBuscar(""); setHecho(null); setEstado(null);
    ir("tipo");
  }

  function elegir(t: TipoCenso) {
    setTipo(t);
    const [ma, mo] = marcaModelo(t.nombre);
    setMarca(ma); setModelo(mo);
    ir("fotos");
  }

  async function tomar(files: FileList | null, cual: "ficha" | "foto") {
    const f = files?.[0];
    if (!f) return;
    setProcesando(cual);
    setError(null);
    try {
      const blob = await prepararFoto(f);
      const v = { blob, url: URL.createObjectURL(blob) };
      if (cual === "ficha") setFicha(v); else setFoto(v);
    } catch {
      setError("No se pudo leer la foto. Tómala de nuevo con la cámara (formato JPG).");
    } finally {
      setProcesando(null);
    }
  }

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const s = sinSerie ? "" : serie.trim().toUpperCase();
    const d = desc.trim();
    const faltan: string[] = [];
    if (!tipo) faltan.push("el tipo de equipo");
    if (!ficha) faltan.push("la foto de la placa");
    if (!sinSerie && !s) faltan.push("el número de serie");
    if (!d) faltan.push("dónde está el equipo");
    if (faltan.length) return setError(`Falta ${faltan.join(", ")}.`);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setError("Tu sesión expiró. Vuelve a iniciar sesión.");

    try {
      if (s) {
        setEstado("Revisando que no esté registrado…");
        const { data: dup } = await supabase.rpc("serie_registrada", { p_serie: s });
        const r = (dup ?? [])[0] as { id: string; sucursal: string; equipo: string } | undefined;
        if (r) {
          setEstado(null);
          return setError(`Esa serie ya está registrada como ${r.id} (${r.equipo}, ${r.sucursal}). Si es otro equipo, revisa la placa.`);
        }
      }
      const base = `${user.id}/${uuid()}`;
      setEstado("Subiendo foto de la placa…");
      const rutaFicha = `${base}-ficha.jpg`;
      const { error: e1 } = await supabase.storage.from("censo").upload(rutaFicha, ficha!.blob, { contentType: ficha!.blob.type || "image/jpeg" });
      if (e1) throw e1;
      let rutaFoto: string | null = null;
      if (foto) {
        setEstado("Subiendo foto del equipo…");
        rutaFoto = `${base}-equipo.jpg`;
        const { error: e2 } = await supabase.storage.from("censo").upload(rutaFoto, foto.blob, { contentType: foto.blob.type || "image/jpeg" });
        if (e2) throw e2;
      }
      setEstado("Guardando equipo…");
      const { data, error: e3 } = await supabase
        .from("activos")
        .insert({
          sucursal_id: sucursalId,
          equipo: tipo!.nombre,
          descripcion: d,
          serie: s || null,
          marca: marca.trim() || null,
          modelo: modelo.trim() || null,
          ficha_path: rutaFicha,
          foto_path: rutaFoto,
          registrado_por: user.id,
          validado: esAdmin,
          costo: 0,
        })
        .select("id")
        .single();
      if (e3 || !data) throw e3 ?? new Error("sin código");
      setEstado(null);
      setHecho({ id: data.id as string, equipo: tipo!.nombre });
      ir("listo");
      router.refresh();
    } catch (err) {
      console.error(err);
      setEstado(null);
      setError("No se pudo guardar el equipo. Revisa tu señal e intenta de nuevo; no se pierde lo capturado.");
    }
  }

  const paso = vista === "tipo" ? 0 : vista === "fotos" ? 1 : vista === "datos" ? 2 : -1;

  return (
    <div className="rc" ref={arriba}>
      {paso >= 0 && (
        <div className="rc-cab">
          <button type="button" className="rc-atras" aria-label="Regresar" onClick={() => ir(paso === 0 ? "inicio" : paso === 1 ? "tipo" : "fotos")}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
          </button>
          <div className="rc-pasos" aria-label={`Paso ${paso + 1} de 3`}>
            {["Tipo", "Fotos", "Datos"].map((l, i) => (
              <span key={l} className={i <= paso ? "on" : ""}><i />{l}</span>
            ))}
          </div>
          <button type="button" className="rc-cancelar" onClick={() => ir("inicio")}>Cancelar</button>
        </div>
      )}

      {vista === "inicio" && (
        <>
          <button type="button" className="rc-nuevo" onClick={empezar}>
            <span aria-hidden="true"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg></span>
            <span><b>Registrar equipo</b><small>Tipo, foto de la placa y serie · 1 minuto</small></span>
          </button>
          {children}
        </>
      )}

      {vista === "tipo" && (
        <section className="rc-pant">
          <h2>¿Qué equipo es?</h2>
          <label className="rc-buscar">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <input type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar: horno, refri, clima…" aria-label="Buscar tipo de equipo" />
          </label>
          <div className="rc-tipos">
            {filtrados.map((t) => (
              <button key={t.nombre} type="button" className={`rc-tipo${tipo?.nombre === t.nombre ? " on" : ""}`} onClick={() => elegir(t)}>
                {t.foto ? <img src={t.foto} alt="" /> : (
                  <span className="rc-ic" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={icono(t)} /></svg></span>
                )}
                <span>{t.nombre}</span>
              </button>
            ))}
          </div>
          {!filtrados.length && <p className="sub">No encontramos “{buscar}”.</p>}
          <p className="rc-nota">¿No está en la lista? Avisa a Mantenimiento: solo se registran los tipos del catálogo.</p>
        </section>
      )}

      {vista === "fotos" && tipo && (
        <section className="rc-pant">
          <div className="rc-elegido">
            {tipo.foto ? <img src={tipo.foto} alt="" /> : <span className="rc-ic chico" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={icono(tipo)} /></svg></span>}
            <span><small>EQUIPO</small><b>{tipo.nombre}</b></span>
            <button type="button" onClick={() => ir("tipo")}>Cambiar</button>
          </div>

          <label className={`rc-placa${ficha ? " lista" : ""}`}>
            <input type="file" accept="image/*" hidden onChange={(e) => { tomar(e.target.files, "ficha"); e.target.value = ""; }} />
            {ficha ? (
              <span className="rc-placa-ok">
                <img src={ficha.url} alt="Foto de la placa" />
                <span><b><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Placa lista</b>Revisa que se lean las letras. Toca para tomarla de nuevo.</span>
              </span>
            ) : (
              <span className="rc-placa-vacia">
                <em>OBLIGATORIA</em>
                <span className="rc-placa-marco" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 8a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="4" /></svg></span>
                <b>{procesando === "ficha" ? "Procesando…" : "Foto de la placa de datos"}</b>
                <span>La etiqueta con modelo, serie y voltaje. Acércate hasta que se lean las letras.</span>
              </span>
            )}
          </label>

          <label className="rc-foto">
            <input type="file" accept="image/*" hidden onChange={(e) => { tomar(e.target.files, "foto"); e.target.value = ""; }} />
            <span className="rc-foto-img">
              {foto ? <img src={foto.url} alt="Foto del equipo" /> : <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-8 8" /></svg>}
            </span>
            <span><b>{procesando === "foto" ? "Procesando…" : foto ? "Foto del equipo lista" : "Foto completa del equipo"}</b><small>Opcional · ayuda a identificarlo</small></span>
          </label>

          {error && <div className="note bad" role="alert">{error}</div>}
          <div className="rc-pie">
            <button type="button" className="rc-seguir" disabled={!ficha || !!procesando} onClick={() => ir("datos")}>
              {ficha ? "Siguiente: datos de la placa" : "Toma la foto de la placa para seguir"}
            </button>
          </div>
        </section>
      )}

      {vista === "datos" && tipo && (
        <form className="rc-pant" onSubmit={guardar} noValidate>
          <h2>Datos de la placa</h2>
          <label className="rc-campo">
            Número de serie
            <input className="rc-serie" value={sinSerie ? "" : serie} onChange={(e) => setSerie(e.target.value)} disabled={sinSerie} placeholder={sinSerie ? "Sin número de serie" : "Tal como aparece en la placa"} autoComplete="off" autoCapitalize="characters" />
          </label>
          <button type="button" className={`rc-toggle${sinSerie ? " on" : ""}`} aria-pressed={sinSerie} onClick={() => setSinSerie(!sinSerie)}>
            <span aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
            No tiene placa o no se lee
          </button>
          {ficha && <a className="rc-ver-placa" href={ficha.url} target="_blank" rel="noopener noreferrer"><img src={ficha.url} alt="" />Ver la foto de la placa</a>}
          <label className="rc-campo">
            ¿Dónde está? (descripción corta)
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej. Barra de café, junto a caja" autoComplete="off" />
          </label>
          <div className="rc-rapidas">
            {RAPIDAS.map((r) => <button key={r} type="button" onClick={() => setDesc(desc ? `${desc}, ${r.toLowerCase()}` : r)}>{r}</button>)}
          </div>
          <div className="rc-dos">
            <label className="rc-campo">Marca<input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="Opcional" autoComplete="off" /></label>
            <label className="rc-campo">Modelo<input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="Opcional" autoComplete="off" /></label>
          </div>
          <small className="rc-nota">Marca y modelo son opcionales. Revisamos que la serie no esté ya registrada.</small>
          {error && <div className="note bad" role="alert">{error}</div>}
          <div className="rc-pie">
            <button type="submit" className="rc-seguir" disabled={!!estado}>{estado ?? "Guardar equipo"}</button>
          </div>
        </form>
      )}

      {vista === "listo" && hecho && (
        <section className="rc-listo">
          <img src="/mascota.webp" alt="" className="rc-teko" />
          <span className="rc-ok"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Equipo registrado</span>
          <b className="rc-codigo">{hecho.id}</b>
          <p>{hecho.equipo} · {sucursal}<br />Anótalo con plumón en el equipo hasta que llegue su etiqueta QR.</p>
          <button type="button" className="rc-seguir" onClick={empezar}>+ Registrar otro equipo</button>
          <button type="button" className="rc-sec" onClick={() => ir("inicio")}>Ver equipos de la sucursal</button>
        </section>
      )}
    </div>
  );
}
