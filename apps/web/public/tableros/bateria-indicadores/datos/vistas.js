/* Estructura de navegación y definición de las vistas. Generado por etl/generar_vistas.py a partir de etl/vistas_*.py. */
window.ODES=window.ODES||{};window.ODES.vistas={
"version": "20261011",
"universos": [
{
"id": "ep",
"rotulo": "Educación postsecundaria",
"icono": "school",
"familia": "secondary",
"descripcion": "Indicadores generales de la educación superior y de la educación para el trabajo: oferta, demanda y matrícula, deserción, investigación y egresados.",
"temas": [
{
"id": "oferta",
"rotulo": "Oferta",
"icono": "storefront",
"vistas": [
{
"id": "ep-ies",
"titulo": "Instituciones que ofertan educación superior",
"rotulo": "IES que ofertan educación superior",
"fuente": "SNIES · corte 2023",
"descripcion": "Instituciones de educación superior registradas en el SNIES, por sector, carácter académico, estado y municipio de domicilio.",
"selector": "Ámbito territorial",
"icono": "account_balance",
"palabras": "universidades instituciones oferta",
"variantes": [
{
"id": "nacional",
"rotulo": "Colombia",
"sub": "Nacional",
"filtros": [
{
"col": "Municipio",
"rotulo": "Municipio de domicilio",
"modo": null
}
],
"kpis": [
{
"rotulo": "Instituciones de educación superior",
"formato": "num",
"agg": "count"
},
{
"rotulo": "IES acreditadas",
"formato": "num",
"pie": "Acreditación institucional de alta calidad",
"col": "ACREDITADA_ALTA_CALIDAD",
"agg": "sum",
"flag": true
},
{
"rotulo": "Programas vigentes",
"formato": "num",
"pie": "Suma de programas vigentes",
"col": "PROGRAMAS_VIGENTES",
"agg": "sum"
},
{
"rotulo": "Municipios",
"col": "Municipio",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Instituciones de educación superior",
"medida": {
"col": "PROGRAMAS_VIGENTES",
"agg": "sum",
"rotulo": "Programas vigentes",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"IES",
"Sector",
"Carácter IES",
"Municipio"
],
"alto": 420
},
{
"tipo": "arbol",
"titulo": "IES por sector",
"dim": "Sector",
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "IES por carácter académico",
"dim": "Carácter IES",
"ancho": "media",
"rotuloTotal": "IES"
},
{
"tipo": "barrasV",
"titulo": "IES por estado",
"dim": "ESTADO",
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "ep-ies__nacional"
},
{
"id": "regional",
"rotulo": "Antioquia",
"sub": "Departamental",
"filtros": [
{
"col": "Municipio",
"rotulo": "Municipio de domicilio",
"modo": null
}
],
"kpis": [
{
"rotulo": "Instituciones de educación superior",
"formato": "num",
"agg": "count"
},
{
"rotulo": "IES acreditadas",
"formato": "num",
"pie": "Acreditación institucional de alta calidad",
"col": "ACREDITADA_ALTA_CALIDAD",
"agg": "sum",
"flag": true
},
{
"rotulo": "Programas vigentes",
"formato": "num",
"pie": "Suma de programas vigentes",
"col": "PROGRAMAS_VIGENTES",
"agg": "sum"
},
{
"rotulo": "Municipios",
"col": "Municipio",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Instituciones de educación superior",
"medida": {
"col": "PROGRAMAS_VIGENTES",
"agg": "sum",
"rotulo": "Programas vigentes",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"IES",
"Sector",
"Carácter IES",
"Municipio"
],
"alto": 420
},
{
"tipo": "arbol",
"titulo": "IES por sector",
"dim": "Sector",
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "IES por carácter académico",
"dim": "Carácter IES",
"ancho": "media",
"rotuloTotal": "IES"
},
{
"tipo": "barrasV",
"titulo": "IES por estado",
"dim": "ESTADO",
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "ep-ies__regional"
},
{
"id": "local",
"rotulo": "Medellín",
"sub": "Local",
"filtros": [],
"kpis": [
{
"rotulo": "Instituciones de educación superior",
"formato": "num",
"agg": "count"
},
{
"rotulo": "IES acreditadas",
"formato": "num",
"pie": "Acreditación institucional de alta calidad",
"col": "ACREDITADA_ALTA_CALIDAD",
"agg": "sum",
"flag": true
},
{
"rotulo": "Programas vigentes",
"formato": "num",
"pie": "Suma de programas vigentes",
"col": "PROGRAMAS_VIGENTES",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Sectores",
"col": "Sector",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Instituciones de educación superior",
"medida": {
"col": "PROGRAMAS_VIGENTES",
"agg": "sum",
"rotulo": "Programas vigentes",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"IES",
"Sector",
"Carácter IES",
"Municipio"
],
"alto": 420
},
{
"tipo": "arbol",
"titulo": "IES por sector",
"dim": "Sector",
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "IES por carácter académico",
"dim": "Carácter IES",
"ancho": "media",
"rotuloTotal": "IES"
},
{
"tipo": "barrasV",
"titulo": "IES por estado",
"dim": "ESTADO",
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "ep-ies__local"
}
]
},
{
"id": "ep-entidades-etdh",
"titulo": "Entidades educativas que ofertan ETDH",
"rotulo": "Entidades educativas ETDH",
"fuente": "SIET · corte 2023",
"descripcion": "Instituciones de educación para el trabajo y el desarrollo humano en Medellín, por naturaleza y certificación de calidad.",
"selector": null,
"icono": "domain",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [],
"kpis": [
{
"rotulo": "Entidades ETDH",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Programas ofertados",
"formato": "num",
"col": "Cantidad de programas",
"agg": "sum"
},
{
"rotulo": "Entidades certificadas en calidad",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "¿Certificada en calidad? (marcados)",
"agg": "sum",
"flag": true
},
{
"rotulo": "Instituciones",
"col": "Institución",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Naturaleza",
"col": "Naturaleza",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Entidades ETDH",
"medida": {
"col": "Cantidad de programas",
"agg": "sum",
"rotulo": "Programas",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Institución",
"Naturaleza"
],
"alto": 420
},
{
"tipo": "anillo",
"titulo": "Entidades por naturaleza",
"dim": "Naturaleza",
"ancho": "media",
"rotuloTotal": "entidades"
},
{
"tipo": "arbol",
"titulo": "Entidades certificadas en calidad",
"dim": "¿Certificada en calidad?",
"ancho": "media"
},
{
"tipo": "barrasH",
"titulo": "Programas por entidad",
"dim": "Institución",
"medida": {
"col": "Cantidad de programas",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"limite": 60
}
],
"notas": [],
"fuente": null,
"datos": "ep-entidades-etdh__unica"
}
]
},
{
"id": "ep-programas-es",
"titulo": "Programas académicos en educación superior",
"rotulo": "Programas académicos en la educación superior",
"fuente": "SNIES · corte 2022, descargado en 2023",
"descripcion": "Programas registrados en el SNIES por nivel, metodología, sector y acreditación, con la lista completa por institución.",
"selector": "Ámbito territorial",
"icono": "menu_book",
"palabras": "oferta registro calificado acreditación",
"variantes": [
{
"id": "nacional",
"rotulo": "Colombia",
"sub": "Nacional",
"filtros": [
{
"col": "Área de Conocimiento",
"rotulo": "Área de Conocimiento",
"modo": null
},
{
"col": "ESTADO_PROGRAMA",
"rotulo": "Estado del programa",
"modo": null
},
{
"col": "RECONOCIMIENTO_DEL_MINISTERIO",
"rotulo": "Acreditación",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
}
],
"kpis": [
{
"rotulo": "Programas académicos",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Instituciones",
"formato": "num",
"pie": "Con programas registrados",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Programas acreditados",
"formato": "num",
"pie": "Acreditación de alta calidad",
"col": "Acreditado",
"agg": "sum",
"flag": true
},
{
"rotulo": "Áreas de conocimiento",
"col": "Área de Conocimiento",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "ESTADO_PROGRAMA",
"col": "ESTADO_PROGRAMA",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Programas académicos",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"IES"
],
"alto": 420
},
{
"tipo": "barrasV",
"titulo": "Programas por nivel de formación",
"dim": "Nivel de Formación",
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Programas por metodología",
"dim": "Metodología",
"ancho": "tercio",
"rotuloTotal": "programas"
},
{
"tipo": "arbol",
"titulo": "Programas por sector de la IES",
"dim": "Sector",
"ancho": "tercio"
},
{
"tipo": "embudo",
"titulo": "Programas por nivel académico",
"dim": "Nivel Académico",
"ancho": "tercio"
}
],
"notas": [],
"fuente": null,
"datos": "ep-programas-es__nacional"
},
{
"id": "regional",
"rotulo": "Antioquia",
"sub": "Departamental",
"filtros": [
{
"col": "Área de Conocimiento",
"rotulo": "Área de Conocimiento",
"modo": null
},
{
"col": "ESTADO_PROGRAMA",
"rotulo": "Estado del programa",
"modo": null
},
{
"col": "RECONOCIMIENTO_DEL_MINISTERIO",
"rotulo": "Acreditación",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
}
],
"kpis": [
{
"rotulo": "Programas académicos",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Instituciones",
"formato": "num",
"pie": "Con programas registrados",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Programas acreditados",
"formato": "num",
"pie": "Acreditación de alta calidad",
"col": "Acreditado",
"agg": "sum",
"flag": true
},
{
"rotulo": "Áreas de conocimiento",
"col": "Área de Conocimiento",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "ESTADO_PROGRAMA",
"col": "ESTADO_PROGRAMA",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Programas académicos",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"IES"
],
"alto": 420
},
{
"tipo": "barrasV",
"titulo": "Programas por nivel de formación",
"dim": "Nivel de Formación",
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Programas por metodología",
"dim": "Metodología",
"ancho": "tercio",
"rotuloTotal": "programas"
},
{
"tipo": "arbol",
"titulo": "Programas por sector de la IES",
"dim": "Sector",
"ancho": "tercio"
},
{
"tipo": "embudo",
"titulo": "Programas por nivel académico",
"dim": "Nivel Académico",
"ancho": "tercio"
}
],
"notas": [],
"fuente": null,
"datos": "ep-programas-es__regional"
},
{
"id": "local",
"rotulo": "Medellín",
"sub": "Local",
"filtros": [
{
"col": "Área de Conocimiento",
"rotulo": "Área de Conocimiento",
"modo": null
},
{
"col": "ESTADO_PROGRAMA",
"rotulo": "Estado del programa",
"modo": null
},
{
"col": "RECONOCIMIENTO_DEL_MINISTERIO",
"rotulo": "Acreditación",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
}
],
"kpis": [
{
"rotulo": "Programas académicos",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Instituciones",
"formato": "num",
"pie": "Con programas registrados",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Programas acreditados",
"formato": "num",
"pie": "Acreditación de alta calidad",
"col": "Acreditado",
"agg": "sum",
"flag": true
},
{
"rotulo": "Áreas de conocimiento",
"col": "Área de Conocimiento",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "ESTADO_PROGRAMA",
"col": "ESTADO_PROGRAMA",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Programas académicos",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"IES"
],
"alto": 420
},
{
"tipo": "barrasV",
"titulo": "Programas por nivel de formación",
"dim": "Nivel de Formación",
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Programas por metodología",
"dim": "Metodología",
"ancho": "tercio",
"rotuloTotal": "programas"
},
{
"tipo": "barrasV",
"titulo": "Programas por acreditación",
"dim": "RECONOCIMIENTO_DEL_MINISTERIO",
"ancho": "tercio"
},
{
"tipo": "embudo",
"titulo": "Programas por nivel académico",
"dim": "Nivel Académico",
"ancho": "tercio"
},
{
"tipo": "anillo",
"titulo": "Programas por sector de la IES",
"dim": "Sector",
"ancho": "tercio",
"rotuloTotal": "programas"
}
],
"notas": [],
"fuente": null,
"datos": "ep-programas-es__local"
}
]
},
{
"id": "ep-programas-etdh",
"titulo": "Programas académicos de educación para el trabajo y el desarrollo humano (ETDH)",
"rotulo": "Programas académicos ETDH",
"fuente": "SIET · corte 2023",
"descripcion": "Programas de educación para el trabajo y el desarrollo humano registrados en el SIET para Medellín.",
"selector": null,
"icono": "work",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "¿Certificado en Calidad?",
"rotulo": "Certificado en calidad",
"modo": null
},
{
"col": "Institución",
"rotulo": "Institución educativa",
"modo": null
}
],
"kpis": [
{
"rotulo": "Programas ETDH",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "Institución",
"agg": "distinct"
},
{
"rotulo": "Programas certificados en calidad",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "¿Certificado en Calidad? (marcados)",
"agg": "sum",
"flag": true
},
{
"rotulo": "Programas",
"col": "Programa",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Tipo de Certificado",
"col": "Tipo de Certificado",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Programas académicos",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"Institución"
],
"alto": 420
},
{
"tipo": "anillo",
"titulo": "Programas por tipo de certificado",
"dim": "Tipo de Certificado",
"ancho": "media",
"rotuloTotal": "programas"
},
{
"tipo": "barrasV",
"titulo": "Programas por subtipo de certificado",
"dim": "Sub - Tipo de Certificado",
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Programas por área de desempeño",
"dim": "Área Desempeño",
"ancho": "media",
"corte": 16
},
{
"tipo": "anillo",
"titulo": "Máximo nivel de formación para ingresar al programa",
"dim": "Escolaridad",
"ancho": "media",
"rotuloTotal": "programas"
}
],
"notas": [],
"fuente": null,
"datos": "ep-programas-etdh__unica"
}
]
},
{
"id": "ep-programas-sena",
"titulo": "Programas académicos en el SENA",
"rotulo": "Programas académicos en el SENA",
"fuente": "SENA · corte 2020",
"descripcion": "Oferta de programas técnicos y tecnológicos del SENA en el área metropolitana, por sede, nivel, metodología y área.",
"selector": null,
"icono": "construction",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Sede SENA",
"rotulo": "Sede SENA",
"modo": null
},
{
"col": "Municipio Sede SENA",
"rotulo": "Municipio de la sede",
"modo": null
}
],
"kpis": [
{
"rotulo": "Programas académicos",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Sedes",
"formato": "num",
"pie": "Centros de formación",
"col": "Sede SENA",
"agg": "distinct"
},
{
"rotulo": "Municipio Sede SENA",
"col": "Municipio Sede SENA",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Programas",
"col": "Programa",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Niveles de formación",
"col": "Nivel de Formación",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Programas académicos",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"Nivel de Formación",
"Sede SENA"
],
"alto": 420
},
{
"tipo": "barrasH",
"titulo": "Programas por nivel de formación",
"dim": "Nivel de Formación",
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Programas por metodología",
"dim": "Metodología",
"ancho": "media",
"rotuloTotal": "programas"
},
{
"tipo": "barrasV",
"titulo": "Programas por área de conocimiento",
"dim": "Área de Conocimiento",
"ancho": "media",
"corte": 18
}
],
"notas": [],
"fuente": null,
"datos": "ep-programas-sena__unica"
}
]
},
{
"id": "ep-docentes",
"titulo": "Docentes en la educación superior",
"rotulo": "Docentes en la educación superior",
"fuente": "SNIES · corte 2022, descargado en 2023",
"descripcion": "Docentes reportados al SNIES por sexo, tipo de contrato, dedicación, sector y máximo nivel de formación.",
"selector": "Ámbito territorial",
"icono": "co_present",
"palabras": null,
"variantes": [
{
"id": "nacional",
"rotulo": "Colombia",
"sub": "Nacional",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Tiempo de dedicación del Docente",
"rotulo": "Tiempo de dedicación",
"modo": null
}
],
"kpis": [
{
"rotulo": "Docentes",
"formato": "num",
"pie": "Registros docentes en la selección",
"col": "No. de Docentes",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Tiempo de dedicación del Docente",
"col": "Tiempo de dedicación del Docente",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "anillo",
"titulo": "Docentes por sexo",
"dim": "Sexo",
"medida": {
"col": "No. de Docentes",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"rotuloTotal": "docentes"
},
{
"tipo": "anillo",
"titulo": "Docentes por tipo de contrato",
"dim": "Tipo de contrato del Docente",
"medida": {
"col": "No. de Docentes",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"rotuloTotal": "docentes"
},
{
"tipo": "barrasH",
"titulo": "Docentes por sector de la IES",
"dim": "Sector",
"medida": {
"col": "No. de Docentes",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio"
},
{
"tipo": "barrasV",
"titulo": "Docentes por máximo nivel de formación",
"dim": "Máximo nivel de formación del docente",
"medida": {
"col": "No. de Docentes",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa"
}
],
"notas": [],
"fuente": null,
"datos": "ep-docentes__nacional"
},
{
"id": "regional",
"rotulo": "Antioquia",
"sub": "Departamental",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Tiempo de dedicación del Docente",
"rotulo": "Tiempo de dedicación",
"modo": null
}
],
"kpis": [
{
"rotulo": "Docentes",
"formato": "num",
"pie": "Registros docentes en la selección",
"col": "No. de Docentes",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Tiempo de dedicación del Docente",
"col": "Tiempo de dedicación del Docente",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "anillo",
"titulo": "Docentes por sexo",
"dim": "Sexo",
"medida": {
"col": "No. de Docentes",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"rotuloTotal": "docentes"
},
{
"tipo": "anillo",
"titulo": "Docentes por tipo de contrato",
"dim": "Tipo de contrato del Docente",
"medida": {
"col": "No. de Docentes",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"rotuloTotal": "docentes"
},
{
"tipo": "barrasH",
"titulo": "Docentes por sector de la IES",
"dim": "Sector",
"medida": {
"col": "No. de Docentes",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio"
},
{
"tipo": "barrasV",
"titulo": "Docentes por máximo nivel de formación",
"dim": "Máximo nivel de formación del docente",
"medida": {
"col": "No. de Docentes",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa"
}
],
"notas": [],
"fuente": null,
"datos": "ep-docentes__regional"
},
{
"id": "local",
"rotulo": "Medellín",
"sub": "Local",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Tiempo de dedicación del Docente",
"rotulo": "Tiempo de dedicación",
"modo": null
}
],
"kpis": [
{
"rotulo": "Docentes",
"formato": "num",
"pie": "Registros docentes en la selección",
"col": "No. de Docentes",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Tiempo de dedicación del Docente",
"col": "Tiempo de dedicación del Docente",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "anillo",
"titulo": "Docentes por sexo",
"dim": "Sexo",
"medida": {
"col": "No. de Docentes",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"rotuloTotal": "docentes"
},
{
"tipo": "anillo",
"titulo": "Docentes por tipo de contrato",
"dim": "Tipo de contrato del Docente",
"medida": {
"col": "No. de Docentes",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"rotuloTotal": "docentes"
},
{
"tipo": "barrasH",
"titulo": "Docentes por sector de la IES",
"dim": "Sector",
"medida": {
"col": "No. de Docentes",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio"
},
{
"tipo": "barrasV",
"titulo": "Docentes por máximo nivel de formación",
"dim": "Máximo nivel de formación del docente",
"medida": {
"col": "No. de Docentes",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa"
}
],
"notas": [],
"fuente": null,
"datos": "ep-docentes__local"
}
]
},
{
"id": "ep-personal-administrativo",
"titulo": "Personal administrativo en las IES",
"rotulo": "Personal administrativo en las IES",
"fuente": "SNIES · corte 2022, descargado en 2023",
"descripcion": "Personal administrativo (auxiliar, de servicios, profesional y directivo) reportado por las instituciones de educación superior.",
"selector": "Ámbito territorial",
"icono": "badge",
"palabras": null,
"variantes": [
{
"id": "nacional",
"rotulo": "Colombia",
"sub": "Nacional",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Sector",
"rotulo": "Sector",
"modo": null
}
],
"kpis": [
{
"rotulo": "Personal administrativo",
"formato": "num",
"col": "Total",
"agg": "sum"
},
{
"rotulo": "Profesionales",
"formato": "num",
"col": "Profesional",
"agg": "sum"
},
{
"rotulo": "Directivos",
"formato": "num",
"col": "Directivo",
"agg": "sum"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Personal administrativo por departamento",
"medidas": [
{
"col": "Profesional",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Directivo",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Servicios",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Auxiliar",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Total",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
}
],
"ancho": "media",
"dims": [
"Departamento"
],
"alto": 460
},
{
"tipo": "area",
"titulo": "Personal administrativo por año",
"dim": "Año",
"medidas": [
{
"col": "Directivo",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Profesional",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Servicios",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Auxiliar",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
}
],
"ancho": "media"
},
{
"tipo": "barrasH",
"titulo": "Personal administrativo por IES",
"dim": "IES",
"medida": {
"col": "Total",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "ep-personal-administrativo__nacional"
},
{
"id": "regional",
"rotulo": "Antioquia",
"sub": "Departamental",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Sector",
"rotulo": "Sector",
"modo": null
}
],
"kpis": [
{
"rotulo": "Personal administrativo",
"formato": "num",
"col": "Total",
"agg": "sum"
},
{
"rotulo": "Profesionales",
"formato": "num",
"col": "Profesional",
"agg": "sum"
},
{
"rotulo": "Directivos",
"formato": "num",
"col": "Directivo",
"agg": "sum"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Personal administrativo por municipio",
"medidas": [
{
"col": "Profesional",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Directivo",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Servicios",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Auxiliar",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Total",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
}
],
"ancho": "media",
"dims": [
"Municipio"
],
"alto": 460
},
{
"tipo": "area",
"titulo": "Personal administrativo por año",
"dim": "Año",
"medidas": [
{
"col": "Directivo",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Profesional",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Servicios",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Auxiliar",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
}
],
"ancho": "media"
},
{
"tipo": "barrasH",
"titulo": "Personal administrativo por IES",
"dim": "IES",
"medida": {
"col": "Total",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "ep-personal-administrativo__regional"
},
{
"id": "local",
"rotulo": "Medellín",
"sub": "Local",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Sector",
"rotulo": "Sector",
"modo": null
}
],
"kpis": [
{
"rotulo": "Personal administrativo",
"formato": "num",
"col": "Total",
"agg": "sum"
},
{
"rotulo": "Profesionales",
"formato": "num",
"col": "Profesional",
"agg": "sum"
},
{
"rotulo": "Directivos",
"formato": "num",
"col": "Directivo",
"agg": "sum"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Personal administrativo por IES",
"medidas": [
{
"col": "Profesional",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Directivo",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Servicios",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Auxiliar",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Total",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
}
],
"ancho": "media",
"dims": [
"IES"
],
"alto": 460
},
{
"tipo": "columnasApiladas",
"titulo": "Personal administrativo por año",
"dim": "Año",
"medidas": [
{
"col": "Directivo",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Profesional",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Servicios",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
{
"col": "Auxiliar",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
}
],
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Personal administrativo por carácter de la IES",
"dim": "Carácter IES",
"medida": {
"col": "Total",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "personas"
}
],
"notas": [],
"fuente": null,
"datos": "ep-personal-administrativo__local"
}
]
},
{
"id": "ep-acreditacion",
"titulo": "Acreditación de alta calidad en IES y programas académicos",
"rotulo": "Acreditación en IES y programas",
"fuente": "SNIES · corte 2023",
"descripcion": "Instituciones y programas académicos con acreditación de alta calidad según el SNIES.",
"selector": "Ver",
"icono": "verified",
"palabras": null,
"variantes": [
{
"id": "ies",
"rotulo": "Instituciones",
"sub": "Acreditación institucional",
"filtros": [
{
"col": "Departamento",
"rotulo": "Departamento",
"modo": null
},
{
"col": "Municipio",
"rotulo": "Municipio",
"modo": null
}
],
"kpis": [
{
"rotulo": "IES acreditadas en alta calidad",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Municipios con IES acreditadas",
"formato": "num",
"col": "Municipio",
"agg": "distinct"
},
{
"rotulo": "Departamentos",
"col": "Departamento",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Carácter IES",
"col": "Carácter IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Sectores",
"col": "Sector",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasH",
"titulo": "IES acreditadas por carácter académico",
"dim": "Carácter IES",
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "IES acreditadas por sector",
"dim": "Sector",
"ancho": "media",
"rotuloTotal": "IES"
},
{
"tipo": "tabla",
"titulo": "Instituciones acreditadas",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"dims": [
"IES",
"Carácter IES",
"Sector",
"Departamento",
"Municipio"
],
"alto": 420
}
],
"notas": [],
"fuente": null,
"datos": "ep-acreditacion__ies"
},
{
"id": "programas",
"rotulo": "Programas",
"sub": "Acreditación de programas",
"filtros": [
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Departamento",
"rotulo": "Departamento",
"modo": null
},
{
"col": "Municipio",
"rotulo": "Municipio",
"modo": null
}
],
"kpis": [
{
"rotulo": "Programas acreditados en alta calidad",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Departamentos",
"col": "Departamento",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Municipios",
"col": "Municipio",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Áreas de conocimiento",
"col": "Área de Conocimiento",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasH",
"titulo": "Programas acreditados por área de conocimiento",
"dim": "Área de Conocimiento",
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Programas acreditados por metodología",
"dim": "Metodología",
"ancho": "media",
"rotuloTotal": "programas"
},
{
"tipo": "barrasH",
"titulo": "Programas acreditados por nivel de formación",
"dim": "Nivel de Formación",
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Programas acreditados por nivel académico",
"dim": "Nivel Académico",
"ancho": "media"
},
{
"tipo": "tabla",
"titulo": "Programas acreditados",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"dims": [
"Programa",
"IES",
"Nivel de Formación",
"Municipio"
],
"alto": 420
}
],
"notas": [],
"fuente": null,
"datos": "ep-acreditacion__programas"
}
]
}
]
},
{
"id": "demanda",
"rotulo": "Demanda y matrícula",
"icono": "groups",
"vistas": [
{
"id": "ep-inscritos",
"titulo": "Inscritos en educación superior",
"rotulo": "Inscritos en educación superior",
"fuente": "SNIES · corte 2022, descargado en 2023",
"descripcion": "Personas inscritas a programas de educación superior, por institución, nivel, metodología, sexo y sector.",
"selector": "Ámbito territorial",
"icono": "how_to_reg",
"palabras": null,
"variantes": [
{
"id": "nacional",
"rotulo": "Colombia",
"sub": "Nacional",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Nivel Académico",
"rotulo": "Nivel Académico",
"modo": null
}
],
"kpis": [
{
"rotulo": "Inscritos",
"formato": "num",
"pie": "Total en la selección",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Niveles de formación",
"formato": "num",
"col": "Nivel de Formación",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Inscritos por departamento de domicilio de la IES",
"dim": "Departamento",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"mapa": "departamentos",
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Inscritos por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Inscritos por metodología",
"dim": "Metodología",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Inscritos por sexo",
"dim": "Sexo",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "inscritos"
},
{
"tipo": "anillo",
"titulo": "Inscritos por sector de la IES",
"dim": "Sector",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "inscritos"
}
],
"notas": [],
"fuente": null,
"datos": "ep-inscritos__nacional"
},
{
"id": "regional",
"rotulo": "Antioquia",
"sub": "Departamental",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Nivel Académico",
"rotulo": "Nivel Académico",
"modo": null
}
],
"kpis": [
{
"rotulo": "Inscritos",
"formato": "num",
"pie": "Total en la selección",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Niveles de formación",
"formato": "num",
"col": "Nivel de Formación",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Inscritos por municipio de domicilio de la IES",
"dim": "Municipio",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"mapa": "municipiosAntioquia",
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Inscritos por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Inscritos por metodología",
"dim": "Metodología",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Inscritos por sexo",
"dim": "Sexo",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "inscritos"
},
{
"tipo": "anillo",
"titulo": "Inscritos por sector de la IES",
"dim": "Sector",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "inscritos"
}
],
"notas": [],
"fuente": null,
"datos": "ep-inscritos__regional"
},
{
"id": "local",
"rotulo": "Medellín",
"sub": "Local",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Nivel Académico",
"rotulo": "Nivel Académico",
"modo": null
}
],
"kpis": [
{
"rotulo": "Inscritos",
"formato": "num",
"pie": "Total en la selección",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Inscritos por programa académico",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": "Inscritos",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"IES"
],
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Inscritos por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Inscritos por metodología",
"dim": "Metodología",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Inscritos por sexo",
"dim": "Sexo",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "inscritos"
},
{
"tipo": "anillo",
"titulo": "Inscritos por sector de la IES",
"dim": "Sector",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "inscritos"
}
],
"notas": [],
"fuente": null,
"datos": "ep-inscritos__local"
}
]
},
{
"id": "ep-admitidos",
"titulo": "Admitidos en educación superior",
"rotulo": "Admitidos en educación superior",
"fuente": "SNIES · corte 2022, descargado en 2023",
"descripcion": "Personas admitidas a programas de educación superior, por institución, nivel, metodología, sexo y sector.",
"selector": "Ámbito territorial",
"icono": "task_alt",
"palabras": null,
"variantes": [
{
"id": "nacional",
"rotulo": "Colombia",
"sub": "Nacional",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Nivel Académico",
"rotulo": "Nivel Académico",
"modo": null
}
],
"kpis": [
{
"rotulo": "Admitidos",
"formato": "num",
"pie": "Total en la selección",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Niveles de formación",
"formato": "num",
"col": "Nivel de Formación",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Admitidos por departamento de domicilio de la IES",
"dim": "Departamento",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"mapa": "departamentos",
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Admitidos por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Admitidos por metodología",
"dim": "Metodología",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Admitidos por sexo",
"dim": "Sexo",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "admitidos"
},
{
"tipo": "anillo",
"titulo": "Admitidos por sector de la IES",
"dim": "Sector",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "admitidos"
}
],
"notas": [],
"fuente": null,
"datos": "ep-admitidos__nacional"
},
{
"id": "regional",
"rotulo": "Antioquia",
"sub": "Departamental",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Nivel Académico",
"rotulo": "Nivel Académico",
"modo": null
}
],
"kpis": [
{
"rotulo": "Admitidos",
"formato": "num",
"pie": "Total en la selección",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Niveles de formación",
"formato": "num",
"col": "Nivel de Formación",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Admitidos por municipio de domicilio de la IES",
"dim": "Municipio",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"mapa": "municipiosAntioquia",
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Admitidos por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Admitidos por metodología",
"dim": "Metodología",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Admitidos por sexo",
"dim": "Sexo",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "admitidos"
},
{
"tipo": "anillo",
"titulo": "Admitidos por sector de la IES",
"dim": "Sector",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "admitidos"
}
],
"notas": [],
"fuente": null,
"datos": "ep-admitidos__regional"
},
{
"id": "local",
"rotulo": "Medellín",
"sub": "Local",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Nivel Académico",
"rotulo": "Nivel Académico",
"modo": null
}
],
"kpis": [
{
"rotulo": "Admitidos",
"formato": "num",
"pie": "Total en la selección",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Admitidos por programa académico",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": "Admitidos",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"IES"
],
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Admitidos por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Admitidos por metodología",
"dim": "Metodología",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Admitidos por sexo",
"dim": "Sexo",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "admitidos"
},
{
"tipo": "anillo",
"titulo": "Admitidos por sector de la IES",
"dim": "Sector",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "admitidos"
}
],
"notas": [],
"fuente": null,
"datos": "ep-admitidos__local"
}
]
},
{
"id": "ep-matriculados-nuevos",
"titulo": "Estudiantes nuevos (matriculados en primer curso) en educación superior",
"rotulo": "Estudiantes nuevos en educación superior",
"fuente": "SNIES · corte 2022, descargado en 2023",
"descripcion": "Estudiantes matriculados por primera vez en un programa de educación superior.",
"selector": "Ámbito territorial",
"icono": "person_add",
"palabras": null,
"variantes": [
{
"id": "nacional",
"rotulo": "Colombia",
"sub": "Nacional",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Nivel Académico",
"rotulo": "Nivel Académico",
"modo": null
}
],
"kpis": [
{
"rotulo": "Matriculados nuevos",
"formato": "num",
"pie": "Total en la selección",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Niveles de formación",
"formato": "num",
"col": "Nivel de Formación",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Matriculados nuevos por departamento de domicilio de la IES",
"dim": "Departamento",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"mapa": "departamentos",
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Matriculados nuevos por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Matriculados nuevos por metodología",
"dim": "Metodología",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Matriculados nuevos por sexo",
"dim": "Sexo",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "estudiantes nuevos"
},
{
"tipo": "anillo",
"titulo": "Matriculados nuevos por sector de la IES",
"dim": "Sector",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "estudiantes nuevos"
}
],
"notas": [],
"fuente": null,
"datos": "ep-matriculados-nuevos__nacional"
},
{
"id": "regional",
"rotulo": "Antioquia",
"sub": "Departamental",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Nivel Académico",
"rotulo": "Nivel Académico",
"modo": null
}
],
"kpis": [
{
"rotulo": "Matriculados nuevos",
"formato": "num",
"pie": "Total en la selección",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Niveles de formación",
"formato": "num",
"col": "Nivel de Formación",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Matriculados nuevos por municipio de domicilio de la IES",
"dim": "Municipio",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"mapa": "municipiosAntioquia",
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Matriculados nuevos por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Matriculados nuevos por metodología",
"dim": "Metodología",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Matriculados nuevos por sexo",
"dim": "Sexo",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "estudiantes nuevos"
},
{
"tipo": "anillo",
"titulo": "Matriculados nuevos por sector de la IES",
"dim": "Sector",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "estudiantes nuevos"
}
],
"notas": [],
"fuente": null,
"datos": "ep-matriculados-nuevos__regional"
},
{
"id": "local",
"rotulo": "Medellín",
"sub": "Local",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Nivel Académico",
"rotulo": "Nivel Académico",
"modo": null
}
],
"kpis": [
{
"rotulo": "Matriculados nuevos",
"formato": "num",
"pie": "Total en la selección",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Matriculados nuevos por programa académico",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": "Matriculados nuevos",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"IES"
],
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Matriculados nuevos por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Matriculados nuevos por metodología",
"dim": "Metodología",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Matriculados nuevos por sexo",
"dim": "Sexo",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "estudiantes nuevos"
},
{
"tipo": "anillo",
"titulo": "Matriculados nuevos por sector de la IES",
"dim": "Sector",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "estudiantes nuevos"
}
],
"notas": [],
"fuente": null,
"datos": "ep-matriculados-nuevos__local"
}
]
},
{
"id": "ep-matriculados",
"titulo": "Matriculados en educación superior",
"rotulo": "Matriculados en educación superior",
"fuente": "SNIES · corte 2022, descargado en 2023",
"descripcion": "Matrícula total en programas de educación superior, por institución, nivel, metodología, sexo y sector.",
"selector": "Ámbito territorial",
"icono": "groups",
"palabras": null,
"variantes": [
{
"id": "nacional",
"rotulo": "Colombia",
"sub": "Nacional",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Nivel Académico",
"rotulo": "Nivel Académico",
"modo": null
}
],
"kpis": [
{
"rotulo": "Matriculados",
"formato": "num",
"pie": "Total en la selección",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Niveles de formación",
"formato": "num",
"col": "Nivel de Formación",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Matriculados por departamento de domicilio de la IES",
"dim": "Departamento",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"mapa": "departamentos",
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Matriculados por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Matriculados por metodología",
"dim": "Metodología",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Matriculados por sexo",
"dim": "Sexo",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "matriculados"
},
{
"tipo": "anillo",
"titulo": "Matriculados por sector de la IES",
"dim": "Sector",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "matriculados"
}
],
"notas": [],
"fuente": null,
"datos": "ep-matriculados__nacional"
},
{
"id": "regional",
"rotulo": "Antioquia",
"sub": "Departamental",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Nivel Académico",
"rotulo": "Nivel Académico",
"modo": null
}
],
"kpis": [
{
"rotulo": "Matriculados",
"formato": "num",
"pie": "Total en la selección",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Niveles de formación",
"formato": "num",
"col": "Nivel de Formación",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Matriculados por municipio de domicilio de la IES",
"dim": "Municipio",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"mapa": "municipiosAntioquia",
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Matriculados por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Matriculados por metodología",
"dim": "Metodología",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Matriculados por sexo",
"dim": "Sexo",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "matriculados"
},
{
"tipo": "anillo",
"titulo": "Matriculados por sector de la IES",
"dim": "Sector",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "matriculados"
}
],
"notas": [],
"fuente": null,
"datos": "ep-matriculados__regional"
},
{
"id": "local",
"rotulo": "Medellín",
"sub": "Local",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Nivel Académico",
"rotulo": "Nivel Académico",
"modo": null
}
],
"kpis": [
{
"rotulo": "Matriculados",
"formato": "num",
"pie": "Total en la selección",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Matriculados por programa académico",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": "Matriculados",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"IES"
],
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Matriculados por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Matriculados por metodología",
"dim": "Metodología",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Matriculados por sexo",
"dim": "Sexo",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "matriculados"
},
{
"tipo": "anillo",
"titulo": "Matriculados por sector de la IES",
"dim": "Sector",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "matriculados"
}
],
"notas": [],
"fuente": null,
"datos": "ep-matriculados__local"
}
]
},
{
"id": "ep-matriculados-sena",
"titulo": "Matriculados en el SENA",
"rotulo": "Matriculados en el SENA",
"fuente": "SENA · corte 2020",
"descripcion": "Matrícula en programas del SENA por centro de formación, programa, nivel, metodología y sexo.",
"selector": "Ámbito territorial",
"icono": "engineering",
"palabras": null,
"variantes": [
{
"id": "metropolitano",
"rotulo": "Área metropolitana",
"sub": "Metropolitano",
"filtros": [
{
"col": "Sede SENA",
"rotulo": "Sede SENA",
"modo": null
},
{
"col": "Programa",
"rotulo": "Programa",
"modo": null
},
{
"col": "Nivel de Formación",
"rotulo": "Nivel de Formación",
"modo": null
}
],
"kpis": [
{
"rotulo": "Matriculados",
"formato": "num",
"col": "valor",
"agg": "sum"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Centros de formación",
"formato": "num",
"col": "Sede SENA",
"agg": "distinct"
},
{
"rotulo": "Niveles de formación",
"col": "Nivel de Formación",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Metodologías",
"col": "Metodología",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasH",
"titulo": "Matriculados por programa",
"dim": "Programa",
"medida": {
"col": "valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Matriculados por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Matriculados por metodología",
"dim": "Metodología",
"medida": {
"col": "valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "matriculados"
},
{
"tipo": "anillo",
"titulo": "Matriculados por sexo",
"dim": "Sexo",
"medida": {
"col": "valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "matriculados"
},
{
"tipo": "tabla",
"titulo": "Matriculados por centro de formación",
"medida": {
"col": "valor",
"agg": "sum",
"rotulo": "Matriculados",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Sede SENA",
"Municipio Sede SENA"
],
"alto": 380
}
],
"notas": [],
"fuente": null,
"datos": "ep-matriculados-sena__metropolitano"
},
{
"id": "municipal",
"rotulo": "Medellín",
"sub": "Municipal",
"filtros": [
{
"col": "Sede SENA",
"rotulo": "Sede SENA",
"modo": null
},
{
"col": "Programa",
"rotulo": "Programa",
"modo": null
},
{
"col": "Nivel de Formación",
"rotulo": "Nivel de Formación",
"modo": null
}
],
"kpis": [
{
"rotulo": "Matriculados",
"formato": "num",
"col": "valor",
"agg": "sum"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Centros de formación",
"formato": "num",
"col": "Sede SENA",
"agg": "distinct"
},
{
"rotulo": "Niveles de formación",
"col": "Nivel de Formación",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Metodologías",
"col": "Metodología",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasH",
"titulo": "Matriculados por programa",
"dim": "Programa",
"medida": {
"col": "valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Matriculados por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Matriculados por metodología",
"dim": "Metodología",
"medida": {
"col": "valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "matriculados"
},
{
"tipo": "anillo",
"titulo": "Matriculados por sexo",
"dim": "Sexo",
"medida": {
"col": "valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "matriculados"
},
{
"tipo": "tabla",
"titulo": "Matriculados por centro de formación",
"medida": {
"col": "valor",
"agg": "sum",
"rotulo": "Matriculados",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Sede SENA",
"Municipio Sede SENA"
],
"alto": 380
}
],
"notas": [],
"fuente": null,
"datos": "ep-matriculados-sena__municipal"
}
]
},
{
"id": "ep-tasas-demanda",
"titulo": "Tasas de admitidos y de estudiantes nuevos en educación superior",
"rotulo": "Tasas de admitidos y de estudiantes nuevos",
"fuente": "SNIES · corte 2022, descargado en 2023",
"descripcion": "Relación entre inscritos, admitidos y estudiantes nuevos, por sexo y ámbito territorial.",
"selector": "Tasa",
"icono": "percent",
"palabras": null,
"variantes": [
{
"id": "admitidos",
"rotulo": "Tasa de admitidos",
"sub": "Admitidos / inscritos",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Tasa de admitidos nacional",
"formato": "pct",
"col": "Tasa de admitidos nacional",
"agg": "avg"
},
{
"rotulo": "Tasa de admitidos Antioquia",
"formato": "pct",
"col": "Tasa de admitidos regional",
"agg": "avg"
},
{
"rotulo": "Tasa de admitidos Medellín",
"formato": "pct",
"col": "Tasa de admitidos local",
"agg": "avg"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
}
],
"visuales": [
{
"tipo": "combo",
"titulo": "Tasa de hombres admitidos",
"dim": "Año",
"medidas": [
{
"col": "Tasa de hombres admitidos nacional",
"agg": "avg",
"rotulo": "Nacional",
"formato": null,
"color": null
},
{
"col": "Tasa de hombres admitidos regional",
"agg": "avg",
"rotulo": "Antioquia",
"formato": null,
"color": null
},
{
"col": "Tasa de hombres admitidos local",
"agg": "avg",
"rotulo": "Medellín",
"formato": null,
"color": null
}
],
"ancho": "media",
"formato": "pct",
"lineas": [
"Medellín"
]
},
{
"tipo": "combo",
"titulo": "Tasa de mujeres admitidas",
"dim": "Año",
"medidas": [
{
"col": "Tasa de mujeres admitidas nacional",
"agg": "avg",
"rotulo": "Nacional",
"formato": null,
"color": null
},
{
"col": "Tasa de mujeres admitidas regional",
"agg": "avg",
"rotulo": "Antioquia",
"formato": null,
"color": null
},
{
"col": "Tasa de mujeres admitidas local",
"agg": "avg",
"rotulo": "Medellín",
"formato": null,
"color": null
}
],
"ancho": "media",
"formato": "pct",
"lineas": [
"Medellín"
]
},
{
"tipo": "barrasV",
"titulo": "Tasa de admitidos en educación superior",
"dim": "Año",
"medidas": [
{
"col": "Tasa de admitidos nacional",
"agg": "avg",
"rotulo": "Nacional",
"formato": null,
"color": null
},
{
"col": "Tasa de admitidos regional",
"agg": "avg",
"rotulo": "Antioquia",
"formato": null,
"color": null
},
{
"col": "Tasa de admitidos local",
"agg": "avg",
"rotulo": "Medellín",
"formato": null,
"color": null
}
],
"ancho": "completa",
"formato": "pct"
}
],
"notas": [
"Tasa de admitidos = admitidos / inscritos en el año."
],
"fuente": null,
"datos": "ep-tasas-demanda__admitidos"
},
{
"id": "nuevos",
"rotulo": "Tasa de estudiantes nuevos",
"sub": "Estudiantes nuevos / inscritos",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Tasa nacional",
"formato": "pct",
"col": "Tasa de matriculados nuevos nacional",
"agg": "avg"
},
{
"rotulo": "Tasa Antioquia",
"formato": "pct",
"col": "Tasa de matriculados nuevos regional",
"agg": "avg"
},
{
"rotulo": "Tasa Medellín",
"formato": "pct",
"col": "Tasa de matriculados nuevos local",
"agg": "avg"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
}
],
"visuales": [
{
"tipo": "combo",
"titulo": "Tasa de hombres matriculados nuevos",
"dim": "Año",
"medidas": [
{
"col": "Tasa de hombres matriculados nuevos nacional",
"agg": "avg",
"rotulo": "Nacional",
"formato": null,
"color": null
},
{
"col": "Tasa de hombres matriculados nuevos regional",
"agg": "avg",
"rotulo": "Antioquia",
"formato": null,
"color": null
},
{
"col": "Tasa de hombres matriculados nuevos local",
"agg": "avg",
"rotulo": "Medellín",
"formato": null,
"color": null
}
],
"ancho": "media",
"formato": "pct",
"lineas": [
"Medellín"
]
},
{
"tipo": "combo",
"titulo": "Tasa de mujeres matriculadas nuevas",
"dim": "Año",
"medidas": [
{
"col": "Tasa de mujeres matriculadas nuevas nacional",
"agg": "avg",
"rotulo": "Nacional",
"formato": null,
"color": null
},
{
"col": "Tasa de mujeres matriculadas nuevas regional",
"agg": "avg",
"rotulo": "Antioquia",
"formato": null,
"color": null
},
{
"col": "Tasa de mujeres matriculadas nuevas local",
"agg": "avg",
"rotulo": "Medellín",
"formato": null,
"color": null
}
],
"ancho": "media",
"formato": "pct",
"lineas": [
"Medellín"
]
},
{
"tipo": "linea",
"titulo": "Tasa de matriculados nuevos en educación superior",
"dim": "Año",
"medidas": [
{
"col": "Tasa de matriculados nuevos nacional",
"agg": "avg",
"rotulo": "Nacional",
"formato": null,
"color": null
},
{
"col": "Tasa de matriculados nuevos regional",
"agg": "avg",
"rotulo": "Antioquia",
"formato": null,
"color": null
},
{
"col": "Tasa de matriculados nuevos local",
"agg": "avg",
"rotulo": "Medellín",
"formato": null,
"color": null
}
],
"ancho": "completa",
"formato": "pct"
}
],
"notas": [
"Tasa de matriculados nuevos = matriculados en primer curso / inscritos en el año."
],
"fuente": null,
"datos": "ep-tasas-demanda__nuevos"
}
]
},
{
"id": "ep-estudiantes-por-docente",
"titulo": "Estudiantes matriculados por docente en educación superior",
"rotulo": "Estudiantes matriculados por docente",
"fuente": "SNIES · corte 2022, descargado en 2023",
"descripcion": "Número promedio de estudiantes matriculados por cada docente, en los tres ámbitos.",
"selector": null,
"icono": "balance",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
}
],
"kpis": [
{
"rotulo": "Estudiantes por docente · Colombia",
"formato": "dec",
"col": "Número de alumnos por docentes a nivel nacional",
"agg": "avg"
},
{
"rotulo": "Estudiantes por docente · Antioquia",
"formato": "dec",
"col": "Número de alumnos por docentes a nivel regional",
"agg": "avg"
},
{
"rotulo": "Estudiantes por docente · Medellín",
"formato": "dec",
"col": "Número de alumnos por docentes a nivel local",
"agg": "avg"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "area",
"titulo": "Estudiantes por docente · nivel nacional",
"dim": "Año",
"medida": {
"col": "Número de alumnos por docentes a nivel nacional",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "dec"
},
{
"tipo": "area",
"titulo": "Estudiantes por docente · nivel departamental",
"dim": "Año",
"medida": {
"col": "Número de alumnos por docentes a nivel regional",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "dec"
},
{
"tipo": "area",
"titulo": "Estudiantes por docente · nivel local",
"dim": "Año",
"medida": {
"col": "Número de alumnos por docentes a nivel local",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "dec"
},
{
"tipo": "barrasV",
"titulo": "Proporción por semestre",
"dim": "Semestre",
"medidas": [
{
"col": "Número de alumnos por docentes a nivel nacional",
"agg": "avg",
"rotulo": "Nacional",
"formato": null,
"color": null
},
{
"col": "Número de alumnos por docentes a nivel regional",
"agg": "avg",
"rotulo": "Antioquia",
"formato": null,
"color": null
},
{
"col": "Número de alumnos por docentes a nivel local",
"agg": "avg",
"rotulo": "Medellín",
"formato": null,
"color": null
}
],
"ancho": "media",
"formato": "dec"
}
],
"notas": [],
"fuente": null,
"datos": "ep-estudiantes-por-docente__unica"
}
]
},
{
"id": "ep-matriculados-etdh",
"titulo": "Matriculados en entidades ETDH",
"rotulo": "Matriculados en ETDH",
"fuente": "SIET · corte 2023",
"descripcion": "Matrícula en programas de educación para el trabajo y el desarrollo humano en Medellín.",
"selector": null,
"icono": "school",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Institución",
"rotulo": "Institución educativa",
"modo": null
}
],
"kpis": [
{
"rotulo": "Matriculados",
"formato": "num",
"col": "Matriculados",
"agg": "sum"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "Institución",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Tipo Certificado",
"col": "Tipo Certificado",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "anillo",
"titulo": "Matriculados por tipo de certificación",
"dim": "Tipo Certificado",
"medida": {
"col": "Matriculados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"rotuloTotal": "matriculados"
},
{
"tipo": "barrasV",
"titulo": "Matriculados por área de desempeño",
"dim": "Area de Desempeño",
"medida": {
"col": "Matriculados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"corte": 16
},
{
"tipo": "tabla",
"titulo": "Matriculados por programa",
"medida": {
"col": "Matriculados",
"agg": "sum",
"rotulo": "Matriculados",
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Programa",
"Institución"
],
"alto": 380
},
{
"tipo": "linea",
"titulo": "Matriculados en entidades ETDH por año",
"dim": "Año",
"medida": {
"col": "Matriculados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"alto": 260
}
],
"notas": [],
"fuente": null,
"datos": "ep-matriculados-etdh__unica"
}
]
}
]
},
{
"id": "desercion",
"rotulo": "Deserción",
"icono": "trending_down",
"vistas": [
{
"id": "ep-desercion-periodo",
"titulo": "Deserción por período en la educación superior",
"rotulo": "Deserción por período en educación superior",
"fuente": "SPADIES · corte 2021-2, actualizado en marzo de 2023",
"descripcion": "Desertores y tasas de deserción y retención por período, con la comparación por sexo y sector de la IES.",
"selector": "Ámbito territorial",
"icono": "trending_down",
"palabras": null,
"variantes": [
{
"id": "nacional",
"rotulo": "Colombia",
"sub": "Nacional",
"filtros": [
{
"col": "Período",
"rotulo": "Período",
"modo": null
}
],
"kpis": [
{
"rotulo": "Desertores (suma de períodos)",
"formato": "num",
"col": "Desertores",
"agg": "sum"
},
{
"rotulo": "Tasa de deserción promedio",
"formato": "pct",
"col": "Tasa de deserción",
"agg": "avg"
},
{
"rotulo": "Tasa de retención promedio",
"formato": "pct",
"col": "Tasa de retención",
"agg": "avg"
},
{
"rotulo": "Períodos",
"col": "Período",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
}
],
"visuales": [
{
"tipo": "area",
"titulo": "Desertores por período",
"dim": "Período",
"medida": {
"col": "Desertores",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "area",
"titulo": "Tasa de deserción por período",
"dim": "Período",
"medida": {
"col": "Tasa de deserción",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
},
{
"tipo": "barrasV",
"titulo": "Tasas de deserción en IES no oficiales",
"dim": "Período",
"medidas": [
{
"col": "Tasa de deserción hombres en IES NO oficiales",
"agg": "avg",
"rotulo": "Hombres",
"formato": null,
"color": null
},
{
"col": "Tasa de deserción mujeres en IES NO oficiales",
"agg": "avg",
"rotulo": "Mujeres",
"formato": null,
"color": null
}
],
"ancho": "media",
"formato": "pct"
},
{
"tipo": "barrasV",
"titulo": "Tasas de deserción en IES oficiales",
"dim": "Período",
"medidas": [
{
"col": "Tasa de deserción hombres en IES oficiales",
"agg": "avg",
"rotulo": "Hombres",
"formato": null,
"color": null
},
{
"col": "Tasa de deserción mujeres en IES oficiales",
"agg": "avg",
"rotulo": "Mujeres",
"formato": null,
"color": null
}
],
"ancho": "media",
"formato": "pct"
}
],
"notas": [],
"fuente": null,
"datos": "ep-desercion-periodo__nacional"
},
{
"id": "regional",
"rotulo": "Antioquia",
"sub": "Departamental",
"filtros": [
{
"col": "Período",
"rotulo": "Período",
"modo": null
}
],
"kpis": [
{
"rotulo": "Desertores (suma de períodos)",
"formato": "num",
"col": "Desertores",
"agg": "sum"
},
{
"rotulo": "Tasa de deserción promedio",
"formato": "pct",
"col": "Tasa de deserción",
"agg": "avg"
},
{
"rotulo": "Tasa de retención promedio",
"formato": "pct",
"col": "Tasa de retención",
"agg": "avg"
},
{
"rotulo": "Períodos",
"col": "Período",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
}
],
"visuales": [
{
"tipo": "area",
"titulo": "Desertores por período",
"dim": "Período",
"medida": {
"col": "Desertores",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "area",
"titulo": "Tasa de deserción por período",
"dim": "Período",
"medida": {
"col": "Tasa de deserción",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
},
{
"tipo": "barrasV",
"titulo": "Tasas de deserción en IES no oficiales",
"dim": "Período",
"medidas": [
{
"col": "Tasa de deserción hombres en IES NO oficiales",
"agg": "avg",
"rotulo": "Hombres",
"formato": null,
"color": null
},
{
"col": "Tasa de deserción mujeres en IES NO oficiales",
"agg": "avg",
"rotulo": "Mujeres",
"formato": null,
"color": null
}
],
"ancho": "media",
"formato": "pct"
},
{
"tipo": "barrasV",
"titulo": "Tasas de deserción en IES oficiales",
"dim": "Período",
"medidas": [
{
"col": "Tasa de deserción hombres en IES oficiales",
"agg": "avg",
"rotulo": "Hombres",
"formato": null,
"color": null
},
{
"col": "Tasa de deserción mujeres en IES oficiales",
"agg": "avg",
"rotulo": "Mujeres",
"formato": null,
"color": null
}
],
"ancho": "media",
"formato": "pct"
}
],
"notas": [],
"fuente": null,
"datos": "ep-desercion-periodo__regional"
},
{
"id": "local",
"rotulo": "Medellín",
"sub": "Local",
"filtros": [
{
"col": "Período",
"rotulo": "Período",
"modo": null
}
],
"kpis": [
{
"rotulo": "Desertores (suma de períodos)",
"formato": "num",
"col": "Desertores",
"agg": "sum"
},
{
"rotulo": "Tasa de deserción promedio",
"formato": "pct",
"col": "Tasa de deserción",
"agg": "avg"
},
{
"rotulo": "Tasa de retención promedio",
"formato": "pct",
"col": "Tasa de retención",
"agg": "avg"
},
{
"rotulo": "Períodos",
"col": "Período",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
}
],
"visuales": [
{
"tipo": "area",
"titulo": "Desertores por período",
"dim": "Período",
"medida": {
"col": "Desertores",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "area",
"titulo": "Tasa de deserción por período",
"dim": "Período",
"medida": {
"col": "Tasa de deserción",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
},
{
"tipo": "barrasV",
"titulo": "Tasas de deserción en IES no oficiales",
"dim": "Período",
"medidas": [
{
"col": "Tasa de deserción hombres en IES NO oficiales",
"agg": "avg",
"rotulo": "Hombres",
"formato": null,
"color": null
},
{
"col": "Tasa de deserción mujeres en IES NO oficiales",
"agg": "avg",
"rotulo": "Mujeres",
"formato": null,
"color": null
}
],
"ancho": "media",
"formato": "pct"
},
{
"tipo": "barrasV",
"titulo": "Tasas de deserción en IES oficiales",
"dim": "Período",
"medidas": [
{
"col": "Tasa de deserción hombres en IES oficiales",
"agg": "avg",
"rotulo": "Hombres",
"formato": null,
"color": null
},
{
"col": "Tasa de deserción mujeres en IES oficiales",
"agg": "avg",
"rotulo": "Mujeres",
"formato": null,
"color": null
}
],
"ancho": "media",
"formato": "pct"
}
],
"notas": [],
"fuente": null,
"datos": "ep-desercion-periodo__local"
}
]
},
{
"id": "ep-desercion-programa",
"titulo": "Deserción por programa académico en las IES de Medellín",
"rotulo": "Deserción por programa en Medellín",
"fuente": "SPADIES · corte 2021-2, actualizado en marzo de 2023",
"descripcion": "Tasa de deserción y retención por programa académico de las IES de Medellín, 2015 a 2020.",
"selector": null,
"icono": "school",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "NOMBRE",
"rotulo": "Programa",
"modo": null
},
{
"col": "TIPO",
"rotulo": "Indicador",
"modo": null
}
],
"kpis": [
{
"rotulo": "Programas",
"formato": "num",
"col": "NOMBRE",
"agg": "distinct"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Tasa promedio",
"formato": "pct",
"col": "Tasa",
"agg": "avg"
},
{
"rotulo": "TIPO",
"col": "TIPO",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Períodos",
"col": "Período",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "linea",
"titulo": "Tasa promedio por período",
"dim": "Período",
"medida": {
"col": "Tasa",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"formato": "pct",
"alto": 300
},
{
"tipo": "barrasH",
"titulo": "Tasa promedio por programa (período más reciente seleccionado)",
"dim": "NOMBRE",
"medida": {
"col": "Tasa",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct",
"alto": 460,
"conParte": false
},
{
"tipo": "tabla",
"titulo": "Tasa por programa y período",
"medida": {
"col": "Tasa",
"agg": "avg",
"rotulo": "Tasa",
"formato": "pct",
"color": null
},
"ancho": "media",
"dims": [
"NOMBRE",
"IES",
"TIPO",
"Período"
],
"alto": 460,
"sinTotal": true
}
],
"notas": [
"La matriz trae la tasa de deserción y la de retención en la misma hoja (columna «Indicador»); use el filtro para elegir una."
],
"fuente": null,
"datos": "ep-desercion-programa__unica"
}
]
},
{
"id": "ep-ausentes",
"titulo": "Estudiantes ausentes en educación superior",
"rotulo": "Estudiantes ausentes en educación superior",
"fuente": "SPADIES · corte 2021-2, actualizado en marzo de 2023",
"descripcion": "Estudiantes ausentes por período y tasas de ausentismo y retención.",
"selector": "Ámbito territorial",
"icono": "person_off",
"palabras": null,
"variantes": [
{
"id": "nacional",
"rotulo": "Colombia",
"sub": "Nacional",
"filtros": [
{
"col": "Período",
"rotulo": "Período",
"modo": null
}
],
"kpis": [
{
"rotulo": "Ausentes (suma de períodos)",
"formato": "num",
"col": "Ausentes",
"agg": "sum"
},
{
"rotulo": "Tasa de ausentismo promedio",
"formato": "pct",
"col": "Tasa de ausentismo",
"agg": "avg"
},
{
"rotulo": "Tasa de retención promedio",
"formato": "pct",
"col": "Tasa de retención",
"agg": "avg"
},
{
"rotulo": "Períodos",
"col": "Período",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
}
],
"visuales": [
{
"tipo": "area",
"titulo": "Ausentes por período",
"dim": "Período",
"medida": {
"col": "Ausentes",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"alto": 280
},
{
"tipo": "area",
"titulo": "Tasa de ausentismo por período",
"dim": "Período",
"medida": {
"col": "Tasa de ausentismo",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
},
{
"tipo": "barrasV",
"titulo": "Tasa de retención por período",
"dim": "Período",
"medida": {
"col": "Tasa de retención",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
}
],
"notas": [],
"fuente": null,
"datos": "ep-ausentes__nacional"
},
{
"id": "regional",
"rotulo": "Antioquia",
"sub": "Departamental",
"filtros": [
{
"col": "Período",
"rotulo": "Período",
"modo": null
}
],
"kpis": [
{
"rotulo": "Ausentes (suma de períodos)",
"formato": "num",
"col": "Ausentes",
"agg": "sum"
},
{
"rotulo": "Tasa de ausentismo promedio",
"formato": "pct",
"col": "Tasa de ausentismo",
"agg": "avg"
},
{
"rotulo": "Tasa de retención promedio",
"formato": "pct",
"col": "Tasa de retención",
"agg": "avg"
},
{
"rotulo": "Períodos",
"col": "Período",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
}
],
"visuales": [
{
"tipo": "area",
"titulo": "Ausentes por período",
"dim": "Período",
"medida": {
"col": "Ausentes",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"alto": 280
},
{
"tipo": "area",
"titulo": "Tasa de ausentismo por período",
"dim": "Período",
"medida": {
"col": "Tasa de ausentismo",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
},
{
"tipo": "barrasV",
"titulo": "Tasa de retención por período",
"dim": "Período",
"medida": {
"col": "Tasa de retención",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
}
],
"notas": [],
"fuente": null,
"datos": "ep-ausentes__regional"
},
{
"id": "local",
"rotulo": "Medellín",
"sub": "Local",
"filtros": [
{
"col": "Período",
"rotulo": "Período",
"modo": null
}
],
"kpis": [
{
"rotulo": "Ausentes (suma de períodos)",
"formato": "num",
"col": "Ausentes",
"agg": "sum"
},
{
"rotulo": "Tasa de ausentismo promedio",
"formato": "pct",
"col": "Tasa de ausentismo",
"agg": "avg"
},
{
"rotulo": "Tasa de retención promedio",
"formato": "pct",
"col": "Tasa de retención",
"agg": "avg"
},
{
"rotulo": "Períodos",
"col": "Período",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
}
],
"visuales": [
{
"tipo": "area",
"titulo": "Ausentes por período",
"dim": "Período",
"medida": {
"col": "Ausentes",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"alto": 280
},
{
"tipo": "area",
"titulo": "Tasa de ausentismo por período",
"dim": "Período",
"medida": {
"col": "Tasa de ausentismo",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
},
{
"tipo": "barrasV",
"titulo": "Tasa de retención por período",
"dim": "Período",
"medida": {
"col": "Tasa de retención",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
}
],
"notas": [],
"fuente": null,
"datos": "ep-ausentes__local"
}
]
},
{
"id": "ep-desercion-cohorte",
"titulo": "Deserción por cohorte en educación superior",
"rotulo": "Deserción por cohorte en educación superior",
"fuente": "SPADIES · corte 2021-2, actualizado en marzo de 2023",
"descripcion": "Porcentaje acumulado de desertores de cada cohorte de ingreso, semestre a semestre.",
"selector": "Ámbito territorial",
"icono": "stacked_line_chart",
"palabras": null,
"variantes": [
{
"id": "nacional",
"rotulo": "Colombia",
"sub": "Nacional",
"filtros": [
{
"col": "COHORTE",
"rotulo": "Cohorte",
"modo": null
}
],
"kpis": [
{
"rotulo": "Cohortes",
"formato": "num",
"col": "COHORTE",
"agg": "distinct"
},
{
"rotulo": "Deserción acumulada al semestre 10",
"formato": "pct",
"pie": "Promedio de las cohortes seleccionadas",
"col": "Tasa10",
"agg": "avg"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
},
{
"rotulo": "Visualizaciones",
"agg": "constante",
"valor": 2,
"formato": "num",
"pie": "En esta vista"
}
],
"visuales": [
{
"tipo": "linea",
"titulo": "Curva de deserción acumulada por semestre (promedio de las cohortes seleccionadas)",
"dim": "Semestre",
"medida": {
"col": "Tasa",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"formato": "pct",
"orden": "natural",
"alto": 320
},
{
"tipo": "tabla",
"titulo": "Deserción acumulada por cohorte y semestre",
"medida": {
"col": "Tasa",
"agg": "avg",
"rotulo": "Deserción acumulada",
"formato": "pct",
"color": null
},
"ancho": "completa",
"dims": [
"COHORTE",
"Semestre"
],
"alto": 480,
"sinTotal": true,
"ordenPor": "COHORTE"
}
],
"notas": [
"Cada fila es una cohorte (semestre de ingreso); la tasa es el porcentaje acumulado de desertores hasta cada semestre."
],
"fuente": null,
"datos": "ep-desercion-cohorte__nacional"
},
{
"id": "regional",
"rotulo": "Antioquia",
"sub": "Departamental",
"filtros": [
{
"col": "COHORTE",
"rotulo": "Cohorte",
"modo": null
}
],
"kpis": [
{
"rotulo": "Cohortes",
"formato": "num",
"col": "COHORTE",
"agg": "distinct"
},
{
"rotulo": "Deserción acumulada al semestre 10",
"formato": "pct",
"pie": "Promedio de las cohortes seleccionadas",
"col": "Tasa10",
"agg": "avg"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
},
{
"rotulo": "Visualizaciones",
"agg": "constante",
"valor": 2,
"formato": "num",
"pie": "En esta vista"
}
],
"visuales": [
{
"tipo": "linea",
"titulo": "Curva de deserción acumulada por semestre (promedio de las cohortes seleccionadas)",
"dim": "Semestre",
"medida": {
"col": "Tasa",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"formato": "pct",
"orden": "natural",
"alto": 320
},
{
"tipo": "tabla",
"titulo": "Deserción acumulada por cohorte y semestre",
"medida": {
"col": "Tasa",
"agg": "avg",
"rotulo": "Deserción acumulada",
"formato": "pct",
"color": null
},
"ancho": "completa",
"dims": [
"COHORTE",
"Semestre"
],
"alto": 480,
"sinTotal": true,
"ordenPor": "COHORTE"
}
],
"notas": [
"Cada fila es una cohorte (semestre de ingreso); la tasa es el porcentaje acumulado de desertores hasta cada semestre."
],
"fuente": null,
"datos": "ep-desercion-cohorte__regional"
},
{
"id": "local",
"rotulo": "Medellín",
"sub": "Local",
"filtros": [
{
"col": "COHORTE",
"rotulo": "Cohorte",
"modo": null
}
],
"kpis": [
{
"rotulo": "Cohortes",
"formato": "num",
"col": "COHORTE",
"agg": "distinct"
},
{
"rotulo": "Deserción acumulada al semestre 10",
"formato": "pct",
"pie": "Promedio de las cohortes seleccionadas",
"col": "Tasa10",
"agg": "avg"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
},
{
"rotulo": "Visualizaciones",
"agg": "constante",
"valor": 2,
"formato": "num",
"pie": "En esta vista"
}
],
"visuales": [
{
"tipo": "linea",
"titulo": "Curva de deserción acumulada por semestre (promedio de las cohortes seleccionadas)",
"dim": "Semestre",
"medida": {
"col": "Tasa",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"formato": "pct",
"orden": "natural",
"alto": 320
},
{
"tipo": "tabla",
"titulo": "Deserción acumulada por cohorte y semestre",
"medida": {
"col": "Tasa",
"agg": "avg",
"rotulo": "Deserción acumulada",
"formato": "pct",
"color": null
},
"ancho": "completa",
"dims": [
"COHORTE",
"Semestre"
],
"alto": 480,
"sinTotal": true,
"ordenPor": "COHORTE"
}
],
"notas": [
"Cada fila es una cohorte (semestre de ingreso); la tasa es el porcentaje acumulado de desertores hasta cada semestre."
],
"fuente": null,
"datos": "ep-desercion-cohorte__local"
}
]
},
{
"id": "ep-desercion-sena",
"titulo": "Deserción por período en el SENA",
"rotulo": "Deserción por período en el SENA",
"fuente": "SENA · corte 2020",
"descripcion": "Desertores y matriculados del SENA por programa, nivel, área, metodología y centro de formación.",
"selector": null,
"icono": "construction",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Nivel de Formación",
"rotulo": "Nivel de Formación",
"modo": null
},
{
"col": "Programa",
"rotulo": "Programa",
"modo": null
},
{
"col": "Área de Conocimiento",
"rotulo": "Área de Conocimiento",
"modo": null
},
{
"col": "indicador",
"rotulo": "Indicador",
"modo": null
}
],
"kpis": [
{
"rotulo": "Desertores",
"formato": "num",
"pie": "Según el indicador seleccionado",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Niveles de formación",
"col": "Nivel de Formación",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Áreas de conocimiento",
"col": "Área de Conocimiento",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "indicador",
"col": "indicador",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasH",
"titulo": "Deserción por programa",
"dim": "Programa",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Deserción por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Deserción por área de conocimiento",
"dim": "Área de Conocimiento",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"corte": 16
},
{
"tipo": "anillo",
"titulo": "Deserción por metodología",
"dim": "Metodología",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "registros"
},
{
"tipo": "tabla",
"titulo": "Desertores por centro de formación",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": "Valor",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Sede SENA",
"Municipio Sede SENA"
],
"alto": 380
}
],
"notas": [
"La hoja trae matriculados y desertores en la misma columna «Valor», distinguidos por «Indicador»; el tablero muestra por defecto todos y el filtro permite elegir."
],
"fuente": null,
"datos": "ep-desercion-sena__unica"
}
]
}
]
},
{
"id": "investigacion",
"rotulo": "Investigación",
"icono": "science",
"vistas": [
{
"id": "ep-grupos-investigacion",
"titulo": "Grupos de investigación",
"rotulo": "Grupos de investigación",
"fuente": "MinCiencias · convocatorias de reconocimiento",
"descripcion": "Grupos de investigación reconocidos por MinCiencias, por departamento, municipio, área y categoría.",
"selector": null,
"icono": "science",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año de la convocatoria",
"modo": null
},
{
"col": "Institución que avala",
"rotulo": "Institución que avala el grupo",
"modo": null
}
],
"kpis": [
{
"rotulo": "Grupos de investigación",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Instituciones que avalan",
"formato": "num",
"col": "Institución que avala",
"agg": "distinct"
},
{
"rotulo": "Municipios",
"formato": "num",
"col": "NME_MUNICIPIO_GR",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "NME_DEPARTAMENTO_GR",
"col": "NME_DEPARTAMENTO_GR",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Grupos de investigación por departamento",
"dim": "NME_DEPARTAMENTO_GR",
"ancho": "media",
"mapa": "departamentos",
"alto": 460
},
{
"tipo": "tabla",
"titulo": "Grupos de investigación por municipio",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"NME_MUNICIPIO_GR"
],
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Grupos por área del conocimiento",
"dim": "NME_AREA_GR",
"ancho": "media"
},
{
"tipo": "arbol",
"titulo": "Grupos por categoría",
"dim": "NME_CLASIFICACION_GR",
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "ep-grupos-investigacion__unica"
}
]
},
{
"id": "ep-investigadores",
"titulo": "Investigadores reconocidos por MinCiencias",
"rotulo": "Investigadores reconocidos",
"fuente": "MinCiencias · convocatorias de reconocimiento",
"descripcion": "Investigadores reconocidos por MinCiencias, por lugar de nacimiento, sexo, nivel de formación y categoría.",
"selector": null,
"icono": "person_search",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año de la convocatoria",
"modo": null
},
{
"col": "NME_NIV_FORM_PR",
"rotulo": "Nivel de formación",
"modo": null
},
{
"col": "NME_AREA_GR",
"rotulo": "Área del conocimiento",
"modo": null
}
],
"kpis": [
{
"rotulo": "Investigadores reconocidos",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Departamentos de nacimiento",
"formato": "num",
"col": "NME_DEPARTAMENTO_NAC_PR",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "NME_NIV_FORM_PR",
"col": "NME_NIV_FORM_PR",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "NME_AREA_GR",
"col": "NME_AREA_GR",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasH",
"titulo": "Investigadores por departamento de nacimiento",
"dim": "NME_DEPARTAMENTO_NAC_PR",
"ancho": "media",
"alto": 460
},
{
"tipo": "tabla",
"titulo": "Investigadores por municipio de nacimiento",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"NME_MUNICIPIO_NAC_PR"
],
"alto": 460
},
{
"tipo": "anillo",
"titulo": "Investigadores por sexo",
"dim": "Sexo",
"ancho": "media",
"rotuloTotal": "investigadores"
},
{
"tipo": "anillo",
"titulo": "Investigadores por categoría",
"dim": "NME_CLAS_PR",
"ancho": "media",
"rotuloTotal": "investigadores"
}
],
"notas": [],
"fuente": null,
"datos": "ep-investigadores__unica"
}
]
},
{
"id": "ep-patentes",
"titulo": "Patentes concedidas",
"rotulo": "Patentes concedidas",
"fuente": "Superintendencia de Industria y Comercio",
"descripcion": "Patentes de invención, modelos de utilidad y esquemas de trazado concedidos, por año y ámbito.",
"selector": null,
"icono": "lightbulb",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Patentes totales · Colombia",
"formato": "num",
"col": "Patentes concedidas totales nacional",
"agg": "sum"
},
{
"rotulo": "Patentes totales · Antioquia",
"formato": "num",
"col": "Patentes concedidas totales regional",
"agg": "sum"
},
{
"rotulo": "Patentes totales · Medellín",
"formato": "num",
"col": "Patentes concedidas totales local",
"agg": "sum"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Patentes de invención",
"dim": "Año",
"medidas": [
{
"col": "Patentes concedidas de invención nacional",
"agg": "sum",
"rotulo": "Nacional",
"formato": null,
"color": null
},
{
"col": "Patentes concedidas de invención regional",
"agg": "sum",
"rotulo": "Antioquia",
"formato": null,
"color": null
},
{
"col": "Patentes concedidas de invención local",
"agg": "sum",
"rotulo": "Medellín",
"formato": null,
"color": null
}
],
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Patentes de modelo de utilidad",
"dim": "Año",
"medidas": [
{
"col": "Patentes concedidas de modelo de utilidad nacional",
"agg": "sum",
"rotulo": "Nacional",
"formato": null,
"color": null
},
{
"col": "Patentes concedidas de modelo de utilidad regional",
"agg": "sum",
"rotulo": "Antioquia",
"formato": null,
"color": null
},
{
"col": "Patentes concedidas de modelo de utilidad local",
"agg": "sum",
"rotulo": "Medellín",
"formato": null,
"color": null
}
],
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Registros de esquemas de trazado",
"dim": "Año",
"medidas": [
{
"col": "Patentes concedidas de registro de esquemas de trazado nacio",
"agg": "sum",
"rotulo": "Nacional",
"formato": null,
"color": null
},
{
"col": "Patentes concedidas de registro de esquemas de trazado regio",
"agg": "sum",
"rotulo": "Antioquia",
"formato": null,
"color": null
},
{
"col": "Patentes concedidas de registro de esquemas de trazado local",
"agg": "sum",
"rotulo": "Medellín",
"formato": null,
"color": null
}
],
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Patentes concedidas totales",
"dim": "Año",
"medidas": [
{
"col": "Patentes concedidas totales nacional",
"agg": "sum",
"rotulo": "Nacional",
"formato": null,
"color": null
},
{
"col": "Patentes concedidas totales regional",
"agg": "sum",
"rotulo": "Antioquia",
"formato": null,
"color": null
},
{
"col": "Patentes concedidas totales local",
"agg": "sum",
"rotulo": "Medellín",
"formato": null,
"color": null
}
],
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "ep-patentes__unica"
}
]
},
{
"id": "ep-revistas",
"titulo": "Revistas indexadas",
"rotulo": "Revistas indexadas",
"fuente": "MinCiencias · Publindex",
"descripcion": "Revistas científicas indexadas en Publindex, por institución editora, región, área y año.",
"selector": null,
"icono": "auto_stories",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Institución editora",
"rotulo": "Institución editora",
"modo": null
},
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Revistas indexadas",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Instituciones editoras",
"formato": "num",
"col": "Institución editora",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "MUNICIPIO",
"col": "MUNICIPIO",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "DEPARTAMENTO",
"col": "DEPARTAMENTO",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Revistas por municipio",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"MUNICIPIO",
"DEPARTAMENTO"
],
"alto": 420
},
{
"tipo": "barrasH",
"titulo": "Revistas por área de conocimiento",
"dim": "NME_AREA",
"ancho": "media",
"alto": 420
},
{
"tipo": "barrasV",
"titulo": "Revistas por región del país",
"dim": "REG_REV_IN",
"ancho": "media"
},
{
"tipo": "linea",
"titulo": "Revistas indexadas por año",
"dim": "Año",
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "ep-revistas__unica"
}
]
}
]
},
{
"id": "egresados",
"rotulo": "Egresados",
"icono": "workspace_premium",
"vistas": [
{
"id": "ep-graduados",
"titulo": "Graduados en educación superior",
"rotulo": "Graduados en educación superior",
"fuente": "SNIES · corte 2022, descargado en 2023",
"descripcion": "Graduados de programas de educación superior por institución, nivel, metodología y sexo.",
"selector": "Ámbito territorial",
"icono": "workspace_premium",
"palabras": null,
"variantes": [
{
"id": "nacional",
"rotulo": "Colombia",
"sub": "Nacional",
"filtros": [
{
"col": "Nivel Académico",
"rotulo": "Nivel Académico",
"modo": null
},
{
"col": "Sector",
"rotulo": "Sector",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Graduados",
"formato": "num",
"col": "Graduados",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Niveles de formación",
"formato": "num",
"col": "Nivel de Formación",
"agg": "distinct"
},
{
"rotulo": "Niveles académicos",
"col": "Nivel Académico",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Sectores",
"col": "Sector",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Graduados por departamento de domicilio de la IES",
"dim": "Departamento",
"medida": {
"col": "Graduados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"mapa": "departamentos",
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Graduados por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "Graduados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "tabla",
"titulo": "Graduados por IES",
"medida": {
"col": "Graduados",
"agg": "sum",
"rotulo": "Graduados",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"IES"
],
"alto": 380
},
{
"tipo": "anillo",
"titulo": "Graduados por sexo",
"dim": "Sexo",
"medida": {
"col": "Graduados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "graduados"
},
{
"tipo": "barrasV",
"titulo": "Graduados por metodología",
"dim": "Metodología",
"medida": {
"col": "Graduados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "ep-graduados__nacional"
},
{
"id": "regional",
"rotulo": "Antioquia",
"sub": "Departamental",
"filtros": [
{
"col": "Nivel Académico",
"rotulo": "Nivel Académico",
"modo": null
},
{
"col": "Sector",
"rotulo": "Sector",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Programa",
"rotulo": "Programa",
"modo": null
}
],
"kpis": [
{
"rotulo": "Graduados",
"formato": "num",
"col": "Graduados",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Niveles de formación",
"formato": "num",
"col": "Nivel de Formación",
"agg": "distinct"
},
{
"rotulo": "Niveles académicos",
"col": "Nivel Académico",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Sectores",
"col": "Sector",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Graduados por municipio de domicilio de la IES",
"dim": "Municipio",
"medida": {
"col": "Graduados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"mapa": "municipiosAntioquia",
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Graduados por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "Graduados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "tabla",
"titulo": "Graduados por IES",
"medida": {
"col": "Graduados",
"agg": "sum",
"rotulo": "Graduados",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"IES"
],
"alto": 380
},
{
"tipo": "anillo",
"titulo": "Graduados por sexo",
"dim": "Sexo",
"medida": {
"col": "Graduados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "graduados"
},
{
"tipo": "barrasV",
"titulo": "Graduados por metodología",
"dim": "Metodología",
"medida": {
"col": "Graduados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "ep-graduados__regional"
},
{
"id": "local",
"rotulo": "Medellín",
"sub": "Local",
"filtros": [
{
"col": "Nivel Académico",
"rotulo": "Nivel Académico",
"modo": null
},
{
"col": "Sector",
"rotulo": "Sector",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Graduados",
"formato": "num",
"col": "Graduados",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Niveles académicos",
"col": "Nivel Académico",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Sectores",
"col": "Sector",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Graduados por programa académico",
"medida": {
"col": "Graduados",
"agg": "sum",
"rotulo": "Graduados",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"IES"
],
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Graduados por nivel de formación",
"dim": "Nivel de Formación",
"medida": {
"col": "Graduados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "tabla",
"titulo": "Graduados por IES",
"medida": {
"col": "Graduados",
"agg": "sum",
"rotulo": "Graduados",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"IES"
],
"alto": 380
},
{
"tipo": "anillo",
"titulo": "Graduados por sexo",
"dim": "Sexo",
"medida": {
"col": "Graduados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "graduados"
},
{
"tipo": "barrasV",
"titulo": "Graduados por metodología",
"dim": "Metodología",
"medida": {
"col": "Graduados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "ep-graduados__local"
}
]
},
{
"id": "ep-certificados-etdh",
"titulo": "Certificados en entidades ETDH",
"rotulo": "Certificados en ETDH",
"fuente": "SIET · corte 2023",
"descripcion": "Personas certificadas en programas de educación para el trabajo y el desarrollo humano en Medellín.",
"selector": null,
"icono": "verified",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Institución",
"rotulo": "Institución educativa",
"modo": null
}
],
"kpis": [
{
"rotulo": "Certificados",
"formato": "num",
"col": "Certificado",
"agg": "sum"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "Institución",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Tipo Certificado",
"col": "Tipo Certificado",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "anillo",
"titulo": "Certificados por tipo de certificación",
"dim": "Tipo Certificado",
"medida": {
"col": "Certificado",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"rotuloTotal": "certificados"
},
{
"tipo": "barrasV",
"titulo": "Certificados por área de desempeño",
"dim": "Area de Desempeño",
"medida": {
"col": "Certificado",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"corte": 16
},
{
"tipo": "tabla",
"titulo": "Certificados por programa",
"medida": {
"col": "Certificado",
"agg": "sum",
"rotulo": "Certificados",
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Programa",
"Institución"
],
"alto": 380
},
{
"tipo": "linea",
"titulo": "Certificados en entidades ETDH por año",
"dim": "Año",
"medida": {
"col": "Certificado",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"alto": 260
}
],
"notas": [],
"fuente": null,
"datos": "ep-certificados-etdh__unica"
}
]
},
{
"id": "ep-saber",
"titulo": "Pruebas Saber Pro y Saber TyT",
"rotulo": "Pruebas Saber Pro y TyT",
"fuente": "ICFES · corte 2022",
"descripcion": "Promedios por módulo de las pruebas Saber Pro y Saber TyT, en los tres ámbitos.",
"selector": "Prueba",
"icono": "quiz",
"palabras": null,
"variantes": [
{
"id": "pro",
"rotulo": "Saber Pro",
"sub": "Universitarios",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Prueba",
"rotulo": "Prueba",
"modo": null
}
],
"kpis": [
{
"rotulo": "Promedio nacional",
"formato": "dec",
"col": "Promedio prueba nacional",
"agg": "avg"
},
{
"rotulo": "Promedio Antioquia",
"formato": "dec",
"col": "Promedio prueba regional",
"agg": "avg"
},
{
"rotulo": "Promedio Medellín",
"formato": "dec",
"col": "Promedio prueba local",
"agg": "avg"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Pruebas",
"col": "Prueba",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Promedio Saber Pro · nacional",
"dim": "Año",
"medida": {
"col": "Promedio prueba nacional",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Prueba",
"ancho": "tercio",
"formato": "dec"
},
{
"tipo": "barrasV",
"titulo": "Promedio Saber Pro · Antioquia",
"dim": "Año",
"medida": {
"col": "Promedio prueba regional",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Prueba",
"ancho": "tercio",
"formato": "dec"
},
{
"tipo": "barrasV",
"titulo": "Promedio Saber Pro · Medellín",
"dim": "Año",
"medida": {
"col": "Promedio prueba local",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Prueba",
"ancho": "tercio",
"formato": "dec"
},
{
"tipo": "tabla",
"titulo": "Promedios por prueba y año",
"medidas": [
{
"col": "Promedio prueba nacional",
"agg": "avg",
"rotulo": "Nacional",
"formato": "dec",
"color": null
},
{
"col": "Promedio prueba regional",
"agg": "avg",
"rotulo": "Antioquia",
"formato": "dec",
"color": null
},
{
"col": "Promedio prueba local",
"agg": "avg",
"rotulo": "Medellín",
"formato": "dec",
"color": null
}
],
"ancho": "completa",
"dims": [
"Prueba",
"Año"
],
"alto": 380,
"sinTotal": true
}
],
"notas": [],
"fuente": null,
"datos": "ep-saber__pro"
},
{
"id": "tyt",
"rotulo": "Saber TyT",
"sub": "Técnicos y tecnólogos",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Prueba",
"rotulo": "Prueba",
"modo": null
}
],
"kpis": [
{
"rotulo": "Promedio nacional",
"formato": "dec",
"col": "Promedio prueba nacional",
"agg": "avg"
},
{
"rotulo": "Promedio Antioquia",
"formato": "dec",
"col": "Promedio prueba regional",
"agg": "avg"
},
{
"rotulo": "Promedio Medellín",
"formato": "dec",
"col": "Promedio prueba local",
"agg": "avg"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Pruebas",
"col": "Prueba",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Promedio Saber TyT · nacional",
"dim": "Año",
"medida": {
"col": "Promedio prueba nacional",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Prueba",
"ancho": "tercio",
"formato": "dec"
},
{
"tipo": "barrasV",
"titulo": "Promedio Saber TyT · Antioquia",
"dim": "Año",
"medida": {
"col": "Promedio prueba regional",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Prueba",
"ancho": "tercio",
"formato": "dec"
},
{
"tipo": "barrasV",
"titulo": "Promedio Saber TyT · Medellín",
"dim": "Año",
"medida": {
"col": "Promedio prueba local",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Prueba",
"ancho": "tercio",
"formato": "dec"
},
{
"tipo": "tabla",
"titulo": "Promedios por prueba y año",
"medidas": [
{
"col": "Promedio prueba nacional",
"agg": "avg",
"rotulo": "Nacional",
"formato": "dec",
"color": null
},
{
"col": "Promedio prueba regional",
"agg": "avg",
"rotulo": "Antioquia",
"formato": "dec",
"color": null
},
{
"col": "Promedio prueba local",
"agg": "avg",
"rotulo": "Medellín",
"formato": "dec",
"color": null
}
],
"ancho": "completa",
"dims": [
"Prueba",
"Año"
],
"alto": 380,
"sinTotal": true
}
],
"notas": [],
"fuente": null,
"datos": "ep-saber__tyt"
}
]
},
{
"id": "ep-cotizantes",
"titulo": "Recién graduados vinculados al sector formal e ingreso base de cotización (IBC)",
"rotulo": "Recién graduados vinculados y su IBC",
"fuente": "OLE · Observatorio Laboral para la Educación",
"descripcion": "Proporción de recién graduados que cotizan al sistema de seguridad social y su ingreso base de cotización.",
"selector": "Ver",
"icono": "work_history",
"palabras": null,
"variantes": [
{
"id": "tasa",
"rotulo": "Tasa de cotizantes",
"sub": "Vinculados al sector formal",
"filtros": [
{
"col": "Año de graduación",
"rotulo": "Año de graduación",
"modo": null
},
{
"col": "Año de vinculación",
"rotulo": "Año de vinculación",
"modo": null
}
],
"kpis": [
{
"rotulo": "Tasa de cotización hombres",
"formato": "pct",
"col": "Tasa de cotización hombres",
"agg": "avg"
},
{
"rotulo": "Tasa de cotización mujeres",
"formato": "pct",
"col": "Tasa de cotización mujeres",
"agg": "avg"
},
{
"rotulo": "Sector oficial",
"formato": "pct",
"col": "Tasa de cotización sector oficial",
"agg": "avg"
},
{
"rotulo": "Sector privado",
"formato": "pct",
"col": "Tasa de cotización sector privado",
"agg": "avg"
},
{
"rotulo": "Año de graduación",
"col": "Año de graduación",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "linea",
"titulo": "Tasa de cotización de hombres",
"dim": "Año de vinculación",
"medida": {
"col": "Tasa de cotización hombres",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct",
"alto": 280
},
{
"tipo": "linea",
"titulo": "Tasa de cotización de mujeres",
"dim": "Año de vinculación",
"medida": {
"col": "Tasa de cotización mujeres",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct",
"alto": 280
},
{
"tipo": "linea",
"titulo": "Tasa de cotización · sector oficial",
"dim": "Año de vinculación",
"medida": {
"col": "Tasa de cotización sector oficial",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct",
"alto": 280
},
{
"tipo": "linea",
"titulo": "Tasa de cotización · sector privado",
"dim": "Año de vinculación",
"medida": {
"col": "Tasa de cotización sector privado",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct",
"alto": 280
}
],
"notas": [],
"fuente": null,
"datos": "ep-cotizantes__tasa"
},
{
"id": "ibc",
"rotulo": "Ingreso base de cotización",
"sub": "IBC de recién graduados",
"filtros": [
{
"col": "Año de graduación",
"rotulo": "Año de graduación",
"modo": null
},
{
"col": "Año de vinculación",
"rotulo": "Año de vinculación",
"modo": null
}
],
"kpis": [
{
"rotulo": "Rangos de IBC",
"formato": "num",
"col": "IBC",
"agg": "distinct"
},
{
"rotulo": "Año de graduación",
"col": "Año de graduación",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Año de vinculación",
"col": "Año de vinculación",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
},
{
"rotulo": "Visualizaciones",
"agg": "constante",
"valor": 3,
"formato": "num",
"pie": "En esta vista"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Distribución de recién graduados por rango de IBC",
"medidas": [
{
"col": "Hombres",
"agg": "avg",
"rotulo": "Hombres",
"formato": "pct",
"color": null
},
{
"col": "Mujeres",
"agg": "avg",
"rotulo": "Mujeres",
"formato": "pct",
"color": null
},
{
"col": "sector oficial",
"agg": "avg",
"rotulo": "Sector oficial",
"formato": "pct",
"color": null
},
{
"col": "sector privado",
"agg": "avg",
"rotulo": "Sector privado",
"formato": "pct",
"color": null
}
],
"ancho": "completa",
"dims": [
"Año de graduación",
"Año de vinculación",
"IBC"
],
"alto": 460,
"sinTotal": true,
"ordenPor": "Año de graduación"
},
{
"tipo": "barrasV",
"titulo": "Rango de IBC por sexo",
"dim": "IBC",
"medidas": [
{
"col": "Hombres",
"agg": "avg",
"rotulo": "Hombres",
"formato": null,
"color": null
},
{
"col": "Mujeres",
"agg": "avg",
"rotulo": "Mujeres",
"formato": null,
"color": null
}
],
"ancho": "media",
"formato": "pct"
},
{
"tipo": "barrasV",
"titulo": "Rango de IBC por sector de la IES",
"dim": "IBC",
"medidas": [
{
"col": "sector oficial",
"agg": "avg",
"rotulo": "Sector oficial",
"formato": null,
"color": null
},
{
"col": "sector privado",
"agg": "avg",
"rotulo": "Sector privado",
"formato": null,
"color": null
}
],
"ancho": "media",
"formato": "pct"
}
],
"notas": [
"Los valores son la proporción de recién graduados en cada rango de salarios mínimos."
],
"fuente": null,
"datos": "ep-cotizantes__ibc"
}
]
}
]
}
]
},
{
"id": "sapiencia",
"rotulo": "Sapiencia",
"icono": "account_balance_wallet",
"familia": "primary",
"descripcion": "Programas de acceso y permanencia de la Agencia de Educación Postsecundaria de Medellín: becas, créditos condonables, Matrícula Cero, otros programas y gestión de cartera.",
"temas": [
{
"id": "fondos",
"rotulo": "Becas y créditos condonables",
"icono": "savings",
"vistas": [
{
"id": "sa-fondo-epm",
"titulo": "Fondo EPM y Universidades",
"rotulo": "Fondo EPM y Universidades",
"fuente": "Sapiencia · corte 2023-1",
"descripcion": "Inscritos, preseleccionados y beneficiarios legalizados del Fondo EPM y Universidades, con su caracterización general, académica y territorial.",
"selector": "Etapa del proceso",
"icono": "savings",
"palabras": "créditos condonables becas fondo epm",
"variantes": [
{
"id": "inscritos",
"rotulo": "Inscritos",
"sub": "Etapa",
"filtros": [
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Tipo de solicitud",
"rotulo": "Tipo de solicitud",
"modo": null
}
],
"kpis": [
{
"rotulo": "Inscritos",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Inscritas",
"col": "EsMujer",
"agg": "sum",
"flag": true
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Tipos de solicitud",
"col": "Tipo de solicitud",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Inscritos por comuna",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Comuna"
],
"alto": 420
},
{
"tipo": "anillo",
"titulo": "Inscritos por sexo",
"dim": "Sexo",
"ancho": "tercio",
"rotuloTotal": "personas"
},
{
"tipo": "arbol",
"titulo": "Inscritos por sector de la IES",
"dim": "Sector",
"ancho": "tercio"
},
{
"tipo": "tabla",
"titulo": "Inscritos por IES",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"IES"
],
"alto": 380
},
{
"tipo": "barrasV",
"titulo": "Inscritos por estrato socioeconómico",
"dim": "Estrato",
"ancho": "tercio"
},
{
"tipo": "barrasH",
"titulo": "Inscritos por nivel de formación",
"dim": "Nivel de Formación",
"ancho": "tercio"
}
],
"notas": [],
"fuente": null,
"datos": "sa-fondo-epm__inscritos"
},
{
"id": "preseleccionados",
"rotulo": "Preseleccionados",
"sub": "Etapa",
"filtros": [
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Tipo de solicitud",
"rotulo": "Tipo de solicitud",
"modo": null
}
],
"kpis": [
{
"rotulo": "Preseleccionados",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Inscritas",
"col": "EsMujer",
"agg": "sum",
"flag": true
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Tipos de solicitud",
"col": "Tipo de solicitud",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Preseleccionados por comuna",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Comuna"
],
"alto": 420
},
{
"tipo": "anillo",
"titulo": "Preseleccionados por sexo",
"dim": "Sexo",
"ancho": "tercio",
"rotuloTotal": "personas"
},
{
"tipo": "arbol",
"titulo": "Preseleccionados por sector de la IES",
"dim": "Sector",
"ancho": "tercio"
},
{
"tipo": "tabla",
"titulo": "Preseleccionados por IES",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"IES"
],
"alto": 380
},
{
"tipo": "barrasV",
"titulo": "Preseleccionados por estrato socioeconómico",
"dim": "Estrato",
"ancho": "tercio"
},
{
"tipo": "barrasH",
"titulo": "Preseleccionados por nivel de formación",
"dim": "Nivel de Formación",
"ancho": "tercio"
}
],
"notas": [],
"fuente": null,
"datos": "sa-fondo-epm__preseleccionados"
},
{
"id": "general",
"rotulo": "Legalizados · información general",
"sub": "Etapa",
"filtros": [
{
"col": "Sexo",
"rotulo": "Sexo",
"modo": null
},
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Comuna",
"rotulo": "Comuna",
"modo": null
},
{
"col": "Estrato",
"rotulo": "Estrato socioeconómico",
"modo": null
},
{
"col": "Nivel de Formación",
"rotulo": "Tipo de formación",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios legalizados",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Beneficiarios indígenas",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "INDIGENA",
"agg": "sum",
"flag": true
},
{
"rotulo": "Con desplazamiento",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "DESPLAZADO",
"agg": "sum",
"flag": true
},
{
"rotulo": "Afrodescendientes",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "TIPO AFROCOLOMBIANO",
"agg": "sum",
"flag": true
},
{
"rotulo": "Con discapacidad",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "DISCAPACIDAD",
"agg": "sum",
"flag": true
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Beneficiarios por convocatoria",
"dim": "Convocatoria",
"ancho": "completa",
"alto": 300
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por sexo",
"dim": "Sexo",
"ancho": "tercio",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por tipo de solicitud",
"dim": "Tipo de solicitud",
"ancho": "tercio",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "tabla",
"titulo": "Víctimas del conflicto (sin desplazados)",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"VICTIMA DEL CONFLICTO"
],
"alto": 300
},
{
"tipo": "linea",
"titulo": "Beneficiarios por vigencia",
"dim": "Año",
"ancho": "completa",
"alto": 260
}
],
"notas": [],
"fuente": null,
"datos": "sa-fondo-epm__general"
},
{
"id": "academica",
"rotulo": "Legalizados · información académica",
"sub": "Etapa",
"filtros": [
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Estrato",
"rotulo": "Estrato socioeconómico",
"modo": null
},
{
"col": "Comuna",
"rotulo": "Comuna",
"modo": null
},
{
"col": "Tipo de solicitud",
"rotulo": "Tipo de solicitud",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios legalizados",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa homologado",
"agg": "distinct"
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Estratos",
"col": "Estrato",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "anillo",
"titulo": "Beneficiarios por tipo de formación",
"dim": "Nivel de Formación",
"ancho": "media",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "barrasV",
"titulo": "Beneficiarios por tipo de IES y sexo",
"dim": "Sector",
"dim2": "Sexo",
"ancho": "media"
},
{
"tipo": "tabla",
"titulo": "Beneficiarios por IES y sexo",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"IES",
"Sexo"
],
"alto": 420
},
{
"tipo": "tabla",
"titulo": "Beneficiarios por programa académico y sexo",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa homologado",
"Sexo"
],
"alto": 420
}
],
"notas": [],
"fuente": null,
"datos": "sa-fondo-epm__academica"
},
{
"id": "comunas",
"rotulo": "Legalizados · comunas",
"sub": "Etapa",
"filtros": [
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Nivel de Formación",
"rotulo": "Nivel de formación",
"modo": null
},
{
"col": "Municipio residencia",
"rotulo": "Municipio de residencia",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios legalizados",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Comunas y corregimientos",
"formato": "num",
"col": "Comuna Mapa",
"agg": "distinct"
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Niveles de formación",
"col": "Nivel de Formación",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Municipio residencia",
"col": "Municipio residencia",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Beneficiarios por comuna",
"dim": "Comuna Mapa",
"ancho": "media",
"mapa": "comunas",
"alto": 520
},
{
"tipo": "barrasV",
"titulo": "Beneficiarios por tipo de solicitud",
"dim": "Tipo de solicitud",
"ancho": "media",
"alto": 240
},
{
"tipo": "arbol",
"titulo": "Beneficiarios por estrato socioeconómico",
"dim": "Estrato",
"ancho": "media",
"alto": 240
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por tipo de IES",
"dim": "Sector",
"ancho": "media",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "tabla",
"titulo": "Beneficiarios por comuna",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Comuna Mapa"
],
"alto": 380
}
],
"notas": [],
"fuente": null,
"datos": "sa-fondo-epm__comunas"
}
]
},
{
"id": "sa-fondo-pp",
"titulo": "Fondo con recursos de Presupuesto Participativo",
"rotulo": "Fondo con recursos de Presupuesto Participativo",
"fuente": "Sapiencia · corte 2023-1",
"descripcion": "Inscritos, preseleccionados, beneficiarios legalizados y servicio social del Fondo con recursos de Presupuesto Participativo (PP).",
"selector": "Etapa del proceso",
"icono": "savings",
"palabras": "créditos condonables presupuesto participativo pp servicio social",
"variantes": [
{
"id": "inscritos",
"rotulo": "Inscritos",
"sub": "Etapa",
"filtros": [
{
"col": "Sexo",
"rotulo": "Sexo",
"modo": null
},
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Tipo de solicitud",
"rotulo": "Tipo de solicitud",
"modo": null
}
],
"kpis": [
{
"rotulo": "Inscritos",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Inscritas",
"col": "EsMujer",
"agg": "sum",
"flag": true
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Categorías de sexo",
"col": "Sexo",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Inscritos por comuna",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Comuna"
],
"alto": 420
},
{
"tipo": "anillo",
"titulo": "Inscritos por sexo",
"dim": "Sexo",
"ancho": "tercio",
"rotuloTotal": "personas"
},
{
"tipo": "arbol",
"titulo": "Inscritos por sector de la IES",
"dim": "Sector",
"ancho": "tercio"
},
{
"tipo": "tabla",
"titulo": "Inscritos por IES",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"IES"
],
"alto": 380
},
{
"tipo": "barrasV",
"titulo": "Inscritos por estrato socioeconómico",
"dim": "Estrato",
"ancho": "tercio"
},
{
"tipo": "barrasH",
"titulo": "Inscritos por nivel de formación",
"dim": "Nivel de Formación",
"ancho": "tercio"
}
],
"notas": [],
"fuente": null,
"datos": "sa-fondo-pp__inscritos"
},
{
"id": "preseleccionados",
"rotulo": "Preseleccionados",
"sub": "Etapa",
"filtros": [
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Tipo de solicitud",
"rotulo": "Tipo de solicitud",
"modo": null
}
],
"kpis": [
{
"rotulo": "Preseleccionados",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Inscritas",
"col": "EsMujer",
"agg": "sum",
"flag": true
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Tipos de solicitud",
"col": "Tipo de solicitud",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Preseleccionados por comuna",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Comuna"
],
"alto": 420
},
{
"tipo": "anillo",
"titulo": "Preseleccionados por sexo",
"dim": "Sexo",
"ancho": "tercio",
"rotuloTotal": "personas"
},
{
"tipo": "arbol",
"titulo": "Preseleccionados por sector de la IES",
"dim": "Sector",
"ancho": "tercio"
},
{
"tipo": "tabla",
"titulo": "Preseleccionados por IES",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"IES"
],
"alto": 380
},
{
"tipo": "barrasV",
"titulo": "Preseleccionados por estrato socioeconómico",
"dim": "Estrato",
"ancho": "tercio"
},
{
"tipo": "barrasH",
"titulo": "Preseleccionados por nivel de formación",
"dim": "Nivel de Formación",
"ancho": "tercio"
}
],
"notas": [],
"fuente": null,
"datos": "sa-fondo-pp__preseleccionados"
},
{
"id": "general",
"rotulo": "Legalizados · información general",
"sub": "Etapa",
"filtros": [
{
"col": "Sexo",
"rotulo": "Sexo",
"modo": null
},
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Comuna",
"rotulo": "Comuna",
"modo": null
},
{
"col": "Estrato",
"rotulo": "Estrato socioeconómico",
"modo": null
},
{
"col": "Nivel de Formación",
"rotulo": "Tipo de formación",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios legalizados",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Beneficiarios indígenas",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "PERTENECE A ALGUNA ETNIA INDIGENA",
"agg": "sum",
"flag": true
},
{
"rotulo": "Con discapacidad",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "SITUACION DE DISCAPACIDAD",
"agg": "sum",
"flag": true
},
{
"rotulo": "Afrodescendientes",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "POBLACION AFROCOLOMBIANA GRUPO ETNICO",
"agg": "sum",
"flag": true
},
{
"rotulo": "Víctimas del conflicto armado",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "VICTIMA DEL CONFLICTO ARMADO",
"agg": "sum",
"flag": true
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Beneficiarios por convocatoria",
"dim": "Convocatoria",
"ancho": "completa",
"alto": 300
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por sexo",
"dim": "Sexo",
"ancho": "media",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por tipo de beneficio",
"dim": "Tipo de solicitud",
"ancho": "media",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "linea",
"titulo": "Beneficiarios por vigencia",
"dim": "Vigencia",
"ancho": "completa",
"alto": 260
}
],
"notas": [],
"fuente": null,
"datos": "sa-fondo-pp__general"
},
{
"id": "academica",
"rotulo": "Legalizados · información académica",
"sub": "Etapa",
"filtros": [
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Estrato",
"rotulo": "Estrato socioeconómico",
"modo": null
},
{
"col": "Comuna",
"rotulo": "Comuna",
"modo": null
},
{
"col": "Tipo de solicitud",
"rotulo": "Tipo de beneficio",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios legalizados",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Estratos",
"col": "Estrato",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "anillo",
"titulo": "Beneficiarios por tipo de pregrado",
"dim": "Nivel de Formación",
"ancho": "media",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "barrasV",
"titulo": "Beneficiarios por tipo de IES y sexo",
"dim": "Sector",
"dim2": "Sexo",
"ancho": "media"
},
{
"tipo": "tabla",
"titulo": "Beneficiarios por IES y sexo",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"IES",
"Sexo"
],
"alto": 420
},
{
"tipo": "tabla",
"titulo": "Beneficiarios por programa académico y sexo",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"Sexo"
],
"alto": 420
}
],
"notas": [],
"fuente": null,
"datos": "sa-fondo-pp__academica"
},
{
"id": "comunas",
"rotulo": "Legalizados · comunas",
"sub": "Etapa",
"filtros": [
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Nivel de Formación",
"rotulo": "Nivel de formación",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios legalizados",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Comunas y corregimientos",
"formato": "num",
"col": "Comuna Mapa",
"agg": "distinct"
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Niveles de formación",
"col": "Nivel de Formación",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Tipos de solicitud",
"col": "Tipo de solicitud",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Beneficiarios por comuna",
"dim": "Comuna Mapa",
"ancho": "media",
"mapa": "comunas",
"alto": 520
},
{
"tipo": "barrasV",
"titulo": "Beneficiarios por tipo de beneficio",
"dim": "Tipo de solicitud",
"ancho": "media",
"alto": 240
},
{
"tipo": "arbol",
"titulo": "Beneficiarios por estrato residencial",
"dim": "Estrato",
"ancho": "media",
"alto": 240
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por tipo de IES",
"dim": "Sector",
"ancho": "media",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "tabla",
"titulo": "Beneficiarios por comuna",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Comuna"
],
"alto": 380
}
],
"notas": [],
"fuente": null,
"datos": "sa-fondo-pp__comunas"
},
{
"id": "servicio-social",
"rotulo": "Servicio social · caracterización",
"sub": "Servicio social",
"filtros": [
{
"col": "Periodo homologado",
"rotulo": "Semestre",
"modo": null
},
{
"col": "Comuna",
"rotulo": "Comuna",
"modo": null
}
],
"kpis": [
{
"rotulo": "Renovaciones con servicio social",
"formato": "num",
"pie": "Registros de personas beneficiarias",
"agg": "count"
},
{
"rotulo": "Realizaron el servicio",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Realizo_servicio (marcados)",
"agg": "sum",
"flag": true
},
{
"rotulo": "Horas de servicio acumuladas",
"formato": "num",
"col": "TotalHoras",
"agg": "sum"
},
{
"rotulo": "Organizaciones",
"formato": "num",
"col": "Nombre_Organizacion",
"agg": "distinct"
},
{
"rotulo": "Periodo homologado",
"col": "Periodo homologado",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Personas beneficiarias que renovaron, por comuna y realización del servicio",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Comuna",
"Realizo_servicio"
],
"alto": 380
},
{
"tipo": "tabla",
"titulo": "Personas que prestaron servicio social por tipo de organización",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Comuna",
"tipo_Organizacion"
],
"alto": 380
},
{
"tipo": "barrasH",
"titulo": "Personas beneficiarias por modalidad del servicio",
"dim": "Modalidad_servicio",
"ancho": "media"
},
{
"tipo": "tabla",
"titulo": "Personas beneficiarias por IES",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"IES"
],
"alto": 380
},
{
"tipo": "tabla",
"titulo": "Personas beneficiarias por línea de impacto de las actividades",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"dims": [
"Linea_impacto_actividades",
"Comuna"
],
"alto": 380
}
],
"notas": [
"Líneas de impacto: LAA Ambiental y arquitectónica, LB Biodiversa, LC Comunicaciones, LCul Cultura, LD Deporte, LE Educación, LS Salud, LSoc Social, LT Tecnología.",
"El Power BI original mostraba estas cifras en tres páginas (beneficiarios, caracterización y grupos de actividad); aquí quedan integradas en una pestaña."
],
"fuente": null,
"datos": "sa-fondo-pp__servicio-social"
}
]
},
{
"id": "sa-becas-tecnologias",
"titulo": "Becas Tecnologías",
"rotulo": "Becas Tecnologías",
"fuente": "Sapiencia · corte 2023-1",
"descripcion": "Inscritos, preseleccionados y beneficiarios legalizados del programa Becas Tecnologías, con su estado, caracterización y distribución territorial.",
"selector": "Etapa del proceso",
"icono": "school",
"palabras": "becas tecnologías tecnológicos",
"variantes": [
{
"id": "inscritos",
"rotulo": "Inscritos",
"sub": "Etapa",
"filtros": [
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
}
],
"kpis": [
{
"rotulo": "Inscritos",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Inscritas",
"col": "EsMujer",
"agg": "sum",
"flag": true
},
{
"rotulo": "Legalizados",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Legalizado",
"agg": "sum",
"flag": true
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Comunas y corregimientos",
"col": "Comuna",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Inscritos por comuna",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Comuna"
],
"alto": 420
},
{
"tipo": "barrasV",
"titulo": "Inscritos por estrato",
"dim": "Estrato",
"ancho": "tercio"
},
{
"tipo": "tabla",
"titulo": "Inscritos por programa académico",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Programa"
],
"alto": 420
},
{
"tipo": "tabla",
"titulo": "Inscritos por IES",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"IES"
],
"alto": 380
},
{
"tipo": "anillo",
"titulo": "Inscritos por sexo",
"dim": "Sexo",
"ancho": "media",
"rotuloTotal": "inscritos"
}
],
"notas": [],
"fuente": null,
"datos": "sa-becas-tecnologias__inscritos"
},
{
"id": "preseleccionados",
"rotulo": "Preseleccionados",
"sub": "Etapa",
"filtros": [
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
}
],
"kpis": [
{
"rotulo": "Preseleccionados",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Preseleccionadas",
"col": "EsMujer",
"agg": "sum",
"flag": true
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Comunas y corregimientos",
"col": "Comuna",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Estratos",
"col": "Estrato",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Preseleccionados por comuna",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Comuna"
],
"alto": 420
},
{
"tipo": "barrasV",
"titulo": "Preseleccionados por estrato",
"dim": "Estrato",
"ancho": "tercio"
},
{
"tipo": "tabla",
"titulo": "Preseleccionados por programa académico",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Programa"
],
"alto": 420
},
{
"tipo": "tabla",
"titulo": "Preseleccionados por IES",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"IES"
],
"alto": 380
},
{
"tipo": "anillo",
"titulo": "Preseleccionados por sexo",
"dim": "Sexo",
"ancho": "media",
"rotuloTotal": "preseleccionados"
}
],
"notas": [],
"fuente": null,
"datos": "sa-becas-tecnologias__preseleccionados"
},
{
"id": "general",
"rotulo": "Legalizados · información general",
"sub": "Etapa",
"filtros": [
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Comuna",
"rotulo": "Comuna",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Estado 2023-1",
"rotulo": "Estado actual",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios legalizados",
"formato": "num",
"pie": "Registros en la selección",
"col": "EsICBF",
"agg": "sum"
},
{
"rotulo": "Víctimas del conflicto armado",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Victimas conflicto armado",
"agg": "sum",
"flag": true
},
{
"rotulo": "LGTBIQ+",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "lgtbi",
"agg": "sum",
"flag": true
},
{
"rotulo": "Con discapacidad",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "discapacidad",
"agg": "sum",
"flag": true
},
{
"rotulo": "Afrodescendientes",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "afrocolombia",
"agg": "sum",
"flag": true
}
],
"visuales": [
{
"tipo": "area",
"titulo": "Beneficiarios por convocatoria",
"dim": "Convocatoria",
"medida": {
"col": "EsICBF",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"alto": 300
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por sexo",
"dim": "Sexo",
"medida": {
"col": "EsICBF",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"alto": 300,
"rotuloTotal": "beneficiarios"
},
{
"tipo": "tabla",
"titulo": "Estado de los beneficiarios por convocatoria",
"medida": {
"col": "EsICBF",
"agg": "sum",
"rotulo": "Beneficiarios",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Estado 2023-1",
"Convocatoria"
],
"alto": 380
},
{
"tipo": "tabla",
"titulo": "Otras poblaciones especiales",
"medida": {
"col": "Marcados",
"agg": "sum",
"rotulo": "Beneficiarios",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Poblacion"
],
"alto": 380,
"sinTotal": true
}
],
"notas": [
"Los indicadores de poblaciones especiales cuentan beneficiarios con la casilla marcada; el Power BI original los mostraba con la función «mínimo», que no entregaba un conteo."
],
"fuente": null,
"datos": "sa-becas-tecnologias__general"
},
{
"id": "academica",
"rotulo": "Legalizados · información académica",
"sub": "Etapa",
"filtros": [
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Comuna",
"rotulo": "Comuna",
"modo": null
},
{
"col": "Estado 2023-1",
"rotulo": "Estado actual",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios legalizados",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Comunas y corregimientos",
"col": "Comuna",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Beneficiarios por IES y sexo",
"dim": "IES",
"dim2": "Sexo",
"ancho": "media",
"alto": 460
},
{
"tipo": "barrasH",
"titulo": "Beneficiarios por programa académico",
"dim": "Programa",
"ancho": "media",
"alto": 460
}
],
"notas": [],
"fuente": null,
"datos": "sa-becas-tecnologias__academica"
},
{
"id": "comunas",
"rotulo": "Legalizados · comunas",
"sub": "Etapa",
"filtros": [
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Comuna",
"rotulo": "Comuna",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Estado 2023-1",
"rotulo": "Estado actual",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios legalizados",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Comunas y corregimientos",
"formato": "num",
"col": "Comuna Mapa",
"agg": "distinct"
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Comunas y corregimientos",
"col": "Comuna",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Beneficiarios por comuna",
"dim": "Comuna Mapa",
"ancho": "media",
"mapa": "comunas",
"alto": 460
},
{
"tipo": "barrasV",
"titulo": "Beneficiarios por estrato socioeconómico",
"dim": "Estrato",
"ancho": "media",
"alto": 460
},
{
"tipo": "area",
"titulo": "Beneficiarios por convocatoria",
"dim": "Convocatoria",
"ancho": "media",
"alto": 280
},
{
"tipo": "tabla",
"titulo": "Estado 2022-2 por convocatoria",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Convocatoria",
"Estado 2022-2"
],
"alto": 280
}
],
"notas": [],
"fuente": null,
"datos": "sa-becas-tecnologias__comunas"
}
]
},
{
"id": "sa-fondo-efe",
"titulo": "Fondo Extendiendo Fronteras Educativas (EFE)",
"rotulo": "Fondo Extendiendo Fronteras Educativas",
"fuente": "Sapiencia · corte 2023-1",
"descripcion": "Beneficiarios del fondo de créditos condonables para posgrado Extendiendo Fronteras Educativas.",
"selector": null,
"icono": "flight_takeoff",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Activos",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "EsActivo",
"agg": "sum",
"flag": true
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Comunas y corregimientos",
"col": "Comuna",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Beneficiarios por comuna",
"dim": "Comuna",
"ancho": "dosTercios",
"corte": 14
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por tipo de beneficio",
"dim": "Tipo de solicitud",
"ancho": "tercio",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "barrasH",
"titulo": "Beneficiarios por estrato socioeconómico",
"dim": "Estrato",
"ancho": "tercio"
},
{
"tipo": "tabla",
"titulo": "Beneficiarios por IES",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"IES",
"Sector"
],
"alto": 380
},
{
"tipo": "barrasV",
"titulo": "Beneficiarios por modalidad de estudio",
"dim": "Modalidad de estudio",
"ancho": "tercio"
},
{
"tipo": "tabla",
"titulo": "Beneficiarios por programa académico",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"dims": [
"Programa"
],
"alto": 320
}
],
"notas": [],
"fuente": null,
"datos": "sa-fondo-efe__unica"
}
]
},
{
"id": "sa-fondo-enlaza-mundos",
"titulo": "Fondo Enlaza Mundos",
"rotulo": "Fondo Enlaza Mundos",
"fuente": "Sapiencia · corte 2023-1",
"descripcion": "Beneficiarios del fondo Enlaza Mundos para estudios de posgrado en el exterior.",
"selector": null,
"icono": "public",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Beneficiarias",
"col": "EsMujer",
"agg": "sum",
"flag": true
},
{
"rotulo": "Países de destino",
"formato": "num",
"col": "PAIS DESTINO",
"agg": "distinct"
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Beneficiarios por IES",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"IES",
"PAIS DESTINO"
],
"alto": 380
},
{
"tipo": "area",
"titulo": "Beneficiarios por convocatoria",
"dim": "Convocatoria",
"ancho": "media",
"alto": 380
},
{
"tipo": "barrasH",
"titulo": "Beneficiarios por estrato socioeconómico",
"dim": "Estrato",
"ancho": "tercio"
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por sexo",
"dim": "Sexo",
"ancho": "tercio",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "barrasH",
"titulo": "Beneficiarios por país de la IES",
"dim": "PAIS DESTINO",
"ancho": "tercio"
}
],
"notas": [],
"fuente": null,
"datos": "sa-fondo-enlaza-mundos__unica"
}
]
},
{
"id": "sa-fondo-formacion-avanzada",
"titulo": "Fondo Formación Avanzada",
"rotulo": "Fondo Formación Avanzada",
"fuente": "Sapiencia · corte 2023-1",
"descripcion": "Beneficiarios del fondo de créditos condonables para posgrado Formación Avanzada.",
"selector": null,
"icono": "psychology",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Beneficiarias",
"col": "EsMujer",
"agg": "sum",
"flag": true
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Sectores",
"col": "Sector",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Beneficiarios por IES",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"IES",
"Sector"
],
"alto": 380
},
{
"tipo": "area",
"titulo": "Beneficiarios por convocatoria",
"dim": "Convocatoria",
"ancho": "media",
"alto": 380
},
{
"tipo": "barrasH",
"titulo": "Beneficiarios por estrato socioeconómico",
"dim": "Estrato",
"ancho": "tercio"
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por sexo",
"dim": "Sexo",
"ancho": "tercio",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "barrasH",
"titulo": "Beneficiarios por modalidad de estudio",
"dim": "Modalidad de estudio",
"ancho": "tercio"
}
],
"notas": [],
"fuente": null,
"datos": "sa-fondo-formacion-avanzada__unica"
}
]
},
{
"id": "sa-mejores-deportistas",
"titulo": "Fondo Mejores Deportistas",
"rotulo": "Fondo Mejores Deportistas",
"fuente": "Sapiencia · corte 2023-1",
"descripcion": "Personas beneficiarias de las becas para los mejores deportistas de la ciudad.",
"selector": null,
"icono": "sports",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Vigencia",
"rotulo": "Convocatoria",
"modo": null
}
],
"kpis": [
{
"rotulo": "Personas beneficiarias",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Beneficiarias",
"col": "EsMujer",
"agg": "sum",
"flag": true
},
{
"rotulo": "Activos",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "EsActivo",
"agg": "sum",
"flag": true
},
{
"rotulo": "Vigencias",
"col": "Vigencia",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Comunas y corregimientos",
"col": "Comuna Mapa",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Personas beneficiarias por comuna",
"dim": "Comuna Mapa",
"ancho": "dosTercios",
"corte": 14
},
{
"tipo": "barrasH",
"titulo": "Personas beneficiarias por estrato socioeconómico",
"dim": "Estrato",
"ancho": "tercio"
},
{
"tipo": "tabla",
"titulo": "Personas beneficiarias por IES",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"IES"
],
"alto": 380
},
{
"tipo": "barrasV",
"titulo": "Personas beneficiarias por rango de edad",
"dim": "Rango de edad",
"ancho": "tercio"
},
{
"tipo": "anillo",
"titulo": "Personas beneficiarias por sexo",
"dim": "Sexo",
"ancho": "tercio",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "tabla",
"titulo": "Personas beneficiarias por programa académico",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"dims": [
"Programa"
],
"alto": 320
}
],
"notas": [],
"fuente": null,
"datos": "sa-mejores-deportistas__unica"
}
]
},
{
"id": "sa-mejores-bachilleres",
"titulo": "Becas Mejores Bachilleres",
"rotulo": "Becas Mejores Bachilleres",
"fuente": "Sapiencia · corte 2023-1",
"descripcion": "Beneficiarios de las becas para los mejores bachilleres de Medellín, por institución, programa, comuna y estrato.",
"selector": null,
"icono": "emoji_events",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año de inicio de la beca",
"modo": null
},
{
"col": "ESTADO",
"rotulo": "Estado actual",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Beneficiarias",
"col": "EsMujer",
"agg": "sum",
"flag": true
},
{
"rotulo": "Activos",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "EsActivo",
"agg": "sum",
"flag": true
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "ESTADO",
"col": "ESTADO",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Beneficiarios por IES",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"IES",
"Sector"
],
"alto": 380
},
{
"tipo": "barrasH",
"titulo": "Beneficiarios por modalidad de estudio",
"dim": "Nivel de Formación",
"ancho": "tercio"
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por sexo",
"dim": "Sexo",
"ancho": "tercio",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "tabla",
"titulo": "Beneficiarios por programa académico",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Programa"
],
"alto": 380
},
{
"tipo": "barrasH",
"titulo": "Beneficiarios por comuna",
"dim": "Comuna",
"ancho": "tercio"
},
{
"tipo": "barrasH",
"titulo": "Beneficiarios por estrato socioeconómico",
"dim": "Estrato",
"ancho": "tercio"
}
],
"notas": [],
"fuente": null,
"datos": "sa-mejores-bachilleres__unica"
}
]
},
{
"id": "sa-todos-los-fondos",
"titulo": "Todos los fondos de créditos condonables y becas",
"rotulo": "Todos los fondos",
"fuente": "Sapiencia · corte 2023-1",
"descripcion": "Consolidado de beneficiarios de todos los fondos de créditos condonables y becas, con los mapas de beneficiarios históricos y activos.",
"selector": "Ver",
"icono": "account_balance_wallet",
"palabras": null,
"variantes": [
{
"id": "resumen",
"rotulo": "Resumen",
"sub": "Ver",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Fondo",
"rotulo": "Fondo",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Víctimas del conflicto armado",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Victimas conflicto armado",
"agg": "sum",
"flag": true
},
{
"rotulo": "Con discapacidad",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "discapacidad",
"agg": "sum",
"flag": true
},
{
"rotulo": "LGTBIQ+",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "lgtbi",
"agg": "sum",
"flag": true
},
{
"rotulo": "Afrodescendientes",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "TIPO AFROCOLOMBIANO",
"agg": "sum",
"flag": true
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Total de beneficiarios por programa académico",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa"
],
"alto": 380
},
{
"tipo": "tabla",
"titulo": "Total de beneficiarios por IES",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"IES"
],
"alto": 380
},
{
"tipo": "barrasV",
"titulo": "Total de beneficiarios por comuna",
"dim": "Comuna",
"ancho": "dosTercios",
"corte": 12
},
{
"tipo": "anillo",
"titulo": "Total de beneficiarios por sexo",
"dim": "Sexo",
"ancho": "tercio",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "barrasH",
"titulo": "Beneficiarios desvinculados por fondo",
"dim": "Fondo",
"medida": {
"col": "desvinculado",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null,
"flag": true
},
"ancho": "media",
"conParte": false
}
],
"notas": [],
"fuente": null,
"datos": "sa-todos-los-fondos__resumen"
},
{
"id": "historicos",
"rotulo": "Mapa de beneficiarios históricos",
"sub": "Ver",
"filtros": [
{
"col": "Rango de edad",
"rotulo": "Rango de edad",
"modo": null
},
{
"col": "Estrato",
"rotulo": "Estrato",
"modo": null
},
{
"col": "Sexo",
"rotulo": "Sexo",
"modo": null
},
{
"col": "Carácter IES",
"rotulo": "Carácter de la IES",
"modo": null
},
{
"col": "Fondo",
"rotulo": "Fondo",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios históricos en los fondos",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Fuera de Medellín o sin dato",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Fuera de Medellín y Sin Dato",
"agg": "sum",
"flag": true
},
{
"rotulo": "Rango de edad",
"col": "Rango de edad",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Estratos",
"col": "Estrato",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Categorías de sexo",
"col": "Sexo",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Beneficiarios históricos de fondos y becas de Sapiencia por comuna",
"dim": "Comuna Mapa",
"ancho": "dosTercios",
"mapa": "comunas",
"alto": 520
},
{
"tipo": "barrasH",
"titulo": "Beneficiarios históricos por fondo",
"dim": "Fondo",
"ancho": "tercio",
"alto": 520
}
],
"notas": [],
"fuente": null,
"datos": "sa-todos-los-fondos__historicos"
},
{
"id": "activos",
"rotulo": "Mapa de beneficiarios activos",
"sub": "Ver",
"filtros": [
{
"col": "Rango de edad",
"rotulo": "Rango de edad",
"modo": null
},
{
"col": "Estrato",
"rotulo": "Estrato",
"modo": null
},
{
"col": "Sexo",
"rotulo": "Sexo",
"modo": null
},
{
"col": "Carácter IES",
"rotulo": "Carácter de la IES",
"modo": null
},
{
"col": "Fondo",
"rotulo": "Fondo",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios activos en los fondos",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Fuera de Medellín o sin dato",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Fuera de Medellín y Sin Dato",
"agg": "sum",
"flag": true
},
{
"rotulo": "Rango de edad",
"col": "Rango de edad",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Estratos",
"col": "Estrato",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Categorías de sexo",
"col": "Sexo",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Beneficiarios activos de fondos de Sapiencia por comuna",
"dim": "Comuna Mapa",
"ancho": "dosTercios",
"mapa": "comunas",
"alto": 520
},
{
"tipo": "barrasH",
"titulo": "Beneficiarios activos por fondo",
"dim": "Fondo",
"ancho": "tercio",
"alto": 520
}
],
"notas": [],
"fuente": null,
"datos": "sa-todos-los-fondos__activos"
}
]
},
{
"id": "sa-desercion-fondos",
"titulo": "Deserción en los fondos EPM, Presupuesto Participativo y Becas Tecnologías",
"rotulo": "Deserción en los fondos",
"fuente": "Sapiencia · corte 2023-1",
"descripcion": "Deserción acumulada por semestre y tasas de deserción por estrato, sexo y comuna en los tres fondos principales.",
"selector": "Fondo",
"icono": "trending_down",
"palabras": null,
"variantes": [
{
"id": "epm",
"rotulo": "Fondo EPM",
"sub": "Fondo",
"filtros": [
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
}
],
"kpis": [
{
"rotulo": "Desertores",
"formato": "num",
"col": "Desertores EPM",
"agg": "sum"
},
{
"rotulo": "Beneficiarios",
"formato": "num",
"col": "Beneficiarios EPM",
"agg": "sum"
},
{
"rotulo": "Deserción acumulada promedio",
"formato": "pct",
"col": "Deserción acumulada por semestre EPM",
"agg": "avg"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Estrato socieconómico",
"col": "Estrato socieconómico",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "linea",
"titulo": "Deserción promedio acumulada por semestre",
"dim": "Semestre",
"medida": {
"col": "Deserción acumulada por semestre EPM",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"formato": "pct",
"alto": 300
},
{
"tipo": "barrasV",
"titulo": "Tasa de deserción por estrato socioeconómico",
"dim": "Estrato socieconómico",
"medida": {
"col": "Tasa de deserción por estrato",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"formato": "pct"
},
{
"tipo": "anillo",
"titulo": "Tasa de deserción por sexo",
"dim": "Sexo",
"medida": {
"col": "Tasa de deserción por sexo",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"formato": "pct",
"rotuloTotal": "promedio"
},
{
"tipo": "mapa",
"titulo": "Tasa de deserción por comuna de residencia",
"dim": "Comuna",
"medida": {
"col": "Tasa de deserción por comuna de residecia",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"formato": "pct",
"mapa": "comunas",
"alto": 380
}
],
"notas": [
"La hoja de la matriz trae en una misma fila el dato por semestre y, en otras columnas, las tasas por sexo, estrato y comuna; cada gráfico usa las columnas que le corresponden."
],
"fuente": null,
"datos": "sa-desercion-fondos__epm"
},
{
"id": "pp",
"rotulo": "Fondo PP",
"sub": "Fondo",
"filtros": [
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
}
],
"kpis": [
{
"rotulo": "Desertores",
"formato": "num",
"col": "Desertores EPM",
"agg": "sum"
},
{
"rotulo": "Beneficiarios",
"formato": "num",
"col": "Beneficiarios PP",
"agg": "sum"
},
{
"rotulo": "Deserción acumulada promedio",
"formato": "pct",
"col": "Deserción acumulada por semestre PP",
"agg": "avg"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Estrato socieconómico",
"col": "Estrato socieconómico",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "linea",
"titulo": "Deserción promedio acumulada por semestre",
"dim": "Semestre",
"medida": {
"col": "Deserción acumulada por semestre PP",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"formato": "pct",
"alto": 300
},
{
"tipo": "barrasV",
"titulo": "Tasa de deserción por estrato socioeconómico",
"dim": "Estrato socieconómico",
"medida": {
"col": "Tasa de deserción por estrato",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"formato": "pct"
},
{
"tipo": "anillo",
"titulo": "Tasa de deserción por sexo",
"dim": "Sexo",
"medida": {
"col": "Tasa de deserción por sexo",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"formato": "pct",
"rotuloTotal": "promedio"
},
{
"tipo": "mapa",
"titulo": "Tasa de deserción por comuna de residencia",
"dim": "Comuna",
"medida": {
"col": "Tasa de deserción por comuna de residecia",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"formato": "pct",
"mapa": "comunas",
"alto": 380
}
],
"notas": [
"La hoja de la matriz trae en una misma fila el dato por semestre y, en otras columnas, las tasas por sexo, estrato y comuna; cada gráfico usa las columnas que le corresponden."
],
"fuente": null,
"datos": "sa-desercion-fondos__pp"
},
{
"id": "becas",
"rotulo": "Becas Tecnologías",
"sub": "Fondo",
"filtros": [
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
}
],
"kpis": [
{
"rotulo": "Desertores",
"formato": "num",
"col": "Desertores EPM",
"agg": "sum"
},
{
"rotulo": "Beneficiarios",
"formato": "num",
"col": "Beneficiarios EPM",
"agg": "sum"
},
{
"rotulo": "Deserción acumulada promedio",
"formato": "pct",
"col": "Deserción acumulada por semestre EPM",
"agg": "avg"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Estrato socieconómico",
"col": "Estrato socieconómico",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "linea",
"titulo": "Deserción promedio acumulada por semestre",
"dim": "Semestre",
"medida": {
"col": "Deserción acumulada por semestre EPM",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"formato": "pct",
"alto": 300
},
{
"tipo": "barrasV",
"titulo": "Tasa de deserción por estrato socioeconómico",
"dim": "Estrato socieconómico",
"medida": {
"col": "Tasa de deserción por estrato",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"formato": "pct"
},
{
"tipo": "anillo",
"titulo": "Tasa de deserción por sexo",
"dim": "Sexo",
"medida": {
"col": "Tasa de deserción por sexo",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"formato": "pct",
"rotuloTotal": "promedio"
},
{
"tipo": "mapa",
"titulo": "Tasa de deserción por comuna de residencia",
"dim": "Comuna",
"medida": {
"col": "Tasa de deserción por comuna de residecia",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"formato": "pct",
"mapa": "comunas",
"alto": 380
}
],
"notas": [
"La hoja de la matriz trae en una misma fila el dato por semestre y, en otras columnas, las tasas por sexo, estrato y comuna; cada gráfico usa las columnas que le corresponden."
],
"fuente": null,
"datos": "sa-desercion-fondos__becas"
}
]
}
]
},
{
"id": "lineas",
"rotulo": "Líneas de programas de acceso",
"icono": "alt_route",
"vistas": [
{
"id": "sa-lccp-pregrado",
"titulo": "Línea de créditos condonables · pregrado",
"rotulo": "Línea de créditos condonables · pregrado",
"fuente": "Sapiencia · corte 2023-1",
"descripcion": "Personas beneficiarias de la línea de créditos condonables para pregrado: caracterización, información académica, georreferenciación y poblaciones especiales.",
"selector": "Sección",
"icono": "credit_score",
"palabras": null,
"variantes": [
{
"id": "caracterizacion",
"rotulo": "Caracterización",
"sub": "Sección",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Comuna",
"rotulo": "Comuna",
"modo": null
},
{
"col": "Tipo de solicitud",
"rotulo": "Tipo de solicitud",
"modo": null
},
{
"col": "Tipo de recurso",
"rotulo": "Tipo de recurso",
"modo": null
},
{
"col": "Estrato",
"rotulo": "Estrato residencial",
"modo": null
},
{
"col": "Nivel de Formación",
"rotulo": "Nivel de formación",
"modo": null
}
],
"kpis": [
{
"rotulo": "Personas beneficiarias",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Beneficiarias",
"col": "EsMujer",
"agg": "sum",
"flag": true
},
{
"rotulo": "Convocatorias",
"formato": "num",
"col": "Convocatoria",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Comunas y corregimientos",
"col": "Comuna",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "anillo",
"titulo": "Personas beneficiarias por sexo",
"dim": "Sexo",
"ancho": "tercio",
"rotuloTotal": "personas"
},
{
"tipo": "barrasH",
"titulo": "Personas beneficiarias por identidad de género",
"dim": "Identidad de género",
"ancho": "tercio"
},
{
"tipo": "barrasV",
"titulo": "Personas beneficiarias por orientación sexual",
"dim": "Orientación sexual",
"ancho": "tercio"
},
{
"tipo": "anillo",
"titulo": "Personas beneficiarias por rango de edad",
"dim": "Rango de edad",
"ancho": "tercio",
"rotuloTotal": "personas"
},
{
"tipo": "linea",
"titulo": "Personas beneficiarias por convocatoria",
"dim": "Convocatoria",
"ancho": "dosTercios"
}
],
"notas": [
"El dato de identidad de género y el de orientación sexual solo se solicitan a partir de la convocatoria 2023-2."
],
"fuente": null,
"datos": "sa-lccp-pregrado__caracterizacion"
},
{
"id": "academica",
"rotulo": "Información académica",
"sub": "Sección",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Comuna",
"rotulo": "Comuna",
"modo": null
},
{
"col": "Tipo de solicitud",
"rotulo": "Tipo de solicitud",
"modo": null
},
{
"col": "Tipo de recurso",
"rotulo": "Tipo de recurso",
"modo": null
},
{
"col": "Estrato",
"rotulo": "Estrato residencial",
"modo": null
},
{
"col": "Sexo",
"rotulo": "Sexo",
"modo": null
}
],
"kpis": [
{
"rotulo": "Personas beneficiarias",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Personas beneficiarias por IES",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"IES"
],
"alto": 460
},
{
"tipo": "anillo",
"titulo": "Personas beneficiarias por tipo de formación",
"dim": "Nivel de Formación",
"ancho": "tercio",
"rotuloTotal": "personas"
},
{
"tipo": "tabla",
"titulo": "Personas beneficiarias por programa académico",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Programa"
],
"alto": 460
},
{
"tipo": "anillo",
"titulo": "Personas beneficiarias por tipo de IES",
"dim": "Sector",
"ancho": "tercio",
"rotuloTotal": "personas"
}
],
"notas": [],
"fuente": null,
"datos": "sa-lccp-pregrado__academica"
},
{
"id": "georreferenciacion",
"rotulo": "Georreferenciación",
"sub": "Sección",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Tipo de solicitud",
"rotulo": "Tipo de solicitud",
"modo": null
},
{
"col": "Tipo de recurso",
"rotulo": "Tipo de recurso",
"modo": null
},
{
"col": "Programa",
"rotulo": "Programa",
"modo": null
},
{
"col": "Sexo",
"rotulo": "Sexo",
"modo": null
}
],
"kpis": [
{
"rotulo": "Personas beneficiarias",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Comunas y corregimientos",
"formato": "num",
"col": "Comuna Mapa",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Personas beneficiarias por estrato socioeconómico",
"dim": "Estrato",
"ancho": "tercio",
"alto": 520
},
{
"tipo": "barrasH",
"titulo": "Personas beneficiarias por comuna de residencia",
"dim": "Comuna",
"ancho": "tercio",
"alto": 520
},
{
"tipo": "mapa",
"titulo": "Personas beneficiarias por comuna de Medellín",
"dim": "Comuna Mapa",
"ancho": "tercio",
"mapa": "comunas",
"alto": 520
}
],
"notas": [],
"fuente": null,
"datos": "sa-lccp-pregrado__georreferenciacion"
},
{
"id": "poblaciones",
"rotulo": "Poblaciones especiales",
"sub": "Sección",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Tipo de solicitud",
"rotulo": "Tipo de solicitud",
"modo": null
},
{
"col": "Tipo de recurso",
"rotulo": "Tipo de recurso",
"modo": null
},
{
"col": "Sexo",
"rotulo": "Sexo",
"modo": null
},
{
"col": "Estrato",
"rotulo": "Estrato residencial",
"modo": null
}
],
"kpis": [
{
"rotulo": "Víctimas de violencias basadas en género",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Mujer víctima de violencia de género",
"agg": "sum",
"flag": true
},
{
"rotulo": "Víctimas del conflicto",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "VICTIMA DEL CONFLICTO",
"agg": "sum",
"flag": true
},
{
"rotulo": "Con discapacidad",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "DISCAPACIDAD",
"agg": "sum",
"flag": true
},
{
"rotulo": "Reinsertados(as)",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "REINSERTADO",
"agg": "sum",
"flag": true
},
{
"rotulo": "Afrodescendientes",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "AFROCOLOMBIA",
"agg": "sum",
"flag": true
}
],
"visuales": [
{
"tipo": "barrasH",
"titulo": "Personas beneficiarias en poblaciones especiales",
"dim": "Poblacion",
"medida": {
"col": "Marcados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"alto": 300,
"conParte": false
}
],
"notas": [
"Las poblaciones especiales de víctimas de violencias basadas en género, vendedores ambulantes o sus familiares y barristas se caracterizan desde la convocatoria 2023-2."
],
"fuente": null,
"datos": "sa-lccp-pregrado__poblaciones"
}
]
},
{
"id": "sa-lccp-posgrado",
"titulo": "Línea de créditos condonables · posgrado",
"rotulo": "Línea de créditos condonables · posgrado",
"fuente": "Sapiencia · corte 2023-1",
"descripcion": "Personas beneficiarias de la línea de créditos condonables para posgrado: caracterización, información académica, georreferenciación y poblaciones especiales.",
"selector": "Sección",
"icono": "credit_score",
"palabras": null,
"variantes": [
{
"id": "caracterizacion",
"rotulo": "Caracterización",
"sub": "Sección",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Comuna",
"rotulo": "Comuna",
"modo": null
},
{
"col": "Tipo de solicitud",
"rotulo": "Tipo de solicitud",
"modo": null
},
{
"col": "Tipo de recurso",
"rotulo": "Tipo de recurso",
"modo": null
},
{
"col": "Estrato",
"rotulo": "Estrato residencial",
"modo": null
},
{
"col": "Nivel de Formación",
"rotulo": "Nivel de formación",
"modo": null
}
],
"kpis": [
{
"rotulo": "Personas beneficiarias",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Beneficiarias",
"col": "EsMujer",
"agg": "sum",
"flag": true
},
{
"rotulo": "Convocatorias",
"formato": "num",
"col": "Convocatoria",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Comunas y corregimientos",
"col": "Comuna",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "anillo",
"titulo": "Personas beneficiarias por sexo",
"dim": "Sexo",
"ancho": "tercio",
"rotuloTotal": "personas"
},
{
"tipo": "barrasH",
"titulo": "Personas beneficiarias por identidad de género",
"dim": "Identidad de género",
"ancho": "tercio"
},
{
"tipo": "barrasV",
"titulo": "Personas beneficiarias por orientación sexual",
"dim": "Orientación sexual",
"ancho": "tercio"
},
{
"tipo": "tabla",
"titulo": "País de destino de las personas beneficiarias",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"PAIS DESTINO"
],
"alto": 380
},
{
"tipo": "linea",
"titulo": "Personas beneficiarias por convocatoria",
"dim": "Convocatoria",
"ancho": "dosTercios"
}
],
"notas": [
"El dato de identidad de género y el de orientación sexual solo se solicitan a partir de la convocatoria 2023-2."
],
"fuente": null,
"datos": "sa-lccp-posgrado__caracterizacion"
},
{
"id": "academica",
"rotulo": "Información académica",
"sub": "Sección",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Comuna",
"rotulo": "Comuna",
"modo": null
},
{
"col": "Tipo de solicitud",
"rotulo": "Tipo de solicitud",
"modo": null
},
{
"col": "Tipo de recurso",
"rotulo": "Tipo de recurso",
"modo": null
},
{
"col": "Estrato",
"rotulo": "Estrato residencial",
"modo": null
},
{
"col": "Sexo",
"rotulo": "Sexo",
"modo": null
}
],
"kpis": [
{
"rotulo": "Personas beneficiarias",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Personas beneficiarias por IES",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"IES"
],
"alto": 460
},
{
"tipo": "anillo",
"titulo": "Personas beneficiarias por tipo de formación",
"dim": "Nivel de Formación",
"ancho": "tercio",
"rotuloTotal": "personas"
},
{
"tipo": "tabla",
"titulo": "Personas beneficiarias por programa académico",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Programa"
],
"alto": 460
},
{
"tipo": "anillo",
"titulo": "Personas beneficiarias por tipo de IES",
"dim": "Sector",
"ancho": "tercio",
"rotuloTotal": "personas"
}
],
"notas": [],
"fuente": null,
"datos": "sa-lccp-posgrado__academica"
},
{
"id": "georreferenciacion",
"rotulo": "Georreferenciación",
"sub": "Sección",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Tipo de solicitud",
"rotulo": "Tipo de solicitud",
"modo": null
},
{
"col": "Tipo de recurso",
"rotulo": "Tipo de recurso",
"modo": null
},
{
"col": "Programa",
"rotulo": "Programa",
"modo": null
},
{
"col": "Sexo",
"rotulo": "Sexo",
"modo": null
}
],
"kpis": [
{
"rotulo": "Personas beneficiarias",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Comunas y corregimientos",
"formato": "num",
"col": "Comuna Mapa",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Personas beneficiarias por estrato socioeconómico",
"dim": "Estrato",
"ancho": "tercio",
"alto": 520
},
{
"tipo": "barrasH",
"titulo": "Personas beneficiarias por comuna de residencia",
"dim": "Comuna",
"ancho": "tercio",
"alto": 520
},
{
"tipo": "mapa",
"titulo": "Personas beneficiarias por comuna de Medellín",
"dim": "Comuna Mapa",
"ancho": "tercio",
"mapa": "comunas",
"alto": 520
}
],
"notas": [],
"fuente": null,
"datos": "sa-lccp-posgrado__georreferenciacion"
},
{
"id": "poblaciones",
"rotulo": "Poblaciones especiales",
"sub": "Sección",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
},
{
"col": "Tipo de solicitud",
"rotulo": "Tipo de solicitud",
"modo": null
},
{
"col": "Tipo de recurso",
"rotulo": "Tipo de recurso",
"modo": null
},
{
"col": "Sexo",
"rotulo": "Sexo",
"modo": null
},
{
"col": "Estrato",
"rotulo": "Estrato residencial",
"modo": null
}
],
"kpis": [
{
"rotulo": "Víctimas del conflicto",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "VÍCTIMA CONFLICTO",
"agg": "sum",
"flag": true
},
{
"rotulo": "Indígenas",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Indigena",
"agg": "sum",
"flag": true
},
{
"rotulo": "Con discapacidad",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "DISCAPACIDAD",
"agg": "sum",
"flag": true
},
{
"rotulo": "Víctimas de violencias basadas en género",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Víctima de violencias basadas en género",
"agg": "sum",
"flag": true
},
{
"rotulo": "Afrodescendientes",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "POBLACIÓN AFROCOLOMBIANA INDIGENA",
"agg": "sum",
"flag": true
}
],
"visuales": [
{
"tipo": "barrasH",
"titulo": "Personas beneficiarias en poblaciones especiales",
"dim": "Poblacion",
"medida": {
"col": "Marcados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"alto": 300,
"conParte": false
}
],
"notas": [
"Las poblaciones especiales de víctimas de violencias basadas en género, vendedores ambulantes o sus familiares y barristas se caracterizan desde la convocatoria 2023-2."
],
"fuente": null,
"datos": "sa-lccp-posgrado__poblaciones"
}
]
},
{
"id": "sa-matricula-cero",
"titulo": "Matrícula Cero",
"rotulo": "Matrícula Cero",
"fuente": "Sapiencia · IES del municipio",
"descripcion": "Beneficiarios de la política de Matrícula Cero: registros por semestre, personas únicas y beneficiarios por año, con perfil socioeconómico, territorial y académico.",
"selector": "Forma de conteo y sección",
"icono": "money_off",
"palabras": "gratuidad matrícula cero",
"variantes": [
{
"id": "registros-perfil",
"rotulo": "Registros por semestre · perfil",
"sub": "Registros por semestre",
"filtros": [
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios",
"formato": "num",
"agg": "count"
},
{
"rotulo": "LGTBIQ+",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Pertenece a comunidad LGTBIQ+",
"agg": "sum",
"flag": true
},
{
"rotulo": "Comunidades étnicas",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Pertenece a comunidades etnicas",
"agg": "sum",
"flag": true
},
{
"rotulo": "Con discapacidad",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Pertenece a población en situación de discapacidad",
"agg": "sum",
"flag": true
},
{
"rotulo": "Víctimas del conflicto armado",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Pertenece a Víctimas del conflicto armado",
"agg": "sum",
"flag": true
}
],
"visuales": [
{
"tipo": "anillo",
"titulo": "Beneficiarios por semestre",
"dim": "Semestre",
"ancho": "media",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "barrasV",
"titulo": "Beneficiarios por estrato y semestre",
"dim": "Estrato",
"dim2": "Semestre",
"ancho": "media"
},
{
"tipo": "mapa",
"titulo": "Beneficiarios por comuna",
"dim": "Comuna Mapa",
"ancho": "media",
"mapa": "comunas",
"alto": 460
},
{
"tipo": "barrasV",
"titulo": "Beneficiarios por sexo y semestre",
"dim": "Semestre",
"dim2": "Sexo",
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por sexo (total)",
"dim": "Sexo",
"ancho": "media",
"rotuloTotal": "beneficiarios"
}
],
"notas": [],
"fuente": null,
"datos": "sa-matricula-cero__registros-perfil"
},
{
"id": "registros-academica",
"rotulo": "Registros por semestre · académica",
"sub": "Registros por semestre",
"filtros": [
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Nivel de formación:",
"col": "Nivel de formación:",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasH",
"titulo": "Beneficiarios por nivel de formación",
"dim": "Nivel de formación:",
"ancho": "media"
},
{
"tipo": "tabla",
"titulo": "Beneficiarios por programa académico",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"IES"
],
"alto": 460
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por metodología",
"dim": "Metodología",
"ancho": "media",
"rotuloTotal": "beneficiarios"
}
],
"notas": [],
"fuente": null,
"datos": "sa-matricula-cero__registros-academica"
},
{
"id": "unicos-perfil",
"rotulo": "Personas únicas · perfil",
"sub": "Personas únicas",
"filtros": [
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios",
"formato": "num",
"agg": "count"
},
{
"rotulo": "LGTBIQ+",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Pertenece a comunidad LGTBIQ+",
"agg": "sum",
"flag": true
},
{
"rotulo": "Comunidades étnicas",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Pertenece a comunidades etnicas",
"agg": "sum",
"flag": true
},
{
"rotulo": "Con discapacidad",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Pertenece a población en situación de discapacidad",
"agg": "sum",
"flag": true
},
{
"rotulo": "Víctimas del conflicto armado",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Pertenece a Víctimas del conflicto armado",
"agg": "sum",
"flag": true
}
],
"visuales": [
{
"tipo": "anillo",
"titulo": "Beneficiarios por semestre",
"dim": "Semestre",
"ancho": "media",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "barrasV",
"titulo": "Beneficiarios por estrato y semestre",
"dim": "Estrato",
"dim2": "Semestre",
"ancho": "media"
},
{
"tipo": "mapa",
"titulo": "Beneficiarios por comuna",
"dim": "Comuna Mapa",
"ancho": "media",
"mapa": "comunas",
"alto": 460
},
{
"tipo": "barrasV",
"titulo": "Beneficiarios por sexo y semestre",
"dim": "Semestre",
"dim2": "Sexo",
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por sexo (total)",
"dim": "Sexo",
"ancho": "media",
"rotuloTotal": "beneficiarios"
}
],
"notas": [],
"fuente": null,
"datos": "sa-matricula-cero__unicos-perfil"
},
{
"id": "unicos-academica",
"rotulo": "Personas únicas · académica",
"sub": "Personas únicas",
"filtros": [
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Semestres",
"col": "Semestre",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Nivel de formación:",
"col": "Nivel de formación:",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasH",
"titulo": "Beneficiarios por nivel de formación",
"dim": "Nivel de formación:",
"ancho": "media"
},
{
"tipo": "tabla",
"titulo": "Beneficiarios por programa académico",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"IES"
],
"alto": 460
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por metodología",
"dim": "Metodología",
"ancho": "media",
"rotuloTotal": "beneficiarios"
}
],
"notas": [],
"fuente": null,
"datos": "sa-matricula-cero__unicos-academica"
},
{
"id": "anual-perfil",
"rotulo": "Beneficiarios por año · perfil",
"sub": "Beneficiarios por año",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios",
"formato": "num",
"agg": "count"
},
{
"rotulo": "LGTBIQ+",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Pertenece a comunidad LGTBIQ+",
"agg": "sum",
"flag": true
},
{
"rotulo": "Comunidades étnicas",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Pertenece a comunidades etnicas",
"agg": "sum",
"flag": true
},
{
"rotulo": "Con discapacidad",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Pertenece a población en situación de discapacidad",
"agg": "sum",
"flag": true
},
{
"rotulo": "Víctimas del conflicto armado",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Pertenece a Víctimas del conflicto armado",
"agg": "sum",
"flag": true
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Beneficiarios por año",
"dim": "Año",
"ancho": "media",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "barrasV",
"titulo": "Beneficiarios por estrato y año",
"dim": "Estrato",
"dim2": "Año",
"ancho": "media"
},
{
"tipo": "mapa",
"titulo": "Beneficiarios por comuna",
"dim": "Comuna Mapa",
"ancho": "media",
"mapa": "comunas",
"alto": 460
},
{
"tipo": "barrasV",
"titulo": "Beneficiarios por sexo y año",
"dim": "Año",
"dim2": "Sexo",
"ancho": "media"
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por sexo (total)",
"dim": "Sexo",
"ancho": "media",
"rotuloTotal": "beneficiarios"
}
],
"notas": [],
"fuente": null,
"datos": "sa-matricula-cero__anual-perfil"
},
{
"id": "anual-academica",
"rotulo": "Beneficiarios por año · académica",
"sub": "Beneficiarios por año",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Nivel de formación:",
"col": "Nivel de formación:",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasH",
"titulo": "Beneficiarios por nivel de formación",
"dim": "Nivel de formación:",
"ancho": "media"
},
{
"tipo": "tabla",
"titulo": "Beneficiarios por programa académico",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"IES"
],
"alto": 460
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por metodología",
"dim": "Metodología",
"ancho": "media",
"rotuloTotal": "beneficiarios"
}
],
"notas": [],
"fuente": null,
"datos": "sa-matricula-cero__anual-academica"
}
]
}
]
},
{
"id": "otros",
"rotulo": "Otros programas",
"icono": "apps",
"vistas": [
{
"id": "sa-arroba-medellin",
"titulo": "@Medellín",
"rotulo": "@Medellín",
"fuente": "Sapiencia · @Medellín",
"descripcion": "Personas certificadas y matriculadas en los cursos de formación continua y bilingüismo de la plataforma @Medellín.",
"selector": "Ver",
"icono": "language",
"palabras": null,
"variantes": [
{
"id": "certificados",
"rotulo": "Personas certificadas",
"sub": "Ver",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Personas certificadas",
"formato": "num",
"col": "Personas certificadas",
"agg": "sum"
},
{
"rotulo": "Cursos",
"formato": "num",
"col": "Curso",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
},
{
"rotulo": "Visualizaciones",
"agg": "constante",
"valor": 3,
"formato": "num",
"pie": "En esta vista"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Cursos ofertados por año",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Curso",
"Año"
],
"alto": 460
},
{
"tipo": "anillo",
"titulo": "Personas certificadas por año",
"dim": "Año",
"medida": {
"col": "Personas certificadas",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"rotuloTotal": "certificadas"
},
{
"tipo": "tabla",
"titulo": "Certificados por curso",
"medida": {
"col": "Personas certificadas",
"agg": "sum",
"rotulo": "Personas certificadas",
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Curso"
],
"alto": 460
}
],
"notas": [],
"fuente": null,
"datos": "sa-arroba-medellin__certificados"
},
{
"id": "matriculados",
"rotulo": "Matriculados en formación continua",
"sub": "Ver",
"filtros": [
{
"col": "Año",
"rotulo": "Convocatoria",
"modo": null
}
],
"kpis": [
{
"rotulo": "Matriculados",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Certificados",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "EsCertificado",
"agg": "sum",
"flag": true
},
{
"rotulo": "Cursos",
"formato": "num",
"col": "Curso",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Estado final",
"col": "Estado final",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Matriculados por curso",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Curso",
"Estado final"
],
"alto": 480
},
{
"tipo": "mapa",
"titulo": "Matriculados por comuna",
"dim": "Comuna Mapa",
"ancho": "tercio",
"mapa": "comunas",
"alto": 480
},
{
"tipo": "anillo",
"titulo": "Matriculados por sexo",
"dim": "Sexo",
"ancho": "tercio",
"rotuloTotal": "matriculados"
},
{
"tipo": "barrasV",
"titulo": "Matriculados por rango de edad",
"dim": "Rango de edad",
"ancho": "tercio"
},
{
"tipo": "barrasH",
"titulo": "Matriculados por comuna",
"dim": "Comuna",
"ancho": "dosTercios"
}
],
"notas": [],
"fuente": null,
"datos": "sa-arroba-medellin__matriculados"
}
]
},
{
"id": "sa-bilinguismo",
"titulo": "Estrategia de bilingüismo",
"rotulo": "Bilingüismo",
"fuente": "Sapiencia · corte 2023",
"descripcion": "Beneficiarios de los programas de formación en idioma extranjero de Sapiencia.",
"selector": null,
"icono": "translate",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Beneficiarios",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Beneficiarias",
"col": "EsMujer",
"agg": "sum",
"flag": true
},
{
"rotulo": "Certificados",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Certificado",
"agg": "sum",
"flag": true
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Categorías de sexo",
"col": "Sexo",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "anillo",
"titulo": "Beneficiarios por sexo",
"dim": "Sexo",
"ancho": "tercio",
"rotuloTotal": "beneficiarios"
},
{
"tipo": "barrasV",
"titulo": "Beneficiarios por comuna",
"dim": "Comuna",
"ancho": "dosTercios",
"corte": 12
},
{
"tipo": "barrasH",
"titulo": "Beneficiarios por estrato socioeconómico",
"dim": "Estrato",
"ancho": "tercio"
},
{
"tipo": "tabla",
"titulo": "Beneficiarios por IES",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"IES"
],
"alto": 380
},
{
"tipo": "anillo",
"titulo": "Beneficiarios por programa de idioma extranjero",
"dim": "Programa",
"ancho": "tercio",
"rotuloTotal": "beneficiarios"
}
],
"notas": [],
"fuente": null,
"datos": "sa-bilinguismo__unica"
}
]
},
{
"id": "sa-feria-siguiente-nivel",
"titulo": "Feria Siguiente Nivel",
"rotulo": "Feria Siguiente Nivel",
"fuente": "Sapiencia · Feria Siguiente Nivel",
"descripcion": "Estudiantes de educación media que participaron en la Feria Siguiente Nivel, por año, sexo y carácter de su institución.",
"selector": null,
"icono": "festival",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Participantes",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Instituciones educativas",
"formato": "num",
"col": "Institución Educativa",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Categorías de sexo",
"col": "Sexo",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Carácter de la institución Educativa",
"col": "Carácter de la institución Educativa",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Participantes de la feria por año",
"dim": "Año",
"ancho": "media",
"alto": 460
},
{
"tipo": "anillo",
"titulo": "Participantes por sexo",
"dim": "Sexo",
"ancho": "media",
"alto": 220,
"rotuloTotal": "participantes"
},
{
"tipo": "anillo",
"titulo": "Participantes por carácter de la institución educativa",
"dim": "Carácter de la institución Educativa",
"ancho": "media",
"alto": 220,
"rotuloTotal": "participantes"
}
],
"notas": [],
"fuente": null,
"datos": "sa-feria-siguiente-nivel__unica"
}
]
},
{
"id": "sa-talento-especializado",
"titulo": "Talento Especializado",
"rotulo": "Talento Especializado",
"fuente": "Sapiencia · Talento Especializado",
"descripcion": "Inscritos, matriculados y certificados en las rutas de formación de Talento Especializado, por sexo, ruta, comuna, estrato y nivel académico.",
"selector": "Etapa del proceso",
"icono": "memory",
"palabras": null,
"variantes": [
{
"id": "inscritos",
"rotulo": "Inscritos",
"sub": "Etapa",
"filtros": [
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
}
],
"kpis": [
{
"rotulo": "Inscritos",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "EsMujer",
"agg": "sum",
"flag": true
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Categorías de sexo",
"col": "Sexo",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Ruta",
"col": "Ruta",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "anillo",
"titulo": "Inscritos por sexo",
"dim": "Sexo",
"ancho": "tercio",
"rotuloTotal": "personas"
},
{
"tipo": "tabla",
"titulo": "Inscritos por curso o ruta",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Ruta"
],
"alto": 480
},
{
"tipo": "mapa",
"titulo": "Inscritos por comuna",
"dim": "Comuna Mapa",
"ancho": "tercio",
"mapa": "comunas",
"alto": 480
},
{
"tipo": "barrasH",
"titulo": "Inscritos por estrato",
"dim": "Estrato",
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Inscritos por último nivel académico aprobado",
"dim": "maximoNivel",
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "sa-talento-especializado__inscritos"
},
{
"id": "matriculados",
"rotulo": "Matriculados",
"sub": "Etapa",
"filtros": [
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
}
],
"kpis": [
{
"rotulo": "Matriculados",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "EsMujer",
"agg": "sum",
"flag": true
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Categorías de sexo",
"col": "Sexo",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Ruta",
"col": "Ruta",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "anillo",
"titulo": "Matriculados por sexo",
"dim": "Sexo",
"ancho": "tercio",
"rotuloTotal": "personas"
},
{
"tipo": "tabla",
"titulo": "Matriculados por curso o ruta",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Ruta"
],
"alto": 480
},
{
"tipo": "mapa",
"titulo": "Matriculados por comuna",
"dim": "Comuna Mapa",
"ancho": "tercio",
"mapa": "comunas",
"alto": 480
},
{
"tipo": "barrasH",
"titulo": "Matriculados por estrato",
"dim": "Estrato",
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Matriculados por último nivel académico aprobado",
"dim": "maximoNivel",
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "sa-talento-especializado__matriculados"
},
{
"id": "certificados",
"rotulo": "Certificados",
"sub": "Etapa",
"filtros": [
{
"col": "Convocatoria",
"rotulo": "Convocatoria",
"modo": null
}
],
"kpis": [
{
"rotulo": "Certificados",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "EsMujer",
"agg": "sum",
"flag": true
},
{
"rotulo": "Convocatorias",
"col": "Convocatoria",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Categorías de sexo",
"col": "Sexo",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Ruta",
"col": "Ruta",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "anillo",
"titulo": "Certificados por sexo",
"dim": "Sexo",
"ancho": "tercio",
"rotuloTotal": "personas"
},
{
"tipo": "tabla",
"titulo": "Certificados por curso o ruta",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Ruta"
],
"alto": 480
},
{
"tipo": "mapa",
"titulo": "Certificados por comuna",
"dim": "Comuna Mapa",
"ancho": "tercio",
"mapa": "comunas",
"alto": 480
},
{
"tipo": "barrasH",
"titulo": "Certificados por estrato",
"dim": "Estrato",
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Certificados por último nivel académico aprobado",
"dim": "maximoNivel",
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "sa-talento-especializado__certificados"
}
]
},
{
"id": "sa-computadores-futuro",
"titulo": "Computadores Futuro (Chromebook)",
"rotulo": "Computadores Futuro",
"fuente": "Sapiencia",
"descripcion": "Computadores entregados a estudiantes de las IES del municipio por vigencia.",
"selector": null,
"icono": "laptop_chromebook",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Vigencia",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
}
],
"kpis": [
{
"rotulo": "Computadores entregados",
"formato": "num",
"col": "Computadores entregados",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"formato": "num",
"col": "IES",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
},
{
"rotulo": "Visualizaciones",
"agg": "constante",
"valor": 2,
"formato": "num",
"pie": "En esta vista"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Computadores entregados por IES y vigencia",
"medida": {
"col": "Computadores entregados",
"agg": "sum",
"rotulo": "Computadores",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"IES",
"Año"
],
"alto": 420
},
{
"tipo": "anillo",
"titulo": "Computadores entregados por IES",
"dim": "IES",
"medida": {
"col": "Computadores entregados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"rotuloTotal": "computadores"
}
],
"notas": [],
"fuente": null,
"datos": "sa-computadores-futuro__unica"
}
]
}
]
},
{
"id": "cartera",
"rotulo": "Gestión de cartera",
"icono": "request_quote",
"vistas": [
{
"id": "sa-gestion-cartera",
"titulo": "Gestión de cartera: beneficiarios que pasaron a cobro",
"rotulo": "Gestión de cartera",
"fuente": "Sapiencia · diciembre de 2020",
"descripcion": "Obligaciones de créditos que pasaron a cobro: comuna, situación educativa y laboral, y reestructuraciones.",
"selector": null,
"icono": "request_quote",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Fondo",
"rotulo": "Fondo",
"modo": null
},
{
"col": "Estado Obligacion",
"rotulo": "Estado de la obligación",
"modo": null
}
],
"kpis": [
{
"rotulo": "Obligaciones en cobro",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Con reestructuración del crédito",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "Ha realizado restructuración del crédito (marcados)",
"agg": "sum",
"flag": true
},
{
"rotulo": "Reestructuraciones realizadas",
"formato": "num",
"pie": "Suma de reestructuraciones",
"col": "ReestructuracionesN",
"agg": "sum"
},
{
"rotulo": "Fondos",
"col": "Fondo",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Estado Obligacion",
"col": "Estado Obligacion",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasH",
"titulo": "Beneficiarios en cobro por comuna",
"dim": "Comuna",
"ancho": "tercio",
"alto": 480
},
{
"tipo": "mapa",
"titulo": "Beneficiarios en cobro por comuna",
"dim": "Comuna",
"ancho": "tercio",
"mapa": "comunas",
"alto": 480
},
{
"tipo": "barrasV",
"titulo": "Situación en educación superior de las personas en cobro",
"dim": "Situación educ. superior beneficiario",
"ancho": "tercio",
"alto": 480,
"corte": 16
},
{
"tipo": "anillo",
"titulo": "Situación laboral de las personas en cobro",
"dim": "Situación economica del beneficiario",
"ancho": "tercio",
"rotuloTotal": "personas"
},
{
"tipo": "barrasH",
"titulo": "Personas que han reestructurado el crédito",
"dim": "Ha realizado restructuración del crédito",
"ancho": "tercio"
},
{
"tipo": "arbol",
"titulo": "Número de reestructuraciones realizadas",
"dim": "Reestructuracion",
"ancho": "tercio"
}
],
"notas": [],
"fuente": null,
"datos": "sa-gestion-cartera__unica"
}
]
}
]
}
]
},
{
"id": "tres-ies",
"rotulo": "3 IES del municipio",
"icono": "account_balance",
"familia": "info",
"descripcion": "Indicadores del Instituto Tecnológico Metropolitano, la Institución Universitaria Colegio Mayor de Antioquia y la Institución Universitaria Pascual Bravo.",
"temas": [
{
"id": "demanda",
"rotulo": "Demanda y matrícula",
"icono": "groups",
"vistas": [
{
"id": "tres-inscritos",
"titulo": "Inscritos en las 3 IES",
"rotulo": "Inscritos en las 3 IES",
"fuente": "3 IES del municipio · corte 2023-1",
"descripcion": "Inscritos en las tres IES del municipio, por programa, sexo, nivel académico, metodología y año.",
"selector": null,
"icono": "groups",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Área de Conocimiento",
"rotulo": "Área de conocimiento",
"modo": null
},
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "Programa Acreditado",
"rotulo": "Programa Acreditado",
"modo": null
}
],
"kpis": [
{
"rotulo": "Inscritos",
"formato": "num",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Inscritos con sexo mujer",
"col": "ValorMujer",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Áreas de conocimiento",
"col": "Área de Conocimiento",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Inscritos por programa académico y año",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": "Inscritos",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"IES",
"Año"
],
"alto": 460
},
{
"tipo": "barrasV",
"titulo": "Inscritos por sexo",
"dim": "Sexo",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio"
},
{
"tipo": "barrasV",
"titulo": "Inscritos en las IES",
"dim": "IES",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio"
},
{
"tipo": "barrasAgrupadas",
"titulo": "Inscritos por nivel académico y sexo",
"dim": "Nivel Académico",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Sexo",
"ancho": "tercio"
},
{
"tipo": "barrasH",
"titulo": "Inscritos por metodología",
"dim": "Metodología",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "linea",
"titulo": "Inscritos por año",
"dim": "Año",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "IES",
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "tres-inscritos__unica"
}
]
},
{
"id": "tres-admitidos",
"titulo": "Admitidos en las 3 IES",
"rotulo": "Admitidos en las 3 IES",
"fuente": "3 IES del municipio · corte 2023-1",
"descripcion": "Admitidos en las tres IES del municipio, por programa, sexo, nivel académico, metodología y año.",
"selector": null,
"icono": "groups",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Área de Conocimiento",
"rotulo": "Área de conocimiento",
"modo": null
},
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "Programa Acreditado",
"rotulo": "Programa Acreditado",
"modo": null
}
],
"kpis": [
{
"rotulo": "Admitidos",
"formato": "num",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Admitidos con sexo mujer",
"col": "ValorMujer",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Áreas de conocimiento",
"col": "Área de Conocimiento",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Admitidos por programa académico y año",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": "Admitidos",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"IES",
"Año"
],
"alto": 460
},
{
"tipo": "barrasV",
"titulo": "Admitidos por sexo",
"dim": "Sexo",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio"
},
{
"tipo": "barrasV",
"titulo": "Admitidos en las IES",
"dim": "IES",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio"
},
{
"tipo": "barrasAgrupadas",
"titulo": "Admitidos por nivel académico y sexo",
"dim": "Nivel Académico",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Sexo",
"ancho": "tercio"
},
{
"tipo": "barrasH",
"titulo": "Admitidos por metodología",
"dim": "Metodología",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "linea",
"titulo": "Admitidos por año",
"dim": "Año",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "IES",
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "tres-admitidos__unica"
}
]
},
{
"id": "tres-matriculados-nuevos",
"titulo": "Matriculados nuevos en las 3 IES",
"rotulo": "Matriculados nuevos en las 3 IES",
"fuente": "3 IES del municipio · corte 2023-1",
"descripcion": "Matriculados nuevos en las tres IES del municipio, por programa, sexo, nivel académico, metodología y año.",
"selector": null,
"icono": "groups",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Área de Conocimiento",
"rotulo": "Área de conocimiento",
"modo": null
},
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "Programa Acreditado",
"rotulo": "Programa Acreditado",
"modo": null
}
],
"kpis": [
{
"rotulo": "Matriculados nuevos",
"formato": "num",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Matriculados nuevos con sexo mujer",
"col": "ValorMujer",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Áreas de conocimiento",
"col": "Área de Conocimiento",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Matriculados nuevos por programa académico y año",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": "Matriculados nuevos",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"IES",
"Año"
],
"alto": 460
},
{
"tipo": "barrasV",
"titulo": "Matriculados nuevos por sexo",
"dim": "Sexo",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio"
},
{
"tipo": "barrasV",
"titulo": "Matriculados nuevos en las IES",
"dim": "IES",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio"
},
{
"tipo": "barrasAgrupadas",
"titulo": "Matriculados nuevos por nivel académico y sexo",
"dim": "Nivel Académico",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Sexo",
"ancho": "tercio"
},
{
"tipo": "barrasH",
"titulo": "Matriculados nuevos por metodología",
"dim": "Metodología",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "linea",
"titulo": "Matriculados nuevos por año",
"dim": "Año",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "IES",
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "tres-matriculados-nuevos__unica"
}
]
},
{
"id": "tres-matriculados",
"titulo": "Matriculados en las 3 IES",
"rotulo": "Matriculados en las 3 IES",
"fuente": "3 IES del municipio · corte 2023-1",
"descripcion": "Matriculados en las tres IES del municipio, por programa, sexo, nivel académico, metodología y año.",
"selector": null,
"icono": "groups",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Área de Conocimiento",
"rotulo": "Área de conocimiento",
"modo": null
},
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "Programa Acreditado",
"rotulo": "Programa Acreditado",
"modo": null
}
],
"kpis": [
{
"rotulo": "Matriculados",
"formato": "num",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Programas",
"formato": "num",
"col": "Programa",
"agg": "distinct"
},
{
"rotulo": "Mujeres",
"formato": "num",
"pie": "Matriculados con sexo mujer",
"col": "ValorMujer",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Áreas de conocimiento",
"col": "Área de Conocimiento",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Matriculados por programa académico y año",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": "Matriculados",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"IES",
"Año"
],
"alto": 460
},
{
"tipo": "barrasV",
"titulo": "Matriculados por sexo",
"dim": "Sexo",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio"
},
{
"tipo": "barrasV",
"titulo": "Matriculados en las IES",
"dim": "IES",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio"
},
{
"tipo": "barrasAgrupadas",
"titulo": "Matriculados por nivel académico y sexo",
"dim": "Nivel Académico",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Sexo",
"ancho": "tercio"
},
{
"tipo": "barrasH",
"titulo": "Matriculados por metodología",
"dim": "Metodología",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "linea",
"titulo": "Matriculados por año",
"dim": "Año",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "IES",
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "tres-matriculados__unica"
}
]
},
{
"id": "tres-foraneos",
"titulo": "Estudiantes foráneos matriculados en las 3 IES",
"rotulo": "Estudiantes foráneos matriculados",
"fuente": "3 IES del municipio · corte 2023-1",
"descripcion": "Inscritos, admitidos, matriculados nuevos y matriculados con residencia fuera de Medellín, por institución y período.",
"selector": null,
"icono": "luggage",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Período",
"rotulo": "Período",
"modo": null
}
],
"kpis": [
{
"rotulo": "Foráneos matriculados (suma de períodos)",
"formato": "num",
"col": "ValorMatriculados",
"agg": "sum"
},
{
"rotulo": "Períodos",
"formato": "num",
"col": "Período",
"agg": "distinct"
},
{
"rotulo": "Indicadores",
"col": "Indicador",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
},
{
"rotulo": "Visualizaciones",
"agg": "constante",
"valor": 3,
"formato": "num",
"pie": "En esta vista"
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Demanda y matrícula de foráneos · ITM",
"dim": "Período",
"medida": {
"col": "ValorITM",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Indicador",
"ancho": "completa",
"alto": 260
},
{
"tipo": "barrasV",
"titulo": "Demanda y matrícula de foráneos · Colegio Mayor de Antioquia",
"dim": "Período",
"medida": {
"col": "ValorCM",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Indicador",
"ancho": "completa",
"alto": 260
},
{
"tipo": "barrasV",
"titulo": "Demanda y matrícula de foráneos · Pascual Bravo",
"dim": "Período",
"medida": {
"col": "ValorPB",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Indicador",
"ancho": "completa",
"alto": 260
}
],
"notas": [
"Foráneos: estudiantes con residencia fuera de Medellín."
],
"fuente": null,
"datos": "tres-foraneos__unica"
}
]
},
{
"id": "tres-programas",
"titulo": "Programas académicos de las 3 IES",
"rotulo": "Programas académicos de las 3 IES",
"fuente": "3 IES del municipio · corte 2023-1",
"descripcion": "Oferta académica del ITM, el Colegio Mayor de Antioquia y la Institución Universitaria Pascual Bravo.",
"selector": "Ver",
"icono": "menu_book",
"palabras": null,
"variantes": [
{
"id": "general",
"rotulo": "Programas por institución",
"sub": "Ver",
"filtros": [
{
"col": "Acreditado",
"rotulo": "Acreditado",
"modo": null
},
{
"col": "Área de Conocimiento",
"rotulo": "Área del conocimiento",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Nivel de Formación",
"rotulo": "Nivel de Formación",
"modo": null
},
{
"col": "Metodología",
"rotulo": "Metodología",
"modo": null
},
{
"col": "Estado",
"rotulo": "Estado",
"modo": null
}
],
"kpis": [
{
"rotulo": "Programas",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Programas acreditados",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "EsAcreditado",
"agg": "sum",
"flag": true
},
{
"rotulo": "Programas activos",
"formato": "num",
"pie": "Personas con la condición marcada",
"col": "EsActivo",
"agg": "sum",
"flag": true
},
{
"rotulo": "Acreditado",
"col": "Acreditado",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Áreas de conocimiento",
"col": "Área de Conocimiento",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Programas por nivel de formación e institución",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Nivel de Formación",
"IES"
],
"alto": 420
},
{
"tipo": "tabla",
"titulo": "Programas académicos por IES",
"medida": {
"col": null,
"agg": "count",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Programa",
"IES",
"Nivel de Formación"
],
"alto": 420
}
],
"notas": [],
"fuente": null,
"datos": "tres-programas__general"
},
{
"id": "niveles",
"rotulo": "Niveles por institución",
"sub": "Ver",
"filtros": [
{
"col": "Acreditado",
"rotulo": "Acreditado",
"modo": null
},
{
"col": "Área de Conocimiento",
"rotulo": "Área del conocimiento",
"modo": null
},
{
"col": "Nivel de Formación",
"rotulo": "Nivel de Formación",
"modo": null
},
{
"col": "Metodología",
"rotulo": "Metodología",
"modo": null
},
{
"col": "Estado",
"rotulo": "Estado",
"modo": null
}
],
"kpis": [
{
"rotulo": "Programas · Colegio Mayor",
"formato": "num",
"col": "Colegio Mayor",
"agg": "sum"
},
{
"rotulo": "Programas · Pascual Bravo",
"formato": "num",
"col": "Pascual Bravo",
"agg": "sum"
},
{
"rotulo": "Programas · ITM",
"formato": "num",
"col": "Itm",
"agg": "sum"
},
{
"rotulo": "Acreditado",
"col": "Acreditado",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Áreas de conocimiento",
"col": "Área de Conocimiento",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "anillo",
"titulo": "Niveles de formación · Colegio Mayor",
"dim": "Nivel de Formación",
"medida": {
"col": "Colegio Mayor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"alto": 300,
"rotuloTotal": "programas"
},
{
"tipo": "barrasV",
"titulo": "Niveles académicos · Colegio Mayor",
"dim": "Nivel Académico",
"medida": {
"col": "Colegio Mayor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"alto": 300
},
{
"tipo": "anillo",
"titulo": "Niveles de formación · Pascual Bravo",
"dim": "Nivel de Formación",
"medida": {
"col": "Pascual Bravo",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"alto": 300,
"rotuloTotal": "programas"
},
{
"tipo": "barrasV",
"titulo": "Niveles académicos · Pascual Bravo",
"dim": "Nivel Académico",
"medida": {
"col": "Pascual Bravo",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"alto": 300
},
{
"tipo": "anillo",
"titulo": "Niveles de formación · ITM",
"dim": "Nivel de Formación",
"medida": {
"col": "Itm",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"alto": 300,
"rotuloTotal": "programas"
},
{
"tipo": "barrasV",
"titulo": "Niveles académicos · ITM",
"dim": "Nivel Académico",
"medida": {
"col": "Itm",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"alto": 300
}
],
"notas": [],
"fuente": null,
"datos": "tres-programas__niveles"
}
]
},
{
"id": "tres-desercion",
"titulo": "Deserción por período en las 3 IES",
"rotulo": "Deserción por período en las 3 IES",
"fuente": "3 IES del municipio · corte 2023-1",
"descripcion": "Tasas de deserción y retención por período en cada una de las tres IES del municipio.",
"selector": null,
"icono": "trending_down",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Período",
"rotulo": "Período",
"modo": null
}
],
"kpis": [
{
"rotulo": "Tasa de deserción promedio",
"formato": "pct",
"col": "Tasa de deserción por periodo",
"agg": "avg"
},
{
"rotulo": "Tasa de retención promedio",
"formato": "pct",
"col": "Tasa de retención por periodo",
"agg": "avg"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Períodos",
"col": "Período",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
}
],
"visuales": [
{
"tipo": "linea",
"titulo": "Tasa de deserción por período e institución",
"dim": "Período",
"medida": {
"col": "Tasa de deserción por periodo",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "IES",
"ancho": "completa",
"formato": "pct",
"alto": 320
},
{
"tipo": "barrasV",
"titulo": "Tasa de deserción promedio por IES",
"dim": "IES",
"medida": {
"col": "Tasa de deserción por periodo",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
},
{
"tipo": "barrasH",
"titulo": "Tasa de retención promedio por IES",
"dim": "IES",
"medida": {
"col": "Tasa de retención por periodo",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct",
"conParte": false
}
],
"notas": [],
"fuente": null,
"datos": "tres-desercion__unica"
}
]
},
{
"id": "tres-movilidad",
"titulo": "Movilidad académica nacional e internacional de las 3 IES",
"rotulo": "Movilidades nacionales e internacionales",
"fuente": "3 IES del municipio · corte 2023-1",
"descripcion": "Movilidad entrante y saliente de estudiantes de pregrado y posgrado y de docentes, por departamento o país.",
"selector": "Movilidad",
"icono": "connecting_airports",
"palabras": null,
"variantes": [
{
"id": "nacional",
"rotulo": "Nacional",
"sub": "Movilidad",
"filtros": [
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Región(Departamento Dentro De Colombia)",
"rotulo": "Departamento",
"modo": null
}
],
"kpis": [
{
"rotulo": "Movilidad estudiantil entrante",
"formato": "num",
"col": "MovEstEnt",
"agg": "sum"
},
{
"rotulo": "Movilidad estudiantil saliente",
"formato": "num",
"col": "MovEstSal",
"agg": "sum"
},
{
"rotulo": "Movilidad docente entrante",
"formato": "num",
"col": "Movilidad Docente - Entrante",
"agg": "sum"
},
{
"rotulo": "Movilidad docente saliente",
"formato": "num",
"col": "Movilidad Docente - Saliente",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Movilidad docente entrante y saliente por año",
"dim": "Año",
"medidas": [
{
"col": "Movilidad Docente - Entrante",
"agg": "sum",
"rotulo": "Entrante",
"formato": null,
"color": null
},
{
"col": "Movilidad Docente - Saliente",
"agg": "sum",
"rotulo": "Saliente",
"formato": null,
"color": null
}
],
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Movilidad estudiantil de pregrado por año",
"dim": "Año",
"medidas": [
{
"col": "Movilidad Estudiantil -Entrante -Pregrado",
"agg": "sum",
"rotulo": "Entrante",
"formato": null,
"color": null
},
{
"col": "Movilidad Estudiantil -Saliente -Pregrado",
"agg": "sum",
"rotulo": "Saliente",
"formato": null,
"color": null
}
],
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Movilidad estudiantil de posgrado por año",
"dim": "Año",
"medidas": [
{
"col": "Movilidad Estudiantil -Entrante -Posgrado",
"agg": "sum",
"rotulo": "Entrante",
"formato": null,
"color": null
},
{
"col": "Movilidad Estudiantil -Saliente -Posgrado",
"agg": "sum",
"rotulo": "Saliente",
"formato": null,
"color": null
}
],
"ancho": "media"
},
{
"tipo": "barrasH",
"titulo": "Movilidad total entrante por departamento",
"dim": "Región(Departamento Dentro De Colombia)",
"medidas": [
{
"col": "Movilidad Docente - Entrante",
"agg": "sum",
"rotulo": "Docentes",
"formato": null,
"color": null
},
{
"col": "Movilidad Estudiantil -Entrante -Pregrado",
"agg": "sum",
"rotulo": "Pregrado",
"formato": null,
"color": null
},
{
"col": "Movilidad Estudiantil -Entrante -Posgrado",
"agg": "sum",
"rotulo": "Posgrado",
"formato": null,
"color": null
}
],
"ancho": "media",
"alto": 420
},
{
"tipo": "barrasH",
"titulo": "Movilidad total saliente por departamento",
"dim": "Región(Departamento Dentro De Colombia)",
"medidas": [
{
"col": "Movilidad Docente - Saliente",
"agg": "sum",
"rotulo": "Docentes",
"formato": null,
"color": null
},
{
"col": "Movilidad Estudiantil -Saliente -Pregrado",
"agg": "sum",
"rotulo": "Pregrado",
"formato": null,
"color": null
},
{
"col": "Movilidad Estudiantil -Saliente -Posgrado",
"agg": "sum",
"rotulo": "Posgrado",
"formato": null,
"color": null
}
],
"ancho": "media",
"alto": 420
}
],
"notas": [],
"fuente": null,
"datos": "tres-movilidad__nacional"
},
{
"id": "internacional",
"rotulo": "Internacional",
"sub": "Movilidad",
"filtros": [
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "País",
"rotulo": "País",
"modo": null
}
],
"kpis": [
{
"rotulo": "Movilidad estudiantil entrante",
"formato": "num",
"col": "MovEstEnt",
"agg": "sum"
},
{
"rotulo": "Movilidad estudiantil saliente",
"formato": "num",
"col": "MovEstSal",
"agg": "sum"
},
{
"rotulo": "Movilidad docente entrante",
"formato": "num",
"col": "Movilidad Docente - Entrante",
"agg": "sum"
},
{
"rotulo": "Movilidad docente saliente",
"formato": "num",
"col": "Movilidad Docente - Saliente",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Movilidad docente entrante y saliente por año",
"dim": "Año",
"medidas": [
{
"col": "Movilidad Docente - Entrante",
"agg": "sum",
"rotulo": "Entrante",
"formato": null,
"color": null
},
{
"col": "Movilidad Docente - Saliente",
"agg": "sum",
"rotulo": "Saliente",
"formato": null,
"color": null
}
],
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Movilidad estudiantil de pregrado por año",
"dim": "Año",
"medidas": [
{
"col": "Movilidad Estudiantil -Entrante -Pregrado",
"agg": "sum",
"rotulo": "Entrante",
"formato": null,
"color": null
},
{
"col": "Movilidad Estudiantil -Saliente -Pregrado",
"agg": "sum",
"rotulo": "Saliente",
"formato": null,
"color": null
}
],
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Movilidad estudiantil de posgrado por año",
"dim": "Año",
"medidas": [
{
"col": "Movilidad Estudiantil -Entrante -Posgrado",
"agg": "sum",
"rotulo": "Entrante",
"formato": null,
"color": null
},
{
"col": "Movilidad Estudiantil -Saliente -Posgrado",
"agg": "sum",
"rotulo": "Saliente",
"formato": null,
"color": null
}
],
"ancho": "media"
},
{
"tipo": "barrasH",
"titulo": "Movilidad total entrante por país",
"dim": "País",
"medidas": [
{
"col": "Movilidad Docente - Entrante",
"agg": "sum",
"rotulo": "Docentes",
"formato": null,
"color": null
},
{
"col": "Movilidad Estudiantil -Entrante -Pregrado",
"agg": "sum",
"rotulo": "Pregrado",
"formato": null,
"color": null
},
{
"col": "Movilidad Estudiantil -Entrante -Posgrado",
"agg": "sum",
"rotulo": "Posgrado",
"formato": null,
"color": null
}
],
"ancho": "media",
"alto": 420
},
{
"tipo": "barrasH",
"titulo": "Movilidad total saliente por país",
"dim": "País",
"medidas": [
{
"col": "Movilidad Docente - Saliente",
"agg": "sum",
"rotulo": "Docentes",
"formato": null,
"color": null
},
{
"col": "Movilidad Estudiantil -Saliente -Pregrado",
"agg": "sum",
"rotulo": "Pregrado",
"formato": null,
"color": null
},
{
"col": "Movilidad Estudiantil -Saliente -Posgrado",
"agg": "sum",
"rotulo": "Posgrado",
"formato": null,
"color": null
}
],
"ancho": "media",
"alto": 420
}
],
"notas": [],
"fuente": null,
"datos": "tres-movilidad__internacional"
}
]
},
{
"id": "tres-saber-pro",
"titulo": "Pruebas Saber Pro en las 3 IES",
"rotulo": "Pruebas Saber Pro en las 3 IES",
"fuente": "ICFES · 3 IES del municipio",
"descripcion": "Promedios y desviaciones estándar de las pruebas Saber Pro por módulo e institución.",
"selector": null,
"icono": "quiz",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Módulo",
"rotulo": "Módulo",
"modo": null
},
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
}
],
"kpis": [
{
"rotulo": "Promedio puntaje global IES",
"formato": "dec",
"col": "Promedio Puntaje Global Ie",
"agg": "avg"
},
{
"rotulo": "Promedio puntaje por módulo",
"formato": "dec",
"col": "Promedio Puntaje Módulo",
"agg": "avg"
},
{
"rotulo": "Desviación estándar por módulo",
"formato": "dec",
"col": "Desviacion Estandar Módulo",
"agg": "avg"
},
{
"rotulo": "Módulos",
"col": "Módulo",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "linea",
"titulo": "Desviación estándar del módulo y de la IES por módulo",
"dim": "Módulo",
"medidas": [
{
"col": "Desviacion Estandar Módulo",
"agg": "avg",
"rotulo": "Módulo",
"formato": null,
"color": null
},
{
"col": "Desviacion Estandar Ie",
"agg": "avg",
"rotulo": "IES",
"formato": null,
"color": null
}
],
"ancho": "media",
"formato": "dec",
"orden": "natural"
},
{
"tipo": "linea",
"titulo": "Promedio del puntaje global de la IES y del módulo",
"dim": "Módulo",
"medidas": [
{
"col": "Promedio Puntaje Global Ie",
"agg": "avg",
"rotulo": "Global IES",
"formato": null,
"color": null
},
{
"col": "Promedio Puntaje Módulo",
"agg": "avg",
"rotulo": "Módulo",
"formato": null,
"color": null
}
],
"ancho": "media",
"formato": "dec",
"orden": "natural"
},
{
"tipo": "barrasV",
"titulo": "Promedio global y por módulo según IES",
"dim": "IES",
"medidas": [
{
"col": "Promedio Puntaje Global Ie",
"agg": "avg",
"rotulo": "Global IES",
"formato": null,
"color": null
},
{
"col": "Promedio Puntaje Módulo",
"agg": "avg",
"rotulo": "Módulo",
"formato": null,
"color": null
}
],
"ancho": "media",
"formato": "dec"
},
{
"tipo": "barrasV",
"titulo": "Desviación estándar del módulo y de la IES según IES",
"dim": "IES",
"medidas": [
{
"col": "Desviacion Estandar Módulo",
"agg": "avg",
"rotulo": "Módulo",
"formato": null,
"color": null
},
{
"col": "Desviacion Estandar Ie",
"agg": "avg",
"rotulo": "IES",
"formato": null,
"color": null
}
],
"ancho": "media",
"formato": "dec"
}
],
"notas": [],
"fuente": null,
"datos": "tres-saber-pro__unica"
}
]
},
{
"id": "tres-mapa-demanda",
"titulo": "Mapa de demanda y matrícula de las 3 IES por comuna",
"rotulo": "Mapa de demanda y matrícula",
"fuente": "3 IES del municipio · corte 2023-1",
"descripcion": "Inscritos, admitidos y matriculados de las tres IES según la comuna de residencia, por período.",
"selector": null,
"icono": "map",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Indicador",
"rotulo": "Indicador",
"modo": null
},
{
"col": "Período",
"rotulo": "Semestre",
"modo": null
}
],
"kpis": [
{
"rotulo": "Demanda y matrícula (suma de la selección)",
"formato": "num",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Indicadores",
"col": "Indicador",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Períodos",
"col": "Período",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Comunas y corregimientos",
"col": "Comuna",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Demanda y matrícula por comuna",
"dim": "Comuna",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "dosTercios",
"mapa": "comunas",
"alto": 560
},
{
"tipo": "barrasH",
"titulo": "Por comuna",
"dim": "Comuna",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"alto": 560
},
{
"tipo": "linea",
"titulo": "Por período e indicador",
"dim": "Período",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Indicador",
"ancho": "completa",
"alto": 300
}
],
"notas": [
"Elija un indicador (inscritos, admitidos, matriculados nuevos o matriculados) y un período para leer el mapa; sin filtros se suman todos."
],
"fuente": null,
"datos": "tres-mapa-demanda__unica"
}
]
},
{
"id": "tres-demanda-comunas",
"titulo": "Demanda y matrícula de las 3 IES por comuna y período",
"rotulo": "Demanda y matrícula por comuna",
"fuente": "3 IES del municipio · corte 2023-1",
"descripcion": "Inscritos, admitidos, matriculados nuevos y matriculados de cada IES según la comuna de residencia, período a período.",
"selector": null,
"icono": "holiday_village",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Comuna",
"rotulo": "Comuna",
"modo": null
},
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Indicador",
"rotulo": "Indicador",
"modo": null
},
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Valor (suma de la selección)",
"formato": "num",
"col": "Valor",
"agg": "sum"
},
{
"rotulo": "Comunas",
"formato": "num",
"col": "Comuna",
"agg": "distinct"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Indicadores",
"col": "Indicador",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "linea",
"titulo": "Evolución por período e indicador",
"dim": "Período",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Indicador",
"ancho": "completa",
"alto": 300
},
{
"tipo": "barrasH",
"titulo": "Por comuna",
"dim": "Comuna",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"alto": 460
},
{
"tipo": "tabla",
"titulo": "Por comuna, IES e indicador",
"medida": {
"col": "Valor",
"agg": "sum",
"rotulo": "Valor",
"formato": null,
"color": null
},
"ancho": "media",
"dims": [
"Comuna",
"IES",
"Indicador"
],
"alto": 460
}
],
"notas": [
"Reúne las dieciséis hojas «Demanda comuna N», la de corregimientos y la de comuna no definida del Power BI original en una sola vista."
],
"fuente": null,
"datos": "tres-demanda-comunas__unica"
}
]
}
]
},
{
"id": "continua",
"rotulo": "Formación continua",
"icono": "auto_stories",
"vistas": [
{
"id": "tres-formacion-continua",
"titulo": "Formación continua en las 3 IES",
"rotulo": "Formación continua",
"fuente": "3 IES del municipio · corte 2023-1",
"descripcion": "Actividades, matriculados, certificados y presupuesto de formación continua en las tres IES.",
"selector": null,
"icono": "auto_stories",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Semestre",
"rotulo": "Semestre",
"modo": null
},
{
"col": "Área de Conocimiento",
"rotulo": "Área del conocimiento",
"modo": null
},
{
"col": "Actividad",
"rotulo": "Actividad",
"modo": null
}
],
"kpis": [
{
"rotulo": "Actividades de formación continua",
"formato": "num",
"agg": "count"
},
{
"rotulo": "Matriculados",
"formato": "num",
"col": "Matriculados",
"agg": "sum"
},
{
"rotulo": "Certificados",
"formato": "num",
"col": "Graduados",
"agg": "sum"
},
{
"rotulo": "Presupuesto dedicado",
"formato": "pesos",
"col": "Presupuesto",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Matriculados por IES en formación continua",
"dim": "IES",
"medida": {
"col": "Matriculados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio"
},
{
"tipo": "tabla",
"titulo": "Matriculados por actividad y año",
"medida": {
"col": "Matriculados",
"agg": "sum",
"rotulo": "Matriculados",
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Actividad",
"Año"
],
"alto": 380
},
{
"tipo": "tabla",
"titulo": "Certificados por actividad y año",
"medida": {
"col": "Graduados",
"agg": "sum",
"rotulo": "Certificados",
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"Actividad",
"Año"
],
"alto": 380
},
{
"tipo": "barrasH",
"titulo": "Certificados en educación continua por IES",
"dim": "IES",
"medida": {
"col": "Graduados",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "barrasV",
"titulo": "Matriculados y certificados por año",
"dim": "Año",
"medidas": [
{
"col": "Matriculados",
"agg": "sum",
"rotulo": "Matriculados",
"formato": null,
"color": null
},
{
"col": "Graduados",
"agg": "sum",
"rotulo": "Certificados",
"formato": null,
"color": null
}
],
"ancho": "media"
}
],
"notas": [],
"fuente": null,
"datos": "tres-formacion-continua__unica"
}
]
}
]
},
{
"id": "infraestructura",
"rotulo": "Infraestructura y recursos",
"icono": "apartment",
"vistas": [
{
"id": "tres-recursos",
"titulo": "Recursos documentales, TIC y de I+D+i en las 3 IES",
"rotulo": "Recursos documentales y de I+D+i",
"fuente": "3 IES del municipio · corte 2023-1",
"descripcion": "Recursos documentales, tecnológicos y financieros para investigación, desarrollo e innovación en las tres IES.",
"selector": null,
"icono": "library_books",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Recursos documentales (unidades)",
"formato": "num",
"col": "Unidades recurso documental",
"agg": "sum"
},
{
"rotulo": "Recursos TIC (unidades)",
"formato": "num",
"col": "Unidades recurso TIC´s",
"agg": "sum"
},
{
"rotulo": "Monto para I+D+i",
"formato": "pesos",
"col": "Monto recurso para actividades de investigación",
"agg": "sum"
},
{
"rotulo": "Actividades con recurso I+D+i",
"formato": "num",
"col": "Número de actividades desarrolladas con recurso I+D+i",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Recurso documental",
"medida": {
"col": "Unidades recurso documental",
"agg": "sum",
"rotulo": "Unidades",
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"IES",
"Tipo de recurso Documental"
],
"alto": 460
},
{
"tipo": "barrasV",
"titulo": "Recurso económico para actividades de I+D+i ($)",
"dim": "IES",
"medida": {
"col": "Monto recurso para actividades de investigación",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Carácter del recurso I+D+i",
"ancho": "tercio",
"formato": "pesos",
"alto": 460
},
{
"tipo": "tabla",
"titulo": "Recursos en TIC",
"medida": {
"col": "Unidades recurso TIC´s",
"agg": "sum",
"rotulo": "Unidades",
"formato": null,
"color": null
},
"ancho": "tercio",
"dims": [
"IES",
"Tipo de recurso TIC´s"
],
"alto": 460
}
],
"notas": [],
"fuente": null,
"datos": "tres-recursos__unica"
}
]
},
{
"id": "tres-m2",
"titulo": "Metros cuadrados disponibles para actividades académicas en las 3 IES",
"rotulo": "M2 disponibles",
"fuente": "3 IES del municipio · corte 2023-1",
"descripcion": "Unidades (aulas, laboratorios, auditorios) y metros cuadrados por tipo de uso y por campus en las tres IES.",
"selector": "Ver",
"icono": "square_foot",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "Por tipo de uso",
"sub": "Ver",
"filtros": [
{
"col": "IES",
"rotulo": "IES",
"modo": null
},
{
"col": "nombre del campus",
"rotulo": "Campus",
"modo": null
}
],
"kpis": [
{
"rotulo": "Unidades",
"formato": "num",
"col": "unidades",
"agg": "sum"
},
{
"rotulo": "Metros cuadrados",
"formato": "num",
"col": "m2",
"agg": "sum"
},
{
"rotulo": "Instituciones",
"col": "IES",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "nombre del campus",
"col": "nombre del campus",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "por uso",
"col": "por uso",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "barrasAgrupadas",
"titulo": "Número de unidades por tipo de uso e institución",
"dim": "por uso",
"medida": {
"col": "unidades",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "IES",
"ancho": "media",
"alto": 480
},
{
"tipo": "tabla",
"titulo": "Unidades y metros cuadrados por tipo de uso",
"medidas": [
{
"col": "unidades",
"agg": "sum",
"rotulo": "Unidades",
"formato": null,
"color": null
},
{
"col": "m2",
"agg": "sum",
"rotulo": "M2",
"formato": null,
"color": null
}
],
"ancho": "media",
"dims": [
"por uso",
"IES"
],
"alto": 480
}
],
"notas": [],
"fuente": null,
"datos": "tres-m2__unica"
},
{
"id": "campus",
"rotulo": "Área por campus",
"sub": "Ver",
"filtros": [
{
"col": "IES campus",
"rotulo": "IES",
"modo": null
},
{
"col": "Campus",
"rotulo": "Campus",
"modo": null
}
],
"kpis": [
{
"rotulo": "Área de los campus (lote)",
"formato": "num",
"col": "área del campus (lote)",
"agg": "sum"
},
{
"rotulo": "Área construida",
"formato": "num",
"col": "área construída del campus",
"agg": "sum"
},
{
"rotulo": "IES campus",
"col": "IES campus",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Campus",
"col": "Campus",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Tenencia",
"col": "Tenencia",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
}
],
"visuales": [
{
"tipo": "tabla",
"titulo": "Área por campus",
"medidas": [
{
"col": "área del campus (lote)",
"agg": "sum",
"rotulo": "Área del lote",
"formato": null,
"color": null
},
{
"col": "área construída del campus",
"agg": "sum",
"rotulo": "Área construida",
"formato": null,
"color": null
}
],
"ancho": "completa",
"dims": [
"IES campus",
"Campus",
"Tenencia"
],
"alto": 420
}
],
"notas": [],
"fuente": null,
"datos": "tres-m2__campus"
}
]
}
]
}
]
},
{
"id": "contexto",
"rotulo": "Contexto de Medellín",
"icono": "location_city",
"familia": "success",
"descripcion": "Indicadores académicos y económicos del municipio que enmarcan la educación postsecundaria.",
"temas": [
{
"id": "academicos",
"rotulo": "Académicos",
"icono": "school",
"vistas": [
{
"id": "ctx-icu",
"titulo": "Índice de ciudades universitarias (ICU)",
"rotulo": "Índice de ciudades universitarias (ICU)",
"fuente": "Red de Ciudades Cómo Vamos · ICU",
"descripcion": "Índice de ciudades universitarias de Medellín y sus dimensiones, y la comparación con las ciudades de la red Cómo Vamos.",
"selector": "Ver",
"icono": "location_city",
"palabras": null,
"variantes": [
{
"id": "medellin",
"rotulo": "Medellín",
"sub": "Ver",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "ICU (promedio de los años seleccionados)",
"formato": "dec",
"col": "ICU",
"agg": "avg"
},
{
"rotulo": "Posición de Medellín",
"formato": "num",
"pie": "Último año seleccionado",
"col": "Posición de Medellín en el ICU",
"agg": "last"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
},
{
"rotulo": "Visualizaciones",
"agg": "constante",
"valor": 6,
"formato": "num",
"pie": "En esta vista"
}
],
"visuales": [
{
"tipo": "area",
"titulo": "ICU",
"dim": "Año",
"medida": {
"col": "ICU",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"formato": "dec",
"alto": 240
},
{
"tipo": "area",
"titulo": "Calidad de la educación superior",
"dim": "Año",
"medida": {
"col": "Calidad de la educación superior",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"formato": "dec",
"alto": 240
},
{
"tipo": "area",
"titulo": "Ambiente universitario",
"dim": "Año",
"medida": {
"col": "Ambiente universitario",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"formato": "dec",
"alto": 240
},
{
"tipo": "area",
"titulo": "Costo de vida",
"dim": "Año",
"medida": {
"col": "Costo de vida",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"formato": "dec",
"alto": 240
},
{
"tipo": "area",
"titulo": "Calidad de vida universitaria",
"dim": "Año",
"medida": {
"col": "Calidad de Vida Universitaria",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"formato": "dec",
"alto": 240
},
{
"tipo": "area",
"titulo": "Empleabilidad de los egresados",
"dim": "Año",
"medida": {
"col": "Empleabilidad de los egresados",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "tercio",
"formato": "dec",
"alto": 240
}
],
"notas": [],
"fuente": null,
"datos": "ctx-icu__medellin"
},
{
"id": "ciudades",
"rotulo": "Ciudades Cómo Vamos",
"sub": "Ver",
"filtros": [
{
"col": "Ciudad",
"rotulo": "Ciudad",
"modo": null
},
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Ciudades comparadas",
"formato": "num",
"col": "Ciudad",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
},
{
"rotulo": "Visualizaciones",
"agg": "constante",
"valor": 2,
"formato": "num",
"pie": "En esta vista"
},
{
"rotulo": "Visualizaciones",
"agg": "constante",
"valor": 2,
"formato": "num",
"pie": "En esta vista"
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Índice de ciudades universitarias comparativo",
"dim": "Ciudad",
"medida": {
"col": "Indice",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Año",
"ancho": "completa",
"formato": "dec",
"alto": 320
},
{
"tipo": "tabla",
"titulo": "Posición en el ranking por año",
"medidas": [
{
"col": "Indice",
"agg": "avg",
"rotulo": "ICU",
"formato": "dec",
"color": null
},
{
"col": "Posicion",
"agg": "avg",
"rotulo": "Posición",
"formato": null,
"color": null
}
],
"ancho": "completa",
"dims": [
"Ciudad",
"Año"
],
"alto": 420,
"sinTotal": true
}
],
"notas": [],
"fuente": null,
"datos": "ctx-icu__ciudades"
}
]
},
{
"id": "ctx-tasa-continuidad",
"titulo": "Tasa de continuidad a la educación postsecundaria y superior",
"rotulo": "Tasa de continuidad",
"fuente": "Secretaría de Educación de Medellín",
"descripcion": "Porcentaje de bachilleres que continúan a la educación postsecundaria y a la educación superior.",
"selector": null,
"icono": "trending_up",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Continuidad a educación postsecundaria",
"formato": "pct",
"col": "Tasa de continuidad a educación postsecundaria",
"agg": "avg"
},
{
"rotulo": "Continuidad a educación superior",
"formato": "pct",
"col": "Tasa de continuidad a educación superior",
"agg": "avg"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
},
{
"rotulo": "Visualizaciones",
"agg": "constante",
"valor": 3,
"formato": "num",
"pie": "En esta vista"
}
],
"visuales": [
{
"tipo": "area",
"titulo": "Tasa de continuidad a educación postsecundaria",
"dim": "Año",
"medida": {
"col": "Tasa de continuidad a educación postsecundaria",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
},
{
"tipo": "area",
"titulo": "Tasa de continuidad a educación superior",
"dim": "Año",
"medida": {
"col": "Tasa de continuidad a educación superior",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
},
{
"tipo": "barrasV",
"titulo": "Comparación de las dos tasas por año",
"dim": "Año",
"medidas": [
{
"col": "Tasa de continuidad a educación postsecundaria",
"agg": "avg",
"rotulo": "Postsecundaria",
"formato": null,
"color": null
},
{
"col": "Tasa de continuidad a educación superior",
"agg": "avg",
"rotulo": "Superior",
"formato": null,
"color": null
}
],
"ancho": "completa",
"formato": "pct",
"alto": 300
}
],
"notas": [],
"fuente": null,
"datos": "ctx-tasa-continuidad__unica"
}
]
},
{
"id": "ctx-tasa-asistencia",
"titulo": "Tasa de asistencia a la educación postsecundaria",
"rotulo": "Tasa de asistencia a la educación postsecundaria",
"fuente": "Medellín Cómo Vamos",
"descripcion": "Proporción de jóvenes que asisten a la educación postsecundaria, por comuna, sexo y estrato.",
"selector": null,
"icono": "event_available",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Tasa de asistencia en Medellín",
"formato": "pct",
"col": "Tasa de asistencia a la Educación Postsecundaria Medellín",
"agg": "avg"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Comunas y corregimientos",
"col": "Comuna",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Estratos",
"col": "Estrato",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Tasa de asistencia por comuna",
"dim": "Comuna",
"medida": {
"col": "Tasa de asistencia a la Educación Postsecundaria comuna",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct",
"mapa": "comunas",
"alto": 460
},
{
"tipo": "tabla",
"titulo": "Tasa de asistencia por comuna",
"medida": {
"col": "Tasa de asistencia a la Educación Postsecundaria comuna",
"agg": "avg",
"rotulo": "Tasa",
"formato": "pct",
"color": null
},
"ancho": "media",
"dims": [
"Comuna"
],
"alto": 460,
"sinTotal": true
},
{
"tipo": "tabla",
"titulo": "Tasa de asistencia por sexo",
"medidas": [
{
"col": "Hombre",
"agg": "avg",
"rotulo": "Hombres",
"formato": "pct",
"color": null
},
{
"col": "Mujer",
"agg": "avg",
"rotulo": "Mujeres",
"formato": "pct",
"color": null
}
],
"ancho": "media",
"dims": [
"Comuna"
],
"alto": 420,
"sinTotal": true
},
{
"tipo": "tabla",
"titulo": "Tasa de asistencia por estrato",
"medida": {
"col": "Tasa de asistencia a la Educación Postsecundaria estrato",
"agg": "avg",
"rotulo": "Tasa",
"formato": "pct",
"color": null
},
"ancho": "media",
"dims": [
"Estrato"
],
"alto": 420,
"sinTotal": true
}
],
"notas": [
"La hoja de la matriz trae en la misma fila la tasa por comuna y, en otras columnas, la tasa por estrato; cada tabla usa la columna que le corresponde."
],
"fuente": null,
"datos": "ctx-tasa-asistencia__unica"
}
]
},
{
"id": "ctx-satisfaccion",
"titulo": "Satisfacción de Medellín como destino universitario",
"rotulo": "Satisfacción de Medellín como destino universitario",
"fuente": "Sapiencia · encuesta de satisfacción",
"descripcion": "Satisfacción de estudiantes, docentes y otros públicos con Medellín como destino universitario, por dimensión.",
"selector": null,
"icono": "sentiment_satisfied",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Satisfacción general",
"formato": "pct",
"col": "Satisfación general",
"agg": "avg"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Dimensión",
"col": "Dimensión",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Público",
"col": "Público",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Satisfacción por dimensión",
"dim": "Dimensión",
"medida": {
"col": "Satisfacción por dimensión",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
},
{
"tipo": "barrasV",
"titulo": "Satisfacción por público",
"dim": "Público",
"medida": {
"col": "Satisfacción de Medellín como destino Universitario",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
}
],
"notas": [],
"fuente": null,
"datos": "ctx-satisfaccion__unica"
}
]
},
{
"id": "ctx-cobertura-media",
"titulo": "Cobertura bruta y deserción en educación secundaria y media",
"rotulo": "Cobertura y deserción en secundaria y media",
"fuente": "Secretaría de Educación de Medellín",
"descripcion": "Matrícula, cobertura bruta y deserción en educación secundaria y media de Medellín.",
"selector": "Nivel",
"icono": "school",
"palabras": null,
"variantes": [
{
"id": "secundaria",
"rotulo": "Secundaria (6.º a 9.º)",
"sub": "Nivel",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Tasa de cobertura de secundaria",
"formato": "pct",
"col": "Tasa de cobertura de secundaria en Medellín",
"agg": "avg"
},
{
"rotulo": "Tasa de deserción de secundaria",
"formato": "pct",
"col": "Tasa de deserción educación secundaria (6-9 grado)",
"agg": "avg"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
},
{
"rotulo": "Visualizaciones",
"agg": "constante",
"valor": 4,
"formato": "num",
"pie": "En esta vista"
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Matriculados en secundaria en instituciones oficiales",
"dim": "Año",
"medida": {
"col": "Estudiantes matriculados en secundaria en la ciudad (6 a 9 grado) de instituciones educactivas oficiales",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "area",
"titulo": "Tasa de cobertura de secundaria",
"dim": "Año",
"medida": {
"col": "Tasa de cobertura de secundaria en Medellín",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
},
{
"tipo": "barrasV",
"titulo": "Matriculados en secundaria en instituciones privadas",
"dim": "Año",
"medida": {
"col": "Estudiantes matriculados en secundaria en la ciudad (6 a 9 grado) de instituciones educactivas privadas",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "area",
"titulo": "Tasa de deserción en secundaria",
"dim": "Año",
"medida": {
"col": "Tasa de deserción educación secundaria (6-9 grado)",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
}
],
"notas": [],
"fuente": null,
"datos": "ctx-cobertura-media__secundaria"
},
{
"id": "media",
"rotulo": "Media (10.º y 11.º)",
"sub": "Nivel",
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Tasa de cobertura de media",
"formato": "pct",
"col": "Tasa de cobertura de educación media en Medellín",
"agg": "avg"
},
{
"rotulo": "Tasa de deserción de media",
"formato": "pct",
"col": "Tasa de deserción educación media (10 y 11 grado)",
"agg": "avg"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
},
{
"rotulo": "Visualizaciones",
"agg": "constante",
"valor": 4,
"formato": "num",
"pie": "En esta vista"
}
],
"visuales": [
{
"tipo": "barrasV",
"titulo": "Matriculados en media en instituciones oficiales",
"dim": "Año",
"medida": {
"col": "Estudiantes matriculados en media en la ciudad (10 y 11 grado) de instituciones educactivas oficiales",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "area",
"titulo": "Tasa de cobertura de educación media",
"dim": "Año",
"medida": {
"col": "Tasa de cobertura de educación media en Medellín",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
},
{
"tipo": "barrasV",
"titulo": "Matriculados en media en instituciones privadas",
"dim": "Año",
"medida": {
"col": "Estudiantes matriculados en media en la ciudad (10 y 11 grado) de instituciones educactivas privadas",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media"
},
{
"tipo": "area",
"titulo": "Tasa de deserción en educación media",
"dim": "Año",
"medida": {
"col": "Tasa de deserción educación media (10 y 11 grado)",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct"
}
],
"notas": [],
"fuente": null,
"datos": "ctx-cobertura-media__media"
}
]
},
{
"id": "ctx-personas-titulo",
"titulo": "Tasa de personas con título de educación postsecundaria",
"rotulo": "Tasa de personas con título",
"fuente": "Medellín Cómo Vamos",
"descripcion": "Proporción de personas con título de educación postsecundaria, por comuna y año.",
"selector": null,
"icono": "workspace_premium",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Comuna",
"rotulo": "Comuna",
"modo": null
}
],
"kpis": [
{
"rotulo": "Tasa en Medellín",
"formato": "pct",
"col": "Tasa por municipio",
"agg": "avg"
},
{
"rotulo": "Comunas",
"formato": "num",
"col": "Comuna",
"agg": "distinct"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
},
{
"rotulo": "Visualizaciones",
"agg": "constante",
"valor": 4,
"formato": "num",
"pie": "En esta vista"
}
],
"visuales": [
{
"tipo": "area",
"titulo": "Tasa de personas con título de educación postsecundaria en Medellín",
"dim": "Año",
"medida": {
"col": "Tasa por municipio",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"formato": "pct",
"alto": 280
},
{
"tipo": "barrasV",
"titulo": "Tasa por comuna y año",
"dim": "Comuna",
"medida": {
"col": "Tasa",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"dim2": "Año",
"ancho": "completa",
"formato": "pct",
"alto": 420,
"corte": 12
},
{
"tipo": "mapa",
"titulo": "Tasa por comuna (promedio de los años seleccionados)",
"dim": "Comuna",
"medida": {
"col": "Tasa",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct",
"mapa": "comunas",
"alto": 460
},
{
"tipo": "tabla",
"titulo": "Tasa por comuna y año",
"medida": {
"col": "Tasa",
"agg": "avg",
"rotulo": "Tasa",
"formato": "pct",
"color": null
},
"ancho": "media",
"dims": [
"Comuna",
"Año"
],
"alto": 460,
"sinTotal": true
}
],
"notas": [],
"fuente": null,
"datos": "ctx-personas-titulo__unica"
}
]
}
]
},
{
"id": "economicos",
"rotulo": "Económicos",
"icono": "payments",
"vistas": [
{
"id": "ctx-desempleo",
"titulo": "Tasa de desempleo",
"rotulo": "Tasa de desempleo",
"fuente": "Medellín Cómo Vamos",
"descripcion": "Tasa de desempleo de Medellín por año y por comuna.",
"selector": null,
"icono": "work_off",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Tasa de desempleo de Medellín",
"formato": "pct",
"col": "Tasa de desempleo Medellín",
"agg": "avg"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Comunas y corregimientos",
"col": "Comuna",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
},
{
"rotulo": "Visualizaciones",
"agg": "constante",
"valor": 2,
"formato": "num",
"pie": "En esta vista"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Tasa de desempleo por comuna",
"dim": "Comuna",
"medida": {
"col": "Tasa de desempleo por comuna",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct",
"mapa": "comunas",
"alto": 480
},
{
"tipo": "area",
"titulo": "Tasa de desempleo de Medellín por año",
"dim": "Año",
"medida": {
"col": "Tasa de desempleo Medellín",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct",
"alto": 480
}
],
"notas": [],
"fuente": null,
"datos": "ctx-desempleo__unica"
}
]
},
{
"id": "ctx-ocupacion",
"titulo": "Tasa de ocupación",
"rotulo": "Tasa de ocupación",
"fuente": "Medellín Cómo Vamos",
"descripcion": "Tasa de ocupación de Medellín por año y por comuna.",
"selector": null,
"icono": "work",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Tasa de ocupación de Medellín",
"formato": "pct",
"col": "Tasa de ocupación Medellín",
"agg": "avg"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Comunas y corregimientos",
"col": "Comuna",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
},
{
"rotulo": "Visualizaciones",
"agg": "constante",
"valor": 2,
"formato": "num",
"pie": "En esta vista"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Tasa de ocupación por comuna",
"dim": "Comuna",
"medida": {
"col": "Tasa de ocupación por comuna",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct",
"mapa": "comunas",
"alto": 480
},
{
"tipo": "linea",
"titulo": "Tasa de ocupación de Medellín por año",
"dim": "Año",
"medida": {
"col": "Tasa de ocupación Medellín",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "pct",
"alto": 480
}
],
"notas": [],
"fuente": null,
"datos": "ctx-ocupacion__unica"
}
]
},
{
"id": "ctx-pobreza",
"titulo": "Pobreza y desigualdad",
"rotulo": "Pobreza y desigualdad",
"fuente": "DANE · Medellín Cómo Vamos",
"descripcion": "Índices de pobreza multidimensional, monetaria y monetaria extrema de Medellín.",
"selector": null,
"icono": "volunteer_activism",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Pobreza multidimensional",
"formato": "pct",
"col": "Índice probreza multidiciplinar por Medellín",
"agg": "avg"
},
{
"rotulo": "Pobreza monetaria",
"formato": "pct",
"col": "Índice probreza monetaria por Medellín",
"agg": "avg"
},
{
"rotulo": "Pobreza monetaria extrema",
"formato": "pct",
"col": "Índice probreza monetaria extrema por Medellín",
"agg": "avg"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
}
],
"visuales": [
{
"tipo": "linea",
"titulo": "Índice de pobreza multidimensional en Medellín por año",
"dim": "Año",
"medida": {
"col": "Índice probreza multidiciplinar por Medellín",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"formato": "pct",
"alto": 240
},
{
"tipo": "linea",
"titulo": "Índice de pobreza monetaria en Medellín por año",
"dim": "Año",
"medida": {
"col": "Índice probreza monetaria por Medellín",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"formato": "pct",
"alto": 240
},
{
"tipo": "linea",
"titulo": "Índice de pobreza monetaria extrema en Medellín por año",
"dim": "Año",
"medida": {
"col": "Índice probreza monetaria extrema por Medellín",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"formato": "pct",
"alto": 240
}
],
"notas": [],
"fuente": null,
"datos": "ctx-pobreza__unica"
}
]
},
{
"id": "ctx-poblacion",
"titulo": "Población de la ciudad",
"rotulo": "Población total",
"fuente": "DANE · proyecciones de población",
"descripcion": "Población de Medellín por año y por comuna.",
"selector": null,
"icono": "diversity_3",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
}
],
"kpis": [
{
"rotulo": "Población de Medellín (promedio de los años seleccionados)",
"formato": "num",
"col": "Población Medellín",
"agg": "avg"
},
{
"rotulo": "Población por comuna (suma)",
"formato": "num",
"col": "Población por comuna",
"agg": "sum"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Comunas y corregimientos",
"col": "Comuna",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
}
],
"visuales": [
{
"tipo": "mapa",
"titulo": "Población por comuna",
"dim": "Comuna",
"medida": {
"col": "Población por comuna",
"agg": "sum",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"mapa": "comunas",
"alto": 480
},
{
"tipo": "linea",
"titulo": "Población anual de Medellín",
"dim": "Año",
"medida": {
"col": "Población Medellín",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"alto": 480
}
],
"notas": [],
"fuente": null,
"datos": "ctx-poblacion__unica"
}
]
},
{
"id": "ctx-ipm-comuna",
"titulo": "Índice multidimensional de pobreza por comuna",
"rotulo": "Índice multidimensional de pobreza por comuna",
"fuente": "Medellín Cómo Vamos · corte 2020",
"descripcion": "Índice multidimensional de pobreza de cada comuna y corregimiento, y de Medellín urbano, rural y completo.",
"selector": null,
"icono": "pie_chart",
"palabras": null,
"variantes": [
{
"id": "unica",
"rotulo": "",
"sub": null,
"filtros": [
{
"col": "Año",
"rotulo": "Año",
"modo": null
},
{
"col": "Comuna",
"rotulo": "Comuna",
"modo": null
}
],
"kpis": [
{
"rotulo": "IPM Medellín (promedio)",
"formato": "dec",
"col": "IPMMedellin",
"agg": "avg"
},
{
"rotulo": "Años con datos",
"col": "Año",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Comunas y corregimientos",
"col": "Comuna",
"agg": "distinct",
"formato": "num",
"pie": "Valores distintos en la selección"
},
{
"rotulo": "Registros",
"agg": "count",
"formato": "num",
"pie": "Filas de la fuente en la selección"
},
{
"rotulo": "Visualizaciones",
"agg": "constante",
"valor": 3,
"formato": "num",
"pie": "En esta vista"
}
],
"visuales": [
{
"tipo": "linea",
"titulo": "Índice multidimensional de pobreza en Medellín",
"dim": "Año",
"medida": {
"col": "IPMMedellin",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "completa",
"formato": "dec",
"alto": 260
},
{
"tipo": "mapa",
"titulo": "IPM por comuna (promedio de los años seleccionados)",
"dim": "Comuna",
"medida": {
"col": "IPM",
"agg": "avg",
"rotulo": null,
"formato": null,
"color": null
},
"ancho": "media",
"formato": "dec",
"mapa": "comunas",
"alto": 480
},
{
"tipo": "tabla",
"titulo": "IPM por comuna y año",
"medida": {
"col": "IPM",
"agg": "avg",
"rotulo": "IPM",
"formato": "dec",
"color": null
},
"ancho": "media",
"dims": [
"Comuna",
"Año"
],
"alto": 480,
"sinTotal": true
}
],
"notas": [],
"fuente": null,
"datos": "ctx-ipm-comuna__unica"
}
]
}
]
}
]
}
]
};
