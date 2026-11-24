-- =============================================================================
-- Migración 11: cuenta de correo del CRM guardada por el líder (24-nov-2026).
--
-- crm_correo_cuenta: la cuenta con la que salen los avisos del CRM cuando el
--   servidor no tiene las variables CRM_CORREO_* (si las tiene, mandan ellas
--   y esta fila no se usa). Una sola fila (id = 1). La guarda el líder desde
--   /crm/lider/correos; la usa src/crm/correo/cuenta-correo.ts.
--   clave_cifrada: la contraseña de aplicación cifrada con AES-256-GCM
--   ('v1.' + base64url(iv | tag | cifrado)), con una llave que NO está en la
--   base: se deriva de CRM_CORREO_LLAVE o, sin ella, de la contraseña de la
--   base de la aplicación (cifrado-cuenta.ts). Nunca se devuelve.
--   seguro: 1 = TLS desde el inicio (465); 0 = STARTTLS obligatorio (587).
--   actualizado_por: el nombre de la sesión del líder que la guardó.
--
-- * Compatible con MySQL 8.0.18 y se puede repetir: CREATE TABLE IF NOT
--   EXISTS con sus restricciones adentro, sin ALTER.
-- * Sin AUTO_INCREMENT: la fila se escribe con id = 1 (no va en TABLAS_CON_ID).
-- * No inserta en sistema_esquema_version: lo hace npm run repositorio:migrar.
-- * No trae datos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS crm_correo_cuenta (
  id               TINYINT UNSIGNED NOT NULL,
  usuario          VARCHAR(254) NOT NULL,
  clave_cifrada    VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  host             VARCHAR(253) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  puerto           INT UNSIGNED NOT NULL,
  seguro           TINYINT(1)   NOT NULL,
  nombre           VARCHAR(100) NOT NULL,
  actualizado_en   DATETIME(3)  NOT NULL,
  actualizado_por  VARCHAR(120) NULL,
  PRIMARY KEY (id),
  CONSTRAINT ck_crm_correo_cuenta_id CHECK (id = 1),
  CONSTRAINT ck_crm_correo_cuenta_puerto CHECK (puerto BETWEEN 1 AND 65535),
  CONSTRAINT ck_crm_correo_cuenta_seguro CHECK (seguro IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
