# sapiencia-web

Sitios web de Sapiencia (Agencia de Educación Postsecundaria de Medellín),
servidos por **un solo servidor NestJS** con un front-end **React + Vite**.
El proyecto tiene varias ramas que no dependen la una de la otra, más la
página principal del Observatorio en HTML puro:

| Ruta           | Qué es                                                                                  |
| -------------- | --------------------------------------------------------------------------------------- |
| `/sivu`        | **SIVU, Sistema de Visualización de Datos**: el edificio de Sapiencia en 3D (visor three.js con el aspecto del bloque del Observatorio) y, debajo, los tableros de información. Ver [SIVU](#sivu-sivu). |
| `/odes`        | **Asistente ODES**: pantalla de ingreso «¡Pregúntale a OdeS!»; «Ingresar» lleva al chat (`/odes/chat`), que responde con los documentos del Repositorio del Observatorio (Claude). Ver [Asistente ODES](#asistente-odes). |
| `/repositorio` | **Repositorio de productos del Observatorio**: los documentos publicados (con descripción, 6 palabras clave y año) con búsqueda y filtros, bajo la cabecera y el pie de la entidad, y en `/repositorio/admin` su administración (agregar, editar, publicar, quitar), con MySQL como fuente de verdad. Ver [Repositorio de Productos](#repositorio-de-productos-repositorio). |
| `/tableros/matricula-2025` | **Tablero de matrícula en educación superior en Medellín (2025)**: el tablero de Octubre/tablero_educ_sup_2025 (React + ECharts) dentro del aplicativo, con sus datos en la base. Se abre desde los tableros de SIVU y desde el botón 1 de la página principal. Ver [Tableros](#tableros-tableros). |
| `/tableros/bateria-indicadores` | **Batería de indicadores de educación postsecundaria**: el tablero estático `tablero_bateria_indicadores` (React + ECharts) dentro del aplicativo, con una dirección por vista (`/tableros/bateria-indicadores/<vista>?v=<variante>`) y sus datos en archivos que genera su ETL. Se abre desde la puerta del edificio de SIVU. Ver [Tableros](#tableros-tableros). |
| `/pai`         | **Plan de Acción Institucional (PAI)**: los responsables de cada proceso o proyecto reportan cada bimestre el avance de sus indicadores (formato F-ES-DE-003) y Planeación hace el seguimiento; con usuarios y roles propios, en la plantilla de Sapiencia. Ver [PAI](#pai-pai). |
| `/pertinencia` | **Medida de pertinencia**: presenta la medida que relaciona la oferta de educación superior de Medellín con las ocupaciones y los sectores que demanda la ciudad, con el tablero de consulta y los accesos a la normativa. El contenido es un bloque para WordPress (`apps/web/pertinencia/pertinencia-bloque.html`, enlaces en su sección EDITAR ENLACES) que el aplicativo muestra entre la cabecera y el pie oficiales recreados (`apps/web/src/sites/pertinencia/`). |
| `/principal`   | **Página principal del Observatorio**: el bloque de WordPress de sapiencia.gov.co/observatorio tal cual, en HTML puro (sin React). Todo cambio se hace en el bloque, que luego se pega en WordPress. Ver [Página principal](#página-principal-principal). |
| `/`            | Inicio con enlaces a la página principal, SIVU, ODES, el repositorio, el PAI y la medida de pertinencia. |
| `/api/*`       | API de NestJS (`/api/salud`, `/api/sivu`, `/api/sivu/tableros/*`, `/api/odes/*`, `/api/repositorio/*`, `/api/pai/*`). |

Cada rama del front-end se descarga por separado (code splitting). three.js
(unos 600 kB) solo se descarga al entrar a `/sivu`, la plantilla de
Sapiencia (CSS, fuentes y botón de accesibilidad) solo al entrar a `/odes`, y
la administración del repositorio (con pdf.js para las portadas) solo al
entrar a `/repositorio/admin`. `/tableros` y `/pai` cargan también la
plantilla de Sapiencia solo al entrar, y el PAI va en su propio chunk.
Un error en una rama no afecta a las otras.
`/principal` no descarga React: es una página aparte que solo trae su HTML,
una hoja de estilos pequeña, Rubik y dos logos.

Se puede desplegar de dos maneras: en una VM con NestJS y la MySQL (Cloud SQL)
de la entidad ([Despliegue en una VM Linux](#despliegue-en-una-vm-linux)), o
en **Vercel + Supabase** (Postgres y Storage), como el sitio de prueba
https://sapiencia-web.vercel.app ([Despliegue en Vercel + Cloud SQL](#despliegue-en-vercel--cloud-sql)).
El repositorio funciona igual con MySQL o con Postgres.

```
navegador ──► (nginx, opcional) ──► NestJS :3000
                                     ├─ /api/*        controladores Nest
                                     │    ├─ /api/repositorio/* ──► MySQL (Cloud SQL): documentos y archivos
                                     │    ├─ /api/sivu/tableros/* ─► la misma base: tablas del tablero de matrícula
                                     │    └─ /api/pai/* ──────────► la misma base: tablas pai_* (usuarios, fichas, reportes, evidencias)
                                     └─ todo lo demás apps/web/dist (/principal, estáticos + index.html de la SPA)
```

## Estructura

Hay dos paquetes npm **independientes**, sin workspaces. Cada uno tiene su
propio `node_modules` y `package-lock.json`. El `package.json` de la raíz solo
coordina los scripts.

```
sapiencia-web/
├── package.json            scripts de la raíz (setup, dev, build, start, test, typecheck, lint)
├── .nvmrc                  versión de Node (24)
├── apps/
│   ├── server/             NestJS 12 (ESM, TypeScript 6, Express 5)
│   │   ├── .env.example    variables de entorno documentadas
│   │   ├── datos/odes/     índice del repositorio (indice.sqlite, no va en git) y casos de evaluación
│   │   ├── datos/pai/      fichas del PAI por vigencia (2026/pai-2026.json, su extractor y su LEEME; no van a Vercel)
│   │   ├── db/repositorio/ SQL: permisos.sql (base + usuario), esquema.sql, migraciones/ (002 tableros, 003 PAI), postgres/ y su LEEME
│   │   ├── src/
│   │   │   ├── main.ts                    arranque (.env -> configuración -> listen)
│   │   │   ├── configurar-aplicacion.ts   helmet, compresión, prefijo /api, front-end
│   │   │   ├── config/                    lectura validada de variables de entorno
│   │   │   ├── seguridad/                 Content-Security-Policy (helmet)
│   │   │   ├── frontend/                  sirve apps/web/dist: /principal (con su CSP), estáticos y fallback de la SPA
│   │   │   ├── salud/                     GET /api/salud
│   │   │   ├── sivu/                     API de la rama /sivu
│   │   │   ├── odes/                      Asistente ODES
│   │   │   │   ├── chat/                  POST /api/odes/chat (SSE), motor con Claude, herramientas, límites
│   │   │   │   ├── repositorio/           índice SQLite FTS5: búsqueda, lectura e indexador (fuentes mysql y paquete)
│   │   │   │   ├── admin/                 estado del índice y "Reindexar" (bajo /api/repositorio/admin/odes)
│   │   │   │   └── cli/                   odes:indexar, odes:evaluar-busqueda, odes:probar, simulador de Claude
│   │   │   ├── pai/                       Plan de Acción Institucional (ver la sección PAI)
│   │   │   │   ├── api-pai.ts             contrato HTTP (copia idéntica en apps/web)
│   │   │   │   ├── sesion/ usuarios/      ingreso, guardias, CSRF, usuarios y asignaciones
│   │   │   │   ├── dominio/ servicios/    cálculos, reglas de edición, validación, tablero, ficha, reportes, autorizaciones, registro, CSV
│   │   │   │   ├── evidencias/            evidencias privadas (base o bucket privado de Supabase)
│   │   │   │   ├── carga/ cli/            cargador de fichas y pai:crear-usuario, pai:cargar-fichas, pai:recolectar-evidencias
│   │   │   │   └── controladores/ http/   API /api/pai/* y filtro de errores del PAI
│   │   │   └── repositorio/               Repositorio de Productos (MySQL)
│   │   │       ├── api-repositorio.ts     contrato HTTP (copia idéntica en apps/web)
│   │   │       ├── bd/ archivos/ http/    conexión y esquema, archivos en trozos, Range/ETag/descargas
│   │   │       ├── dominio/ servicios/    validación, contraseñas scrypt, lectura, sesiones, documentos, catálogos
│   │   │       ├── controladores/         API pública y de administración
│   │   │       └── importacion/ cli/      carga inicial y repositorio:migrar, importar, crear-admin
│   │   └── test/                          pruebas e2e (supertest; las de MySQL con MYSQL_PRUEBAS)
│   └── web/                React 19 + React Router 8 + Vite 8
│       ├── principal/                       /principal en HTML puro (ver su LEEME.md)
│       │   ├── observatorio-bloque.html     EL BLOQUE: lo que se pega en WordPress
│       │   ├── index.html, pagina.css       la página alrededor del bloque (cabecera, pie, columna del tema)
│       │   └── plugin-vite.ts               inserta el bloque tal cual (desarrollo y compilación)
│       ├── public/sivu/edificiofinal.glb   modelo 3D (Draco)
│       ├── public/odes/                     plantilla de Sapiencia (kit/), avatar y miniaturas (portadas/)
│       ├── scripts/copiar-draco.mjs         copia el decodificador Draco de three
│       └── src/
│           ├── router.tsx                   rutas: /, /sivu/*, /odes/*, /repositorio/*, /tableros/*, /pai/*, /pertinencia/*, 404
│           ├── compartido/                  carga, errores y 404 comunes
│           ├── inicio/                      página de inicio
│           └── sites/
│               ├── sivu/                    SIVU: edificio en 3D y tableros
│               │   ├── visor/VisorEdificio.ts   motor three.js (sin React)
│               │   ├── componentes/             cabecera, bloque del edificio, barra, tableros, pie
│               │   ├── datos/tableros.ts        lista de tableros (editar aquí)
│               │   └── paginas/                 página de SIVU, 404 de SIVU
│               ├── odes/                    Asistente ODES (ver su LEEME.md)
│               │   ├── chat/                    protocolo, cliente SSE, estado de la conversación
│               │   ├── componentes/             burbujas, respuesta, citas, fuentes, campo de texto...
│               │   └── kit/                     carga la plantilla solo en esta rama
│               ├── repositorio/             Repositorio de Productos (ver su LEEME.md)
│               │   ├── busqueda/ filtros/       búsqueda difusa y filtros (port del bloque de WordPress v4.2)
│               │   ├── componentes/ paginas/    tarjeta, buscador, filtros de casillas, página pública, 404
│               │   └── admin/                   administración (otro chunk; ver admin/LEEME.md)
│               ├── tableros/                tableros del Observatorio (matrícula 2025 y batería de indicadores)
│               ├── pertinencia/             Medida de pertinencia (contenido: apps/web/pertinencia/pertinencia-bloque.html)
│               └── pai/                     Plan de Acción Institucional (ver su LEEME.md)
│                   ├── sesion/ componentes/     ingreso, cambio de contraseña, barra, modal del kit
│                   ├── tablero/ modales/ ficha/ tablero con filtros, casillas por bimestre, observaciones, evidencias, ficha
│                   └── admin/                   seguimiento, usuarios y asignaciones, bimestre, autorizaciones, registro
```

Cada paquete tiene su propio README: [`apps/server`](apps/server/README.md) y
[`apps/web`](apps/web/README.md).

## Requisitos

- **Node.js 24 LTS (24.15 o superior)**, que es la versión de despliegue
  (`.nvmrc`). En desarrollo, con nvm: `nvm install && nvm use`. El mínimo es
  **22.22.3** en la rama 22 o **24.15.0** en la 24, porque lo exigen las
  herramientas de compilación que instala `npm ci`: `@nestjs/cli` (a través
  de `@angular-devkit`) y `jsdom`. Con una versión fuera de esos rangos (un
  Node 24 anterior a 24.15, o una impar como Node 25), npm muestra avisos
  `EBADENGINE`. En desarrollo con Node 25 se pueden ignorar; en el servidor,
  use Node 24.15 o superior.
- npm 10 o superior (viene con Node).
- No hace falta instalar ninguna CLI global (`nest`, `vite`...).

## Scripts

Se ejecutan desde la raíz del proyecto:

| Comando             | Qué hace                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `npm run setup`     | Instala las dependencias de la raíz, `apps/server` y `apps/web`, y copia el decodificador Draco. |
| `npm run dev`       | Desarrollo: Nest en modo watch (:3000) y Vite con recarga en caliente (:5173), a la vez.  |
| `npm run build`     | Compila el front-end (`apps/web/dist`) y luego el servidor (`apps/server/dist`).          |
| `npm start`         | Producción: `node apps/server/dist/main.js` (requiere `npm run build` antes).             |
| `npm test`          | Pruebas del front-end (Vitest + Testing Library) y del servidor (unitarias y e2e).        |
| `npm run typecheck` | TypeScript en modo estricto en los dos paquetes.                                          |
| `npm run lint`      | oxlint en los dos paquetes. Falla también con advertencias.                               |
| `npm run odes:indexar` | Genera el índice del Asistente ODES desde la base del repositorio (o `-- --paquete <carpeta>` desde el paquete de datos). Ver [Generar o actualizar el índice](#generar-o-actualizar-el-índice). |
| `npm run odes:evaluar-busqueda` | Mide la calidad de la búsqueda del índice con los casos de `apps/server/datos/odes/evaluacion-busqueda.json`. |
| `npm run odes:probar -- "pregunta"` | Prueba el asistente desde la terminal contra la API real de Claude (necesita la clave). |
| `npm run repositorio:migrar -- --usuario <admin>` | Aplica el esquema MySQL del repositorio (`apps/server/db/repositorio/esquema.sql`) con una cuenta administradora. Idempotente. |
| `npm run repositorio:crear-admin -- --usuario <u> --nombre "..."` | Crea un administrador de `/repositorio/admin` (o le cambia la contraseña; `--desactivar` le quita el acceso). |
| `npm run repositorio:revision -- --archivo <revision.json> [--aplicar]` | Aplica (o, sin `--aplicar`, simula) una revisión de datos del repositorio en una transacción. |
| `npm run tableros:cargar-matricula` | Carga en la base los datos del tablero de matrícula (`apps/server/datos/tableros/matricula-2025/`). Ver [Tableros](#tableros-tableros). |
| `npm run tableros:cargar-fondos` | Carga en la base las cifras agregadas del tablero de los fondos (`apps/server/datos/tableros/fondos-2026/`). Ver [Tableros](#tableros-tableros). |
| `npm run pai:cargar-fichas -- [--archivo <ruta>] [--vigencia 2026] [--bimestre-abierto N\|cerrado] [--forzar] [--aceptar-renumeracion]` | Carga las fichas del PAI (estructura, metas e historial importado de los Excel) desde `apps/server/datos/pai/<vigencia>/pai-<vigencia>.json`. Se niega (código de salida 3) si la vigencia ya tiene datos del aplicativo, salvo `--forzar`, y si un código con datos del aplicativo cambia de nombre (códigos corridos), salvo `--aceptar-renumeracion`. Ver [PAI](#pai-pai). |
| `npm run pai:crear-usuario -- --usuario <u> --nombre "..." --rol administrador\|responsable` | Crea un usuario del PAI (el primer administrador; los demás se crean en `/pai/admin/usuarios`) o le cambia la contraseña. Opciones `--correo`, `--cargo`, `--temporal`, `--desactivar` y `--solo-sql` (SQL de Postgres con el hash, para Supabase). La contraseña se pide oculta o se lee de `PAI_USUARIO_CONTRASENA`. |
| `npm run pai:recolectar-evidencias` | Libera las fichas del almacén del PAI (`pai_almacen_archivos`) que ya no usa ninguna evidencia, con sus trozos, y, con Supabase, borra del bucket privado los objetos de evidencias huérfanos y las subidas directas vencidas o sin fila. No toca el almacén ni el bucket del repositorio. |
| `npm run repositorio:importar -- --paquete <carpeta> --miniaturas apps/web/public/odes/portadas` | Carga inicial (o actualización) desde el paquete de datos. Idempotente y reanudable; después de que la administración empezó a trabajar, no vuelve a crear lo borrado allí ni sobrescribe lo editado (ver [Comandos](#comandos)). |

Los scripts `odes:*`, `repositorio:*`, `tableros:*` y `pai:*` compilan antes el servidor
(`nest build`, que borra y rehace `apps/server/dist`): son para desarrollo.
En la VM, en la copia que está sirviendo el sitio, ejecútelos desde
`apps/server` con `sudo -u sapiencia node dist/repositorio/cli/<migrar|importar|crear-admin>.js ...`
o `sudo -u sapiencia node dist/odes/cli/indexar.js ...` (y `dist/pai/cli/<crear-usuario|cargar-fichas|recolectar-evidencias>.js`), que no recompilan
(`sudo -u sapiencia` porque `.env` solo lo lee ese usuario). Las rutas
relativas de las opciones se resuelven contra la carpeta desde la que se
ejecuta el comando.

Para agregar una dependencia, hay que instalarla en el paquete que la usa, por
ejemplo `npm install zod --prefix apps/server` o
`npm install @tanstack/react-query --prefix apps/web`.

## Desarrollo

```bash
nvm use
npm run setup
npm run dev
```

1. Abra **http://localhost:5173** (Vite). Hay recarga en caliente y las
   peticiones a `/api/*` se reenvían a Nest en http://localhost:3000. En el
   código del front-end, llame a la API siempre con rutas relativas, por
   ejemplo `fetch('/api/odes')`. Así funciona igual en desarrollo y en
   producción.
2. En desarrollo, http://localhost:3000 muestra el último build del front-end,
   o un 503 con instrucciones si todavía no se ha compilado. Para trabajar en
   React use siempre el puerto 5173.
3. React StrictMode está activo. En desarrollo el visor 3D se monta dos veces
   y el `.glb` se pide dos veces (la primera petición se cancela). Es normal.
   En producción el modelo se pide una sola vez.
4. `/repositorio` necesita una MySQL con datos. Sin ella, la página dice que
   el repositorio no está disponible por ahora; `/sivu` y `/odes`
   funcionan igual. Para tener una local y desechable, ver
   [Desarrollo y pruebas con una MySQL local](#desarrollo-y-pruebas-con-una-mysql-local).
5. `/pai` usa la misma base, con el esquema en la versión 5
   (`repositorio:migrar`), las fichas cargadas (`pai:cargar-fichas`) y al
   menos un usuario (`pai:crear-usuario`). Ver [PAI](#pai-pai).

`Ctrl+C` detiene los dos procesos.

## Producción (local)

```bash
npm run build
npm start          # PORT=3000 por defecto
```

El servidor atiende `/api/*` y sirve `apps/web/dist`:

| Petición                                               | Respuesta                                                                              |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `/principal` (también `/principal/`)                    | `principal/index.html`: el bloque de WordPress en HTML puro (`Cache-Control: no-cache` + ETag), con la CSP del sitio salvo `script-src`, que autoriza sus scripts en línea por hash. Sin compilar: 503 con instrucciones. |
| `/`, `/sivu[/...]`, `/odes[/...]`, `/repositorio[/...]`, `/tableros[/...]`, `/pai[/...]`, `/pertinencia[/...]` | `index.html` (`Cache-Control: no-cache` + ETag por contenido, sin `Last-Modified`: en Vercel todos los archivos tienen la misma fecha y un index nuevo mide lo mismo que el anterior). React Router resuelve la subruta. |
| `/tableros/bateria-indicadores/index.html` (la batería cuando era un tablero estático) | 301 a `/tableros/bateria-indicadores`. El navegador conserva el hash (`#/sa-fondo-epm?v=comunas`) y la SPA lo traduce a la ruta de la vista (`/tableros/bateria-indicadores/sa-fondo-epm?v=comunas`). Ver `REDIRECCIONES` en `apps/server/src/frontend/rutas-spa.ts`. |
| `/assets/*` (JS y CSS con hash en el nombre)           | `public, max-age=31536000, immutable`                                                  |
| `/sivu/edificiofinal.glb`, `/sivu/draco/*`, `/tableros/bateria-indicadores/datos/*` | `public, no-cache` + ETag calculado con el contenido. Si el archivo no cambió, la respuesta es un 304 sin cuerpo, aunque un build nuevo le haya cambiado la fecha. |
| Navegador en una ruta inexistente (`/otra`)             | 404 con `index.html`, para que React muestre su página "no encontrada".                 |
| Archivo inexistente (`/sivu/falta.glb`) o `fetch`/curl | 404 en texto plano. Nunca recibe HTML.                                                  |
| `Range` o `If-Match` que no se pueden cumplir           | 416 o 412 en texto plano con `Cache-Control: no-store`. No se registra en el log.        |
| Error al leer un archivo (permisos, disco)              | 500 en texto plano con `no-store`, sin detalles. El error, con la ruta, solo va al log.  |
| `/api/salud`                                           | `{"estado":"ok",...}`. Sirve como chequeo de salud para monitoreo o el balanceador.     |
| `/api/repositorio/*`                                   | Documentos y archivos desde MySQL. Ver [API del repositorio](#api). Sin base configurada o disponible: 503 JSON con `Retry-After`; el resto del sitio funciona igual. |
| `/api/pai/*`                                           | API del PAI (sesión propia con la cookie `pai_sesion`, `Path=/api/pai`). Todas las respuestas JSON llevan `no-store`. Sin base: 503 JSON con el mensaje del PAI y `Retry-After`. |

El `.glb` se envía sin gzip (ver la sección de nginx). JS, CSS, HTML, JSON y
wasm se comprimen con gzip o brotli.

## Variables de entorno

Todas son opcionales y están documentadas en
[`apps/server/.env.example`](apps/server/.env.example). Las del Asistente ODES
(`ANTHROPIC_API_KEY` y `ODES_*`) se explican en
[Variables del asistente](#variables-del-asistente), y las del Repositorio de
Productos (`REPOSITORIO_*`, la conexión a MySQL) en
[Variables del repositorio](#variables-del-repositorio). El PAI usa esa misma
base y las mismas variables de sesión, más `PAI_SUPABASE_BUCKET` (bucket
privado de las evidencias) y, solo para la CLI, `PAI_USUARIO_CONTRASENA` (ver
[PAI](#pai-pai)). Para usarlas, copie ese
archivo a `apps/server/.env`, que git ignora. Las variables del entorno real
(systemd, pm2) tienen prioridad sobre el archivo.

| Variable              | Por defecto     | Para qué                                                                                   |
| --------------------- | --------------- | ------------------------------------------------------------------------------------------ |
| `NODE_ENV`            | `development`   | Póngala en `production` en el servidor.                                                    |
| `PORT`                | `3000`          | Puerto HTTP.                                                                               |
| `HOST`                | `0.0.0.0`       | Interfaz de escucha. Detrás de nginx en la misma máquina, use `127.0.0.1`.                 |
| `WEB_DIST_DIR`        | `apps/web/dist` | Carpeta del build de React. Una ruta relativa se resuelve contra `apps/server`.            |
| `CSP_FRAME_ANCESTORS` | `'self'`        | Quién puede incrustar el sitio en un `<iframe>`, por ejemplo el WordPress de Sapiencia.    |
| `TRUST_PROXY`         | vacío           | Confianza en `X-Forwarded-*`. Con nginx en la misma máquina, use `loopback`.               |

En el archivo `.env`, escriba los valores con comillas **dobles**, por ejemplo
`CSP_FRAME_ANCESTORS="'self' https://www.sapiencia.gov.co"`. Use comillas
rectas (`'self'`), no tipográficas (`‘self’`, frecuentes al copiar de Word,
Google Docs o un PDF), y escriba los dominios con tildes o en otro alfabeto en
punycode (`https://xn--...`). Si no, el servidor no arranca y explica el error.

### Seguridad (CSP)

helmet envía una Content-Security-Policy estricta
(`apps/server/src/seguridad/opciones-helmet.ts`): todo debe venir del mismo
origen, con las excepciones mínimas que necesita three.js:

- `'wasm-unsafe-eval'` para el decodificador Draco en WebAssembly.
- `worker-src blob:` para el Worker de Draco.
- `blob:` en `img-src` y `connect-src` para las texturas del `.glb`.

Por eso three.js y Draco se sirven desde el propio servidor y no desde un CDN.
Lo mismo vale para `/odes` y `/repositorio`: la plantilla de Sapiencia, las
fuentes, los logos y el worker de pdf.js se sirven desde `apps/web/dist`, y los
documentos, portadas y miniaturas desde `/api/repositorio/*` (la base de
datos). El navegador solo habla con el propio servidor (la API de Claude y
MySQL los llama el servidor, no el navegador). Los tableros de Power BI y las
entradas de blog son enlaces externos que se abren en otra pestaña.
`/principal` es la excepción a "todo desde el mismo origen" solo en un
punto: su `script-src` admite, además de `'self'`, el hash `sha256` de cada
script en línea de esa página (el JavaScript del bloque de WordPress). El
servidor calcula los hashes sobre el archivo que envía, así que no hace falta
`'unsafe-inline'` (ver `apps/server/src/frontend/pagina-principal.ts`).

El PAI no agrega dominios: con Supabase, la subida directa de una evidencia
va al origen de `REPOSITORIO_SUPABASE_URL` (que ya está en `connect-src`) y
la descarga es una navegación a una URL firmada de 60 s, que la CSP no
limita.

Si un sitio necesita recursos de otro dominio (Google Fonts, una API externa,
mapas, analítica), hay que agregar ese dominio a la directiva correspondiente
en ese archivo. Si no, el navegador lo bloquea y lo informa en la consola.

## Despliegue en una VM Linux

El ejemplo usa Ubuntu/Debian, el usuario `sapiencia`, la carpeta
`/opt/sapiencia-web` y el dominio `sivu.ejemplo.gov.co`. Ajústelos a su caso.

### 1. Node 24 y el código

Instale Node desde NodeSource, como en el ejemplo, y no con nvm: los pasos
siguientes (`sudo -u sapiencia npm ...`, `ExecStart=/usr/bin/node` en systemd
y `sudo npm install -g pm2`) suponen que `node` y `npm` están en `/usr/bin`.
nvm los instala en la carpeta personal del usuario, fuera del `PATH` de
`sudo` y de systemd.

```bash
# Node 24 LTS desde NodeSource (deja node y npm en /usr/bin)
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx
node -v        # debe ser v24.15.0 o superior

sudo useradd --system --create-home --shell /usr/sbin/nologin sapiencia
sudo mkdir -p /opt/sapiencia-web && sudo chown sapiencia: /opt/sapiencia-web
sudo -u sapiencia git clone <URL-DEL-REPOSITORIO> /opt/sapiencia-web
cd /opt/sapiencia-web

# Instalación reproducible (respeta los package-lock.json) y compilación
sudo -u sapiencia npm ci
sudo -u sapiencia npm ci --prefix apps/server
sudo -u sapiencia npm ci --prefix apps/web
sudo -u sapiencia npm run build

# Herramientas del indexador del Asistente ODES (botón "Reindexar" de
# /repositorio/admin). El servidor web no las usa para servir páginas.
sudo apt-get install -y poppler-utils tesseract-ocr tesseract-ocr-spa unzip
```

La base de datos del repositorio (Cloud SQL) se prepara una sola vez: ver
[Instalación en Cloud SQL](#instalación-en-cloud-sql-paso-a-paso). El índice
del Asistente ODES (`apps/server/datos/odes/indice.sqlite`, no va en git) se
genera después con "Reindexar" en `/repositorio/admin/asistente`, con
`sudo -u sapiencia node dist/odes/cli/indexar.js` desde `apps/server`, o se
copia desde otra máquina (ver [Asistente ODES > Despliegue](#despliegue)).

Configuración (`/opt/sapiencia-web/apps/server/.env`):

```ini
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
TRUST_PROXY=loopback
CSP_FRAME_ANCESTORS="'self'"
# Asistente ODES: sin esta línea funciona en modo búsqueda (sin IA).
# ANTHROPIC_API_KEY=sk-ant-...

# Repositorio de Productos: MySQL de Cloud SQL con el usuario de la aplicación.
REPOSITORIO_MYSQL_HOST=<IP pública de Cloud SQL>
REPOSITORIO_MYSQL_USER=repositorio_app
REPOSITORIO_MYSQL_PASSWORD='<contraseña de permisos.sql>'
REPOSITORIO_MYSQL_DATABASE=repositoriobd
REPOSITORIO_MYSQL_SSL_CA=/etc/sapiencia/cloudsql-server-ca.pem
```

`.env` tiene contraseñas: déjelo legible solo por el servicio
(`sudo chown sapiencia: apps/server/.env && sudo chmod 600 apps/server/.env`).

**Los comandos de la VM se ejecutan como `sapiencia`.** Con `.env` en `600`,
otro usuario (por ejemplo `ubuntu`) no lo puede leer: las CLI
(`migrar`, `crear-admin`, `importar`, `indexar`, `probar-chat`) se corren
siempre con `sudo -u sapiencia node dist/...`, como en esta guía. Si se
olvida, el comando termina explicando que `.env` existe pero no se puede
leer. Tampoco las corra como `root`: dejarían archivos de `root` en
`apps/server/datos/odes/` (`indice.sqlite`, `cache/`, el cerrojo) que el
servicio después no puede reemplazar. Las formas `npm run …` son para
desarrollo: recompilan `dist/` (`nest build` lo borra y lo rehace) y no se
usan en la copia que sirve el sitio.

Permita el tráfico de salida de la VM hacia `api.anthropic.com:443` (HTTPS,
la API de Claude) y hacia la IP de Cloud SQL en el puerto `3306` si hay un
firewall o un proxy de salida.

### 2a. Servicio con systemd (recomendado)

`/etc/systemd/system/sapiencia-web.service`:

```ini
[Unit]
Description=sapiencia-web (NestJS: /sivu y /odes)
After=network.target

[Service]
Type=simple
User=sapiencia
WorkingDirectory=/opt/sapiencia-web/apps/server
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --enable-source-maps dist/main.js
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sapiencia-web
sudo systemctl status sapiencia-web
journalctl -u sapiencia-web -f        # registros
curl -s http://127.0.0.1:3000/api/salud
```

El servidor se apaga de forma ordenada con SIGTERM. Si la configuración es
inválida (por ejemplo `PORT=abc` o comillas tipográficas en
`CSP_FRAME_ANCESTORS`) o el puerto está ocupado, lo registra y termina con
código 1.

### 2b. Alternativa con pm2

El paquete del servidor es ESM, así que el archivo de pm2 debe terminar en
`.cjs`. Cree `/opt/sapiencia-web/apps/server/ecosystem.config.cjs`:

```js
module.exports = {
  apps: [
    {
      name: 'sapiencia-web',
      cwd: __dirname,
      script: 'dist/main.js',
      node_args: '--enable-source-maps',
      exec_mode: 'fork',
      env: { NODE_ENV: 'production' },
    },
  ],
};
```

```bash
sudo npm install -g pm2
sudo -u sapiencia pm2 start /opt/sapiencia-web/apps/server/ecosystem.config.cjs
sudo -u sapiencia pm2 save
sudo env PATH=$PATH pm2 startup systemd -u sapiencia --hp /home/sapiencia
```

### 3. nginx como proxy inverso

`/etc/nginx/sites-available/sapiencia-web`, enlazado en `sites-enabled/`:

```nginx
upstream sapiencia_web {
    server 127.0.0.1:3000;
    keepalive 16;
}

server {
    listen 80;
    listen [::]:80;
    server_name sivu.ejemplo.gov.co;

    # El chat de ODES envía la conversación en JSON (Nest acepta hasta
    # 512 kB); 1 MB alcanza. Los archivos de la administración del
    # repositorio tienen su propio límite (location de más abajo).
    client_max_body_size 1m;

    # Compresión. Nest ya comprime JS/CSS/HTML/JSON/wasm y nginx no vuelve a
    # comprimir lo que ya llega comprimido; esto cubre lo que sirva nginx.
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/javascript application/javascript
               application/json image/svg+xml application/wasm;
    # model/gltf-binary queda fuera a propósito: el .glb ya viene comprimido
    # (Draco + texturas webp), gzip solo le quita un 10 % (10,7 MB -> 9,6 MB)
    # a costa de CPU en cada descarga, y sin Content-Length el visor ya no
    # puede mostrar el porcentaje de carga (muestra "Cargando..." sin cifra).
    # Si se prefiere ahorrar ese 10 %, agregue model/gltf-binary a gzip_types.

    # Caché: Nest ya envía las cabeceras correctas y nginx las respeta:
    #   /assets/*   public, max-age=31536000, immutable  (nombres con hash)
    #   .glb, draco public, no-cache + ETag por contenido (revalida: 304 si no cambió)
    #   index.html  no-cache
    location / {
        proxy_pass http://sapiencia_web;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Chat del Asistente ODES: respuesta en streaming (Server-Sent Events).
    # Nest ya envía "X-Accel-Buffering: no" (nginx no acumula la respuesta),
    # "Cache-Control: no-transform" (nadie la comprime) y un comentario
    # ": ping" cada 15 s. proxy_buffering off lo deja explícito, y el tiempo
    # de lectura debe superar ODES_TIMEOUT_SEGUNDOS (120 s por defecto).
    location = /api/odes/chat {
        proxy_pass http://sapiencia_web;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 180s;
        gzip off;
    }

    # Administración del repositorio: subida de archivos (hasta 80 MB, el
    # límite de Nest) y de portadas. Sin este bloque nginx responde 413 a
    # cualquier archivo de más de 1 MB.
    location /api/repositorio/admin/ {
        client_max_body_size 85m;
        client_body_timeout 300s;
        proxy_pass http://sapiencia_web;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # PAI: evidencias en multipart (hasta 25 MB, el límite de Nest). Sin este
    # bloque nginx responde 413 a cualquier evidencia de más de 1 MB.
    location /api/pai/ {
        client_max_body_size 26m;
        client_body_timeout 120s;
        proxy_pass http://sapiencia_web;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
    }

    # Opcional: que nginx sirva directamente desde el disco los bundles
    # inmutables (nombres con hash), sin pasar por Node.
    # No haga lo mismo con el .glb ni con /sivu/draco/: nginx arma el ETag
    # con la fecha y el tamaño del archivo, la fecha cambia en cada build y
    # los visitantes volverían a bajar los 10,7 MB del modelo después de cada
    # despliegue. Nest calcula ese ETag con el contenido.
    location /assets/ {
        root /opt/sapiencia-web/apps/web/dist;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        add_header X-Content-Type-Options "nosniff" always;
        try_files $uri =404;

        # El worker de pdf.js (portada automática de /repositorio/admin) es un
        # .mjs y se abre como módulo: el navegador exige un tipo JavaScript.
        # El mime.types de nginx no conoce .mjs y lo serviría como
        # application/octet-stream (la portada no se generaría). Las dos
        # add_header se repiten porque nginx no las hereda a un nivel que
        # declara las suyas. No use un bloque types { } aquí ni en server:
        # reemplazaría todo el mapa y css y js también saldrían mal.
        location ~ \.mjs$ {
            default_type text/javascript;
            add_header Cache-Control "public, max-age=31536000, immutable" always;
            add_header X-Content-Type-Options "nosniff" always;
            try_files $uri =404;
        }
    }
}
```

Si no usa el bloque opcional de `/assets/`, no hace falta nada de esto: Nest
ya sirve esos archivos con la caché inmutable y el tipo correcto
(`text/javascript` para el `.mjs`).

```bash
sudo ln -s /etc/nginx/sites-available/sapiencia-web /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### 4. HTTPS

Con un dominio público, use Let's Encrypt:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d sivu.ejemplo.gov.co --redirect
```

certbot agrega el bloque `listen 443 ssl`, los certificados, la redirección
de http a https y la renovación automática. Con un certificado de la entidad,
el bloque equivale a esto:

```nginx
server {
    listen 80;
    server_name sivu.ejemplo.gov.co;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    http2 on;          # nginx >= 1.25.1; en versiones anteriores: listen 443 ssl http2;
    server_name sivu.ejemplo.gov.co;
    ssl_certificate     /etc/ssl/certs/sapiencia.crt;
    ssl_certificate_key /etc/ssl/private/sapiencia.key;
    # ... el resto igual que el bloque de la sección 3 (gzip, location /, ...)
}
```

Detrás de HTTPS, Nest envía `Strict-Transport-Security` (un año, sin
`includeSubDomains`, para no afectar otros subdominios de la entidad). Mantenga
`TRUST_PROXY=loopback` para que Nest vea el protocolo real y la IP de cada
visitante (los límites del chat y el bloqueo de inicio de sesión de la
administración cuentan por IP). En una red interna sin TLS el sitio funciona
por http plano: la CSP no incluye `upgrade-insecure-requests` a propósito,
pero la cookie de la administración lleva `Secure` en producción y el
navegador no la guarda por http; en ese caso agregue
`REPOSITORIO_COOKIE_SEGURA=false` al `.env` (ver
[Seguridad del repositorio](#seguridad-del-repositorio)).

### Actualizar una versión desplegada

```bash
cd /opt/sapiencia-web
sudo -u sapiencia git pull
sudo -u sapiencia npm ci && sudo -u sapiencia npm ci --prefix apps/server && sudo -u sapiencia npm ci --prefix apps/web
sudo -u sapiencia npm run build
# Si la versión nueva trae cambios de esquema (lo dirá la nota de la versión;
# es idempotente, se puede correr siempre), DESPUÉS de npm run build y ANTES de
# reiniciar. Este código exige el esquema 6: migrar aplica el PAI (003) si
# falta, renombra las tablas (ver "Paso a la versión 4" en
# apps/server/db/repositorio/LEEME.md), crea las de la subida por partes
# (005) y agrega la descripción de los productos (006); sin migrar, toda la API de la base
# (repositorio, tableros y PAI) responde 503. En MySQL la cuenta necesita DROP.
#   cd apps/server && sudo -u sapiencia node dist/repositorio/cli/migrar.js --usuario <cuenta_admin>
sudo systemctl restart sapiencia-web        # o: sudo -u sapiencia pm2 reload sapiencia-web
```

`git pull` y `npm run build` no tocan la base de datos del repositorio ni
`apps/server/datos/odes/indice.sqlite` (está en `.gitignore`). Para actualizar solo el índice no hace falta
reiniciar: copie el archivo nuevo a la misma carpeta con otro nombre y
renómbrelo encima del actual (el cambio es atómico y el servidor lo recarga
solo en menos de un minuto):

```bash
sudo -u sapiencia cp indice.sqlite /opt/sapiencia-web/apps/server/datos/odes/indice.nuevo
sudo -u sapiencia mv /opt/sapiencia-web/apps/server/datos/odes/indice.nuevo \
                     /opt/sapiencia-web/apps/server/datos/odes/indice.sqlite
```

Si alguien tiene la página abierta durante una actualización y su pestaña pide
un chunk que ya no existe, la rama avisa que el sitio pudo haberse actualizado
y ofrece "Recargar la página".

### Lista de comprobación del despliegue

1. Node 24.15+, `npm ci` en la raíz, `apps/server` y `apps/web`, y `npm run build`.
2. `apps/server/.env` (permisos `600`, del usuario `sapiencia`) con
   `NODE_ENV=production`, `HOST=127.0.0.1`, `TRUST_PROXY=loopback` y, si se
   usa, `ANTHROPIC_API_KEY`. Las CLI se corren con `sudo -u sapiencia`.
3. Repositorio:
   1. TI ejecutó `permisos.sql` y `esquema.sql` en Cloud SQL.
   2. La IP de la VM está en las redes autorizadas.
   3. `server-ca.pem` está en la VM.
   4. `REPOSITORIO_MYSQL_*` está en `.env`.
   5. Hay al menos un administrador (`crear-admin`).
   6. Se hizo la carga inicial (`importar`). Ver
      [Instalación en Cloud SQL](#instalación-en-cloud-sql-paso-a-paso).
   7. El esquema está en la versión 5 (`migrar`, que aplica de la 002 a la 005).
   8. PAI: fichas cargadas (`dist/pai/cli/cargar-fichas.js`) y el primer
      administrador creado (`dist/pai/cli/crear-usuario.js`). Ver [PAI](#pai-pai).
4. Herramientas del indexador en la VM (`poppler-utils tesseract-ocr
   tesseract-ocr-spa unzip`) y el índice del Asistente ODES generado con
   "Reindexar".
5. systemd (o pm2) y nginx con los bloques del chat
   (`location = /api/odes/chat`), de la administración
   (`location /api/repositorio/admin/`, `client_max_body_size 85m`) y del PAI
   (`location /api/pai/`, `client_max_body_size 26m`).
6. HTTPS con certbot o el certificado de la entidad. Sin HTTPS:
   `REPOSITORIO_COOKIE_SEGURA=false`.
7. Salida permitida hacia `api.anthropic.com:443` y hacia Cloud SQL
   (`3306`).
8. Comprobar:
   1. `curl -s http://127.0.0.1:3000/api/salud`.
   2. `curl -s http://127.0.0.1:3000/api/repositorio/documentos | head -c 120`
      dice `"total":372`.
   3. `/repositorio` busca y descarga.
   4. `/repositorio/admin` deja entrar.
   5. `/odes/chat` (tras «Ingresar» en `/odes`) enlaza a `/api/repositorio/documentos/<id>/ver`.
   6. `curl -s http://127.0.0.1:3000/api/pai/vigencia` responde 401 JSON (no
      503) y `/pai` deja entrar al administrador.
9. Copias automáticas y recuperación a un momento dado activadas en Cloud
   SQL.

## Despliegue en Vercel + Cloud SQL

Es la otra forma de publicar el sitio, sin VM: Vercel sirve el front-end y
corre NestJS como una función. La base es la MySQL 8.0.18 de Cloud SQL de
Sapiencia (instancia `sapiencia-sis-prod:odes-chikita`, 35.202.252.42), en la
base `planeacionbd`, la misma de la encuesta de expectativas: sus tablas
(`cedulas`, `claves`, `intentos_validacion`, `respuestas`) no se tocan, y las
de este sitio llevan el prefijo de su módulo. Todos los archivos (documentos,
portadas, miniaturas y evidencias del PAI) van dentro de la base, en trozos de
1 MB. Así está https://sapiencia-web.vercel.app desde el 9 de noviembre de
2026, con los 372 documentos del repositorio (1.041 archivos, 482 MB).

Hasta entonces usaba Supabase (Postgres y Storage). Sus datos se copiaron con
los mismos ids y cada archivo se comprobó por su sha256. El despliegue ya no
usa Supabase. El código todavía acepta Postgres y Supabase Storage
(`REPOSITORIO_POSTGRES_URL`, `REPOSITORIO_SUPABASE_*`), pero no hace falta
configurarlos.

```
navegador ──► Vercel
               ├─ CDN: apps/web/dist (JS, CSS, fuentes, imágenes, modelo 3D)
               └─ función servidor (NestJS: /api/*, las páginas de la SPA y /principal)
                    ├─ índice del Asistente ODES (SQLite, dentro de la función)
                    └─► Cloud SQL (MySQL 8.0.18), base planeacionbd, cuenta sapiencia_web (TLS)
                          ├── repositorio_*: documentos, administración, archivos en trozos
                          ├── sivu_*: tableros; pai_*: PAI, con sus evidencias en trozos
                          └── cedulas, claves, …: la encuesta de expectativas (no se tocan)
```

Lo que cambia frente a la VM:

- **Una cuenta propia con permisos por tabla.** `sapiencia_web`@`%` tiene
  `SELECT`, `INSERT`, `UPDATE` y `DELETE` solo sobre las 39 tablas de este
  sitio, y exige TLS (`REQUIRE SSL`). No ve las tablas de la encuesta. Por
  eso, cada tabla nueva de una migración necesita su `GRANT` (ver "Subidas por
  partes (versión 5)" en `apps/server/db/repositorio/LEEME.md`).
- **TLS.** Con `REPOSITORIO_MYSQL_SSL=requerido` la conexión va cifrada, pero
  no se verifica el certificado del servidor: Cloud SQL no manda su CA. Para
  verificarlo, descargue `server-ca.pem` de la consola de Google Cloud (Cloud
  SQL > odes-chikita > Conexiones > Seguridad), póngalo en el despliegue (no es
  secreto) y use `REPOSITORIO_MYSQL_SSL=verificar-ca` con
  `REPOSITORIO_MYSQL_SSL_CA` apuntando al archivo.
- **Red.** La instancia acepta conexiones desde la IP de la función de Vercel,
  que no es fija. Lo que la protege es la cuenta: clave larga, TLS obligatorio
  y permisos solo sobre las tablas de este sitio.
- **Los archivos salen de la base.** `/ver`, `/descargar`, `/portada` y
  `/miniatura` los envía la función con streaming y admiten rangos.
- **Los archivos grandes se suben por partes.** En Vercel una petición no puede
  llevar más de 4,5 MB. La administración y el PAI mandan cada archivo de más
  de 4 MiB en partes de 4 MiB. Las partes esperan en la base
  (`repositorio_subida_partes`, `pai_subida_partes`) y el servidor arma el
  archivo cuando llega la última (`apps/server/src/repositorio/archivos/subidas-por-partes.ts`).
- **La conexión a la base se verifica dentro de cada petición.** Vercel
  congela la función entre peticiones, y lo que quede en segundo plano se
  detiene a medias. Por eso, con `VERCEL=1`:
  - la primera petición que usa la base abre la conexión y la espera;
  - después de un fallo reintenta la siguiente petición, no un temporizador;
  - si el pool lleva más de 10 s sin uso se cambia por uno nuevo, porque sus
    conexiones pudieron cortarse mientras la función estaba congelada.
- **El índice del Asistente ODES viaja dentro del despliegue**, en solo
  lectura: la administración no puede reindexar en Vercel. Para actualizarlo,
  se reindexa en un equipo y se vuelve a desplegar.
- `npm run build:vercel` (`scripts/vercel/construir.mjs`) arma
  `.vercel/output` con la [Build Output API](https://vercel.com/docs/build-output-api):
  los estáticos van a la CDN y lo demás a una sola función con las
  dependencias de producción. Nunca incluye `apps/server/.env`.

### Paso a paso

1. **Esquema (versión 5).** Con una cuenta administradora de la instancia y
   `REPOSITORIO_MYSQL_HOST`, `REPOSITORIO_MYSQL_DATABASE=planeacionbd` y
   `REPOSITORIO_MYSQL_SSL=requerido` en el entorno:
   `npm run repositorio:migrar -- --usuario <cuenta_admin>`. Pide la contraseña
   y aplica `esquema.sql` y las migraciones 002 a 005. A mano: corra con
   `mysql --default-character-set=utf8mb4` `apps/server/db/repositorio/esquema.sql`
   y `migraciones/002` a `005`, en orden y cada archivo completo. Luego
   registre las versiones:
   `INSERT IGNORE INTO sistema_esquema_version (version, descripcion) VALUES (2, 'tablero-matricula'), (3, 'pai'), (4, 'nombres-por-modulo'), (5, 'subidas-por-partes');`
2. **Cuenta de la aplicación.** Con la cuenta administradora:
   ```sql
   CREATE USER 'sapiencia_web'@'%' IDENTIFIED BY '<clave larga y aleatoria>' REQUIRE SSL;
   -- Genera un GRANT por cada tabla de este sitio; ejecute lo que devuelve.
   SELECT CONCAT('GRANT SELECT, INSERT, UPDATE, DELETE ON planeacionbd.`', table_name, '` TO ''sapiencia_web''@''%'';')
     FROM information_schema.tables
    WHERE table_schema = 'planeacionbd' AND table_name REGEXP '^(repositorio|sivu|pai|sistema)_';
   ```
3. **Datos.** Con `REPOSITORIO_MYSQL_*` en el entorno:
   - `npm run repositorio:importar -- --paquete <carpeta> --miniaturas apps/web/public/odes/portadas`
     guarda los documentos y sus archivos;
   - `npm run tableros:cargar-matricula` y `npm run tableros:cargar-fondos` cargan los tableros;
   - `npm run pai:cargar-fichas` carga el PAI;
   - `npm run repositorio:crear-admin` y `npm run pai:crear-usuario` crean los
     administradores.
4. **Índice del Asistente ODES.** `npm run odes:indexar -- --paquete <carpeta>`,
   o con `--fuente mysql` contra la base. El índice va en
   `apps/server/datos/odes/indice.sqlite`, y con `--indice` se elige otro.
5. **Vercel.** Ejecute `vercel link` una vez y cargue las variables de la
   tabla de abajo (Settings > Environment Variables, Production). Luego:
   ```bash
   npm run build:vercel -- --indice apps/server/datos/odes/indice.sqlite
   vercel deploy --prebuilt --prod
   ```

Variables del proyecto en Vercel:

| Variable | Valor | ¿Secreta? |
| --- | --- | --- |
| `REPOSITORIO_MYSQL_PASSWORD` | Clave de `sapiencia_web` | **Sí** |
| `ANTHROPIC_API_KEY` | Clave de Claude para el Asistente ODES. Sin ella funciona en modo búsqueda | **Sí** |
| `REPOSITORIO_MYSQL_HOST` | `35.202.252.42` | No |
| `REPOSITORIO_MYSQL_PORT` | `3306` | No |
| `REPOSITORIO_MYSQL_USER` | `sapiencia_web` | No |
| `REPOSITORIO_MYSQL_DATABASE` | `planeacionbd` | No |
| `REPOSITORIO_MYSQL_SSL` | `requerido` (o `verificar-ca`, con la CA; ver arriba) | No |
| `REPOSITORIO_MYSQL_CONEXIONES` | `3` (cada instancia de la función abre las suyas) | No |
| `ODES_URL_DOCUMENTO` | `/api/repositorio/documentos/{id}/ver`, para que las citas del asistente abran la copia propia | No |
| `NODE_ENV` | `production` | No |
| `TRUST_PROXY` | `1` (Vercel pone la IP real del visitante en `X-Forwarded-For`) | No |

Las variables solo se aplican a los despliegues nuevos. Después de cambiar
una, vuelva a desplegar con `vercel deploy --prebuilt --prod`. Los registros
de la función se ven con `vercel logs <url>` o en el panel de Vercel.

## Tableros (`/tableros`)

Tableros de información del Observatorio, con la plantilla de Sapiencia. Los
dos llegaron como tableros estáticos (un `index.html` que cargaba React, Babel
y ECharts en el navegador) y hoy son rutas de la SPA, con la cabecera y el pie
azules de esos tableros (`CabeceraAzul` y `PieAzul`); el resto de la rama
lleva los del sitio. El de matrícula se abre desde la sección "Tableros de
información" de `/sivu` (`apps/web/src/sites/sivu/datos/tableros.ts`) y la
batería, desde la puerta del edificio. Ver `apps/web/src/sites/tableros/LEEME.md`.
Los tableros de pertinencia (`apps/web/public/tableros/pertinencia` y
`medida-pertinencia`) siguen estáticos, con `/pertinencia`.

**`/tableros/matricula-2025`: matrícula en educación superior en Medellín
(2025).** Es el tablero estático de `Octubre/tablero_educ_sup_2025` traído al
aplicativo:

- **Front-end** (`apps/web/src/sites/tableros/`): `matricula/TableroMatricula.tsx`
  es su `js/dashboard.jsx` casi sin cambios (React y ECharts 5.6 importados en
  vez de globales; ya no se transpila en el navegador con Babel, que la CSP no
  permitiría). `PaginaMatricula.tsx` pide los datos a la API, los deja en
  `window.ODES` como los dejaban `datos/*.js` y solo entonces importa el
  tablero. ECharts y el tablero van en su propio chunk. La cabecera y el pie
  son los del tablero estático (azul `#0E5074`, `CabeceraAzul` y `PieAzul`);
  sus estilos, los de `index.html`, van en `tablero-matricula.css` bajo
  `:where(.tablero-matricula)`.
- **Datos en la base** (migración 002, MySQL y Postgres): `sivu_tableros`, el
  catálogo de los tableros (título y textos de `definiciones.js`, en JSON), y
  las tablas propias de este tablero, que llevan su nombre
  (`sivu_tablero_<tablero>_<tabla>`): `sivu_tablero_matricula_2025_meta`,
  `sivu_tablero_matricula_2025_categorias`, `sivu_tablero_matricula_2025_ies`,
  `sivu_tablero_matricula_2025_programas` y `sivu_tablero_matricula_2025_filas`
  (las dimensiones y las filas de `matricula.js`, cada una con su posición).
  Un tablero nuevo crea las suyas con el mismo patrón (ver "Tablas" en
  `apps/server/db/repositorio/LEEME.md`). `GET /api/sivu/tableros/matricula-2025`
  arma con ellas el mismo objeto que traía `matricula.js` (con
  `Cache-Control: no-cache` y ETag); una prueba de ida y vuelta comprueba que
  sale idéntico al archivo.
- **Cargar o actualizar los datos.** Con el ETL del tablero se genera
  `datos/matricula.js` desde la base del SNIES; se copia en
  `apps/server/datos/tableros/matricula-2025/` (o se pasa con `--matricula`) y:
  ```bash
  npm run repositorio:migrar          # esquema versión 7 (aplica de la 002 a la 007; el servidor la exige)
  npm run tableros:cargar-matricula   # reemplaza los datos, en una transacción
  ```
  En Supabase la carga inicial se hizo por la API, con un permiso temporal de
  inserción que se quitó al terminar; también puede hacerse con este comando
  y `REPOSITORIO_POSTGRES_URL` en el entorno. Los textos de la bienvenida y de
  las fuentes (`definiciones.js`) van en `sivu_tableros.definiciones`: el mismo
  comando los reemplaza, y el servidor los toma cuando cambia
  `sivu_tableros.actualizado_en` (guarda el JSON en memoria según esa fecha).

**`/tableros/fondos-2026`: beneficiarios de los fondos de Sapiencia (2026).**
Tablero nuevo, hecho con las mismas piezas visuales del de matrícula, sobre las
cifras del Power BI de seguimiento de los fondos (que es una consulta por
persona: aquí solo se publican totales).

- **Datos agregados, sin personas.** `apps/server/datos/tableros/fondos-2026/etl_fondos.py`
  lee el `.pbix` y escribe `fondos.json`: beneficios por programa, convocatoria,
  periodo y estado; giros por programa y periodo; el estado actual de cada
  convocatoria; y sexo, comuna e institución solo de los beneficios activos,
  cada uno por separado (nunca se cruzan con el estado). Los textos van en
  `definiciones.json`. El fondo del Consejo Distrital de Juventud queda fuera
  por tener muy pocos beneficios.
  ```bash
  uv run --with pbixray --with pyarrow python apps/server/datos/tableros/fondos-2026/etl_fondos.py <Tablero.pbix> apps/server/datos/tableros/fondos-2026/fondos.json
  npm run repositorio:migrar          # versión 7: crea sivu_tablero_fondos_2026_*
  npm run tableros:cargar-fondos      # reemplaza los datos, en una transacción
  ```
- **Base** (migración 007, MySQL y Postgres): `sivu_tablero_fondos_2026_meta`,
  `_programas`, `_categorias`, `_estados`, `_giros`, `_cohortes`, `_activos` y
  `_destinos`. `GET /api/sivu/tableros/fondos-2026` devuelve el mismo objeto de
  `fondos.json` (prueba de ida y vuelta en `test/tableros.e2e-spec.ts`).
- **Varios tableros en la misma ruta.** `GET /api/sivu/tableros/:id` sirve a
  todos: cada tablero se registra en `apps/server/src/sivu/tableros/tableros.service.ts`
  (cómo leer sus tablas y el mensaje cuando no tiene datos), con su caché en
  memoria por id.

**`/tableros/bateria-indicadores`: batería de indicadores de educación
postsecundaria.** Es el tablero estático `tablero_bateria_indicadores` (la
ventanilla «Batería de indicadores OdeS 2022» de Power BI rehecha en web)
traído al aplicativo del mismo modo que el de matrícula:

- **Front-end** (`apps/web/src/sites/tableros/bateria/`): `TableroBateria.tsx`
  es su `js/dashboard.jsx` casi sin cambios (React, ECharts 5.6 y KaTeX
  importados; KaTeX solo se descarga al mostrar una fórmula del catálogo).
  Cada vista tiene su dirección (`/tableros/bateria-indicadores/<vista>?v=<variante>`,
  antes `index.html#/<vista>?v=<variante>`, que se traduce sola).
  `PaginaBateria.tsx` carga los datos base y solo entonces importa el tablero.
- **Datos en archivos**, no en la base: los genera el ETL del tablero (fuera
  de este repositorio) y se copian en
  `apps/web/public/tableros/bateria-indicadores/datos/` (`definiciones.js`,
  `vistas.js`, `geo.js` y `v/<vista>.js`, unos 36 MB, que el tablero pide
  vista por vista). Ver `apps/web/src/sites/tableros/bateria/LEEME.md`.

## PAI (`/pai`)

El **Plan de Acción Institucional** es el plan anual de Sapiencia: cada
proceso o proyecto (ficha F-ES-DE-003) tiene acciones, cada acción tiene
indicadores y cada indicador tiene metas por bimestre (Bimestre 1 =
enero–febrero … 6 = noviembre–diciembre). `/pai` reemplaza la recolección
en Excel: los responsables reportan el avance de cada bimestre y Planeación
hace el seguimiento. Detalles de la interfaz en
[`apps/web/src/sites/pai/LEEME.md`](apps/web/src/sites/pai/LEEME.md) y de
los datos de partida en [`apps/server/datos/pai/2026/LEEME.md`](apps/server/datos/pai/2026/LEEME.md).

**Roles.**

- **Responsable:** ve y reporta solo los indicadores que le asignaron
  (un proceso completo o indicadores sueltos), y solo en el bimestre abierto
  o en uno para el que tenga una autorización vigente.
- **Administrador (Planeación):** ve todo, en solo lectura sobre los
  reportes; gestiona usuarios y asignaciones, abre y cierra el bimestre (con
  fecha límite opcional), otorga y revoca autorizaciones, consulta el
  registro de cambios y exporta a CSV.

Todas las reglas se aplican en el servidor (`apps/server/src/pai/dominio/reglas-edicion.ts`):
la interfaz solo muestra las banderas `editable` / `motivo` que calcula la
API. La fecha límite se evalúa en cada petición (hora de Colombia), sin
temporizadores, así que funciona igual en Vercel.

**Pantallas.**

| Ruta | Qué hay |
| --- | --- |
| `/pai` | Tablero: filtros arriba (dependencia, proceso o proyecto, estado en el bimestre abierto, búsqueda; en "Más filtros": tipo, programa, riesgo, línea del Plan de Desarrollo y dimensión del Plan Estratégico), con su estado en la URL. Abajo, los indicadores agrupados por proceso y acción, con los botones Observaciones y Evidencias a la izquierda, una casilla por bimestre (la editable es un campo que se guarda al salir o con Enter), el total y el % anual. El administrador ve todo en solo lectura, el resumen de cada proceso y "Exportar CSV" con los filtros aplicados. |
| `/pai/indicadores/:codigo` | Ficha completa: proceso, objetivo, línea, dimensión, programa, acción, riesgos, productos, responsables, la tabla de los seis bimestres y los textos y evidencias de cada uno. |
| `/pai/cuenta` | Cambiar la propia contraseña. |
| `/pai/admin` | Seguimiento: avance general, por dependencia y por proceso (logro por bimestre, avance anual, reportados y pendientes del bimestre abierto), con enlaces al tablero filtrado y la exportación CSV (UTF-8 con BOM, `;`, para Excel). |
| `/pai/admin/usuarios` | Cuentas (crear con contraseña temporal, editar, activar o desactivar) y el árbol de asignaciones dependencia → proceso → indicador. |
| `/pai/admin/bimestre` | Abrir un bimestre (1–6, fecha límite opcional) o cerrarlo, con confirmación. |
| `/pai/admin/autorizaciones` | Permitir a un responsable reportar otro bimestre hasta una fecha, para un proceso o un indicador que tenga asignado; listar y revocar. |
| `/pai/admin/registro` | Auditoría paginada (ingresos, reportes con sus valores anteriores y nuevos, evidencias, cuentas, asignaciones, bimestres, autorizaciones, cargas). |

**Sesión.** El PAI tiene sus propios usuarios (`pai_usuarios`), con la misma
protección que la administración del repositorio, de la que reutiliza las
piezas (scrypt, CSRF, límite de intentos: 5 fallos por usuario o 20 por IP en
15 minutos dan 429): cookie `pai_sesion` (HttpOnly, SameSite=Strict, `Secure`
en producción, `Path=/api/pai`), cabecera `X-CSRF-Token` en todo lo que
cambia algo, y la duración de `REPOSITORIO_SESION_*`. Un usuario con
contraseña temporal debe cambiarla antes de usar el aplicativo. Cambiar la
propia contraseña tiene su propio límite de intentos (el bloqueo del ingreso,
que puede provocar cualquiera que sepa el nombre de usuario, no lo impide), y
restablecer la contraseña (el administrador o `pai:crear-usuario`) levanta el
bloqueo de esa cuenta. Siempre queda al menos un administrador activo, aunque
dos se desactiven el uno al otro a la vez.

**Estados de cada bimestre.** `reportado` (tiene avance o algún texto),
`pendiente` (tiene meta y nada reportado: ya se debía reportar), `sin_meta`
y `futuro`: un bimestre sin reportes que todavía no se debe reportar porque
es posterior al **bimestre de referencia** (el abierto, aunque haya vencido
su fecha límite; sin bimestre abierto, el último cuyo periodo ya terminó, en
hora de Colombia) o aún no empieza. Por ejemplo, el 11 de octubre con el
Bimestre 4 abierto, los bimestres 5 y 6 son futuros (neutros, no "sin
avance"). Los futuros no cuentan como pendientes ni entran en los logros ni
en el avance anual; en un bimestre que ya se debía reportar, el indicador o
el proceso que no reportó cuenta como 0 % (como en la hoja Consolidado del
Excel). El servidor calcula los estados (tablero, ficha, resumen y CSV).

**Datos.** Migración 003 (MySQL y Postgres; 16 tablas `pai_*` en la misma
base del repositorio). **El servidor exige la versión 6 del esquema**: sin
migrar, toda la API de la base (repositorio, tableros y PAI) responde 503.
Las metas y avances son `DECIMAL(24,10)`, para que el aplicativo coincida
exactamente con los Excel. Los datos de partida son
`apps/server/datos/pai/2026/pai-2026.json` (27 procesos, 228 acciones, 344
indicadores, metas, y avances y textos de los bimestres 1 a 3 como
historial), extraídos de los Excel con `extraer_pai.py`; su `LEEME.md`
explica de dónde salen, cómo se regeneran y los conflictos por validar con
Planeación. La función de Vercel no lleva `datos/`: la carga siempre se hace
desde una estación con la CLI.

**Evidencias.** PDF, PNG, JPEG, WebP, Word, Excel y PowerPoint (el tipo se
comprueba por el contenido, no por el nombre), hasta 25 MB por archivo y 10
por reporte. Sin Supabase (así está Vercel desde el 9-nov-2026) van dentro
de la base (en trozos, como los archivos del repositorio) y se descargan
después de comprobar los permisos; una de más de 4 MiB se sube por partes
(`pai_subida_partes`), porque en Vercel una petición no puede llevar más de
4,5 MB. Con Supabase van a un bucket **privado** (`PAI_SUPABASE_BUCKET`), se suben
directo desde el navegador con una URL firmada (sin el límite de 4,5 MB de
Vercel) y se descargan con una redirección a una URL firmada de 60 s, creada
solo después de comprobar los permisos. Cada subida directa pendiente queda
en `pai_subidas`, a nombre de quien la pidió, del indicador y del bimestre:
nadie puede usar la de otro, cada usuario tiene a lo sumo 5 sin terminar
(429) y cada petición de subida purga las vencidas (objeto y fila), sin
tareas en segundo plano. Antes de subir o firmar, el servidor comprueba que
el bucket sea **privado**; si es público responde 503 y lo dice en su
registro. En la subida multipart el permiso se comprueba antes de recibir el
archivo. El PAI tiene su propio almacén de archivos (`pai_almacen_archivos`
y `pai_almacen_archivo_trozos`), aparte del del repositorio: el mismo PDF
subido como evidencia y como documento queda una vez en cada uno, y retirar
el documento (con su objeto público) no toca la evidencia.

### Paso a paso (VM o MySQL local)

```bash
npm run repositorio:migrar -- --usuario <cuenta_admin>      # esquema versión 6 (aplica de la 002 a la 006)
npm run pai:cargar-fichas -- --bimestre-abierto 4           # fichas 2026; sin la opción, no cambia el bimestre
npm run pai:crear-usuario -- --usuario planeacion --nombre "Planeación" --rol administrador
```

- `pai:cargar-fichas` se puede repetir: actualiza por clave (sigla, clave
  del proceso, orden del riesgo y de la acción, código del indicador) y
  conserva ids, asignaciones, autorizaciones y reportes del aplicativo. Si la
  vigencia ya tiene reportes del aplicativo, evidencias, asignaciones o
  autorizaciones, se niega (código de salida 3) salvo con `--forzar`, que
  conserva lo que sigue en el archivo y avisa (también en el registro) de lo
  que se pierde: reportes, evidencias, asignaciones y autorizaciones de los
  indicadores y procesos que desaparecen. Si borró evidencias, ejecute
  después `npm run pai:recolectar-evidencias` para liberar sus archivos.
- **El código del indicador no es una identidad estable**: es el
  consecutivo dentro de la hoja. Si una extracción nueva quita o agrega una
  fila en medio, los códigos siguientes se corren. Por eso, si un código con
  datos del aplicativo cambia de nombre, la carga se niega (también con
  `--forzar`) y lista código, nombre anterior y nombre nuevo; si de verdad
  solo se corrigieron nombres, use `--aceptar-renumeracion` (los datos quedan
  con el indicador que ahora tiene ese código). Un proceso que cambia de
  clave (p. ej., se renombró la hoja) pero conserva su código se toma como
  renombre y conserva sus asignaciones y autorizaciones.
- Cierre el bimestre (o cargue cuando nadie esté reportando) antes de una
  carga con `--forzar`. La carga nunca pisa un reporte que un responsable
  guardó mientras corría; un reporte del aplicativo vacío (creado solo para
  guardar evidencias) sí recibe los valores del archivo.
- `pai:crear-usuario` pide la contraseña oculta dos veces (o la lee de
  `PAI_USUARIO_CONTRASENA`; nunca de los argumentos). Con `--temporal` el
  usuario debe cambiarla al entrar. Los demás usuarios se crean en
  `/pai/admin/usuarios`.
- En la copia de la VM que sirve el sitio, use
  `sudo -u sapiencia node dist/pai/cli/<cargar-fichas|crear-usuario>.js ...`
  desde `apps/server` (no recompilan) y agregue a nginx el bloque
  `location /api/pai/` con `client_max_body_size 26m` (ver
  [nginx](#3-nginx-como-proxy-inverso)).

### Paso a paso (Supabase)

Solo para una instalación con Supabase. El despliegue de Vercel usa la
MySQL de Cloud SQL (ver [Despliegue en Vercel + Cloud SQL](#despliegue-en-vercel--cloud-sql)):
ahí basta el esquema en la versión 5 y los pasos 3 y 4 (fichas y primer
administrador) con `REPOSITORIO_MYSQL_*` en el entorno.

1. **Migración.** (Recomendado) ejecute `npm run repositorio:migrar` con
   `REPOSITORIO_POSTGRES_URL` en su entorno (si la cuenta dueña de las tablas
   es otra, agregue `REPOSITORIO_MIGRAR_POSTGRES_URL` con ella; esa variable
   sola también basta). Aplica las migraciones que no estén registradas en
   `sistema_esquema_version`, aunque falte una intermedia. A mano: pegue en el editor
   SQL, en orden, **cada** migración que falte
   (`apps/server/db/repositorio/postgres/migraciones/002-tablero-matricula.sql`
   si la base está en la versión 1, luego `003-pai.sql`) y registre cada
   versión. Una base de la versión 3 o anterior tiene además los nombres de
   tabla sin prefijo: antes de pegar nada, siga
   [Paso a la versión 4](apps/server/db/repositorio/LEEME.md#paso-a-la-versión-4-nombres-por-módulo)
   (el renombre, las migraciones que falten y siempre `004-nombres-por-modulo.sql`,
   que en una base de la versión 3 pasa las evidencias al almacén del PAI), que
   también registra la 4.
   ```sql
   insert into sistema_esquema_version (version, descripcion)
   values (2, 'tablero-matricula'), (3, 'pai'), (4, 'nombres-por-modulo')
   on conflict (version) do nothing;
   ```
2. **Bucket privado** (25 MB por archivo; el servidor vuelve a comprobar el
   tipo real de cada archivo):
   ```sql
   insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
   values ('pai-evidencias', 'pai-evidencias', false, 26214400, array[
     'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'application/octet-stream'])
   on conflict (id) do nothing;
   ```
   (`application/octet-stream` cubre los navegadores que no declaran el tipo
   de un archivo de Office.)
3. **Fichas.** Desde una estación, con `REPOSITORIO_POSTGRES_URL` en el
   entorno: `npm run pai:cargar-fichas -- --bimestre-abierto <N>`.
4. **Primer administrador.** `npm run pai:crear-usuario -- --usuario <u> --nombre "..." --rol administrador --solo-sql`
   pide la contraseña y muestra el SQL (con el hash) para pegarlo en el editor
   SQL de Supabase.
5. **Vercel.** `PAI_SUPABASE_BUCKET=pai-evidencias` (es el valor por
   defecto) y luego el despliegue de siempre. El bucket debe ser privado: si
   no lo es, el servidor no sube ni firma evidencias (503) y lo dice en su
   registro. Las subidas directas que nadie terminó las purga la propia API
   en cada subida nueva; ejecute de vez en cuando `npm run pai:recolectar-evidencias`
   para el resto (objetos privados sin evidencia, fichas sin uso).

### API del PAI

Contrato completo en `api-pai.ts` (copia idéntica en `apps/server/src/pai/` y
`apps/web/src/sites/pai/`; una prueba lo comprueba). Errores en JSON
`{ codigo, mensaje, campos? }` con mensajes propios del PAI.

| Método y ruta | Qué hace |
| --- | --- |
| `POST/GET/DELETE /api/pai/sesion`, `PUT /api/pai/sesion/contrasena` | Ingreso, sesión actual, salida y cambio de la propia contraseña. |
| `GET /api/pai/vigencia`, `GET /api/pai/tablero`, `GET /api/pai/indicadores/:id-o-código` | Bimestre abierto, el tablero liviano (con todos los indicadores del administrador pesa unos 340 KB, 34 KB con gzip) y la ficha completa. `?vigencia=` elige otro año. |
| `PUT /api/pai/indicadores/:id/bimestres/:b` | Guarda el reporte (responsable; 403 si no es editable, 409 si otra persona lo cambió). |
| `POST …/bimestres/:b/evidencias/subidas`, `POST …/bimestres/:b/evidencias`, `GET/DELETE /api/pai/evidencias/:id` | Evidencias. |
| `/api/pai/admin/usuarios[/:id[/asignaciones]]`, `/api/pai/admin/vigencia`, `/api/pai/admin/autorizaciones[/:id]`, `/api/pai/admin/registro`, `/api/pai/admin/exportar.csv` | Administración (403 para un responsable). |

## Asistente ODES

`/odes` es la pantalla de ingreso «¡Pregúntale a OdeS!»; su botón «Ingresar»
lleva a `/odes/chat`, un chat que responde preguntas sobre la educación postsecundaria en
Medellín usando como fuente **solo** los documentos del Repositorio de
Productos del Observatorio de Sapiencia (372 productos: boletines, estudios,
infografías, notas temáticas, informes de tendencias, Educación superior en
cifras y tableros de Power BI). Cada respuesta cita sus fuentes con números
volados; la lista "Fuentes" muestra la miniatura del documento y "Ver
documento" lo abre, en la página citada cuando es un PDF.

La interfaz sigue la estructura de BelloEduca (banner, burbujas con avatar,
"¿Cuál es tu nombre?", campo de texto con "Enviar" a la derecha) con el
estilo de la plantilla de Sapiencia y la cabecera y el pie del Observatorio.
Detalles de la interfaz: [`apps/web/src/sites/odes/LEEME.md`](apps/web/src/sites/odes/LEEME.md).

### Cómo funciona

```
 base del repositorio (MySQL,      npm run odes:indexar o           apps/server/datos/odes/
 solo publicados) o paquete ───────► "Reindexar" en la admin:  ───► indice.sqlite
 de datos (repositorio.json)        texto por página (pdftotext,     (SQLite FTS5, solo lectura)
                                    OCR con tesseract), fichas
                                                                              │
 navegador                    NestJS                                          │ buscar / listar / leer
 ─────────                    ──────                                          ▼
 POST /api/odes/chat ──────► ChatController ──► ServicioChat ──► MotorIa ◄──► API de Claude
 { mensajes: [{rol,texto}] }  validación, CSRF,                  bucle de     (claude-opus-5-5,
                              límites de uso                     herramientas  streaming)
 text/event-stream ◄──────── inicio · busqueda · texto · cita · documentos · fin · error
```

1. **Índice.** El indexador (`npm run odes:indexar` o el botón "Reindexar"
   de `/repositorio/admin`) lee los documentos publicados de la base del
   repositorio (o, sin base, el paquete de datos), extrae el texto de cada
   archivo por páginas (OCR en las páginas sin texto), lo parte en
   fragmentos y escribe un índice SQLite FTS5 con una ficha de metadatos por
   documento. Los tableros de Power BI y los estudios que solo
   están en OneDrive tienen solo ficha. El servidor abre el índice en solo
   lectura con `node:sqlite` (incluido en Node, sin dependencias nativas).
2. **Pregunta.** El navegador envía solo el texto de las preguntas y
   respuestas anteriores (máximo 20 mensajes). El nombre de la persona nunca
   viaja.
3. **Claude consulta el repositorio** con tres herramientas:
   `buscar_documentos` (texto completo), `listar_documentos` (catálogo) y
   `leer_documento` (páginas de un documento). Los resultados vuelven como
   bloques `search_result` con citas activadas, así cada frase de la
   respuesta queda ligada al fragmento que la sustenta. Hasta 5 rondas de
   consultas por pregunta, con como mucho 4 consultas a la vez por ronda (las
   que pida de más reciben un error) y 160 000 caracteres de resultados por
   pregunta; al agotar cualquiera de los topes se le pide responder con lo
   que tiene.
4. **Streaming.** El servidor reenvía el texto a medida que llega (Server-Sent
   Events) y convierte cada cita en un evento `cita` numerado; la interfaz
   dibuja el número volado y arma la lista "Fuentes".

El protocolo HTTP + SSE está en `apps/server/src/odes/chat/protocolo.ts`, con
una copia idéntica en `apps/web/src/sites/odes/chat/protocolo.ts` (si cambia
uno, copie el archivo completo al otro).

| Ruta                    | Qué hace                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------- |
| `GET /api/odes`         | `{ sitio: 'odes', nombre: 'Asistente ODES' }`                                                |
| `GET /api/odes/estado`  | Modo (`ia` o `busqueda`) y estado del índice (documentos, documentos con texto, fecha).      |
| `POST /api/odes/chat`   | Conversación en `text/event-stream`. Los errores previos al flujo son JSON `{ codigo, mensaje }` con 400, 403 (otro sitio), 413, 429 (con `Retry-After`) o 503 (sin índice); un JSON mal formado o un cuerpo de más de 512 kB reciben el error estándar de Nest (400/413). |

### Modo búsqueda y modo IA

|                 | Modo búsqueda                                                    | Modo IA                                                   |
| --------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| Cuándo          | No hay `ANTHROPIC_API_KEY` (así queda hasta que se agregue).     | Hay `ANTHROPIC_API_KEY`.                                  |
| Qué responde    | Un aviso y hasta 6 documentos del índice que coinciden con la pregunta, con extracto, miniatura y enlace. No llama a ninguna API. | Claude busca en el repositorio, redacta la respuesta y cita las fuentes. |
| Costo           | Ninguno.                                                         | Ver [Costo](#modelo-esfuerzo-y-costo).                    |

La interfaz consulta `GET /api/odes/estado` y, en modo búsqueda, avisa que la
IA todavía no está activada. Sin índice, el chat responde 503 y la interfaz
lo explica.

### Generar o actualizar el índice

**Con la base del repositorio (lo normal).** Después de agregar, editar,
publicar o despublicar documentos en `/repositorio/admin`, abra
**Asistente ODES** (`/repositorio/admin/asistente`) y pulse **Reindexar**. La
página muestra la fecha y los conteos del índice, avisa cuando el
repositorio cambió desde la última indexación y sigue el progreso. El
servidor ejecuta el indexador compilado (`dist/odes/cli/indexar.js --fuente
mysql`) como proceso hijo de prioridad baja, carga el índice nuevo al
terminar y, si algo falla, deja el anterior en uso. Mientras tanto el chat
sigue respondiendo con el índice anterior.

Desde la terminal hace lo mismo (sin `--paquete`, la fuente es la base
cuando `REPOSITORIO_MYSQL_*` está configurada):

```bash
npm run odes:indexar                       # en desarrollo, desde la raíz (compila antes)
cd /opt/sapiencia-web/apps/server && sudo -u sapiencia node dist/odes/cli/indexar.js   # en la VM, sin recompilar
npm run odes:evaluar-busqueda              # opcional: recall@5/@10 y MRR con 44 casos
```

Con la base como fuente, "Ver documento" apunta a la copia propia
(`/api/repositorio/documentos/<id>/ver#page=N`, en la página citada) y las
miniaturas salen de la base (`/api/repositorio/documentos/<id>/miniatura`).
Los tableros de Power BI, la entrada de blog y los estudios de OneDrive
conservan su enlace externo.

**Desde el paquete de datos** (sin base, o para comparar):

```bash
npm run odes:indexar -- --paquete ../../Septiembre/observatorio/repositorio-datos
```

Herramientas necesarias **en la máquina que indexa** (la VM, si se usa el
botón "Reindexar"): poppler (`pdftotext`, `pdftoppm`, `pdfinfo`),
`tesseract` con los idiomas `spa` y `eng`, `unzip` y, solo para
`--miniaturas` con el paquete, `cwebp`. Se comprueban antes de empezar; si
falta alguna, el índice no se toca y el mensaje dice qué instalar.

```bash
# Ubuntu/Debian
sudo apt-get install poppler-utils tesseract-ocr tesseract-ocr-spa unzip   # + webp para --miniaturas
# macOS (Homebrew)
brew install poppler tesseract tesseract-lang webp
```

- La primera vez tarda unos 45 s (incluye el OCR de unas 230 páginas); las
  siguientes, alrededor de 1 s, porque el texto extraído queda en
  `apps/server/datos/odes/cache/` (ignorado por git, por sha256 de cada
  archivo: con la base no se descarga ningún archivo que ya esté en la
  caché).
- Solo una indexación a la vez (cerrojo `indice.sqlite.lock`): una segunda,
  desde la terminal o desde la administración, se rechaza.
- El índice se escribe en un temporal y se renombra (cambio atómico). Un
  servidor en marcha lo detecta y lo recarga solo en menos de un minuto (al
  reindexar desde la administración, de inmediato).
- `--solo-metadatos` genera solo las fichas, en segundos y sin herramientas
  externas. Otras opciones: `npm run odes:indexar -- --ayuda`.

Más detalles del índice (fuentes, esquema, normalización, evaluación):
[`apps/server/datos/odes/LEEME.md`](apps/server/datos/odes/LEEME.md).

### Variables del asistente

Todas van en `apps/server/.env` y están explicadas en
[`apps/server/.env.example`](apps/server/.env.example). Si un valor no es
válido, el servidor no arranca y explica el error.

| Variable                       | Por defecto                | Para qué                                                                 |
| ------------------------------ | -------------------------- | ------------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY`            | vacío                      | Clave de la API de Claude. Sin ella, modo búsqueda.                      |
| `ODES_MODELO`                  | `claude-opus-5-5`          | Modelo.                                                                  |
| `ODES_ESFUERZO`                | `medium`                   | `output_config.effort`: `low`, `medium`, `high`, `xhigh` o `max`.        |
| `ODES_MAX_TOKENS`              | `16000`                    | Tope de salida por llamada (pensamiento + respuesta).                    |
| `ODES_MAX_RONDAS_HERRAMIENTAS` | `5`                        | Rondas de consultas al repositorio por pregunta (1 a 10).                |
| `ODES_FALLBACKS`               | `true`                     | Reintento en otro modelo, del lado de Anthropic, si el modelo declina.   |
| `ODES_HERRAMIENTAS_ESTRICTAS`  | `true`                     | `strict: true` en las herramientas. Póngalo en `false` solo si la API responde 400 por la combinación con las citas (ver [Activar la IA](#activar-la-ia)). |
| `ODES_LIMITE_POR_MINUTO`       | `6`                        | Preguntas por IP en 60 s (0 = sin límite).                               |
| `ODES_LIMITE_POR_DIA`          | `80`                       | Preguntas por IP por día de Colombia.                                    |
| `ODES_LIMITE_GLOBAL_DIA`       | `3000`                     | Preguntas con IA por día para todo el sitio: tope de gasto.              |
| `ODES_TIMEOUT_SEGUNDOS`        | `120`                      | Duración máxima de una respuesta.                                        |
| `ODES_INDICE`                  | `datos/odes/indice.sqlite` | Archivo del índice (relativo a `apps/server`).                           |
| `ODES_URL_DOCUMENTO`           | vacío (el enlace del índice) | Plantilla de los enlaces a los documentos con archivo propio, con `{id}` y/o `{url_ver}`. Vacío: la copia propia si el índice salió de la base; la URL original si salió del paquete. |
| `ODES_FUENTE`                  | `mysql` si hay base        | Solo el indexador: `mysql` (la base del repositorio) o `paquete`.        |
| `ODES_PAQUETE`                 | —                          | Solo el indexador con la fuente paquete: carpeta del paquete (equivale a `--paquete`). |
| `ODES_REINDEXAR_CONCURRENCIA`  | mitad de los núcleos       | "Reindexar" de la administración: procesos externos a la vez.            |
| `ODES_REINDEXAR_TIMEOUT_MINUTOS` | `60`                     | "Reindexar" de la administración: tiempo máximo (luego se detiene y queda el índice anterior). |
| `ANTHROPIC_BASE_URL`           | API de Anthropic           | Solo para pruebas con el simulador local.                                |

### Activar la IA

1. Cree una clave en la consola de Claude (Anthropic) → **API Keys**. Allí
   mismo conviene fijar un **límite de gasto mensual** para la organización.
2. Agréguela a `apps/server/.env` (no la suba a git; `.env` está ignorado):

   ```ini
   ANTHROPIC_API_KEY=sk-ant-...
   ```

3. Pruébela desde la terminal antes de reiniciar el servidor. Muestra los
   eventos como los recibiría la interfaz, las fuentes y los tokens usados; con
   `--dos-veces` repite la pregunta y comprueba la caché de prompts entre
   peticiones: la **primera llamada** de la segunda pregunta ("Primera
   llamada: caché leída …") debe ser mayor que 0, y el comando dice
   `Caché de prompts entre peticiones: OK` o un `AVISO`. El total de una
   pregunta no sirve para esto: dentro de una misma pregunta, la segunda
   llamada siempre lee lo que acaba de escribir la primera.

   ```bash
   npm run odes:probar -- --dos-veces "¿Qué porcentaje de bachilleres de Medellín transita de inmediato a la educación superior?"
   # en la VM, sin recompilar la copia que sirve el sitio:
   cd /opt/sapiencia-web/apps/server && sudo -u sapiencia node dist/odes/cli/probar-chat.js --dos-veces "¿Qué es Matrícula Cero?"
   ```

   Si falla con un error 400 que menciona `strict`, `structured` o
   `citations`, agregue `ODES_HERRAMIENTAS_ESTRICTAS=false` a `.env` y repita.
   Esa combinación (herramientas estrictas + resultados con citas) no se pudo
   probar sin clave; la entrada de las herramientas se valida en el servidor
   de todas formas.
4. Reinicie el servicio (`sudo systemctl restart sapiencia-web`) y compruebe:
   `curl -s http://127.0.0.1:3000/api/odes/estado` debe decir `"modo":"ia"`.

Sin clave se puede probar todo el flujo de la IA con el simulador local de la
API, que imita los eventos reales (búsqueda, texto con citas, rechazo,
sobrecarga, respaldo...):

```bash
cd apps/server && npm run build
node dist/odes/cli/simulador-claude.js --puerto 4010
# en otra terminal:
ANTHROPIC_BASE_URL=http://127.0.0.1:4010 ANTHROPIC_API_KEY=simulado node dist/main.js
```

### Modelo, esfuerzo y costo

- **Modelo `claude-opus-5-5` con esfuerzo `medium`.** En Claude Opus 5.5 el
  pensamiento adaptativo está siempre activo; el esfuerzo controla cuánto
  piensa y, con eso, la latencia y el costo. `low` es más barato y rápido;
  `high` o más solo si se mide una mejora real.
- **`max_tokens` = 16 000 por llamada**, a propósito: es un tope de costo para
  un endpoint público (alcanza para el pensamiento y una respuesta de chat
  de varios párrafos). Si una respuesta llega a ese tope, la interfaz avisa
  que se cortó.
- **Rechazos.** Si los filtros de seguridad del modelo declinan una pregunta
  legítima (falso positivo), Anthropic la reintenta en otro modelo dentro de
  la misma llamada (`fallbacks: "default"`, beta
  `server-side-fallback-2026-07-01`). Si aun así se declina, el servidor
  envía solo `fin: rechazo`: la interfaz descarta lo que se alcanzó a
  mostrar (la API pide no tratar esa salida parcial como respuesta), no lo
  reenvía en el historial y muestra un mensaje corto en español.
- **Caché de prompts.** Las herramientas y el prompt de sistema (unos 7 400
  caracteres, ≈ 2 300 tokens) son idénticos byte a byte en todas las
  peticiones y quedan en caché; la conversación usa la caché automática. El
  registro de cada pregunta muestra `cache_lectura` y `cache_escritura`.

**Costo aproximado por pregunta** con los precios de Claude Opus 5.5 (USD por
millón de tokens: entrada $4, salida $20, lectura de caché $0,20, escritura en
caché de 5 minutos $5). Supuestos: unos 3,5 caracteres por token en español;
un resultado de `buscar_documentos` trae 8 fragmentos (9 000–15 000
caracteres, ≈ 3 000–4 500 tokens; medido con el índice real); el pensamiento
más la respuesta suman 1 500–2 500 tokens de salida por pregunta con
esfuerzo `medium`; el prefijo de herramientas + sistema ya está en caché
(otra pregunta en los últimos 5 minutos). Son estimaciones del tamaño de las
peticiones, no mediciones contra la API: confírmelas con `npm run
odes:probar` y con el registro del servidor.

| Pregunta                                                     | Llamadas | Entrada (≈ tokens)                     | Salida (≈ tokens) | Costo aprox. |
| ------------------------------------------------------------ | -------- | -------------------------------------- | ----------------- | ------------ |
| Típica: una búsqueda y la respuesta                          | 2        | 4 600 de caché + 5 000 nuevos          | 1 500–2 500       | **US$ 0,06–0,08** |
| Compleja: tres búsquedas y la lectura de un documento        | 5        | ≈ 40 000 de caché + 21 000 nuevos      | 3 000–4 000       | **US$ 0,17–0,20** |
| Seguimiento con historial (≈ 3 000 tokens de conversación)   | 2        | lo de la típica + 3 000                | 1 500–2 500       | + US$ 0,02   |
| Primera pregunta tras 5 min sin uso (caché fría)             | —        | + 2 300 de escritura                   | —                 | + US$ 0,01   |
| Peor caso (ver abajo)                                         | 6        | ≈ 330 000 de caché + 320 000 nuevos    | ≈ 96 000          | ≈ US$ 3,60   |

**Peor caso.** Lo acotan los topes del servidor: 6 llamadas (5 rondas de
herramientas y la respuesta), como mucho 4 herramientas por ronda, 40 000
caracteres por resultado y 160 000 caracteres de resultados por pregunta
(al pasarlos no se ejecuta nada más y la llamada siguiente es la última:
lo reenviado nunca supera ≈ 200 000 caracteres de resultados, ≈ 57 000
tokens), un historial al máximo de 128 000 caracteres (≈ 37 000 tokens) y
16 000 tokens de salida en cada llamada (≈ 96 000, US$ 1,92). La última
llamada usa `tool_choice: none`, que invalida la caché de la conversación y
vuelve a escribir todo lo acumulado (≈ 175 000 tokens, unos US$ 0,90): por
eso la entrada nueva del peor caso es ≈ 320 000 tokens. Es un techo teórico
(salida máxima en todas las llamadas y todos los resultados al tope), no un
caso esperable.

Con el límite global por defecto (3 000 preguntas con IA al día), el gasto
máximo diario rondaría US$ 180–240 si todas fueran típicas; si todas
llegaran al peor caso serían ≈ US$ 10 800. Ajuste `ODES_LIMITE_GLOBAL_DIA` al
presupuesto (gasto diario máximo ≈ límite × costo por pregunta) y fije
además el límite de gasto mensual en la consola de Anthropic, que es el que
de verdad corta el gasto.

### Límites de uso

- Por IP: 6 preguntas por minuto y 80 por día (el día se cuenta en hora de
  Colombia). Para todo el sitio: 3 000 preguntas con IA por día. Al
  superarlos, la API responde 429 con `Retry-After` y la interfaz dice cuándo
  se puede volver a preguntar.
- Una IPv6 cuenta por su prefijo `/64` (lo que normalmente es una sola
  máquina o red): cambiar de dirección dentro del mismo prefijo no da cupo
  nuevo. Una IPv4 cuenta por la dirección.
- La conversación que llega se mide después de unir los mensajes seguidos
  del mismo rol: como mucho 128 000 caracteres en total, dos preguntas
  seguidas y una respuesta por turno (413 si no).
- Los contadores están en memoria: se reinician con el servidor y, con varios
  procesos, cada uno cuenta por separado.
- Detrás de nginx, `TRUST_PROXY=loopback` es necesario para que cada visitante
  cuente por su IP real y no todos como 127.0.0.1.
- El chat rechaza peticiones de otros sitios (403): comprueba
  `Sec-Fetch-Site` y `Origin`/`Host` (el mismo criterio que
  `app.enableCsrfProtection()` de Nest) y solo acepta JSON. Se puede
  incrustar en un `<iframe>` (con `CSP_FRAME_ANCESTORS`), pero no llamar desde
  un script de otro dominio.

### Privacidad

Pensado para la Ley 1581 de 2012 (protección de datos personales):

- **El nombre se queda en el navegador.** Solo se usa para saludar; hay una
  opción "Prefiero no decirlo". Se guarda con la conversación en el
  `sessionStorage` de la pestaña (sobrevive a una recarga y se borra al
  cerrar la pestaña o con "Nueva conversación") y **nunca** se envía al
  servidor ni a la API: la petición solo lleva el texto de las preguntas y
  respuestas.
- **El servidor no guarda conversaciones**: ni en archivos ni en la base de
  datos (la del repositorio solo tiene los documentos y la administración). El registro
  tiene una línea por pregunta con el modo, el modelo, el resultado, las
  llamadas, las herramientas, los tokens, la duración y un seudónimo de la IP
  (HMAC con una sal aleatoria que cambia en cada reinicio). Nunca el texto ni
  la IP. Las IP solo se cuentan en memoria para los límites de uso.
- **A Anthropic** llegan las preguntas, el historial de texto y los
  fragmentos del repositorio, con `metadata.user_id` = el mismo seudónimo. Se
  aplican las políticas de retención de datos de la API de Anthropic según el
  contrato de la entidad.
- La interfaz pide no escribir datos personales y el prompt de sistema le
  indica al modelo no pedirlos ni repetirlos.

### Despliegue

Además de los pasos de [Despliegue en una VM Linux](#despliegue-en-una-vm-linux):

1. **Índice.** Con la base del repositorio cargada y las herramientas
   instaladas en la VM, pulse "Reindexar" en `/repositorio/admin/asistente`
   (o `cd /opt/sapiencia-web/apps/server && sudo -u sapiencia node dist/odes/cli/indexar.js`). También se puede
   generar en otra máquina con acceso a la base y copiar
   `apps/server/datos/odes/indice.sqlite` a la VM (o donde diga
   `ODES_INDICE`): es un solo archivo SQLite portable (≈ 15 MB). Sin índice
   el servidor arranca igual: el chat responde 503 y el registro lo avisa
   una vez. Para que la primera reindexación en la VM no repita el OCR
   (unos 45 s en un equipo de 12 núcleos; varios minutos en una VM pequeña),
   copie también `apps/server/datos/odes/cache/` (≈ 5 MB) desde la máquina
   donde se indexó: la caché va por sha256 de cada archivo y sirve igual
   con la base como fuente.
2. **Miniaturas.** Con un índice generado desde la base salen de la base. Las
   de `apps/web/public/odes/portadas/` (en git) quedan como respaldo y son
   las que usa la carga inicial del repositorio (`--miniaturas`).
3. **Clave.** `ANTHROPIC_API_KEY` en `apps/server/.env` y salida HTTPS hacia
   `api.anthropic.com:443` permitida.
4. **nginx.** El bloque `location = /api/odes/chat` de la sección 3
   (`proxy_buffering off`, `proxy_read_timeout 180s`). Aunque falte, el
   servidor envía `X-Accel-Buffering: no` y un `: ping` cada 15 s, que
   evitan que nginx acumule o corte la respuesta con sus valores por defecto.
5. **Node.** `node:sqlite` viene incluido en Node 24.15+ (y 22.13+). En Node
   22 imprime un `ExperimentalWarning` al arrancar; es inofensivo.

### Relación con `/repositorio`

La base de datos de la rama `/repositorio` es la fuente de verdad de los
documentos, y el asistente la usa así:

- **Indexación.** El indexador lee la base con `FuenteMysql`
  (`apps/server/src/odes/repositorio/indexacion/fuente-mysql.ts`), una
  implementación de la interfaz `FuenteRepositorio`; `FuentePaqueteJson`
  sigue leyendo el paquete. Solo entran los documentos **publicados**; un
  documento despublicado desaparece de las respuestas al reindexar.
- **Enlaces.** Se arman en un solo lugar
  (`apps/server/src/odes/repositorio/url-documento.ts`) al leer el índice:
  con un índice de la base, la copia propia (`#page=N` funciona en todos los
  PDF, también los que estaban en Google Drive).
- **Reindexar.** El botón de la administración vive bajo
  `/api/repositorio/admin/odes/` (no bajo `/api/odes/`) porque la cookie de
  la sesión de administración tiene `Path=/api/repositorio/admin`. La API
  está en `src/odes/chat/protocolo.ts` (`EstadoIndiceAdmin`).
- **Sin base**, el asistente funciona igual con un índice generado desde el
  paquete.

## Repositorio de Productos (`/repositorio`)

`/repositorio` publica los documentos del Observatorio de Sapiencia (ODES)
en seis categorías: boletines, estudios, infografías, informes de
tendencias, notas temáticas y otros productos. La carga inicial trajo 372
productos (82 versiones en inglés, 64 tableros de Power BI y una entrada de
blog); desde la revisión del Observatorio del 12 de noviembre de 2026 solo se
publican documentos, cada uno con año, descripción de unas 30 palabras y 6
palabras clave (ver "Descripción y revisión de datos (versión 6)" en
`apps/server/db/repositorio/LEEME.md`). La página pública nació como port a
React del bloque de WordPress v4.2: la misma búsqueda difusa (sin tildes,
tolera errores, siglas, "issues note"), ahora también sobre la descripción,
y filtros de casillas (Categoría, de la que tiene más productos a la que
tiene menos; Año; Palabra clave, sin números y con las elegidas a la vista).
Lleva la cabecera y el pie de la entidad (los de sapiencia.gov.co). Muestra
12 tarjetas por página y descarga con nombre limpio.

La fuente de verdad es una **base de datos MySQL** (la instancia de Cloud SQL
de la entidad): los datos de cada producto **y sus archivos**. En
**`/repositorio/admin`** los administradores agregan, editan, publican,
despublican y borran documentos, con su archivo y su portada, sin tocar
código. La búsqueda y los filtros corren en el navegador, igual que en el
bloque.

Detalles de la interfaz: [`apps/web/src/sites/repositorio/LEEME.md`](apps/web/src/sites/repositorio/LEEME.md)
y [`admin/LEEME.md`](apps/web/src/sites/repositorio/admin/LEEME.md). Tablas
e instalación de la base: [`apps/server/db/repositorio/LEEME.md`](apps/server/db/repositorio/LEEME.md).

### Arquitectura

```
navegador                           NestJS (apps/server/src/repositorio)        MySQL repositoriobd (Cloud SQL)
─────────                           ────────────────────────────────────        ───────────────────────────────
/repositorio (React)  ── GET ─────► /api/repositorio/documentos           ───► repositorio_documentos,
  búsqueda y filtros en el          /api/repositorio/documentos/:id/            repositorio_categorias, ...
  navegador                           ver | descargar | portada | miniatura     repositorio_almacen_archivos +
/repositorio/admin    ── cookie ──► /api/repositorio/admin/*                    repositorio_almacen_archivo_trozos (1 MB)
  (otro chunk, pdf.js)   + CSRF       sesión, documentos, archivos,             repositorio_administradores,
                                      categorías, palabras clave, cambios       repositorio_sesiones, ...
                                    /api/repositorio/admin/odes/*  ───► indexador del Asistente ODES
```

- **Archivos dentro de la base.** Cada documento puede tener tres archivos:
  el documento (PDF, PNG, JPEG, DOCX o PPTX, hasta 80 MB), la portada (JPEG
  de 720 × 720) y la miniatura (WebP de 192 × 192). Se guardan en binario,
  partidos en trozos de 1 MB (`repositorio_almacen_archivo_trozos`,
  `MEDIUMBLOB`). Un archivo con el mismo contenido (sha256) se guarda una
  sola vez y se borra cuando ningún documento lo usa. Es el almacén del
  repositorio: las evidencias del PAI tienen el suyo. No hay una carpeta aparte que respaldar ni que
  sincronizar entre máquinas.
- **Listado en memoria.** El listado público (unos 60 kB con gzip) se arma
  una vez y se sirve con ETag (304 si no cambió). Lo invalida un contador
  de versión que cada escritura incrementa en la base
  (`repositorio_estado`), también si escribe otro proceso, como el
  importador. Si la base se cae, el listado sigue saliendo de la última
  copia buena y los archivos responden 503.
- **Sin base**, el servidor arranca igual: `/sivu` y `/odes` funcionan,
  `/api/repositorio/*` responde 503 `no_disponible` con `Retry-After`, y la
  página lo explica con "Intentar de nuevo". Si la base está configurada
  pero no responde, el servidor reintenta solo (1, 2, 5, 10, 30 y luego cada
  60 s; en Vercel, con la petición siguiente) y se recupera sin reiniciarlo.
- **Contrato.** `apps/server/src/repositorio/api-repositorio.ts` tiene los
  endpoints, los tipos, los límites y `nombreDescarga()`. Hay una **copia
  idéntica** en `apps/web/src/sites/repositorio/api-repositorio.ts`: si
  cambia una, copie el archivo completo a la otra.

### API

| Ruta pública (sin sesión) | Respuesta |
| --- | --- |
| `GET /api/repositorio/documentos` | Listado de los publicados (`ListadoPublico`), `Cache-Control: no-cache` + ETag. Nunca incluye las notas internas. |
| `GET /api/repositorio/documentos/:id/ver` | El archivo propio inline (el PDF se abre en el navegador; `#page=N` funciona). Admite `Range` (206/416), ETag por sha256 y 304. `Cache-Control: public, max-age=600, must-revalidate`. |
| `GET /api/repositorio/documentos/:id/descargar` | El archivo como `attachment`, con `filename*=UTF-8''…` y un nombre ASCII de respaldo: `Boletín 19 - Fe de erratas del Boletín N.º 19.pdf`. 404 si el documento no permite descarga. |
| `GET /api/repositorio/documentos/:id/portada`, `/miniatura` | JPEG 720 × 720 y WebP 192 × 192. Con `?v=<versión>` (como vienen en el listado) se guardan un año (`immutable`); la URL cambia si se reemplaza la portada. |

Un documento despublicado o inexistente responde 404 en todas. Las rutas de
administración (`/api/repositorio/admin/...`: sesión, documentos, archivo,
portada, publicar, despublicar, borrar, categorías, palabras clave, registro
de cambios y el índice del Asistente ODES) están descritas en el contrato.
Los errores son JSON `{ codigo, mensaje, campos? }` con 400, 401, 403, 404,
409, 413, 415, 429 o 503.

### Instalación en Cloud SQL paso a paso

Se hace **una sola vez**. Nadie usa credenciales personales: TI usa la cuenta
administradora de la instancia y la aplicación usa su propio usuario, con
permisos mínimos.

| Paso | Quién | Qué |
| --- | --- | --- |
| 1 | TI (cuenta administradora de Cloud SQL, p. ej. en TablePlus) | Abrir [`apps/server/db/repositorio/permisos.sql`](apps/server/db/repositorio/permisos.sql), reemplazar `CAMBIAR_CONTRASENA` por una contraseña larga y aleatoria (20 caracteres o más; guárdela en el gestor de contraseñas de la entidad) y ejecutarlo. Crea la base `repositoriobd` (utf8mb4, `utf8mb4_0900_ai_ci`) y el usuario `repositorio_app` con **solo** `SELECT, INSERT, UPDATE, DELETE` sobre esa base. Cree el usuario con SQL y **no** desde la consola de Google: los usuarios de la consola reciben el rol `cloudsqlsuperuser`. Si la VM tiene IP fija, puede cambiar `'%'` por esa IP. |
| 2 | TI | Dejar el esquema en la **versión 5** (la que exige el servidor) dentro de `repositoriobd`. Recomendado, desde la VM ya configurada (paso 4): `cd /opt/sapiencia-web/apps/server && sudo -u sapiencia node dist/repositorio/cli/migrar.js --usuario <cuenta_admin>`, que pide la contraseña sin mostrarla y aplica `esquema.sql` y las migraciones que falten. Alternativa en TablePlus: abrir la base y ejecutar completos, en este orden, [`esquema.sql`](apps/server/db/repositorio/esquema.sql), [`migraciones/002-tablero-matricula.sql`](apps/server/db/repositorio/migraciones/002-tablero-matricula.sql) y [`migraciones/003-pai.sql`](apps/server/db/repositorio/migraciones/003-pai.sql) (todos idempotentes), y registrar las versiones: `INSERT IGNORE INTO sistema_esquema_version (version, descripcion) VALUES (2, 'tablero-matricula'), (3, 'pai'), (4, 'nombres-por-modulo');`. Si la base ya existía con la versión 3 o anterior, primero el renombre de [Paso a la versión 4](apps/server/db/repositorio/LEEME.md#paso-a-la-versión-4-nombres-por-módulo). |
| 3 | TI | En la consola de Cloud SQL: **Conexiones → Redes → Redes autorizadas**, agregar la IP pública de la VM (`x.x.x.x/32`). En **Conexiones → Seguridad**, descargar el certificado de la CA del servidor (`server-ca.pem`). Recomendado con IP pública: exigir conexiones cifradas para el usuario (`ALTER USER 'repositorio_app'@'%' REQUIRE SSL;`) o para toda la instancia. |
| 4 | Responsable del servidor | Copiar `server-ca.pem` a la VM (p. ej. `/etc/sapiencia/cloudsql-server-ca.pem`, legible por el usuario `sapiencia`) y llenar `REPOSITORIO_MYSQL_*` en `apps/server/.env` (ver [Variables del repositorio](#variables-del-repositorio)). Si la contraseña empieza por `#`, va entre comillas simples. Reiniciar el servicio: el registro debe decir `Conectado a MySQL 8.0.18 (repositoriobd en <IP>:3306)`. |
| 5 | Responsable del servidor | Crear los administradores: `cd /opt/sapiencia-web/apps/server && sudo -u sapiencia node dist/repositorio/cli/crear-admin.js --usuario <usuario> --nombre "Nombre Apellido"`. Pide la contraseña dos veces sin mostrarla (mínimo 12 caracteres). Todos los comandos de la VM van con `sudo -u sapiencia`: `.env` (permisos `600`) solo lo puede leer ese usuario. |
| 6 | Responsable del servidor | Carga inicial (desde la VM o desde un equipo con la IP autorizada y el mismo `.env`): copiar el paquete `repositorio-datos` (≈ 490 MB) a una carpeta que `sapiencia` pueda leer (en Ubuntu las carpetas personales son privadas: por ejemplo `/srv/repositorio-datos`, con `sudo chmod -R a+rX /srv/repositorio-datos`) y, desde la raíz del proyecto, `cd /opt/sapiencia-web && sudo -u sapiencia node apps/server/dist/repositorio/cli/importar.js --paquete /srv/repositorio-datos --miniaturas apps/web/public/odes/portadas`. Sube unos 482 MB a la base. Si se corta, se vuelve a ejecutar y sigue donde iba. Al final muestra los conteos: **372 publicados**; Boletín 43, Estudio 62, Infografía 89, Informe dinámico 54, Nota temática 48, Informe de tendencias 8, Educación superior en cifras 66, Otros productos 2; español 290, inglés 82; 64 tableros; 5 con entrada de blog; 6 con nota. |
| 7 | Un administrador | Entrar en `/repositorio/admin`, revisar y, en **Asistente ODES**, pulsar **Reindexar** para que el chat use la base (necesita las herramientas del indexador en la VM). |

Comprobaciones:

```sql
-- Con la cuenta administradora:
SHOW GRANTS FOR 'repositorio_app'@'%';
-- Debe mostrar USAGE ON *.* y SELECT, INSERT, UPDATE, DELETE ON `repositoriobd`.*
SELECT MAX(version) FROM repositoriobd.esquema_version;   -- 3 (y deben estar la 1, la 2 y la 3)
```

```bash
curl -s http://127.0.0.1:3000/api/repositorio/documentos | head -c 120   # {"actualizado":...,"total":372,...
```

La aplicación nunca crea ni cambia tablas: los cambios futuros de esquema
irán en `apps/server/db/repositorio/migraciones/NNN-nombre.sql` y los aplica
`repositorio:migrar` con la cuenta administradora. Si el esquema de la base
es más viejo que el que necesita el código, `/api/repositorio/*` responde
503 y el registro lo explica.

### Variables del repositorio

Van en `apps/server/.env` y están explicadas en
[`apps/server/.env.example`](apps/server/.env.example) (sección "Repositorio
de Productos"). Si un valor no es válido, el servidor no arranca y explica el
error.

| Variable | Por defecto | Para qué |
| --- | --- | --- |
| `REPOSITORIO_MYSQL_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_DATABASE` | — / `3306` / — / — / `repositoriobd` | Conexión con el usuario de la aplicación. Sin host, el repositorio queda desactivado (503). |
| `REPOSITORIO_MYSQL_URL` | — | Alternativa a las cinco anteriores: `mysql://usuario:clave@host:3306/repositoriobd` (caracteres especiales codificados: `#` → `%23`). |
| `REPOSITORIO_MYSQL_SSL_CA` | — | Ruta de `server-ca.pem`. Con ella el modo por defecto es `verificar-ca`: la conexión va cifrada y se verifica la cadena del certificado, no el nombre (el certificado de Cloud SQL no incluye la IP). |
| `REPOSITORIO_MYSQL_SSL` | `verificar-ca` con CA; si no, `desactivado` | `desactivado`, `requerido` (cifra sin verificar; no recomendado), `verificar-ca` o `verificar-identidad` (también el nombre del host; solo si el certificado lo incluye). |
| `REPOSITORIO_MYSQL_SSL_CERT` / `REPOSITORIO_MYSQL_SSL_KEY` | — | Certificado de cliente, solo si la instancia lo exige. |
| `REPOSITORIO_MYSQL_CONEXIONES` | `8` | Conexiones simultáneas del pool (1 a 50). Con más consultas a la vez que conexiones + 200 en espera, la API responde 503 con `Retry-After: 2` (sin marcar la base como caída). |
| `REPOSITORIO_MYSQL_TIMEOUT_SEGUNDOS` | `10` | Tiempo máximo para abrir una conexión. |
| `REPOSITORIO_POSTGRES_URL` | — | Base **Postgres** en lugar de MySQL (nunca las dos): `postgresql://usuario:clave@host:5432/base`. En Supabase, la del pooler *Transaction* (puerto 6543). |
| `REPOSITORIO_POSTGRES_SSL` / `_SSL_CA` | `requerido` (salvo en localhost) | Como los de MySQL. El `sslmode` de la URL también vale. |
| `REPOSITORIO_POSTGRES_CONEXIONES` / `_TIMEOUT_SEGUNDOS` | `5` / `10` | Pool de Postgres (en Vercel, 2 o 3). |
| `REPOSITORIO_SUPABASE_URL` / `_CLAVE` / `_BUCKET` | — / — / `repositorio` | Archivos en **Supabase Storage** (bucket público) en lugar de dentro de la base. La clave es la secreta del proyecto y solo la usa el servidor. La CSP admite ese dominio en `img-src` y `connect-src`. |
| `REPOSITORIO_COOKIE_SEGURA` | `true` en producción | Cookie de la administración con `Secure` (solo por HTTPS). `false` solo si el sitio se sirve por http plano en la red interna. |
| `REPOSITORIO_SESION_INACTIVIDAD_MINUTOS` | `30` | La sesión vence tras ese tiempo sin uso (5 a 1440). |
| `REPOSITORIO_SESION_MAXIMA_HORAS` | `12` | Duración máxima de una sesión aunque se use (1 a 168). |
| `REPOSITORIO_DIRECTORIO_TEMPORAL` | temporal del sistema | Dónde se reciben los archivos subidos mientras se validan (se borran al terminar cada petición). |
| `REPOSITORIO_MIGRAR_USUARIO` / `_CONTRASENA`, `REPOSITORIO_ADMIN_CONTRASENA`, `REPOSITORIO_PAQUETE` | — | Solo para automatizar las CLI (el servidor no las lee). No las deje escritas en `.env`. |

### Comandos

Desde la raíz del proyecto con `npm run …` (en desarrollo: compilan antes)
o, en la VM, desde `apps/server` con `sudo -u sapiencia node
dist/repositorio/cli/….js` (sin recompilar; `sudo -u sapiencia` porque solo
ese usuario puede leer `.env`). Todos usan la conexión de
`REPOSITORIO_MYSQL_*`. Las contraseñas nunca van en
la línea de comandos: se piden sin mostrarlas o se toman de la variable
indicada.

| Comando | Qué hace |
| --- | --- |
| `repositorio:migrar -- --usuario <admin> [--crear-base]` | Aplica `esquema.sql` y las migraciones pendientes con una cuenta administradora. Idempotente. Con el usuario de la aplicación explica que le faltan permisos (a propósito). |
| `repositorio:revision -- --archivo <revision.json> [--aplicar] [--detalle] [--usuario <u>] [--permitir-incompletos]` | Aplica una revisión de datos (categoría, publicación, año, descripción y palabras clave de muchos documentos, y categorías sin uso) en una sola transacción, con una fila por documento en el registro de cambios. Sin `--aplicar` solo simula. No escribe nada si quedaría publicado algo sin lo necesario para publicar. Ver `apps/server/db/repositorio/LEEME.md`. |
| `repositorio:crear-admin -- --usuario <u> --nombre "…" [--desactivar]` | Crea un administrador. Con un usuario existente le cambia la contraseña y cierra sus sesiones; `--desactivar` le quita el acceso. Contraseña de 12 caracteres o más (`REPOSITORIO_ADMIN_CONTRASENA` para automatizar). |
| `repositorio:importar -- --paquete <carpeta> [--miniaturas <carpeta>] [--solo-nuevos] [--ids a,b] [--restaurar-borrados] [--forzar]` | Carga o actualiza desde el paquete de datos (`repositorio.json`, `documentos/`, `portadas/`). Hace upsert por `id`, crea categorías y palabras clave y no duplica archivos (sha256). Cada documento va en su propia transacción, así que se puede reanudar. Los documentos nuevos quedan publicados, en la posición «Más recientes» que les da el paquete (abriendo lugar: las posiciones siguen siendo 1..N); los existentes conservan su estado de publicación y su posición. Nunca borra un archivo, portada o miniatura que el paquete no traiga. La curaduría y el origen van a las notas internas. Termina con los conteos. Recién hecha la carga, correrlo otra vez no cambia nada (0,8 s). **Después de que la administración empezó a trabajar**, protege su trabajo y lo avisa: no vuelve a crear los documentos borrados allí (`--restaurar-borrados` los crea de nuevo, publicados) ni sobrescribe los editados allí (`--forzar` les pone otra vez los datos del paquete); `--solo-nuevos` solo agrega lo que no está en la base. |

### Guía de la administración

Entre en **`/repositorio/admin`** con su usuario y contraseña. El enlace
"Ver el repositorio público" lleva a la página pública.

- **Documentos** (página principal). Búsqueda (la misma de la página
  pública, más el identificador), filtros por categoría, estado, tipo,
  idioma y "Le falta" (archivo, portada…), contadores que filtran al
  pulsarlos, columnas ordenables y 50 por página. "Publicar" y
  "Despublicar" funcionan desde la fila.
- **Agregar.** Pulse "Nuevo documento" y llene los datos:
  - Título, subtítulo, categoría (de las existentes), N.º, año (vacío =
    "S. F.") y mes, idioma y tipo:
    - **documento**: con archivo propio;
    - **tablero** o **entrada de blog**: llevan la URL externa y no tienen
      descarga.
  - Palabras clave: hasta 7. Las sugerencias son las existentes; si escribe
    una que ya existe con otras tildes o mayúsculas, se usa la forma
    guardada, para que la misma palabra se escriba igual en todas las
    tarjetas.
  - Archivo (arrastrar o elegir): PDF, PNG, JPEG, DOCX o PPTX de hasta
    80 MB. Se revisa el tipo real del archivo, no solo la extensión.
  - Portada: al elegir un PDF, **se genera sola** con la misma regla de las
    372 actuales (la primera página centrada sobre un fondo desenfocado de
    sí misma, JPEG de 720 px, más la miniatura de 192 px). También puede
    usar "Generar desde el PDF" o "Usar una imagen…".
  - La **vista previa** muestra la tarjeta tal como se verá.

  "Crear documento" lo guarda **despublicado**. "Publicar" lo pone en la
  página pública de inmediato; necesita un archivo o una URL externa.
- **Editar.** Los mismos campos; "Guardar cambios" o "Guardar y publicar".
  - **Posición en «Más recientes»**: si queda vacía, se calcula por año y
    mes.
  - **Nota visible**: un aviso corto en la tarjeta, por ejemplo "solo en
    OneDrive".
  - **Notas internas**: nunca se publican.
  - Reemplazar o quitar el archivo y la portada se aplica al guardar.
  - Si la sesión vence mientras edita, aparece "Su sesión venció". Al
    volver a entrar, lo escrito sigue ahí.
  - Salir con cambios sin guardar pide confirmación.
- **Quitar.**
  - **Despublicar** (reversible): el documento sale de la página pública y
    sus archivos responden 404. Un navegador que ya lo abrió puede
    mostrar su copia hasta 10 minutos.
  - **Borrar definitivamente…**: solo con el documento despublicado, y
    escribiendo su identificador. Borra también su archivo, portada y
    miniatura (si ningún otro documento los usa) y queda en el registro de
    cambios. Solo se recupera desde una copia de seguridad.
- **Categorías.** Crear, renombrar y ordenar. El orden es el del filtro
  "Categoría" de la página pública. Solo se borra una categoría sin
  documentos.
- **Palabras clave.** Muestra cuántos documentos usa cada una. Al
  renombrar una palabra con el texto de otra que ya existe, las dos se
  unen. Solo se borran las que no se usan.
- **Registro de cambios.** Quién hizo qué y cuándo: crear, editar,
  publicar, despublicar, borrar, archivo, portada, categorías, palabras e
  inicios de sesión. Cada documento tiene su "Historial de cambios".
- **Asistente ODES.** Estado del índice del chat de `/odes` y botón
  **Reindexar**. Úselo después de cambiar documentos: hasta entonces el
  asistente responde con el índice anterior.

### Copias de seguridad

- **Todo está en la base**: datos, archivos, administradores y registro de
  cambios. Las copias automáticas de Cloud SQL lo incluyen todo. Active las
  **copias diarias** y la **recuperación a un momento dado** (registros
  binarios) en la instancia.
- **Tamaño.** Con la carga inicial la base ocupa unos 510 MB, de los
  cuales 482 MB son archivos. Crece con cada archivo que se sube; un PDF de
  10 MB suma unos 10 MB a la base y otro tanto a los registros binarios
  mientras se conserven. Calcule el disco de la instancia y la retención con
  eso.
- **Copia manual** (por ejemplo antes de un cambio grande), con la cuenta
  administradora o desde la consola (**Exportar** a Cloud Storage):

  ```bash
  mysqldump -h <IP de Cloud SQL> -u <cuenta_admin> -p \
    --ssl-mode=VERIFY_CA --ssl-ca=server-ca.pem \
    --single-transaction --hex-blob --no-tablespaces --set-gtid-purged=OFF \
    --max-allowed-packet=64M repositoriobd | gzip > repositoriobd-$(date +%F).sql.gz
  # Restaurar en una base vacía (con esquema o sin él):
  gunzip -c repositoriobd-AAAA-MM-DD.sql.gz | mysql -h <IP> -u <cuenta_admin> -p \
    --ssl-mode=VERIFY_CA --ssl-ca=server-ca.pem --max-allowed-packet=64M repositoriobd
  ```

  - El archivo pesa casi lo mismo que la base: los PDF casi no se
    comprimen.
  - `--hex-blob` es necesario para que los archivos binarios viajen
    intactos.
  - `--set-gtid-purged=OFF` permite restaurar en otra instancia de Cloud
    SQL.
- El paquete `repositorio-datos` de la carga inicial sigue siendo una copia
  de los 372 productos tal como se publicaron. Lo que se cambió después
  solo está en la base.

### Seguridad del repositorio

- **Lectura pública, escritura con sesión.** Toda la API de administración
  exige sesión (401 sin ella), también para ver los archivos de los
  documentos despublicados.
- **Contraseñas.** scrypt con sal propia, mínimo 12 caracteres. Se crean
  con la CLI, nunca por argumentos de la línea de comandos.
- **Sesión.** Un token aleatorio en la cookie `repositorio_sesion`:
  - atributos `HttpOnly`, `SameSite=Strict`, `Secure` en producción y
    `Path=/api/repositorio/admin`;
  - la base guarda solo el sha256 del token: quien lea la base no puede
    suplantar a nadie;
  - vence a los 30 minutos sin uso y a las 12 horas en cualquier caso;
  - "Cerrar sesión" la borra; cambiar la contraseña con `crear-admin`
    cierra todas las sesiones de ese usuario.
- **CSRF.** Toda petición que cambia algo lleva la cabecera `X-CSRF-Token`
  de la sesión. Además se rechazan las peticiones de otro sitio
  (`Sec-Fetch-Site`, o `Origin` contra `Host`) con 403.
- **Bloqueo de intentos.** 5 fallos de un usuario o 20 desde una IP en 15
  minutos bloquean el inicio de sesión por 15 minutos (429 con
  `Retry-After`). El mensaje es el mismo para un usuario inexistente y para
  una contraseña equivocada (también para un usuario con tildes, que no
  puede existir). Cada intento se reserva en la base antes de verificar la
  contraseña, así que muchas peticiones simultáneas no se saltan el límite:
  como mucho 5 llegan a verificarse. Una IPv6 cuenta por su prefijo `/64`.
  Detrás de nginx, `TRUST_PROXY=loopback` es **obligatorio**: sin él todas
  las peticiones parecen venir de 127.0.0.1 y 20 fallos de cualquiera
  bloquearían a todos.
- **Cookie `Secure` detrás de HTTPS.** nginx termina el TLS y Nest envía la
  cookie con `Secure`; el navegador la acepta porque su conexión es HTTPS.
  Si el sitio se sirve por http plano (red interna, sin nginx con TLS), el
  navegador no guarda una cookie `Secure` y no se puede iniciar sesión:
  ponga `REPOSITORIO_COOKIE_SEGURA=false`.
- **Iframe.** La página pública se puede incrustar (con
  `CSP_FRAME_ANCESTORS`), pero la administración debe abrirse directamente:
  dentro de un iframe de otro sitio la cookie `SameSite=Strict` no viaja.
- **Archivos.**
  - El tipo se valida por su contenido (firma del PDF, PNG, JPEG o ZIP de
    Office) y por tamaño (80 MB el archivo y 5 MB la portada; la portada
    debe medir exactamente 720 × 720 y la miniatura 192 × 192).
  - Lo subido se escribe en un temporal y pasa a la base dentro de una
    transacción.
  - El servidor solo entrega archivos de su propia base, nunca hace de
    proxy de URL externas, y las URL externas solo pueden ser http(s).
- **Base.** El usuario de la aplicación solo tiene `SELECT`, `INSERT`,
  `UPDATE` y `DELETE`. La conexión va cifrada con la CA de Cloud SQL. Deje
  `apps/server/.env` con permisos `600` (y corra las CLI con
  `sudo -u sapiencia`).
- **CSP sin cambios.** El worker de pdf.js sale del propio sitio y pdf.js 6
  no usa `eval`.

### Cómo lo usa el Asistente ODES

El indexador del asistente lee los documentos publicados de esta base
(`--fuente mysql`, la fuente por defecto cuando `REPOSITORIO_MYSQL_*` está
configurada). Las respuestas enlazan a las copias propias
(`/api/repositorio/documentos/<id>/ver#page=N`) y muestran las miniaturas de
la base. "Reindexar" (en `/repositorio/admin/asistente`) actualiza el índice
sin reiniciar. La máquina del servidor necesita `poppler-utils`,
`tesseract-ocr`, `tesseract-ocr-spa` y `unzip`; si faltan, el estado muestra
qué instalar y el índice anterior sigue en uso. Ver
[Relación con `/repositorio`](#relación-con-repositorio) y
[Generar o actualizar el índice](#generar-o-actualizar-el-índice).

### Desarrollo y pruebas con una MySQL local

Para desarrollar no hace falta Cloud SQL: use una MySQL desechable en su
equipo, **nunca** la de la entidad. Por ejemplo, con la MySQL de Homebrew,
sin tocar su servicio:

```bash
mkdir -p /tmp/mysql-repo && mysqld --initialize-insecure --datadir=/tmp/mysql-repo/datos
cd /tmp/mysql-repo && mysqld --datadir=/tmp/mysql-repo/datos --port=33306 \
  --bind-address=127.0.0.1 --socket=m.sock --mysqlx=OFF --skip-log-bin &
# base + usuario (permisos.sql con la contraseña reemplazada) y esquema:
sed 's/CAMBIAR_CONTRASENA/clave-local-de-prueba/' apps/server/db/repositorio/permisos.sql | mysql -h127.0.0.1 -P33306 -uroot
```

Luego, en `apps/server/.env`:

```ini
REPOSITORIO_MYSQL_HOST=127.0.0.1
REPOSITORIO_MYSQL_PORT=33306
REPOSITORIO_MYSQL_USER=repositorio_app
REPOSITORIO_MYSQL_PASSWORD=clave-local-de-prueba
```

Y desde la raíz del proyecto:

```bash
REPOSITORIO_MIGRAR_USUARIO=root REPOSITORIO_MIGRAR_CONTRASENA= npm run repositorio:migrar
npm run repositorio:crear-admin -- --usuario admin --nombre "Admin local"
npm run repositorio:importar -- --paquete ../../Septiembre/observatorio/repositorio-datos --miniaturas apps/web/public/odes/portadas
npm run dev        # http://localhost:5173/repositorio y /repositorio/admin
```

En desarrollo (`NODE_ENV=development`) la cookie no lleva `Secure`, así que
el inicio de sesión funciona por http. Para terminar, detenga ese `mysqld` y
borre `/tmp/mysql-repo`.

Las pruebas del servidor que necesitan MySQL se activan con
`MYSQL_PRUEBAS` y crean y borran sus propias bases y usuarios:

```bash
MYSQL_PRUEBAS=mysql://root@127.0.0.1:33306 npm run test:e2e --prefix apps/server
```

Sin esa variable se omiten y lo avisan (`Pruebas con MySQL OMITIDAS`). Todo
se probó en MySQL 9.6; el SQL evita a propósito lo que no existe en la 8.0.18
de Cloud SQL (sin alias de fila en `INSERT`, sin `TABLE` ni `VALUES ROW`).

### Problemas frecuentes

| Síntoma | Causa y solución |
| --- | --- |
| `/api/repositorio/...` responde 503 | Faltan variables, la IP de la VM no está autorizada, el certificado no corresponde o falta el esquema. El registro dice cuál. El servidor reintenta solo: no hace falta reiniciarlo después de corregir la red o el esquema. |
| No se puede iniciar sesión y no hay error | El sitio se sirve por http plano y la cookie lleva `Secure`: use HTTPS o `REPOSITORIO_COOKIE_SEGURA=false`. |
| "Demasiados intentos fallidos" para todos | Falta `TRUST_PROXY=loopback` detrás de nginx (todas las IP parecen 127.0.0.1). |
| Subir un archivo falla con 413 | nginx sin el bloque `location /api/repositorio/admin/` con `client_max_body_size 85m` (sección 3 del despliegue). |
| Subir una evidencia del PAI de más de 1 MB falla con 413 (página HTML de nginx, sin el JSON del PAI) | nginx sin el bloque `location /api/pai/` con `client_max_body_size 26m` (sección 3 del despliegue; solo en la VM sin Supabase). |
| `/api/repositorio`, `/api/sivu/tableros` o `/api/pai` responden 503 y el registro dice "se necesita la 3" | Falta migrar: `node dist/repositorio/cli/migrar.js --usuario <cuenta_admin>` (aplica las migraciones que falten, aunque haya una posterior registrada a mano). |
| `repositorio:migrar` dice que no tiene permisos | Se está usando el usuario de la aplicación: use `--usuario <cuenta_admin>`. |
| "using password: NO" con una contraseña que empieza por `#` | Póngala entre comillas simples en `.env`. |
| "Reindexar" falla con "faltan herramientas" | Instale `poppler-utils tesseract-ocr tesseract-ocr-spa unzip` en la VM. |
| Una CLI dice que `apps/server/.env` "existe pero este usuario no lo puede leer" (o, en versiones anteriores, `ENOENT` sobre un `.env` que sí existe) | Se ejecutó como otro usuario: `.env` tiene permisos `600` de `sapiencia`. Use `sudo -u sapiencia node dist/...`. |
| `importar` dice "se borraron en la administración" o "se modificaron en la administración" | Es a propósito: no deshace el trabajo de la administración. `--restaurar-borrados` y `--forzar` lo hacen si de verdad se quiere. |
| 503 "atendiendo muchas solicitudes a la vez" y el registro dice "Pool de MySQL saturado" | Más consultas simultáneas de las que admite el pool (conexiones + 200 en espera). Es momentáneo (`Retry-After: 2`); si se repite, suba `REPOSITORIO_MYSQL_CONEXIONES`. |

Más en [`apps/server/db/repositorio/LEEME.md`](apps/server/db/repositorio/LEEME.md).

## Página principal (`/principal`)

Es la página principal de https://sapiencia.gov.co/observatorio/ dentro del
aplicativo, y **no usa React**. Muestra el bloque de WordPress del
Observatorio (`apps/web/principal/observatorio-bloque.html`) tal cual, byte
por byte, dentro de una página que hace de tema: la cabecera y el pie del
Observatorio, la columna de 1070 px de sapiencia.gov.co y su botón "Volver
arriba".

**Regla:** todo cambio que deba verse en `/principal` se hace en
`observatorio-bloque.html`, pensado para WordPress, y luego ese archivo se
pega completo en el elemento "Raw HTML" de WPBakery. Las pruebas de
`apps/web/principal/bloque.test.ts` vigilan las reglas de WordPress: estilos
bajo `#odes-observatorio`, nada que parezca un shortcode, nada de otros
sitios, sin `<strong>`, `<header>` ni `target`, un solo script y sin
caracteres invisibles. Los detalles y el paso a paso están en
[`apps/web/principal/LEEME.md`](apps/web/principal/LEEME.md).

Cómo funciona:

- `apps/web/principal/index.html` es una segunda entrada de Vite, aparte de
  la SPA. El plugin `principal/plugin-vite.ts` le inserta el bloque después de
  que Vite procesa la página, así el bloque no se minifica ni se reescribe.
- En desarrollo, http://localhost:5173/principal relee el bloque en cada
  petición y recarga el navegador al guardarlo.
- Al compilar queda `apps/web/dist/principal/index.html`. NestJS lo sirve en
  `/principal` con su propia CSP: la del sitio, con un `script-src` que
  autoriza los scripts en línea por su hash.

## SIVU (`/sivu`)

La página tiene, de arriba abajo:

1. La cabecera del Observatorio (la misma de `/repositorio` y de la Plantilla
   Sapiencia).
2. El **bloque del edificio**: el port a React del bloque de WordPress
   `Septiembre/observatorio/edificio-3d/edificio-3d-bloque.html` (v1.2), con
   los tokens de la Plantilla Sapiencia. En pantallas anchas, el panel morado
   (logo del Observatorio, título y los botones "Ingresar" y "Conoce más")
   va encima de la escena, a la izquierda, y el edificio se centra en la zona
   libre; por debajo de unos 960 px el panel va arriba y la escena debajo.
   - **Ingresar** lleva la cámara a la puerta (lo mismo que el doble clic) y,
     al llegar, abre la batería de indicadores (`/tableros/bateria-indicadores`).
     Si el edificio aún carga, la animación arranca cuando termine.
   - **Conoce más** baja a los tableros.
   - Barra de controles: pausa del giro automático, girar a cada lado,
     acercar y alejar.
3. Los **tableros de información** (`#tableros`).
4. El pie del Observatorio.

Como el edificio vive en una página con scroll, el visor no se adueña de
ella: la rueda solo acerca con Ctrl o Cmd (sin tecla, la página baja y un
aviso explica cómo acercar), en celulares el deslizamiento vertical mueve la
página y el horizontal gira el edificio, y no hay atajos de teclado (los
botones de la barra los reemplazan). Por lo mismo, frente al primer port se
quitaron el movimiento con WASD y flechas, Espacio para pausar, el
desplazamiento lateral, el recorrido cinematográfico, la ventana de ubicación,
la pantalla completa y la barra superior con íconos sin acción.

**Agregar un tablero:** edite `apps/web/src/sites/sivu/datos/tableros.ts`.
Cada tablero lleva `titulo`, `descripcion`, `tema` (la etiqueta morada) y,
cuando esté publicado, `url`. Sin `url` la tarjeta dice "Próximamente". Una
dirección de otro sitio (por ejemplo, un Power BI publicado) se abre en una
pestaña nueva; una ruta propia (por ejemplo `/sivu/tableros/matricula`)
recarga la página. Para un tablero hecho en React dentro de esta app, agregue
su página en `apps/web/src/sites/sivu/paginas/`, su ruta en `SivuSitio.tsx` y,
si necesita datos del servidor, sus endpoints en `apps/server/src/sivu/`. Si
guarda datos en la base, sus tablas van en una migración nueva con el nombre
`sivu_tablero_<tablero>_<tabla>` (como `sivu_tablero_matricula_2025_ies`) y
su fila en `sivu_tableros`.

**Textos que quizá quiera cambiar:** el título del panel (`TITULO_SIVU` en
`componentes/Edificio3D.tsx`, también es el título de la pestaña) y el nombre
de la cabecera (`componentes/CabeceraSivu.tsx`).

## Cómo hacer crecer la rama /odes

**Páginas (React)**, en `apps/web/src/sites/odes/` (ver su `LEEME.md`):

- `OdesSitio.tsx` es la raíz de la rama: carga la plantilla (`kit/`), la
  cabecera y el pie, y define las subrutas como `<Route>` relativas a
  `/odes`. Las páginas van en `paginas/`.
- Los estilos van en `odes.css`, anidados bajo `.odes`. La plantilla de
  Sapiencia sí es global (`body`, `main`, `h1`...): por eso los enlaces que
  salen de `/odes` recargan la página (`reloadDocument`) y la plantilla nunca
  convive con `/sivu` en el mismo documento.
- No importe nada de `sites/sivu` desde ODES ni al revés.
- Las pruebas que montan la rama completa deben simular `kit/KitPlantilla`
  (jsdom no carga hojas de estilo y React esperaría 60 s); `router.test.tsx`
  muestra cómo.

**API (NestJS)**, en `apps/server/src/odes/`:

- `OdesModule` registra el chat (`chat/`) e importa `RepositorioModule`
  (`repositorio/`), que exporta el proveedor `RepositorioOdes`. El chat solo
  depende de esa clase abstracta (`repositorio.tipos.ts`), así se prueba con
  un repositorio en memoria (`test/odes-apoyo.ts`).
- El paquete es ESM (NodeNext): los imports relativos llevan la extensión
  `.js`, por ejemplo `import { X } from './x.service.js'`.
- Las pruebas unitarias van junto al código (`*.spec.ts`) y las e2e en
  `apps/server/test/`. Las e2e del chat usan el SDK real de Anthropic contra
  el simulador (`src/odes/cli/simulador-claude.ts`): nunca llaman a la API.
- El chat hace su propia comprobación contra peticiones de otros sitios
  (`chat/validacion.ts`). Si agrega otros endpoints `POST`, active la
  protección CSRF de Nest 12 (`app.enableCsrfProtection()`) en
  `configurar-aplicacion.ts` o repita esa comprobación, y valide los datos de
  entrada.

## Cómo hacer crecer la rama /repositorio

**Páginas (React)**, en `apps/web/src/sites/repositorio/` (ver su `LEEME.md`
y el de `admin/`):

- `RepositorioSitio.tsx` es la raíz: cabecera y pie del Observatorio y las
  subrutas (página pública, `admin/*` en otro chunk y la 404 de la rama).
- Los estilos van anidados bajo `.repositorio` (clases `rp-*`) y los de la
  administración usan además `ra-*`. Los enlaces que salen de la rama
  recargan la página (`reloadDocument`), como en las otras ramas.
- La búsqueda (`busqueda/`) y los filtros (`filtros/`) son TypeScript puro
  y tienen pruebas contra el bloque de WordPress: si los cambia, corra
  `npm test --prefix apps/web`.
- La tarjeta pública (`componentes/TarjetaDocumento.tsx`) es la misma de la
  vista previa de la administración.

**API (NestJS)**, en `apps/server/src/repositorio/`:

- El contrato es `api-repositorio.ts`, con copia idéntica en `apps/web`.
  Solo cambios compatibles hacia atrás, y después copie el archivo completo
  al otro paquete.
- Un endpoint de administración nuevo, aunque sea de otro módulo, va bajo
  `/api/repositorio/admin/...` (la cookie solo viaja ahí) con
  `@UseGuards(GuardiaAdminRepositorio)` y `@UseFilters(FiltroErroresRepositorio)`.
  Así lo hace `src/odes/admin/indice-admin.controller.ts`.
- Para leer documentos desde otro módulo, importe
  `RepositorioProductosModule` y use `ServicioLecturaRepositorio` (solo
  publicados, sin notas internas).
- Un cambio de esquema es una migración nueva,
  `db/repositorio/migraciones/NNN-nombre.sql` (y su par en `postgres/`), más
  subir `VERSION_ESQUEMA_REQUERIDA` (`bd/base-datos.ts`). Debe funcionar en
  MySQL 8.0.18. La aplicación nunca hace DDL: lo aplica TI con
  `repositorio:migrar`. Una tabla nueva lleva el prefijo de su módulo
  (`repositorio_`, `sivu_`, `pai_`, `sistema_`; las de un tablero,
  `sivu_tablero_<tablero>_<tabla>`; ver `db/repositorio/LEEME.md`):
  `bd.spec.ts` falla si no, y él y
  `test/repositorio-bd.e2e-spec.ts` cuentan las tablas (hoy 36). Un módulo
  que guarda archivos tiene su propio almacén (`<módulo>_almacen_archivos` y
  `<módulo>_almacen_archivo_trozos`), y ninguna llave foránea cruza de un
  módulo a otro (también lo comprueba `bd.spec.ts`).

## Cómo hacer crecer la rama /pai

- **Una vigencia nueva** (2027): genere `apps/server/datos/pai/2027/pai-2027.json`
  con el extractor (ver el `LEEME.md` de 2026) y cárguela con
  `npm run pai:cargar-fichas -- --vigencia 2027`. Las vigencias conviven: la
  API usa la más reciente salvo `?vigencia=`, y las asignaciones son por
  vigencia (hay que asignar de nuevo en `/pai/admin/usuarios`). En la web,
  con más de una vigencia aparece el selector «Vigencia» en la barra: todas
  las páginas (tablero, seguimiento, bimestre, usuarios y asignaciones,
  autorizaciones y la exportación) consultan el año elegido, así que se puede
  terminar el Bimestre 6 del año anterior (abrirlo, asignar, autorizar,
  reportar) después de cargar el siguiente. En una vigencia que no es la más
  reciente, la ficha se enlaza por id (`/pai/indicadores/<id>`), porque el
  código lleva a la más reciente (la API también resuelve el código en un
  año dado: `GET /api/pai/indicadores/<código>?vigencia=2026`).
- **Reglas y cálculos** en `apps/server/src/pai/dominio/` (puros, con
  pruebas): `calculo-pai.ts` (la prueba recalcula los 344 indicadores del
  JSON y los compara con los Excel, con las excepciones documentadas),
  `reglas-edicion.ts` (matriz rol × asignación × bimestre) y `filtros-pai.ts`
  (los filtros del CSV, con la misma semántica que `tablero/filtros.ts` de la
  web).
- **Contrato**: `api-pai.ts`, solo cambios compatibles hacia atrás, y copie el
  archivo completo al otro paquete.
- **Esquema**: una migración nueva `NNN-*.sql` en MySQL y en Postgres, subir
  `VERSION_ESQUEMA_REQUERIDA` y agregar las tablas con id autoincremental a
  `TABLAS_CON_ID` (`conexion.ts`), o `insertId` vale 0 en Postgres. Las tablas
  del PAI llevan el prefijo `pai_`.
- **Interfaz**: todo bajo `.pai` con clases `pai-…`, marcado del kit (`card
  card-lg`, `form-control`, `btn`, `alert`, `progress`) y modales de React
  (`componentes/ModalPai.tsx`). Las pruebas que montan el sitio simulan
  `EstilosPai`.

## Cómo reemplazar el modelo 3D

1. Exporte el modelo desde Blender en **glTF binario (`.glb`)** con
   **compresión Draco** activada. Las texturas en WebP están soportadas.
2. El nodo de la entrada debe llamarse **`PUERTA`**. Se compara sin importar
   mayúsculas y sin espacios alrededor; si hay varios, se usa el último. Ese
   nodo define dónde arranca la cámara, el doble clic y el botón "Ingresar".
   Si no existe, el visor funciona igual, pero avisa en la consola y no hay
   animación de entrada.
3. Reemplace `apps/web/public/sivu/edificiofinal.glb` (mismo nombre) y
   ejecute `npm run build`. Para usar otro nombre, cambie `URL_MODELO` en
   `apps/web/src/sites/sivu/rutas.ts`.
4. No hace falta cambiar el nombre para evitar la caché: el servidor envía el
   modelo con `no-cache` y un ETag calculado con el contenido, así que los
   navegadores bajan el nuevo en la siguiente visita. Mientras el modelo no
   cambie, un build o un despliegue nuevo no obliga a bajarlo otra vez (la
   revalidación responde 304).
5. El decodificador Draco se copia de `three@0.180.0` a `/sivu/draco/` en cada
   `npm install` y `npm run build` (`apps/web/scripts/copiar-draco.mjs`). three
   está fijado en `0.180.0`, la misma versión del original. Antes de subir de
   versión, pruebe el visor completo: la cámara inicial, el giro automático,
   "Ingresar" y los botones de la barra (girar, acercar y alejar usan métodos
   internos de OrbitControls: `_rotateLeft`, `_dollyOut`, `_dollyIn`).

## Pruebas

- **Front-end** (`apps/web`, Vitest + Testing Library en jsdom):
  - el enrutado de las ramas, la 404 y los errores de carga de chunks;
  - `/principal`: las reglas de WordPress del bloque (estilos bajo
    `#odes-observatorio`, shortcodes, recursos externos, etiquetas que el
    sitio altera, script, ids y caracteres invisibles) y la inserción del
    bloque tal cual en la página;
  - la interfaz de SIVU con el motor 3D simulado (carga, errores, foco,
    "Ingresar", "Conoce más", barra, aviso de la rueda, tableros);
  - el motor 3D con un renderizador falso y un .glb mínimo (rueda, gestos,
    barra, entrada, contexto WebGL, encuadre con el panel, liberación);
  - la matemática del visor (radio de seguridad, enfoque de la puerta);
  - el chat de ODES: lector SSE, validación de eventos, estado de la
    conversación, citas y fuentes, errores y reintentos, y que el nombre
    nunca viaje en la petición;
  - el repositorio: la búsqueda difusa y los filtros (comparados con el
    bloque de WordPress sobre los 372 productos), la tarjeta, la página con
    `fetch` simulado, y la administración con la API simulada (sesión, 401,
    429, CSRF, formulario, palabras clave, subida, portada automática con
    los mismos píxeles que Pillow, borrado, cambios sin guardar, catálogos y
    Asistente ODES);
  - el PAI: el cliente HTTP (CSRF, 401, reintento en 503, subidas), el
    ingreso (401, 429, 503, contraseña temporal, sesión vencida con la página
    montada), el tablero (solo la casilla editable es un campo, CSRF y token
    de concurrencia, 409 y 403, administrador en solo lectura, filtros
    dependientes y en la URL, exportación con los filtros), los modales de
    observaciones (riesgo condicional, cambios sin guardar) y evidencias
    (tipo y tamaño en el navegador, subida multipart y directa), la ficha y
    las páginas de administración con una API simulada.
- **Servidor** (`apps/server`, Vitest + supertest):
  - unitarias de configuración, CSP y reglas de rutas, y los hashes de los
    scripts en línea de `/principal` (comentarios, JSON, `src`, saltos de
    línea, UTF-8);
  - e2e contra un build falso: `/principal` (página tal cual, CSP por hash,
    304, gzip, build nuevo sin reiniciar, 404 y 503), API, fallback de la
    SPA, caché y ETag por contenido, compresión, cabeceras de seguridad,
    404/503, errores 412/416/500 (sin caché, sin rutas del disco y sin ruido
    en el log) y path traversal;
  - Asistente ODES: normalización y consultas FTS5 (incluidas entradas
    hostiles), indexación, búsqueda contra el índice real cuando existe,
    herramientas, citas, límites de uso, validación y SSE, y el motor de IA
    con el SDK real de Anthropic contra el simulador local (nunca contra la
    API). La calidad de la búsqueda se mide aparte con
    `npm run odes:evaluar-busqueda`;
  - repositorio: configuración, scrypt, normalización, validación, tipos de
    archivo por firma, ZIP de Office, Range y nombres de descarga, y el
    paquete de la carga inicial. Sin base, las e2e comprueban el 503 y la
    API sin base. Las pruebas con base corren igual con MySQL o con
    Postgres, con `POSTGRES_PRUEBAS=postgres://postgres@127.0.0.1:<puerto>/postgres`
    (una Postgres desechable; incluyen Supabase Storage con un bucket falso:
    redirecciones, subida directa y huérfanos) o con
    `MYSQL_PRUEBAS=mysql://root@127.0.0.1:<puerto>` (una MySQL desechable; ver
    [Desarrollo y pruebas con una MySQL local](#desarrollo-y-pruebas-con-una-mysql-local))
    corren además las de la base y la API completa: esquema, importación,
    archivos en trozos, sesiones, CSRF, bloqueo, documentos, catálogos, la
    fuente MySQL del indexador de ODES y "Reindexar". Crean y borran sus
    propias bases y usuarios.
  - PAI: unitarias de cálculo (los 344 indicadores contra los Excel),
    reglas de edición, validación, permisos, el cargador (ida y vuelta del
    JSON), la sesión y los usuarios, las evidencias y la CLI. Sin base, las
    e2e comprueban que todo `/api/pai/*` responde 503 JSON. Con
    `MYSQL_PRUEBAS` o `POSTGRES_PRUEBAS`: la migración 003, el ingreso por
    rol, CSRF y mismo sitio, que un responsable no escriba un indicador ajeno,
    un bimestre cerrado o vencido ni rutas de administración, que el
    administrador no escriba reportes, las autorizaciones (abren un bimestre
    y dejan de hacerlo al revocarse), las evidencias en la base y en un bucket
    privado falso (URL firmada), que el recolector de huérfanos no las borre,
    la carga del JSON real con los mismos números en la API, y el CSV.

## Diferencias con la versión original

La versión original (HTML + CSS + JavaScript con three.js r180 desde
jsDelivr) es de Sebastian Aguilar, igual que el modelo 3D. SIVU conserva su
escena: las mismas luces, la cámara inicial frente a la puerta, el giro
automático, el enfoque de la entrada con doble clic y la protección de la
cámara contra el edificio. La interfaz es la del bloque del Observatorio
(ver [SIVU](#sivu-sivu)).

**Robustez:**

- three.js y el decodificador Draco se sirven desde el propio servidor, no
  desde un CDN. Así el sitio funciona en redes que bloquean CDN y con una CSP
  estricta.
- Al salir de la página se libera todo: bucle, listeners, geometrías, texturas
  y contexto WebGL. El original no liberaba nada.
- La descarga del modelo se puede cancelar y muestra el progreso; los errores
  (sin red, modelo no encontrado o ilegible, sin WebGL, contexto WebGL
  perdido) se muestran en español, con "Reintentar" cuando sirve.
- El enfoque de la puerta va a la misma velocidad en pantallas de 60 y 120 Hz
  y termina aunque la protección del edificio no deje llegar a la cámara.
- Solo dibuja cuando algo se mueve y la escena está en pantalla.
- Si el usuario prefiere menos movimiento (`prefers-reduced-motion`), el giro
  automático empieza en pausa y la entrada es instantánea.
- Se quitaron los `console.log` de depuración. Se conserva el aviso cuando
  falta la `PUERTA`.

La imagen `fondo-medellin.png` de la entrega original no se usaba en ninguna
parte y no se migró.

## Créditos

- **Modelo 3D y versión original del visor** (HTML, CSS, JavaScript y
  three.js, con su documentación): **Sebastian Aguilar**.
- Migración a NestJS + React (octubre de 2026): este repositorio.
