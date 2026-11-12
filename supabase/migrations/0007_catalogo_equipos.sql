-- =========================================================
-- Pasteko Mantenimiento · nueva clasificación de tipos de equipo
-- Ejecutar DESPUÉS de 0006_censo_supervisores.sql (SQL Editor > New query > Run)
-- No borra nada: los tipos que salen del catálogo quedan ocultos con su contenido.
-- =========================================================

alter table public.equipos
  add column if not exists prefijo text check (prefijo ~ '^[A-Z]{2,4}$'),
  add column if not exists vigente boolean not null default true;   -- false = fuera del catálogo (no aparece en censo ni hojas)

-- Técnicos y supervisores necesitan ver todo el catálogo vigente (aunque no tenga guía pública)
drop policy if exists "internos leen catalogo" on public.equipos;
create policy "internos leen catalogo" on public.equipos for select to authenticated
  using (public.es_supervisor() or public.es_tecnico_activo());

-- ---------- Tipos existentes ----------
update public.equipos set nombre = 'Cafetera BUNN Crescendo', categoria = 'Cafetera', prefijo = 'CAF', icono = 'cafetera', orden = 1, publicado = true, vigente = true where slug = 'cafetera';
update public.equipos set nombre = 'Horno de convección', categoria = 'Horno', prefijo = 'HOR', icono = 'horno', orden = 4, publicado = true, vigente = true where slug = 'horno';
update public.equipos set nombre = 'Refrigerador vertical', categoria = 'Refrigeración', prefijo = 'RFV', icono = 'refri', orden = 8, publicado = false, vigente = true where slug = 'refrigeracion';
-- Fuera del catálogo (no se inventarían): se ocultan, su contenido se conserva
update public.equipos set publicado = false, vigente = false where slug in ('vitrina', 'campana', 'clima');

-- ---------- Tipos nuevos ----------
insert into public.equipos (slug, nombre, categoria, prefijo, icono, orden, publicado, vigente) values
  ('cafetera-kalerm',          'Cafetera Kalerm',                      'Cafetera',      'CAF', 'cafetera', 2,  true,  true),
  ('cafetera-jura',            'Cafetera Jura',                        'Cafetera',      'CAF', 'cafetera', 3,  true,  true),
  ('horno-coccion-acelerada',  'Horno eléctrico de cocción acelerada', 'Horno',         'HOR', 'horno',    5,  true,  true),
  ('espiguero',                'Espiguero de gas',                     'Espiguero',     'ESP', 'general',  6,  false, true),
  ('camara-conservacion',      'Cámara de conservación',               'Refrigeración', 'CON', 'refri',    7,  false, true),
  ('mesa-fria',                'Mesa fría',                            'Refrigeración', 'MSF', 'refri',    9,  false, true),
  ('refresquero',              'Refresquero',                          'Refrigeración', 'REF', 'refri',    10, false, true),
  ('frigobar',                 'Frigobar',                             'Refrigeración', 'FRI', 'refri',    11, false, true),
  ('paletero',                 'Paletero',                             'Refrigeración', 'PAL', 'refri',    12, false, true),
  ('maquina-hielos',           'Máquina de hielos',                    'Refrigeración', 'MDH', 'refri',    13, false, true),
  ('licuadora',                'Licuadora',                            'Refrigeración', 'LIC', 'general',  14, false, true)
on conflict (slug) do update set
  nombre = excluded.nombre, categoria = excluded.categoria, prefijo = excluded.prefijo,
  icono = excluded.icono, orden = excluded.orden, publicado = excluded.publicado, vigente = true;

-- ---------- Código automático con el prefijo del catálogo ----------
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
  select e.prefijo into pref from public.equipos e where e.nombre = new.equipo and e.prefijo is not null limit 1;
  if pref is null then
    pref := upper(left(regexp_replace(translate(coalesce(new.equipo, 'EQP'), 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU'), '[^A-Za-z]', '', 'g'), 3));
    if length(pref) < 3 then pref := rpad(pref, 3, 'X'); end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('activo-' || pref));
  select coalesce(max(nullif(regexp_replace(id, '^PK-' || pref || '-', ''), '')::int), 0) + 1
    into n
    from public.activos
   where id ~ ('^PK-' || pref || '-[0-9]+$');
  new.id := 'PK-' || pref || '-' || lpad(n::text, 3, '0');
  return new;
end $$;
