-- =============================================================================
-- Migración 8: acceso a los tableros privados de SIVU (hoy, /tableros/fondos-2026).
--
-- Las mismas tres tablas del inicio de sesión de la administración del
-- repositorio (usuarios, sesiones e intentos), pero propias de los tableros:
-- una cuenta de tableros no entra a la administración ni al PAI, y al revés.
-- Las usa ServicioSesionesTableros (src/sivu/acceso). Las cuentas se crean con
-- `npm run tableros:crear-usuario`; la contraseña se guarda con scrypt.
-- =============================================================================

CREATE TABLE IF NOT EXISTS sivu_acceso_usuarios (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario          VARCHAR(64)  CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  nombre           VARCHAR(120) NULL,
  hash_contrasena  VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  activo           TINYINT(1)   NOT NULL DEFAULT 1,
  ultimo_acceso    DATETIME(3)  NULL,
  creado_en        DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  actualizado_en   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_sivu_acceso_usuarios_usuario (usuario)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Solo el sha256 del token de la cookie (quien lea la base no puede suplantar a nadie).
CREATE TABLE IF NOT EXISTS sivu_acceso_sesiones (
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
  UNIQUE KEY uq_sivu_acceso_sesiones_token (token_hash),
  KEY ix_sivu_acceso_sesiones_usuario (usuario_id),
  KEY ix_sivu_acceso_sesiones_expira (expira_en),
  CONSTRAINT fk_sivu_acceso_sesiones_usuario FOREIGN KEY (usuario_id)
    REFERENCES sivu_acceso_usuarios (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Intentos de inicio de sesión (límite y bloqueo temporal por usuario y por IP).
CREATE TABLE IF NOT EXISTS sivu_acceso_intentos (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario    VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  ip         VARCHAR(45) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  exito      TINYINT(1)  NOT NULL,
  creado_en  DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_sivu_acceso_intentos_usuario (usuario, creado_en),
  KEY ix_sivu_acceso_intentos_ip (ip, creado_en),
  KEY ix_sivu_acceso_intentos_fecha (creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
