-- =========================================================
-- Pasteko Mantenimiento · gastos agrupados por factura (CFDI)
-- Ejecutar DESPUÉS de 0008_gantt_dependencias.sql (SQL Editor > New query > Run)
-- Cuando una factura se divide en varios conceptos, todos quedan ligados por su folio fiscal (UUID):
-- se pagan juntos, se borran juntos y no se puede registrar dos veces la misma factura.
-- =========================================================

alter table public.gastos
  add column if not exists factura_uuid  text,            -- folio fiscal del CFDI
  add column if not exists factura_ref   text,            -- "Fact. A1532" o "UUID CAE29802"
  add column if not exists factura_total numeric(12,2);   -- total de la factura completa

create index if not exists gastos_factura_uuid_idx on public.gastos (factura_uuid) where factura_uuid is not null;

-- La vista unificada ahora dice a qué factura pertenece cada gasto
drop view if exists public.v_gastos;
create view public.v_gastos with (security_invoker = true) as
select 'hoja'::text as origen, h.id::text as ref, (h.creada at time zone 'America/Mexico_City')::date as fecha,
       h.sucursal_id, s.nombre as sucursal, s.zona,
       coalesce(e.categoria, 'Otros') as categoria, h.tipo,
       'Hoja HS-' || lpad(h.folio::text, 6, '0') || ' · ' || h.equipo as concepto,
       h.total as monto, h.activo_id,
       h.pagado, h.fecha_pago, h.referencia_pago,
       p.nombre as beneficiario,
       null::text as factura_uuid, null::text as factura_ref, null::numeric as factura_total
from public.hojas_servicio h
join public.sucursales s on s.id = h.sucursal_id
left join public.equipos e on e.nombre = h.equipo
left join public.perfiles p on p.id = h.tecnico_id
where h.total > 0
union all
select 'gasto', g.id::text, g.fecha, g.sucursal_id, s.nombre, s.zona, g.categoria, g.tipo, g.concepto, g.monto, g.activo_id,
       g.pagado, g.fecha_pago, g.referencia_pago,
       pr.nombre,
       g.factura_uuid, g.factura_ref, g.factura_total
from public.gastos g
left join public.sucursales s on s.id = g.sucursal_id
left join public.proveedores pr on pr.id = g.proveedor_id
union all
select 'caja', c.id::text, c.fecha, c.sucursal_id, s.nombre, s.zona, 'Caja chica', 'Correctivo', c.concepto, c.monto, null,
       true, c.fecha, null,
       'Caja chica',
       null, null, null
from public.caja_chica c
left join public.sucursales s on s.id = c.sucursal_id;
