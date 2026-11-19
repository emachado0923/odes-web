-- =============================================================================
-- Migración 4: nombres de tabla con el prefijo de su módulo, y un almacén de
-- archivos por módulo.
--
--   repositorio_*  Repositorio de Productos (/repositorio y /odes), con su
--                  almacén: repositorio_almacen_archivos y
--                  repositorio_almacen_archivo_trozos
--   sivu_*         tableros de SIVU (/tableros): el catálogo sivu_tableros y
--                  las tablas de cada tablero, sivu_tablero_<tablero>_<tabla>
--   pai_*          Plan de Acción Institucional, con su propio almacén:
--                  pai_almacen_archivos y pai_almacen_archivo_trozos
--   sistema_*      control del esquema
--
-- 1. Nombres. Este archivo no renombra nada: lo hace `npm run repositorio:migrar`
--    ANTES de aplicar esquema.sql (TABLAS_RENOMBRADAS en
--    src/repositorio/bd/esquema.ts), porque esquema.sql se vuelve a aplicar en
--    cada corrida y, si no, crearía vacías las tablas nuevas junto a las
--    viejas. En una base nueva, esquema.sql y las migraciones 002 y 003 ya
--    crean las tablas con los nombres nuevos. Índices y restricciones
--    conservan su nombre (uq_archivos_sha256, documentos_pkey...): el código
--    reconoce algunos por ese nombre.
--
-- 2. Almacén del PAI. En la versión 3 las evidencias del PAI guardaban sus fichas
--    en el almacén del repositorio (archivos, hoy repositorio_almacen_archivos).
--    En una base así (la llave fk_pai_evidencias_archivo todavía no apunta a
--    pai_almacen_archivos), esta migración crea el almacén del PAI, le copia
--    esas fichas (con su mismo id) y sus trozos, pasa la llave a
--    pai_almacen_archivos y borra del almacén del repositorio las fichas
--    copiadas que ningún documento usa (sus trozos se van con ellas). Una
--    ficha que usaban a la vez un documento y una evidencia queda en los dos.
--    En una base nueva, o que viene de la versión 2 y acaba de recibir la
--    migración 003, la llave ya apunta al almacén del PAI y no se mueve nada.
--
--    Cada paso se puede repetir (el DDL de MySQL no es transaccional, y MySQL
--    no deja quitar y volver a poner una llave con el mismo nombre en una
--    sola sentencia): la decisión de mover sale de information_schema, y las
--    sentencias condicionales van por PREPARE (MySQL no tiene IF fuera de un
--    procedimiento).
--
-- Para hacerlo a mano en una base con los nombres anteriores, ver
-- "Paso a la versión 4" en db/repositorio/LEEME.md.
-- =============================================================================

-- Las dos tablas, iguales a las de la migración 003 (que ya las creó en una
-- base nueva o que venía de la versión 2).
CREATE TABLE IF NOT EXISTS pai_almacen_archivos (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sha256        CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  mime          VARCHAR(127) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  bytes         BIGINT UNSIGNED NOT NULL,
  trozos        INT UNSIGNED    NOT NULL,
  tamano_trozo  INT UNSIGNED    NOT NULL,
  ancho         SMALLINT UNSIGNED NULL,
  alto          SMALLINT UNSIGNED NULL,
  creado_en     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_pai_almacen_archivos_sha256 (sha256),
  CONSTRAINT ck_pai_almacen_archivos_trozo CHECK (tamano_trozo > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS pai_almacen_archivo_trozos (
  archivo_id  BIGINT UNSIGNED NOT NULL,
  n           INT UNSIGNED    NOT NULL,
  datos       MEDIUMBLOB      NOT NULL,
  PRIMARY KEY (archivo_id, n),
  CONSTRAINT fk_pai_almacen_archivo_trozos_archivo FOREIGN KEY (archivo_id)
    REFERENCES pai_almacen_archivos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 1 = la llave de pai_evidencias todavía no apunta al almacén del PAI: hay
-- que mover las fichas de las evidencias.
SET @pai_mover_almacen = (
  SELECT COUNT(*) = 0 FROM information_schema.referential_constraints
   WHERE constraint_schema = DATABASE()
     AND table_name = 'pai_evidencias'
     AND constraint_name = 'fk_pai_evidencias_archivo'
     AND referenced_table_name = 'pai_almacen_archivos'
);

-- Las fichas de las evidencias y sus trozos, con el mismo id.
INSERT INTO pai_almacen_archivos (id, sha256, mime, bytes, trozos, tamano_trozo, ancho, alto, creado_en)
SELECT a.id, a.sha256, a.mime, a.bytes, a.trozos, a.tamano_trozo, a.ancho, a.alto, a.creado_en
  FROM repositorio_almacen_archivos a
 WHERE @pai_mover_almacen = 1
   AND a.id IN (SELECT e.archivo_id FROM pai_evidencias e)
   AND NOT EXISTS (SELECT 1 FROM pai_almacen_archivos p WHERE p.id = a.id);

INSERT INTO pai_almacen_archivo_trozos (archivo_id, n, datos)
SELECT t.archivo_id, t.n, t.datos
  FROM repositorio_almacen_archivo_trozos t
 WHERE @pai_mover_almacen = 1
   AND t.archivo_id IN (SELECT e.archivo_id FROM pai_evidencias e)
   AND NOT EXISTS (SELECT 1 FROM pai_almacen_archivo_trozos p WHERE p.archivo_id = t.archivo_id AND p.n = t.n);

-- La llave de pai_evidencias pasa al almacén del PAI: se quita la vieja (si
-- sigue ahí) y se pone la nueva, con el mismo nombre.
SET @paso = IF(
  @pai_mover_almacen = 1 AND EXISTS (
    SELECT 1 FROM information_schema.referential_constraints
     WHERE constraint_schema = DATABASE()
       AND table_name = 'pai_evidencias'
       AND constraint_name = 'fk_pai_evidencias_archivo'
  ),
  'ALTER TABLE pai_evidencias DROP FOREIGN KEY fk_pai_evidencias_archivo',
  'DO 0'
);
PREPARE paso FROM @paso;
EXECUTE paso;
DEALLOCATE PREPARE paso;

SET @paso = IF(
  @pai_mover_almacen = 1,
  'ALTER TABLE pai_evidencias ADD CONSTRAINT fk_pai_evidencias_archivo FOREIGN KEY (archivo_id) REFERENCES pai_almacen_archivos (id)',
  'DO 0'
);
PREPARE paso FROM @paso;
EXECUTE paso;
DEALLOCATE PREPARE paso;

-- Fichas copiadas que ningún documento usa: ya no son del repositorio (sus
-- trozos se borran en cascada). Sin condición: en una base sin nada copiado
-- no encuentra ninguna, y así también termina una corrida que se cortó
-- después de pasar la llave.
DELETE FROM repositorio_almacen_archivos
 WHERE EXISTS (SELECT 1 FROM pai_almacen_archivos p
                WHERE p.id = repositorio_almacen_archivos.id AND p.sha256 = repositorio_almacen_archivos.sha256)
   AND NOT EXISTS (SELECT 1 FROM repositorio_documentos d
                    WHERE d.archivo_id = repositorio_almacen_archivos.id
                       OR d.portada_id = repositorio_almacen_archivos.id
                       OR d.miniatura_id = repositorio_almacen_archivos.id);
