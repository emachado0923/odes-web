-- =============================================================================
-- Migración 2 (Postgres): datos de los tableros de SIVU, empezando por
-- "Matrícula en educación superior en Medellín (2025)". La misma de
-- db/repositorio/migraciones/002-tablero-matricula.sql (MySQL), traducida.
-- Se aplica dentro de la transacción de `npm run repositorio:migrar`.
-- Nombres: sivu_tableros es el catálogo; las tablas de este tablero son
-- sivu_tablero_matricula_2025_<tabla> (ver la versión MySQL).
-- =============================================================================

CREATE TABLE IF NOT EXISTS sivu_tableros (
  id              varchar(60)  NOT NULL,
  titulo          varchar(200) NOT NULL,
  definiciones    text         NOT NULL,
  actualizado_en  timestamptz(3) NOT NULL DEFAULT now(),
  CONSTRAINT tableros_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS sivu_tablero_matricula_2025_meta (
  id          smallint     NOT NULL,
  municipio   varchar(80)  NOT NULL,
  anio        smallint     NOT NULL,
  referencia  varchar(20)  NOT NULL,
  fuente      varchar(300) NOT NULL,
  generado    varchar(20)  NOT NULL,
  CONSTRAINT matricula_meta_pkey PRIMARY KEY (id),
  CONSTRAINT ck_matricula_meta_unica CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS sivu_tablero_matricula_2025_categorias (
  dimension  varchar(30)  NOT NULL,
  indice     smallint     NOT NULL,
  nombre     varchar(200) NOT NULL,
  padre      smallint     NULL,
  CONSTRAINT matricula_categorias_pkey PRIMARY KEY (dimension, indice)
);

CREATE TABLE IF NOT EXISTS sivu_tablero_matricula_2025_ies (
  indice      smallint     NOT NULL,
  nombre      varchar(200) NOT NULL,
  corto       varchar(80)  NOT NULL,
  sector      varchar(40)  NOT NULL,
  caracter    varchar(80)  NOT NULL,
  acreditada  smallint     NOT NULL,
  codigos     varchar(200) NOT NULL,
  CONSTRAINT matricula_ies_pkey PRIMARY KEY (indice),
  CONSTRAINT ck_matricula_ies_acreditada CHECK (acreditada IN (0, 1))
);

CREATE TABLE IF NOT EXISTS sivu_tablero_matricula_2025_programas (
  indice           smallint     NOT NULL,
  codigo           varchar(20)  NOT NULL,
  nombre           varchar(300) NOT NULL,
  ies              smallint     NOT NULL,
  nivel_formacion  smallint     NOT NULL,
  modalidad        smallint     NOT NULL,
  nbc              smallint     NOT NULL,
  cine             smallint     NOT NULL,
  acreditado       smallint     NOT NULL,
  CONSTRAINT matricula_programas_pkey PRIMARY KEY (indice),
  CONSTRAINT fk_matricula_programas_ies FOREIGN KEY (ies) REFERENCES sivu_tablero_matricula_2025_ies (indice),
  CONSTRAINT ck_matricula_programas_acreditado CHECK (acreditado IN (0, 1))
);
CREATE INDEX IF NOT EXISTS ix_matricula_programas_ies ON sivu_tablero_matricula_2025_programas (ies);

CREATE TABLE IF NOT EXISTS sivu_tablero_matricula_2025_filas (
  n             integer  NOT NULL,
  programa      smallint NOT NULL,
  sexo          smallint NOT NULL,
  periodo       smallint NOT NULL,
  matriculados  integer  NOT NULL,
  CONSTRAINT matricula_filas_pkey PRIMARY KEY (n),
  CONSTRAINT fk_matricula_filas_programa FOREIGN KEY (programa) REFERENCES sivu_tablero_matricula_2025_programas (indice)
);
CREATE INDEX IF NOT EXISTS ix_matricula_filas_programa ON sivu_tablero_matricula_2025_filas (programa);

-- Cerrado a la API pública de Supabase, como el resto del esquema.
ALTER TABLE sivu_tableros ENABLE ROW LEVEL SECURITY;
ALTER TABLE sivu_tablero_matricula_2025_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE sivu_tablero_matricula_2025_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE sivu_tablero_matricula_2025_ies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sivu_tablero_matricula_2025_programas ENABLE ROW LEVEL SECURITY;
ALTER TABLE sivu_tablero_matricula_2025_filas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON sivu_tableros, sivu_tablero_matricula_2025_meta, sivu_tablero_matricula_2025_categorias, sivu_tablero_matricula_2025_ies,
      sivu_tablero_matricula_2025_programas, sivu_tablero_matricula_2025_filas FROM anon, authenticated;
  END IF;
END
$$;
