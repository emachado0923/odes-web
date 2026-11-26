# Tablero matrícula en ciencia, tecnología e innovación

> **En este sitio.** El tablero se publica en `/tableros/matricula-cti` y se abre desde los
> tableros de SIVU. Este LEEME es el del tablero estático tal como llegó (26 de noviembre de
> 2026); al integrarlo cambió lo siguiente:
>
> - `js/dashboard.jsx` es `apps/web/src/sites/tableros/cti/TableroCti.tsx` (ver su encabezado);
>   el `<style>` de `index.html` son las hojas de los tableros de matrícula y de convocatorias
>   más `cti/tablero-cti.css`. No hay `index.html`, `vendor/`, `plantilla/` ni Babel: la SPA
>   trae React, ECharts y la plantilla.
> - Los dos archivos de `datos/` están en `apps/web/public/tableros/matricula-cti/datos/` y no
>   pasan por la base. Para regenerar `cti.js` (sección 7), la carpeta de salida es esa:
>
>   ```bash
>   python3 apps/web/datos-tableros/matricula-cti/etl_cti.py CARPETA_DE_BASES apps/web/public/tableros/matricula-cti/datos
>   ```
>
>   No hace falta cambiar ningún `?v=`: el servidor revalida esos archivos con un ETag por
>   contenido. Las bases del SNIES no van en el repositorio.

Observatorio de Sapiencia · Agencia de Educación Postsecundaria de Medellín

Tablero estático: una carpeta de archivos que se publica tal cual, sin backend y sin
proceso de compilación. Los datos provienen de las bases de matrícula del Ministerio de
Educación Nacional (SNIES) y de la clasificación de los campos CINE en ciencia,
tecnología e innovación (CTi), y se convierten en un módulo de JavaScript con el script
`etl_cti.py`. La estructura, los componentes y la identidad visual son los del tablero de
caracterización de los inscritos en las convocatorias, en tres secciones.

---

## 1. Estructura de archivos

```
tablero_matricula_cti/
├── index.html                  cascarón: cabecera, pie y estilos propios del tablero
├── js/
│   └── dashboard.jsx           aplicación React (tres secciones y filtros cruzados)
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
│   └── cti.js                  datos generados, no editar a mano
├── etl_cti.py                  convierte las bases de Excel en datos/cti.js
└── LEEME.md
```

Los dos módulos de `datos/` declaran sus objetos dentro del espacio global `window.ODES`.

## 2. Cómo abrirlo

Babel standalone transpila `dashboard.jsx` en el navegador mediante una petición que el
navegador bloquea bajo el protocolo `file://`. El tablero debe servirse por HTTP:

```bash
cd tablero_matricula_cti
py -m http.server 8000        # en Linux o macOS: python3 -m http.server 8000
# abrir http://localhost:8000
```

En el portal institucional basta con publicar la carpeta completa. React, ReactDOM, Babel
y Apache ECharts se cargan desde `vendor/` y solo se recurre a un CDN público si alguno
de esos archivos falta, de modo que el tablero funciona detrás del proxy institucional y
sin acceso a internet. Si algo falla al arrancar, `index.html` muestra en pantalla el
mensaje de error real en lugar de una pantalla en blanco.

## 3. Universo de los datos

| Criterio | Definición |
|---|---|
| Fuente | Bases RET_MAT_MEN_2019.xlsx a RET_MAT_MEN_2025.xlsx del SNIES |
| Periodo | 2019 a 2025. Las bases de 2014 a 2018 no traen el código CINE de los programas, así que la serie empieza en 2019 |
| Matrícula | La oficial del Ministerio (`MAT_OFICIAL = Si`): el primer semestre en las instituciones de educación superior y el segundo semestre en el SENA |
| Medellín | Los programas ofrecidos en el municipio (`COD_MPIO_PROG = 5001`), que es el criterio del Ministerio |
| Colombia | Toda la matrícula oficial del país, con Medellín incluida |
| CTi | Los programas cuyo código CINE detallado pertenece a una de las seis áreas de `CLASIFICACION_CTI_CINE.xlsx`: ciencias naturales y exactas, tecnologías de la información y la comunicación, ingeniería e industria, arquitectura y construcción, ciencias agropecuarias y veterinarias, y ciencias de la salud |
| Institución | La institución principal (`COD_IES_PADRE`), con sus seccionales |

Con estos criterios, en 2025 Medellín tuvo 110.092 estudiantes en CTi, el 43,8% de sus
251.106 estudiantes de educación superior, en 757 de sus 1.740 programas con
estudiantes. En Colombia la proporción fue de 40,9%.

## 4. Decisiones sobre los datos

**Área de cada año.** El área de un programa se toma del código CINE que trae la base de
cada año, porque el Ministerio puede cambiarlo. Entre 2019 y 2025, 29 programas de
Medellín cambian de área de un año a otro, y algunos entran o salen de CTi; su matrícula
de cada año queda en el área de ese año.

