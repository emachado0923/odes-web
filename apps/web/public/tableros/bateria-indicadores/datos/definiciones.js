/* Textos editables del tablero: nota de fuente, ventana de bienvenida,
   texto del inicio y glosario. El área puede ajustarlos sin tocar el código. */
window.ODES = window.ODES || {};
window.ODES.definiciones = {
  observatorio: 'Observatorio de Educación de Sapiencia · Agencia de Educación Postsecundaria de Medellín',
  fuente: 'Fuente: matriz de indicadores del Observatorio de Educación de Sapiencia (OdeS), 2023.',
  nota: 'Observatorio de Educación de Sapiencia · Batería de indicadores de educación postsecundaria · Cada vista indica su fuente y fecha de corte.',

  intro: {
    etiqueta: 'Observatorio de Educación de Sapiencia',
    titulo: 'Batería de indicadores de educación postsecundaria',
    texto: 'Datos de la educación postsecundaria de Medellín: educación superior, programas de Sapiencia, las 3 IES del municipio y contexto de ciudad.',
    subtitulo: 'Cómo se usa',
    pasos: [
      { icono: 'explore', titulo: 'Menú lateral', texto: 'Cuatro grupos con sus temas y vistas. El inicio muestra el mapa completo.' },
      { icono: 'search', titulo: 'Buscador', texto: 'Botón «Buscar indicador» o Ctrl+K para ir a cualquier vista por su nombre.' },
      { icono: 'tune', titulo: 'Ámbito y pestañas', texto: 'Los botones bajo el título cambian entre Colombia, Antioquia y Medellín, o entre secciones.' },
      { icono: 'filter_alt', titulo: 'Filtros', texto: 'Aplican a todos los gráficos y tablas de la vista. Un clic en una barra o porción también filtra.' },
      { icono: 'download', titulo: 'Descargas', texto: 'Cada gráfico se descarga como imagen o como CSV.' },
      { icono: 'keyboard', titulo: 'Teclado', texto: 'Alt + flechas: vista anterior o siguiente.' }
    ],
    boton: 'Ingresar'
  },

  inicio: {
    titulo: 'Mapa de indicadores',
    texto: ''
  },

  glosario: [
    {
      titulo: 'Instituciones y sistemas de información',
      terminos: [
        { termino: 'IES', definicion: 'Institución de Educación Superior. Según su carácter académico, el Ministerio de Educación Nacional las clasifica en cuatro tipos: (1) Institución Técnica Profesional; (2) Institución Tecnológica; (3) Institución Universitaria / Escuela Tecnológica, y (4) Universidad.' },
        { termino: 'SNIES', definicion: 'Sistema Nacional de Información de la Educación Superior. Sistema de información creado por el Ministerio para responder a las necesidades de información de la educación superior en Colombia. Consolida y suministra datos, estadísticas e indicadores relacionados con las instituciones y programas académicos aprobados por el Ministerio de Educación Nacional.' },
        { termino: 'SPADIES', definicion: 'Sistema para la Prevención de la Deserción en las Instituciones de Educación Superior. Iniciativa del Ministerio de Educación Nacional que incluye una plataforma en la que se consolida y ordena información que permite hacer seguimiento a las condiciones académicas y socioeconómicas de los estudiantes que han ingresado a la educación superior en Colombia.' },
        { termino: 'ETDH', definicion: 'Educación para el trabajo y el desarrollo humano.' },
        { termino: 'Tasa de supervivencia', definicion: 'Proporción de estudiantes en cada semestre que permanecen matriculados luego de haber sido primíparos de un programa académico de una Institución de Educación Superior.' },
        { termino: 'Ausencia intersemestral', definicion: 'Proporción de estudiantes que estando matriculados en un semestre (t) son clasificados como ausentes en un período (t+1).' },
        { termino: 'Cohorte', definicion: 'Semestre en el cual el estudiante fue registrado como primíparo.' }
      ]
    },
    {
      titulo: 'Deserción',
      terminos: [
        { termino: 'Deserción', definicion: 'Estado de un estudiante que de manera voluntaria o forzosa no registra matrícula por dos o más períodos académicos consecutivos del programa en el que se matriculó, y no se encuentra como graduado o retirado por motivos disciplinarios. La deserción es el resultado del efecto de diferentes factores individuales, académicos, institucionales y socioeconómicos.' },
        { termino: 'Desertor de programa', definicion: 'Estudiante que no se matricula en el mismo programa académico durante dos o más períodos consecutivos y no se encuentra como graduado o retirado por motivos disciplinarios.' },
        { termino: 'Desertor de la Institución de Educación Superior', definicion: 'Estudiante que no se matricula en una Institución de Educación Superior durante dos o más períodos académicos consecutivos y no se encuentra como graduado o retirado por motivos disciplinarios.' },
        { termino: 'Desertor del sistema', definicion: 'Estudiante que no se matricula en ningún programa académico de ninguna Institución de Educación Superior durante dos o más períodos consecutivos y no se encuentra como graduado o retirado por motivos disciplinarios.' },
        { termino: 'Deserción anual', definicion: 'Porcentaje de estudiantes desertores identificados en t+2 que estuvieron matriculados en el período t.' },
        { termino: 'Deserción por cohorte', definicion: 'Porcentaje acumulado de estudiantes de una cohorte que no ha registrado matrícula por dos o más períodos consecutivos en un programa académico de una Institución de Educación Superior hasta un semestre determinado. Es decir, el número acumulado de desertores de una cohorte hasta un semestre determinado, sobre los primíparos de esa cohorte.' },
        { termino: 'Deserción por período (SPADIES 2.8)', definicion: 'Proporción de estudiantes que estando matriculados dos semestres atrás son clasificados como desertores un año después. Matemáticamente se toma el número de desertores en t sobre los matriculados no graduados en t-2.' },
        { termino: 'Deserción promedio acumulada', definicion: 'Proporción de estudiantes de todas las cohortes que no ha registrado matrícula por dos o más períodos académicos consecutivos en un programa de una Institución de Educación Superior hasta un semestre determinado. Es decir, el conteo acumulado de desertores hasta un semestre determinado de todas las cohortes que tienen hasta ese semestre, sobre la totalidad de primíparos de dichas cohortes.' }
      ]
    },
    {
      titulo: 'Trayectoria del estudiante',
      terminos: [
        { termino: 'Graduado', definicion: 'Estudiante que ha recibido el grado por parte de la Institución de Educación Superior como muestra de la culminación de su ciclo académico. Un estudiante que termina materias, pero que no ha obtenido el título es un egresado no graduado y puede ser catalogado como desertor de acuerdo con el criterio de deserción.' },
        { termino: 'Período', definicion: 'Semestre de matrícula del estudiante.' },
        { termino: 'Período de ingreso', definicion: 'Cohorte a la cual pertenece el estudiante.' },
        { termino: 'Retirado', definicion: 'Estudiante que se ausenta de un programa académico de una Institución de Educación Superior en un período por motivos disciplinarios (no académicos). Incurren en faltas disciplinarias graves que implican su expulsión.' }
      ]
    },
    {
      titulo: 'Programas de Sapiencia',
      terminos: [
        { termino: 'Fondo EPM y Universidades', definicion: 'Fondo de créditos condonables para educación superior financiado con recursos de EPM y de las universidades aliadas.' },
        { termino: 'Fondo con recursos de Presupuesto Participativo (PP)', definicion: 'Fondo de créditos condonables financiado con recursos de Presupuesto Participativo priorizados por las comunas y corregimientos.' },
        { termino: 'Becas Tecnologías', definicion: 'Programa de becas para programas tecnológicos en instituciones de educación superior aliadas.' },
        { termino: 'Matrícula Cero', definicion: 'Política de gratuidad en la matrícula para estudiantes de pregrado de las instituciones de educación superior del municipio.' },
        { termino: 'Línea de créditos condonables (pregrado y posgrado)', definicion: 'Línea de los programas de acceso de Sapiencia que agrupa los fondos de créditos condonables para pregrado y para posgrado (Formación Avanzada, Extendiendo Fronteras Educativas y Enlaza Mundos).' },
        { termino: 'Línea de Becas Futuro', definicion: 'Línea de los programas de acceso que agrupa las becas para Mejores Bachilleres, Mejores Deportistas, Talento Especializado y Formación Avanzada.' },
        { termino: 'Gestión de cartera', definicion: 'Seguimiento a las obligaciones de los créditos que pasaron a cobro: estado, acuerdos de pago y reestructuraciones.' }
      ]
    }
  ]
};
