"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import FirmaPad, { type FirmaHandle } from "@/components/FirmaPad";
import { createClient } from "@/lib/supabase/client";
import { prepararFoto, uuid } from "@/lib/imagen";
import { mxn } from "@/lib/format";
import type { Refaccion } from "@/lib/types";

type Props = {
  sucursales: { id: number; nombre: string; zona: string }[];
  equipos: string[];
  activos?: { id: string; sucursal_id: number; equipo: string; marca: string | null; modelo: string | null }[];
  preventivos?: { id: number; fecha: string; sucursal_id: number; equipo: string; activo_id: string | null; tarea: string }[];
};

type Foto = { id: string; blob: Blob; url: string };
const MAX_FOTOS = 8;
const BORRADOR = "pk-hoja-borrador";

export default function FormHoja({ sucursales, equipos, activos = [], preventivos = [] }: Props) {
  const router = useRouter();
  const firma = useRef<FirmaHandle>(null);
  const [firmaVacia, setFirmaVacia] = useState(true);

  const [sucursal, setSucursal] = useState("");
  const [equipo, setEquipo] = useState("");
  const [equipoOtro, setEquipoOtro] = useState("");
  const [tipo, setTipo] = useState<"Correctivo" | "Preventivo">("Correctivo");
  const [activoId, setActivoId] = useState("");
  const [preventivoId, setPreventivoId] = useState("");
  const [ticket, setTicket] = useState("");
  const [falla, setFalla] = useState("");
  const [trabajo, setTrabajo] = useState("");
  const [refs, setRefs] = useState<Refaccion[]>([]);
  const [manoObra, setManoObra] = useState("");
  const [recibe, setRecibe] = useState("");
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [procesando, setProcesando] = useState(false);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Borrador de los textos por si se cierra la página o se va la señal (no incluye fotos ni firma)
  useEffect(() => {
    try {
      const b = JSON.parse(localStorage.getItem(BORRADOR) ?? "null");
      if (b) {
        setSucursal(b.sucursal ?? ""); setEquipo(b.equipo ?? ""); setEquipoOtro(b.equipoOtro ?? "");
        setTipo(b.tipo ?? "Correctivo"); setTicket(b.ticket ?? ""); setFalla(b.falla ?? ""); setTrabajo(b.trabajo ?? "");
        setRefs(b.refs ?? []); setManoObra(b.manoObra ?? ""); setRecibe(b.recibe ?? "");
        setActivoId(b.activoId ?? ""); setPreventivoId(b.preventivoId ?? "");
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(BORRADOR, JSON.stringify({ sucursal, equipo, equipoOtro, tipo, ticket, falla, trabajo, refs, manoObra, recibe, activoId, preventivoId }));
    } catch {}
  }, [sucursal, equipo, equipoOtro, tipo, ticket, falla, trabajo, refs, manoObra, recibe, activoId, preventivoId]);

  const activosSuc = useMemo(() => activos.filter((a) => String(a.sucursal_id) === sucursal), [activos, sucursal]);
  const prevSuc = useMemo(() => preventivos.filter((p) => String(p.sucursal_id) === sucursal), [preventivos, sucursal]);

  function elegirSucursal(v: string) {
    setSucursal(v);
    setActivoId("");
    setPreventivoId("");
  }
  function elegirActivo(id: string) {
    setActivoId(id);
    const a = activos.find((x) => x.id === id);
    if (a) {
      setEquipo(equipos.includes(a.equipo) ? a.equipo : "__otro");
      setEquipoOtro(equipos.includes(a.equipo) ? "" : a.equipo);
    }
  }
  function elegirPreventivo(id: string) {
    setPreventivoId(id);
    const p = preventivos.find((x) => String(x.id) === id);
    if (!p) return;
    if (p.activo_id) elegirActivo(p.activo_id);
    else {
      setEquipo(equipos.includes(p.equipo) ? p.equipo : "__otro");
      setEquipoOtro(equipos.includes(p.equipo) ? "" : p.equipo);
    }
    if (!falla.trim()) setFalla(`Preventivo programado: ${p.tarea}`);
  }

  const subtotal = useMemo(() => refs.reduce((s, r) => s + (Number(r.cantidad) || 0) * (Number(r.costo) || 0), 0), [refs]);
  const total = subtotal + (Number(manoObra) || 0);

  async function agregarFotos(files: FileList | null) {
    if (!files?.length) return;
    setProcesando(true);
    setError(null);
    try {
      const nuevas: Foto[] = [];
      for (const f of Array.from(files).slice(0, MAX_FOTOS - fotos.length)) {
        const blob = await prepararFoto(f);
        nuevas.push({ id: uuid(), blob, url: URL.createObjectURL(blob) });
      }
      setFotos((prev) => [...prev, ...nuevas]);
    } catch (err) {
      console.error(err);
      setError("No se pudo leer una de las fotos. Tómala con la cámara en formato JPG (en iPhone: Ajustes > Cámara > Formatos > Más compatible) e intenta de nuevo.");
    } finally {
      setProcesando(false);
    }
  }

  function quitarFoto(id: string) {
    setFotos((prev) => {
      const f = prev.find((x) => x.id === id);
      if (f) URL.revokeObjectURL(f.url);
      return prev.filter((x) => x.id !== id);
    });
  }

  const setRef = (i: number, campo: keyof Refaccion, valor: string) =>
    setRefs((prev) => prev.map((r, j) => (j === i ? { ...r, [campo]: campo === "descripcion" ? valor : Number(valor) } : r)));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const equipoFinal = equipo === "__otro" ? equipoOtro.trim() : equipo;
    const faltan: string[] = [];
    if (!sucursal) faltan.push("la sucursal");
    if (!equipoFinal) faltan.push("el equipo");
    if (!falla.trim()) faltan.push("la falla reportada");
    if (!trabajo.trim()) faltan.push("el trabajo realizado");
    if (!fotos.length) faltan.push("al menos una foto");
    if (!recibe.trim()) faltan.push("el nombre de quien recibe");
    if (firma.current?.vacia() ?? true) faltan.push("la firma");
    if (refs.some((r) => !r.descripcion.trim() || !(r.cantidad > 0) || r.costo < 0)) faltan.push("completar las refacciones");
    if (faltan.length) {
      setError(`Falta ${faltan.join(", ")}.`);
      return;
    }

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Tu sesión expiró. Vuelve a iniciar sesión; los textos quedan guardados en este celular.");
      return;
    }

    const id = uuid();
    const carpeta = `${user.id}/${id}`;
    try {
      const rutas: string[] = [];
      for (let i = 0; i < fotos.length; i++) {
        setEnviando(`Subiendo foto ${i + 1} de ${fotos.length}…`);
        const ruta = `${carpeta}/foto-${i + 1}.jpg`;
        const { error: e1 } = await supabase.storage.from("hojas").upload(ruta, fotos[i].blob, { contentType: fotos[i].blob.type || "image/jpeg", upsert: true });
        if (e1) throw e1;
        rutas.push(ruta);
      }
      setEnviando("Guardando firma…");
      const firmaBlob = await firma.current!.aBlob();
      const rutaFirma = `${carpeta}/firma.png`;
      const { error: e2 } = await supabase.storage.from("hojas").upload(rutaFirma, firmaBlob!, { contentType: "image/png", upsert: true });
      if (e2) throw e2;

      setEnviando("Guardando hoja…");
      const { error: e3 } = await supabase.from("hojas_servicio").insert({
        id,
        sucursal_id: Number(sucursal),
        equipo: equipoFinal,
        tipo,
        ticket: ticket.trim() || null,
        falla: falla.trim(),
        trabajo: trabajo.trim(),
        refacciones: refs.map((r) => ({ descripcion: r.descripcion.trim(), cantidad: Number(r.cantidad), costo: Number(r.costo) })),
        mano_obra: Number(manoObra) || 0,
        total,
        fotos: rutas,
        firma_path: rutaFirma,
        recibe_nombre: recibe.trim(),
        activo_id: activoId || null,
        preventivo_id: tipo === "Preventivo" && preventivoId ? Number(preventivoId) : null,
      });
      if (e3) throw e3;

      try {
        localStorage.removeItem(BORRADOR);
      } catch {}
      router.push(`/servicio/${id}?nueva=1`);
      router.refresh();
    } catch (err) {
      console.error(err);
      setEnviando(null);
      setError("No se pudo enviar la hoja. Revisa tu señal y vuelve a tocar Enviar; no se pierde lo capturado.");
    }
  }

  return (
    <form onSubmit={enviar} className="stack" noValidate>
      <section className="card stack">
        <h3>1. Datos del servicio</h3>
        <div className="grid2">
          <label className="field">
            Sucursal
            <select id="h-sucursal" value={sucursal} onChange={(e) => elegirSucursal(e.target.value)} required>
              <option value="">Elige la sucursal</option>
              {Object.entries(
                sucursales.reduce<Record<string, typeof sucursales>>((acc, s) => ((acc[s.zona] ??= []).push(s), acc), {})
              ).map(([zona, lista]) => (
                <optgroup key={zona} label={zona}>
                  {lista.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nombre}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="field">
            Equipo
            <select id="h-equipo" value={equipo} onChange={(e) => setEquipo(e.target.value)} required>
              <option value="">Elige el equipo</option>
              {equipos.map((e) => (
                <option key={e}>{e}</option>
              ))}
              <option value="__otro">Otro (escribir)…</option>
            </select>
          </label>
          {equipo === "__otro" && (
            <label className="field">
              ¿Qué equipo o instalación?
              <input id="h-equipo-otro" value={equipoOtro} onChange={(e) => setEquipoOtro(e.target.value)} placeholder="Ej. Tarja, instalación eléctrica" />
            </label>
          )}
          <label className="field">
            Ticket de osTicket (opcional)
            <input id="h-ticket" value={ticket} onChange={(e) => setTicket(e.target.value)} inputMode="numeric" placeholder="Ej. 58207" />
          </label>
          {activosSuc.length > 0 && (
            <label className="field">
              Código del equipo (etiqueta QR)
              <select id="h-activo" value={activoId} onChange={(e) => elegirActivo(e.target.value)}>
                <option value="">No aplica / no tiene etiqueta</option>
                {activosSuc.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.id} · {a.equipo}{a.marca ? ` ${a.marca}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="field">
          Tipo de servicio
          <div className="segmented" role="radiogroup">
            {(["Correctivo", "Preventivo"] as const).map((t) => (
              <label key={t}>
                <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => setTipo(t)} />
                <span>{t}</span>
              </label>
            ))}
          </div>
        </div>
        {tipo === "Preventivo" && sucursal && (
          prevSuc.length ? (
            <label className="field">
              ¿Qué preventivo programado atendiste?
              <select id="h-prev" value={preventivoId} onChange={(e) => elegirPreventivo(e.target.value)}>
                <option value="">Ninguno de la lista</option>
                {prevSuc.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fecha.split("-").reverse().join("/")} · {p.equipo} · {p.tarea}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="sub" style={{ margin: 0 }}>No hay preventivos programados pendientes para esta sucursal.</p>
          )
        )}
      </section>

      <section className="card stack">
        <h3>2. Fotos de evidencia</h3>
        <p className="sub" style={{ margin: 0 }}>Toma fotos antes de intervenir y al terminar. Máximo {MAX_FOTOS}.</p>
        <div className="photos">
          {fotos.map((f, i) => (
            <div key={f.id} className="photo">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={`Foto ${i + 1}`} />
              <button type="button" className="x" onClick={() => quitarFoto(f.id)} aria-label={`Quitar foto ${i + 1}`}>
                ✕
              </button>
            </div>
          ))}
          {fotos.length < MAX_FOTOS && (
            <label className="photo add">
              {procesando ? "Procesando…" : "+ Tomar o elegir foto"}
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  agregarFotos(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      </section>

      <section className="card stack">
        <h3>3. Diagnóstico</h3>
        <label className="field">
          Falla reportada
          <textarea id="h-falla" rows={2} value={falla} onChange={(e) => setFalla(e.target.value)} placeholder="Lo que reportó la tienda" />
        </label>
        <label className="field">
          Trabajo realizado
          <textarea id="h-trabajo" rows={4} value={trabajo} onChange={(e) => setTrabajo(e.target.value)} placeholder="Qué encontraste y qué hiciste" />
        </label>
      </section>

      <section className="card">
        <h3>4. Refacciones y costo</h3>
        <p className="sub">Agrega cada refacción usada con su costo unitario.</p>
        {refs.map((r, i) => (
          <div key={i} className="ref-row">
            <label className="field">
              Refacción
              <input value={r.descripcion} onChange={(e) => setRef(i, "descripcion", e.target.value)} placeholder="Ej. Capacitor 35 µF" />
            </label>
            <label className="field">
              Cant.
              <input type="number" min={1} inputMode="numeric" value={r.cantidad || ""} onChange={(e) => setRef(i, "cantidad", e.target.value)} />
            </label>
            <label className="field">
              Costo c/u
              <input type="number" min={0} step="0.01" inputMode="decimal" value={r.costo || ""} onChange={(e) => setRef(i, "costo", e.target.value)} />
            </label>
            <button type="button" className="icon-btn" onClick={() => setRefs((p) => p.filter((_, j) => j !== i))} aria-label="Quitar refacción">
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="btn small" onClick={() => setRefs((p) => [...p, { descripcion: "", cantidad: 1, costo: 0 }])}>
          + Agregar refacción
        </button>
        <div className="totals">
          <label className="field" style={{ maxWidth: 200 }}>
            Mano de obra (MXN)
            <input id="h-mo" type="number" min={0} step="0.01" inputMode="decimal" value={manoObra} onChange={(e) => setManoObra(e.target.value)} placeholder="0" />
          </label>
          <div className="tot">
            <span className="eyebrow">Total</span>
            <b className="num">{mxn(total)}</b>
          </div>
        </div>
      </section>

      <section className="card stack">
        <h3>5. Conformidad de la tienda</h3>
        <label className="field">
          Nombre de quien recibe
          <input id="h-recibe" value={recibe} onChange={(e) => setRecibe(e.target.value)} placeholder="Nombre del encargado de turno" autoComplete="off" />
        </label>
        <div>
          <FirmaPad ref={firma} onCambio={setFirmaVacia} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <span className="sub" style={{ margin: 0 }}>
              {firmaVacia ? "Firma con el dedo" : "Firma capturada"}
            </span>
            <button type="button" className="btn small" onClick={() => firma.current?.limpiar()}>
              Borrar firma
            </button>
          </div>
        </div>
      </section>

      {error && <div className="note bad" role="alert">{error}</div>}
      <button className="btn primary big" type="submit" disabled={!!enviando || procesando}>
        {enviando ?? "Enviar hoja de servicio"}
      </button>
    </form>
  );
}
