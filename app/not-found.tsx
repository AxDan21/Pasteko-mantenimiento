import Link from "next/link";
import Header from "@/components/Header";

export default function NoEncontrado() {
  return (
    <>
      <Header />
      <main className="wrap" style={{ maxWidth: 560 }}>
        <div className="card">
          <h1 className="page-h" style={{ marginBottom: 6 }}>No encontramos esta página</h1>
          <p className="sub">Puede que el equipo ya no esté publicado o que el enlace esté incompleto.</p>
          <Link href="/" className="btn primary">Ir a los equipos</Link>
        </div>
      </main>
    </>
  );
}
