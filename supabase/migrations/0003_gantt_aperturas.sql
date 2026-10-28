-- =========================================================
-- Pasteko Mantenimiento · Gantt de aperturas
-- Ejecutar DESPUÉS de 0002_modulos.sql (SQL Editor > New query > Run)
-- =========================================================

alter table public.aperturas
  add column if not exists tipo text not null default 'Franquicia' check (tipo in ('Franquicia', 'Propia'));

alter table public.apertura_items
  add column if not exists responsable text,
  add column if not exists fecha date,                 -- vacío = "No aplica"
  add column if not exists hito text check (hito in ('verde', 'amarillo'));

alter table public.apertura_items alter column grupo set default 'Gantt';
