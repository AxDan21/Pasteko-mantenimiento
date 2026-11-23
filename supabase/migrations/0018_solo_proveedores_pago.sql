-- =========================================================
-- Pasteko Mantenimiento · solo los proveedores generan pago por hoja
-- Ejecutar DESPUÉS de 0017 (SQL Editor > New query > Run)
--   Antes: se excluían solo las hojas de usuarios con rol "tecnico" y tipo "propio";
--   las que llenaba el administrador (Mis hojas de servicio) u otro rol caían en
--   "Pendiente de pago" con su mano de obra.
--   Ahora: una hoja va a Gastos / Pendiente de pago SOLO si su técnico es rol "tecnico"
--   con tipo "proveedor". Cualquier reparación hecha por personal propio cuesta 0;
--   las refacciones quedan como referencia en la hoja y lo que se compre se registra
--   aparte (gasto o caja chica).
-- =========================================================

-- Por si 0017 no se ejecutó: tipo de técnico (todos quedan como "propio").
alter table public.perfiles
  add column if not exists tipo_tecnico text not null default 'propio'
  check (tipo_tecnico in ('propio', 'proveedor'));

-- Mano de obra en 0 para todo el que no sea proveedor, también al editar la hoja.
create or replace function public.hoja_tecnico_propio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.perfiles where id = new.tecnico_id and rol = 'tecnico' and tipo_tecnico = 'proveedor') then
    new.mano_obra := 0;
    new.total := coalesce((select sum((r->>'cantidad')::numeric * (r->>'costo')::numeric) from jsonb_array_elements(new.refacciones) r), 0);
  end if;
  return new;
end $$;

drop trigger if exists hoja_tecnico_propio on public.hojas_servicio;
create trigger hoja_tecnico_propio before insert or update of mano_obra, refacciones, tecnico_id on public.hojas_servicio
  for each row execute function public.hoja_tecnico_propio();

drop view if exists public.v_gastos;
create view public.v_gastos with (security_invoker = true) as
select 'hoja'::text as origen, h.id::text as ref, (h.creada at time zone 'America/Mexico_City')::date as fecha,
       h.sucursal_id, s.nombre as sucursal, s.zona,
       coalesce(e.categoria, 'Otros') as categoria, h.tipo,
       'Hoja HS-' || lpad(h.folio::text, 6, '0') || ' · ' || h.equipo as concepto,
       h.total as monto, h.activo_id,
       h.pagado, h.fecha_pago, h.referencia_pago,
       p.nombre as beneficiario,
       null::text as factura_uuid, null::text as factura_ref, null::numeric as factura_total,
       h.solicitado_pago
from public.hojas_servicio h
join public.sucursales s on s.id = h.sucursal_id
left join public.equipos e on e.nombre = h.equipo
left join public.perfiles p on p.id = h.tecnico_id
where h.total > 0
  and p.rol = 'tecnico' and p.tipo_tecnico = 'proveedor'   -- solo se paga por hoja a técnicos externos
union all
select 'gasto', g.id::text, g.fecha, g.sucursal_id, s.nombre, s.zona, g.categoria, g.tipo, g.concepto, g.monto, g.activo_id,
       g.pagado, g.fecha_pago, g.referencia_pago,
       pr.nombre,
       g.factura_uuid, g.factura_ref, g.factura_total,
       g.solicitado_pago
from public.gastos g
left join public.sucursales s on s.id = g.sucursal_id
left join public.proveedores pr on pr.id = g.proveedor_id
union all
select 'caja', c.id::text, c.fecha, c.sucursal_id, s.nombre, s.zona, 'Caja chica', 'Correctivo', c.concepto, c.monto, null,
       true, c.fecha, null,
       'Caja chica',
       null, null, null,
       null::date
from public.caja_chica c
left join public.sucursales s on s.id = c.sucursal_id;
