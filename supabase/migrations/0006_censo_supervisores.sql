-- =========================================================
-- Pasteko Mantenimiento · censo de equipos por supervisores
-- Ejecutar DESPUÉS de 0005_estado_pago.sql (SQL Editor > New query > Run)
-- No borra datos: agrega un rol, columnas y permisos.
-- =========================================================

-- ---------- Rol supervisor ----------
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('tecnico', 'admin', 'supervisor'));

create or replace function public.es_supervisor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'supervisor' and activo);
$$;

create or replace function public.zona_usuario()
returns text language sql stable security definer set search_path = public as $$
  select zona from public.perfiles where id = auth.uid() and activo;
$$;

-- Los supervisores NO crean hojas de servicio ni ven el historial con trabajo técnico:
-- "técnico activo" ahora significa rol técnico o administrador.
create or replace function public.es_tecnico_activo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo and rol in ('tecnico', 'admin'));
$$;

-- ---------- Datos del censo en activos ----------
alter table public.activos
  add column if not exists descripcion text,
  add column if not exists ficha_path text,          -- foto de la placa / ficha técnica (bucket "censo")
  add column if not exists foto_path text,           -- foto del equipo completo (opcional)
  add column if not exists registrado_por uuid references public.perfiles(id) default auth.uid(),
  add column if not exists registrado timestamptz not null default now(),
  add column if not exists validado boolean not null default true,
  add column if not exists validado_por uuid references public.perfiles(id),
  add column if not exists validado_en timestamptz;

create index if not exists activos_validado_idx on public.activos (validado) where not validado;

-- Código automático (PK-CAF-012) cuando no se manda uno. Prefijo: 3 letras del tipo de equipo.
create or replace function public.asignar_codigo_activo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  pref text;
  n int;
begin
  if new.id is not null and new.id <> '' then
    new.id := upper(new.id);
    return new;
  end if;
  pref := upper(left(regexp_replace(translate(coalesce(new.equipo, 'EQP'), 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU'), '[^A-Za-z]', '', 'g'), 3));
  if length(pref) < 3 then pref := rpad(pref, 3, 'X'); end if;
  perform pg_advisory_xact_lock(hashtext('activo-' || pref));
  select coalesce(max(nullif(regexp_replace(id, '^PK-' || pref || '-', ''), '')::int), 0) + 1
    into n
    from public.activos
   where id ~ ('^PK-' || pref || '-[0-9]+$');
  new.id := 'PK-' || pref || '-' || lpad(n::text, 3, '0');
  return new;
end $$;

drop trigger if exists antes_crear_activo on public.activos;
create trigger antes_crear_activo before insert on public.activos
for each row execute function public.asignar_codigo_activo();

-- ¿Ese número de serie ya está registrado? (evita duplicados entre supervisores)
create or replace function public.serie_registrada(p_serie text)
returns table (id text, sucursal text, equipo text)
language sql stable security definer set search_path = public as $$
  select a.id, s.nombre, a.equipo
  from public.activos a join public.sucursales s on s.id = a.sucursal_id
  where p_serie is not null and length(trim(p_serie)) >= 3
    and upper(regexp_replace(a.serie, '\s', '', 'g')) = upper(regexp_replace(p_serie, '\s', '', 'g'))
    and (public.es_supervisor() or public.es_admin())
  limit 1;
$$;

-- ---------- Avance del censo por sucursal ----------
alter table public.sucursales
  add column if not exists censo_completo boolean not null default false,
  add column if not exists censo_fecha timestamptz,
  add column if not exists censo_por uuid references public.perfiles(id);

create or replace function public.marcar_censo(p_sucursal int, p_completo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.es_admin() or exists (
    select 1 from public.sucursales where id = p_sucursal and zona = public.zona_usuario() and public.es_supervisor()
  )) then
    raise exception 'Sin permiso para esta sucursal';
  end if;
  update public.sucursales
     set censo_completo = p_completo,
         censo_fecha = case when p_completo then now() else null end,
         censo_por = case when p_completo then auth.uid() else null end
   where id = p_sucursal;
end $$;

-- ---------- Permisos del supervisor (solo su zona) ----------
create policy "supervisor lee activos de su zona" on public.activos for select
  using (public.es_supervisor() and sucursal_id in (select id from public.sucursales where zona = public.zona_usuario()));

create policy "supervisor registra activos de su zona" on public.activos for insert
  with check (
    public.es_supervisor() and not validado and registrado_por = auth.uid()
    and sucursal_id in (select id from public.sucursales where zona = public.zona_usuario())
  );

create policy "supervisor corrige activos sin validar" on public.activos for update
  using (public.es_supervisor() and not validado and sucursal_id in (select id from public.sucursales where zona = public.zona_usuario()))
  with check (public.es_supervisor() and not validado and sucursal_id in (select id from public.sucursales where zona = public.zona_usuario()));

create policy "supervisor borra sus activos sin validar" on public.activos for delete
  using (public.es_supervisor() and not validado and registrado_por = auth.uid());

-- ---------- Fotos del censo ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('censo', 'censo', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "supervisor sube fotos de censo" on storage.objects for insert to authenticated
  with check (bucket_id = 'censo' and (storage.foldername(name))[1] = auth.uid()::text and (public.es_supervisor() or public.es_admin()));
create policy "personal interno ve fotos de censo" on storage.objects for select to authenticated
  using (bucket_id = 'censo' and (public.es_supervisor() or public.es_tecnico_activo()));
create policy "admin borra fotos de censo" on storage.objects for delete to authenticated
  using (bucket_id = 'censo' and public.es_admin());
