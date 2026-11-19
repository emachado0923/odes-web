/**
 * Contenido de la cabecera y el pie oficiales de https://sapiencia.gov.co/
 * (recreación de su header y su footer en /pertinencia). EDITAR AQUÍ: los
 * componentes de componentes/sapiencia/ solo pintan estos datos.
 *
 * Capturado del sitio oficial el 26 de octubre de 2026 (DOM en vivo, Chrome
 * headless): textos, direcciones y orden tal como están allá. Si el sitio
 * cambia, se actualizan estas listas y FECHA_CAPTURA.
 *
 * - `pestanaNueva`: el sitio oficial abre en otra pestaña (window.open con
 *   '_blank') los enlaces externos, los PDF, las redes y los mapas; los demás
 *   (páginas de sapiencia.gov.co) se abren en la misma. Los componentes
 *   agregan rel="noopener noreferrer" y el aviso "(se abre en una pestaña
 *   nueva)" para lectores de pantalla.
 * - Los títulos se escriben como en el sitio; el CSS los pasa a mayúsculas
 *   donde el sitio lo hace (text-transform), así los lectores no deletrean.
 */

/** Día de la captura del sitio oficial (AAAA-MM-DD). */
export const FECHA_CAPTURA = '2026-10-26'

/** Inicio del sitio oficial: destino del logo de la cabecera. */
export const URL_SAPIENCIA = 'https://sapiencia.gov.co/'

export interface EnlaceOficial {
  texto: string
  url: string
  /** Se abre en otra pestaña, como en el sitio oficial. */
  pestanaNueva?: boolean
}

/* ---------------------------------------------------------------------------
 * Barra GOV.CO (franja azul de arriba)
 * ------------------------------------------------------------------------- */

export const GOVCO = {
  /** El logo GOV.CO lleva al portal del Estado colombiano (otra pestaña, como en el sitio). */
  url: 'https://www.gov.co/',
  textoAccesibilidad: 'Opciones de Accesibilidad',
  textoIdioma: 'Idioma',
} as const

/**
 * Menú "Idioma". En el sitio oficial es el plugin GTranslate (traducción de
 * Google con sus scripts, que la CSP de esta aplicación no permite). Aquí
 * "Inglés" abre la traducción de Google de la página actual en otra pestaña y
 * "Español" es la página tal cual (el idioma actual).
 */
export const IDIOMAS = {
  ingles: 'Inglés',
  espanol: 'Español',
  /** Traducción de Google de una dirección (sl = idioma de origen, tl = destino). */
  traductor: (url: string) => `https://translate.google.com/translate?sl=es&tl=en&hl=es&u=${encodeURIComponent(url)}`,
} as const

/* ---------------------------------------------------------------------------
 * Menú principal (Max Mega Menu del sitio oficial)
 * ------------------------------------------------------------------------- */

export interface GrupoMenu {
  /** Título del grupo (h4 del sitio); sin título, solo la lista. */
  titulo?: string
  enlaces: readonly EnlaceOficial[]
}

export interface ColumnaMenu {
  /**
   * 'menu': widget de menú de WordPress (enlaces con relleno de 6 × 10 px).
   * 'bloques': el bloque HTML de "Formación" (PROGRAMAS / BENEFICIOS SAPIENCIA:
   * enlaces sin relleno, con sangría y 8 px entre uno y otro).
   */
  estilo: 'menu' | 'bloques'
  grupos: readonly GrupoMenu[]
}

export interface ItemMenu {
  texto: string
  /** Ítem sin submenú: enlace directo. */
  url?: string
  /** Ítem con submenú: columnas del panel. */
  columnas?: readonly ColumnaMenu[]
  /** Panel angosto (420 px) alineado a la derecha de la barra, como "Prensa". */
  panelDerecha?: boolean
}

const S = URL_SAPIENCIA

