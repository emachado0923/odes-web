# `/principal`: página principal del Observatorio (HTML puro)

Es la página principal de https://sapiencia.gov.co/observatorio/ dentro del
aplicativo. **No usa React**: muestra el bloque de WordPress del Observatorio
tal cual, byte por byte. El resto de rutas (`/sivu`, `/odes`, `/repositorio`)
sigue la estructura normal de React en `src/sites/`.

## Regla de oro

**Todo cambio que deba verse en `/principal` se hace en
`observatorio-bloque.html`, pensado para WordPress**, y después ese archivo se
pega en WordPress. Nunca se arregla `/principal` con CSS o JavaScript de la
página del aplicativo: lo que se ve aquí debe ser lo que se ve allá.

## Archivos

| Archivo                      | Qué es                                                                                           | ¿Va a WordPress? |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ---------------- |
| `observatorio-bloque.html`   | **El bloque**: estilos, contenido y script. Es la única fuente de la página principal.           | **Sí, completo** |
| `index.html`                 | La página del aplicativo alrededor del bloque: cabecera y pie del Observatorio, la columna del tema y el botón "Volver arriba". Lleva el marcador donde va el bloque. | No |
| `pagina.css`                 | Estilos de esa página. Nunca del bloque (una prueba lo vigila).                                  | No               |
| `recursos/`                  | Rubik y los logos de la cabecera y el pie.                                                       | No               |
| `componer.ts`, `plugin-vite.ts` | Insertan el bloque en la página, en desarrollo y al compilar.                                 | No               |
| `bloque.test.ts`             | Las reglas de WordPress del bloque (ver abajo).                                                  | No               |
| `componer.test.ts`           | La inserción del bloque en la página.                                                            | No               |

El bloque viene de `Septiembre/observatorio/PaginaPrincipal/observatorio-bloque.html`
(v2.5, 8 de octubre de 2026). Desde el 9 de octubre de 2026 la versión vigente
es la de esta carpeta; la de Septiembre quedó como copia histórica.

## Editar y ver los cambios

1. `npm run dev` (en la raíz) y abra **http://localhost:5173/principal**. Al
   guardar el bloque, la página se recarga sola.
2. `npm test --prefix apps/web` revisa las reglas de WordPress.
3. Para producción, `npm run build`: Vite deja la página completa en
   `apps/web/dist/principal/index.html` y NestJS la sirve en `/principal`.

Qué buscar dentro del bloque (las secciones están señaladas en su comentario
inicial):

| Marca               | Qué cambia                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------ |
| `EDITAR CIFRAS`     | Las 5 fichas de "El Observatorio en cifras", en orden: en escritorio van en una fila a todo el ancho de la ventana. Cada ficha gira (mouse, teclado o toque) y tiene frente (cifra, texto, nota "Dato preliminar" opcional y periodo) y reverso (descripción, fuente y fecha de corte). Antes de publicar, ponga las cifras oficiales. |
| `EDITAR ACCESOS`    | Los enlaces de los 6 botones de acceso rápido.                                             |
| `EDITAR FLOTANTES`  | Los enlaces de los botones flotantes Repositorio, SIVU y ODES.                             |
| `EDITAR MAPA`       | Los datos del mapa (JSON): cada indicador es una opción de la lista "Indicador".           |

Un enlace con `href="#"` se muestra con la etiqueta "Próximamente" y no se
puede pulsar.

## Pasarlo a WordPress

1. Abra `observatorio-bloque.html` y copie **todo** su contenido.
2. En WordPress, edite la página del Observatorio con WPBakery y abra el
   elemento **Raw HTML** de la fila que sigue al banner.
3. Reemplace todo el contenido de ese elemento por lo copiado y actualice la
   página.
4. Revise la página publicada en Chrome y en Safari. El tema y los plugins del
   sitio solo existen allá: un choque con ellos no se ve en `/principal`.

## Reglas de WordPress

`bloque.test.ts` revisa estas reglas en cada `npm test`:

- **Todo bajo `#odes-observatorio`.** Cada selector empieza por
  `#odes-observatorio`, los `@keyframes` llevan el prefijo `odes-` y los ids
  también. Así el bloque no toca el tema ni el tema lo toca a él.
- **Nada que parezca un shortcode.** WPBakery pasa el HTML por
  `do_shortcode`: `[nombre]`, `[nombre atributo` o `[nombre/` se
  ejecutarían si ese shortcode existe en el sitio. Los índices de JavaScript
  van con espacios (`lista[ i ]`) y los selectores genéricos con `*|`
  (`[*|hidden]`).
- **Nada de otros sitios** (hojas de estilo, fuentes, scripts, imágenes,
  iframes). En `/principal` la CSP los bloquearía. La fuente Rubik la pone el
  tema.
- **Sin `<strong>`, `<header>` ni `target`.** El CSS del sitio pinta de morado
  todo `<strong>` y corre 185 px el `nav` de cualquier `<header>`. El plugin
  de accesibilidad quita los `target`.
- **Un solo script**, dentro de `(function () { 'use strict'; … })();`.
- **Sin caracteres invisibles** ni saltos de línea de Windows. En el código,
  use escapes como `\u0300`.

Esto no tiene prueba automática, pero aplica igual:

