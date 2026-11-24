# Base de datos del Repositorio de Productos (rama `/repositorio`)

MySQL es la fuente de verdad del repositorio: los datos de cada producto y
también sus archivos (documento, portada JPEG 720 × 720 y miniatura WebP
192 × 192), guardados en binario y partidos en trozos de 1 MB. Funciona con
MySQL 8.0.18 (la instancia de Cloud SQL de la entidad) y con 8.4 / 9.x.
La misma base guarda también los tableros de `/tableros` (migración 002) y el
Plan de Acción Institucional de `/pai` (migración 003).

| Archivo        | Qué es |
| -------------- | ------ |
| `permisos.sql` | Plantilla: crea la base `repositoriobd` y el usuario de la aplicación `repositorio_app` con solo SELECT, INSERT, UPDATE y DELETE. |
| `esquema.sql`  | Las tablas (versión 1). Idempotente: se puede ejecutar varias veces. |
| `migraciones/` | Cambios posteriores, `NNN-nombre.sql`; `repositorio:migrar` aplica los que no estén registrados en `sistema_esquema_version` (aunque haya uno posterior registrado a mano): `002-tablero-matricula.sql` (tableros de SIVU), `003-pai.sql` (Plan de Acción Institucional, 16 tablas `pai_*`) y `004-nombres-por-modulo.sql` (cada tabla con el prefijo de su módulo; ver [Paso a la versión 4](#paso-a-la-versión-4-nombres-por-módulo)). El servidor exige la versión 4. |
| `postgres/` | Lo mismo para Postgres (Supabase): `esquema.sql` y `migraciones/` con los mismos números. |

## Instalación en Cloud SQL (una sola vez)

Lo hace TI o el responsable de la instancia, con su cuenta administradora (por
ejemplo en TablePlus). Nadie más necesita esa cuenta.

1. **Base y usuario.** Abrir `permisos.sql`, reemplazar `CAMBIAR_CONTRASENA`
   por una contraseña larga y aleatoria (20 caracteres o más) y ejecutarlo.
   Crear el usuario con SQL y no desde la consola de Google: los usuarios de
   la consola reciben el rol `cloudsqlsuperuser`.
2. **Tablas (esquema versión 5).** Recomendado, desde la VM ya configurada
   (paso 4):
   `cd /opt/sapiencia-web/apps/server && sudo -u sapiencia node dist/repositorio/cli/migrar.js --usuario <cuenta_admin>`
   (pide la contraseña sin mostrarla; aplica `esquema.sql` y las migraciones
   que falten). O en TablePlus, en la base `repositoriobd`, ejecutar
   completos y en orden `esquema.sql`, `migraciones/002-tablero-matricula.sql`
   y `migraciones/003-pai.sql` (todos idempotentes) y registrar las versiones:
   `INSERT IGNORE INTO sistema_esquema_version (version, descripcion) VALUES (2, 'tablero-matricula'), (3, 'pai'), (4, 'nombres-por-modulo');`.
   Comprobación: `SELECT version FROM sistema_esquema_version;` debe dar 1, 2, 3 y 4. Con
   solo `esquema.sql` (versión 1) el servidor responde 503 en toda la API de
   la base.
3. **Red y TLS.** Agregar la IP pública de la VM en *Conexiones > Redes
   autorizadas* y descargar el certificado de la CA del servidor
   (`server-ca.pem`, en *Conexiones > Seguridad*). Opcional:
   `ALTER USER 'repositorio_app'@'%' REQUIRE SSL;`.
4. **Variables.** En `apps/server/.env` (ver `.env.example`, sección
   "Repositorio de Productos"):

   ```
   REPOSITORIO_MYSQL_HOST=<IP pública de Cloud SQL>
   REPOSITORIO_MYSQL_USER=repositorio_app
   REPOSITORIO_MYSQL_PASSWORD='<contraseña del paso 1>'
   REPOSITORIO_MYSQL_DATABASE=repositoriobd
   REPOSITORIO_MYSQL_SSL_CA=/etc/sapiencia/cloudsql-server-ca.pem
   ```

   Si la contraseña empieza por `#`, debe ir entre comillas simples.
5. **Administradores.** En la VM:
   `cd /opt/sapiencia-web/apps/server && sudo -u sapiencia node dist/repositorio/cli/crear-admin.js --usuario <usuario> --nombre "Nombre Apellido"`
   (pide la contraseña dos veces sin mostrarla; mínimo 12 caracteres).
   Repetirlo con un usuario existente le cambia la contraseña y cierra sus
   sesiones; `--desactivar` le quita el acceso. En desarrollo:
   `npm run repositorio:crear-admin -- --usuario <usuario> --nombre "…"`.
6. **Carga inicial.** Copie el paquete a una carpeta que `sapiencia` pueda
   leer (por ejemplo `/srv/repositorio-datos` y
   `sudo chmod -R a+rX /srv/repositorio-datos`: en Ubuntu las carpetas
   personales son privadas) y, desde la raíz del proyecto en la VM:
   `cd /opt/sapiencia-web && sudo -u sapiencia node apps/server/dist/repositorio/cli/importar.js --paquete /srv/repositorio-datos --miniaturas apps/web/public/odes/portadas`
   (en desarrollo: `npm run repositorio:importar -- --paquete <ruta> --miniaturas apps/web/public/odes/portadas`).
   Tarda unos segundos en una red local (482 MB); por internet, lo que tarde
   en subir eso. Si se corta, se vuelve a ejecutar y sigue donde iba. Al final
   muestra los conteos: 372 publicados; Boletín 43, Estudio 62, Infografía 89,
   Informe dinámico 54, Nota temática 48, Informe de tendencias 8, Educación
   superior en cifras 66, Otros productos 2; español 290, inglés 82;
   64 tableros; 5 con entrada de blog; 6 con nota.
7. Reiniciar el servidor (`systemctl restart sapiencia-web`). Desde ese
   momento todo se maneja en `/repositorio/admin`, sin tocar código.

Volver a correr la importación después de que la administración empezó a
trabajar no deshace su trabajo: se salta (y avisa) los documentos borrados
en la administración (su último registro en `repositorio_cambios` es `borrar`;
`--restaurar-borrados` los crea de nuevo) y los editados allí
(`actualizado_por` distinto del importador; `--forzar` los sobrescribe con
el paquete). Un documento nuevo abre su posición «Más recientes» y uno
existente conserva la suya.

Las CLI de `npm run repositorio:*` (también desde la raíz del proyecto) son
para desarrollo: compilan el servidor (`nest build`, que borra y rehace
`dist/`) y luego corren desde `dist/`; las rutas de las opciones se
resuelven contra la carpeta desde la que se llamó npm. En la copia que
sirve el sitio, ejecute directamente
`sudo -u sapiencia node dist/repositorio/cli/<migrar|importar|crear-admin>.js`
desde `apps/server`: `.env` tiene permisos `600` y solo lo lee el usuario
del servicio. Guía completa (administración, copias de seguridad,
seguridad): sección "Repositorio de Productos" del README principal.

## Tablas

Cada tabla lleva el prefijo de su módulo, para que su nombre diga de qué es
y no se repitan nombres genéricos (`archivos`, `sesiones`...) entre módulos:

| Prefijo | Módulo |
| ------- | ------ |
| `repositorio_` | Repositorio de Productos (`/repositorio`, `/odes`), con su almacén de archivos (`repositorio_almacen_*`). |
| `sivu_` | Tableros de SIVU (`/tableros`): `sivu_tableros` es el catálogo (una fila por tablero) y cada tablero tiene sus propias tablas, `sivu_tablero_<tablero>_<tabla>`, donde `<tablero>` es su id con `_` en vez de `-` (`matricula-2025` → `sivu_tablero_matricula_2025_ies`). |
| `pai_` | Plan de Acción Institucional (`/pai`), con su propio almacén de archivos (`pai_almacen_*`). |
| `sistema_` | Control del esquema. |

Una tabla nueva lleva el prefijo de su módulo (o uno nuevo, agregado a esta
lista). Los índices y las restricciones conservan los nombres de antes de la
versión 4 (`uq_archivos_sha256`, `documentos_pkey`, `fk_documentos_categoria`...):
el código reconoce algunos por su nombre.

Cada módulo que guarda archivos tiene su propio almacén:
`<módulo>_almacen_archivos` (una ficha por contenido: sha256, tipo, tamaño) y
`<módulo>_almacen_archivo_trozos` (el contenido en trozos de 1 MB). Los
almacenes no comparten fichas: el mismo PDF subido como documento y como
evidencia queda una vez en cada uno, y retirar uno nunca toca el otro. Un
módulo nuevo con archivos crea el suyo con las mismas columnas (restricciones
con su nombre) y declara sus tablas y sus usos en un `TablasAlmacen`
(`src/repositorio/archivos/almacen-archivos.ts`). Una prueba comprueba que
ninguna llave foránea cruza de un módulo a otro.

Un tablero nuevo de SIVU crea sus tablas en su propia migración, con el nombre
`sivu_tablero_<tablero>_<tabla>`, y su fila en `sivu_tableros`. Sus índices y
restricciones también llevan el nombre del tablero (`matricula_2026_ies_pkey`,
`fk_matricula_2026_programas_ies`...), porque Postgres no deja repetir nombres
de índice ni de llave primaria en el esquema, y MySQL tampoco los de llaves
foráneas y `CHECK` en la base. Los del tablero de matrícula 2025 conservan sus
nombres (`matricula_ies_pkey`, `fk_matricula_programas_ies`...). El nombre de
una tabla no puede pasar de 63 caracteres, el límite de Postgres; una prueba
lo comprueba.

| Tabla | Contenido |
| ----- | --------- |
| `repositorio_documentos` | Un producto: textos (título, subtítulo y, desde la migración 006, `descripcion`), categoría, número, año/mes, idioma, tipo, URL externa y de blog, nota, descarga, posición "Más recientes" (`orden`), `publicado`, notas internas (la curaduría del paquete), referencias a `repositorio_almacen_archivos` (archivo, portada, miniatura) y la referencia histórica de la carga inicial (`url_original`...). |
| `repositorio_categorias` | Nombre único (sin distinguir tildes ni mayúsculas) y orden. |
| `repositorio_palabras_clave` / `repositorio_documento_palabras_clave` | Palabras únicas por su forma normalizada; máximo 6 por documento (exactamente 6 para publicarlo), en orden. |
| `repositorio_almacen_archivos` / `repositorio_almacen_archivo_trozos` | Almacén del repositorio: un archivo por contenido (sha256 único, sin duplicados) y sus trozos de 1 MB (`MEDIUMBLOB`). Con Supabase el contenido está en el bucket público y no hay trozos. Se borran cuando ningún documento los usa. |
| `repositorio_administradores` / `repositorio_sesiones` | Usuarios de la administración (scrypt con sal propia) y sesiones (solo el sha256 del token; vencen por inactividad y por duración máxima). |
| `repositorio_intentos_acceso` | Límite de intentos: 5 fallos de un usuario o 20 de una IP (una IPv6 cuenta por su `/64`) en 15 minutos bloquean 15 minutos. `exito`: 0 fallo, 1 correcto, 2 en curso (cada intento se reserva antes de verificar la contraseña, para que las peticiones simultáneas se cuenten). Un usuario que no es ASCII se guarda como `#` + su sha256. Se purga sola. |
| `repositorio_cambios` | Registro de quién hizo qué y cuándo (se conserva aunque se borre el documento). |
| `repositorio_estado` / `sistema_esquema_version` | Contador de cambios del contenido (invalida la caché del listado en todos los procesos) y versión del esquema. |
| `sivu_tableros` (migración 002) | Catálogo de los tableros de `/tableros`: id, título y textos de la bienvenida y de las descargas (JSON). |
| `repositorio_subidas` / `repositorio_subida_partes` (migración 005) | Subidas por partes de la administración, cuando los archivos van en la base: dueño, tamaño total y fecha, y las partes de 4 MiB hasta que el servidor arma el archivo (ver "Subidas por partes" abajo). Vencen a las 2 horas. |
| `sivu_tablero_matricula_2025_*` (migración 002) | Tablero de matrícula 2025: origen de los datos (`_meta`), clasificaciones (`_categorias`), instituciones (`_ies`), programas (`_programas`) y matriculados (`_filas`). |
| `sivu_tablero_fondos_2026_*` (migración 007) | Tablero de los fondos de Sapiencia 2026, solo cifras agregadas: corte y fuente (`_meta`), programas (`_programas`), clasificaciones (`_categorias`), beneficios por programa, convocatoria, periodo y estado (`_estados`), giros por programa y periodo (`_giros`), estado actual por convocatoria (`_cohortes`), activos por sexo, comuna o institución, cada uno aparte (`_activos`) y destinos de Enlaza Mundos (`_destinos`). |

### Plan de Acción Institucional (`/pai`, migración 003)

| Tabla | Contenido |
| ----- | --------- |
| `pai_usuarios` / `pai_sesiones` / `pai_intentos_acceso` | Usuarios del PAI (rol `responsable` o `administrador`, contraseña temporal, activo) y sus sesiones e intentos, con el mismo comportamiento que `repositorio_administradores`/`repositorio_sesiones`/`repositorio_intentos_acceso`. |
| `pai_vigencias` | Un año del PAI: bimestre abierto (1-6 o NULL = cerrado), fecha límite opcional y quién lo cambió. |
| `pai_dependencias` / `pai_procesos` / `pai_riesgos` / `pai_acciones` / `pai_accion_riesgos` | Estructura de las fichas F-ES-DE-003 de la vigencia: dependencias, procesos o proyectos (con línea del Plan de Desarrollo, dimensión, programa, objetivo), su catálogo de riesgos y sus acciones con los riesgos que cubren. |
| `pai_indicadores` | Indicador de una acción (código único en la vigencia, p. ej. SAF-TH-02): metas por bimestre y total `DECIMAL(24,10)`, reglas de los totales y del tope de 100 %, productos y responsables. |
| `pai_reportes` | Uno por (indicador, bimestre): avance, logros, observaciones, riesgo materializado, fuentes de verificación, origen (`importado` del Excel o `aplicativo`) y `actualizado_en`, que es el token de concurrencia. |
| `pai_almacen_archivos` / `pai_almacen_archivo_trozos` | Almacén del PAI, aparte del del repositorio y con las mismas columnas: una ficha por contenido (sha256 único) para las evidencias y sus trozos. Con Supabase el contenido está en el bucket privado del PAI y la ficha no tiene trozos. `npm run pai:recolectar-evidencias` borra las fichas que ninguna evidencia usa. |
| `pai_evidencias` | Archivos de un reporte: referencia a `pai_almacen_archivos` (contenido sin duplicar) y, con Supabase, la ruta del objeto en el bucket privado. Se borran con su reporte. |
| `pai_subidas` / `pai_subida_partes` | Subidas pendientes de evidencias: directas a Supabase Storage (`subidas/<uuid>`) o por partes a la base (`partes/<uuid>`, con `bytes` y sus partes en `pai_subida_partes`, migración 005), ligadas al usuario, al indicador y al bimestre. A lo sumo 5 por usuario; vencen a las 2 horas. |
| `pai_asignaciones` / `pai_autorizaciones` | Qué procesos o indicadores reporta cada responsable (exactamente uno de los dos por fila) y los permisos temporales para reportar otro bimestre (vigente hasta, revocada). |
| `pai_registro` | Auditoría del PAI (ingresos, reportes con valores anteriores y nuevos, evidencias, cuentas, asignaciones, bimestres, autorizaciones, cargas); se conserva aunque se borren las cuentas o los indicadores. |

En Postgres las 19 tablas tienen RLS sin políticas y sin permisos para `anon`
y `authenticated` (como las demás), y `actualizado_en` lo mantiene el trigger
`repositorio_tocar_actualizado()`. Las cargas se hacen con
`npm run pai:cargar-fichas` (ver la sección PAI del README).

## Subidas por partes (versión 5)

En Vercel una petición no puede llevar más de 4,5 MB. Cuando los archivos van
dentro de la base (sin Supabase Storage), la administración del repositorio y
las evidencias del PAI suben un archivo de más de 4 MiB en partes: la
migración 005 crea `repositorio_subidas`, `repositorio_subida_partes` y
`pai_subida_partes`, y agrega `pai_subidas.bytes`. El servidor arma el
archivo cuando llegan todas las partes, lo valida como cualquier otro y borra
la subida (sus partes se van en cascada). El detalle está en
`src/repositorio/archivos/subidas-por-partes.ts`.

**Permisos tabla por tabla.** Si la cuenta de la aplicación tiene permisos por
tabla y no sobre toda la base (así está `sapiencia_web` en `planeacionbd`,
para no ver las tablas de la encuesta), cada tabla nueva necesita su permiso.
Para la 005:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON planeacionbd.repositorio_subidas TO 'sapiencia_web'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON planeacionbd.repositorio_subida_partes TO 'sapiencia_web'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON planeacionbd.pai_subida_partes TO 'sapiencia_web'@'%';
```

A mano: pegue `migraciones/005-subidas-por-partes.sql` (o la de
`postgres/migraciones/`) y registre la versión 5
(`INSERT IGNORE INTO sistema_esquema_version (version, descripcion) VALUES (5, 'subidas-por-partes');`).
En MySQL la columna nueva de `pai_subidas` se agrega por `PREPARE`: corra el
archivo completo, no sentencia por sentencia a mano.

## Descripción y revisión de datos (versión 6)

El Observatorio pidió (12 de noviembre de 2026) que cada producto tenga una
descripción de unas 30 palabras (al principio se pidieron 60; el 14-nov-2026 pidieron 30), en tercera persona y tono expositivo, año y
6 palabras clave. Se publican todos los productos: documentos, tableros de
Power BI y la entrada de blog. La
migración 006 agrega la columna `repositorio_documentos.descripcion`
(`VARCHAR(700)`, nula); no crea tablas, así que **no necesita permisos
nuevos**: los de la tabla cubren la columna. El servidor exige la versión 6:
mientras no se migre, la API de la base responde 503.

Con la VM configurada: `sudo -u sapiencia node dist/repositorio/cli/migrar.js --usuario <cuenta_admin>`.
A mano: pegue `migraciones/006-descripcion.sql` (o la de `postgres/migraciones/`)
completo y registre la versión
(`INSERT IGNORE INTO sistema_esquema_version (version, descripcion) VALUES (6, 'descripcion');`).

Reglas para publicar (las aplica el servidor al publicar y al editar un
producto publicado; `problemasParaPublicar` en `src/repositorio/dominio/validacion.ts`):
año, descripción de 25 a 35 palabras y exactamente 6 palabras clave, igual
para documentos, tableros y entradas. Un borrador puede quedar incompleto. El
listado público (`GET /api/repositorio/documentos`) lleva todo lo publicado.

**Revisión de datos.** Los cambios de datos de una revisión editorial
(categoría, publicación, año, descripción y palabras clave de cientos de
documentos, y categorías que quedan sin uso) se aplican con
`npm run repositorio:revision -- --archivo <revision.json>` (en la VM:
`sudo -u sapiencia node dist/repositorio/cli/revision.js --archivo <revision.json>`),
con la cuenta de la aplicación:

1. Sin `--aplicar` solo **simula**: hace todo en una transacción que se
   deshace al final y muestra qué cambiaría (`--detalle`: documento por
   documento, de qué a qué).
2. Con `--aplicar` escribe todo en una transacción (o todo o nada), con una
   fila por documento en `repositorio_cambios` (usuario `--usuario`, por
   defecto `revision`) y la versión del contenido una vez.
3. Si al final quedara publicado algo que no cumple las reglas, no escribe
   nada (salvo `--permitir-incompletos`).

Formato y detalle en `src/repositorio/servicios/revision.ts`. Después de
aplicarla, reindexe el Asistente ODES (`/repositorio/admin`, Asistente) para
que tome las categorías nuevas y deje de lado lo despublicado.

## Tablero de los fondos (versión 7)

La migración 007 (17 de noviembre de 2026) crea las 8 tablas
`sivu_tablero_fondos_2026_*` del tablero `/tableros/fondos-2026`. Solo crea
tablas: en MySQL la cuenta de la aplicación necesita un GRANT sobre cada una
(el `SELECT CONCAT('GRANT …')` del README las incluye por el prefijo `sivu_`).
El servidor exige la versión 7; una base en la 7 sigue sirviendo a un servidor
anterior (exige «al menos» su versión), así que se migra primero y se
despliega después. Los datos los carga `npm run tableros:cargar-fondos`.

## CRM (versión 10)

La migración 010 (24 de noviembre de 2026) crea las 10 tablas `crm_*` de la
rama `/crm`, las tareas de la Oficina de Planeación:

| Tabla | Qué guarda |
| --- | --- |
| `crm_personas` | El equipo: nombre, correo (único, sin distinguir mayúsculas), foto, orden de las tarjetas, activo y quién es el líder (`es_lider`). |
| `crm_tareas` | Las tareas: responsable, estado (`pendiente`, `en_proceso`, `terminada`), fecha límite, si exige entregable y la nota de cierre. Borrar una tarea solo la oculta (`eliminada_en`). |
| `crm_tarea_archivos` | Adjuntos (los sube el líder) y entregables (los sube el responsable) de cada tarea. |
| `crm_tarea_eventos` | El historial de cada tarea (qué, quién y desde qué IP); también es la base del tope por IP del equipo. |
| `crm_correos` | Cada aviso por correo, guardado antes de enviarlo, con su estado, intentos y último error. |
| `crm_almacen_archivos`, `crm_almacen_archivo_trozos` | El almacén de archivos del CRM, con las mismas columnas que el del PAI. |
| `crm_acceso_usuarios`, `crm_acceso_sesiones`, `crm_acceso_intentos` | La cuenta única del líder (usuario fijo `lider`, solo contraseña), sus sesiones y sus intentos de ingreso, como las `sivu_acceso_*` (008). |

**Primero migrar, después desplegar.** El servidor exige la versión 10. Una
base más nueva sirve a un servidor anterior (exige «al menos» su versión); al
revés, un servidor nuevo sobre una base en la 9 responde 503 en toda la API de
la base (`/api/repositorio`, `/api/sivu/tableros`, `/api/pai` y `/api/crm`).
Desde un equipo con acceso a la base: `npm run repositorio:migrar -- --usuario <cuenta_admin>`
(en la VM, `sudo -u sapiencia node dist/repositorio/cli/migrar.js --usuario <cuenta_admin>`).
A mano: pegue `migraciones/010-crm.sql` (o la de `postgres/migraciones/`)
completo y registre la versión
(`INSERT IGNORE INTO sistema_esquema_version (version, descripcion) VALUES (10, 'crm');`).

**Permisos en `planeacionbd`.** La migración solo crea tablas y
`sapiencia_web` tiene permisos tabla por tabla, así que cada una necesita su
GRANT (el `SELECT CONCAT('GRANT …')` del README ya incluye el prefijo `crm_`):

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON planeacionbd.crm_almacen_archivos TO 'sapiencia_web'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON planeacionbd.crm_almacen_archivo_trozos TO 'sapiencia_web'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON planeacionbd.crm_personas TO 'sapiencia_web'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON planeacionbd.crm_tareas TO 'sapiencia_web'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON planeacionbd.crm_tarea_archivos TO 'sapiencia_web'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON planeacionbd.crm_tarea_eventos TO 'sapiencia_web'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON planeacionbd.crm_correos TO 'sapiencia_web'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON planeacionbd.crm_acceso_usuarios TO 'sapiencia_web'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON planeacionbd.crm_acceso_sesiones TO 'sapiencia_web'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON planeacionbd.crm_acceso_intentos TO 'sapiencia_web'@'%';
```

**Carga inicial.** La migración no trae datos: el repositorio es público y
los nombres y correos del equipo y la clave del líder no van en él. Se cargan
con las dos CLI, primero el equipo (sin `--nombre`, la clave toma el nombre
del líder del equipo):

```bash
# El JSON va en apps/server/datos/crm/ (git lo ignora), en el orden de las tarjetas:
# [{ "nombre": "…", "correo": "…", "lider": true }, { "nombre": "…", "correo": "…" }]
npm run crm:cargar-equipo -- --archivo apps/server/datos/crm/equipo.json --solo-sql
npm run crm:clave-lider -- --solo-sql      # pide la contraseña dos veces sin mostrarla
```

Con `--solo-sql` no se conectan: imprimen el SQL de MySQL (o de Postgres, con
`--motor postgres`), que se corre completo con la cuenta administradora o con
`sapiencia_web`. El de la clave lleva el hash scrypt, nunca la contraseña.
Sin `--solo-sql` escriben directo con la conexión de `apps/server/.env`. Las
dos se pueden repetir: el equipo se actualiza por correo (el líder del archivo
queda como único líder; quien no esté en el archivo no se toca), y la clave
nueva cierra las sesiones del líder y levanta su bloqueo por intentos fallidos.

## CRM: cuenta de correo (versión 11)

La migración 011 (24 de noviembre de 2026) crea `crm_correo_cuenta`, de una
sola fila (`id = 1`): la cuenta con la que salen los avisos del CRM cuando el
servidor no tiene las variables `CRM_CORREO_*`. Si las tiene, mandan ellas y la
fila no se usa. La guarda el líder desde `/crm/lider/correos`.

| Columna | Qué guarda |
| --- | --- |
| `usuario` | La cuenta, que también es el remitente. |
| `clave_cifrada` | La contraseña de aplicación cifrada con AES-256-GCM (`v1.` + base64url). Nunca se devuelve. La llave no está en la base: se deriva (HKDF-SHA256) de `CRM_CORREO_LLAVE` o, sin ella, de la contraseña de la base de la aplicación. Si ese secreto cambia, la contraseña deja de leerse y el líder la escribe otra vez. |
| `host`, `puerto`, `seguro` | El servidor SMTP (`smtp.gmail.com`, 465 y TLS para Gmail y Google Workspace). |
| `nombre` | Nombre visible del remitente. |
| `actualizado_en`, `actualizado_por` | Cuándo la guardó y quién (el nombre de la sesión del líder). |

**Primero migrar, después desplegar**: el servidor exige la versión 11 (con
una base en la 10, toda la API de la base responde 503). Con
`npm run repositorio:migrar -- --usuario <cuenta_admin>`, o a mano: pegue
`migraciones/011-crm-cuenta-correo.sql` (o la de `postgres/migraciones/`) y
registre la versión
(`INSERT IGNORE INTO sistema_esquema_version (version, descripcion) VALUES (11, 'crm-cuenta-correo');`).

**Permisos en `planeacionbd`.** Como las demás, la tabla necesita su GRANT:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON planeacionbd.crm_correo_cuenta TO 'sapiencia_web'@'%';
```

## Paso a la versión 4 (nombres por módulo)

Hasta la versión 3 las tablas del repositorio y del tablero no tenían
prefijo, y las evidencias del PAI guardaban sus fichas en el almacén del
repositorio. La versión 4 renombra las tablas y le da al PAI su propio
almacén. Siguen a cada tabla los datos, las
llaves foráneas, los permisos otorgados sobre toda la base (como los de
`permisos.sql`, `repositoriobd.*`) y, en Postgres, los permisos de cada tabla,
las políticas RLS y los disparadores. **En MySQL, un permiso otorgado tabla por
tabla (`GRANT ... ON repositoriobd.documentos`) no sigue al renombre**: si TI
dio permisos así, hay que volver a darlos sobre los nombres nuevos.

| Antes | Desde la versión 4 |
| ----- | ------------------ |
| `esquema_version` | `sistema_esquema_version` |
| `estado_repositorio` | `repositorio_estado` |
| `categorias`, `documentos`, `palabras_clave`, `documento_palabras_clave` | `repositorio_categorias`, `repositorio_documentos`, `repositorio_palabras_clave`, `repositorio_documento_palabras_clave` |
| `administradores`, `sesiones`, `intentos_acceso`, `cambios` | `repositorio_administradores`, `repositorio_sesiones`, `repositorio_intentos_acceso`, `repositorio_cambios` |
| `archivos`, `archivo_trozos` | `repositorio_almacen_archivos`, `repositorio_almacen_archivo_trozos` |
| `tableros`, `matricula_meta`, `matricula_categorias`, `matricula_ies`, `matricula_programas`, `matricula_filas` | `sivu_tableros`, `sivu_tablero_matricula_2025_meta`, `sivu_tablero_matricula_2025_categorias`, `sivu_tablero_matricula_2025_ies`, `sivu_tablero_matricula_2025_programas`, `sivu_tablero_matricula_2025_filas` |
| (fichas de las evidencias del PAI en `archivos`) | `pai_almacen_archivos`, `pai_almacen_archivo_trozos` (tablas nuevas) |

**Almacén del PAI.** En una base de la versión 3, la migración 004 copia al
almacén del PAI las fichas que usan las evidencias, con su mismo id, y sus
trozos; pasa la llave `fk_pai_evidencias_archivo` a `pai_almacen_archivos` y
borra del almacén del repositorio las fichas copiadas que ningún documento
usa. Una ficha que usaban a la vez un documento y una evidencia queda en los
dos almacenes. Los objetos de Supabase no se mueven: los de las evidencias ya
estaban en el bucket privado del PAI. En una base de la versión 1 o 2 la
migración 003 crea el almacén del PAI vacío y la 004 no mueve nada.

**Código y base van juntos.** Un servidor anterior no encuentra las tablas
nuevas y uno nuevo no encuentra las viejas: los dos responden 503 en la API
de la base (el nuevo avisa en el registro que hay que migrar). Despliegue el
código nuevo y migre la base en la misma ventana. En la VM, compile
(`npm run build`) **antes** de correr `dist/repositorio/cli/migrar.js`: un
`dist/` viejo no sabe renombrar.

**Con la CLI (recomendado).** `repositorio:migrar` hace el renombre solo,
antes de aplicar `esquema.sql`, aplica las migraciones que falten (002 y 003
en una base de la versión 1 o 2, y la 004, que en una de la versión 3 pasa
las evidencias al almacén del PAI) y registra la versión 4.
- Actúa sobre una base de este proyecto con los nombres anteriores: la que
  tiene `esquema_version`, o la que tiene `sistema_esquema_version` por debajo
  de la versión 4 (un renombre a mano que quedó a medias, que termina). No toca
  una base sin tabla de versiones ni una ya en la versión 4, aunque tengan
  tablas ajenas que se llamen igual.
- Si alguna tabla existe con los dos nombres, se detiene sin tocar nada y dice
  cuáles borrar (las nuevas suelen estar vacías).
- En MySQL la cuenta necesita además **DROP**: `RENAME TABLE` exige ALTER y
  DROP sobre la tabla vieja, y CREATE e INSERT sobre la nueva.
- En Postgres, si la aplicación se conecta con un rol distinto del dueño de
  las tablas, ese rol no tiene permisos sobre las tablas que crean las
  migraciones (las del PAI y su almacén). Déselos después de migrar:
  `grant select, insert, update, delete on all tables in schema public to <rol>;`
  y `grant usage, select on all sequences in schema public to <rol>;`. En
  Supabase la aplicación usa el dueño (`postgres`) y no hace falta. En MySQL
  los permisos de `permisos.sql` son sobre toda la base y cubren las tablas
  nuevas.

**Guarda.** Desde la versión 4, `esquema.sql` empieza con una guarda: si la
base todavía tiene `esquema_version`, se detiene en la primera sentencia y no
crea nada (en MySQL con el error *Subquery returns more than 1 row*, porque
MySQL no deja lanzar un error propio fuera de un procedimiento; en Postgres
con un mensaje que remite a esta sección). Así, pegar el `esquema.sql` nuevo
sobre una base vieja, o correr un `dist/` sin recompilar, no deja tablas
nuevas vacías junto a las viejas.

**A mano (TablePlus o editor SQL de Supabase).**

1. Renombre. Una base de la versión 1 no tiene el tablero: quite las seis
   líneas de `tableros` y `matricula_*`.

   MySQL (un solo `RENAME TABLE`, atómico):

   ```sql
   RENAME TABLE
     esquema_version TO sistema_esquema_version,
     estado_repositorio TO repositorio_estado,
     categorias TO repositorio_categorias,
     documentos TO repositorio_documentos,
     palabras_clave TO repositorio_palabras_clave,
     documento_palabras_clave TO repositorio_documento_palabras_clave,
     administradores TO repositorio_administradores,
     sesiones TO repositorio_sesiones,
     intentos_acceso TO repositorio_intentos_acceso,
     cambios TO repositorio_cambios,
     archivos TO repositorio_almacen_archivos,
     archivo_trozos TO repositorio_almacen_archivo_trozos,
     tableros TO sivu_tableros,
     matricula_meta TO sivu_tablero_matricula_2025_meta,
     matricula_categorias TO sivu_tablero_matricula_2025_categorias,
     matricula_ies TO sivu_tablero_matricula_2025_ies,
     matricula_programas TO sivu_tablero_matricula_2025_programas,
     matricula_filas TO sivu_tablero_matricula_2025_filas;
   ```

   Postgres (en una transacción):

   ```sql
   begin;
   alter table esquema_version rename to sistema_esquema_version;
   alter table estado_repositorio rename to repositorio_estado;
   alter table categorias rename to repositorio_categorias;
   alter table documentos rename to repositorio_documentos;
   alter table palabras_clave rename to repositorio_palabras_clave;
   alter table documento_palabras_clave rename to repositorio_documento_palabras_clave;
   alter table administradores rename to repositorio_administradores;
   alter table sesiones rename to repositorio_sesiones;
   alter table intentos_acceso rename to repositorio_intentos_acceso;
   alter table cambios rename to repositorio_cambios;
   alter table archivos rename to repositorio_almacen_archivos;
   alter table archivo_trozos rename to repositorio_almacen_archivo_trozos;
   alter table tableros rename to sivu_tableros;
   alter table matricula_meta rename to sivu_tablero_matricula_2025_meta;
   alter table matricula_categorias rename to sivu_tablero_matricula_2025_categorias;
   alter table matricula_ies rename to sivu_tablero_matricula_2025_ies;
   alter table matricula_programas rename to sivu_tablero_matricula_2025_programas;
   alter table matricula_filas rename to sivu_tablero_matricula_2025_filas;
   commit;
   ```

2. Aplique las migraciones que le falten con los archivos **nuevos** (ya usan
   los nombres por módulo; en Postgres, los de `postgres/migraciones/`):
   `migraciones/002-tablero-matricula.sql` si estaba en la 1,
   `migraciones/003-pai.sql` si estaba en la 1 o la 2, y siempre
   `migraciones/004-nombres-por-modulo.sql`, que en una base de la versión 3
   pasa las evidencias al almacén del PAI (en las demás no cambia nada).
3. Registre las versiones (no registre la 4 sin haber aplicado la 2 y la 3:
   el servidor solo mira la mayor, quedaría «disponible» sin esas tablas y
   respondería 503 a ratos):

   ```sql
   INSERT IGNORE INTO sistema_esquema_version (version, descripcion)
   VALUES (2, 'tablero-matricula'), (3, 'pai'), (4, 'nombres-por-modulo');
   ```

   En Postgres, `insert into ... on conflict (version) do nothing;`.

Comprobación: `SELECT version FROM sistema_esquema_version;` da 1, 2, 3 y 4,
y ninguna tabla queda sin prefijo. La CLI además renombra en Postgres las
secuencias de los `id` (`categorias_id_seq` a `repositorio_categorias_id_seq`)
y, en Postgres 18 o posterior, las restricciones NOT NULL que llevan el nombre
de la tabla; a mano no hace falta: funcionan igual con el nombre anterior.

**Volver atrás.** Para regresar a un código anterior a la versión 4, invierta
el renombre y borre la versión 4. Las tablas `pai_*` (con su almacén), si se
crearon, se quedan: el código desplegado antes de la versión 4 no las usa.

MySQL:

```sql
RENAME TABLE
  sistema_esquema_version TO esquema_version,
  repositorio_estado TO estado_repositorio,
  repositorio_categorias TO categorias,
  repositorio_documentos TO documentos,
  repositorio_palabras_clave TO palabras_clave,
  repositorio_documento_palabras_clave TO documento_palabras_clave,
  repositorio_administradores TO administradores,
  repositorio_sesiones TO sesiones,
  repositorio_intentos_acceso TO intentos_acceso,
  repositorio_cambios TO cambios,
  repositorio_almacen_archivos TO archivos,
  repositorio_almacen_archivo_trozos TO archivo_trozos,
  sivu_tableros TO tableros,
  sivu_tablero_matricula_2025_meta TO matricula_meta,
  sivu_tablero_matricula_2025_categorias TO matricula_categorias,
  sivu_tablero_matricula_2025_ies TO matricula_ies,
  sivu_tablero_matricula_2025_programas TO matricula_programas,
  sivu_tablero_matricula_2025_filas TO matricula_filas;
DELETE FROM esquema_version WHERE version = 4;
```

Postgres:

```sql
begin;
alter table sistema_esquema_version rename to esquema_version;
alter table repositorio_estado rename to estado_repositorio;
alter table repositorio_categorias rename to categorias;
alter table repositorio_documentos rename to documentos;
alter table repositorio_palabras_clave rename to palabras_clave;
alter table repositorio_documento_palabras_clave rename to documento_palabras_clave;
alter table repositorio_administradores rename to administradores;
alter table repositorio_sesiones rename to sesiones;
alter table repositorio_intentos_acceso rename to intentos_acceso;
alter table repositorio_cambios rename to cambios;
alter table repositorio_almacen_archivos rename to archivos;
alter table repositorio_almacen_archivo_trozos rename to archivo_trozos;
alter table sivu_tableros rename to tableros;
alter table sivu_tablero_matricula_2025_meta rename to matricula_meta;
alter table sivu_tablero_matricula_2025_categorias rename to matricula_categorias;
alter table sivu_tablero_matricula_2025_ies rename to matricula_ies;
alter table sivu_tablero_matricula_2025_programas rename to matricula_programas;
alter table sivu_tablero_matricula_2025_filas rename to matricula_filas;
delete from esquema_version where version = 4;
commit;
```

## Copias de seguridad y tamaño

Los archivos están dentro de la base, así que las copias automáticas de Cloud
SQL los incluyen: no hay una carpeta aparte que respaldar. Con la carga
inicial la base ocupa unos 510 MB (482 MB de archivos). Cada trozo viaja en
un paquete de 1 MB: con el `max_allowed_packet` por defecto de MySQL 8
(64 MB) no hay que cambiar nada.

## Problemas frecuentes

- **`/api/repositorio/...` responde 503** y el registro dice "sin base de
  datos", "No se pudo usar MySQL" o "no está lista": faltan variables, la IP
  de la VM no está autorizada, el certificado no corresponde o falta aplicar
  `esquema.sql`. El servidor reintenta solo; no hace falta reiniciarlo
  después de corregir la red o el esquema.
- **`repositorio:migrar` dice que no tiene permisos**: se está usando el
  usuario de la aplicación. Use `--usuario <cuenta_admin>`.
- **"using password: NO"** con una contraseña que empieza por `#`: póngala
  entre comillas simples en `.env`.
- **Una CLI dice que `.env` "existe pero este usuario no lo puede leer"**:
  ejecútela con `sudo -u sapiencia`.
- **503 "atendiendo muchas solicitudes a la vez"** y el registro dice "Pool
  de MySQL saturado": más consultas simultáneas de las que admite el pool;
  es momentáneo. Si se repite, suba `REPOSITORIO_MYSQL_CONEXIONES`.
