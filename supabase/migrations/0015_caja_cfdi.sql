-- Caja chica por XML: se guarda proveedor, folio fiscal y el XML junto al PDF para la comprobación.
alter table public.caja_chica add column if not exists factura_uuid text;
alter table public.caja_chica add column if not exists factura_ref  text;
alter table public.caja_chica add column if not exists proveedor    text;
alter table public.caja_chica add column if not exists rfc          text;
alter table public.caja_chica add column if not exists xml_path     text;
create unique index if not exists caja_uuid_uq on public.caja_chica (factura_uuid) where factura_uuid is not null;
