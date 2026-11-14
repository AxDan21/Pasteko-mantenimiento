-- =========================================================
-- Pasteko Mantenimiento · PDF y XML de facturas pendientes de pago
-- Ejecutar DESPUÉS de 0009_factura_agrupada.sql (SQL Editor > New query > Run)
-- El PDF y el XML se guardan mientras la factura está pendiente de pago.
-- Al marcarla como pagada, la app borra ambos archivos para ahorrar espacio.
-- =========================================================

alter table public.gastos
  add column if not exists xml_path text;   -- XML del CFDI en el bucket "facturas"
