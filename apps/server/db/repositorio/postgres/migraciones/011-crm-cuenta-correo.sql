-- =============================================================================
-- Migración 11 (Postgres): cuenta de correo del CRM guardada por el líder
-- (24-nov-2026). La misma de db/repositorio/migraciones/011-crm-cuenta-correo.sql
-- (MySQL), traducida: ver allí qué guarda la tabla.
--
-- Una sola fila (id = 1), con la contraseña de aplicación cifrada. RLS activo
-- y sin permisos para anon/authenticated (solo la lee el servidor).
-- =============================================================================

CREATE TABLE IF NOT EXISTS crm_correo_cuenta (
  id               smallint     NOT NULL,
  usuario          varchar(254) NOT NULL,
  clave_cifrada    varchar(512) NOT NULL,
  host             varchar(253) NOT NULL,
  puerto           integer      NOT NULL,
  seguro           smallint     NOT NULL,
  nombre           varchar(100) NOT NULL,
  actualizado_en   timestamptz(3) NOT NULL,
  actualizado_por  varchar(120) NULL,
  CONSTRAINT crm_correo_cuenta_pkey PRIMARY KEY (id),
  CONSTRAINT ck_crm_correo_cuenta_id CHECK (id = 1),
  CONSTRAINT ck_crm_correo_cuenta_puerto CHECK (puerto BETWEEN 1 AND 65535),
  CONSTRAINT ck_crm_correo_cuenta_seguro CHECK (seguro IN (0, 1))
);

-- Cerrado a la API pública de Supabase, como el resto del esquema.
ALTER TABLE crm_correo_cuenta ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON crm_correo_cuenta FROM anon, authenticated;
  END IF;
END
$$;
