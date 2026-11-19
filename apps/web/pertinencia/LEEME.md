# `/pertinencia`: bloque de WordPress de la medida de pertinencia

`pertinencia-bloque.html` es el contenido de
https://sapiencia.gov.co/metodologia_de_pertinencia/ debajo del banner: la banda
del título "Medida de pertinencia", la presentación, "Consulta tu puntaje de
pertinencia" (el espacio del tablero y el botón "Conoce más") y "Normativa y
más detalle" (los 5 accesos numerados). Es HTML, CSS y JavaScript puros, para
pegar en un elemento **Raw HTML** de WPBakery, igual que el bloque de
`/principal` (ver `../principal/LEEME.md`).

El aplicativo muestra ese mismo archivo en `/pertinencia`, entre la cabecera y
el pie oficiales recreados y debajo del marcador del banner
(`src/sites/pertinencia`). La cabecera, el pie y el banner **no** van en el
bloque: en WordPress los pone el sitio.

## Regla de oro

**Todo cambio de `/pertinencia` se hace en el bloque** (`pertinencia-bloque.html`),
y después el archivo se pega en WordPress. Nunca se arregla el contenido de
`/pertinencia` con React o con CSS del aplicativo: lo que se ve en el
aplicativo debe ser lo que se ve en WordPress. Las hojas del aplicativo no
entran al bloque (`src/sites/pertinencia/estilos.test.ts` lo vigila).

## Archivos

| Archivo                   | Qué es                                                                                                  | ¿Va a WordPress? |
| ------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------- |
| `pertinencia-bloque.html` | **El bloque**: plantilla de enlaces, estilos, contenido y script. Única fuente del contenido.            | **Sí, completo** |
| `componer.ts`             | Saca el script del bloque y lo convierte en un módulo de JavaScript (lo usan el plugin y las pruebas).   | No               |
| `plugin-vite.ts`          | Sirve `pertinencia-bloque.html?script` como módulo, para que el aplicativo corra el script sin CSP rota. | No               |
| `bloque.test.ts`          | Las reglas de WordPress y de diseño del bloque (ver abajo).                                              | No               |
| `script.test.ts`          | El script del bloque solo, en jsdom: enlaces y tablero (vacío, del mismo sitio y de otro).               | No               |

En el aplicativo, `src/sites/pertinencia/componentes/BloquePertinencia.tsx`
pone el bloque en la página y corre su script; `src/sites/pertinencia/pertinencia.css`
arma lo de alrededor (Rubik, la columna del tema, el banner y el 404).

## Editar y ver los cambios

1. `npm run dev` (en la raíz) y abra **http://localhost:5173/pertinencia**. Al
   guardar el bloque, la página se recarga sola.
2. `npm test --prefix apps/web` revisa las reglas de WordPress, el script y la
   página.

Qué buscar dentro del bloque (están señalados en su comentario inicial):

| Marca            | Qué cambia                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EDITAR ENLACES` | Las direcciones de "Conoce más" y de los 5 accesos, en la `<template>` del principio del archivo (un `href` por botón). Los botones del contenido no traen dirección: la pone el script desde ahí. |
| `EDITAR TABLERO` | La dirección del tablero, en `data-odes-tablero-url` (junto a "Consulta tu puntaje de pertinencia"). Vacía, como viaja hoy: el recuadro punteado "Espacio para el tablero de control". |

- Por ahora los 6 enlaces van a `https://www.google.com`. Candidatos conocidos
  (anotados en el bloque): Resolución 5375 de 2025
  (`https://sapiencia.gov.co/wp-content/uploads/2025/10/resolucion_pertinencia_2026_vf_def.pdf`)
  y Circular 08 de 2026
  (`https://sapiencia.gov.co/wp-content/uploads/2026/05/las-f-ap-gd-032circular-aclaracion-pertinencia_ope-1.pdf`).
- Un `href` vacío, `#` o con un protocolo que no sea `https:`, `http:` o
  `mailto:` deja ese botón sin enlace.
- Todos los enlaces se abren en la misma pestaña (en WordPress el sitio quita
  los `target`; ver abajo).

