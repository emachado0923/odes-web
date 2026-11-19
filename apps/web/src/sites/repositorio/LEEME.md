# Rama `/repositorio`: Repositorio de productos del Observatorio (interfaz)

Página pública con los productos del Observatorio de Sapiencia (boletines,
estudios, infografías, informes de tendencias, notas temáticas, tableros de
Power BI y otros productos) y, en `/repositorio/admin`, su administración. Los
datos vienen de la API del servidor (`GET /api/repositorio/documentos`, solo
lo publicado), que los lee de MySQL o Postgres; aquí no hay ningún JSON con
documentos.

La página pública nació como port a React del bloque de WordPress v4.2
(`Septiembre/observatorio/repositorio/repositorio-bloque.html`) y desde el
12 de noviembre de 2026 sigue los comentarios del Observatorio (ver
"Comentarios del Observatorio" abajo).

## Comentarios del Observatorio (12 de noviembre de 2026)

- **Cabecera y pie de la entidad** (los de sapiencia.gov.co: barra GOV.CO,
  logo de Sapiencia y la Alcaldía, menú, buscador, panel de accesibilidad y
  pie azul), de `src/compartido/sapiencia/`, en la página pública y su 404.
  El panel de accesibilidad actúa sobre el `<main class="sap-contenido">` y
  guarda la preferencia en `localStorage` (`repositorio.accesibilidad`). La
  administración conserva la cabecera y el pie compactos del Observatorio.
- **Textos**: "Repositorio de productos" y "Análisis e investigación sobre
  educación postsecundaria"; el subtítulo es claramente menor que el título y
  la ayuda de uso va aparte de la introducción, más pequeña (`.rp-ayuda`).
- **Filtros**: Categoría, Año y Palabra clave (sin Idioma: `?idioma=` se
  ignora y se borra). Categoría va de la que tiene más productos a la que
  tiene menos. Palabra clave no muestra cuántos productos tiene cada una, y
  las elegidas se ven debajo de los filtros ("Palabras clave seleccionadas"),
  cada una con su botón para quitarla.
- **Tarjeta**: arriba solo el tipo de producto y el año; título, subtítulo
  (si lo tiene), descripción de unas 30 palabras y 6 palabras clave; sin N.º,
  sin idioma, sin formato y sin enlace a la entrada del blog (el micrositio que
  la tenía va a desaparecer).
- **Datos**: se publican todos los productos (documentos, tableros y la
  entrada de blog), con categorías mutuamente excluyentes, año en todos y
  descripción y 6 palabras clave en cada uno. Se aplican con
  `npm run repositorio:revision` (ver `apps/server/db/repositorio/LEEME.md`).

## Archivos

```
sites/repositorio/
├── RepositorioSitio.tsx     raíz de la rama: cabecera, rutas (índice, admin/*, *), pie
├── repositorio.css          todos los estilos, bajo .repositorio (port del <style> del bloque)
├── api-repositorio.ts       contrato HTTP (COPIA IDÉNTICA del de apps/server)
├── rutas.ts                 /repositorio, /repositorio/admin, id del <main>
├── busqueda/                motor de búsqueda (TypeScript puro, sin React)
│   ├── texto.ts             normalizar, palabras vacías, fichas (pares unidos), siglas
│   ├── parecido.ts          distancia OSA y parecido entre palabras (con memoria)
│   ├── indice.ts            campos y pesos de cada documento, puntaje
│   └── resaltar.ts          pedazos para <mark>
├── filtros/
│   ├── estado.ts            estado (q, casillas, orden) ↔ parámetros de la URL
│   ├── facetas.ts           opciones de Categoría (por número de productos), Año y Palabra clave
│   ├── filtrar.ts           filtrar (O dentro, Y entre filtros) y ordenar
│   ├── textos.ts            textos de los filtros y del conteo
│   └── useEstadoUrl.ts      estado de React sincronizado con la URL
├── datos/
│   ├── cliente.ts           GET /api/repositorio/documentos + validación de la respuesta
│   ├── useListado.ts        carga, error y reintento
│   ├── presentacion.ts      datos de la tarjeta (textos limpios, descripción, "sf", claves sin repetir)
│   └── enlaces.ts           URL seguras (solo rutas propias y http/https) y externas
├── componentes/
│   ├── TarjetaDocumento.tsx tarjeta (también la usa la vista previa de la administración)
│   ├── Explorador.tsx       buscador + filtros + tarjetas + "Mostrar 12 más"
│   ├── PanelFiltros.tsx     formulario role="search" y "Palabras clave seleccionadas"
│   ├── FacetaCasillas.tsx   filtro de casillas con su buscador y su teclado
│   ├── Presentacion.tsx     cabecera morada (logo, h1, bajada, introducción)
│   ├── CabeceraRepositorio.tsx, PieRepositorio.tsx   cabecera y pie del Observatorio (solo administración)
│   ├── EstadosListado.tsx   cargando, error (con "Intentar de nuevo") y sin documentos
│   ├── Resaltado.tsx, Icono.tsx
├── paginas/                 PaginaRepositorio (pública) y NoEncontradoRepositorio (404)
├── admin/                   administración en /repositorio/admin (otro chunk; ver admin/LEEME.md)
├── recursos/                logos y Rubik (pasan por Vite: nombre con hash y caché larga)
└── pruebas/                 datos de prueba: los 372 productos reales en forma compacta
```

## Tarjeta: reutilizarla

```tsx
import TarjetaDocumento from '../componentes/TarjetaDocumento'

<TarjetaDocumento documento={documentoPublico} />
```

