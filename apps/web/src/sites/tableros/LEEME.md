# Rama `/tableros`

Tableros de información del Observatorio. Matrícula y batería llegaron como tableros estáticos y
se pasaron a la SPA; el de los fondos se hizo aquí con el mismo aspecto que el de matrícula. Los de
matrícula y fondos se abren desde los tableros de SIVU (`../sivu/datos/tableros.ts`) y la
batería de indicadores, desde la puerta del edificio (`URL_TABLERO_BATERIA` en
`../sivu/rutas.ts`). Llevan la plantilla de Sapiencia (kit), como `/odes`; en los tableros, la
cabecera y el pie azules de los tableros estáticos, y en el resto de la rama (la página de
"tablero no encontrado"), los del sitio (magenta).

| Archivo | Qué es |
| --- | --- |
| `TablerosSitio.tsx` | La rama: plantilla, cabecera, rutas y pie (en cada tablero, los azules con su nombre y su clase en la raíz: `tablero-matricula`, `tablero-bateria`). |
| `componentes/EstilosTableros.tsx` | Hojas del kit y `src/compartido/plantilla/correcciones-plantilla.css` (las correcciones del kit que traían los tableros estáticos, compartidas con `/pai`), en ese orden (las pruebas lo simulan). |
| `componentes/CabeceraAzul.tsx`, `componentes/PieAzul.tsx` | Cabecera y pie de los tableros estáticos (azul `#0E5074` con filete magenta). Sus estilos van en la hoja de cada tablero. |
| `componentes/CargaTablero.tsx`, `carga-tablero.ts` | Lo común a la carga de los tableros: espera de las fuentes, importación del chunk (con una recarga si ya no existe), «Cargando el tablero…» y el aviso de error. |
| `matricula/PaginaMatricula.tsx` | Pide los datos a `/api/sivu/tableros/matricula-2025`, los deja en `window.ODES` y monta el tablero. |
| `matricula/TableroMatricula.tsx` | `js/dashboard.jsx` del tablero estático (`Octubre/tablero_educ_sup_2025`, versión del 11 de octubre de 2026) con cambios de integración: ver su encabezado. |
| `fondos/PaginaFondos.tsx` | Los fondos son privados (sesión de los tableros, `sesion-tableros.ts` e `IngresoTablero.tsx`) y tienen dos vistas con la misma sesión: el tablero (`/tableros/fondos-2026`) y la ventanilla de consulta (`/tableros/fondos-2026/ventanilla`), con un selector arriba. Las dos quedan montadas (la otra se oculta) y el tablero se precarga al abrir sesión: pide los datos a `/api/sivu/tableros/fondos-2026` (`pedirDatosTablero` de `carga-tablero.ts`) y se los pasa por props. Carga la hoja de matrícula y la suya. |
| `fondos/VentanillaFondos.tsx`, `fondos/ventanilla/` | Ventanilla de consulta por documento: el expediente de una persona (quién es, sus beneficios con el recorrido por periodo y sus eventos). `VentanillaFondos.tsx` consulta (`POST /api/sivu/tableros/fondos-2026/consulta`) y coordina; las piezas, sus reglas y el plan de diseño están en `fondos/ventanilla/LEEME.md`. |
| `fondos/TableroFondos.tsx` | Tablero de beneficiarios de los fondos de Sapiencia (2026): ocho secciones con las piezas visuales de matrícula copiadas y tipadas (no importa nada de `matricula/`). |
| `fondos/calculos.ts`, `fondos/tipos.ts` | Filtros y sumas de las filas agregadas (puros, probados en `calculos.test.ts`) y el contrato de datos (copia de `apps/server/src/sivu/tableros/datos-fondos.ts`). |
| `fondos/tablero-fondos.css` | Lo propio del tablero de los fondos bajo `:where(.tablero-fondos)`: ocho botones de sección, notas de sección y de pie, lista de estados. La raíz lleva `tablero-matricula tablero-fondos`. |
| `matricula/tablero-matricula.css` | El `<style>` de `index.html` del tablero estático, cabecera y pie incluidos, bajo `:where(.tablero-matricula)`: ver su encabezado. |
| `historica/PaginaMatriculaHistorica.tsx` | `/tableros/matricula-historica`: pide el JSON estático de la matrícula 2000-2025 (`/tableros/matricula-historica/datos/matricula.json`), espera las fuentes y monta el tablero, con los datos por props. Carga la hoja de matrícula y la suya. |
| `historica/TableroMatriculaHistorica.tsx` | Matrícula en educación superior en Medellín de 2000 a 2025: arriba la evolución (matriculados, índice 2000 = 100 y participación frente a Antioquia y Colombia) con la tira de años, que elige el año de los indicadores y de las seis secciones. Piezas visuales copiadas y tipadas del de los fondos. |
| `historica/calculos.ts`, `historica/tipos.ts` | Filtros, series por año, cortes del año elegido y referencia de Antioquia y Colombia con los mismos filtros (puros, probados en `calculos.test.ts`), y el contrato del JSON. |
| `historica/tablero-historica.css` | Lo propio bajo `:where(.tablero-historica)`: seis botones de sección, los modos de la evolución, la tira de años (como eje del gráfico en pantallas anchas) y las notas. La raíz lleva `tablero-matricula tablero-historica`. |
| `bateria/` | La batería de indicadores (`/tableros/bateria-indicadores/*`): página, tablero, hoja y rutas de sus vistas. Ver `bateria/LEEME.md`. |
| `recursos/recursos.ts` | Logos de los tableros: el del Observatorio, con el azul de la cabecera pintado, y la pata de Sapiencia y la Alcaldía. |

Los de la matrícula 2000-2025 son un JSON estático que genera `apps/web/datos-tableros/matricula-historica/etl_matricula_historica.py` con los archivos del MEN (ver su LEEME), en `apps/web/public/tableros/matricula-historica/datos/`; no pasan por la base.

Los datos de matrícula viven en la base (tablas `sivu_tableros` y `sivu_tablero_matricula_2025_*`,
migración 002) y se cargan con `npm run tableros:cargar-matricula`. Los de los fondos, en
`sivu_tablero_fondos_2026_*` (migración 007), solo cifras agregadas, y se cargan con
`npm run tableros:cargar-fondos`. Ver la sección "Tableros"
del README de la raíz. Los de la batería son archivos estáticos que genera su ETL, en
`apps/web/public/tableros/bateria-indicadores/datos/`.

Fuera de la SPA quedan, a propósito, los tableros de pertinencia (`apps/web/public/tableros/pertinencia`
y `apps/web/public/tableros/medida-pertinencia`), que van con `/pertinencia`.
