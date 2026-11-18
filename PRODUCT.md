# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- Tiendas: consultan videos, problemas comunes y guias para resolver incidencias o levantar tickets.
- Tecnicos: registran hojas de servicio, fotos, firmas, preventivos, refacciones y equipos atendidos.
- Supervisores: censan equipos por sucursal y zona.
- Personal de mantenimiento y administradores: revisan operaciones, hojas, aperturas, gastos, activos, garantias, tecnicos, proveedores y reportes.

## Product Purpose

Centralizar las operaciones de mantenimiento de Pasteko entre sucursales, tecnicos, supervisores y administradores.

## Positioning

Unifica en un solo sistema los equipos y su historial, las hojas de servicio, el censo por sucursal, los preventivos, aperturas, gastos y reportes operativos. La base compartida permite aplicar reglas por rol y conservar evidencia fotografica y de firma.

## Operating Context

El personal usa el sistema desde sucursales y dispositivos moviles para consultar equipos, registrar trabajo de campo y consultar manuales. Administradores y supervisores revisan avances y datos de su zona desde el panel web.

## Capabilities and Constraints

- Stack existente: Next.js 15, TypeScript, Supabase Postgres/Auth/Storage y Vercel.
- Acceso por roles y Row Level Security.
- Interfaz y terminologia en espanol.
- Uso movil prioritario para tecnicos y supervisores en campo.
- Fotos y firmas se guardan en almacenamiento privado.
- Informacion sensible de proveedores y costos se restringe segun el rol.
- Los equipos mantienen codigo, sucursal, historial, garantia y estado de mantenimiento.

## Brand Commitments

- Nombre del producto: Pasteko Mantenimiento.

## Evidence on Hand

- Documentacion operativa y rutas en README.md.
- Esquema, migraciones y datos iniciales en supabase/.
- Interfaces existentes en app/ y components/.

## Product Principles

- Reducir el trabajo manual y la perdida de trazabilidad.
- Mantener el contexto completo del equipo y su historial.
- Optimizar primero las tareas de campo sobre dispositivos moviles.
- Restringir datos segun rol y conservar evidencia privada.
- Mantener la operacion centralizada y exportable para reportes.

## Accessibility & Inclusion

El trabajo futuro debe conservar etiquetas claras, estados legibles, controles utilizables con teclado y areas tactiles adecuadas para el personal de tienda y campo.
