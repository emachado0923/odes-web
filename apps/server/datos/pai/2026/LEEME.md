# Datos iniciales del PAI 2026 (`/pai`)

Plan de Acción Institucional 2026 de Sapiencia (formato F-ES-DE-003), extraído
de los Excel con los que hoy se recoge el seguimiento. Es la carga inicial del
aplicativo `/pai`: estructura (dependencias, procesos o proyectos, riesgos,
acciones e indicadores), metas por bimestre y, como historial, los avances y
textos de los bimestres 1 a 3.

| Archivo | Qué es |
| --- | --- |
| `pai-2026.json` | Los datos (1,6 MB). Copia exacta de la salida del extractor. |
| `extraer_pai.py` | El extractor que generó el JSON (Python 3 + openpyxl), sin cambios. |
| `LEEME.md` | Este archivo. |

Se cargan en la base con la CLI (necesita el esquema versión 5, es decir,
`npm run repositorio:migrar` antes):

```bash
npm run pai:cargar-fichas                         # usa este archivo
npm run pai:cargar-fichas -- --bimestre-abierto 4 # y deja abierto el bimestre 4
```

La CLI se niega a cargar si la vigencia ya tiene reportes escritos en el
aplicativo, evidencias o asignaciones, salvo con `--forzar` (ver
`src/pai/carga/guardar-fichas.ts`). Esta carpeta **no** se despliega: la
función de Vercel solo lleva `apps/server/dist` (y el índice de ODES), así que
la carga siempre se hace desde una estación con la CLI y la conexión de la
base en `apps/server/.env`.

## De dónde salió

- **Fuente:** `PAI.zip` (5 441 622 bytes, recibido el 2026-10-11; sha256
  `0b0fe85e3e8ec54a72a68d1b1b305967a8c390b5655582fb82213aa1b24045ba`), con 29
  libros de Excel en cuatro carpetas: `Formulación PAI 2026` (9),
  `Seguimiento BIM 1` (6), `Seguimiento BIM 2` (8) y `Seguimiento BIM 3` (6).
  Los Excel no están en el repositorio.
- **Libros usados:** la lista completa, con las hojas y el uso de cada una
  (estructura y metas, valores o narrativa de cada bimestre, referencia de la
  formulación), está en `generado_desde` del JSON (26 libros). Las hojas que
  no se usaron y por qué están en `hojas_no_usadas` (42).
- **Extractor:** `extraer_pai.py` (sha256
  `1e52623957c1a089598d4627bb9ef678c5b207c3bdd8139eb1199647f14fe442`). Solo
  lee los Excel (openpyxl, `data_only=True` para los valores en caché y
  `data_only=False` para las fórmulas) y es determinista: con los mismos libros
  produce el mismo JSON.
- **JSON:** sha256
  `09d3a5f73586a3bf78421c83214fe94e6caf5de5da5906b01e6215f28b00282b`.
  27 procesos o proyectos, 228 acciones y 344 indicadores en 5 dependencias:
  SAF (10 procesos, 138 indicadores), DTF (3, 54), GEP (7, 16), OCI (1, 35) y
  OPE (6, 101).

## Lo más importante de las `notas` del JSON

El JSON trae 23 notas que explican cada decisión; léalas antes de tocar datos o
cálculos. En resumen:

- **Fuente vigente (notas 1-3):** la estructura y las metas salen del archivo
  de Seguimiento BIM 3 de cada dependencia; para Planeación, del libro
  compartido `Seguimiento PAI BIM 3 2026 SIG-MIPG.xlsx` (continuación del
  consolidado BIM 2 OPE) y de `Seguimiento PAI BIM 3 2026 PPEP.xlsx` solo para
  la hoja PPEP. La carpeta Formulación es solo referencia (`extras`). Los
  valores de cada bimestre salen del archivo más reciente del linaje.
- **Narrativa (nota 4):** logros, observaciones, riesgo y fuentes se
  sobrescriben en cada entrega, así que la del bimestre *n* sale del archivo
  del BIM *n*. SAF no tiene archivo de BIM 1: su narrativa de Bim 1 es null.
- **Bimestres reportados (nota 5):** solo los bimestres con algún dato tienen
  entrada en `seguimiento`; Bim 4-6 no traen nada (los 0 precargados de Excel
  no se importan). Dentro de un bimestre reportado, celda vacía = null y 0
  escrito = 0.