## Pasarlo a WordPress

1. Abra `pertinencia-bloque.html` y copie **todo** su contenido (desde
   `<meta charset="utf-8">` hasta el último `</script>`).
2. En WordPress, edite la página **Metodología de pertinencia**
   (`/metodologia_de_pertinencia/`) con WPBakery.
3. Deje las filas del banner (la franja "Metodología de pertinencia" y la
   imagen "Puntaje de pertinencia para programas", o el banner nuevo que
   defina la entidad). La fila de los tres botones morados (Resolución,
   Circular, Consulta) queda reemplazada por el bloque: bórrela o desactívela.
   En la fila de la imagen del banner:
   - borre el elemento **Separador** del final (la línea gris de todo el ancho
     de la columna, que no está en el diseño);
   - en la configuración de la imagen (elemento Image de Jupiter, `.mk-image`),
     ponga el margen inferior (Margin Bottom) en 0 (hoy tiene 10 px).

   Así la banda del título queda a 51 px del banner (101 px en celular), como
   en el aplicativo. Si se dejan, queda a 87 px (137 px en celular) con la
   línea gris de por medio.
4. Debajo del banner, agregue una fila de una columna con un elemento
   **Raw HTML** y pegue lo copiado. (Si ya existe el elemento de una versión
   anterior, reemplace todo su contenido.)
5. Actualice la página y revísela publicada en Chrome y en Safari, también en
   celular. El tema y los plugins del sitio solo existen allá: un choque con
   ellos no se ve en `/pertinencia`. Pruebe el botón de accesibilidad del sitio
   ("Aumentar texto", contrastes).

## El tablero (paso pendiente)

El bloque viaja con `data-odes-tablero-url=""`. El aplicativo, antes de correr
el script, le pone su propio tablero estático
(`/tableros/pertinencia/index.html`, del mismo sitio), así que en
`/pertinencia` siempre se ve el tablero y en WordPress, por ahora, el
recuadro punteado.

Cuando se decida dónde vive el tablero para WordPress, ponga su dirección en
`data-odes-tablero-url` (EDITAR TABLERO). El script cambia el recuadro por un
marco (`<iframe title="Consulta del índice y el puntaje de pertinencia por programa" loading="lazy">`)
que se ajusta al alto del tablero:

- **En sapiencia.gov.co (FTP, mismo sitio que la página): hoy no se ve.** El
  servidor del sitio (Apache) responde **todo** con `X-Frame-Options: DENY`
  (páginas, HTML estáticos, PDF, CSS y JS; comprobado el 27 de octubre de
  2026), y `DENY` también bloquea los marcos del mismo sitio. Con el tablero
  allá, el marco quedaría de 860 px con el recuadro gris del navegador de que
  no se puede mostrar. Antes de poner la dirección:
  1. El administrador del servidor debe cambiar la cabecera de la carpeta del
     tablero a `X-Frame-Options: SAMEORIGIN` o a
     `Content-Security-Policy: frame-ancestors 'self'` (en la configuración de
     Apache). Si el servidor permite `.htaccess`, uno en la carpeta del
     tablero con `Header always set X-Frame-Options "SAMEORIGIN"` puede
     bastar.
  2. Compruébelo con `curl -I https://sapiencia.gov.co/<carpeta>/index.html`:
     debe decir `SAMEORIGIN` (o no traer `X-Frame-Options` y sí el
     `frame-ancestors 'self'`), no `DENY`.

  Con eso, el bloque mide el tablero por dentro, igual que el aplicativo (los
  bloques de `#root` y las listas desplegables abiertas, `.dropdown-menu.show`,
  más 16 px de aire). Mientras carga, el marco mide 340 px (la vista inicial
  del tablero).
