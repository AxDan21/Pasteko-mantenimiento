import { redirect } from "next/navigation";

/** Se unió a Sucursales → Por zona y supervisor. */
export default async function Supervisores({ searchParams }: { searchParams: Promise<{ zona?: string }> }) {
  const { zona } = await searchParams;
  redirect(`/admin/sucursales/zonas${zona ? `?zona=${encodeURIComponent(zona)}` : ""}`);
}