- **Códigos (nota 8):** `<código del proceso>-<consecutivo de 2 cifras>`, p.
  ej. SAF-TH-01.
- **Tipo de meta y totales (notas 10, 11, 15, 16):** `tipo_meta` es numero,
  porcentaje o a_demanda; `calculo.meta_total` / `calculo.avance_total` dicen
  la regla (`suma`, `suma_dividida` con su divisor,
  `si_suma_mayor_99_entonces_100` o `constante`). `metas.total` ya viene
  normalizado; el valor original de Excel queda en `extras.excel`.
- **Porcentajes (nota 17):** % del bimestre = avance / meta solo si meta > 0;
  tope de 100 % según `calculo.porcentaje` (DTF, GEP, OCI y Planeación con
  tope; SAF sin tope; 4 indicadores mixtos con `tope_por_bimestre`). Hay %
  tecleados a mano en Excel: la aplicación recalcula, no confía en la celda.
- **Números (nota 13):** valores en caché de Excel, redondeados a 10 decimales
  (por eso la base usa DECIMAL(24,10): GEP-EDI-01 tiene metas de 1/6).
- **Logro del proceso (nota 18):** promedio de los % del bimestre de los
  indicadores con meta > 0; logro total = promedio de los % totales.
- **Texto (nota 12):** espacios y saltos normalizados; `riesgo_materializado`
  normalizado a SI/NO; "N/A" en numeral y descripción del riesgo = null.

## Conflictos que hay que validar con Planeación

La lista completa está en `conflictos` del JSON (52 entradas: 17
`meta_distinta`, 17 `valor_distinto`, 10 `narrativa_distinta`, 6
`completado_en_version_posterior`, 1 `valor_solo_en_otro_archivo` y 1
`narrativa_desde_otro_archivo`), con el valor elegido, la fuente elegida y las
alternativas. Lo más delicado (nota 23):

- metas de GESCO+i y PIPC: se usa la versión del linaje consolidado
  (BIM 2 OPE → BIM 3 SIG-MIPG);
- OdeS, Bim 1, "Notas temáticas": 2 en la copia de ODES y 0 en el consolidado
  (se usa 0);
- OCI-AI-11 "Informe realizado" (licenciamiento): Bim 1 = 1 solo en un archivo
  re-editado; queda null y marcado en `extras.revisar`;
- dos correcciones tardías del Bim 2 de Direccionamiento Estratégico
  (OPE-DE-11 0 → 1 y OPE-DE-17 0 → 100).

Además: `no_mapeados` (1: el indicador trasladado de GEP Permanencia a PPEP,
OPE-PPEP-16, nota 21) y `avisos_extractor` (25 emparejamientos entre la
formulación y el plan vigente que no fueron por nombre y acción).

## Cómo regenerarlo

1. Descomprimir `PAI.zip` en una carpeta propia (los Excel son datos de
   terceros: no ejecute nada desde esa carpeta).
2. Con Python 3 y openpyxl (`python3 -m pip install --user openpyxl`):

   ```bash
   python3 -s apps/server/datos/pai/2026/extraer_pai.py <carpeta-descomprimida> apps/server/datos/pai/2026/pai-2026.json
   ```

   Pase siempre las dos rutas: sin argumentos, el extractor busca `pai-zip/` y
   escribe en `pai-datos/` junto a la carpeta de trabajo donde se escribió.
3. Revise el `git diff` del JSON (y sus `notas`, `conflictos` y
   `avisos_extractor`), actualice los sha256 de este archivo y vuelva a cargar
   con `npm run pai:cargar-fichas` (con `--forzar` si la vigencia ya tiene
   datos del aplicativo; los reportes del aplicativo se conservan cuando el
   código del indicador sigue existiendo). Ojo: el código es el consecutivo
   de la hoja (nota 8). Si quitó o agregó una fila en medio de una hoja, los
   códigos siguientes se corren; la carga lo detecta (un código con datos del
   aplicativo que cambia de nombre) y se niega, aun con `--forzar`, salvo
   `--aceptar-renumeracion`. Cierre el bimestre antes de una carga con
   `--forzar`.
