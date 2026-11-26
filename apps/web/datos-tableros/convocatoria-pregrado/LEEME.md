# Tablero caracterización inscritos convocatorias

> **En este sitio.** El tablero se publica en `/tableros/convocatoria-pregrado` y se abre desde
> los tableros de SIVU. Este LEEME es el del tablero estático tal como llegó (26 de noviembre de
> 2026); al integrarlo cambió lo siguiente:
>
> - `js/dashboard.jsx` es `apps/web/src/sites/tableros/convocatoria/TableroConvocatoria.tsx`
>   (ver su encabezado); el `<style>` de `index.html` es la hoja del tablero de matrícula
>   (`matricula/tablero-matricula.css`) más `convocatoria/tablero-convocatoria.css`. No hay
>   `index.html`, `vendor/`, `plantilla/` ni Babel: la SPA trae React, ECharts y la plantilla.
> - Los tres archivos de `datos/` están en `apps/web/public/tableros/convocatoria-pregrado/datos/`
>   y no pasan por la base. Para regenerar `convocatoria.js` (sección 7), la carpeta de salida es
>   esa:
>
>   ```bash
>   python3 apps/web/datos-tableros/convocatoria-pregrado/etl_convocatoria.py BASE.xlsx apps/web/public/tableros/convocatoria-pregrado/datos
>   ```
>
>   No hace falta cambiar ningún `?v=`: el servidor revalida esos archivos con un ETag por
>   contenido. La base de inscritos no va en el repositorio.

Observatorio de Sapiencia · Agencia de Educación Postsecundaria de Medellín

Tablero estático: una carpeta de archivos que se publica tal cual, sin backend y sin
proceso de compilación. Los datos provienen de las bases de inscritos de las convocatorias
de pregrado y se convierten en un módulo de JavaScript con el script
`etl_convocatoria.py`. La estructura, los componentes y la identidad visual son los del
tablero de matrícula en educación superior (`tablero_educ_sup_2025`).

---

## 1. Estructura de archivos

```
tablero_convocatoria_pregrado/
├── index.html                  cascarón: cabecera, pie y estilos propios del tablero
├── js/
│   └── dashboard.jsx           aplicación React (siete secciones y filtros cruzados)
├── plantilla/                  plantilla de Sapiencia, copiada sin cambios
│   ├── styles.css              estilos y componentes (Bootstrap 5.3 con el tema de Sapiencia)
│   ├── script.js               componentes y botón flotante de accesibilidad
│   └── fonts/                  Rubik e íconos Material Symbols
├── css/
│   └── correcciones-plantilla.css   correcciones del kit (ver la sección 6)
├── vendor/                     librerías locales (React, ReactDOM, Babel, ECharts)
├── img/
│   ├── favicon.svg                      ícono de la pestaña del navegador
│   ├── logo-observatorio.png            logo de la cabecera
│   └── logo-sapiencia-alcaldia.png      pata del pie (Sapiencia y Alcaldía), con su fondo blanco
├── datos/
│   ├── definiciones.js         textos de las descargas y línea de fuente, editables por el área
│   ├── convocatoria.js         datos generados, no editar a mano
│   └── comunas.js              límites de comunas y corregimientos para el mapa
├── etl_convocatoria.py         convierte la base de Excel en datos/convocatoria.js
└── LEEME.md
```

Los tres módulos de `datos/` declaran sus objetos dentro del espacio global
`window.ODES`.

## 2. Cómo abrirlo

Babel standalone transpila `dashboard.jsx` en el navegador mediante una petición que
el navegador bloquea bajo el protocolo `file://`. El tablero debe servirse por HTTP:

```bash
cd tablero_convocatoria_pregrado
py -m http.server 8000        # en Linux o macOS: python3 -m http.server 8000
# abrir http://localhost:8000
```

En el portal institucional basta con publicar la carpeta completa. React, ReactDOM,
Babel y Apache ECharts se cargan desde `vendor/` y solo se recurre a un CDN público si
alguno de esos archivos falta, de modo que el tablero funciona detrás del proxy
institucional y sin acceso a internet. Los estilos, los componentes, la letra Rubik y
los íconos vienen de la plantilla de Sapiencia, en `plantilla/`. Si algo falla al
arrancar, `index.html` muestra en pantalla el mensaje de error real en lugar de una
pantalla en blanco.

