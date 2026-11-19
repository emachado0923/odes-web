-- =============================================================================
-- Migración 6: descripción de los productos del repositorio.
--
-- El Observatorio pidió (12 de noviembre de 2026) que cada producto tenga una
-- descripción de unas 60 palabras, en tercera persona y tono expositivo, que
-- la tarjeta muestra entre el título y las palabras clave. Para publicar un
-- documento la administración exige la descripción (50 a 70 palabras), el año
-- y 6 palabras clave (src/repositorio/dominio/validacion.ts).
--
-- * VARCHAR(700): 60 palabras ocupan unos 420 caracteres; queda margen.
-- * Se puede repetir: la columna se agrega por PREPARE solo si no existe
--   (MySQL 8.0.18 no tiene ADD COLUMN IF NOT EXISTS).
-- * No inserta en sistema_esquema_version: lo hace `npm run repositorio:migrar`.
-- * Las descripciones de los productos que ya existen se cargan aparte, como
--   datos (npm run repositorio:revision, con su archivo de cambios).
-- =============================================================================

SET @paso = IF(
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'repositorio_documentos' AND column_name = 'descripcion'
  ),
  'DO 0',
  'ALTER TABLE repositorio_documentos ADD COLUMN descripcion VARCHAR(700) NULL AFTER subtitulo'
);
PREPARE paso FROM @paso;
EXECUTE paso;
DEALLOCATE PREPARE paso;