export const MENU_PRINCIPAL: readonly ItemMenu[] = [
  {
    texto: 'Nosotros',
    columnas: [
      {
        estilo: 'menu',
        grupos: [
          {
            enlaces: [
              { texto: 'Historia Sapiencia', url: `${S}historia/` },
              { texto: 'Valores Corporativos', url: `${S}valores-corporativos/` },
              { texto: 'Misión y visión', url: `${S}mision-y-vision-2/` },
              { texto: 'Funciones', url: `${S}?page_id=6270` },
              { texto: 'Propuesta de valor', url: `${S}propuesta_de_valor/` },
              { texto: 'Glosario', url: `${S}glosario/` },
              { texto: 'Ciudadela Universitaria', url: `${S}ciudadelas-universitarias-sapiencia/` },
              { texto: 'Investigación', url: `${S}investigacion/` },
              { texto: 'Alianzas', url: `${S}alianzas-2/` },
            ],
          },
        ],
      },
    ],
  },
  {
    texto: 'Formación',
    columnas: [
      {
        estilo: 'bloques',
        grupos: [
          {
            titulo: 'PROGRAMAS',
            enlaces: [
              { texto: '@Medellín', url: `${S}arroba-medellin/` },
              { texto: 'Estud-IA', url: `${S}estudia/` },
              { texto: 'Medellínglish', url: `${S}medellinglish/` },
            ],
          },
          {
            titulo: 'BENEFICIOS SAPIENCIA',
            enlaces: [
              { texto: 'Tarifa preferencial Metro', url: `${S}tarifa-preferencial-metro-2/` },
              { texto: 'Conexión Sapiencia', url: `${S}conexion-sapiencia/` },
            ],
          },
        ],
      },
      {
        estilo: 'menu',
        grupos: [
          {
            titulo: 'Fondos créditos condonables',
            enlaces: [
              { texto: 'Pregrados', url: `${S}fondos-sapiencia/pregrados/` },
              { texto: 'Posgrados Nacionales', url: `${S}fondos-sapiencia/posgrados_nacionales/` },
              { texto: 'Posgrados Internacionales', url: `${S}fondos-sapiencia/posgrados_internacionales/` },
              { texto: 'Consejeros distritales de juventud', url: `${S}consejeros-distritales-de-juventud/` },
            ],
          },
        ],
      },
      {
        estilo: 'menu',
        grupos: [
          {
            titulo: 'Línea Becas',
            enlaces: [
              { texto: 'Becas Mejores Bachilleres', url: `${S}fondos-sapiencia/becas-mejores-bachilleres/` },
              { texto: 'Becas Mejores Deportistas', url: `${S}fondos-sapiencia/becas-mejores-deportistas/` },
              { texto: 'Becas Maestros', url: `${S}fondos-sapiencia/posgrados_maestros/` },
              { texto: 'Matrícula Cero', url: `${S}matricula-cero/` },
            ],
          },
        ],
      },
    ],
  },
  { texto: 'Convocatorias', url: `${S}convocatorias/` },
  { texto: 'Transparencia', url: `${S}transparencia/` },
  {
    texto: 'Atención a la ciudadanía',
    columnas: [
      {
        estilo: 'menu',
        grupos: [
          {
            enlaces: [
              {
                texto: 'Política de atención a la ciudadanía',
                url: `${S}wp-content/uploads/2023/09/politica-atencion-a-la-ciudadania-28.8.2023.pdf`,
                pestanaNueva: true,
              },
              { texto: 'Canales de atención', url: `${S}contactanos/` },
              { texto: 'Tramites y servicios', url: `${S}transparencia/#1761236816369-d6e184b3-76f4` },
              { texto: 'PQRSDF', url: `${S}pqrsdf-2/` },
              { texto: 'Encuesta de satisfacción – Servicios y trámites', url: `${S}encuesta-de-satisfaccion-2/` },
              { texto: 'Resultado de las encuestas', url: `${S}resultados_de_encuestas/` },
              { texto: 'Caracterización grupos de valor', url: `${S}caracterizacion_de_usuarios/` },
              {
                texto: 'Carta de trato digno',
                url: `${S}wp-content/uploads/2026/07/carta-trato-digno_compressed.pdf`,
                pestanaNueva: true,
              },
              {
                texto: 'Manual de atención a la ciudadanía',
                url: `${S}wp-content/uploads/2026/07/manual-atencion-a-la-ciudadania-1.pdf`,
                pestanaNueva: true,
              },
              { texto: 'Preguntas frecuentes', url: `${S}preguntas-frecuentes-sapiencia/` },
            ],
          },
        ],
      },
    ],
  },
  { texto: 'Participa', url: `${S}participa_/` },
  { texto: 'Observatorio', url: `${S}observatorio/` },
  {
    texto: 'Prensa',
    panelDerecha: true,
    columnas: [
      {
        estilo: 'menu',
        grupos: [
          {
            enlaces: [
              { texto: 'Noticias', url: `${S}prensa/` },
              { texto: 'Sapiencia soy yo', url: `${S}sapiencia-soy-yo/` },
            ],
          },
        ],
      },
    ],
  },
]

