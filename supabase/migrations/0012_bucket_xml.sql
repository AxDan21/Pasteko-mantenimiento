-- =========================================================
-- Pasteko Mantenimiento · permitir XML (CFDI) en el bucket "facturas"
-- Ejecutar DESPUÉS de 0011_etapas_pago.sql (SQL Editor > New query > Run)
-- =========================================================
update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf','application/xml','text/xml']
where id = 'facturas';
