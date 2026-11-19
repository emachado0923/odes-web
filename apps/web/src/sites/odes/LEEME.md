# Rama `/odes`: Asistente ODES (interfaz)

`/odes` es la pantalla de ingreso «¡Pregúntale a OdeS!» (adaptada de la
maqueta `Preguntale-a-OdeS.html`); su botón «Ingresar» lleva a `/odes/chat`, un
chat que responde preguntas con los documentos del repositorio del
Observatorio de Sapiencia. Las dos páginas comparten el fondo de partículas
(`ingreso/CieloFondo.tsx`; en el chat, fijo detrás de la página) y la franja
magenta «¡Pregúntale a OdeS!» (`ingreso/BandaOdes.tsx`), en el mismo lugar; en
el chat la franja va sin «Ingresar». El chat sigue a BelloEduca (una columna
centrada de 48rem, burbujas con avatar, campo + "Enviar") y el aspecto es el
de la plantilla de Sapiencia con la cabecera y el pie del Observatorio.

## Archivos

```
sites/odes/
├── OdesSitio.tsx          raíz de la rama: kit, cabecera, rutas, pie
├── odes.css               estilos propios (bajo .odes) + correcciones del kit
├── kit/
│   ├── KitPlantilla.tsx   carga la plantilla solo en esta rama
│   └── rutas.ts           /odes/kit/
├── chat/
│   ├── protocolo.ts       contrato HTTP + SSE (copia idéntica en apps/server)
│   ├── sse.ts             lector de Server-Sent Events sobre fetch
│   ├── validacion.ts      valida eventos, estado y errores del servidor
│   ├── cliente.ts         GET /api/odes/estado y POST /api/odes/chat
│   ├── conversacion.ts    reductor, historial que se envía, sessionStorage
│   ├── nombre.ts          nombre (sanitizado, solo local) y saludo por hora
│   ├── enlaces.ts         URLs seguras y miniaturas (urlMiniatura de la base, luego /odes/portadas/)
│   ├── remarkCitas.ts     marcas ⟦n⟧ → números volados
│   ├── formato.ts, textos.ts
│   └── ChatOdes.tsx       une todo
├── componentes/           cabecera, pie, burbujas, respuesta, fuentes, ...
├── ingreso/               compartido con el chat: BandaOdes + banda.css (franja),
│                          CieloFondo + cielo-fondo.css (fondo de partículas y botón
│                          de pausa), BotonPausa, menos-movimiento.ts (reducir
│                          movimiento y pausa recordada), cielo.ts + CieloEstrellado
│                          (estrellas en <canvas>); solo del ingreso: Constelacion +
│                          preguntas.tsx, Planeta (SVG), ingreso.css
└── paginas/               IngresoOdes (/odes), ConversacionOdes (/odes/chat),
                           NoEncontradoOdes (404) y rutas.ts
```

`apps/web/public/odes/`:

- `kit/`: copias **sin modificar** de `Octubre/plantilla-sapiencia`
  (`styles.css`, `script.js`, `fonts/`, `img/logo-observatorio.png`,
  `img/logo-sapiencia-alcaldia.png`). Para actualizar la plantilla, se copian
  de nuevo esos archivos. Los dos logos del kit ya no se usan: la cabecera y
  el pie llevan los blancos de `img/`.
- `img/logo-observatorio-blanco.png` y `img/logo-sapiencia-alcaldia-blanco.png`:
  los logos en blanco de la cabecera y el pie, los mismos de `/principal`,
  `/repositorio` y `/sivu` (fondo magenta `#A94091`).
- `img/odes-*.webp`: el avatar de ODES, sacado del documento «Avatar OdeS:
  versión ultra HD» del Observatorio (3 imágenes de 2800 × 2674):
  - `odes-retrato.webp` (256 × 256, recorte de la cabeza del «Retrato»): avatar
    de los mensajes. El círculo lo hace el CSS.
  - `odes-estudio-{640,1280}.webp` («Estudio») y `odes-despegue-{640,1280}.webp`
    («Despegue»): estuvieron a los lados del chat; el usuario pidió quitarlas
    (2026-10-14). Ya no se usan.
- `img/odes-cara.webp` (400 × 400): la cara de OdeS de la franja «¡Pregúntale
  a OdeS!» (ingreso y chat).
  La maqueta traía un PNG borroso de 320 px; esta se recortó con el mismo
  encuadre del «Retrato» del PDF del avatar. El aro claro va en CSS.
- `img/simbolo-observatorio-magenta.png`: el avatar anterior (símbolo del
  logo del Observatorio en magenta). Ya no se usa.
- `portadas/`: miniaturas `<id>.webp` que genera el indexador con la fuente
  paquete (no se editan aquí). Con un índice generado desde la base de la rama
  /repositorio, cada documento trae además `urlMiniatura`
  (`/api/repositorio/documentos/<id>/miniatura?v=…`): `Miniatura.tsx` la usa
  primero, si no carga prueba `/odes/portadas/<id>.webp` y, si tampoco, el
  icono del tipo.

