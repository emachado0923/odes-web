# Tablero pertinencia programas de formación

Observatorio de Sapiencia · Agencia de Educación Postsecundaria de Medellín

Ventanilla de consulta del índice de pertinencia (IP) y del puntaje PUAP de los
programas académicos, conforme a la Resolución 3411 del 9 de octubre de 2026. Las dos
páginas van sin cabecera ni pie porque se publican dentro de la página web de la medida
de pertinencia, que ya los trae. Es un tablero estático: una carpeta de archivos que se publica tal cual, sin backend y sin
proceso de compilación, con la misma plantilla, librerías y apariencia del tablero de
matrícula del Observatorio. Los datos provienen de los anexos 2, 3 y 4 de la
resolución y se convierten en un módulo de JavaScript con `etl_pertinencia.py`.

---

## 1. Estructura de archivos

```
tablero_pertinencia/
├── index.html                  cascarón: cabecera, pie y estilos propios del tablero
├── js/
│   └── consulta.jsx            aplicación React (paso a paso, consulta y resultado)
├── plantilla/                  plantilla de Sapiencia, copiada sin cambios
├── css/
│   └── correcciones-plantilla.css   correcciones del kit (las mismas del tablero de matrícula)
├── vendor/                     React, ReactDOM, Babel y ECharts locales
├── img/                        favicon, logo del Observatorio y pata de Sapiencia y Alcaldía
├── datos/
│   ├── definiciones.js         textos de la bienvenida, el paso a paso y las definiciones, editable por el área
│   └── pertinencia.js          datos generados, no editar a mano
├── insumos/                    anexos de la resolución y base de programas que lee el ETL
├── etl_pertinencia.py          convierte los anexos en datos/pertinencia.js
└── LEEME.md
```

## 2. Cómo abrirlo

Babel transpila `consulta.jsx` en el navegador con una petición que el protocolo
`file://` bloquea, así que el tablero se sirve por HTTP:

```bash
cd tablero_pertinencia
py -m http.server 8000        # en Linux o macOS: python3 -m http.server 8000
# abrir http://localhost:8000
```

En el portal institucional basta con publicar la carpeta completa (la carpeta
`insumos/` puede omitirse). No hay ninguna dependencia externa: librerías, letra Rubik
e íconos se cargan desde la propia carpeta.

## 3. Universo de los datos

| Tabla | Anexo | Registros |
|---|---|---|
| Referentes estratégicos (8 clústeres y 3 proyectos) | Anexo 2, tabla 1 | 11 |
| Ocupaciones de la CUOC con su descripción y su marcación | Anexo 2, tabla 3 | 678 (433 relacionadas) |
| Denominaciones marcadas | Anexo 2, tabla 2 | 14.903 (solo se cuenta; no se publica) |
| Pares campo detallado y ocupación, con el nivel de habilitación | Anexo 3, tabla 4 | 3.673 |
| Campos detallados con sus conteos, el índice y los puntajes | Anexo 4, tabla 5 | 106 |
| Correspondencia índice a puntaje por línea | Anexo 4, tabla 6 | 11 + 15 + 2 filas |
| Programas | SNIES, base `261026Programas_OPE.xlsx` (26 de octubre de 2026) | 32.073 de 317 instituciones |

**Programas.** La resolución no trae lista de programas: desde el 28 de octubre de 2026
el tablero usa la base nacional del SNIES `insumos/261026Programas_OPE.xlsx`, con una
fila por registro (un código SNIES cada una, activos e inactivos, de pregrado y
posgrado). La unidad de análisis es el campo detallado CINE del programa: se cruza por
nombre con los 106 de la tabla 5 (cruzan todos) y de ahí salen las ocupaciones, el
índice y el puntaje. El ETL comprueba que el índice y el puntaje que trae la base
(`INDICE_PERTINENCIA`, `PUNTAJE_PERTINENCIA`) coinciden con los del campo y la línea
del programa; en esta versión no hay diferencias.

- La lista de instituciones se arma con el nombre de la institución (las seccionales
  comparten nombre y quedan juntas).
- En la lista de programas, el subtítulo lleva el código SNIES, la institución y un
  tercer dato para distinguir los programas con el mismo nombre: «Virtual» si la
  modalidad es virtual y, si no, el municipio de oferta (el domicilio del programa).
  Los 14 registros de la base que no traen municipio ni departamento dicen «Sin
  domicilio registrado». El mismo subtítulo se repite en la ficha del programa elegido.
- Con una institución elegida, la lista muestra todos sus programas; sin institución
  muestra 300 a la vez con un aviso, y el buscador alcanza todos.
- Unos 120 nombres del SNIES traen «¿» en lugar de una letra con tilde (MAESTR¿A,
  DISE¿O) o signos de interrogación sueltos; el ETL los repara con la palabra bien
  escrita en la misma base y avisa cuántos reparó. También cambia las tildes graves o
  diéresis que trae por error (ENFERMERÌA, INGENIERÏA) por la tilde aguda.
- El ETL se detiene sin escribir `pertinencia.js` si los conteos de la tabla 5 no salen
  de la tabla 4, si el índice o el puntaje de la base no coinciden con los del campo o
  si algún programa no tiene campo detallado.
- Los programas se guardan como filas `[código, nombre, institución, nivel, modalidad,
  campo, lugar]`; los tableros las convierten en objetos al cargar.
- Al pie de los tableros va la nota `notaFinal` de `datos/definiciones.js`.

