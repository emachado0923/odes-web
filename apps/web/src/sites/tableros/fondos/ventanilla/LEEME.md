# Ventanilla de consulta de los fondos

Piezas de `/tableros/fondos-2026/ventanilla`. La pantalla (`../VentanillaFondos.tsx`) consulta por documento y coordina; cada pieza muestra una parte del expediente.

## Para quién y para qué

La usa el equipo de Sapiencia (planeación, fondos) para atender un caso: escribe el documento de un beneficiario y necesita entender en segundos **quién es, qué beneficios tiene, en qué estado va cada uno y cuánto se le ha girado**, y luego bajar al detalle periodo por periodo. Se usa muchas veces al día, en escritorio y a veces en celular. Son datos personales: sobriedad y precisión antes que adorno.

## Plan de diseño

**Lo memorable es el recorrido.** Un beneficio es un camino por semestres: activo, suspendido, activo otra vez, en gracia, graduado. Ese camino, dibujado periodo por periodo con el color de cada estado, es la pieza con carácter de la pantalla (`HistorialPeriodos`). Todo lo demás se queda quieto y ordenado para que el recorrido se lea.

**Color.** Los del tablero, sin colores nuevos (variables en `base.css`):

| Nombre | Valor | Uso |
|---|---|---|
| Azul | `#0E5074` | Estructura, títulos, enlaces |
| Azul hondo | `#0B3A56` | Estado activo, cifras principales |
| Magenta | `#921C8D` | Acción principal y selección (uno por vista) |
| Cian | `#3AB6E6` | Foco del teclado, apoyo |
| Tinta | `#17313F` | Texto |
| Fondo | `#F7F9FB` | Fondo de página; papel blanco encima |

Los estados usan `COLOR_ESTADO` de `estados.ts` (nueve categorías, las mismas del tablero). Un estado siempre lleva su texto: el color nunca es la única señal.

**Letra.** La familia de la página (no se cambia). Jerarquía con tamaño y peso (`--vc-t-*`), cifras con `tabular-nums` (`.vc-num`), renglones de menos de 80 caracteres. Los nombres de las bases vienen en MAYÚSCULAS: para leer se pasan por `nombrePropio()`; los estados, por `estadoLegible()` o `<ChipEstado>`.

**Composición.**

```
┌ Buscador ──────────────────────────────────────────────────────────┐
│ protagonista sin resultado; compacto cuando ya hay expediente       │
└─────────────────────────────────────────────────────────────────────┘
┌ Persona ───────────────────────────────────────────────────────────┐
│ Nombre                                  celular  correo  residencia │
│ documento                                                           │
│ índice de beneficios: programa, convocatoria, estado (salta a él)   │
└─────────────────────────────────────────────────────────────────────┘
┌ Beneficio ─────────────────────────────────────────────────────────┐
│ programa, convocatoria                                     estado   │
│ lo esencial: total girado, giros, periodos                          │
│ RECORRIDO por periodo  ← la pieza con carácter                      │
│ detalle del periodo y tabla completa                                │
│ datos del beneficio, personales y académicos                        │
└─────────────────────────────────────────────────────────────────────┘
┌ Eventos ───────────────────────────────────────────────────────────┐
│ línea de tiempo de reportes                                         │
└─────────────────────────────────────────────────────────────────────┘
```

Alineado a la izquierda. La jerarquía se marca con tamaño, peso y espacio; no todo va en una tarjeta igual con la misma sombra.

**Principios.**

1. Primero la respuesta, después el detalle: lo que se pregunta siempre (estado, total girado) arriba y grande; el resto, a un clic.
2. La interacción responde a la persona: desplegar, elegir un periodo, copiar. Nada se mueve solo, salvo una entrada sobria del resultado.
3. Las palabras son de quien atiende, no de la base: «Total girado», no «MONTO TOTAL DESEMBOLSADO». Frases en minúscula con mayúscula inicial, voz activa, sin relleno.
4. Lo que no está, no se inventa ni se rellena: un campo vacío no se muestra; una tabla sin montos no dibuja barras.

**Lo que se evita** (se lee como plantilla): rótulos en MAYÚSCULAS sostenidas, antetítulos sobre cada bloque, datos unidos con puntos medios («A · B · C»), una flecha «→» en cada botón, la misma tarjeta redondeada con la misma sombra para todo, entradas con desvanecido en cada sección, degradados decorativos, letra monoespaciada para datos, numerar lo que no es una secuencia.

**Piso de calidad.** Funciona desde 360 px de ancho; todo se alcanza con teclado y se ve el foco; respeta `prefers-reduced-motion`; contraste de texto de 4,5:1 o más; los controles tienen nombre accesible; nada depende solo del color.

