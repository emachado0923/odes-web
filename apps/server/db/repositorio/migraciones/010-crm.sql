-- =============================================================================
-- Migración 10: CRM de la Oficina de Planeación (rama /crm, 24-nov-2026).
--
-- Tareas que el líder de la oficina asigna a las personas del equipo, con
-- adjuntos y entregables, y los correos que avisan de cada paso. Las usa
-- src/crm (contrato en src/crm/api-crm.ts).
--
-- crm_almacen_archivos y crm_almacen_archivo_trozos: el almacén de archivos
--   del CRM (adjuntos, entregables y fotos), aparte de los del repositorio y
--   del PAI y con sus mismas columnas: una ficha por contenido (sha256) y el
--   contenido en trozos de ~1 MB (n desde 0) que se borran con su ficha.
-- crm_personas: el equipo, en el orden de las tarjetas de la pantalla de
--   inicio, con correo y foto. Una persona es el líder (es_lider). Nadie del
--   equipo tiene cuenta: entra con un clic en su tarjeta.
-- crm_tareas: cada tarea, con su responsable, estado (pendiente, en_proceso,
--   terminada), fecha límite y si exige entregable para terminarla. Borrar
--   una tarea solo la oculta (eliminada_en).
-- crm_tarea_archivos: adjuntos (los sube el líder: subido_por_id NULL) y
--   entregables (los sube el responsable) de cada tarea, en el almacén.
-- crm_tarea_eventos: el historial de cada tarea (qué pasó, quién y desde qué
--   IP); también es la base del tope por IP de las peticiones del equipo.
-- crm_correos: cada aviso por correo (asignación, terminación, devolución),
--   guardado antes de enviarlo, con su estado, intentos y último error.
--   adjuntos: JSON con los ids de crm_tarea_archivos que van en el correo.
-- crm_acceso_usuarios, crm_acceso_sesiones y crm_acceso_intentos: la cuenta
--   única del líder (usuario fijo lider, solo contraseña, scrypt), sus
--   sesiones y los intentos de ingreso. Iguales a las sivu_acceso_* de la
--   migración 8.
--
-- * Compatible con MySQL 8.0.18; cada sentencia se puede repetir (el DDL de
--   MySQL no es transaccional): CREATE TABLE IF NOT EXISTS con todos sus
--   índices y restricciones adentro, sin ALTER.
-- * No inserta en sistema_esquema_version: lo hace npm run repositorio:migrar.
-- * No trae datos. Este repositorio es público: los nombres y correos del
--   equipo y la clave del líder nunca van en él. Se cargan con
--   npm run crm:cargar-equipo (desde un JSON en apps/server/datos/crm/, que
--   git ignora) y npm run crm:clave-lider; con --solo-sql las dos imprimen el
--   SQL para correrlo a mano.
-- * MySQL no admite CHECK sobre columnas con ON DELETE CASCADE / SET NULL en
--   su llave: los CHECK de estas tablas no tocan tarea_id.
-- =============================================================================

