-- =============================================================================
-- Repositorio de Productos del Observatorio de Sapiencia (rama /repositorio)
-- Esquema MySQL, versión 1.
--
-- * Compatible con MySQL 8.0.18 (Cloud SQL de la entidad) y con 8.4 / 9.x.
--   No usa funciones de 8.0.19+ (alias de fila en INSERT, TABLE, VALUES ROW).
-- * Idempotente: se puede ejecutar todas las veces que haga falta
--   (CREATE TABLE IF NOT EXISTS + INSERT IGNORE). No borra ni cambia datos.
-- * Se aplica con una cuenta ADMINISTRADORA dentro de la base ya creada
--   (ver permisos.sql), con TablePlus (abrir la base, pegar todo y ejecutar)
--   o con `npm run repositorio:migrar`. El usuario de la aplicación solo tiene
--   SELECT/INSERT/UPDATE/DELETE y no puede crear tablas.
-- * Texto en utf8mb4 / utf8mb4_0900_ai_ci (sin distinguir tildes ni
--   mayúsculas al comparar), motor InnoDB, fechas DATETIME(3) en UTC.
-- =============================================================================

-- Guarda de la versión 4. Si la base todavía tiene los nombres de tabla
-- anteriores (esquema_version, documentos, archivos...), esta sentencia falla
-- con "Subquery returns more than 1 row" (MySQL no tiene otra forma de lanzar
-- un error fuera de un procedimiento) y no se crea nada. Sin ella, pegar este
-- archivo sobre una base vieja, o correr un dist/ sin recompilar, crearía las
-- tablas nuevas vacías junto a las viejas. Primero pase la base a los nombres
-- nuevos: `npm run repositorio:migrar` lo hace solo, o a mano según "Paso a la
-- versión 4" en LEEME.md.
SELECT (
  SELECT 1
  UNION ALL
  SELECT 1 FROM information_schema.tables
   WHERE table_schema = DATABASE() AND table_name = 'esquema_version'
) AS `base_con_nombres_anteriores_ver_LEEME_paso_a_la_version_4`;