## 3. Universo de los datos

La base es `view_LineaPregrado_Todos_periodo_17_2027-1.xlsx`, hoja «periodo 17»: un
registro por inscripción a la convocatoria 2027-1 (periodo 17 del sistema de
inscripción), con 366 columnas. El script lee 31 de ellas y no conserva ninguna que
identifique a las personas.

| Cifra | Valor |
|---|---|
| Inscritos | 11.238 |
| Formularios completos | 9.595 |
| Postulados a presupuesto participativo | 9.103 |
| Postulados a recursos ordinarios | 8.041 |
| Instituciones | 44 |
| Programas (código SNIES) | 737 |
| Inscripción | del 29 de octubre al 19 de noviembre de 2026 |
| Filas del módulo de datos | 11.217 |

La base trae también la verificación de requisitos, los impedimentos, la admisión en
cada fondo y el puntaje. El tablero no presenta esa información y el script no la lee.

El botón **Convocatoria**, en la primera línea de filtros, muestra el periodo (2027-1).
Cuando el script recibe las bases de varias convocatorias, el botón las lista todas y el
tablero abre con la más reciente.

## 4. Decisiones sobre los datos

Estas decisiones están implementadas en `etl_convocatoria.py` y conviene revisarlas con
el área antes de publicar.

**Unidad de conteo.** El tablero cuenta registros de inscripción, como la base. La base
trae 11.238 registros y 11.236 números de documento distintos: un mismo documento
aparece en tres registros.

**Fuente de financiación.** Se arma con las dos casillas de la base
(`_1_FF_RecursoPresupuestoParticipativo` y `_1_FF_RecursoOrdinario`): solo presupuesto
participativo (3.195), ambas fuentes (5.908), solo recursos ordinarios (2.133) y sin
información (2 registros sin ninguna de las dos). Los postulados a cada fondo suman las
dos categorías que lo incluyen.

**Programa e institución.** Se toman de las preguntas de Matrícula Cero (`_125` y
`_126`) o, si están vacías, de las de la institución y el programa al que aspira (`_130`
y `_131`). El texto del programa se separa en nombre, modalidad, código SNIES y
municipio de oferta; el código SNIES es la llave del programa y la que debe usarse para
cruzar con otras fuentes. Los 1.614 inscritos sin programa quedan como *Sin programa
registrado*; los gráficos de instituciones y programas calculan sus porcentajes sobre los
9.624 que sí lo registraron.

**Nombres.** La base entrega instituciones y programas en mayúscula sostenida y sin
tildes. El diccionario `IES` fija la denominación, la forma corta de las etiquetas y el
sector (el del SNIES, el mismo del tablero de matrícula). Los nombres de programa se
pasan a formato de título y recuperan las tildes con el diccionario `TILDES`, armado con
la forma que usa el SNIES para esas mismas palabras.

**Modalidad y nivel.** Las seis modalidades de la base se reducen a las tres del registro
calificado, con el mismo criterio del tablero de matrícula: la que incluye componente
presencial se cuenta como presencial y la virtual dual como virtual. El nivel de
formación sale de `MOD_PROG`. Se verificó que cada código SNIES tiene una sola
institución y un solo nivel.

**Perfil.** El estrato se toma de la pregunta de presupuesto participativo y, si falta,
de la general. La edad se agrupa en 14 a 17, 18 a 21, 22 a 28 y 29 años o más (las
edades vacías o menores de 14 años quedan sin información). El sexo biológico agrupa en
*Otro género* las demás respuestas: en 2027-1, 26 personas registradas como
intersexuales y 51 que prefirieron no responder.

**Formación previa.** El tipo de colegio marca como sin información los vacíos y el
valor `ACTIVO`. La ubicación del colegio distingue Medellín de otro municipio. El año de
graduación se presenta año a año para los ocho más recientes y en dos rangos para los
anteriores. Los títulos de educación superior salen de las tres preguntas de la base
(técnico profesional, tecnólogo y universitario o licenciatura); una persona puede tener
más de uno y el porcentaje se calcula sobre quienes respondieron esas preguntas.

