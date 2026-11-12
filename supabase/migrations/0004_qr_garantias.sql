-- =========================================================
-- Pasteko Mantenimiento · QR de equipos y documentos de garantía
-- Ejecutar DESPUÉS de 0003_gantt_aperturas.sql (SQL Editor > New query > Run)
-- =========================================================

-- Documento de garantía (PDF o foto) en el bucket privado "facturas", carpeta garantias/
alter table public.activos add column if not exists garantia_path text;

-- Datos mínimos de un equipo para quien escanea el QR sin sesión (personal de tienda):
-- solo nombre del equipo, sucursal y la guía pública. Nada de costos ni historial.
create or replace function public.activo_publico(p_id text)
returns table (id text, equipo text, sucursal text, slug text)
language sql stable security definer set search_path = public as $$
  select a.id, a.equipo, s.nombre, e.slug
  from public.activos a
  join public.sucursales s on s.id = a.sucursal_id
  left join public.equipos e on e.nombre = a.equipo and e.publicado
  where a.id = upper(p_id) and a.activo;
$$;
grant execute on function public.activo_publico(text) to anon, authenticated;

-- Historial de servicios de un equipo para técnicos activos (todas las hojas, de cualquier técnico).
-- Sin costos: el detalle de dinero solo lo ve el administrador en el panel.
create or replace function public.historial_activo(p_id text)
returns table (id uuid, creada timestamptz, folio bigint, tipo text, falla text, trabajo text, tecnico text, refacciones jsonb)
language sql stable security definer set search_path = public as $$
  select h.id, h.creada, h.folio, h.tipo, h.falla, h.trabajo, p.nombre,
         coalesce((select jsonb_agg(r - 'costo') from jsonb_array_elements(h.refacciones) r), '[]'::jsonb)
  from public.hojas_servicio h
  join public.perfiles p on p.id = h.tecnico_id
  where h.activo_id = upper(p_id) and public.es_tecnico_activo()
  order by h.creada desc
  limit 50;
$$;
revoke execute on function public.historial_activo(text) from public, anon;
grant execute on function public.historial_activo(text) to authenticated;
