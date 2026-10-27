-- =========================================================
-- Pasteko Mantenimiento · módulos del panel
-- Ejecutar DESPUÉS de 0001_init.sql (SQL Editor > New query > Run)
-- =========================================================

-- ---------- Ajustes (presupuesto y fondo de caja chica) ----------
create table public.ajustes (
  clave  text primary key,
  valor  numeric(12,2) not null
);
insert into public.ajustes values ('presupuesto_mensual', 70000), ('fondo_caja_chica', 10000)
on conflict (clave) do nothing;

-- ---------- Proveedores externos ----------
create table public.proveedores (
  id            serial primary key,
  nombre        text not null,
  especialidad  text not null,
  cobertura     text,
  contacto      text,
  telefono      text,
  correo        text,
  calificacion  numeric(2,1) check (calificacion between 1 and 5),
  notas         text,
  activo        boolean not null default true
);

-- ---------- Activos (inventario de equipos) ----------
create table public.activos (
  id                text primary key check (id ~ '^[A-Z0-9-]+$'),   -- código del QR, ej. PK-CAF-003
  sucursal_id       int not null references public.sucursales(id),
  equipo            text not null,                                 -- nombre del tipo de equipo
  marca             text,
  modelo            text,
  serie             text,
  fecha_compra      date,
  garantia_hasta    date,
  costo             numeric(12,2) not null default 0 check (costo >= 0),
  vida_anios        int not null default 8 check (vida_anios > 0),
  proveedor_id      int references public.proveedores(id),
  activo            boolean not null default true,                 -- false = dado de baja
  notas             text
);
create index activos_sucursal_idx on public.activos (sucursal_id);

-- ---------- Preventivos programados ----------
create table public.preventivos (
  id            serial primary key,
  fecha         date not null,
  sucursal_id   int not null references public.sucursales(id),
  equipo        text not null,
  activo_id     text references public.activos(id) on delete set null,
  tarea         text not null,
  tecnico_id    uuid references public.perfiles(id),
  proveedor_id  int references public.proveedores(id),
  hecho         boolean not null default false,
  hoja_id       uuid references public.hojas_servicio(id) on delete set null,
  notas         text,
  creado        timestamptz not null default now()
);
create index preventivos_fecha_idx on public.preventivos (fecha);

-- Enlaces de la hoja de servicio con preventivo y activo
alter table public.hojas_servicio
  add column preventivo_id int references public.preventivos(id) on delete set null,
  add column activo_id text references public.activos(id) on delete set null;

-- Al enviar una hoja ligada a un preventivo, el preventivo queda hecho
create or replace function public.cerrar_preventivo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.preventivo_id is not null then
    update public.preventivos set hecho = true, hoja_id = new.id where id = new.preventivo_id;
  end if;
  return new;
end $$;
create trigger al_crear_hoja after insert on public.hojas_servicio
for each row execute function public.cerrar_preventivo();

-- ---------- Gastos manuales (facturas, compras, servicios de proveedor) ----------
create table public.gastos (
  id            serial primary key,
  fecha         date not null default current_date,
  sucursal_id   int references public.sucursales(id),
  categoria     text not null,
  tipo          text not null default 'Correctivo' check (tipo in ('Preventivo','Correctivo','Otro')),
  concepto      text not null,
  monto         numeric(12,2) not null check (monto > 0),
  proveedor_id  int references public.proveedores(id),
  activo_id     text references public.activos(id) on delete set null,
  factura_path  text,
  creado        timestamptz not null default now()
);
create index gastos_fecha_idx on public.gastos (fecha);

-- ---------- Caja chica ----------
create table public.caja_chica (
  id            serial primary key,
  fecha         date not null default current_date,
  concepto      text not null,
  sucursal_id   int references public.sucursales(id),
  monto         numeric(12,2) not null check (monto > 0),
  factura_path  text,
  creado        timestamptz not null default now()
);
create index caja_fecha_idx on public.caja_chica (fecha);