**Comunas.** El código de la base se conserva (01 a 16 para las comunas, 50 a 90 para
los corregimientos y 00 para quienes residen en otros municipios). El mapa usa la capa de
comunas y corregimientos de GeoMedellín, con la geometría simplificada, en
`datos/comunas.js`; los 705 inscritos de otros municipios no aparecen en él.

**Reserva estadística.** El módulo de datos no lleva nombres, documentos, direcciones,
teléfonos, correos, barrios, fechas de nacimiento ni la edad exacta, ni las respuestas
sobre orientación sexual, identidad de género o hechos victimizantes. Las
características protegidas (grupo de Sisbén, víctima del conflicto, grupo étnico,
discapacidad y percentil en Saber 11) no se cruzan con la comuna, la institución ni el
programa: van en un bloque aparte, `perfil`, agregadas por convocatoria, fuente de
financiación, estado del formulario, sexo y grupo de edad, y solo responden a esos
filtros. En los grupos de menos de 10 inscritos su distribución se reemplaza por
*reservado* (42 inscritos en 2027-1). El umbral es la constante `RESERVA` del script.
La tabla principal no tiene datos sensibles, pero combina comuna, programa, sexo, grupo
de edad, estrato, día de inscripción y año de grado, entre otras variables, y en 2027-1
11.197 de sus 11.217 filas (99,8%) corresponden a una sola persona: en la práctica es un
registro por inscrito sin identificadores. Quien abra el tablero puede descargar ese
archivo o acotar los filtros hasta llegar a una persona, así que antes de publicarlo en
el portal abierto el área debe validar ese nivel de detalle.

## 5. Estructura del tablero

| Sección | Contenido |
|---|---|
| Panorama general | Fuente de financiación, grupo de edad, inscritos por institución, por comuna y por estrato |
| Inscripción | Inscritos por día de registro, medio por el que se enteraron, formulario completo según medio y según edad, y tabla por medio |
| Perfil de los inscritos | Sexo, edad, estrato, grupo de Sisbén, enfoque diferencial, fuente de financiación según estrato y tabla por edad y sexo |
| Formación previa | Tipo y ubicación del colegio, año de graduación, percentil en Saber 11, títulos de educación superior, semestre que cursará y tabla por año y tipo de colegio |
| Territorio | Mapa de comunas y corregimientos, postulados a presupuesto participativo, formulario completo por comuna, fuente según zona y tabla por comuna |
| Instituciones y programas | Programas con más inscritos (por nombre), nivel, modalidad, sector, fuente según sector, tamaño de los programas, participación de mujeres y tabla por institución |
| Información detallada | Una fila por programa, con los inscritos por sexo |

Los indicadores de la parte superior son inscritos, formulario completo, postulados a
presupuesto participativo, postulados a recursos ordinarios, mujeres y estratos 1 a 3.
Cada tarjeta lleva al pie solo la línea de fuente, que se toma de `definiciones.js`.

La barra de filtros lleva cinco listas fijas: convocatoria, institución, programa
académico, fuente de financiación y estado del formulario. Las demás variables (sexo,
grupo de edad, estrato, comuna o corregimiento, zona de residencia, sector de la
institución, nivel de formación, modalidad, semestre, medio de difusión, tipo y ubicación
del colegio y año de graduación) se filtran con un clic sobre los gráficos y las tablas.
Los filtros son transversales: se aplican a la vez a los indicadores, a los gráficos y a
las tablas de todas las secciones, y se conservan al cambiar de sección. El filtro de
programa busca por nombre y muestra debajo el código SNIES y la institución, de modo que
dos programas homónimos se distinguen sin ambigüedad. Para agregar una lista a la barra
basta con incluir su campo en `FILTROS_BARRA`, en `js/dashboard.jsx`.

Los filtros trabajan en cascada: cada lista se calcula sobre las filas que dejan las
demás selecciones. Debajo de la tarjeta aparecen como etiquetas todos los filtros
aplicados, también los que vienen de un clic en los gráficos;
cada una se retira con un clic y *Borrar todos* deja el tablero en su estado inicial,
con la convocatoria más reciente. Un clic sobre una barra, una porción, una zona del
mapa o una fila de tabla aplica ese filtro y otro clic lo retira.

