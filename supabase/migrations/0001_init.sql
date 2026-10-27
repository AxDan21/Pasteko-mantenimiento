-- =========================================================
-- Pasteko Mantenimiento · esquema inicial
-- Ejecutar en Supabase: SQL Editor > New query > pegar y Run
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- Catálogos ----------
create table public.sucursales (
  id          serial primary key,
  nombre      text not null unique,
  zona        text not null,
  supervisor  text,
  activa      boolean not null default true
);

create table public.equipos (
  id         serial primary key,
  slug       text not null unique check (slug ~ '^[a-z0-9-]+$'),
  nombre     text not null,
  categoria  text not null,
  icono      text not null default 'general',
  orden      int  not null default 0,
  publicado  boolean not null default true
);

create table public.videos (
  id          serial primary key,
  equipo_id   int not null references public.equipos(id) on delete cascade,
  titulo      text not null,
  youtube_url text not null,
  duracion    text,
  orden       int not null default 0
);

create table public.faqs (
  id               serial primary key,
  equipo_id        int not null references public.equipos(id) on delete cascade,
  pregunta         text not null,
  pasos            text[] not null default '{}',
  aviso_seguridad  text,
  orden            int not null default 0
);

-- ---------- Usuarios internos (técnicos y administradores) ----------
create table public.perfiles (
  id      uuid primary key references auth.users(id) on delete cascade,
  nombre  text not null,
  rol     text not null default 'tecnico' check (rol in ('tecnico','admin')),
  zona    text,
  activo  boolean not null default true,
  creado  timestamptz not null default now()
);

-- Crea el perfil automáticamente al dar de alta un usuario en Authentication.
-- El nombre se toma de user_metadata.nombre si existe; si no, del correo.
create or replace function public.crear_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (id, nombre)
  values (new.id, coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger al_crear_usuario
after insert on auth.users
for each row execute function public.crear_perfil();

create or replace function public.es_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and rol = 'admin' and activo);
$$;

create or replace function public.es_tecnico_activo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfiles where id = auth.uid() and activo);
$$;

-- ---------- Hojas de servicio ----------
create table public.hojas_servicio (
  id             uuid primary key default gen_random_uuid(),
  folio          bigint generated always as identity (start with 1001) unique,
  tecnico_id     uuid not null default auth.uid() references public.perfiles(id),
  sucursal_id    int  not null references public.sucursales(id),
  equipo         text not null,
  tipo           text not null check (tipo in ('Preventivo','Correctivo')),
  ticket         text,
  falla          text not null,
  trabajo        text not null,
  refacciones    jsonb not null default '[]'::jsonb,  -- [{descripcion, cantidad, costo}]
  mano_obra      numeric(12,2) not null default 0 check (mano_obra >= 0),
  total          numeric(12,2) not null default 0 check (total >= 0),
  fotos          text[] not null default '{}',        -- rutas en el bucket "hojas"
  firma_path     text not null,
  recibe_nombre  text not null,
  estado         text not null default 'Enviada' check (estado in ('Enviada','Revisada')),
  notas_admin    text,
  creada         timestamptz not null default now()
);

create index hojas_creada_idx   on public.hojas_servicio (creada desc);
create index hojas_tecnico_idx  on public.hojas_servicio (tecnico_id);
create index hojas_sucursal_idx on public.hojas_servicio (sucursal_id);

-- Vista para el panel y para Power BI
create view public.v_hojas with (security_invoker = true) as
select h.*, s.nombre as sucursal, s.zona, p.nombre as tecnico
from public.hojas_servicio h
join public.sucursales s on s.id = h.sucursal_id
join public.perfiles  p on p.id = h.tecnico_id;

-- ---------- Seguridad (RLS) ----------
alter table public.sucursales     enable row level security;
alter table public.equipos        enable row level security;
alter table public.videos         enable row level security;
alter table public.faqs           enable row level security;
alter table public.perfiles       enable row level security;
alter table public.hojas_servicio enable row level security;

-- Contenido público: cualquiera (tiendas y supervisores, sin usuario) puede leer lo publicado
create policy "leer sucursales" on public.sucursales for select using (true);
create policy "leer equipos publicados" on public.equipos for select using (publicado or public.es_admin());
create policy "leer videos" on public.videos for select
  using (exists (select 1 from public.equipos e where e.id = equipo_id and (e.publicado or public.es_admin())));
create policy "leer faqs" on public.faqs for select
  using (exists (select 1 from public.equipos e where e.id = equipo_id and (e.publicado or public.es_admin())));

-- Solo el administrador modifica catálogos y contenido
create policy "admin sucursales" on public.sucursales for all using (public.es_admin()) with check (public.es_admin());
create policy "admin equipos"    on public.equipos    for all using (public.es_admin()) with check (public.es_admin());
create policy "admin videos"     on public.videos     for all using (public.es_admin()) with check (public.es_admin());
create policy "admin faqs"       on public.faqs       for all using (public.es_admin()) with check (public.es_admin());

-- Perfiles: cada quien ve el suyo; el admin ve y edita todos
create policy "ver mi perfil" on public.perfiles for select using (id = auth.uid() or public.es_admin());
create policy "admin perfiles" on public.perfiles for update using (public.es_admin()) with check (public.es_admin());

-- Hojas: el técnico crea y ve las suyas; el admin ve y actualiza todas
create policy "tecnico crea hoja" on public.hojas_servicio for insert
  with check (tecnico_id = auth.uid() and public.es_tecnico_activo() and estado = 'Enviada');
create policy "ver hojas" on public.hojas_servicio for select
  using (tecnico_id = auth.uid() or public.es_admin());
create policy "admin actualiza hojas" on public.hojas_servicio for update
  using (public.es_admin()) with check (public.es_admin());

-- ---------- Almacenamiento de fotos y firmas ----------
-- Bucket privado. Ruta: <id del técnico>/<id de la hoja>/<archivo>
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hojas', 'hojas', false, 3145728, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "tecnico sube a su carpeta" on storage.objects for insert to authenticated
  with check (bucket_id = 'hojas' and (storage.foldername(name))[1] = auth.uid()::text and public.es_tecnico_activo());
create policy "ver archivos de hojas" on storage.objects for select to authenticated
  using (bucket_id = 'hojas' and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin()));
