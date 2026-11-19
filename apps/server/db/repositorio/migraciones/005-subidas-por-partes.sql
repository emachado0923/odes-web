-- =============================================================================
-- Migración 5: subidas por partes (archivos en la base, sin Supabase Storage).
--
-- En Vercel una petición no puede llevar más de 4,5 MB. Cuando los archivos
-- van dentro de la base, el navegador manda un archivo más grande en partes
-- de 4 MiB (src/repositorio/archivos/subidas-por-partes.ts): cada parte queda
-- aquí hasta que llega la última y el servidor arma el archivo, lo valida y
-- lo guarda como cualquier otro. Las partes viven en la base (no en disco)
-- porque en Vercel cada petición puede caer en una instancia distinta.
--
--   repositorio_subidas / repositorio_subida_partes  administración del repositorio
--   pai_subidas (ya existía) + pai_subida_partes     evidencias del PAI
--
-- Una subida pendiente vence a las 2 horas y se purga con sus partes (en
-- cascada) en la siguiente subida. Cada módulo usa sus propias tablas.
--
-- * Cada sentencia se puede repetir (el DDL de MySQL no es transaccional):
--   CREATE TABLE IF NOT EXISTS, y la columna nueva de pai_subidas por PREPARE
--   (MySQL 8.0.18 no tiene ADD COLUMN IF NOT EXISTS).
-- * No inserta en sistema_esquema_version: lo hace `npm run repositorio:migrar`.
-- =============================================================================

-- Subidas por partes de la administración del repositorio. bytes: tamaño
-- total declarado al empezar (cuántas partes y de qué tamaño).
CREATE TABLE IF NOT EXISTS repositorio_subidas (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ruta        VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  usuario_id  INT UNSIGNED NOT NULL,
  bytes       BIGINT UNSIGNED NOT NULL,
  creado_en   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_repositorio_subidas_ruta (ruta),
  KEY ix_repositorio_subidas_usuario (usuario_id, creado_en),
  KEY ix_repositorio_subidas_fecha (creado_en),
  CONSTRAINT fk_repositorio_subidas_usuario FOREIGN KEY (usuario_id)
    REFERENCES repositorio_administradores (id) ON DELETE CASCADE,
  CONSTRAINT ck_repositorio_subidas_bytes CHECK (bytes > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Partes de 4 MiB (la última puede ser menor), n desde 0.
CREATE TABLE IF NOT EXISTS repositorio_subida_partes (
  subida_id  BIGINT UNSIGNED NOT NULL,
  n          INT UNSIGNED    NOT NULL,
  datos      MEDIUMBLOB      NOT NULL,
  PRIMARY KEY (subida_id, n),
  CONSTRAINT fk_repositorio_subida_partes_subida FOREIGN KEY (subida_id)
    REFERENCES repositorio_subidas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Partes de una subida de evidencia del PAI (pai_subidas, migración 003, que
-- ya lleva dueño, indicador, bimestre, vencimiento y cupo por usuario).
CREATE TABLE IF NOT EXISTS pai_subida_partes (
  subida_id  INT UNSIGNED NOT NULL,
  n          INT UNSIGNED NOT NULL,
  datos      MEDIUMBLOB   NOT NULL,
  PRIMARY KEY (subida_id, n),
  CONSTRAINT fk_pai_subida_partes_subida FOREIGN KEY (subida_id)
    REFERENCES pai_subidas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- pai_subidas.bytes: tamaño total de una subida por partes (NULL en las
-- subidas directas a Supabase Storage).
SET @paso = IF(
  EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'pai_subidas' AND column_name = 'bytes'
  ),
  'DO 0',
  'ALTER TABLE pai_subidas ADD COLUMN bytes BIGINT UNSIGNED NULL'
);
PREPARE paso FROM @paso;
EXECUTE paso;
DEALLOCATE PREPARE paso;
