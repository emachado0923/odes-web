# Tablero medida de pertinencia (página completa)

Es el tablero que abre el botón "Conoce más" del bloque de pertinencia. Está publicado en
https://sapiencia-web.vercel.app/tableros/medida-pertinencia/ y vive en un solo archivo:
`apps/web/public/tableros/medida-pertinencia/index.html`.

- **Un solo archivo**, en HTML, CSS y JavaScript, sin React, Babel, ECharts ni nada externo. La letra Rubik, los íconos (SVG de Material Symbols),
  los logos y los datos van adentro. Para moverlo basta con copiar ese archivo; también abre con doble clic.
- **Cabecera y pie:** los del tablero de matrícula en educación superior 2025 (`/tableros/matricula-2025`): azul con filete magenta,
  el logo del Observatorio y la pata de Sapiencia y la Alcaldía. Título: "Tablero medida de pertinencia".
- **Origen:** la versión completa del tablero React que entregó el área (`original/`, `LEEME-original.md`), convertida el 28 de octubre de 2026.
  Solo se conserva la vista completa (`data-modo="completo"`).

## Actualizar los datos

Los datos son los mismos del tablero incrustado (`/tableros/pertinencia`): el ETL y sus insumos (anexos de la
resolución y la base de programas del SNIES `261026Programas_OPE.xlsx`) están en `../pertinencia/`.

1. Correr el ETL: `python3 etl_pertinencia.py insumos <carpeta>/datos` dentro de `../pertinencia/` (ver su `LEEME.md`).
2. En `index.html`, reemplazar el contenido de los dos bloques `<script>` de datos (están marcados con comentarios
   `datos/definiciones.js` y `datos/pertinencia.js`) por el de los archivos nuevos, tal cual.
3. Correr la prueba: `npx vitest run pertinencia/tablero-medida.test.ts`.

Desde el 28 de octubre de 2026 la lista de programas trae los 32.073 registros de la base del SNIES (317 instituciones,
agrupadas por nombre). El subtítulo de cada programa lleva el código SNIES, la institución y «Virtual» o el domicilio, y
al final de la página va la nota `notaFinal` de las definiciones. Con una institución elegida la lista muestra todos sus
programas; sin institución muestra 300 a la vez (el buscador alcanza todos y busca cada palabra en el nombre y el
subtítulo, por ejemplo «derecho medellín»). La ficha del programa elegido muestra también el domicilio.