/** Buscador del sitio oficial: formulario GET a la raíz de WordPress con el parámetro s (https://sapiencia.gov.co/?s=…). */
export const BUSQUEDA = { accion: URL_SAPIENCIA, parametro: 's' } as const

/* ---------------------------------------------------------------------------
 * Panel de accesibilidad (el del plugin "One Click Accessibility" del sitio)
 * ------------------------------------------------------------------------- */

/** Enlaces al pie del panel, cada uno en su propio bloque con filete, como en el sitio. */
export const ACCESIBILIDAD_ENLACES: readonly EnlaceOficial[] = [
  { texto: 'Centro de Relevo', url: 'https://centroderelevo.gov.co/632/w3-channel.html', pestanaNueva: true },
  {
    texto: 'Certificado de accesibilidad web',
    url: 'https://sapienciagov-my.sharepoint.com/:f:/g/personal/comunicaciones_sapiencia_gov_co/IgC6-HeTV7uGTJehxaeMptWLAV8LAeqVccH3ivk8hcVPs9I?e=n0jicH',
  },
]

/* ---------------------------------------------------------------------------
 * Pie
 * ------------------------------------------------------------------------- */

export interface Contacto {
  icono: 'telefono' | 'correo'
  titulo: string
  detalle: string
}

export type RedSocial = 'linkedin' | 'x' | 'youtube' | 'facebook' | 'instagram' | 'tiktok'

export interface EnlaceRed {
  red: RedSocial
  /** Nombre accesible del enlace (el sitio solo tiene el ícono). */
  nombre: string
  url: string
}

export interface Horario {
  dias: string
  horas: string
}