-- Versión del esquema aplicada (la consulta el servidor al conectarse).
CREATE TABLE IF NOT EXISTS sistema_esquema_version (
  version      INT UNSIGNED NOT NULL,
  descripcion  VARCHAR(200) NOT NULL,
  aplicado_en  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Una sola fila: contador de cambios del contenido público. Cada escritura lo
-- incrementa en su transacción; el servidor lo usa para invalidar su caché
-- (también si escribe otro proceso, como el importador).
CREATE TABLE IF NOT EXISTS repositorio_estado (
  id              TINYINT UNSIGNED NOT NULL,
  version         BIGINT UNSIGNED  NOT NULL DEFAULT 0,
  actualizado_en  DATETIME(3)      NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  CONSTRAINT ck_estado_repositorio_unico CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO repositorio_estado (id, version) VALUES (1, 0);

-- Categorías (Boletín, Estudio...). El nombre es único sin distinguir tildes
-- ni mayúsculas (lo garantiza la intercalación _ai_ci).
CREATE TABLE IF NOT EXISTS repositorio_categorias (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre          VARCHAR(100) NOT NULL,
  orden           INT UNSIGNED NOT NULL DEFAULT 0,
  creado_en       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_categorias_nombre (nombre),
  KEY ix_categorias_orden (orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Almacén de archivos del repositorio: documento, portada (JPEG 720×720) o
-- miniatura (WebP 192×192). Las evidencias del PAI tienen su propio almacén
-- (pai_almacen_archivos, migración 003). Un archivo con el mismo contenido
-- (sha256) se guarda una sola vez. El contenido va en
-- repositorio_almacen_archivo_trozos.
CREATE TABLE IF NOT EXISTS repositorio_almacen_archivos (
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
  UNIQUE KEY uq_archivos_sha256 (sha256),
  CONSTRAINT ck_archivos_trozo CHECK (tamano_trozo > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Contenido binario, en trozos de ~1 MB (todos del mismo tamaño salvo el
-- último). n empieza en 0. Se borran solos al borrar el archivo.
CREATE TABLE IF NOT EXISTS repositorio_almacen_archivo_trozos (
  archivo_id  BIGINT UNSIGNED NOT NULL,
  n           INT UNSIGNED    NOT NULL,
  datos       MEDIUMBLOB      NOT NULL,
  PRIMARY KEY (archivo_id, n),
  CONSTRAINT fk_archivo_trozos_archivo FOREIGN KEY (archivo_id)
    REFERENCES repositorio_almacen_archivos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Productos del repositorio.
CREATE TABLE IF NOT EXISTS repositorio_documentos (
  id                      VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  orden                   INT UNSIGNED  NOT NULL,
  titulo                  VARCHAR(300)  NOT NULL,
  subtitulo               VARCHAR(400)  NULL,
  descripcion             VARCHAR(700)  NULL,
  categoria_id            INT UNSIGNED  NOT NULL,
  numero                  VARCHAR(20)   NULL,
  anio                    SMALLINT UNSIGNED NULL,
  mes                     TINYINT UNSIGNED  NULL,
  idioma                  ENUM('es', 'en') NOT NULL,
  tipo                    ENUM('documento', 'tablero', 'entrada') NOT NULL,
  url_ver_externa         VARCHAR(2048) NULL,
  url_entrada_blog        VARCHAR(2048) NULL,
  nota                    VARCHAR(300)  NULL,
  permite_descarga        TINYINT(1)    NOT NULL DEFAULT 0,
  equivalente_en_espanol  VARCHAR(400)  NULL,
  notas_internas          TEXT          NULL,
  archivo_id              BIGINT UNSIGNED NULL,
  portada_id              BIGINT UNSIGNED NULL,
  miniatura_id            BIGINT UNSIGNED NULL,
  publicado               TINYINT(1)    NOT NULL DEFAULT 0,
  -- Referencia histórica de la carga inicial (url_ver, url_descarga,
  -- origen.pagina_sitio y origen.subido del paquete). Solo lectura.
  url_original            VARCHAR(2048) NULL,
  url_descarga_original   VARCHAR(2048) NULL,
  pagina_original         VARCHAR(200)  NULL,
  subido_original         CHAR(7)       NULL,
  creado_en               DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en          DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_por         VARCHAR(64)   NULL,
  PRIMARY KEY (id),
  KEY ix_documentos_publicado_orden (publicado, orden),
  KEY ix_documentos_orden (orden),
  KEY ix_documentos_categoria (categoria_id),
  KEY ix_documentos_archivo (archivo_id),
  KEY ix_documentos_portada (portada_id),
  KEY ix_documentos_miniatura (miniatura_id),
  CONSTRAINT fk_documentos_categoria FOREIGN KEY (categoria_id)
    REFERENCES repositorio_categorias (id),
  CONSTRAINT fk_documentos_archivo FOREIGN KEY (archivo_id)
    REFERENCES repositorio_almacen_archivos (id),
  CONSTRAINT fk_documentos_portada FOREIGN KEY (portada_id)
    REFERENCES repositorio_almacen_archivos (id),
  CONSTRAINT fk_documentos_miniatura FOREIGN KEY (miniatura_id)
    REFERENCES repositorio_almacen_archivos (id),
  CONSTRAINT ck_documentos_anio CHECK (anio IS NULL OR anio BETWEEN 1900 AND 2200),
  CONSTRAINT ck_documentos_mes CHECK (mes IS NULL OR (mes BETWEEN 1 AND 12 AND anio IS NOT NULL)),
  CONSTRAINT ck_documentos_orden CHECK (orden >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Palabras clave. `clave` es el texto normalizado por la aplicación
-- (minúsculas, sin tildes, espacios simples): "Educación" y "educacion" son
-- la misma palabra y se escriben igual en todas las tarjetas.
CREATE TABLE IF NOT EXISTS repositorio_palabras_clave (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  texto      VARCHAR(80)  NOT NULL,
  clave      VARCHAR(80)  CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  creado_en  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_palabras_clave_clave (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Palabras de cada documento, en su orden (posicion 1..7; el máximo de 7 lo
-- controla la aplicación).
CREATE TABLE IF NOT EXISTS repositorio_documento_palabras_clave (
  documento_id  VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  palabra_id    INT UNSIGNED     NOT NULL,
  posicion      TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (documento_id, palabra_id),
  KEY ix_documento_palabras_palabra (palabra_id),
  CONSTRAINT fk_documento_palabras_documento FOREIGN KEY (documento_id)
    REFERENCES repositorio_documentos (id) ON DELETE CASCADE,
  CONSTRAINT fk_documento_palabras_palabra FOREIGN KEY (palabra_id)
    REFERENCES repositorio_palabras_clave (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Usuarios de la administración. La contraseña se guarda con scrypt y sal
-- propia ("scrypt$N$r$p$sal$hash"); se crean con `npm run repositorio:crear-admin`.
CREATE TABLE IF NOT EXISTS repositorio_administradores (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario          VARCHAR(64)  CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  nombre           VARCHAR(120) NULL,
  hash_contrasena  VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  activo           TINYINT(1)   NOT NULL DEFAULT 1,
  ultimo_acceso    DATETIME(3)  NULL,
  creado_en        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_administradores_usuario (usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Sesiones de la administración. Solo se guarda el sha256 del token de la
-- cookie (quien lea la base no puede suplantar a nadie). Vencen por
-- inactividad (ultimo_uso) y por duración máxima (expira_en).
CREATE TABLE IF NOT EXISTS repositorio_sesiones (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  token_hash  CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  csrf        CHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  usuario_id  INT UNSIGNED NOT NULL,
  creada_en   DATETIME(3)  NOT NULL,
  ultimo_uso  DATETIME(3)  NOT NULL,
  expira_en   DATETIME(3)  NOT NULL,
  ip          VARCHAR(45)  CHARACTER SET ascii COLLATE ascii_general_ci NULL,
  agente      VARCHAR(255) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sesiones_token (token_hash),
  KEY ix_sesiones_usuario (usuario_id),
  KEY ix_sesiones_expira (expira_en),
  CONSTRAINT fk_sesiones_usuario FOREIGN KEY (usuario_id)
    REFERENCES repositorio_administradores (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Intentos de inicio de sesión (límite y bloqueo temporal por usuario y por
-- IP). Se purgan solos después de un día.
CREATE TABLE IF NOT EXISTS repositorio_intentos_acceso (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario    VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  ip         VARCHAR(45) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  exito      TINYINT(1)  NOT NULL,
  creado_en  DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_intentos_usuario (usuario, creado_en),
  KEY ix_intentos_ip (ip, creado_en),
  KEY ix_intentos_fecha (creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Registro de cambios (auditoría). Sin llave foránea a documentos: el
-- registro de un documento borrado se conserva.
CREATE TABLE IF NOT EXISTS repositorio_cambios (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fecha         DATETIME(3)  NOT NULL,
  usuario       VARCHAR(64)  NULL,
  accion        VARCHAR(30)  CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  documento_id  VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NULL,
  detalle       VARCHAR(1000) NULL,
  PRIMARY KEY (id),
  KEY ix_cambios_fecha (fecha),
  KEY ix_cambios_documento (documento_id, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO sistema_esquema_version (version, descripcion)
VALUES (1, 'Esquema inicial: documentos, archivos en trozos, palabras clave, administración y registro de cambios');
