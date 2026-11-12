-- =========================================================
-- Pasteko Mantenimiento · Gantt de aperturas con dependencias, "Mi semana" y rol de consulta
-- Ejecutar DESPUÉS de 0007_catalogo_equipos.sql (SQL Editor > New query > Run)
-- No borra datos. Las aperturas existentes quedan con el formato anterior y se pueden convertir.
-- =========================================================

-- ---------- Configuración de cada apertura ----------
alter table public.aperturas
  add column if not exists modelo text not null default 'v2' check (modelo in ('v1', 'v2')),
  add column if not exists fecha_pago date,                       -- arranque del Gantt
  add column if not exists dias_obra int not null default 31 check (dias_obra between 1 and 365),
  add column if not exists dias_proveedor int not null default 30 check (dias_proveedor between 1 and 180),
  add column if not exists lleva_bebidas boolean not null default true,
  add column if not exists apertura_meta date,                    -- fecha comprometida de apertura suave
  add column if not exists cerrada boolean not null default false;

-- Las aperturas capturadas antes de este cambio usan el formato anterior
update public.aperturas set modelo = 'v1' where fecha_pago is null;

-- ---------- Pasos del Gantt ----------
alter table public.apertura_items
  add column if not exists clave text,                 -- paso de la plantilla (pago, obra, instalacion, ...)
  add column if not exists inicio date,                -- inicio planeado (tareas con duración)
  add column if not exists duracion int check (duracion between 0 and 365),
  add column if not exists fecha_base date,            -- fecha planeada original (para medir planeado contra real)
  add column if not exists fecha_fija date,            -- fecha capturada a mano en casos especiales
  add column if not exists fecha_real date,            -- cuándo se cumplió de verdad
  add column if not exists estado text not null default 'pendiente' check (estado in ('pendiente', 'en_proceso', 'bloqueado', 'hecho')),
  add column if not exists motivo text;                -- por qué está bloqueado

update public.apertura_items set estado = 'hecho' where hecho and estado = 'pendiente';
create unique index if not exists apertura_items_clave_uq on public.apertura_items (apertura_id, clave) where clave is not null;
create index if not exists apertura_items_fecha_idx on public.apertura_items (fecha) where estado <> 'hecho';

-- ---------- Rol de solo consulta (dirección) ----------
alter table public.perfiles drop constraint if exists perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check check (rol in ('tecnico', 'admin', 'supervisor', 'consulta'));

create or replace function public.es_consulta()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'consulta' and activo);
$$;

drop policy if exists "consulta lee aperturas" on public.aperturas;
create policy "consulta lee aperturas" on public.aperturas for select using (public.es_consulta());
drop policy if exists "consulta lee pasos de aperturas" on public.apertura_items;
create policy "consulta lee pasos de aperturas" on public.apertura_items for select using (public.es_consulta());
