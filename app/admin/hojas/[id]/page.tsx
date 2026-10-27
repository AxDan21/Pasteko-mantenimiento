import Link from "next/link";
import { notFound } from "next/navigation";
import HojaView from "@/components/HojaView";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Hoja } from "@/lib/types";
import { revisarHoja } from "../../actions";

export default async function HojaAdmin({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();
  const { data: hoja } = await supabase.from("v_hojas").select("*").eq("id", id).maybeSingle<Hoja>();
  if (!hoja) notFound();

  return (
    <>
      <main className="wrap">
        <div className="detail-head no-print">
          <Link href="/admin/hojas" className="btn small">← Hojas de servicio</Link>
        </div>
        <div className="detail" style={{ gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)" }}>
          <HojaView hoja={hoja} />
          <form action={revisarHoja} className="card stack no-print">
            <h3>Revisión</h3>
            <input type="hidden" name="id" value={hoja.id} />
            <label className="field">
              Notas de mantenimiento
              <textarea id="notas" name="notas" rows={4} defaultValue={hoja.notas_admin ?? ""} placeholder="Ej. Costo validado con factura 1234" />
            </label>
            <label className="field">
              Estado
              <select id="estado" name="estado" defaultValue={hoja.estado}>
                <option>Enviada</option>
                <option>Revisada</option>
              </select>
            </label>
            <button className="btn primary" type="submit">Guardar revisión</button>
          </form>
        </div>
      </main>
    </>
  );
}
