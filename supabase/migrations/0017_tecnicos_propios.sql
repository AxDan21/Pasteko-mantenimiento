-- =========================================================
-- Pasteko Mantenimiento · técnicos propios vs. proveedores
-- Ejecutar DESPUÉS de 0016 (SQL Editor > New query > Run)
--   propio    = técnico de nómina (sueldo). Sus hojas NO generan pago; la mano de obra es 0
--               y el costo de refacciones es solo de referencia.
--   proveedor = externo que cobra por servicio. Sus hojas pasan a Gastos para pagarse y medir cuánto se le paga.
-- Todos los técnicos actuales quedan como "propio"; cambia a "proveedor" a quien cobre por servicio
-- en Usuarios › Ajustes.
-- =========================================================

alter table public.perfiles
  add column if not exists tipo_tecnico text not null default 'propio'
  check (tipo_tecnico in ('propio', 'proveedor'));

-- Un técnico propio no cobra mano de obra: se fuerza a 0 y el total queda en refacciones.
create or replace function public.hoja_tecnico_propio()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.perfiles where id = new.tecnico_id and rol = 'tecnico' and tipo_tecnico = 'propio') then
    new.mano_obra := 0;
    new.total := coalesce((select sum((r->>'cantidad')::numeric * (r->>'costo')::numeric) from jsonb_array_elements(new.refacciones) r), 0);
  end if;
  return new;
end $$;

drop trigger if exists hoja_tecnico_propio on public.hojas_servicio;
create trigger hoja_tecnico_propio before insert on public.hojas_servicio
  for each row execute function public.hoja_tecnico_propio();

-- Gastos: solo cuentan las hojas de proveedores (técnicos externos que cobran por servicio).
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
  and not (coalesce(p.rol, '') = 'tecnico' and p.tipo_tecnico = 'propio')   -- a los técnicos propios no se les paga por hoja
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
