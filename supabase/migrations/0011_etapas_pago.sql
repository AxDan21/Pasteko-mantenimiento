-- =========================================================
-- Pasteko Mantenimiento · etapas de pago
-- Ejecutar DESPUÉS de 0010_tesoreria.sql (SQL Editor > New query > Run)
--   1. Por pasar a pago   (solicitado_pago vacío, no pagado)  → se guardan PDF y XML
--   2. En trámite         (solicitado_pago con fecha, no pagado) → ya se entregó a Tesorería; archivos borrados
--   3. Pagado             (pagado = true)
-- =========================================================

alter table public.gastos         add column if not exists solicitado_pago date;
alter table public.hojas_servicio add column if not exists solicitado_pago date;

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