## Archivos

| Archivo | Qué es | Dueño |
|---|---|---|
| `tipos.ts` | `FichaFondos`, `Seccion`, `Tabla`, `ConsultaReciente` | compartido |
| `ficha.ts` | Lectura de la ficha: `campo`, `seccion`, `tablaHistorial`, `indiceColumna`, `aNumero`, `pesos`, `pesosCortos`, `formatoDocumento`, `partirPeriodo`, `resumenBeneficio`, `PROGRAMAS`, `CORTE_DATOS`; y para leer lo que viene en MAYÚSCULAS: `nombrePropio` (personas, sin reponer tildes), `tituloLegible` (instituciones, programas y lugares, con tildes y siglas) y `oracionLegible` (modalidad, tipo de documento, motivos) | compartido |
| `estados.ts` | `categoriaEstado`, `COLOR_ESTADO`, `estadoLegible`, `claveTexto` | compartido |
| `base.css` | Variables `--vc-*` y piezas comunes (`.vc-sr`, `.vc-num`, chip de estado, copiar) | compartido |
| `iconos.tsx`, `Copiar.tsx`, `ChipEstado.tsx` | Piezas comunes | compartido |
| `ejemplo-fichas.ts` | Fichas ficticias con la forma real, para pruebas: una persona con tres beneficios y eventos, otra con uno, y `fichaEjemploLarga()` (49 periodos) | compartido |
| `Buscador.tsx` + `buscador.css` | Búsqueda, recientes, carga y «sin resultados» (prefijo `vcb-`) | buscador |
| `ResumenPersona.tsx` + `persona.css` | Quién es e índice de beneficios (`vcp-`) | persona |
| `FichaBeneficio.tsx` + `ficha.css` | Un beneficio: cabecera, lo esencial y sus datos (`vcf-`) | ficha |
| `HistorialPeriodos.tsx` + `historial.css` | El recorrido por periodo y su tabla (`vch-`) | historial |
| `EventosPersona.tsx` + `eventos.css` | Línea de tiempo de eventos (`vce-`) | eventos |

## Reglas

- **Datos personales.** Nada se guarda en el navegador (ni `localStorage` ni `sessionStorage` ni la URL) y nada se manda a otro servicio. Las consultas recientes viven en memoria.
- **Estilos.** Todo selector empieza por `:where(.tablero-fondos)` y usa el prefijo de su pieza. La plantilla de Sapiencia (Bootstrap) da estilos por defecto a `table`, `button`, `h2`, `dl`, `input`: cada pieza fija los suyos de forma explícita.
- **Sin dependencias nuevas.** React y CSS; los gráficos del recorrido son HTML y CSS (o SVG en línea), no ECharts.
- **La ficha es genérica.** Las columnas y etiquetas cambian por programa (ver `etl_consulta.py`): se buscan por nombre con `indiceColumna` y `campo`, nunca por posición fija, y lo que falte se omite.
- **Contratos.** Las props de cada pieza (interfaces `Props…`) y los `id` raíz no cambian sin tocar `VentanillaFondos.tsx`.

## Pruebas

- `ficha.test.ts`: la lectura de la ficha, los estados y los textos para leer.
- `Buscador.test.tsx`, `ResumenPersona.test.tsx`, `FichaBeneficio.test.tsx`, `HistorialPeriodos.test.tsx`, `EventosPersona.test.tsx`: el comportamiento de cada pieza con las fichas ficticias.
- `../../TablerosSitio.test.tsx`: la pantalla completa (ingreso, consulta, cambio entre tablero y ventanilla).
- `fichas-reales.test.tsx`: OPCIONAL, para después de cada carga de datos. Con `VITE_FICHAS_CSV=/ruta/privada/fichas.csv` (el CSV de `etl_consulta.py`, fuera del repositorio) pasa todas las fichas reales por la lectura, pinta una muestra amplia y pulsa cada parada de los historiales más largos. Solo imprime conteos. Sin la variable, se salta.

## Notas de montaje

- La plantilla pone `overflow: auto` en `<main>`, y con eso la barra del buscador no podría quedar pegada (`position: sticky`). `base.css` lo anula solo mientras la ventanilla es la vista visible (`main:has(> div:not([hidden]) > .vc)`).
- Los destinos de salto (el resultado, cada ficha, los eventos) llevan `tabindex="-1"` y reciben el foco por programa; no muestran el aro de foco del teclado.
- La fecha de corte (`CORTE_DATOS`) está escrita en `ficha.ts`: hay que actualizarla con cada carga nueva de fichas.
