-- =============================================================================
-- Migración 3: Plan de Acción Institucional (rama /pai).
--
-- El PAI es el plan anual de Sapiencia (formato F-ES-DE-003): vigencia (año)
-- -> dependencias -> procesos o proyectos (fichas) -> acciones -> indicadores,
-- con metas por bimestre. Cada dos meses los responsables reportan el avance
-- de sus indicadores (pai_reportes, uno por indicador y bimestre) con
-- evidencias (archivos). El administrador (Planeación) abre y cierra el
-- bimestre, asigna indicadores y otorga autorizaciones. El PAI tiene sus
-- propios usuarios y sesiones (cookie pai_sesion), independientes de la
-- administración del repositorio.
--
-- * Compatible con MySQL 8.0.18; cada sentencia se puede repetir (el DDL de
--   MySQL no es transaccional): CREATE TABLE IF NOT EXISTS con todos sus
--   índices y restricciones adentro, sin ALTER.
-- * No inserta en sistema_esquema_version: lo hace `npm run repositorio:migrar`.
-- * Los datos iniciales (PAI 2026) los carga `npm run pai:cargar-fichas`
--   desde apps/server/datos/pai/2026/pai-2026.json; el primer administrador,
--   `npm run pai:crear-usuario`.
-- * Números (metas y avances): DECIMAL(24,10). Los Excel traen hasta 10
--   decimales (p. ej. GEP-EDI-01: metas de 1/6 = 0.1666666667) y la carga
--   debe conservarlos tal cual; lo que escribe un responsable se limita a 6
--   decimales en la API. mysql2 los devuelve como número (decimalNumbers).
-- * Llaves foráneas: RESTRICT en la estructura (nada se borra en cascada por
--   accidente: la carga decide qué conserva) y CASCADE solo en lo que
--   pertenece del todo a su padre (sesiones, evidencias de un reporte,
--   riesgos de una acción, asignaciones y autorizaciones de un usuario).
--   MySQL no admite CHECK sobre columnas con ON DELETE CASCADE / SET NULL,
--   por eso las columnas de los CHECK de "exactamente uno" usan RESTRICT.
-- * Textos JSON (extras, detalle) en MEDIUMTEXT, interpretados en el código.
-- =============================================================================