**Nivel de formación.** El nombre del nivel cambia entre años (Universitaria y
Universitario, Tecnológica y Tecnológico). El tablero usa seis grupos: técnica
profesional, tecnológica, universitaria, especialización (todas las especializaciones,
también las médico quirúrgicas), maestría y doctorado.

**Modalidad.** Las bases hasta 2021 traen la metodología y las siguientes, la modalidad.
Se reducen a tres categorías, como en el tablero de matrícula: la que incluye componente
presencial se cuenta como presencial, el resto de las que tienen componente virtual como
virtual (también la «distancia virtual» de las primeras bases) y la distancia
tradicional como a distancia.

**Sexo y sector.** Las bases cambian de Hombre y Mujer a Masculino y Femenino, y desde
2023 incluyen las categorías no binario y trans, que el tablero no presenta por separado
pero que cuentan en los totales. El sector se reduce a oficial y privada.

**Instituciones.** Cada programa se asigna a su institución principal, con el nombre del
diccionario del tablero de matrícula. La Universidad Cooperativa de Colombia cambia de
código principal en 2025 (1818 a 1816) y queda en una sola entrada. La sección CTi del
portal cuenta 36 instituciones en 2025 porque toma cada seccional por separado; el
tablero, como el panel de instituciones de la infografía, las agrupa en su institución
principal (34 en 2025).

**Totales para las participaciones.** La participación de CTi en la matrícula se calcula
sobre toda la matrícula de Medellín con los mismos filtros, salvo el de área, de modo
que la participación de un área es sobre el total de la ciudad. Las cifras de Colombia
toman los filtros de área, nivel, modalidad y sector, pero no los de institución y
programa, que solo existen para Medellín.

**Programas.** Se cuentan los programas con estudiantes en el año: los que tuvieron
matrícula oficial mayor que cero.

**Matrícula de la Universidad Nacional en 2020.** En 2020 la Universidad Nacional de
Colombia reporta en Medellín 2.223 estudiantes en estas áreas, frente a 10.556 en 2019 y
12.092 en 2021. El tablero presenta la cifra como la reporta el SNIES. Esa diferencia
explica casi toda la caída de la serie de Medellín en 2020 (de 112.245 a 103.153).

**Coincidencia con la infografía de CTi.** Las cifras del tablero son las de la
infografía y las de la sección CTi del portal: 110.092 estudiantes en 2025, 3,4% más que
en 2024; 43,8% de la matrícula de Medellín frente a 40,9% de Colombia; tecnologías de la
información de 9.797 estudiantes en 2019 a 18.295 en 2025, con 3.867 mujeres; 19,1% de
los estudiantes de doctorado del país en estas áreas en Medellín; 73,2% en instituciones
oficiales; 757 programas, el 43,5% de los programas con estudiantes, y las cinco
instituciones con más estudiantes (Universidad de Antioquia 18.913, Instituto
Tecnológico Metropolitano 17.248, Universidad Nacional de Colombia 10.421, SENA 9.654 e
Institución Universitaria Pascual Bravo 6.941). Las distribuciones en barras se cierran
en 100,0% por el método del mayor residuo; los indicadores, los anillos y los cuadros
muestran el redondeo de cada cifra.

## 5. Estructura del tablero

El tablero tiene tres secciones, con los mismos botones de sección del tablero de
convocatorias. Arriba de las tres van los seis indicadores del año elegido:

| Indicador | Cálculo | Pie |
|---|---|---|
| Estudiantes en CTi | Matrícula de Medellín en CTi | Variación frente al año anterior |
| Participación en la matrícula | Estudiantes en CTi sobre toda la matrícula de Medellín | La misma participación en Colombia |
| Programas de CTi | Programas de CTi con estudiantes | Su participación en los programas con estudiantes |
| Peso de Medellín en el país | Estudiantes en CTi de Medellín sobre los de Colombia | Estudiantes en CTi de Colombia |
| Mujeres | Participación de las mujeres | Número de mujeres |
| Instituciones oficiales | Participación de la matrícula en instituciones oficiales | Número de estudiantes |

| Sección | Contenido |
|---|---|
| Panorama general | Estudiantes en CTi por año; participación de CTi en la matrícula, en Medellín y en Colombia; participación de las mujeres por año, en Medellín y en Colombia; peso de Medellín en el país por nivel de formación |
| Áreas de conocimiento | Estudiantes por área; variación por área entre 2019 y el año elegido; participación de las mujeres por área, en 2019 y en el año elegido; peso de Medellín en el país por área; cuadro de estudiantes por área y año |
| Instituciones y programas | Estudiantes por sector y por modalidad; instituciones con más estudiantes; detalle por institución y programa, con la matrícula de cada año |