## La plantilla (kit) solo en esta rama

- `styles.css` se sirve tal cual desde `/odes/kit/` y no pasa por Vite: su
  minificador (Lightning CSS) borra los 14 avisos de licencia `/*! … */` que
  la plantilla exige conservar y descarta reglas que no entiende.
- `KitPlantilla` la pone con `<link rel="stylesheet" precedence>`: React
  espera a que cargue antes de mostrar la rama (sin parpadeo sin estilos) y la
  inserta al principio de `<head>`, antes del CSS de Vite, así `odes.css`
  la corrige sin `!important`.
- `script.js` (global `kitUnal`) aporta el botón flotante de accesibilidad
  (contraste, saturación, modo oscuro, tamaño de letra). No usa `eval` ni
  manejadores en línea: cumple la CSP del servidor. Como se carga después del
  evento `load`, `KitPlantilla` llama a `kitUnal.Accessibility.initModal()` e
  `initFab()` (idempotentes).
- El CSS del kit es global (`body`, `:root`, `h1`, `main`...). Por eso todo
  enlace que sale de una rama recarga la página (`reloadDocument`): tarjetas
  del inicio, logo de la cabecera, "Ir al inicio" de las 404. Así el kit nunca
  convive con `/sivu` en un mismo documento.
- Correcciones al kit en `odes.css`: `main` del kit tiene `overflow: auto`
  (rompía el campo fijo), `.card` tiene `max-width: 350px` (se usa `card-lg`),
  el foco del kit es una línea negra de 1 pt (aquí, anillo de 3 px) y el borde
  de los campos no llega a 3:1 (se usa `neutral-60`).

**Pruebas:** jsdom nunca carga hojas de estilo y React esperaría 60 s. Las
pruebas que montan la rama completa simulan el módulo:
`vi.mock('./sites/odes/kit/KitPlantilla', () => ({ default: () => null }))`.
jsdom tampoco implementa `<canvas>` (avisa «Not implemented» en la consola):
las pruebas que muestran la pantalla de ingreso simulan
`HTMLCanvasElement.prototype.getContext` (con `null`, o con un contexto falso
en `ingreso/IngresoOdes.test.tsx`).

## Flujo y privacidad

Pantalla de ingreso (`/odes`) → «Ingresar» → chat (`/odes/chat`; al llegar así
la página empieza arriba y el foco pasa al campo; recargar o volver con
Atrás/Adelante no lo mueve) → saludo según la hora → "¿Cuál es tu nombre?" (o
"Prefiero no decirlo") → saludo corto con 4 preguntas sugeridas → chat libre.
Si se sale del chat a mitad de una respuesta (p. ej. «Atrás»), lo que ya llegó
se guarda y al volver se ve como respuesta detenida.

El nombre se sanitiza (letras, espacios, `'`, `-`, `.`; máx. 40), se guarda
en `sessionStorage` con la conversación (sobrevive a una recarga, se borra al
cerrar la pestaña o con "Nueva conversación") y **nunca** se envía: el
historial que viaja (`construirHistorial`) solo lleva preguntas y respuestas
de texto, sin marcas de cita, dentro de `LIMITES_CHAT`.

Si el modelo declina una pregunta (`fin` con motivo `rechazo`), lo que ya
había llegado se descarta (como pide la guía de la API para un rechazo a mitad
del flujo): se ve un solo aviso (`MENSAJE_RECHAZO`) y ese intercambio no
vuelve a enviarse en el historial de las preguntas siguientes.

## Accesibilidad

- La conversación es `role="log"` con `aria-live="off"`; solo las respuestas
  terminadas (y los errores) se anuncian en una región `aria-live="polite"`.
- Campos con etiqueta, foco que se queda en el campo al enviar y detener,
  enlace "Saltar al campo de mensaje" en el chat ("Saltar al contenido" en el
  ingreso y el 404), un solo `h1` por página, `lang="en"` en los títulos en
  inglés, Escape cierra el globo de una cita.
- Sin animaciones con `prefers-reduced-motion`, también si cambia con la
  página abierta (`ingreso/menos-movimiento.ts`). Las animaciones del ingreso
  y del chat (estrellas, nebulosas, luna) no terminan solas: el botón «Pausar
  animaciones», abajo a la izquierda, las detiene (WCAG 2.2.2), y la pausa se
  recuerda en la pestaña al pasar de una página a la otra. Contrastes
  ≥ 4,5:1 en texto y ≥ 3:1 en bordes de campos y anillo de foco.
- El campo de texto queda fijo abajo; `scroll-padding-bottom` evita que tape un
  control enfocado con el teclado, y el botón de accesibilidad del kit se sube
  por encima de "Enviar" en pantallas angostas. En su lugar no tiene fondo (se
  ve el de partículas); pegado abajo, encima de la conversación, lleva un velo
  claro con desenfoque (`data-pegado`, que pone ChatOdes).