-- Usuarios del PAI. Contraseña con scrypt (la misma función del repositorio).
-- debe_cambiar_contrasena = 1: contraseña temporal; solo puede cambiarla.
CREATE TABLE IF NOT EXISTS pai_usuarios (
  id                       INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario                  VARCHAR(64)  CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  nombre                   VARCHAR(120) NOT NULL,
  correo                   VARCHAR(254) NULL,
  cargo                    VARCHAR(160) NULL,
  rol                      VARCHAR(15)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  hash_contrasena          VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  debe_cambiar_contrasena  TINYINT(1)   NOT NULL DEFAULT 0,
  activo                   TINYINT(1)   NOT NULL DEFAULT 1,
  ultimo_acceso            DATETIME(3)  NULL,
  creado_en                DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en           DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_pai_usuarios_usuario (usuario),
  CONSTRAINT ck_pai_usuarios_rol CHECK (rol IN ('responsable', 'administrador')),
  CONSTRAINT ck_pai_usuarios_banderas CHECK (debe_cambiar_contrasena IN (0, 1) AND activo IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Sesiones del PAI: igual que `repositorio_sesiones` del repositorio (solo el sha256 del token).
CREATE TABLE IF NOT EXISTS pai_sesiones (
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
  UNIQUE KEY uq_pai_sesiones_token (token_hash),
  KEY ix_pai_sesiones_usuario (usuario_id),
  KEY ix_pai_sesiones_expira (expira_en),
  CONSTRAINT fk_pai_sesiones_usuario FOREIGN KEY (usuario_id)
    REFERENCES pai_usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Intentos de inicio de sesión del PAI: igual que `repositorio_intentos_acceso`
-- (exito: 0 fallo, 1 acceso correcto, 2 intento en curso).
CREATE TABLE IF NOT EXISTS pai_intentos_acceso (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario    VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  ip         VARCHAR(45) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  exito      TINYINT(1)  NOT NULL,
  creado_en  DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_pai_intentos_usuario (usuario, creado_en),
  KEY ix_pai_intentos_ip (ip, creado_en),
  KEY ix_pai_intentos_fecha (creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Una fila por año. bimestre_abierto NULL = cerrado; abierto_hasta (UTC) es la
-- fecha límite opcional, que se evalúa en cada petición (sin temporizadores).
-- extras: datos del JSON de la carga (formato, notas, conflictos…).
CREATE TABLE IF NOT EXISTS pai_vigencias (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  anio              SMALLINT UNSIGNED NOT NULL,
  bimestre_abierto  TINYINT UNSIGNED NULL,
  abierto_hasta     DATETIME(3) NULL,
  extras            MEDIUMTEXT  NULL,
  actualizado_en    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  actualizado_por   INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pai_vigencias_anio (anio),
  KEY ix_pai_vigencias_actualizado_por (actualizado_por),
  CONSTRAINT fk_pai_vigencias_usuario FOREIGN KEY (actualizado_por)
    REFERENCES pai_usuarios (id) ON DELETE SET NULL,
  CONSTRAINT ck_pai_vigencias_anio CHECK (anio BETWEEN 2000 AND 2100),
  CONSTRAINT ck_pai_vigencias_bimestre CHECK (bimestre_abierto IS NULL OR bimestre_abierto BETWEEN 1 AND 6),
  CONSTRAINT ck_pai_vigencias_hasta CHECK (abierto_hasta IS NULL OR bimestre_abierto IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Dependencias (SAF, DTF, GEP, OCI, OPE…) de una vigencia.
CREATE TABLE IF NOT EXISTS pai_dependencias (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  vigencia_id  INT UNSIGNED NOT NULL,
  sigla        VARCHAR(20)  NOT NULL,
  nombre       VARCHAR(200) NOT NULL,
  orden        SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pai_dependencias_sigla (vigencia_id, sigla),
  CONSTRAINT fk_pai_dependencias_vigencia FOREIGN KEY (vigencia_id) REFERENCES pai_vigencias (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Procesos o proyectos: una ficha F-ES-DE-003 (una hoja de los Excel).
-- clave: identificador estable (saf-talento-humano); codigo: prefijo de los
-- códigos de sus indicadores (SAF-TH). linea_plan_desarrollo va normalizada.
CREATE TABLE IF NOT EXISTS pai_procesos (
  id                          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  vigencia_id                 INT UNSIGNED NOT NULL,
  dependencia_id              INT UNSIGNED NOT NULL,
  clave                       VARCHAR(60)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  codigo                      VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  nombre                      VARCHAR(300) NOT NULL,
  hoja                        VARCHAR(100) NULL,
  tipo                        VARCHAR(10)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  codigo_proyecto             VARCHAR(20)  NULL,
  programa                    VARCHAR(400) NULL,
  linea_plan_desarrollo       VARCHAR(400) NULL,
  dimension_plan_estrategico  VARCHAR(400) NULL,
  objetivo                    TEXT         NULL,
  orden                       SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  extras                      MEDIUMTEXT   NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pai_procesos_clave (vigencia_id, clave),
  UNIQUE KEY uq_pai_procesos_codigo (vigencia_id, codigo),
  KEY ix_pai_procesos_dependencia (dependencia_id),
  CONSTRAINT fk_pai_procesos_vigencia FOREIGN KEY (vigencia_id) REFERENCES pai_vigencias (id),
  CONSTRAINT fk_pai_procesos_dependencia FOREIGN KEY (dependencia_id) REFERENCES pai_dependencias (id),
  CONSTRAINT ck_pai_procesos_tipo CHECK (tipo IN ('proceso', 'proyecto'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Catálogo de riesgos de cada proceso (columna "Riesgo" de la ficha).
-- corrupcion = 1 si es "(RC)"; bloque = n.º de la celda combinada de riesgo.
CREATE TABLE IF NOT EXISTS pai_riesgos (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  proceso_id   INT UNSIGNED NOT NULL,
  orden        SMALLINT UNSIGNED NOT NULL,
  numeral      SMALLINT UNSIGNED NULL,
  texto        TEXT         NOT NULL,
  descripcion  TEXT         NULL,
  corrupcion   TINYINT(1)   NOT NULL DEFAULT 0,
  bloque       SMALLINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pai_riesgos_orden (proceso_id, orden),
  CONSTRAINT fk_pai_riesgos_proceso FOREIGN KEY (proceso_id) REFERENCES pai_procesos (id),
  CONSTRAINT ck_pai_riesgos_corrupcion CHECK (corrupcion IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Acciones de un proceso (celda combinada de la columna ACCIONES).
CREATE TABLE IF NOT EXISTS pai_acciones (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  proceso_id   INT UNSIGNED NOT NULL,
  orden        SMALLINT UNSIGNED NOT NULL,
  descripcion  TEXT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pai_acciones_orden (proceso_id, orden),
  CONSTRAINT fk_pai_acciones_proceso FOREIGN KEY (proceso_id) REFERENCES pai_procesos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Riesgos que cubre cada acción, en orden.
CREATE TABLE IF NOT EXISTS pai_accion_riesgos (
  accion_id  INT UNSIGNED NOT NULL,
  riesgo_id  INT UNSIGNED NOT NULL,
  orden      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (accion_id, riesgo_id),
  KEY ix_pai_accion_riesgos_riesgo (riesgo_id),
  CONSTRAINT fk_pai_accion_riesgos_accion FOREIGN KEY (accion_id)
    REFERENCES pai_acciones (id) ON DELETE CASCADE,
  CONSTRAINT fk_pai_accion_riesgos_riesgo FOREIGN KEY (riesgo_id)
    REFERENCES pai_riesgos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Indicadores. codigo único por vigencia (SAF-TH-02); orden = posición en la
-- acción. Metas por bimestre y total (ya normalizado, nota 11 del JSON);
-- regla_*/divisor_*: cómo se recalculan los totales (ReglaTotal de
-- api-pai.ts). tope_100: 1 con tope de 100 %, 0 sin tope, NULL mixto (ver
-- tope_por_bimestre, JSON {"1":true,…,"6":false,"total":false}).
CREATE TABLE IF NOT EXISTS pai_indicadores (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  vigencia_id           INT UNSIGNED NOT NULL,
  proceso_id            INT UNSIGNED NOT NULL,
  accion_id             INT UNSIGNED NOT NULL,
  codigo                VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  orden                 SMALLINT UNSIGNED NOT NULL,
  nombre                VARCHAR(600) NOT NULL,
  tipo_meta             VARCHAR(12)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  meta_1                DECIMAL(24,10) NOT NULL DEFAULT 0,
  meta_2                DECIMAL(24,10) NOT NULL DEFAULT 0,
  meta_3                DECIMAL(24,10) NOT NULL DEFAULT 0,
  meta_4                DECIMAL(24,10) NOT NULL DEFAULT 0,
  meta_5                DECIMAL(24,10) NOT NULL DEFAULT 0,
  meta_6                DECIMAL(24,10) NOT NULL DEFAULT 0,
  meta_total            DECIMAL(24,10) NOT NULL DEFAULT 0,
  regla_meta_total      VARCHAR(40)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  divisor_meta_total    SMALLINT UNSIGNED NULL,
  regla_avance_total    VARCHAR(40)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  divisor_avance_total  SMALLINT UNSIGNED NULL,
  tope_100              TINYINT(1)   NULL,
  tope_por_bimestre     VARCHAR(200) NULL,
  productos             TEXT NULL,
  rol_responsable       TEXT NULL,
  responsable           TEXT NULL,
  corresponsables       TEXT NULL,
  extras                MEDIUMTEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pai_indicadores_codigo (vigencia_id, codigo),
  KEY ix_pai_indicadores_proceso (proceso_id),
  KEY ix_pai_indicadores_accion (accion_id),
  CONSTRAINT fk_pai_indicadores_vigencia FOREIGN KEY (vigencia_id) REFERENCES pai_vigencias (id),
  CONSTRAINT fk_pai_indicadores_proceso FOREIGN KEY (proceso_id) REFERENCES pai_procesos (id),
  CONSTRAINT fk_pai_indicadores_accion FOREIGN KEY (accion_id) REFERENCES pai_acciones (id),
  CONSTRAINT ck_pai_indicadores_tipo_meta CHECK (tipo_meta IN ('numero', 'porcentaje', 'a_demanda')),
  CONSTRAINT ck_pai_indicadores_reglas CHECK (
    regla_meta_total IN ('suma', 'suma_dividida', 'si_suma_mayor_99_entonces_100', 'constante')
    AND regla_avance_total IN ('suma', 'suma_dividida', 'si_suma_mayor_99_entonces_100', 'constante')
  ),
  CONSTRAINT ck_pai_indicadores_divisores CHECK (
    (divisor_meta_total IS NULL OR divisor_meta_total > 0)
    AND (divisor_avance_total IS NULL OR divisor_avance_total > 0)
  ),
  CONSTRAINT ck_pai_indicadores_tope CHECK (
    (tope_100 IS NULL AND tope_por_bimestre IS NOT NULL) OR tope_100 IN (0, 1)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Reporte de un indicador en un bimestre (a lo sumo uno). origen 'importado'
-- = historial de los Excel (lo reemplaza la carga); 'aplicativo' = escrito
-- aquí. actualizado_en es el token de concurrencia optimista de la API.
CREATE TABLE IF NOT EXISTS pai_reportes (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  indicador_id          INT UNSIGNED NOT NULL,
  bimestre              TINYINT UNSIGNED NOT NULL,
  avance                DECIMAL(24,10) NULL,
  logros                TEXT NULL,
  observaciones         TEXT NULL,
  riesgo_materializado  VARCHAR(2)   CHARACTER SET ascii COLLATE ascii_bin NULL,
  numeral_riesgo        VARCHAR(200) NULL,
  descripcion_riesgo    TEXT NULL,
  fuentes_verificacion  TEXT NULL,
  origen                VARCHAR(12)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  creado_en             DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  actualizado_por       INT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pai_reportes_indicador_bimestre (indicador_id, bimestre),
  KEY ix_pai_reportes_actualizado_por (actualizado_por),
  CONSTRAINT fk_pai_reportes_indicador FOREIGN KEY (indicador_id) REFERENCES pai_indicadores (id),
  CONSTRAINT fk_pai_reportes_usuario FOREIGN KEY (actualizado_por)
    REFERENCES pai_usuarios (id) ON DELETE SET NULL,
  CONSTRAINT ck_pai_reportes_bimestre CHECK (bimestre BETWEEN 1 AND 6),
  CONSTRAINT ck_pai_reportes_avance CHECK (avance IS NULL OR avance >= 0),
  CONSTRAINT ck_pai_reportes_riesgo CHECK (riesgo_materializado IS NULL OR riesgo_materializado IN ('SI', 'NO')),
  CONSTRAINT ck_pai_reportes_origen CHECK (origen IN ('importado', 'aplicativo'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Almacén de archivos del PAI, aparte del del repositorio
-- (repositorio_almacen_archivos): las fichas de las evidencias, una por
-- contenido (sha256), con las mismas columnas. Con Supabase el contenido va en
-- el bucket PRIVADO del PAI (pai_evidencias.ruta_privada) y la ficha queda con
-- trozos = 0; sin Supabase, en pai_almacen_archivo_trozos (trozos de ~1 MB,
-- n desde 0, que se borran con su ficha). La migración 004 crea estas dos
-- tablas igual en las bases que ya tenían esta migración sin ellas.
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

-- Evidencias de un reporte. archivo_id: su ficha en pai_almacen_archivos
-- (el contenido, en el bucket privado si ruta_privada no es NULL o en
-- pai_almacen_archivo_trozos). nombre: el original; tipo: MIME detectado por
-- firma.
CREATE TABLE IF NOT EXISTS pai_evidencias (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reporte_id    INT UNSIGNED NOT NULL,
  archivo_id    BIGINT UNSIGNED NOT NULL,
  ruta_privada  VARCHAR(300) CHARACTER SET ascii COLLATE ascii_bin NULL,
  nombre        VARCHAR(255) NOT NULL,
  tipo          VARCHAR(127) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  bytes         BIGINT UNSIGNED NOT NULL,
  subido_por    INT UNSIGNED NULL,
  subido_en     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_pai_evidencias_reporte (reporte_id),
  KEY ix_pai_evidencias_archivo (archivo_id),
  KEY ix_pai_evidencias_subido_por (subido_por),
  CONSTRAINT fk_pai_evidencias_reporte FOREIGN KEY (reporte_id)
    REFERENCES pai_reportes (id) ON DELETE CASCADE,
  CONSTRAINT fk_pai_evidencias_archivo FOREIGN KEY (archivo_id) REFERENCES pai_almacen_archivos (id),
  CONSTRAINT fk_pai_evidencias_usuario FOREIGN KEY (subido_por)
    REFERENCES pai_usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Subidas directas pendientes (Supabase): cada URL firmada de subida al
-- bucket privado (subidas/<uuid>) queda aquí, ligada a quien la pidió, al
-- indicador y al bimestre, hasta que se usa (POST .../evidencias) o vence
-- (la purga de la propia API borra el objeto y la fila). Así se limitan las
-- pendientes por usuario y nadie usa la subida de otro.
CREATE TABLE IF NOT EXISTS pai_subidas (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  ruta          VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  usuario_id    INT UNSIGNED NOT NULL,
  indicador_id  INT UNSIGNED NOT NULL,
  bimestre      TINYINT UNSIGNED NOT NULL,
  creado_en     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_pai_subidas_ruta (ruta),
  KEY ix_pai_subidas_usuario (usuario_id, creado_en),
  KEY ix_pai_subidas_fecha (creado_en),
  KEY ix_pai_subidas_indicador (indicador_id),
  CONSTRAINT fk_pai_subidas_usuario FOREIGN KEY (usuario_id)
    REFERENCES pai_usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_pai_subidas_indicador FOREIGN KEY (indicador_id)
    REFERENCES pai_indicadores (id) ON DELETE CASCADE,
  CONSTRAINT ck_pai_subidas_bimestre CHECK (bimestre BETWEEN 1 AND 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Asignaciones: un proceso completo (todos sus indicadores) o un indicador
-- suelto, exactamente uno de los dos.
CREATE TABLE IF NOT EXISTS pai_asignaciones (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id    INT UNSIGNED NOT NULL,
  proceso_id    INT UNSIGNED NULL,
  indicador_id  INT UNSIGNED NULL,
  creado_en     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_pai_asignaciones_proceso (usuario_id, proceso_id),
  UNIQUE KEY uq_pai_asignaciones_indicador (usuario_id, indicador_id),
  KEY ix_pai_asignaciones_proceso (proceso_id),
  KEY ix_pai_asignaciones_indicador (indicador_id),
  CONSTRAINT fk_pai_asignaciones_usuario FOREIGN KEY (usuario_id)
    REFERENCES pai_usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_pai_asignaciones_proceso FOREIGN KEY (proceso_id) REFERENCES pai_procesos (id),
  CONSTRAINT fk_pai_asignaciones_indicador FOREIGN KEY (indicador_id) REFERENCES pai_indicadores (id),
  CONSTRAINT ck_pai_asignaciones_uno CHECK (
    (proceso_id IS NULL AND indicador_id IS NOT NULL) OR (proceso_id IS NOT NULL AND indicador_id IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Autorizaciones para reportar un bimestre que no es el abierto, sobre un
-- proceso o un indicador (exactamente uno), hasta vigente_hasta (UTC).
-- Revocar = revocada_en / revocada_por (la fila se conserva).
CREATE TABLE IF NOT EXISTS pai_autorizaciones (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario_id     INT UNSIGNED NOT NULL,
  bimestre       TINYINT UNSIGNED NOT NULL,
  proceso_id     INT UNSIGNED NULL,
  indicador_id   INT UNSIGNED NULL,
  vigente_hasta  DATETIME(3)  NOT NULL,
  motivo         VARCHAR(500) NOT NULL,
  otorgada_por   INT UNSIGNED NULL,
  otorgada_en    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revocada_en    DATETIME(3)  NULL,
  revocada_por   INT UNSIGNED NULL,
  PRIMARY KEY (id),
  KEY ix_pai_autorizaciones_usuario (usuario_id, bimestre),
  KEY ix_pai_autorizaciones_proceso (proceso_id),
  KEY ix_pai_autorizaciones_indicador (indicador_id),
  KEY ix_pai_autorizaciones_otorgada_por (otorgada_por),
  KEY ix_pai_autorizaciones_revocada_por (revocada_por),
  CONSTRAINT fk_pai_autorizaciones_usuario FOREIGN KEY (usuario_id)
    REFERENCES pai_usuarios (id) ON DELETE CASCADE,
  CONSTRAINT fk_pai_autorizaciones_proceso FOREIGN KEY (proceso_id) REFERENCES pai_procesos (id),
  CONSTRAINT fk_pai_autorizaciones_indicador FOREIGN KEY (indicador_id) REFERENCES pai_indicadores (id),
  CONSTRAINT fk_pai_autorizaciones_otorgada_por FOREIGN KEY (otorgada_por)
    REFERENCES pai_usuarios (id) ON DELETE SET NULL,
  CONSTRAINT fk_pai_autorizaciones_revocada_por FOREIGN KEY (revocada_por)
    REFERENCES pai_usuarios (id) ON DELETE SET NULL,
  CONSTRAINT ck_pai_autorizaciones_bimestre CHECK (bimestre BETWEEN 1 AND 6),
  CONSTRAINT ck_pai_autorizaciones_uno CHECK (
    (proceso_id IS NULL AND indicador_id IS NOT NULL) OR (proceso_id IS NOT NULL AND indicador_id IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Registro (auditoría) del PAI. Sin llaves foráneas: se conserva aunque
-- cambien o desaparezcan el usuario o el indicador (por eso guarda también
-- el nombre de usuario y el código). detalle: JSON con valores anteriores y
-- nuevos.
CREATE TABLE IF NOT EXISTS pai_registro (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  fecha             DATETIME(3)  NOT NULL,
  usuario_id        INT UNSIGNED NULL,
  usuario           VARCHAR(64)  NULL,
  accion            VARCHAR(30)  CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  indicador_id      INT UNSIGNED NULL,
  codigo_indicador  VARCHAR(20)  NULL,
  bimestre          TINYINT UNSIGNED NULL,
  detalle           MEDIUMTEXT   NULL,
  PRIMARY KEY (id),
  KEY ix_pai_registro_fecha (fecha),
  KEY ix_pai_registro_usuario (usuario_id, id),
  KEY ix_pai_registro_indicador (indicador_id, id),
  KEY ix_pai_registro_accion (accion, id),
  CONSTRAINT ck_pai_registro_bimestre CHECK (bimestre IS NULL OR bimestre BETWEEN 1 AND 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