-- ---------- Refacciones en almacén ----------
create table public.refacciones (
  id         serial primary key,
  codigo     text unique,
  nombre     text not null,
  equipo     text,
  ubicacion  text not null default 'Almacén Pachuca',
  stock      int not null default 0 check (stock >= 0),
  minimo     int not null default 1 check (minimo >= 0),
  costo      numeric(12,2) not null default 0 check (costo >= 0)
);

-- ---------- Aperturas de sucursal ----------
create table public.aperturas (
  id      serial primary key,
  nombre  text not null,
  fecha   date not null,
  notas   text,
  creado  timestamptz not null default now()
);
create table public.apertura_items (
  id           serial primary key,
  apertura_id  int not null references public.aperturas(id) on delete cascade,
  grupo        text not null,
  texto        text not null,
  hecho        boolean not null default false,
  orden        int not null default 0
);

-- ---------- Vista unificada de gastos (hojas + gastos manuales + caja chica) ----------
create view public.v_gastos with (security_invoker = true) as
select 'hoja'::text as origen, h.id::text as ref, (h.creada at time zone 'America/Mexico_City')::date as fecha,
       h.sucursal_id, s.nombre as sucursal, s.zona,
       coalesce(e.categoria, 'Otros') as categoria, h.tipo,
       'Hoja HS-' || lpad(h.folio::text, 6, '0') || ' · ' || h.equipo as concepto,
       h.total as monto, h.activo_id
from public.hojas_servicio h
join public.sucursales s on s.id = h.sucursal_id
left join public.equipos e on e.nombre = h.equipo
where h.total > 0
union all
select 'gasto', g.id::text, g.fecha, g.sucursal_id, s.nombre, s.zona, g.categoria, g.tipo, g.concepto, g.monto, g.activo_id
from public.gastos g left join public.sucursales s on s.id = g.sucursal_id
union all
select 'caja', c.id::text, c.fecha, c.sucursal_id, s.nombre, s.zona, 'Caja chica', 'Correctivo', c.concepto, c.monto, null
from public.caja_chica c left join public.sucursales s on s.id = c.sucursal_id;

-- ---------- Seguridad ----------
alter table public.ajustes        enable row level security;
alter table public.proveedores    enable row level security;
alter table public.activos        enable row level security;
alter table public.preventivos    enable row level security;
alter table public.gastos         enable row level security;
alter table public.caja_chica     enable row level security;
alter table public.refacciones    enable row level security;
alter table public.aperturas      enable row level security;
alter table public.apertura_items enable row level security;

-- Administrador: todo
create policy "admin ajustes"     on public.ajustes        for all using (public.es_admin()) with check (public.es_admin());
create policy "admin proveedores" on public.proveedores    for all using (public.es_admin()) with check (public.es_admin());
create policy "admin activos"     on public.activos        for all using (public.es_admin()) with check (public.es_admin());
create policy "admin preventivos" on public.preventivos    for all using (public.es_admin()) with check (public.es_admin());
create policy "admin gastos"      on public.gastos         for all using (public.es_admin()) with check (public.es_admin());
create policy "admin caja"        on public.caja_chica     for all using (public.es_admin()) with check (public.es_admin());
create policy "admin refacciones" on public.refacciones    for all using (public.es_admin()) with check (public.es_admin());
create policy "admin aperturas"   on public.aperturas      for all using (public.es_admin()) with check (public.es_admin());
create policy "admin ap items"    on public.apertura_items for all using (public.es_admin()) with check (public.es_admin());

-- Técnicos: ven los equipos (para ligarlos a la hoja) y los preventivos pendientes
create policy "tecnico lee activos" on public.activos for select using (public.es_tecnico_activo());
create policy "tecnico lee preventivos" on public.preventivos for select
  using (public.es_tecnico_activo() and not hecho);

-- Facturas: bucket privado solo para el administrador
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('facturas', 'facturas', false, 8388608, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;
create policy "admin facturas" on storage.objects for all to authenticated
  using (bucket_id = 'facturas' and public.es_admin())
  with check (bucket_id = 'facturas' and public.es_admin());
