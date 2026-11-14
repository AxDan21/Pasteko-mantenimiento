"use client";
import { useState } from "react";
import { guardarUbicacionGps } from "@/app/censo/actions";
import { distanciaKm, enlaceMaps } from "@/lib/geo";

type Previa = { lat: number; lng: number; fuente: string | null; fecha: string | null } | null;
type Lectura = { lat: number; lng: number; precision: number };

/** El supervisor, parado en la tienda, guarda su ubicación con el GPS del celular. */
export default function BotonUbicacion({ sucursalId, previa }: { sucursalId: number; previa: Previa }) {
  const [estado, setEstado] = useState<"" | "buscando" | "revisar" | "guardando" | "listo">("");
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [error, setError] = useState("");
  const [guardada, setGuardada] = useState<Previa>(previa);

  function buscar() {
    setError("");
    if (!("geolocation" in navigator)) { setError("Este navegador no puede leer la ubicación."); return; }
    setEstado("buscando");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const l = { lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy };
        setLectura(l);
        setEstado("revisar");
      },
      (e) => {
        setEstado("");
        setError(e.code === e.PERMISSION_DENIED
          ? "No diste permiso de ubicación. Actívalo en el candado de la barra de direcciones (o en Ajustes › Privacidad › Localización) y vuelve a intentar."
          : "No se pudo obtener la ubicación. Sal a la entrada de la tienda o activa el GPS e inténtalo de nuevo.");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  }

  async function guardar() {
    if (!lectura) return;
    setEstado("guardando");
    const r = await guardarUbicacionGps(sucursalId, lectura.lat, lectura.lng, lectura.precision);
    if (!r.ok) { setError(r.error); setEstado("revisar"); return; }
    setGuardada({ lat: lectura.lat, lng: lectura.lng, fuente: "gps", fecha: new Date().toISOString() });
    setEstado("listo");
  }

  const lejos = lectura && guardada ? distanciaKm(lectura, guardada) : 0;
  const precisionMala = lectura ? lectura.precision > 100 : false;

  return (
    <section className="card ubi-card">
      <div className="ubi-head">
        <span className={`ubi-ico ${guardada ? "ok" : ""}`} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>
        </span>
        <div>
          <h3>Ubicación de la tienda</h3>
          <p className="sub" style={{ margin: 0 }}>
            {guardada
              ? <>Guardada{guardada.fuente === "gps" ? " con GPS" : " desde Maps"}{guardada.fecha ? ` el ${new Date(guardada.fecha).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}` : ""} · <a href={enlaceMaps(guardada)} target="_blank" rel="noopener noreferrer">ver en el mapa</a></>
              : "Todavía no tiene ubicación. Guárdala estando dentro o en la entrada de la tienda."}
          </p>
        </div>
      </div>

      {estado === "revisar" && lectura && (
        <div className="ubi-check">
          <p>
            Precisión: <b>± {Math.round(lectura.precision)} m</b>
            {precisionMala ? " · baja. Sal a la entrada o espera unos segundos y vuelve a medir." : " · buena."}
          </p>
          {guardada && lejos > 0.3 && <p className="note warn">La ubicación nueva está a {lejos < 10 ? lejos.toFixed(1) : Math.round(lejos)} km de la guardada. Guárdala solo si estás en la tienda.</p>}
          <div className="ubi-btns">
            <button type="button" className="btn primary" onClick={guardar}>Guardar esta ubicación</button>
            <button type="button" className="btn" onClick={buscar}>Medir otra vez</button>
            <a className="btn" href={enlaceMaps(lectura)} target="_blank" rel="noopener noreferrer">Revisar en Maps</a>
          </div>
        </div>
      )}

      {(estado === "" || estado === "listo" || estado === "buscando") && (
        <button type="button" className={`btn ${guardada ? "" : "primary"} ubi-main`} disabled={estado === "buscando"} onClick={buscar}>
          {estado === "buscando" ? "Buscando señal GPS…" : estado === "listo" ? "✓ Guardada · medir de nuevo" : guardada ? "Actualizar ubicación" : "Estoy en la tienda: guardar ubicación"}
        </button>
      )}
      {estado === "guardando" && <p className="sub">Guardando…</p>}
      {error && <p className="note bad" style={{ marginTop: 10 }}>{error}</p>}
    </section>
  );
}