Los gráficos de grupo de Sisbén, enfoque diferencial y percentil en Saber 11 responden
solo a los filtros de convocatoria, fuente de financiación, estado del formulario, sexo y
grupo de edad. Si hay otro filtro activo, la tarjeta lo dice en lugar de mostrar una
cifra que no corresponde a la selección.

Todas las tarjetas de gráfico comparten el mismo alto (380 px). Cuando hay más
categorías de las que caben, aparece un control a la derecha del propio gráfico para
recorrerlas: así se grafica todo sin recortes ni topes, desde las 22 zonas de residencia
hasta los 737 programas, y la página conserva su tamaño.

Las barras horizontales, simples y apiladas, comparten márgenes: la columna de nombres
ocupa el 34% del ancho del gráfico, entre 100 y 300 px, y a la derecha quedan 150 px para
la cifra y el control lateral (118 px en pantallas angostas). Así, dos gráficos de una
misma fila dibujan sus barras con el mismo ancho, sin importar el largo de sus rótulos.
Los valores están en `columnaNombres` y `margenDerecho`, en `js/dashboard.jsx`.

En las tablas, las columnas de categoría (programa, institución, comuna, grupo de edad,
medio, año de graduación) ocupan el doble que las demás, que quedan todas del mismo ancho
y centradas. En pantallas angostas la tabla conserva un ancho mínimo y se recorre de lado.

**Bases y totales con asterisco.** Las piezas del programa elegido (institución,
programa, nivel, modalidad, sector y semestre que cursará) solo cuentan a quienes
registraron programa, y las de formación previa (tipo y ubicación del colegio, año de
graduación y títulos), a quienes registraron esa información. En 2027-1 quedan por fuera
1.614 y 522 inscritos, respectivamente, todos con el formulario incompleto, así que esas
piezas suman 9.624 y 10.716 y no 11.238. Los cuadros y anillos que muestran un total
(detalle por programa e institución, detalle por institución, sector de la institución,
ubicación del colegio y detalle por año de graduación y tipo de colegio) llevan un
asterisco magenta junto al título, marcan su total con un asterisco y tienen debajo una
nota que dice cuántos inscritos no se incluyen. La cifra se recalcula con cada filtro, y
la nota y los asteriscos desaparecen cuando no hay nadie por fuera.

Cada gráfico lleva dos botones de descarga en su encabezado. El primero genera un CSV
con lo que está en pantalla, con separador de punto y coma, coma decimal y marca de
orden de bytes, de modo que Excel en español lo abre sin configuración adicional. El
segundo exporta el gráfico como PNG a triple resolución. La imagen lleva arriba un
encabezado en cuatro niveles: el título del gráfico (18 px, seminegrita, en azul), el
nombre del tablero («Caracterización inscritos convocatorias», en `definiciones.js`; 13
px), la convocatoria elegida (12 px) y el nombre del Observatorio (11 px, en gris).
Abajo van la nota del gráfico, si la tiene, y la fuente. Las descargas se resuelven en
el navegador, sin petición al servidor.

El tablero abre directamente en el panorama general, sin ventana de bienvenida.

## 6. Identidad visual

El tablero usa los estilos de la plantilla de Sapiencia, copiados sin cambios en
`plantilla/`, y las mismas piezas del tablero de matrícula: botones de sección,
tarjetas, listas de filtros, etiquetas, tablas e indicadores.

| Pieza del tablero | Componente de la plantilla |
|---|---|
| Filtros, indicadores, gráficos y tablas | tarjetas (`card card-lg`) |
| Listas de los filtros | campo de selección (`form-select`) que abre un `dropdown-menu` con buscador (`form-control`) y casillas (`form-check`) |
| Filtros aplicados | etiquetas (`tag tag-light-primary`) |
| Botones | `btn-primary`, `btn-outline-neutral`, `btn-link-primary` y `btn-icon` |
| Tablas | `table table-hover table-sm` |
| Íconos | Material Symbols |

