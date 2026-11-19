/* Textos del tablero de pertinencia de los programas de formación.
   Este archivo está pensado para ser editado por el área: lo que se declare
   aquí es lo que muestran la ventana de bienvenida, el paso a paso y el pie
   de las descargas. */
window.ODES = window.ODES || {};

window.ODES.definiciones = {

  /* Ventana que se abre al iniciar el tablero. */
  intro: {
    etiqueta: 'Sobre esta consulta',
    titulo: 'Tablero pertinencia programas de formación',
    texto: 'Índice de pertinencia y puntaje PUAP de cada programa, según la Resolución 3411 de 2026.',
    subtitulo: '¿Cómo usar la consulta?',
    pasos: [
      { icono: 'account_balance', titulo: 'Elija la institución',
        texto: 'Acota la lista de programas.' },
      { icono: 'menu_book', titulo: 'Elija el programa',
        texto: 'Por nombre o por código SNIES.' },
      { icono: 'work', titulo: 'Revise las ocupaciones',
        texto: 'A las que da acceso y cuáles se relacionan con la ciudad.' },
      { icono: 'calculate', titulo: 'Lea el índice y el puntaje',
        texto: 'Con el cálculo que los sustenta.' }
    ],
    boton: 'Ingresar a la consulta'
  },

  /* Paso a paso de la metodología, en la parte superior de la página. */
  metodologia: {
    titulo: '¿Cómo se mide la pertinencia?',
    texto: '',
    pasos: [
      { icono: 'flag', titulo: 'Marcación',
        texto: 'Se relaciona cada ocupación de la Clasificación Única de Ocupaciones para Colombia (CUOC) con los clústeres y proyectos estratégicos de la ciudad.' },
      { icono: 'account_tree', titulo: 'Habilitación',
        texto: 'Se identifican las ocupaciones que habilita cada campo de formación, de forma directa o complementaria.' },
      { icono: 'calculate', titulo: 'Índice',
        texto: 'Se calcula un índice de 0 a 100 con la proporción ponderada de ocupaciones relacionadas entre todas las que habilita el campo.' },
      { icono: 'military_tech', titulo: 'Puntaje',
        texto: 'Se convierte el índice del campo en los puntos de la línea del PUAP a la que aspira la persona.' }
    ]
  },

  /* Tarjeta de los referentes estratégicos. */
  referentes: {
    titulo: '¿Cuáles son los clústeres y proyectos estratégicos?',
    clusteres: 'Clústeres estratégicos',
    proyectos: 'Proyectos estratégicos de ciudad',
    /* Color de cada referente: uno de los seis primarios de Sapiencia
       (azul, celeste, magenta, verde, amarillo, naranja). */
    colores: {
      'Energía Sostenible': 'verde',
      'Moda y Fabricación Avanzada': 'magenta',
      'Medellín Health City': 'celeste',
      'Hábitat Sostenible': 'azul',
      'Turismo de Negocios': 'naranja',
      'Negocios Digitales': 'azul',
      'Agroalimentario': 'amarillo',
      'Industrias Creativas': 'magenta',
      'Habilidades Digitales': 'celeste',
      'Medellín Capital Creativa': 'naranja',
      'Distrito Bilingüe': 'verde'
    },
    /* Ícono de Material Symbols de cada referente. */
    iconos: {
      'Energía Sostenible': 'bolt',
      'Moda y Fabricación Avanzada': 'checkroom',
      'Medellín Health City': 'medical_services',
      'Hábitat Sostenible': 'apartment',
      'Turismo de Negocios': 'luggage',
      'Negocios Digitales': 'devices',
      'Agroalimentario': 'agriculture',
      'Industrias Creativas': 'palette',
      'Habilidades Digitales': 'code',
      'Medellín Capital Creativa': 'music_note',
      'Distrito Bilingüe': 'translate'
    }
  },

  /* Textos de las líneas del PUAP. */
  lineas: {
    pregrado: { nombre: 'Pregrado', corto: 'Crédito condonable de pregrado',
      regla: 'De 5 a 15 puntos según el índice. Sin ocupaciones relacionadas, 5 puntos.' },
    efe: { nombre: 'Extendiendo Fronteras Educativas', corto: 'Crédito condonable de posgrado nacional',
      regla: '10 puntos si el índice supera 50. En caso contrario, 0 puntos.' },
    em: { nombre: 'Enlaza Mundos', corto: 'Crédito condonable de posgrado en el exterior',
      regla: 'De 1 a 15 puntos según el índice aplicable.' }
  },

  /* Tarjeta giratoria del final: qué significa cada número. */
  significados: {
    titulo: '¿Qué significa cada número?',
    pista: 'Haga clic para ver la explicación de cada elemento',
    volver: 'Volver',
    items: [
      { clave: 'hab', nombre: 'Ocupaciones habilitadas',
        texto: 'Ocupaciones a las que da acceso la formación del campo. Las directas son la vía ordinaria de acceso y pesan 1,0; las complementarias permiten ejercerla en funciones específicas y pesan 0,5.' },
      { clave: 'rel', nombre: 'Ocupaciones relacionadas con la ciudad',
        texto: 'Ocupaciones habilitadas que se vinculan con por lo menos uno de los ocho clústeres o tres proyectos estratégicos de Medellín.' },
      { clave: 'pop', nombre: 'Proporción ponderada, POP',
        texto: 'Suma ponderada de las ocupaciones relacionadas dividida entre la suma ponderada de todas las ocupaciones habilitadas. Va de 0 a 1.' },
      { clave: 'ip', nombre: 'Índice de pertinencia',
        texto: 'La POP llevada a la escala de 0 a 100 y redondeada al entero superior. Todos los programas de un mismo campo de formación reciben el mismo índice.' },
      { clave: 'pts', nombre: 'Puntaje PUAP',
        texto: 'Puntos que recibe la persona aspirante en el criterio de pertinencia de su línea: de 5 a 15 en pregrado y 10 o 0 en posgrado nacional, según el índice supere 50.' }
    ]
  },

  aviso: 'El índice no califica la calidad del programa ni de la institución.',

  /* Nota al final del tablero. */
  notaFinal: 'La presencia de un programa en esta herramienta de consulta no habilita su financiación en el Programa Único de Acceso y Permanencia. El índice y el puntaje solo informan el criterio de pertinencia; la elegibilidad del programa y de la persona aspirante se rige por los términos de cada convocatoria.',

  observatorio: 'Observatorio de Sapiencia',

  fuente: 'Fuente: Resolución 3411 de 2026 de la Agencia de Educación Postsecundaria de Medellín - Sapiencia.',
  nota: 'Fuente: Resolución 3411 de 2026 de la Agencia de Educación Postsecundaria de Medellín - Sapiencia'
};
