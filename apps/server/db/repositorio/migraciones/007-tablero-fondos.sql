-- =============================================================================
-- Migración 7: tablero "Beneficiarios de los fondos de Sapiencia (2026)"
-- (/tableros/fondos-2026).
--
-- Solo cifras agregadas: las saca datos/tableros/fondos-2026/etl_fondos.py del
-- Power BI de seguimiento de los fondos y las carga
-- `npm run tableros:cargar-fondos`, que reemplaza todo el contenido; nadie las
-- edita a mano. Ninguna tabla guarda datos de una persona: los estados se
-- cuentan por programa, convocatoria y periodo, y el sexo, la comuna y la
-- institución solo de los beneficios activos, cada uno por separado.
-- GET /api/sivu/tableros/fondos-2026 las entrega con la forma de fondos.json.
--
-- Las filas se refieren a las dimensiones por su posición (indice), como en el
-- tablero de matrícula. Nombres: sivu_tablero_fondos_2026_<tabla>, y los
-- índices y las restricciones también llevan fondos_2026.
-- =============================================================================

-- Una sola fila: el corte de los datos y de dónde salen.
CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_meta (
  id              TINYINT UNSIGNED NOT NULL,
  corte           VARCHAR(10)  NOT NULL,
  periodo_actual  VARCHAR(10)  NOT NULL,
  fuente          VARCHAR(400) NOT NULL,
  generado        VARCHAR(10)  NOT NULL,
  beneficios      INT UNSIGNED NOT NULL,
  filas_origen    INT UNSIGNED NOT NULL,
  excluidos       VARCHAR(400) NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT ck_fondos_2026_meta_unica CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Los programas (fondos y becas), con su línea: Pregrado, Posgrado o Movilidad internacional.
CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_programas (
  indice  SMALLINT UNSIGNED NOT NULL,
  clave   VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  nombre  VARCHAR(120) NOT NULL,
  corto   VARCHAR(60)  NOT NULL,
  linea   VARCHAR(60)  NOT NULL,
  PRIMARY KEY (indice),
  UNIQUE KEY uq_fondos_2026_programas_clave (clave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Las demás clasificaciones: convocatoria, periodo, estado, sexo, comuna, ies y pais.
CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_categorias (
  dimension  VARCHAR(20)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  indice     SMALLINT UNSIGNED NOT NULL,
  nombre     VARCHAR(200) NOT NULL,
  PRIMARY KEY (dimension, indice)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Beneficios por programa, convocatoria, periodo renovado y estado del periodo.
CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_estados (
  programa      SMALLINT UNSIGNED NOT NULL,
  convocatoria  SMALLINT UNSIGNED NOT NULL,
  periodo       SMALLINT UNSIGNED NOT NULL,
  estado        SMALLINT UNSIGNED NOT NULL,
  beneficios    INT UNSIGNED NOT NULL,
  PRIMARY KEY (programa, convocatoria, periodo, estado),
  CONSTRAINT fk_fondos_2026_estados_programa FOREIGN KEY (programa) REFERENCES sivu_tablero_fondos_2026_programas (indice)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Monto girado por programa y periodo (pesos). Matrícula y sostenimiento solo en Línea Pregrado.
CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_giros (
  programa       SMALLINT UNSIGNED NOT NULL,
  periodo        SMALLINT UNSIGNED NOT NULL,
  monto          BIGINT UNSIGNED NOT NULL,
  matricula      BIGINT UNSIGNED NULL,
  sostenimiento  BIGINT UNSIGNED NULL,
  con_giro       INT UNSIGNED NOT NULL,
  PRIMARY KEY (programa, periodo),
  CONSTRAINT fk_fondos_2026_giros_programa FOREIGN KEY (programa) REFERENCES sivu_tablero_fondos_2026_programas (indice)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Beneficios de cada convocatoria por su estado en el último periodo registrado.
CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_cohortes (
  programa      SMALLINT UNSIGNED NOT NULL,
  convocatoria  SMALLINT UNSIGNED NOT NULL,
  estado        SMALLINT UNSIGNED NOT NULL,
  beneficios    INT UNSIGNED NOT NULL,
  PRIMARY KEY (programa, convocatoria, estado),
  CONSTRAINT fk_fondos_2026_cohortes_programa FOREIGN KEY (programa) REFERENCES sivu_tablero_fondos_2026_programas (indice)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Beneficios ACTIVOS por programa y periodo, según una sola característica a la
-- vez (tipo: sexo, comuna o ies; categoria es la posición en esa dimensión).
CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_activos (
  tipo        VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  programa    SMALLINT UNSIGNED NOT NULL,
  periodo     SMALLINT UNSIGNED NOT NULL,
  categoria   SMALLINT UNSIGNED NOT NULL,
  beneficios  INT UNSIGNED NOT NULL,
  PRIMARY KEY (tipo, programa, periodo, categoria),
  KEY ix_fondos_2026_activos_programa (programa),
  CONSTRAINT fk_fondos_2026_activos_programa FOREIGN KEY (programa) REFERENCES sivu_tablero_fondos_2026_programas (indice),
  CONSTRAINT ck_fondos_2026_activos_tipo CHECK (tipo IN ('sexo', 'comuna', 'ies'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Enlaza Mundos: beneficios por convocatoria y país de destino.
CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_destinos (
  convocatoria  SMALLINT UNSIGNED NOT NULL,
  pais          SMALLINT UNSIGNED NOT NULL,
  beneficios    INT UNSIGNED NOT NULL,
  PRIMARY KEY (convocatoria, pais)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
