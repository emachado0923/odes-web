# Matrícula en educación superior en Medellín (2000-2025)

Datos del tablero `/tableros/matricula-historica` (`apps/web/src/sites/tableros/historica`).

## De dónde salen

La matrícula del SNIES (Ministerio de Educación Nacional) en los archivos `RET_MAT_MEN_<año>.xlsx`
(2014 a 2025) y `RET_MAT_MEN_2000_2013.xlsx`: una fila por programa, municipio, sexo y semestre.
Los archivos no van en el repositorio (pesan unos 180 MB); el ETL los lee de una carpeta o del
`.zip` en que llegan.

## Cómo se regenera

Necesita Python 3.9 o posterior con `pandas` y `openpyxl`.

```bash
python3 apps/web/datos-tableros/matricula-historica/etl_matricula_historica.py ~/Downloads/RET_MAT_MEN.zip
```

Escribe `apps/web/public/tableros/matricula-historica/datos/matricula.json` (≈ 1,3 MB), que el
sitio sirve tal cual: no pasa por la base. Tarda unos 4 minutos (casi todo es leer los Excel) e
imprime la matrícula de Medellín, Antioquia y Colombia de cada año para revisarla. Para un año
nuevo, agregue su archivo `RET_MAT_MEN_<año>.xlsx` y vuelva a correrlo.

## Reglas

- **Dato anual:** la suma de `MAT` en las filas con `MAT_OFICIAL = "Si"`. En los datos del MEN
  esa marca va en el primer semestre de todas las instituciones, salvo el SENA (`COD_IES` 9110),
  que reporta su matrícula anual en el segundo semestre.
- **Medellín:** los programas ofrecidos en el municipio (`COD_MPIO_PROG` = 5001), con el detalle
  por programa, institución, nivel, modalidad, área, núcleo básico del conocimiento, sector y
  sexo. Antioquia (`COD_DPTO_PROG` = 5) y Colombia van como referencia: el total por año y el
  cruce nivel × sector × sexo × año, para comparar con los mismos filtros.
- **Categorías:** los nombres cambian entre años y traen errores de digitación. Se unifican con
  las tablas del comienzo del ETL (`NIVEL`, `MODALIDAD`, `NBC`, `AREA`, `SECTOR`, `SEXO`). Un
  valor de nivel, modalidad, sector o sexo que no esté en ellas detiene el ETL: hay que agregarlo a
  la tabla, no adivinarlo.
- **Instituciones y programas:** los nombres son los del tablero de matrícula 2025
  (`apps/server/datos/tableros/matricula-2025/matricula.js`) cuando el código está allá; si no, el
  del SNIES del último año, con mayúsculas y tildes corregidas. Los códigos de una misma
  institución (seccionales) van juntos.
- **Fuera del dato anual:** la matrícula de programas que un año solo reportaron el semestre que no
  es el oficial. No entra en las cifras; el tablero la menciona en sus notas
  (`meta.fueraDelDatoAnual`).