export const PIE = {
  nombre: 'Agencia de Educación Postsecundaria de Medellín - SAPIENCIA.',
  tituloContacto: 'Contáctanos',
  contacto: [
    { icono: 'telefono', titulo: 'Línea de servicio a la ciudadanía', detalle: 'Teléfono conmutador: +57 604 444 79 47' },
    { icono: 'telefono', titulo: 'Línea Anticorrupción', detalle: 'Teléfono conmutador: +57 604 444 79 47' },
    { icono: 'correo', titulo: 'Correo electrónico', detalle: 'info@sapiencia.gov.co' },
    { icono: 'correo', titulo: 'Correo Anticorrupción', detalle: 'transparencia@sapiencia.gov.co' },
    { icono: 'correo', titulo: 'Notificaciones Judiciales', detalle: 'notificacionesjudiciales@sapiencia.gov.co' },
  ] satisfies readonly Contacto[],
  tituloRedes: 'Síguenos',
  redes: [
    { red: 'linkedin', nombre: 'Sapiencia en LinkedIn', url: 'https://www.linkedin.com/company/sapienciamed/mycompany/' },
    { red: 'x', nombre: 'Sapiencia en X (antes Twitter)', url: 'https://twitter.com/SapienciaMed' },
    { red: 'youtube', nombre: 'Sapiencia en YouTube', url: 'https://www.youtube.com/user/SapienciaMed' },
    { red: 'facebook', nombre: 'Sapiencia en Facebook', url: 'https://www.facebook.com/sapienciamed/' },
    { red: 'instagram', nombre: 'Sapiencia en Instagram', url: 'https://www.instagram.com/SapienciaMed/' },
    { red: 'tiktok', nombre: 'Sapiencia en TikTok', url: 'https://www.tiktok.com/@sapienciamed_?_t=8beijJXOHAc&_r=1' },
  ] satisfies readonly EnlaceRed[],

  tituloContratacion: 'Contratación',
  /** El primero lleva debajo el logo de Colombia Compra Eficiente (SECOP), dentro del mismo enlace. */
  contratacion: [
    { texto: 'Procesos Contractuales', url: 'https://www.colombiacompra.gov.co/colombia-compra/secop', pestanaNueva: true },
    { texto: 'Listado de procesos contractuales', url: `${S}?page_id=10833` },
    {
      texto: 'Gobierno en línea',
      url: 'https://www.mintic.gov.co/portal/inicio/Glosario/G/5306:Gobierno-en-Linea-GEL#:~:text=Gobierno%20en%20L%C3%ADnea%20es%20una,y%20las%20Comunicaciones%20(T.I.C).',
      pestanaNueva: true,
    },
  ] satisfies readonly EnlaceOficial[],
  tituloPoliticas: 'Políticas',
  politicas: [
    {
      texto: 'Política de privacidad y condiciones de uso',
      url: `${S}wp-content/uploads/2022/09/politicas-de-privacidad-y-condiciones-de-uso-de-la-pagina-web.pdf`,
      pestanaNueva: true,
    },
    {
      texto: 'Política de Tratamiento y protección de datos personales',
      url: `${S}wp-content/uploads/2023/10/manual-de-politica-interna-de-tratamiento-y-proteccion-de-datos-personales-v3.pdf`,
      pestanaNueva: true,
    },
    { texto: 'Política de derechos de autor', url: `${S}politicas-institucionales-y-de-mipg/` },
    {
      texto: 'Carta de trato digno a la ciudadanía',
      url: `${S}wp-content/uploads/2026/07/carta-trato-digno_compressed.pdf`,
      pestanaNueva: true,
    },
    { texto: 'Mapa del Sitio', url: `${S}mapa-del-sitio/` },
    { texto: 'Ofertas de empleo', url: 'https://www.medellin.gov.co/es/temas-de-ciudad/empleo/', pestanaNueva: true },
  ] satisfies readonly EnlaceOficial[],
  /** Logos al final de la columna: Colombia (marca país) y GOV.CO. */
  urlColombia: 'https://www.colombia.co/',
  urlGovco: 'https://www.gov.co/',

  tituloUbicacion: 'Ubicación',
  sedePrincipal: {
    nombre: 'Sede principal',
    mapa: 'https://www.google.com/maps/place/Agencia+de+Educaci%C3%B3n+Postsecundaria+de+Medell%C3%ADn+-+Sapiencia/@6.2713874,-75.5779593,15z/data=!4m6!3m5!1s0x8e44296cd6685d81:0xc1c244c9525ea0ba!8m2!3d6.2713674!4d-75.5779351!16s%2Fg%2F11b5_0h1fz',
    direccion: ['Transversal 73 # 65 - 296', 'Sector El Volador, Medellín'],
    horario: [
      { dias: 'Lunes a jueves', horas: '8:00 a.m. a 12:30 p.m. y 1:30 p.m. a 5:15 p.m.' },
      { dias: 'Viernes', horas: '8:00 a.m. a 12:30 p.m. y 1:30 p.m. a 4:00 p.m.' },
    ] satisfies readonly Horario[],
  },
  sedeOccidente: {
    nombre: 'Sede Ciudadela Occidente',
    peatonal: { titulo: 'Dirección peatonal', direccion: 'Calle 42C Número 95 - 50', mapa: 'https://goo.gl/maps/yJu3jQbzWLcMKBc18' },
    vehicular: { titulo: 'Dirección vehicular', direccion: 'Calle 38 Número 94 - 50', mapa: 'https://goo.gl/maps/MAeqHv59g3VBpcS28' },
    /** En el sitio van lado a lado, cada uno con sus horas debajo. */
    horario: [
      { dias: 'Lunes a viernes', horas: '6:00 am - 10:00 pm' },
      { dias: 'sábados', horas: '6:00 am - 02:00 pm' },
    ] satisfies readonly Horario[],
  },
  tituloHorario: 'Horario:',
  fechaActualizacion: 'Fecha última actualización 30/07/2026',
} as const