CREATE TABLE IF NOT EXISTS crm_almacen_archivos (
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
  UNIQUE KEY uq_crm_almacen_archivos_sha256 (sha256),
  CONSTRAINT ck_crm_almacen_archivos_trozo CHECK (tamano_trozo > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS crm_almacen_archivo_trozos (
  archivo_id  BIGINT UNSIGNED NOT NULL,
  n           INT UNSIGNED    NOT NULL,
  datos       MEDIUMBLOB      NOT NULL,
  PRIMARY KEY (archivo_id, n),
  CONSTRAINT fk_crm_almacen_archivo_trozos_archivo FOREIGN KEY (archivo_id)
    REFERENCES crm_almacen_archivos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- El correo es único sin distinguir mayúsculas (la colación de la tabla).
-- foto_version cambia con cada foto nueva: va en la URL (?v=) para la caché.
CREATE TABLE IF NOT EXISTS crm_personas (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  nombre           VARCHAR(120) NOT NULL,
  correo           VARCHAR(254) NOT NULL,
  es_lider         TINYINT(1)   NOT NULL DEFAULT 0,
  activo           TINYINT(1)   NOT NULL DEFAULT 1,
  orden            INT          NOT NULL DEFAULT 0,
  foto_archivo_id  BIGINT UNSIGNED NULL,
  foto_version     INT UNSIGNED NOT NULL DEFAULT 0,
  creado_en        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_crm_personas_correo (correo),
  KEY ix_crm_personas_orden (activo, orden),
  KEY ix_crm_personas_foto (foto_archivo_id),
  CONSTRAINT fk_crm_personas_foto FOREIGN KEY (foto_archivo_id) REFERENCES crm_almacen_archivos (id),
  CONSTRAINT ck_crm_personas_lider CHECK (es_lider IN (0, 1)),
  CONSTRAINT ck_crm_personas_activo CHECK (activo IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- descripcion sin DEFAULT (MySQL no lo admite en TEXT): la aplicación inserta ''.
CREATE TABLE IF NOT EXISTS crm_tareas (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  titulo               VARCHAR(160) NOT NULL,
  descripcion          TEXT         NOT NULL,
  responsable_id       INT UNSIGNED NOT NULL,
  estado               VARCHAR(12)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'pendiente',
  fecha_limite         DATE         NULL,
  requiere_entregable  TINYINT(1)   NOT NULL DEFAULT 0,
  nota_cierre          TEXT         NULL,
  avisada_en           DATETIME(3)  NULL,
  iniciada_en          DATETIME(3)  NULL,
  terminada_en         DATETIME(3)  NULL,
  eliminada_en         DATETIME(3)  NULL,
  creado_en            DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_crm_tareas_responsable (responsable_id, estado),
  KEY ix_crm_tareas_estado (estado, terminada_en),
  CONSTRAINT fk_crm_tareas_responsable FOREIGN KEY (responsable_id) REFERENCES crm_personas (id),
  CONSTRAINT ck_crm_tareas_estado CHECK (estado IN ('pendiente', 'en_proceso', 'terminada')),
  CONSTRAINT ck_crm_tareas_entregable CHECK (requiere_entregable IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS crm_tarea_archivos (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  tarea_id       INT UNSIGNED NOT NULL,
  archivo_id     BIGINT UNSIGNED NOT NULL,
  tipo           VARCHAR(10)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  nombre         VARCHAR(255) NOT NULL,
  subido_por_id  INT UNSIGNED NULL,
  creado_en      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_crm_tarea_archivos_tarea (tarea_id, tipo),
  KEY ix_crm_tarea_archivos_archivo (archivo_id),
  KEY ix_crm_tarea_archivos_persona (subido_por_id),
  CONSTRAINT fk_crm_tarea_archivos_tarea FOREIGN KEY (tarea_id)
    REFERENCES crm_tareas (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_tarea_archivos_archivo FOREIGN KEY (archivo_id) REFERENCES crm_almacen_archivos (id),
  CONSTRAINT fk_crm_tarea_archivos_persona FOREIGN KEY (subido_por_id) REFERENCES crm_personas (id),
  CONSTRAINT ck_crm_tarea_archivos_tipo CHECK (tipo IN ('adjunto', 'entregable'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- creado_en lo pone la aplicación (con la hora de la petición).
CREATE TABLE IF NOT EXISTS crm_tarea_eventos (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tarea_id    INT UNSIGNED  NOT NULL,
  tipo        VARCHAR(20)   CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  actor       VARCHAR(12)   CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  persona_id  INT UNSIGNED  NULL,
  de_estado   VARCHAR(12)   CHARACTER SET ascii COLLATE ascii_bin NULL,
  a_estado    VARCHAR(12)   CHARACTER SET ascii COLLATE ascii_bin NULL,
  detalle     VARCHAR(1000) NULL,
  ip          VARCHAR(45)   CHARACTER SET ascii COLLATE ascii_general_ci NULL,
  creado_en   DATETIME(3)   NOT NULL,
  PRIMARY KEY (id),
  KEY ix_crm_tarea_eventos_tarea (tarea_id, creado_en),
  KEY ix_crm_tarea_eventos_ip (ip, creado_en),
  KEY ix_crm_tarea_eventos_persona (persona_id),
  CONSTRAINT fk_crm_tarea_eventos_tarea FOREIGN KEY (tarea_id)
    REFERENCES crm_tareas (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_tarea_eventos_persona FOREIGN KEY (persona_id) REFERENCES crm_personas (id),
  CONSTRAINT ck_crm_tarea_eventos_actor CHECK (actor IN ('lider', 'responsable'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Cola y bitácora de los correos. tarea_id queda en NULL si la tarea se borra
-- de la base (borrar desde el CRM solo la oculta).
CREATE TABLE IF NOT EXISTS crm_correos (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tarea_id           INT UNSIGNED  NULL,
  tipo               VARCHAR(20)   CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  para               VARCHAR(254)  NOT NULL,
  responder_a        VARCHAR(254)  NULL,
  asunto             VARCHAR(255)  NOT NULL,
  cuerpo_texto       MEDIUMTEXT    NOT NULL,
  cuerpo_html        MEDIUMTEXT    NOT NULL,
  adjuntos           VARCHAR(1000) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT '[]',
  estado             VARCHAR(14)   CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'pendiente',
  intentos           INT UNSIGNED  NOT NULL DEFAULT 0,
  ultimo_error       VARCHAR(1000) NULL,
  id_mensaje         VARCHAR(255)  NULL,
  creado_en          DATETIME(3)   NOT NULL,
  enviado_en         DATETIME(3)   NULL,
  ultimo_intento_en  DATETIME(3)   NULL,
  PRIMARY KEY (id),
  KEY ix_crm_correos_estado (estado, creado_en),
  KEY ix_crm_correos_tarea (tarea_id),
  CONSTRAINT fk_crm_correos_tarea FOREIGN KEY (tarea_id)
    REFERENCES crm_tareas (id) ON DELETE SET NULL,
  CONSTRAINT ck_crm_correos_estado CHECK (estado IN ('pendiente', 'enviado', 'error', 'sin_configurar'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- La cuenta del líder: las mismas tres tablas del acceso a los tableros (008).
CREATE TABLE IF NOT EXISTS crm_acceso_usuarios (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario          VARCHAR(64)  CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  nombre           VARCHAR(120) NULL,
  hash_contrasena  VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  activo           TINYINT(1)   NOT NULL DEFAULT 1,
  ultimo_acceso    DATETIME(3)  NULL,
  creado_en        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_crm_acceso_usuarios_usuario (usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Solo el sha256 del token de la cookie (quien lea la base no puede suplantar a nadie).
CREATE TABLE IF NOT EXISTS crm_acceso_sesiones (
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
  UNIQUE KEY uq_crm_acceso_sesiones_token (token_hash),
  KEY ix_crm_acceso_sesiones_usuario (usuario_id),
  KEY ix_crm_acceso_sesiones_expira (expira_en),
  CONSTRAINT fk_crm_acceso_sesiones_usuario FOREIGN KEY (usuario_id)
    REFERENCES crm_acceso_usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Intentos de inicio de sesión (límite y bloqueo temporal por usuario y por IP).
CREATE TABLE IF NOT EXISTS crm_acceso_intentos (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario    VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  ip         VARCHAR(45) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  exito      TINYINT(1)  NOT NULL,
  creado_en  DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_crm_acceso_intentos_usuario (usuario, creado_en),
  KEY ix_crm_acceso_intentos_ip (ip, creado_en),
  KEY ix_crm_acceso_intentos_fecha (creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
