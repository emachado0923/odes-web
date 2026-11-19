# apps/web — front-end React (Vite)

React 19 + React Router 8 (modo data router) + Vite 8. En producción lo sirve
NestJS (`apps/server`) desde `dist/`; en desarrollo Vite corre en
http://localhost:5173 y reenvía `/api` a Nest: http://localhost:3000 por
defecto, o el `PORT`/`HOST` que use el servidor (del entorno del proceso o de
`apps/server/.env`; ver `vite.config.ts`).

## Rutas

| Ruta       | Contenido                                                         |
| ---------- | ----------------------------------------------------------------- |
| `/`        | Inicio: enlaces a la página principal, SIVU, ODES, el repositorio, el PAI y la medida de pertinencia (`src/inicio/`). |
| `/principal` | Página principal del Observatorio en **HTML puro, sin React**: el bloque de WordPress tal cual (`principal/`, ver su [`LEEME.md`](principal/LEEME.md)). |
| `/sivu/*` | SIVU — Sistema de Visualización de Datos: edificio en 3D y tableros (`src/sites/sivu/`, chunk diferido). |
| `/odes/*`  | Asistente ODES: pantalla de ingreso en `/odes` y chat sobre el repositorio del Observatorio en `/odes/chat` (`src/sites/odes/`, chunk diferido; ver su [`LEEME.md`](src/sites/odes/LEEME.md)). |
| `/repositorio` | Repositorio de Productos del Observatorio: búsqueda difusa, filtros y tarjetas, con los datos de `GET /api/repositorio/documentos` (`src/sites/repositorio/`, chunk diferido; ver su [`LEEME.md`](src/sites/repositorio/LEEME.md)). |
| `/tableros/*` | Tableros del Observatorio, con la plantilla de Sapiencia (`src/sites/tableros/`, chunk diferido; el de matrícula 2025 en su propio chunk con ECharts). |
| `/pai/*` | Plan de Acción Institucional: ingreso propio, tablero de indicadores por bimestre con filtros en la URL, observaciones y evidencias, ficha del indicador, Mi cuenta y la administración de Planeación (`/pai/admin/*`) (`src/sites/pai/`, chunk diferido; ver su [`LEEME.md`](src/sites/pai/LEEME.md)). |
| `/pertinencia/*` | Medida de pertinencia, con la cabecera y el pie oficiales de sapiencia.gov.co recreados. Su contenido es el bloque de WordPress `pertinencia/pertinencia-bloque.html` (fuente única, como `/principal`; ver `pertinencia/LEEME.md`): presentación, el tablero de consulta (estático en `public/tableros/pertinencia/`), "Conoce más" y los accesos a la normativa, con sus enlaces en la sección EDITAR ENLACES del bloque (`src/sites/pertinencia/`, chunk diferido). |
| `/repositorio/admin/*` | Administración del repositorio: sesión, documentos (archivo, portada automática con pdf.js), categorías, palabras clave, registro de cambios y "Reindexar" del Asistente ODES (otro chunk; ver [`admin/LEEME.md`](src/sites/repositorio/admin/LEEME.md)). |
| `*`        | 404 global (`src/compartido/NoEncontrado.tsx`).                   |

Cada rama se carga con `route.lazy`, define sus subrutas con `<Routes>`
descendientes, tiene su propio `errorElement` y su CSS anidado bajo su clase
raíz (`.inicio`, `.sivu`, `.odes`, `.repositorio`, `.tableros`, `.pai`,
`.pertinencia`).
`src/index.css` es solo un reinicio mínimo.

`/principal` no es parte del router: `principal/index.html` es una segunda
entrada de Vite (`build.rolldownOptions.input`) a la que el plugin
`principal/plugin-vite.ts` le inserta `principal/observatorio-bloque.html` tal
cual. En desarrollo ese plugin también atiende http://localhost:5173/principal
y recarga el navegador al guardar el bloque. **Todo cambio de `/principal` se
hace en el bloque**, que luego se pega en WordPress; `principal/bloque.test.ts`
revisa que siga cumpliendo las reglas de WordPress.

La rama `/odes` además carga, solo allí, la plantilla de Sapiencia desde
`public/odes/kit/` (CSS global, fuentes y botón de accesibilidad). Por eso los
enlaces entre ramas recargan la página (`reloadDocument`). Sus miniaturas
(`public/odes/portadas/`) las genera el indexador del servidor
(`npm run odes:indexar -- --miniaturas`). El chat habla con
`/api/odes/estado` y `/api/odes/chat` (Server-Sent Events sobre `fetch`); el
protocolo es `src/sites/odes/chat/protocolo.ts`, copia idéntica del de
`apps/server`.

`/tableros` y `/pai` también cargan la plantilla, con las correcciones
compartidas de `src/compartido/plantilla/correcciones-plantilla.css`
(`EstilosTableros` / `EstilosPai`, que las pruebas simulan). `/pai` habla con
`/api/pai/*`; su contrato es `src/sites/pai/api-pai.ts`, copia idéntica del
de `apps/server`. Su sesión es propia (cookie `pai_sesion`, CSRF en memoria),
y todas las reglas (qué casilla es editable) llegan calculadas del servidor.

La rama `/repositorio` no usa la plantilla de Sapiencia: trae su propia
cabecera y pie del Observatorio, la fuente Rubik y los logos desde
`src/sites/repositorio/recursos/` (pasan por Vite, con hash y caché larga).
Habla con `/api/repositorio/*`; el contrato es
`src/sites/repositorio/api-repositorio.ts`, copia idéntica del de
`apps/server`. pdf.js (`pdfjs-dist`) solo se carga en la administración, al
generar una portada; su worker y sus recursos salen del propio sitio, así
que funciona con la CSP estricta.

## Scripts

- `npm run dev` — servidor de desarrollo (puerto 5173, fijo).
- `npm run build` — verificación de tipos + compilación a `dist/` (la SPA en
  `dist/index.html` y la página principal en `dist/principal/index.html`).
- `npm run preview` — sirve `dist/` en el puerto 4173.
- `npm test` — pruebas con Vitest + Testing Library (jsdom).
- `npm run typecheck` / `npm run lint` — TypeScript y oxlint.

`scripts/copiar-draco.mjs` (en `postinstall`, `predev` y `prebuild`) copia el
decodificador Draco de `three` a `public/sivu/draco/` (ignorado por git), para
servirlo desde nuestro origen en `/sivu/draco/`.
