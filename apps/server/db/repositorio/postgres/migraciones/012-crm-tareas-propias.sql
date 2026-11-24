-- =============================================================================
-- Migración 12 (Postgres): permiso para crearse tareas a sí mismo
-- (24-nov-2026). La misma de db/repositorio/migraciones/012-crm-tareas-propias.sql
-- (MySQL), traducida: ver allí qué guarda la columna.
--
-- Se puede repetir: si la columna ya existe, ADD COLUMN IF NOT EXISTS se salta
-- también su CHECK.
-- =============================================================================

ALTER TABLE crm_personas
  ADD COLUMN IF NOT EXISTS puede_crear_tareas smallint NOT NULL DEFAULT 0
    CONSTRAINT ck_crm_personas_puede_crear_tareas CHECK (puede_crear_tareas IN (0, 1));
