-- =============================================================================
-- Migración 2: datos de los tableros de SIVU, empezando por "Matrícula en
-- educación superior en Medellín (2025)" (/tableros/matricula-2025).
--
-- Son los mismos datos que el tablero estático traía en datos/matricula.js y
-- datos/definiciones.js (SNIES, Ministerio de Educación Nacional). Los carga
-- `npm run tableros:cargar-matricula`, que reemplaza todo el contenido; nadie
-- los edita a mano. GET /api/sivu/tableros/matricula-2025 los entrega con la
-- misma forma que tenía datos/matricula.js.
--
-- Cada dimensión conserva su posición (indice): las filas y los programas se
-- refieren a las demás por esa posición, como en el archivo original.
--
-- Nombres: sivu_tableros es el catálogo de todos los tableros; las tablas de
-- este llevan su id (matricula-2025): sivu_tablero_matricula_2025_<tabla>. Un
-- tablero nuevo crea las suyas en otra migración con el mismo patrón y con
-- índices y restricciones que también lleven su nombre.
-- =============================================================================

-- Un registro por tablero: su título y los textos de la ventana de bienvenida
-- y de las descargas (JSON, tal como venían en definiciones.js).
CREATE TABLE IF NOT EXISTS sivu_tableros (
  id              VARCHAR(60)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  titulo          VARCHAR(200) NOT NULL,
  definiciones    MEDIUMTEXT   NOT NULL,
  actualizado_en  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Una sola fila: de dónde salen los datos de matrícula.
CREATE TABLE IF NOT EXISTS sivu_tablero_matricula_2025_meta (
  id          TINYINT UNSIGNED NOT NULL,
  municipio   VARCHAR(80)  NOT NULL,
  anio        SMALLINT UNSIGNED NOT NULL,
  referencia  VARCHAR(20)  NOT NULL,
  fuente      VARCHAR(300) NOT NULL,
  generado    VARCHAR(20)  NOT NULL,
  PRIMARY KEY (id),
  CONSTRAINT ck_matricula_meta_unica CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Las clasificaciones: nivelAcad, nivelForm, modalidad, area, nbc, cineAmplio,
-- cineEspecifico, cineDetallado, sexo y periodo. `padre` es la posición en la
-- clasificación de arriba (nivelForm -> nivelAcad, nbc -> area,
-- cineEspecifico -> cineAmplio, cineDetallado -> cineEspecifico).
CREATE TABLE IF NOT EXISTS sivu_tablero_matricula_2025_categorias (
  dimension  VARCHAR(30)  CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  indice     SMALLINT UNSIGNED NOT NULL,
  nombre     VARCHAR(200) NOT NULL,
  padre      SMALLINT UNSIGNED NULL,
  PRIMARY KEY (dimension, indice)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Instituciones de educación superior. `codigos`: códigos SNIES separados por comas.
CREATE TABLE IF NOT EXISTS sivu_tablero_matricula_2025_ies (
  indice      SMALLINT UNSIGNED NOT NULL,
  nombre      VARCHAR(200) NOT NULL,
  corto       VARCHAR(80)  NOT NULL,
  sector      VARCHAR(40)  NOT NULL,
  caracter    VARCHAR(80)  NOT NULL,
  acreditada  TINYINT(1)   NOT NULL,
  codigos     VARCHAR(200) NOT NULL,
  PRIMARY KEY (indice),
  CONSTRAINT ck_matricula_ies_acreditada CHECK (acreditada IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Programas académicos. `cine` es la posición en cineDetallado.
CREATE TABLE IF NOT EXISTS sivu_tablero_matricula_2025_programas (
  indice           SMALLINT UNSIGNED NOT NULL,
  codigo           VARCHAR(20)  NOT NULL,
  nombre           VARCHAR(300) NOT NULL,
  ies              SMALLINT UNSIGNED NOT NULL,
  nivel_formacion  SMALLINT UNSIGNED NOT NULL,
  modalidad        SMALLINT UNSIGNED NOT NULL,
  nbc              SMALLINT UNSIGNED NOT NULL,
  cine             SMALLINT UNSIGNED NOT NULL,
  acreditado       TINYINT(1)   NOT NULL,
  PRIMARY KEY (indice),
  KEY ix_matricula_programas_ies (ies),
  CONSTRAINT fk_matricula_programas_ies FOREIGN KEY (ies) REFERENCES sivu_tablero_matricula_2025_ies (indice),
  CONSTRAINT ck_matricula_programas_acreditado CHECK (acreditado IN (0, 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Matriculados por programa, sexo y periodo. `n` conserva el orden del archivo.
CREATE TABLE IF NOT EXISTS sivu_tablero_matricula_2025_filas (
  n             INT UNSIGNED NOT NULL,
  programa      SMALLINT UNSIGNED NOT NULL,
  sexo          SMALLINT UNSIGNED NOT NULL,
  periodo       SMALLINT UNSIGNED NOT NULL,
  matriculados  INT UNSIGNED NOT NULL,
  PRIMARY KEY (n),
  KEY ix_matricula_filas_programa (programa),
  CONSTRAINT fk_matricula_filas_programa FOREIGN KEY (programa) REFERENCES sivu_tablero_matricula_2025_programas (indice)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