- **En otro sitio (por ejemplo, Vercel):** el bloque no puede mirar adentro.
  El tablero debe avisar su alto con `postMessage` y el bloque solo acepta
  mensajes de ese marco y de ese sitio, con un número entre 200 y 20 000.
  Mientras tanto el marco mide 340 px; si no avisa a los 8 s de cargar, queda de
  860 px (1200 px cuando el bloque es angosto) y se desplaza por dentro. El
  tablero de Vercel ya avisa (`js/altura-marco.js`, con un temporizador: Chrome
  no anima los marcos de otro sitio fuera de la pantalla). Algo así (en
  `public/tableros/pertinencia/index.html`):

  ```js
  // Avisa a la página que lo incrusta (sapiencia.gov.co) el alto de su contenido.
  (function () {
    var raiz = document.getElementById('root');
    if (!raiz || window.parent === window) return;
    function avisar() {
      var piezas = Array.prototype.slice.call(raiz.children)
        .concat(Array.prototype.slice.call(raiz.querySelectorAll('.dropdown-menu.show')));
      var fondo = 0;
      piezas.forEach(function (p) { fondo = Math.max(fondo, p.getBoundingClientRect().bottom); });
      window.parent.postMessage({ tipo: 'pe-tablero-alto', alto: Math.ceil(fondo + window.scrollY + 16) }, 'https://sapiencia.gov.co');
    }
    new ResizeObserver(avisar).observe(raiz);
    new MutationObserver(avisar).observe(raiz, { childList: true, subtree: true });
    avisar();
  })();
  ```

  Además, el servidor del tablero debe dejar que sapiencia.gov.co lo incruste
  (sin `X-Frame-Options: DENY/SAMEORIGIN` y, si hay CSP,
  `frame-ancestors https://sapiencia.gov.co`). Hoy Vercel sirve el tablero
  estático sin esas cabeceras.
- En el aplicativo nada cambia: siempre usa su tablero del mismo sitio (la
  CSP del aplicativo no deja incrustar otros sitios).

## Reglas de WordPress

`bloque.test.ts` revisa estas reglas en cada `npm test`. Cada una se prueba
también sobre una copia del bloque con el error metido a propósito, para saber
que la regla sí lo encuentra.

- **Todo bajo `#odes-pertinencia`.** Cada selector empieza por
  `#odes-pertinencia`; la única excepción son las reglas del plugin de
  accesibilidad (`body.pojo-a11y-… #odes-pertinencia`). Los ids, las
  propiedades personalizadas (`--odes-…`), los `@keyframes` y el contenedor
  (`@container odes-pertinencia`) llevan el prefijo `odes-`.
- **Nada que parezca un shortcode.** WPBakery pasa el HTML por
  `do_shortcode`: `[nombre]`, `[nombre atributo` o `[nombre/` se ejecutarían si
  ese shortcode existe en el sitio. Los índices de JavaScript van con espacios
  (`lista[ i ]`).
- **Nada de otros sitios** (hojas, fuentes, scripts, imágenes ni marcos en el
  HTML). Las únicas direcciones son las de EDITAR ENLACES; el marco del tablero
  lo crea el script. La fuente Rubik la pone el tema (sin `@font-face` ni
  `@import`).
- **Sin `<strong>`, `<header>` ni `target`.** El CSS del sitio pinta de morado
  todo `<strong>` (`.master-holder strong`) y corre 185 px el `nav` de
  cualquier `<header>`. El sitio tiene activado quitar los `target`, así que
  todo se abre en la misma pestaña y no van avisos de "pestaña nueva".
- **Enlaces desde EDITAR ENLACES:** cada botón lleva su clave
  (`data-odes-enlace`) y ninguna dirección propia.
- **Tamaños de letra en `--odes-fs`.** El botón "Aumentar texto" del plugin de
  accesibilidad (pojo) pone `font-size: 120 %…200 % !important` en `p`, `li`,
  `span`, `h1`, `h2`…, y en los elementos anidados se acumula. El bloque le gana
  con `font-size: var(--odes-fs) !important` en todos sus elementos (cada uno
  declara su `--odes-fs` en `em`) y, en cambio, agranda la letra de su raíz con
  cada clase `pojo-a11y-resize-font-N`: todo el bloque crece parejo.
- **Un solo script**, dentro de `(function () { 'use strict'; … })();`.
- **Sin caracteres invisibles** ni saltos de línea de Windows (en el código,
  use escapes en vez del carácter literal).
