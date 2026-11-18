-- Permite borrar una hoja de servicio que cerró un reporte de tienda.
-- El reporte no se borra: pierde el vínculo con la hoja y se reabre, con una nota en su historial.

alter table public.tickets drop constraint if exists tickets_hoja_id_fkey;
alter table public.tickets add constraint tickets_hoja_id_fkey
  foreign key (hoja_id) references public.hojas_servicio(id) on delete set null;

-- Lo mismo para técnicos y equipos: si se borran, el reporte se conserva.
alter table public.tickets drop constraint if exists tickets_tecnico_id_fkey;
alter table public.tickets add constraint tickets_tecnico_id_fkey
  foreign key (tecnico_id) references public.perfiles(id) on delete set null;
alter table public.tickets drop constraint if exists tickets_activo_id_fkey;
alter table public.tickets add constraint tickets_activo_id_fkey
  foreign key (activo_id) references public.activos(id) on delete set null;

create or replace function public.reabrir_ticket_sin_hoja()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.ticket_eventos (ticket_id, tipo, texto, publico)
  select t.id, 'estado', 'Se eliminó la hoja de servicio #' || old.folio || '. El reporte se reabrió.', false
    from public.tickets t where t.hoja_id = old.id;
  update public.tickets
     set estado = case when tecnico_id is null then 'abierto' else 'asignado' end,
         resuelto_en = null, actualizado = now()
   where hoja_id = old.id and estado = 'resuelto';
  return old;
end $$;
drop trigger if exists hoja_borrada_reabre_ticket on public.hojas_servicio;
create trigger hoja_borrada_reabre_ticket before delete on public.hojas_servicio
  for each row execute function public.reabrir_ticket_sin_hoja();