Props (`PropsTarjeta`): `documento: DocumentoPublico` (obligatoria),
`consulta?` (palabras a resaltar, `terminos(q)`), `clavesActivas?`
(claves normalizadas presionadas), `onClave?` (sin ella, las palabras clave
son etiquetas y no botones), `onDescargar?`, `idTitulo?` (id del `h2`; por
defecto `rp-doc-<id>`). Debe estar dentro de `.repositorio` (lo pone
`RepositorioSitio`) para tener sus estilos.

## Port del bloque v4.2

Lo que sigue describe el port original; los comentarios del Observatorio
(arriba) cambiaron después la cabecera y el pie, el filtro de idioma, el
orden de las categorías, las etiquetas de la tarjeta y su descripción.

**Igual que el bloque (1:1):**

- Búsqueda difusa: normalización, palabras vacías, pares de palabras unidas,
  siglas de nombres en mayúscula, distancia OSA (1 error en 4–5 letras, 2 en
  6 o más con la primera letra igual), prefijos, pedazos de palabra, palabras
  a medio escribir con un error, números exactos o como prefijo, pesos
  (título 3, claves 2,5, categoría 2, subtítulo 1,5, número 1, año 1), +2 si
  la frase está en el título, versiones en inglés ("inglés", "english" y el
  nombre en inglés del tipo), "tablero interactivo" y "entrada blog",
  resaltado con `<mark>`. Se comprobó con el script del bloque sobre los 372
  documentos: 92 búsquedas × 4 órdenes, filtros, buscadores de los paneles y
  resaltado dan exactamente lo mismo.
- Filtros, orden, conteo "N de M documentos coinciden" (aria-live, con
  400 ms de pausa mientras se escribe), "Limpiar filtros" (no toca el orden),
  12 tarjetas por página y "Mostrar 12 más" con el foco en el título de la
  primera tarjeta nueva, teclado de los paneles, botón "Filtros" en celular.
- Tarjeta, clases `rp-*`, tokens de color, medidas y rejillas (tarjetas
  3/2/1; filtros 5 en fila en PC y 3 + 2 en tableta).

**Adaptado:**

- Los datos llegan de la API, con estados de carga, error (503 → mensaje
  amable y "Intentar de nuevo") y repositorio vacío.
- Categoría sigue el orden configurado en la administración
  (`ListadoPublico.categorias`); las que no estén allí van al final por orden
  alfabético (el bloque solo tenía el alfabético).
- "Descargar" es un `<a download>` a la descarga propia
  (`/api/repositorio/documentos/:id/descargar`), con el nombre de
  `nombreDescarga()`. Ya no hacen falta la comprobación HEAD ni el truco de
  Google Drive. Se anuncia "Descargando «…»." como en el bloque.
- Los enlaces a otro sitio (Power BI, blog, OneDrive) se abren en una pestaña
  nueva (`rel="noopener noreferrer"`), con el ícono de "abrir afuera" y el
  aviso "(se abre en una pestaña nueva)" para lectores de pantalla. Las URL
  que no sean rutas propias ni http(s) se descartan.
- La búsqueda, los filtros y el orden quedan en la URL
  (`?q=…&categoria=boletin&anio=2024&clave=acceso&orden=titulo`; un `idioma=` de un enlace viejo se ignora), con
  `replace`: el enlace se puede compartir y al volver con Atrás desde un
  documento la búsqueda sigue ahí. Los valores que no existen se ignoran.
- Sin los modos de la barra de accesibilidad de WordPress (`pojo-a11y`): los
  tamaños de letra van directo en `font-size` y en `rem`/`em`.
- (Hasta el 12 de noviembre de 2026) Cabecera y pie del Observatorio (los de `/odes` y la plantilla), con CSS
  propio y pequeño: no se carga el kit de la plantilla. Rubik (latin y
  latin-ext) se sirve desde el propio sitio.

## Accesibilidad

axe-core 4.11 (WCAG 2.0/2.1/2.2 A y AA y buenas prácticas) sin infracciones
en 14 estados (inicial, búsqueda con `<mark>` y claves presionadas, panel
abierto, panel sin coincidencias, notas, entradas de blog, sin resultados,
"Mostrar más", celular con filtros abiertos, 320 px, error 503, vacío, 404 e
inicio). El contraste de la cabecera morada (que axe no puede calcular por los
círculos decorativos) se revisó a mano: blanco sobre #9b48a4 = 5,4:1 (4,6:1
sobre el círculo claro); la bajada #dcdcdc mide 24 px o más y tiene 4,0:1
(3,3:1 sobre el círculo), suficiente para texto grande.

## Pruebas

- `busqueda/busqueda.test.ts`: motor de búsqueda, las comprobaciones de la
  sección 8 del encargo y una tabla de resultados del bloque.
- `filtros/filtros.test.ts`: conteos de la carga inicial, opciones, filtrar,
  ordenar y estado en la URL.
- `componentes/TarjetaDocumento.test.tsx`, `datos/datos.test.ts`,
  `paginas/PaginaRepositorio.test.tsx` (página completa con `fetch` simulado:
  búsqueda, casillas, teclado, palabras clave, "Mostrar más", URL, errores).
- `src/router.test.tsx`: la rama se carga diferida, la administración en otro
  chunk y la 404 propia.

`pruebas/repositorio-v4-2.json` son los 372 productos reales en forma
compacta (solo lo que usan la búsqueda, los filtros y la tarjeta).
