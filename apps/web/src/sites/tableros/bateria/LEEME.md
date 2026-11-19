# Batería de indicadores de educación postsecundaria

Observatorio de Educación de Sapiencia · Agencia de Educación Postsecundaria de Medellín

Refactorización de la ventanilla de consulta «Batería de indicadores OdeS 2022» (Power BI,
175 páginas) como tablero web. Llegó como tablero estático (`tablero_bateria_indicadores`:
`index.html` con React, Babel y ECharts cargados en el navegador) y ahora es una ruta de la
SPA, dentro de la rama `/tableros`, con la misma arquitectura que el tablero de matrícula
(`../matricula`). Se abre desde la puerta del edificio de SIVU (`URL_TABLERO_BATERIA` en
`src/sites/sivu/rutas.ts`).

---

## 1. Archivos

```
src/sites/tableros/bateria/
├── PaginaBateria.tsx       carga datos/definiciones.js, vistas.js y geo.js, espera las fuentes
│                           e importa el tablero (chunk propio); traduce las direcciones viejas
├── TableroBateria.tsx      js/dashboard.jsx del tablero estático con cambios de integración
│                           (ver su encabezado): navegación, filtros, gráficos, tablas, mapas
├── tablero-bateria.css     el <style> de index.html, bajo :where(.tablero-bateria)
├── rutas-bateria.ts        direcciones de las vistas y traducción de las del tablero estático
├── cargar-script.ts        carga (una vez) los archivos de datos, que son scripts
└── LEEME.md

apps/web/public/tableros/bateria-indicadores/datos/      (sin pasar por Vite, servidos tal cual)
├── definiciones.js          textos editables: bienvenida, notas de fuente y glosario
├── vistas.js                estructura de navegación y definición de cada vista (generado)
├── geo.js                   geometrías: comunas de Medellín, departamentos de Colombia,
│                            municipios de Antioquia (generado)
└── v/<vista>__<variante>.js datos de cada vista, cargados bajo demanda (generados)
```

Lo demás lo pone la rama: la plantilla de Sapiencia (kit) y sus correcciones
(`componentes/EstilosTableros.tsx`), la cabecera y el pie azules (`componentes/CabeceraAzul.tsx`,
`componentes/PieAzul.tsx`) y los logos (`recursos/`). Son los mismos archivos que traía el
tablero estático. React, ECharts (5.6.0, la misma versión) y KaTeX salen de las dependencias de
`apps/web`; KaTeX y su hoja solo se descargan al mostrar una fórmula (catálogo de indicadores).

Del tablero estático ya no quedan `index.html`, `js/`, `css/`, `plantilla/`, `vendor/` ni
`img/`; solo sus datos.

## 2. Cómo se carga

1. `PaginaBateria` pide los tres archivos base con `<script>` (mismo origen: los permite la CSP
   del servidor, `script-src 'self'`) y espera a Rubik y a Material Symbols (máximo 2,5 s),
   porque los gráficos se pintan en un lienzo con la letra que haya.
2. Importa `TableroBateria`, que al evaluarse lee `window.ODES` (navegación y mapas). Si el
   chunk ya no existe tras un despliegue, recarga la página una vez.
3. El tablero pide los datos de cada vista (`v/<vista>.js?v=<versión de vistas.js>`) al abrirla
   y los guarda en `window.ODES.datos` y en una copia propia.

Los archivos de datos se sirven con revalidación (`no-cache` + ETag por contenido en el servidor
de NestJS), así que un ETL nuevo se ve en la siguiente visita sin cambiar el código.

## 3. Navegación integrada (sin páginas de transición)

El Power BI original tenía portada, tabla de contenido, cuatro índices y veintiún páginas
de «elija nacional / departamental / local» o «elija el fondo». Todo eso se reemplaza por:

* **Menú lateral** con los cuatro universos (Educación postsecundaria, Sapiencia, 3 IES del
  municipio y Contexto de Medellín), sus temas y sus vistas. En pantallas angostas se abre
  como panel deslizante.
* **Inicio** con el mapa completo de indicadores: cada vista es un enlace directo.
* **Buscador** (botón «Buscar indicador» o Ctrl+K) sobre el nombre de todas las vistas.
* **Ámbito y pestañas** bajo el título de la vista: Colombia / Antioquia / Medellín, o las
  secciones de un fondo (inscritos, preseleccionados, legalizados…).
