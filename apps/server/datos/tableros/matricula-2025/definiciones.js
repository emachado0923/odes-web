/* Textos del tablero de matrícula de educación superior en Medellín.
   Este archivo está pensado para ser editado por el área: lo que se declare
   aquí es lo que muestran la ventana de bienvenida y el pie de las descargas. */
window.ODES = window.ODES || {};

window.ODES.definiciones = {

  /* Ventana que se abre al iniciar el tablero. Cada paso lleva un ícono de
     Material Symbols, un título corto y su explicación. */
  intro: {
    etiqueta: 'Sobre este informe',
    titulo: 'Tablero matrícula en educación superior en Medellín (2025)',
    texto: 'Este reporte presenta información de la matrícula de los programas con ' +
      'oferta en el Distrito de Medellín, según el Sistema Nacional de Información ' +
      'de la Educación Superior (SNIES). Explore las diferentes secciones y ' +
      'segmente la información con los filtros: se aplican a la vez a los ' +
      'indicadores, a los gráficos y a las tablas.',
    subtitulo: 'Cómo usar el tablero',
    pasos: [
      { icono: 'dashboard', titulo: 'Secciones',
        texto: 'Los botones de la parte superior permiten navegar entre las siete ' +
          'secciones sin perder los filtros aplicados.' },
      { icono: 'tune', titulo: 'Filtros',
        texto: 'Use el botón Personalizar en la sección de filtros para elegir qué ' +
          'filtros se muestran. Los aplicados aparecen como etiquetas en la parte ' +
          'inferior de la sección.' },
      { icono: 'ads_click', titulo: 'Clic en las visualizaciones',
        texto: 'Un clic sobre los elementos de las visualizaciones o sobre una fila ' +
          'de una tabla aplica ese filtro y otro clic lo retira.' },
      { icono: 'bar_chart', titulo: 'Lectura de las barras',
        texto: 'Cada barra de color muestra la matrícula de una categoría y la franja ' +
          'gris detrás de ella llega hasta el valor de la categoría con mayor ' +
          'matrícula, para comparar.' },
      { icono: 'swap_vert', titulo: 'Tablas',
        texto: 'Un clic en el título de una columna ordena la tabla. La fila de ' +
          'total queda fija al final.' },
      { icono: 'download', titulo: 'Descargas',
        texto: 'Cada visualización permite descargar los datos en CSV o el gráfico ' +
          'como imagen, con título y fuente.' }
    ],
    boton: 'Ingresar al tablero'
  },

  observatorio: 'Observatorio de Sapiencia',

  fuente: 'Fuente: Sistema de Información Nacional de la Educación Superior (SNIES)',
  nota: 'Fuente: Sistema Nacional de Información de la Educación Superior (SNIES) - MEN'
};
