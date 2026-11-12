-- =========================================================
-- Pasteko Mantenimiento · estado de pago de gastos y hojas de servicio
-- Ejecutar DESPUÉS de 0004_qr_garantias.sql (SQL Editor > New query > Run)
-- =========================================================

-- Gastos manuales: pagado o pendiente
alter table public.gastos
  add column if not exists pagado boolean not null default false,
  add column if not exists fecha_pago date,
  add column if not exists referencia_pago text;   -- folio de transferencia, cheque, etc.

-- Hojas de servicio: el trabajo ya se hizo; el pago al técnico o proveedor puede estar pendiente
alter table public.hojas_servicio
  add column if not exists pagado boolean not null default false,
  add column if not exists fecha_pago date,
  add column if not exists referencia_pago text;

-- Lo registrado antes de este cambio se considera pagado. Si algo sigue pendiente,
-- márcalo después desde Gastos.
update public.gastos set pagado = true, fecha_pago = coalesce(fecha_pago, fecha) where not pagado and creado < now();
update public.hojas_servicio set pagado = true, fecha_pago = coalesce(fecha_pago, (creada at time zone 'America/Mexico_City')::date) where not pagado and creada < now();

-- Vista unificada con estado de pago y a quién se le debe
drop view if exists public.v_gastos;
create view public.v_gastos with (security_invoker = true) as
select 'hoja'::text as origen, h.id::text as ref, (h.creada at time zone 'America/Mexico_City')::date as fecha,
       h.sucursal_id, s.nombre as sucursal, s.zona,
       coalesce(e.categoria, 'Otros') as categoria, h.tipo,
       'Hoja HS-' || lpad(h.folio::text, 6, '0') || ' · ' || h.equipo as concepto,
       h.total as monto, h.activo_id,
       h.pagado, h.fecha_pago, h.referencia_pago,
       p.nombre as beneficiario
from public.hojas_servicio h
join public.sucursales s on s.id = h.sucursal_id
left join public.equipos e on e.nombre = h.equipo
left join public.perfiles p on p.id = h.tecnico_id
where h.total > 0
union all
select 'gasto', g.id::text, g.fecha, g.sucursal_id, s.nombre, s.zona, g.categoria, g.tipo, g.concepto, g.monto, g.activo_id,
       g.pagado, g.fecha_pago, g.referencia_pago,
       pr.nombre
from public.gastos g
left join public.sucursales s on s.id = g.sucursal_id
left join public.proveedores pr on pr.id = g.proveedor_id
union all
select 'caja', c.id::text, c.fecha, c.sucursal_id, s.nombre, s.zona, 'Caja chica', 'Correctivo', c.concepto, c.monto, null,
       true, c.fecha, null,
       'Caja chica'
from public.caja_chica c
left join public.sucursales s on s.id = c.sucursal_id;