- El bloque debe cumplir WCAG 2.1 AA.
- Hay que probarlo en Safari y en Chrome.
- No se inventan cifras oficiales.
- No se usan atributos `onclick="…"`. La CSP de `/principal` no los permite
  (`script-src-attr 'none'`): use `addEventListener` dentro del script.

## Cómo lo sirve el servidor (CSP)

NestJS (`apps/server/src/frontend/pagina-principal.ts`) responde `/principal`
con `dist/principal/index.html` y con la CSP del resto del sitio. La única
diferencia es `script-src`, que en esta página vale `'self'` más el hash
`sha256` de cada script en línea. El servidor calcula esos hashes sobre el
mismo archivo que envía, así que coinciden siempre, cambie como cambie el
bloque, y no hace falta `'unsafe-inline'`. Si el bloque llegara a necesitar
algo de otro dominio, hay que agregar ese dominio a la CSP. La del sitio está
en `apps/server/src/seguridad/opciones-helmet.ts`, y la de esta página se
arma a partir de ella en `pagina-principal.ts`.

## Robot ODES (flotante, abajo a la derecha)

Desde el mapa hasta el final del bloque, el robot flota abajo a la derecha
(sticky, como Repositorio y SIVU), con el botón "Consúltale a ODES" debajo.
Desde la v2.33 mira de lado a lado en bucle (antes saludaba). Es **sin
fondo**: el video y la imagen tienen transparencia. En celular no aparece:
ahí ODES es un botón redondo abajo a la izquierda.

| Archivo | Uso |
| --- | --- |
| `robot-mirada.webm` | VP9 con alfa: Chrome, Edge y Firefox. |
| `robot-mirada.mov` | HEVC con alfa: Safari, iPhone y iPad. |
| `robot-mirada.webp` | El robot mirando al frente, quieto: mientras carga, con "reducir movimiento" o si el navegador no reproduce solo. |

El bucle sale del render del aterrizaje (`robotsapiencia.mp4`): son los
cuadros 237 a 323, de 7,90 s a 10,80 s (2,9 s). Ahí el robot está quieto,
mira al frente, gira la cabeza a un lado y al otro y vuelve al frente. El
cuadro 324 casi no se distingue del 237 (diferencia menor que entre dos
cuadros seguidos), así que el salto del bucle no se nota.

Los archivos anteriores (`robot-saludo.*`, `robot-aterrizaje.*`,
`robot-inicio.*` y los `.mp4`/`.jpg` con fondo blanco) se dejan en el
servidor para los bloques ya pegados, pero el bloque actual no los usa.

- **Qué formato usa cada navegador:** lo elige el script del bloque
  (`formatoRobot`). Safari y los navegadores de iPhone y iPad usan el `.mov`,
  y los demás el `.webm`. Cada uno pinta negro el fondo del formato del otro.
- **Dónde están:** en `apps/web/public/principal/robot/`. Esta página los
  toma de ahí con `<meta name="observatorio-robot-base">`. En WordPress el
  bloque usa la carpeta de su atributo `data-odes-robot-base` (ver EDITAR
  ROBOT en el bloque). Por ahora apunta a este servidor de pruebas. Para la
  página oficial hay que subir los tres archivos del saludo a Medios y
  cambiar esa dirección.
- **Cómo se generaron:** a partir del render de 1920 × 1080 sobre gris, con
  `scripts/robot/procesar-robot.swift`, en modo `cuadros` (PNG con alfa a
  720 px, para que el robot de 18.72rem se vea nítido en pantallas de alta
  densidad), y ffmpeg (`brew install ffmpeg`). Con los cuadros en `aterrizaje/`:

```bash
/tmp/procesar-robot cuadros robotsapiencia.mp4 aterrizaje 520 70 760 720
```

```bash
ffmpeg -framerate 30 -start_number 237 -i aterrizaje/c%05d.png -frames:v 87 -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 38 -row-mt 1 -deadline good -cpu-used 1 -g 90 -an robot-mirada.webm
```

```bash
ffmpeg -framerate 30 -start_number 237 -i aterrizaje/c%05d.png -frames:v 87 -c:v hevc_videotoolbox -pix_fmt bgra -alpha_quality 0.7 -b:v 900k -tag:v hvc1 -movflags +faststart -an robot-mirada.mov
```

  La imagen quieta es el cuadro 237 con `cwebp -q 85 -alpha_q 100`.

## Diferencias con la página de WordPress

Ninguna está dentro del bloque:

- La cabecera y el pie son los del Observatorio, no los de sapiencia.gov.co,
  y no hay banner. El banner lo pone la entidad en WordPress. Los dos van en
  el magenta del logo del Observatorio (#a94091), con los logos en blanco: el
  del Observatorio arriba y los de Sapiencia y la Alcaldía abajo.
- Rubik sale del propio servidor. En WordPress la carga el tema.
- La columna mide lo mismo que la del tema: 1070 px de contenido, con 20 px a
  cada lado por debajo de 1140 px.
- El botón "Volver arriba" ocupa el mismo lugar que el del tema, porque el
  botón flotante ODES del bloque se ubica encima de él. Tiene el fondo más
  oscuro para que la flecha se distinga.
