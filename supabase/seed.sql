-- =========================================================
-- Datos iniciales: sucursales reales y contenido de arranque.
-- Las URL de YouTube son marcadores: reemplázalas desde el panel
-- (Contenido) cuando subas los videos como "no listados".
-- =========================================================

insert into public.sucursales (nombre, zona, supervisor) values
('24 Horas','Zona 1 · Pachuca','Guillermina Orozco'),('Palomas','Zona 1 · Pachuca','Guillermina Orozco'),
('Pasteur','Zona 1 · Pachuca','Guillermina Orozco'),('UAEH ICEA','Zona 1 · Pachuca','Guillermina Orozco'),
('UAEH ICSA','Zona 1 · Pachuca','Guillermina Orozco'),('UAEH Prepa 1','Zona 1 · Pachuca','Guillermina Orozco'),
('Bengurión','Zona 1 · Pachuca','Guillermina Orozco'),
('Bicentenario','Zona 2 · Edomex','Blanca Gómez'),('Tecámac','Zona 2 · Edomex','Blanca Gómez'),
('Visitación','Zona 2 · Edomex','Blanca Gómez'),('Vitalia','Zona 2 · Edomex','Blanca Gómez'),
('Zumpango','Zona 2 · Edomex','Blanca Gómez'),('Tezoyuca','Zona 2 · Edomex','Blanca Gómez'),
('Avanza','Zona 3 · Hidalgo y Puebla','Fernando Flores'),('Chachapa','Zona 3 · Hidalgo y Puebla','Fernando Flores'),
('El Arenal','Zona 3 · Hidalgo y Puebla','Fernando Flores'),('La Nopalera','Zona 3 · Hidalgo y Puebla','Fernando Flores'),
('Matilde','Zona 3 · Hidalgo y Puebla','Fernando Flores'),('San Antonio','Zona 3 · Hidalgo y Puebla','Fernando Flores'),
('Tulancingo','Zona 3 · Hidalgo y Puebla','Fernando Flores'),
('Ayuntamiento','Zona 4 · CDMX','Elías Domínguez'),('Metro Sevilla','Zona 4 · CDMX','Elías Domínguez'),
('Narvarte','Zona 4 · CDMX','Elías Domínguez'),('Reclusorio Norte','Zona 4 · CDMX','Elías Domínguez'),
('TAPO 1','Zona 4 · CDMX','Elías Domínguez'),('TAPO 2','Zona 4 · CDMX','Elías Domínguez'),
('Ciudad Azteca','Zona 4 · CDMX','Elías Domínguez'),
('AICM 2','Zona 5 · AICM','Luis Ángel Aguilar'),('AICM 3','Zona 5 · AICM','Luis Ángel Aguilar'),
('AIFA Entradas','Zona 6 · AIFA','Ricardo Montes'),('AIFA Internacional','Zona 6 · AIFA','Ricardo Montes'),
('AIFA Nacional','Zona 6 · AIFA','Ricardo Montes'),('AIFA Salidas','Zona 6 · AIFA','Ricardo Montes')
on conflict (nombre) do nothing;

insert into public.equipos (slug, nombre, categoria, icono, orden) values
('cafetera','Cafetera BUNN Crescendo','Bebidas','cafetera',1),
('refrigeracion','Refrigerador y mesa fría','Refrigeración','refri',2),
('horno','Horno de convección','Hornos','horno',3),
('vitrina','Vitrina caliente','Exhibición','vitrina',4),
('campana','Campana y extractor','Extracción','campana',5),
('clima','Aire acondicionado (minisplit)','Clima','clima',6)
on conflict (slug) do nothing;

insert into public.videos (equipo_id, titulo, youtube_url, duracion, orden)
select e.id, v.titulo, 'https://youtu.be/REEMPLAZAR', v.duracion, v.orden
from (values
  ('cafetera','Limpieza diaria al cierre','3:40',1),
  ('cafetera','Limpieza del rociador','2:10',2),
  ('refrigeracion','Cómo leer y anotar la temperatura','1:30',1),
  ('horno','Limpieza al cierre','4:15',1),
  ('campana','Lavado de filtros de campana','3:05',1),
  ('clima','Limpieza de filtros','2:30',1)
) as v(slug, titulo, duracion, orden)
join public.equipos e on e.slug = v.slug;

insert into public.faqs (equipo_id, pregunta, pasos, aviso_seguridad, orden)
select e.id, f.pregunta, f.pasos, f.aviso, f.orden
from (values
  ('cafetera','La pantalla no enciende', array['Revisa que esté conectada y que el contacto tenga corriente: prueba con otro aparato.','Confirma que el interruptor esté encendido.','Espera 2 minutos y vuelve a intentar.'], 'No abras la cafetera ni quites tapas. Si sigue apagada, levanta ticket.', 1),
  ('cafetera','El café sale aguado o con poco sabor', array['Revisa que la cantidad de café sea la de la receta.','Verifica que el filtro de papel esté bien colocado.','Limpia el rociador si tiene sarro (ve el video).','Espera a que la cafetera llegue a temperatura antes de preparar.'], null, 2),
  ('cafetera','Gotea agua por debajo del equipo', array['Revisa si el agua viene del termo o la jarra.','Seca la zona y observa 10 minutos.'], 'Si sigue goteando: apágala, desconéctala y levanta ticket urgente.', 3),
  ('refrigeracion','No enfría lo suficiente', array['Revisa que nadie haya movido el termostato.','Despeja la rejilla inferior.','Cierra bien las puertas y revisa el empaque.','Anota temperatura y hora; si no mejora en 1 hora, levanta ticket.'], null, 1),
  ('refrigeracion','Se forma hielo o escarcha', array['Revisa que la puerta cierre por completo.','No metas producto caliente.','Si el empaque está roto, toma foto para el ticket.'], null, 2),
  ('horno','No alcanza la temperatura', array['Precalienta al menos 15 minutos.','Evita abrir la puerta seguido.','Revisa que la perilla esté en la temperatura correcta.'], null, 1),
  ('horno','El ventilador hace ruido o no gira', array['Apaga el horno y deja de usarlo.'], 'No hornees sin ventilador. Levanta ticket.', 2),
  ('vitrina','La vitrina no calienta', array['Revisa que esté encendida y con la perilla en su posición.','Revisa si las luces encienden.','Prueba el contacto con otro aparato.'], null, 1),
  ('campana','Hay humo u olor en el área de clientes', array['Enciende el extractor antes de hornear.','Revisa que los filtros estén limpios y colocados.'], 'Nunca operes la campana sin filtros.', 1),
  ('clima','Gotea agua dentro de la tienda', array['Apaga el equipo.','Coloca un recipiente y seca el piso.'], 'Suele ser el drenaje tapado. Levanta ticket con foto.', 1),
  ('clima','No enfría', array['Revisa que esté en modo frío (copo de nieve).','Ajusta entre 22 y 24 °C.','Mantén puertas cerradas.','Revisa que los filtros estén limpios.'], null, 2)
) as f(slug, pregunta, pasos, aviso, orden)
join public.equipos e on e.slug = f.slug;