La barra de filtros lleva cinco listas fijas: año, área de conocimiento, nivel de
formación, institución y programa académico. El sector y la modalidad se filtran con un
clic sobre sus anillos. El año es de selección única y abre en el más reciente: fija el
corte de los indicadores, de las distribuciones y del orden de los cuadros. Los tres
gráficos de líneas del panorama general muestran siempre los siete años con los demás
filtros, resaltan el año elegido y, con un clic sobre un punto, eligen ese año.

Los filtros son transversales y trabajan en cascada: se aplican a la vez a los
indicadores, a los gráficos y a los cuadros de las tres secciones, se conservan al
cambiar de sección y cada lista se calcula sobre lo que dejan las demás selecciones. Las instituciones y los programas con estudiantes en CTi en
cualquier año de la serie siguen en sus listas, para poder ver su evolución aunque no
tengan estudiantes en el año elegido. Debajo de la tarjeta de filtros aparecen como
etiquetas los filtros aplicados; cada una se retira con un clic y *Borrar todos* deja el
tablero en su estado inicial. Un clic sobre una barra, una porción o una fila de cuadro
aplica ese filtro y otro clic lo retira.

Los gráficos de líneas tienen trazos suavizados, la cifra en cada punto y el eje desde
cero, para no exagerar las variaciones. Todas las tarjetas de gráfico comparten el mismo
alto (380 px); cuando hay más categorías de las que caben, como en el gráfico de
instituciones, aparece un control a la derecha para recorrerlas. Las barras horizontales
comparten márgenes, de modo que dos gráficos de una misma fila dibujan sus barras con el
mismo ancho. En los cuadros, las columnas de categoría con nombres largos (programa,
institución, área y nivel de formación) ocupan el doble que las demás, que quedan del
mismo ancho y centradas.

Cada gráfico lleva dos botones de descarga. El primero genera un CSV con lo que está en
pantalla, con separador de punto y coma, coma decimal y marca de orden de bytes; el del
detalle por programa incluye el código SNIES. El segundo exporta el gráfico como PNG con
un encabezado en cuatro niveles: el título del gráfico, el nombre del tablero (en
`definiciones.js`), el territorio y el periodo («Medellín, 2025» o «Medellín, 2019 a
2025» en los gráficos de la serie) y el nombre del Observatorio; abajo va la fuente.

## 6. Identidad visual

El tablero usa los estilos de la plantilla de Sapiencia, copiados sin cambios en
`plantilla/`, y las mismas piezas del tablero de convocatorias: tarjetas, listas de
filtros, etiquetas, tablas e indicadores. `css/correcciones-plantilla.css` es el mismo
archivo y corrige las mismas fallas del kit.

**Colores de los gráficos.** Son los del kit: azul oscuro `#0B3A56`, celeste `#3AB6E6`,
morado `#9B48A4` y verde `#2EA14E`, más el naranja del Observatorio `#ED7203`. Cada
gráfico de una sola serie va de un color y las tarjetas vecinas llevan colores
distintos. Medellín va en morado y Colombia en celeste en los dos gráficos que los
comparan; el área va en verde y el nivel de formación en naranja. En la participación de
las mujeres por área, 2019 va en un tono claro del naranja y el año elegido en el naranja
pleno. Los anillos conservan el color de cada categoría aunque cambie cuál es la mayor.

El nivel de formación se presenta en su orden propio; las demás categorías, de mayor a
menor. Las barras terminan en curva y ningún gráfico tiene grilla ni tonos de alerta. La
variación por área usa un solo color: las barras de las áreas que crecen van a la
derecha del cero y las de las que bajan, a la izquierda. Las cifras se muestran con un
decimal.

## 7. Regenerar los datos

Con una carpeta que tenga las bases RET_MAT_MEN de cada año y la clasificación:

```bash
python3 etl_cti.py CARPETA_DE_BASES datos
```

El script solo necesita `openpyxl`. Toma los años desde 2019 y todos los que encuentre
después, así que para sumar un año basta con dejar su archivo en la carpeta y volver a
ejecutarlo. Lee las bases en paralelo, arma los diccionarios y reescribe `datos/cti.js`,
que pesa alrededor de 360 KB. En pantalla informa, por año, los estudiantes en CTi de
Medellín, su participación, la de Colombia y los programas, cifras que conviene
contrastar antes de publicar. Si aparece una institución, un nivel, una modalidad o un
código CINE que no está en sus diccionarios, lo advierte.

Al publicar datos nuevos, cambie el sufijo `?v=` de los scripts de `datos/` en
`index.html` para que los navegadores no usen la copia guardada.

## 8. Refinamiento visual

Fondo gris azulado suave, tarjetas blancas con borde fino y sin sombras, encabezados de
tarjeta sin banda gris, botones de sección sueltos sobre el fondo, contenido centrado con
ancho máximo de 1.680 px e indicadores con el valor en el azul del Observatorio. Los
estilos están al final del bloque `<style>` de `index.html`, bajo «Refinamiento visual».

La sección activa va en el magenta de Sapiencia (`#921C8D`). Los tres botones ocupan una
fila; en pantallas de menos de 480 px se apilan.
