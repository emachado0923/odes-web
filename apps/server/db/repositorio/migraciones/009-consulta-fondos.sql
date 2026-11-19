-- =============================================================================
-- Migración 9: ventanilla de consulta de los fondos (/tableros/fondos-2026,
-- pedido del 17-nov-2026: el tablero pasa a ser consulta por persona).
--
-- sivu_tablero_fondos_2026_fichas: UNA FICHA POR BENEFICIO (documento +
-- programa + convocatoria) en JSON, con datos personales (nombre, documento,
-- teléfonos, correos, residencia, giros). La arma
-- datos/tableros/fondos-2026/etl_consulta.py desde el Power BI de seguimiento
-- y se carga por fuera del repositorio (el CSV nunca se versiona). Solo se lee
-- con la sesión de los tableros y por documento exacto.
-- sivu_tablero_fondos_2026_consultas: quién consultó qué documento y cuándo
-- (registro de acceso a datos personales y base del tope por hora).
-- =============================================================================

CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_fichas (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  documento     VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  programa      VARCHAR(16) NOT NULL,
  convocatoria  VARCHAR(60) NOT NULL,
  ficha         LONGTEXT    NOT NULL,
  PRIMARY KEY (id),
  KEY ix_fondos_2026_fichas_documento (documento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_consultas (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  usuario     VARCHAR(64) CHARACTER SET ascii COLLATE ascii_general_ci NOT NULL,
  documento   VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  resultados  INT UNSIGNED NOT NULL,
  ip          VARCHAR(45) NULL,
  creado_en   DATETIME(3) NOT NULL,
  PRIMARY KEY (id),
  KEY ix_fondos_2026_consultas_usuario (usuario, creado_en),
  KEY ix_fondos_2026_consultas_documento (documento)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