`index.html` es el del tablero de matrícula con otro título y otros módulos de datos.
`css/correcciones-plantilla.css` es el mismo archivo y corrige las mismas dos fallas del
kit (los colores RGB de las familias de Sapiencia y los temas anidados).

**Teclado en las listas de filtros.** El kit atiende en el documento las teclas de todo
`dropdown-menu` y lanzaba un error al cerrar una lista con Escape, porque estas listas
no usan el botón del kit. El selector resuelve Escape y las flechas antes de que la tecla
llegue al kit. La misma falla está en el tablero de matrícula.

**Colores de los gráficos.** Son los del kit: azul oscuro `#0B3A56`, celeste `#3AB6E6`,
morado `#9B48A4` y verde `#2EA14E`, más el naranja del Observatorio `#ED7203`. Cada
gráfico de una sola serie va de un color y las tarjetas vecinas llevan colores
distintos. En los gráficos de varias series el orden es fijo y cada categoría conserva
su color: la fuente de financiación y el estado del formulario se pintan igual en el
anillo, en las columnas y en las barras apiladas. El mapa usa cinco tonos de la familia
secondary del kit, por quintiles de inscritos, y cada zona lleva su número; el nombre y
las cifras están en el tooltip.

Los rangos, los grupos de edad, los estratos y las escalas (Sisbén, percentil, año de
graduación, semestre) se presentan en su orden propio; las demás categorías, de mayor a
menor. Las barras terminan en curva sobre una pista gris que marca el total y ningún
gráfico tiene grilla, líneas de referencia ni tonos de alerta. Las cifras se muestran con
un decimal.

**Coincidencia con las piezas gráficas.** Las cifras del tablero son las mismas del
carrusel y de la infografía de la convocatoria. Para eso, las distribuciones en barras se
cierran en 100,0% por el método del mayor residuo, como en esas piezas, y la misma regla
se aplica en sus CSV; los anillos, los indicadores y los cuadros muestran el redondeo de
cada cifra. La edad se calcula sobre quienes la registraron (no la tienen dos inscritos),
el semestre sobre quienes registraron programa y el año de graduación sobre quienes
registraron la información de formación previa. *Programas con más inscritos* suma cada
programa en todas las instituciones que lo ofrecen; la ventana emergente dice cuáles son y
con cuántos inscritos, y un clic filtra todas sus ofertas, que quedan en una sola ficha.

## 7. Regenerar los datos

Cuando haya una nueva base o una nueva convocatoria:

```bash
python3 etl_convocatoria.py view_LineaPregrado_Todos_periodo_17_2027-1.xlsx datos
```

Para presentar varias convocatorias se pasan todas las bases; cada una aparece en el
botón Convocatoria:

```bash
python3 etl_convocatoria.py BASE_2027-1.xlsx BASE_2027-2.xlsx datos
```

El script solo necesita `openpyxl`. Lee la primera hoja de cada archivo, toma el periodo
de la columna `_123_Convocatoria` (o del nombre del archivo), arma los diccionarios y
reescribe `datos/convocatoria.js`, que pesa alrededor de 500 KB por convocatoria. En
pantalla informa, por convocatoria, los inscritos, los formularios completos, los
postulados a cada fondo, las instituciones, los programas, las fechas de inscripción y
los inscritos en grupos reservados, cifras que conviene contrastar contra la base antes
de publicar. Si aparece una institución, una modalidad, un medio de difusión o una
comuna que no está en sus diccionarios, el script lo advierte.

Al publicar datos nuevos, cambie el sufijo `?v=` de los tres scripts de `datos/` en
`index.html` para que los navegadores no usen la copia guardada.

## 8. Refinamiento visual

Fondo gris azulado suave, tarjetas blancas con borde fino y sin sombras, encabezados de
tarjeta sin banda gris, botones de sección sueltos sobre el fondo, contenido centrado
con ancho máximo de 1.680 px e indicadores con el valor en el azul del Observatorio. Los
estilos están al final del bloque `<style>` de `index.html`, bajo «Refinamiento visual».

La sección activa va en el magenta de Sapiencia (`#921C8D`) y el texto de la interfaz en
negro; solo conservan su color el texto de las visualizaciones y el que va sobre fondos
de color.
