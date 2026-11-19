-- =============================================================================
-- Repositorio de Productos del Observatorio: base de datos y usuario de la
-- aplicación (PLANTILLA). Compatible con MySQL 8.0.18 (Cloud SQL) y 8.x/9.x.
--
-- Lo ejecuta UNA VEZ una persona de TI (o el responsable de la instancia) con
-- una cuenta administradora de Cloud SQL, por ejemplo desde TablePlus. Nunca
-- se guardan aquí contraseñas reales: reemplace CAMBIAR_CONTRASENA por una
-- contraseña larga y aleatoria (20+ caracteres) solo en el momento de
-- ejecutarlo, y anótela en el gestor de contraseñas de la entidad.
--
-- Orden completo de la instalación:
--   1. Este archivo (base + usuario de la aplicación), con la cuenta admin.
--   2. esquema.sql dentro de la base, con la cuenta admin:
--        - TablePlus: abrir la base repositoriobd, pegar esquema.sql y
--          ejecutar todo (Cmd+Shift+Enter), o
--        - desde la VM: `npm run repositorio:migrar -- --usuario <admin>`
--          (pide la contraseña sin mostrarla).
--   3. En apps/server/.env, las variables REPOSITORIO_MYSQL_* con el usuario
--      de la aplicación (ver .env.example). Si la contraseña empieza por #,
--      escríbala entre comillas SIMPLES: REPOSITORIO_MYSQL_PASSWORD='#...'
--      (sin comillas, el lector de .env la toma como comentario).
--   4. `npm run repositorio:crear-admin -- --usuario <usuario> --nombre "..."`
--   5. `npm run repositorio:importar -- --paquete <carpeta repositorio-datos>
--      --miniaturas apps/web/public/odes/portadas` (carga inicial).
--
-- Cloud SQL: cree el usuario con SQL (como abajo) y NO desde la consola o
-- gcloud, porque los usuarios creados allí reciben el rol cloudsqlsuperuser,
-- con muchos más permisos de los que necesita la aplicación. Agregue la IP
-- pública de la VM en Conexiones > Redes autorizadas.
-- =============================================================================

CREATE DATABASE IF NOT EXISTS repositoriobd
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

-- '%' = desde cualquier IP autorizada en Cloud SQL. Si la VM tiene IP fija,
-- es mejor restringirlo: 'repositorio_app'@'203.0.113.10'.
CREATE USER IF NOT EXISTS 'repositorio_app'@'%'
  IDENTIFIED BY 'CAMBIAR_CONTRASENA';

-- Solo lectura y escritura de filas en esta base: sin CREATE, ALTER, DROP,
-- INDEX, REFERENCES ni permisos sobre otras bases. (UPDATE también habilita
-- SELECT ... FOR SHARE, que la aplicación usa al reutilizar archivos.)
GRANT SELECT, INSERT, UPDATE, DELETE ON repositoriobd.* TO 'repositorio_app'@'%';

-- Opcional (recomendado con IP pública): exigir conexión cifrada para este
-- usuario. Requiere REPOSITORIO_MYSQL_SSL_CA en el .env de la aplicación.
-- ALTER USER 'repositorio_app'@'%' REQUIRE SSL;

-- Comprobación:
--   SHOW GRANTS FOR 'repositorio_app'@'%';
-- Debe mostrar USAGE ON *.* y SELECT, INSERT, UPDATE, DELETE ON `repositoriobd`.*

-- Cambiar la contraseña más adelante:
--   ALTER USER 'repositorio_app'@'%' IDENTIFIED BY 'NUEVA_CONTRASENA';
