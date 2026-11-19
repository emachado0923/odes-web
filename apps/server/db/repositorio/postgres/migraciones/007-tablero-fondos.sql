-- =============================================================================
-- Migración 7 (Postgres): tablero "Beneficiarios de los fondos de Sapiencia
-- (2026)". La misma de db/repositorio/migraciones/007-tablero-fondos.sql
-- (MySQL), traducida: ver allí qué guarda cada tabla. Se aplica dentro de la
-- transacción de `npm run repositorio:migrar`.
-- =============================================================================

CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_meta (
  id              smallint     NOT NULL,
  corte           varchar(10)  NOT NULL,
  periodo_actual  varchar(10)  NOT NULL,
  fuente          varchar(400) NOT NULL,
  generado        varchar(10)  NOT NULL,
  beneficios      integer      NOT NULL,
  filas_origen    integer      NOT NULL,
  excluidos       varchar(400) NOT NULL,
  CONSTRAINT fondos_2026_meta_pkey PRIMARY KEY (id),
  CONSTRAINT ck_fondos_2026_meta_unica CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_programas (
  indice  smallint     NOT NULL,
  clave   varchar(20)  NOT NULL,
  nombre  varchar(120) NOT NULL,
  corto   varchar(60)  NOT NULL,
  linea   varchar(60)  NOT NULL,
  CONSTRAINT fondos_2026_programas_pkey PRIMARY KEY (indice),
  CONSTRAINT uq_fondos_2026_programas_clave UNIQUE (clave)
);

CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_categorias (
  dimension  varchar(20)  NOT NULL,
  indice     smallint     NOT NULL,
  nombre     varchar(200) NOT NULL,
  CONSTRAINT fondos_2026_categorias_pkey PRIMARY KEY (dimension, indice)
);

CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_estados (
  programa      smallint NOT NULL,
  convocatoria  smallint NOT NULL,
  periodo       smallint NOT NULL,
  estado        smallint NOT NULL,
  beneficios    integer  NOT NULL,
  CONSTRAINT fondos_2026_estados_pkey PRIMARY KEY (programa, convocatoria, periodo, estado),
  CONSTRAINT fk_fondos_2026_estados_programa FOREIGN KEY (programa) REFERENCES sivu_tablero_fondos_2026_programas (indice)
);

CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_giros (
  programa       smallint NOT NULL,
  periodo        smallint NOT NULL,
  monto          bigint   NOT NULL,
  matricula      bigint   NULL,
  sostenimiento  bigint   NULL,
  con_giro       integer  NOT NULL,
  CONSTRAINT fondos_2026_giros_pkey PRIMARY KEY (programa, periodo),
  CONSTRAINT fk_fondos_2026_giros_programa FOREIGN KEY (programa) REFERENCES sivu_tablero_fondos_2026_programas (indice)
);

CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_cohortes (
  programa      smallint NOT NULL,
  convocatoria  smallint NOT NULL,
  estado        smallint NOT NULL,
  beneficios    integer  NOT NULL,
  CONSTRAINT fondos_2026_cohortes_pkey PRIMARY KEY (programa, convocatoria, estado),
  CONSTRAINT fk_fondos_2026_cohortes_programa FOREIGN KEY (programa) REFERENCES sivu_tablero_fondos_2026_programas (indice)
);

CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_activos (
  tipo        varchar(10) NOT NULL,
  programa    smallint    NOT NULL,
  periodo     smallint    NOT NULL,
  categoria   smallint    NOT NULL,
  beneficios  integer     NOT NULL,
  CONSTRAINT fondos_2026_activos_pkey PRIMARY KEY (tipo, programa, periodo, categoria),
  CONSTRAINT fk_fondos_2026_activos_programa FOREIGN KEY (programa) REFERENCES sivu_tablero_fondos_2026_programas (indice),
  CONSTRAINT ck_fondos_2026_activos_tipo CHECK (tipo IN ('sexo', 'comuna', 'ies'))
);
CREATE INDEX IF NOT EXISTS ix_fondos_2026_activos_programa ON sivu_tablero_fondos_2026_activos (programa);

CREATE TABLE IF NOT EXISTS sivu_tablero_fondos_2026_destinos (
  convocatoria  smallint NOT NULL,
  pais          smallint NOT NULL,
  beneficios    integer  NOT NULL,
  CONSTRAINT fondos_2026_destinos_pkey PRIMARY KEY (convocatoria, pais)
);

-- Cerrado a la API pública de Supabase, como el resto del esquema.
ALTER TABLE sivu_tablero_fondos_2026_meta ENABLE ROW LEVEL SECURITY;
ALTER TABLE sivu_tablero_fondos_2026_programas ENABLE ROW LEVEL SECURITY;
ALTER TABLE sivu_tablero_fondos_2026_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE sivu_tablero_fondos_2026_estados ENABLE ROW LEVEL SECURITY;
ALTER TABLE sivu_tablero_fondos_2026_giros ENABLE ROW LEVEL SECURITY;
ALTER TABLE sivu_tablero_fondos_2026_cohortes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sivu_tablero_fondos_2026_activos ENABLE ROW LEVEL SECURITY;
ALTER TABLE sivu_tablero_fondos_2026_destinos ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON sivu_tablero_fondos_2026_meta, sivu_tablero_fondos_2026_programas, sivu_tablero_fondos_2026_categorias,
      sivu_tablero_fondos_2026_estados, sivu_tablero_fondos_2026_giros, sivu_tablero_fondos_2026_cohortes,
      sivu_tablero_fondos_2026_activos, sivu_tablero_fondos_2026_destinos FROM anon, authenticated;
  END IF;
END
$$;
