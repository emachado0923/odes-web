-- =============================================================================
-- Migración 12: permiso para crearse tareas a sí mismo (24-nov-2026).
--
-- crm_personas.puede_crear_tareas: 1 = la persona puede crearse tareas desde
--   su tablero (POST /api/crm/personas/:personaId/tareas), con ella misma de
--   responsable, sin entregable y sin correo. Lo prende o apaga el líder en la
--   pantalla Equipo (PATCH /api/crm/lider/personas/:id). Nace en 0 para todos.
--
-- * Compatible con MySQL 8.0.18 y se puede repetir: la columna y su CHECK se
--   agregan por PREPARE solo si la columna no existe (MySQL 8.0.18 no tiene
--   ADD COLUMN IF NOT EXISTS), como en la migración 006.
-- * No inserta en sistema_esquema_version: lo hace npm run repositorio:migrar.
-- * No trae datos.
-- =============================================================================

SET @paso = IF(
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'crm_personas' AND column_name = 'puede_crear_tareas'
  ),
  'DO 0',
  'ALTER TABLE crm_personas ADD COLUMN puede_crear_tareas TINYINT(1) NOT NULL DEFAULT 0 AFTER activo, ADD CONSTRAINT ck_crm_personas_puede_crear_tareas CHECK (puede_crear_tareas IN (0, 1))'
);
PREPARE paso FROM @paso;
EXECUTE paso;
DEALLOCATE PREPARE paso;
