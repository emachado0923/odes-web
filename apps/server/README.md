# apps/server — NestJS 12

Servidor de **sapiencia-web**. Expone la API bajo `/api` y, en producción,
sirve el build de React (`apps/web/dist`) para los sitios `/sivu` (Edificio
Sapiencia 3D), `/odes` (Asistente ODES: chat con Claude sobre el repositorio
del Observatorio; ver [Asistente ODES](../../README.md#asistente-odes)),
`/repositorio` (Repositorio de Productos con MySQL como fuente de verdad y su
administración; ver
[Repositorio de Productos](../../README.md#repositorio-de-productos-repositorio)),
`/tableros` (tableros del Observatorio; ver [Tableros](../../README.md#tableros-tableros)),
`/pai` (Plan de Acción Institucional; ver [PAI](../../README.md#pai-pai)) y
`/pertinencia` (Medida de pertinencia, sin API propia).

Paquete npm independiente (sin workspaces): tiene su propio `node_modules` y
`package-lock.json`. Paquete ESM (`"type": "module"`), TypeScript ~6.0, tests
con Vitest, lint con oxlint.

## Scripts

| Script               | Qué hace                                                        |
| -------------------- | --------------------------------------------------------------- |
| `npm run start:dev`  | `nest start --watch` (compila a `dist/` y reinicia al guardar)   |
| `npm run build`      | Compila a `dist/` (`dist/main.js`)                              |
| `npm run start:prod` | `node --enable-source-maps dist/main.js`                        |
| `npm test`           | Tests unitarios (`src/**/*.spec.ts`)                            |
| `npm run test:e2e`   | Tests e2e con supertest (`test/**/*.e2e-spec.ts`)               |
| `npm run typecheck`  | `tsc --noEmit` sobre src, test y configs                        |
| `npm run lint`       | oxlint (`.oxlintrc.json`), falla también con advertencias       |
| `npm run odes:indexar` | compila y genera el índice del Asistente ODES (`datos/odes/indice.sqlite`) desde la base del repositorio, o con `-- --paquete <carpeta>` desde el paquete; `--ayuda` lista las opciones |
| `npm run odes:evaluar-busqueda` | compila y mide la búsqueda con `datos/odes/evaluacion-busqueda.json` |
| `npm run odes:probar -- [--dos-veces] "pregunta"` | compila y prueba el asistente contra la API real de Claude (necesita `ANTHROPIC_API_KEY`) |
| `npm run repositorio:migrar -- --usuario <admin>` | compila y aplica `db/repositorio/esquema.sql` (y las migraciones pendientes) con una cuenta administradora de MySQL |
| `npm run repositorio:crear-admin -- --usuario <u> --nombre "…"` | compila y crea un administrador de `/repositorio/admin` (o le cambia la contraseña; `--desactivar`) |
| `npm run tableros:cargar-matricula` | compila y carga los datos del tablero de matrícula (`datos/tableros/matricula-2025/`) |
| `npm run pai:cargar-fichas -- [--archivo] [--vigencia 2026] [--bimestre-abierto N\|cerrado] [--forzar] [--aceptar-renumeracion]` | compila y carga las fichas del PAI (`datos/pai/<vigencia>/pai-<vigencia>.json`); código de salida 3 si se niega por datos del aplicativo (sin `--forzar`) o porque códigos con datos del aplicativo cambian de nombre (sin `--aceptar-renumeracion`) |
| `npm run pai:crear-usuario -- --usuario <u> --nombre "…" --rol administrador\|responsable` | compila y crea un usuario del PAI o le cambia la contraseña (`--correo`, `--cargo`, `--temporal`, `--desactivar`, `--solo-sql`; contraseña oculta o `PAI_USUARIO_CONTRASENA`) |
| `npm run pai:recolectar-evidencias` | compila, libera las fichas de `pai_almacen_archivos` sin uso y limpia el bucket privado de las evidencias (con Supabase) |
| `npm run repositorio:importar -- --paquete <carpeta> --miniaturas ../web/public/odes/portadas` | compila y hace la carga inicial (o la actualiza) desde el paquete de datos; idempotente y reanudable. No vuelve a crear lo borrado en la administración (`--restaurar-borrados`) ni sobrescribe lo editado allí (`--forzar`); un documento nuevo abre su posición y uno existente conserva la suya |

Configuración: ver [`.env.example`](./.env.example) (`PORT`, `HOST`,
`WEB_DIST_DIR`, `CSP_FRAME_ANCESTORS`, `TRUST_PROXY`, `NODE_ENV`; para el
Asistente ODES, `ANTHROPIC_API_KEY` y `ODES_*`; para el repositorio,
`REPOSITORIO_*`; para el PAI, `PAI_SUPABASE_BUCKET`).

Los scripts `odes:*`, `repositorio:*`, `tableros:*` y `pai:*` ejecutan `nest build` antes, que borra
y rehace `dist/`: son para desarrollo. En la copia que sirve el sitio, use
`sudo -u sapiencia node dist/odes/cli/indexar.js` o
`sudo -u sapiencia node dist/repositorio/cli/<migrar|importar|crear-admin>.js`
o `sudo -u sapiencia node dist/pai/cli/<cargar-fichas|crear-usuario|recolectar-evidencias>.js`
(sin recompilar; como el usuario del servicio, porque `.env` tiene permisos
`600` y correrlas como root dejaría archivos de root en `datos/odes/`). Si
`.env` existe pero no se puede leer, las CLI lo dicen así (Node solo diría
`ENOENT`). Las rutas relativas de las opciones se resuelven contra la carpeta
desde la que se llamó npm (`INIT_CWD`).
El simulador local de la API de Claude (`node dist/odes/cli/simulador-claude.js
--puerto 4010`) permite probar el modo IA sin clave; las pruebas e2e lo usan.

## Rutas

| Ruta                                   | Respuesta                                                        |
| -------------------------------------- | ---------------------------------------------------------------- |
| `GET /api/salud`                       | `{ estado: 'ok', ... }`, `Cache-Control: no-store`               |
| `GET /api/sivu`                        | `{ sitio: 'sivu', nombre: 'Sistema de Visualización de Datos de Sapiencia' }` |
| `GET /api/odes`                        | `{ sitio: 'odes', nombre: 'Asistente ODES' }`                    |
| `GET /api/odes/estado`                 | modo del asistente (`ia`/`busqueda`) y estado del índice, `Cache-Control: no-store` |
| `POST /api/odes/chat`                  | conversación en `text/event-stream` (protocolo en `src/odes/chat/protocolo.ts`); errores previos al flujo en JSON `{ codigo, mensaje }`: 400, 403 (otro sitio), 413 (también si, al unir mensajes seguidos del mismo rol, un turno o el total pasan de lo permitido), 429 + `Retry-After` (límites por IP, IPv6 por `/64`), 503 (sin índice) |
| `GET /api/repositorio/documentos`      | documentos publicados (`ListadoPublico`), `no-cache` + ETag (304); contrato en `src/repositorio/api-repositorio.ts` |
| `GET /api/repositorio/documentos/:id/ver` \| `descargar` \| `portada` \| `miniatura` | archivo desde MySQL: inline con `Range` (206/416) y ETag por sha256; `attachment` con `filename*` UTF-8 + respaldo ASCII; portada JPEG 720 y miniatura WebP 192 (con `?v=` un año `immutable`); 404 si no está publicado |
| `POST /api/repositorio/admin/subidas`  | cómo subir un archivo (`RespuestaSubida`): con Supabase Storage, una URL firmada para subirlo directo al bucket (luego `PUT .../documentos/:id/archivo` con JSON `{ subida, nombre, tipo }`); sin Storage, `{ directa: false }` y la subida multipart de siempre |
| archivos con Supabase Storage          | `/ver`, `/descargar` (con `?download=<nombre>`), `/portada` y `/miniatura` responden 302 a la URL pública del bucket, con la misma política de caché |
| `/api/repositorio/admin/*`             | administración con sesión (cookie `repositorio_sesion`, `Path=/api/repositorio/admin`) y `X-CSRF-Token` en las mutaciones: 401 sin sesión, 403 sin CSRF o de otro sitio, 429 + `Retry-After` con el inicio de sesión bloqueado (5 fallos por usuario o 20 por IP, IPv6 por `/64`; cada intento se reserva antes de verificar la contraseña, así que una ráfaga simultánea no lo salta) |
| `GET/POST /api/repositorio/admin/odes/indice` \| `reindexar` | estado del índice del Asistente ODES y reindexación (202; 409 si ya hay una); protocolo en `src/odes/chat/protocolo.ts` |
| `GET /api/sivu/tableros/:id`           | datos de un tablero (hoy `matricula-2025`) desde la base, `no-cache` + ETag (304) |
| `/api/pai/*`                           | API del PAI (contrato en `src/pai/api-pai.ts`): sesión propia (cookie `pai_sesion`, `Path=/api/pai`, `X-CSRF-Token` y mismo sitio en las mutaciones; 403 `cambio_contrasena_requerido` con contraseña temporal), vigencia, tablero, ficha, reportes, evidencias (multipart o subida directa firmada; descarga `attachment` desde la base o 302 a una URL firmada de 60 s del bucket privado) y `/api/pai/admin/*` (usuarios, asignaciones, bimestre, autorizaciones, registro, `exportar.csv`). JSON con `no-store`; errores `{ codigo, mensaje, campos? }` con mensajes del PAI; sin base, 503 + `Retry-After` |
| `/api/repositorio/*` sin base          | 503 JSON `{ codigo: 'no_disponible', mensaje }` + `Retry-After`; el resto del servidor funciona |
| `/api/repositorio/*` con el pool lleno | 503 `no_disponible` + `Retry-After: 2` (cola de mysql2 llena; la base no se marca como caída; un aviso por minuto en el registro) |
| otra `/api/*`                          | 404 JSON de Nest                                                 |
| `/assets/*` existente                  | archivo, `Cache-Control: public, max-age=31536000, immutable`    |
| otro archivo existente del build       | archivo, `Cache-Control: public, no-cache` + ETag por contenido (no cambia con la fecha del build) y Last-Modified |
| `GET/HEAD /principal`, `/principal/`, `/principal/index.html` | `principal/index.html` (el bloque de WordPress en HTML puro) desde memoria, `Cache-Control: no-cache` + ETag (304); CSP del sitio con `script-src 'self'` + el `sha256` de cada script en línea del archivo (sin `'unsafe-inline'` ni `'wasm-unsafe-eval'`); se relee si el archivo cambia |
| `/principal` sin `principal/index.html` en el build | 503 texto plano: abrir http://localhost:5173/principal (Vite) o compilar |
| `GET/HEAD /`, `/sivu[/…]`, `/odes[/…]`, `/repositorio[/…]`, `/tableros[/…]`, `/pai[/…]`, `/pertinencia[/…]` sin extensión | `index.html`, `Cache-Control: no-cache` |
| las mismas, sin build de React         | 503 texto plano: abrir http://localhost:5173 (Vite)              |
| navegador (`Accept: text/html`) en otra ruta sin extensión (`/otra`) | `index.html` con estado **404** (React dibuja su página 404), `Cache-Control: no-store` |
| cualquier otra cosa (`/sivu/falta.glb`, `fetch`/curl a `/otra`, `POST`) | 404 texto plano, nunca `index.html` |
| `Range`/`If-Match` imposibles sobre un archivo o una ruta de la SPA | 416/412 texto plano, `Cache-Control: no-store`, sin registrar en el log |
| error al leer un archivo (EACCES, EIO, EMFILE) | 500 texto plano genérico, `no-store`, sin cabeceras de caché del archivo; el detalle (con la ruta) solo va al log |

Cada sitio tiene su módulo (`src/sivu`, `src/odes`, `src/repositorio`, `src/pai`): ahí
se agregan sus endpoints futuros. Un sitio nuevo del front-end se registra además en
`SITIOS_SPA` (`src/frontend/rutas-spa.ts`).

## Estructura

```
src/
  main.ts                    arranque: .env -> configuración -> Nest -> listen
  vercel.ts                  entrada de la función de Vercel (la misma aplicación, sin listen)
  configurar-aplicacion.ts   helmet, compresión, prefijo /api, front-end, shutdown hooks
  app.module.ts              módulo raíz (solo API)
  config/configuracion.ts    lectura tipada y validada de variables de entorno
  seguridad/opciones-helmet.ts  CSP explícita para three.js + Draco
  seguridad/clave-ip.ts      clave de los límites por IP (IPv6 por su /64)
  frontend/frontend.ts       /principal + estáticos del build + fallback SPA + 404/503 + errores
  frontend/pagina-principal.ts  /principal: HTML puro del bloque de WordPress con CSP por hash
  frontend/etag-contenido.ts ETag por contenido de los archivos sin hash
  frontend/rutas-spa.ts      reglas puras de rutas de la SPA
  salud/  sivu/              módulos de la API
  odes/                      Asistente ODES
    configuracion-odes.ts    ANTHROPIC_API_KEY y ODES_* (validadas al arrancar)
    chat/                    controlador SSE, servicio, motor con Claude (motor-ia.ts),
                             herramientas, citas, prompt de sistema, límites de uso
    repositorio/             contrato RepositorioOdes + índice SQLite FTS5 (node:sqlite),
                             enlaces (url-documento.ts) e indexador (indexacion/)
    admin/                   estado del índice y "Reindexar" (bajo /api/repositorio/admin/odes)
    cli/                     indexar, evaluar-busqueda, probar-chat (+ comprobacion-cache), simulador-claude
  repositorio/               Repositorio de Productos (MySQL); RepositorioProductosModule
    api-repositorio.ts       contrato HTTP (copia idéntica en apps/web/src/sites/repositorio)
    configuracion-repositorio.ts  REPOSITORIO_* (validadas al arrancar)
    guardia-admin.ts         sesión + CSRF + mismo sitio para /api/repositorio/admin/*
    bd/                      pool de MySQL (mysql2) o Postgres (pg) con la misma API (conexion.ts
                             traduce las consultas a Postgres), esquema y migraciones, errores
    archivos/                almacén de archivos: en la base (trozos de 1 MB) o en Supabase Storage
                             (almacen-supabase.ts); tipo por firma, ZIP de Office, tamaño de imágenes
    http/                    Range/ETag, nombres de descarga, envío de archivos, filtro de errores
    dominio/                 scrypt, normalización e ids, validación (zod)
    servicios/               lectura pública, sesiones, documentos, catálogos, registro de cambios
    controladores/           público, sesión, documentos y catálogos de la administración
    importacion/ cli/        carga inicial; repositorio:migrar, importar, crear-admin
  sivu/tableros/             GET /api/sivu/tableros/:id y tableros:cargar-matricula
  pai/                       Plan de Acción Institucional; PaiModule
    api-pai.ts               contrato HTTP (copia idéntica en apps/web/src/sites/pai)
    configuracion-pai.ts     PAI_SUPABASE_BUCKET (validada al arrancar)
    errores-pai.ts, http/    errores con mensajes del PAI y su filtro
    compartido/              tipos de la sesión, permisos, registro (pai_registro), validación común
    sesion/ usuarios/        ingreso, guardias (GuardiaPai, GuardiaAdministradorPai), usuarios y asignaciones
    dominio/                 cálculos, reglas de edición, validación (zod), filtros y CSV (puros)
    servicios/ controladores/  vigencia, tablero, ficha, reportes, permisos, autorizaciones, registro, exportación
    evidencias/              evidencias privadas: en la base o en el bucket privado de Supabase
    carga/ cli/              fichas JSON <-> filas; pai:cargar-fichas, crear-usuario, recolectar-evidencias
datos/odes/                  indice.sqlite y cache/ (ignorados por git), casos de evaluación, LEEME.md
datos/tableros/, datos/pai/  datos de los tableros y fichas del PAI por vigencia (no van a Vercel)
db/repositorio/              permisos.sql (base + usuario mínimo), esquema.sql, migraciones/ (002, 003), LEEME.md
db/repositorio/postgres/     esquema.sql y migraciones/: el mismo esquema para Postgres (Supabase)
test/
  app.e2e-spec.ts            e2e contra un dist temporal en os.tmpdir()
  dist-temporal.ts           crea ese dist falso
  odes-chat.e2e-spec.ts      e2e del chat con el SDK real contra el simulador de Claude
  odes-apoyo.ts              repositorio en memoria y utilidades de las pruebas del chat
  odes-repositorio.e2e-spec.ts  indexador con la fuente MySQL, enlaces/miniaturas y "Reindexar"
  repositorio-sin-bd.e2e-spec.ts  API del repositorio sin base (503)
  repositorio-bd.e2e-spec.ts, repositorio-api.e2e-spec.ts  base y API completas (con MYSQL_PRUEBAS)
  repositorio-apoyo.ts, repositorio-fixtures.ts  base desechable por prueba y datos de ejemplo
  tableros.e2e-spec.ts       migración 002, carga y API del tablero de matrícula
  pai-esquema.e2e-spec.ts    migración 003 (restricciones, decimales, cascadas, RLS en Postgres)
  pai-sesion.e2e-spec.ts, pai-dominio.e2e-spec.ts, pai-evidencias.e2e-spec.ts  API del PAI con base
  pai-sin-bd.e2e-spec.ts     /api/pai/* sin base (503 JSON)
  pai-apoyo.ts, storage-falso.ts  fixtures del PAI y Supabase Storage falso (buckets privados, URL firmadas)
```

Las pruebas con base se activan con `MYSQL_PRUEBAS=mysql://root@127.0.0.1:<puerto>`
o `POSTGRES_PRUEBAS=postgres://postgres@127.0.0.1:<puerto>/postgres` (una base
desechable, nunca la de la entidad): crean y borran sus propias bases y
usuarios, y deben pasar con los dos motores. Sin la variable se omiten y lo
avisan.

El cuerpo JSON admite hasta 512 kB (`LIMITE_CUERPO_JSON` en
`configurar-aplicacion.ts`): una conversación del chat dentro de los límites
de su protocolo pasa de los 100 kB que Express acepta por defecto.
