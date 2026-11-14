-- =========================================================
-- Pasteko Mantenimiento · ubicación de sucursales y base de técnicos
-- Ejecutar DESPUÉS de 0012_bucket_xml.sql (SQL Editor > New query > Run)
-- =========================================================

alter table public.sucursales
  add column if not exists lat double precision check (lat between -90 and 90),
  add column if not exists lng double precision check (lng between -180 and 180),
  add column if not exists direccion text,
  add column if not exists ubicacion_fuente text check (ubicacion_fuente in ('maps', 'gps', 'manual')),
  add column if not exists ubicacion_precision int,          -- metros (solo GPS)
  add column if not exists ubicacion_fecha timestamptz,
  add column if not exists ubicacion_por uuid references public.perfiles(id);

-- Base de operación de cada técnico (ciudad o colonia, no su domicilio exacto)
alter table public.perfiles
  add column if not exists base_nombre text,
  add column if not exists base_lat double precision check (base_lat between -90 and 90),
  add column if not exists base_lng double precision check (base_lng between -180 and 180);

-- El supervisor guarda la ubicación de una tienda de SU zona estando en ella (GPS del celular)
create or replace function public.guardar_ubicacion_gps(p_sucursal int, p_lat double precision, p_lng double precision, p_precision int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.es_admin() or exists (
    select 1 from public.sucursales where id = p_sucursal and zona = public.zona_usuario() and public.es_supervisor()
  )) then
    raise exception 'Sin permiso para esta sucursal';
  end if;
  update public.sucursales
     set lat = p_lat, lng = p_lng, ubicacion_fuente = 'gps', ubicacion_precision = p_precision,
         ubicacion_fecha = now(), ubicacion_por = auth.uid()
   where id = p_sucursal;
end $$;
