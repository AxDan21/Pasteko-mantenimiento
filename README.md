# Pasteko Mantenimiento

Portal web de mantenimiento para las sucursales propias de Pasteko.

| Ruta | Quién | Requiere usuario |
|---|---|---|
| `/` y `/equipo/<equipo>` | Tiendas y supervisores: videos, problemas comunes, guía para levantar ticket | No |
| `/servicio` | Técnicos: crear hojas de servicio con fotos y firma | Sí |
| `/admin` | Mantenimiento: resumen, hojas, preventivos, gastos, activos y garantías, caja chica, técnicos y proveedores, refacciones, supervisores, aperturas, reporte, contenido | Sí (admin) |

Tecnología: Next.js 15 (TypeScript) · Supabase (Postgres, Auth, Storage) · Vercel.

---

## 1. Crear el proyecto en Supabase

1. Entra a <https://supabase.com>, crea una organización y un proyecto (región: **East US** o la más cercana a México).
2. En **SQL Editor > New query**, pega todo `supabase/migrations/0001_init.sql` y pulsa **Run**.
3. Abre otra consulta, pega `supabase/seed.sql` y pulsa **Run**. Carga las 33 sucursales, 6 equipos y preguntas iniciales.
4. Ejecuta igual, en orden, `0002_modulos.sql`, `0003_gantt_aperturas.sql` y `0004_qr_garantias.sql` (carpeta `supabase/migrations`). El primero de ellos, `supabase/migrations/0002_modulos.sql` y pulsa **Run**. Crea los módulos del panel: preventivos, gastos, activos, caja chica, proveedores, refacciones y aperturas.
4. En **Project Settings > API** copia:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` → `SUPABASE_SERVICE_ROLE_KEY` (secreta: solo en el servidor)

### Crear tu usuario de administrador

1. **Authentication > Users > Add user > Create new user**: tu correo y una contraseña. Marca *Auto Confirm User*.
2. En **SQL Editor** ejecuta (cambia el correo):

```sql
update public.perfiles set rol = 'admin', nombre = 'Axel Romero'
where id = (select id from auth.users where email = 'tu-correo@pasteko.com.mx');
```

A los técnicos ya los das de alta tú desde `/admin/tecnicos`.

## 2. Correr en tu computadora

Requiere Node.js 20 o superior.

```bash
cp .env.example .env.local   # y llena los valores
npm install
npm run dev                  # abre http://localhost:3000
```

Antes de publicar, comprueba que compile:

```bash
npm run typecheck
npm run build
```

## 3. Publicar en Vercel

1. Sube esta carpeta a un repositorio de GitHub (de preferencia en una cuenta u organización de la empresa).
2. En <https://vercel.com> > **Add New > Project**, importa el repositorio. Vercel detecta Next.js solo.
3. En **Environment Variables** agrega las 5 variables de `.env.example`. `NEXT_PUBLIC_SITE_URL` debe ser la dirección final (ej. `https://mantenimiento.pasteko.com.mx`).
4. **Deploy**. Cada `git push` a `main` vuelve a publicar.
5. Dominio propio: **Settings > Domains**, agrega el subdominio y crea el registro CNAME que te indique Vercel con quien administre el dominio de Pasteko.

> El plan Hobby (gratis) de Vercel no permite uso comercial: para producción usa Pro.

## 4. Operación diaria

- **Videos:** súbelos a YouTube como *No listado* y pega el enlace en `/admin/contenido`. Así no ocupan espacio ni consumen ancho de banda de Supabase.
- **QR:** en `/admin/contenido` cada equipo tiene su QR. Descárgalo, imprímelo y pégalo junto al equipo. Abre directo la ficha del equipo.
- **Técnicos:** `/admin/tecnicos` para dar de alta, cambiar contraseña o desactivar. Un técnico desactivado no puede entrar ni enviar hojas.
- **Hojas:** llegan a `/admin`. Ábrelas, agrega notas y márcalas como *Revisada*. "Descargar CSV" exporta el mes para Excel o Power BI.
- **Instalar en el celular:** desde el navegador, *Agregar a pantalla de inicio*. Funciona como app.

## 5. Power BI

