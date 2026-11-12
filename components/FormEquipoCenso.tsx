"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { prepararFoto, uuid } from "@/lib/imagen";

type Props = { sucursalId: number; sucursal: string; equipos: string[]; esAdmin: boolean };
type Foto = { blob: Blob; url: string } | null;

/** Alta de un equipo en el censo, pensado para el celular del supervisor dentro de la tienda. */
export default function FormEquipoCenso({ sucursalId, sucursal, equipos, esAdmin }: Props) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const [tipo, setTipo] = useState("");
  const [sinSerie, setSinSerie] = useState(false);
  const [ficha, setFicha] = useState<Foto>(null);
  const [foto, setFoto] = useState<Foto>(null);
  const [procesando, setProcesando] = useState(false);
  const [estado, setEstado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ id: string; equipo: string } | null>(null);

  async function tomar(files: FileList | null, set: (f: Foto) => void) {
    const f = files?.[0];
    if (!f) return;
    setProcesando(true);
    setError(null);
    try {
      const blob = await prepararFoto(f);
      set({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError("No se pudo leer la foto. Tómala de nuevo con la cámara (formato JPG).");
    } finally {
      setProcesando(false);
    }
  }

  function reiniciar() {
    form.current?.reset();
    setTipo(""); setSinSerie(false); setFicha(null); setFoto(null);
    setHecho(null); setError(null); setEstado(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const equipo = tipo;
    const descripcion = String(fd.get("descripcion") ?? "").trim();
    const serie = sinSerie ? "" : String(fd.get("serie") ?? "").trim();
    const faltan: string[] = [];
    if (!equipo) faltan.push("el tipo de equipo");
    if (!descripcion) faltan.push("la descripción");
    if (!sinSerie && !serie) faltan.push("el número de serie");
    if (!ficha) faltan.push("la foto de la ficha técnica");
    if (faltan.length) return setError(`Falta ${faltan.join(", ")}.`);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return setError("Tu sesión expiró. Vuelve a iniciar sesión.");

    try {
      if (serie) {
        setEstado("Revisando que no esté registrado…");
        const { data: dup } = await supabase.rpc("serie_registrada", { p_serie: serie });
        const d = (dup ?? [])[0] as { id: string; sucursal: string; equipo: string } | undefined;
        if (d) {
          setEstado(null);
          return setError(`Ese número de serie ya está registrado como ${d.id} (${d.equipo}, ${d.sucursal}). Si es otro equipo, revisa la placa.`);
        }
      }
      const base = `${user.id}/${uuid()}`;
      setEstado("Subiendo foto de la ficha técnica…");
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
          equipo,
          descripcion,
          serie: serie || null,
          marca: String(fd.get("marca") ?? "").trim() || null,
          modelo: String(fd.get("modelo") ?? "").trim() || null,
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
      setHecho({ id: data.id as string, equipo: descripcion || equipo });
      router.refresh();
    } catch (err) {
      console.error(err);
      setEstado(null);
      setError("No se pudo guardar el equipo. Revisa tu señal e intenta de nuevo; no se pierde lo capturado.");
    }
  }

  if (hecho) {
    return (
      <section className="card censo-ok">
        <p className="eyebrow">Equipo registrado en {sucursal}</p>
        <h3 className="num" style={{ fontSize: 30 }}>{hecho.id}</h3>
        <p style={{ margin: "4px 0 12px" }}>{hecho.equipo}</p>
        <p className="sub">Anota este código con plumón en el equipo o pega su etiqueta QR cuando la imprimas.</p>
        <button type="button" className="btn primary big" onClick={reiniciar}>+ Registrar otro equipo</button>
      </section>
    );
  }

  return (
    <form ref={form} onSubmit={enviar} className="card stack" noValidate>
      <h3>Registrar equipo</h3>
      <label className="field">
        Tipo de equipo
        <select id="c-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Elige el tipo</option>
          {equipos.map((x) => <option key={x}>{x}</option>)}
        </select>
        <small className="hint">Si el equipo no está en la lista, avisa a Mantenimiento: solo se registran los tipos del catálogo.</small>
      </label>
      <label className="field">
        Descripción breve
        <input id="c-desc" name="descripcion" placeholder="Ej. Refri vertical junto a caja, puerta de vidrio" autoComplete="off" />
      </label>
      <label className="field">
        Número de serie (de la placa)
        <input id="c-serie" name="serie" disabled={sinSerie} placeholder={sinSerie ? "Sin número de serie" : "Tal como aparece en la placa"} autoComplete="off" autoCapitalize="characters" />
      </label>
      <label className="inline-check">
        <input type="checkbox" checked={sinSerie} onChange={(e) => setSinSerie(e.target.checked)} /> No tiene placa o no se puede leer
      </label>
      <div className="grid2">
        <label className="field">Marca (opcional)<input id="c-marca" name="marca" autoComplete="off" /></label>
        <label className="field">Modelo (opcional)<input id="c-modelo" name="modelo" autoComplete="off" /></label>
      </div>

      <div className="grid2">
        <div className="field">
          Foto de la ficha técnica
          <label className={`photo add ${ficha ? "has" : ""}`}>
            {ficha ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ficha.url} alt="Ficha técnica" />
            ) : (
              <span>{procesando ? "Procesando…" : "+ Foto de la placa de datos"}</span>
            )}
            <input type="file" accept="image/*" hidden onChange={(e) => { tomar(e.target.files, setFicha); e.target.value = ""; }} />
          </label>
          <small className="hint">La etiqueta metálica o de papel con modelo, serie y voltaje. Que se lea.</small>
        </div>
        <div className="field">
          Foto del equipo (opcional)
          <label className={`photo add ${foto ? "has" : ""}`}>
            {foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={foto.url} alt="Equipo" />
            ) : (
              <span>+ Foto completa del equipo</span>
            )}
            <input type="file" accept="image/*" hidden onChange={(e) => { tomar(e.target.files, setFoto); e.target.value = ""; }} />
          </label>
        </div>
      </div>

      {error && <div className="note bad" role="alert">{error}</div>}
      <button className="btn primary big" type="submit" disabled={!!estado || procesando}>{estado ?? "Guardar equipo"}</button>
    </form>
  );
}
