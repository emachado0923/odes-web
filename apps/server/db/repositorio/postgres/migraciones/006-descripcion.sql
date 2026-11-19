-- =============================================================================
-- Migración 6 (Postgres): descripción de los productos del repositorio.
-- La misma que db/repositorio/migraciones/006-descripcion.sql (ver allí).
-- =============================================================================

ALTER TABLE repositorio_documentos ADD COLUMN IF NOT EXISTS descripcion varchar(700) NULL;