Conecta Power BI directo a la base: **Obtener datos > PostgreSQL**, con los datos de **Project Settings > Database > Connection string** (usa el *Session pooler*). La vista `v_hojas` ya trae sucursal, zona y técnico de cada hoja. Para no usar el usuario principal, crea uno de solo lectura:

```sql
create role powerbi login password 'cambia-esta-contraseña';
grant usage on schema public to powerbi;
grant select on public.v_hojas, public.hojas_servicio, public.sucursales, public.perfiles to powerbi;
create policy "powerbi lee hojas" on public.hojas_servicio for select to powerbi using (true);
create policy "powerbi lee perfiles" on public.perfiles for select to powerbi using (true);
```

## Seguridad

- Las reglas de acceso viven en la base (Row Level Security): la página pública solo puede leer contenido publicado; cada técnico ve solo sus hojas; solo el administrador ve todo y edita contenido.
- Fotos y firmas se guardan en un bucket privado y se muestran con enlaces temporales de 1 hora.
- Las fotos se comprimen en el celular antes de subir (~200 KB cada una).

## Estructura

```
app/
  page.tsx                  Página pública (buscador y equipos)
  equipo/[slug]/page.tsx    Ficha del equipo: videos, problemas comunes, ticket
  login/                    Inicio de sesión
  servicio/                 Técnicos: mis hojas, nueva hoja, ver hoja
  admin/                    Panel: hojas, exportar CSV, contenido + QR, técnicos
components/                 Formulario de hoja, firma, vista imprimible, encabezado
lib/                        Clientes de Supabase, sesión, formato, compresión de fotos
supabase/                   Esquema SQL y datos iniciales
```

## Cómo se conectan los módulos

- **Gastos** suma tres fuentes (vista `v_gastos`): el total de cada hoja de servicio, los gastos que registras con factura y la caja chica. El presupuesto mensual y el fondo de caja chica se cambian en Gastos.
- **Preventivos** se asignan a un técnico. Cuando el técnico envía una hoja tipo Preventivo y elige ese preventivo, queda marcado como hecho y ligado a la hoja.
- **Activos**: cada equipo tiene un código (ej. `PK-CAF-001`). Si el técnico lo elige en la hoja, el costo se suma al historial del equipo y el panel recomienda reparar, vigilar o evaluar reemplazo. También detecta correctivos pagados con la garantía vigente.
- **Facturas** de gastos y caja chica se guardan en el bucket privado `facturas`.

## Etiquetas QR de equipos

- Cada equipo en **Activos y garantías** tiene su QR, que abre `/a/<código>`.
- Sin sesión (personal de tienda) se ve solo el nombre del equipo y su guía. Con sesión de técnico se ve el historial de reparaciones (sin costos) y el botón para crear la hoja de servicio con el equipo ya elegido. El administrador ve además la ficha con costos.
- **Imprimir etiquetas QR** genera hojas carta (chica 6.5 × 3.5 cm o grande 9 × 5 cm). Recomendado: papel adhesivo o laminar la etiqueta, porque cocina y refrigeración la desgastan.
- `NEXT_PUBLIC_SITE_URL` debe tener la dirección definitiva antes de imprimir: si cambias de dominio, hay que reimprimir.

## Censo de equipos (supervisores)

1. Ejecuta `supabase/migrations/0006_censo_supervisores.sql`.
2. En **Técnicos y proveedores**, da de alta a cada supervisor con rol **Supervisor** y su **zona**.
3. El supervisor entra a `/login` y llega a `/censo`: ve solo las sucursales de su zona. Por cada equipo captura tipo, descripción, número de serie y foto de la ficha técnica (la foto del equipo es opcional). El código (ej. `PK-CAF-012`) se asigna solo y no se repite.
4. Si un número de serie ya existe, el sistema avisa en qué sucursal está registrado.
5. Al terminar una tienda, el supervisor toca **Sucursal completa**. Puede imprimir las etiquetas QR de su zona en **Etiquetas QR**.
6. Tú revisas en **Panel > Censo**: avance por sucursal y la cola **Por validar** con las fotos. Abre cada equipo para completar costo, fecha de compra y garantía.

Los supervisores no pueden crear hojas de servicio, ni ver costos de reparación, ni equipos de otras zonas. Solo pueden borrar equipos que ellos registraron y que aún no se validan.
