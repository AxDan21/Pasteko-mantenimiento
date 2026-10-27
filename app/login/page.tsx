import Header from "@/components/Header";
import { iniciarSesion } from "./actions";

const ERRORES: Record<string, string> = {
  credenciales: "Correo o contraseña incorrectos. Revisa e intenta de nuevo.",
  inactivo: "Tu usuario está desactivado. Pide a Mantenimiento que lo active.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <>
      <Header sub="Acceso de técnicos y mantenimiento" />
      <main className="wrap" style={{ maxWidth: 460 }}>
        <div className="card">
          <p className="eyebrow">Acceso</p>
          <h1 className="page-h" style={{ marginBottom: 6 }}>
            Inicia sesión
          </h1>
          <p className="sub">Solo para técnicos y el equipo de mantenimiento. Las tiendas no necesitan usuario.</p>
          <form action={iniciarSesion} className="stack">
            <input type="hidden" name="next" value={next ?? ""} />
            <label className="field">
              Correo
              <input id="email" name="email" type="email" autoComplete="email" required />
            </label>
            <label className="field">
              Contraseña
              <input id="password" name="password" type="password" autoComplete="current-password" required />
            </label>
            {error && <div className="note bad">{ERRORES[error] ?? "No se pudo iniciar sesión."}</div>}
            <button className="btn primary big" type="submit">
              Entrar
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
