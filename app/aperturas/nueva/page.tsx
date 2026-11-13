import Link from "next/link";
import NuevaApertura from "@/components/aperturas/NuevaApertura";
import { requireAdmin } from "@/lib/auth";
import { hoy } from "@/lib/panel";

export const metadata = { title: "Nueva apertura · Pasteko" };

export default async function Nueva({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireAdmin();
  const { error } = await searchParams;
  return (
    <main className="wrap ax">
      <div className="ax-head">
        <div>
          <p className="ax-eyebrow"><Link href="/aperturas">Aperturas</Link> · nueva</p>
          <h1 className="ax-h1">Nueva apertura</h1>
        </div>
      </div>
      {error && <div className="ax-alert bad"><div><b>{error}</b></div></div>}
      <NuevaApertura hoy={hoy()} />
    </main>
  );
}