* **Anterior / siguiente** (también Alt + flechas) y **direcciones propias** que se pueden
  compartir:

  | Dirección | Qué abre |
  |---|---|
  | `/tableros/bateria-indicadores` | Inicio (mapa de indicadores) |
  | `/tableros/bateria-indicadores/sa-fondo-epm` | Una vista (su primera variante) |
  | `/tableros/bateria-indicadores/sa-fondo-epm?v=comunas` | Una variante de la vista |
  | `/tableros/bateria-indicadores/glosario`, `…/catalogo` | Glosario y catálogo |

  Las del tablero estático (`/tableros/bateria-indicadores/index.html#/sa-fondo-epm?v=comunas`)
  se cambian solas por las nuevas (`rutaDesdeDireccionAntigua`).
* **Glosario** y **Catálogo de indicadores** (las fichas técnicas de la hoja «Batería actual
  Indicadores») como vistas propias.

Cada vista tiene como máximo seis visualizaciones, más una fila de indicadores (tarjetas)
y la barra de filtros. Cuando una página del Power BI tenía más, se repartió en pestañas.

## 4. Correspondencia con el Power BI

| Power BI | Tablero |
|---|---|
| Página con visuales | Vista (o variante de una vista) |
| Páginas Nacional / Regional / Local | Una vista con el selector de ámbito |
| Páginas de un mismo fondo | Una vista con pestañas por etapa |
| Segmentadores (slicers) | Filtros de la vista, en cascada; un clic sobre barras o porciones también filtra |
| Tarjetas (cards) | Indicadores de la fila superior |
| Barras / columnas / anillos / tortas / árboles / embudos / líneas / áreas / tablas / mapas | Gráficos equivalentes en ECharts con la paleta de Sapiencia |
| Mapas de comunas (shape map) | Mapa coroplético con el shapefile de comunas y corregimientos |
| Mapas de departamentos y municipios | Mapas coropléticos con el shapefile de departamentos y los municipios de Antioquia |
| Cuadros de texto «Fuentes: …» | Pie de cada tarjeta y nota de la vista |
| Glosario (cuadros de texto) | Vista Glosario, editable en datos/definiciones.js |

Las tarjetas que en el Power BI usaban «mínimo» sobre columnas de texto (poblaciones
especiales) se muestran aquí como conteo de personas con la casilla marcada.

## 5. Identidad visual

Plantilla de Sapiencia sin cambios. Paleta de `colores.pdf`: azul oscuro `#003C57` como base,
celeste `#26AAE2`, morado `#A14A9C`, verde `#169B4F`, amarillo `#FBDB2D`, naranja `#F4782C` y el
magenta de Sapiencia `#962B8C` para la sección activa y los acentos de la interfaz. Los mapas
usan la escala de azules complementarios de la misma paleta. Cabecera y pie del Observatorio
con el filete magenta; tarjetas blancas sin sombra; texto de interfaz en negro.

## 6. Regenerar los datos

El ETL no está en este repositorio: es la carpeta `etl/` del proyecto original del tablero
(`tablero_bateria_indicadores`). Escribe en una carpeta `datos/` que se copia sobre
`apps/web/public/tableros/bateria-indicadores/datos/`:

```bash
pip install -r etl/requirements.txt
python3 etl/generar_vistas.py "Matriz de indicadores OdeS 2023.xlsx" datos
```

La primera lectura del libro completo tarda unos minutos. Para iterar sobre una vista:

```bash
python3 etl/generar_vistas.py "Matriz …xlsx" datos sa-fondo-epm
```

Para agregar una vista: declararla en el `vistas_*.py` que corresponda con el mini lenguaje
de `etl/dsl.py` (tabla de la matriz, filtros, indicadores y hasta seis visualizaciones) y
volver a generar. El tablero no necesita cambios.

Mapas: `python3 etl/geo_build.py <carpeta con los shapefiles>` reconstruye `datos/geo.js`.

`python3 etl/normalizar.py "Matriz …xlsx" salida/` produce el conjunto relacional (CSV, DDL
y diccionario) que se entrega aparte.