- **Fluido:** el bloque se adapta a su propio ancho (container queries en `em`),
  no al de la ventana: en WordPress la columna mide 1070 px en escritorio, el
  ancho de la pantalla menos 10 px entre 961 y 1140 px y el ancho de la
  pantalla menos 40 px hasta 960 px. Sin `@media` de ancho de ventana.
- **Aire lateral mínimo de 20 px.** Entre 961 y 1140 px la columna del tema va
  a 5 px de los bordes; la raíz completa el aire hasta 20 px con
  `padding: … max(0px, calc(20px - (100vw - 100%) / 2))` (100 % es el ancho de
  la columna). En los demás anchos, y en el aplicativo, da 0. Con barras de
  desplazamiento clásicas (Windows), `100vw` incluye la barra y en ese rango
  el aire queda en unos 12 px.
- **Ritmo vertical.** La raíz lleva 31 px arriba (con los 20 px que baja la
  banda para alinearse con los triángulos, 51 px desde el banner) y 51 px
  abajo: con los 25 px de margen del Raw HTML quedan 76 px hasta el pie (66 px
  hasta 767 px, donde WordPress deja 15).

Comprobado además en la página real (sin prueba automática): el CSS del sitio
pone `a:focus { border: 2px solid #90D5FF }` a todo enlace (el bloque lo
anula), Jupiter pone `select { min-width: 240px }` (el bloque no usa `select`)
y el botón "Volver arriba" del tema va abajo a la derecha (el bloque no tiene
nada fijo).

Esto no tiene prueba automática, pero aplica igual:

- El bloque debe cumplir WCAG 2.2 AA (contraste, foco visible, sin animaciones
  con "reducir movimiento", sin desbordes a 320 px).
- Hay que probarlo en Safari y en Chrome.
- No se usan atributos `onclick="…"`: la CSP del aplicativo no los permite.

## Cómo lo corre el aplicativo (CSP)

La CSP del aplicativo (`apps/server/src/seguridad/opciones-helmet.ts`) tiene
`script-src 'self'`: no deja correr scripts en línea ni `eval()`. Por eso:

1. `BloquePertinencia.tsx` importa el bloque con `?raw` y lo pone tal cual con
   `innerHTML` (`dangerouslySetInnerHTML`). Los estilos en línea sí se permiten
   (`style-src 'unsafe-inline'`); el `<script>` en línea queda en el DOM pero no
   corre (innerHTML nunca ejecuta scripts).
2. `plugin-vite.ts` (registrado en `vite.config.ts`) sirve
   `pertinencia-bloque.html?script` como un módulo que exporta una función con
   el cuerpo del script. Vite lo empaqueta en el chunk de la rama, así que se
   carga desde el propio sitio.
3. Al montar (`useLayoutEffect`, antes de pintar), el componente pone
   `/tableros/pertinencia/index.html` en `data-odes-tablero-url` y llama a esa
   función. En StrictMode el efecto corre dos veces: la segunda no hace nada (y
   el script se protege igual con `data-odes-iniciado`).
4. Si el bloque sale de la página (al navegar a otra rama), su script suelta
   los oyentes de la ventana en el siguiente evento.

## Diferencias con la página de WordPress

Ninguna está dentro del bloque:

- La cabecera y el pie son recreaciones de los oficiales, y en lugar del
  banner hay un marcador punteado.
- Rubik sale del propio servidor. En WordPress la carga el tema.
- La columna imita la del tema: 1070 px de contenido, con 20 px a cada lado por
  debajo de 1140 px. En la página real, entre 961 y 1140 px, la columna va a
  5 px de los bordes y el bloque completa el aire hasta 20 px (ver «Aire
  lateral mínimo»), así que el contenido queda igual en los dos.
- El pie recreado deja sobre sí el margen que deja WordPress (25 px; 15 px
  hasta 767 px), así que el aire entre los accesos y el pie es el mismo.
- El panel de accesibilidad de la cabecera recreada imita al plugin del sitio
  con sus propias clases (`pe-a11y-…`); el del sitio usa `pojo-a11y-…`.
- En el aplicativo se ve el tablero; en WordPress, hasta que tenga dirección,
  el recuadro punteado.
