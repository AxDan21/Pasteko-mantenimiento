-- Mesa de ayuda de mantenimiento: la tienda reporta desde el QR del equipo,
-- el administrador recibe una notificación push, asigna técnico y el ticket
-- se cierra solo cuando el técnico envía la hoja de servicio con su folio.

-- ---------- Tickets ----------
create table if not exists public.tickets (
  id             uuid primary key default gen_random_uuid(),
  folio          bigint generated always as identity (start with 1) unique,
  token          text not null unique default replace(gen_random_uuid()::text, '-', ''),  -- enlace de seguimiento de la tienda
  activo_id      text references public.activos(id),
  sucursal_id    int  not null references public.sucursales(id),
  equipo         text not null,
  sintoma        text not null,
  desde          text,                                   -- hoy, ayer, varios días
  detalle        text,
  puede_vender   text not null check (puede_vender in ('si','parcial','no')),
  prioridad      text not null check (prioridad in ('alta','media','baja')),
  reporta_nombre text not null,
  reporta_tel    text,
  fotos          text[] not null default '{}',          -- rutas en el bucket "tickets"
  estado         text not null default 'abierto' check (estado in ('abierto','asignado','en_proceso','resuelto','cancelado')),
  tecnico_id     uuid references public.perfiles(id),
  hoja_id        uuid references public.hojas_servicio(id),
  creado         timestamptz not null default now(),
  actualizado    timestamptz not null default now(),
  asignado_en    timestamptz,
  resuelto_en    timestamptz
);
create index if not exists tickets_estado_idx on public.tickets (estado, creado desc);
create index if not exists tickets_activo_idx on public.tickets (activo_id) where estado in ('abierto','asignado','en_proceso');

create table if not exists public.ticket_eventos (
  id         bigint generated always as identity primary key,
  ticket_id  uuid not null references public.tickets(id) on delete cascade,
  creado     timestamptz not null default now(),
  tipo       text not null check (tipo in ('creado','reporte','asignado','estado','nota','hoja','cancelado')),
  texto      text not null,
  publico    boolean not null default true,     -- false = nota interna, la tienda no la ve
  autor      text
);
create index if not exists ticket_eventos_idx on public.ticket_eventos (ticket_id, creado);

-- ---------- Suscripciones a notificaciones push ----------
create table if not exists public.push_suscripciones (
  id          bigint generated always as identity primary key,
  usuario_id  uuid not null references public.perfiles(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  dispositivo text,
  creado      timestamptz not null default now()
);

alter table public.tickets enable row level security;
alter table public.ticket_eventos enable row level security;
alter table public.push_suscripciones enable row level security;

-- La tienda no tiene sesión: crea y consulta tickets por el servidor (llave de servicio) y por funciones con token.
drop policy if exists "admin tickets" on public.tickets;
create policy "admin tickets" on public.tickets for all using (public.es_admin()) with check (public.es_admin());
drop policy if exists "tecnico ve sus tickets" on public.tickets;
create policy "tecnico ve sus tickets" on public.tickets for select using (tecnico_id = auth.uid() and public.es_tecnico_activo());

drop policy if exists "admin eventos" on public.ticket_eventos;
create policy "admin eventos" on public.ticket_eventos for all using (public.es_admin()) with check (public.es_admin());
drop policy if exists "tecnico ve eventos" on public.ticket_eventos;
create policy "tecnico ve eventos" on public.ticket_eventos for select
  using (exists (select 1 from public.tickets t where t.id = ticket_id and t.tecnico_id = auth.uid()));

drop policy if exists "mis suscripciones" on public.push_suscripciones;
create policy "mis suscripciones" on public.push_suscripciones for all
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid() and public.es_tecnico_activo());

-- Fotos del reporte (privadas; las sube el servidor)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('tickets', 'tickets', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "ver fotos de tickets" on storage.objects;
create policy "ver fotos de tickets" on storage.objects for select to authenticated
  using (bucket_id = 'tickets' and (public.es_admin() or exists (
    select 1 from public.tickets t where t.tecnico_id = auth.uid() and name = any (t.fotos))));

-- ---------- Funciones públicas (solo con el token del enlace o el código del QR) ----------
create or replace function public.ticket_publico(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'folio', t.folio, 'estado', t.estado, 'equipo', t.equipo, 'activo_id', t.activo_id,
    'sucursal', s.nombre, 'sintoma', t.sintoma, 'detalle', t.detalle, 'puede_vender', t.puede_vender,
    'prioridad', t.prioridad, 'reporta_nombre', t.reporta_nombre, 'creado', t.creado,
    'asignado_en', t.asignado_en, 'resuelto_en', t.resuelto_en,
    'tecnico', split_part(p.nombre, ' ', 1),
    'hoja_folio', h.folio,
    'eventos', coalesce((select jsonb_agg(jsonb_build_object('creado', e.creado, 'tipo', e.tipo, 'texto', e.texto) order by e.creado)
                         from public.ticket_eventos e where e.ticket_id = t.id and e.publico), '[]'::jsonb))
  from public.tickets t
  join public.sucursales s on s.id = t.sucursal_id
  left join public.perfiles p on p.id = t.tecnico_id
  left join public.hojas_servicio h on h.id = t.hoja_id
  where t.token = p_token;
$$;
grant execute on function public.ticket_publico(text) to anon, authenticated;

-- Reporte abierto de un equipo (para avisar a la tienda antes de duplicarlo)
create or replace function public.ticket_abierto(p_activo text)
returns table (folio bigint, token text, estado text, creado timestamptz)
language sql stable security definer set search_path = public as $$
  select t.folio, t.token, t.estado, t.creado from public.tickets t
  where t.activo_id = upper(p_activo) and t.estado in ('abierto','asignado','en_proceso')
  order by t.creado desc limit 1;
$$;
grant execute on function public.ticket_abierto(text) to anon, authenticated;

-- ---------- Cierre automático con la hoja de servicio ----------
-- Si el técnico escribe "MT-12" (o solo 12 viniendo del ticket) en el campo Ticket de la hoja, el ticket se resuelve.
create or replace function public.cerrar_ticket_con_hoja()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_folio bigint; v_id uuid;
begin
  if new.ticket is null or new.ticket !~* '^\s*MT-?\d+\s*$' then return new; end if;
  v_folio := substring(new.ticket from '(\d+)')::bigint;
  update public.tickets set estado = 'resuelto', hoja_id = new.id, resuelto_en = now(), actualizado = now(),
         tecnico_id = coalesce(tecnico_id, new.tecnico_id)
   where folio = v_folio and estado <> 'cancelado' and hoja_id is null
  returning id into v_id;
  if v_id is not null then
    insert into public.ticket_eventos (ticket_id, tipo, texto, autor)
    values (v_id, 'hoja', 'Servicio realizado. Hoja de servicio #' || new.folio || '.', (select nombre from public.perfiles where id = new.tecnico_id));
  end if;
  return new;
end $$;
drop trigger if exists hoja_cierra_ticket on public.hojas_servicio;
create trigger hoja_cierra_ticket after insert on public.hojas_servicio
  for each row execute function public.cerrar_ticket_con_hoja();
