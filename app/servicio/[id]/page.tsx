import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import HojaView from "@/components/HojaView";
import { sesion } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Hoja } from "@/lib/types";

export default async function VerHoja({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ nueva?: string }>;
}) {
  const [{ id }, { nueva }] = await Promise.all([params, searchParams]);
  const s = await sesion();
  if (!s?.perfil) redirect("/login");
  const supabase = await createClient();
  const { data: hoja } = await supabase.from("v_hojas").select("*").eq("id", id).maybeSingle<Hoja>();
  if (!hoja) notFound();

  return (
    <>
      <Header items={[{ href: "/servicio", label: "Mis hojas" }]} salir sub={s.perfil.nombre} />
      <main className="wrap">
        <div className="detail-head no-print">
          <Link href="/servicio" className="btn small">
            ← Mis hojas
          </Link>
          <Link href="/servicio/nueva" className="btn primary small">
            + Nueva hoja
          </Link>
        </div>
        {nueva && (
          <div className="note ok no-print" style={{ marginBottom: 14, maxWidth: 860 }}>
            Hoja enviada a Mantenimiento.
          </div>
        )}
        <HojaView hoja={hoja} />
      </main>
    </>
  );
}