**Clasificación del SNIES.** El campo detallado es el que reporta el SNIES y la
resolución dispone que la Agencia no lo asigna ni lo modifica. Conviene saber que esa
clasificación tiene casos llamativos: por ejemplo, 16 de los 20 programas llamados
«Ingeniería de Sistemas» con oferta en Medellín están clasificados en *Electrónica y
automatización* y no en *Desarrollo y análisis de software y aplicaciones*. El tablero
los muestra tal como vienen.

## 4. Verificaciones del ETL

El script reproduce, desde los 3.673 pares de la tabla 4 y la marcación de la tabla 3,
los cuatro conteos de cada campo de la tabla 5 (habilitadas directas y
complementarias, relacionadas directas y complementarias) y avisa en pantalla si alguno
difiere; en la versión actual no hay diferencias. El tablero, a su vez, recalcula el
índice con la fórmula de la resolución (POP y redondeo hacia arriba) y marca en rojo si
el resultado no coincide con el del anexo 4.

## 5. Estructura del tablero

| Bloque | Contenido |
|---|---|
| ¿Cómo se mide la pertinencia? | Los cuatro pasos de la metodología en fichas con ícono, número, título y una frase |
| Consulte su programa | Institución y programa (busca por nombre o código SNIES), con fichas de la selección y botón de limpiar |
| Programa consultado | Nombre, código SNIES, institución, nivel, modalidad y el campo de formación que determina el índice |
| Indicadores | Índice, ocupaciones habilitadas, ocupaciones relacionadas y puntaje en la línea del programa: pregrado para los programas de pregrado y Extendiendo Fronteras Educativas para los de posgrado |
| Ocupaciones a las que da acceso el programa | Tabla agrupada en habilitación directa y complementaria (el peso va en el encabezado del grupo); dentro de cada grupo, primero las relacionadas y luego en orden alfabético; la relación es un ícono y los referentes, etiquetas; las no relacionadas van en gris; muestra 20 filas y un botón despliega el resto; un clic en la fila muestra la descripción de la CUOC; casilla para ver solo las relacionadas; descarga en CSV |
| ¿Cómo se calculan el índice y el puntaje? | Tres columnas: los cuatro conteos de ocupaciones del campo, la fórmula del artículo sexto con esas cifras y el puntaje de la línea del programa con su escala de conversión, el rango que aplica en magenta |

La línea Enlaza Mundos (posgrado en el exterior) no se muestra porque esos programas
no están en el SNIES; sus puntajes siguen en `datos/pertinencia.js` (`puntaje.em`) por
si se habilita después. Elegir un programa de otra institución ajusta la institución;
cambiar de institución suelta el programa. Al consultar, la página se desplaza al
resultado. La tabla se descarga en CSV (punto y coma, coma decimal y marca de orden de
bytes, para Excel en español).

## 5a. Versión resumida para la página web

`index.html` es ahora la versión resumida (la completa, con el paso a paso y la tabla de ocupaciones, quedó en `completo.html`). Es la misma consulta sin cabecera, pie, bienvenida ni tarjetas
explicativas ni tabla de ocupaciones: los dos selectores arriba y, debajo, la ficha del
programa, los cuatro indicadores y una tarjeta con la fórmula del índice y el puntaje
con su escala. Cabe en una sola vista de unos 1.000 × 850 píxeles y se incrusta en la
página de la medida de pertinencia con un marco:

```html
<iframe src="https://.../tablero_pertinencia/index.html" title="Consulta de pertinencia"
  width="100%" height="860" style="border:0" loading="lazy"></iframe>
```

Usa los mismos datos y el mismo `js/consulta.jsx` (el atributo `data-modo="resumen"`
del contenedor elige la vista), de modo que cualquier actualización de los anexos se
refleja en las dos páginas. Fondo blanco, sin botón flotante de accesibilidad.

## 6. Identidad visual

La misma del tablero de matrícula: plantilla de Sapiencia en `plantilla/`, cabecera y
pie azul `#0E5074` con filete magenta, letra Rubik, tarjetas blancas con borde fino,
magenta `#921C8D` para la selección activa y texto negro. Sin subtítulos en las
tarjetas, sin barras verticales ni fondos de color en los cuadros. Los estilos propios
están en el bloque `<style>` de `index.html`; las piezas nuevas van al final, bajo
«Consulta de pertinencia» y «Sobriedad».

Colores de los datos: habilitación directa en azul oscuro `#0B3A56`, complementaria en
celeste `#3AB6E6` y relación con los referentes en verde `#2EA14E`; la línea del
programa consultado en magenta. Sin degradados ni sombras, cifras con un decimal
donde aplica. `js/consulta.jsx` conserva las funciones de gráfico (`barrasH`, `anillo`)
del tablero de matrícula por si se quiere agregar una visualización.

## 7. Regenerar los datos

Cuando la Agencia actualice los anexos mediante resolución:

```bash
python3 etl_pertinencia.py insumos datos
```

Copie `datos/pertinencia.js` a `public/tableros/pertinencia/datos/` y péguelo también en
`public/tableros/medida-pertinencia/index.html` (ver `../medida-pertinencia/LEEME.md`).
El script solo necesita `openpyxl`. Lee las tablas 1, 3 y 4 (anexo 2), 4 (anexo 3) y 5
y 6 (anexo 4), cuenta las denominaciones de la tabla 2, cruza los programas y
reescribe `datos/pertinencia.js` (unos 2,6 MB; 515 KB comprimido). Los nombres de archivo de los anexos
están en la sección 1 del script. Las fechas de corte y de elaboración que muestra el
tablero están en la sección 8 (`meta`) y hay que actualizarlas con cada versión.
