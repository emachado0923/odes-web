/**
 * Lectura de una ficha de la ventanilla: nombres de los programas, búsqueda de
 * campos y columnas por etiqueta, números y pesos, y el resumen de un beneficio
 * (periodos, estado actual, total girado). Todo sale de la ficha genérica: si
 * una etiqueta no está, la función devuelve vacío o null y la pantalla la omite.
 */
import { type CategoriaEstado, categoriaEstado, claveTexto } from './estados'
import type { FichaFondos, Tabla } from './tipos'

export interface Programa {
  nombre: string
  /** Para chips y pestañas. */
  corto: string
  linea: 'Pregrado' | 'Posgrado' | 'Movilidad internacional' | 'Reportes'
}

export const PROGRAMAS: Record<string, Programa> = {
  EPM: { nombre: 'Fondo EPM', corto: 'Fondo EPM', linea: 'Pregrado' },
  PP: { nombre: 'Fondo Presupuesto Participativo', corto: 'Presupuesto Participativo', linea: 'Pregrado' },
  'PUAP RO': { nombre: 'Programa Único de Acceso y Permanencia, recursos ordinarios', corto: 'PUAP recursos ordinarios', linea: 'Pregrado' },
  'PUAP PP': { nombre: 'Programa Único de Acceso y Permanencia, Presupuesto Participativo', corto: 'PUAP Presupuesto Participativo', linea: 'Pregrado' },
  CDJ: { nombre: 'Fondo del Consejo Distrital de Juventud', corto: 'Consejo Distrital de Juventud', linea: 'Pregrado' },
  MB: { nombre: 'Becas Mejores Bachilleres', corto: 'Mejores Bachilleres', linea: 'Pregrado' },
  MD: { nombre: 'Becas Mejores Deportistas', corto: 'Mejores Deportistas', linea: 'Pregrado' },
  FA: { nombre: 'Formación Avanzada', corto: 'Formación Avanzada', linea: 'Posgrado' },
  EFE: { nombre: 'Extendiendo Fronteras Educativas', corto: 'Extendiendo Fronteras', linea: 'Posgrado' },
  EM: { nombre: 'Enlaza Mundos', corto: 'Enlaza Mundos', linea: 'Movilidad internacional' },
  EVENTOS: { nombre: 'Historial de eventos', corto: 'Eventos', linea: 'Reportes' },
}

export const nombrePrograma = (clave: string): string => PROGRAMAS[clave]?.nombre ?? clave
export const cortoPrograma = (clave: string): string => PROGRAMAS[clave]?.corto ?? clave

/** Los pares de una sección por su título («Datos personales»), o [] si la ficha no la trae. */
export function seccion(ficha: FichaFondos, titulo: string): [string, string][] {
  const k = claveTexto(titulo)
  return ficha.s.find(([t]) => claveTexto(t) === k)?.[1] ?? []
}

/** El valor de un campo por su etiqueta, en cualquier sección (o solo en `enSeccion`). Vacío si no está. */
export function campo(ficha: FichaFondos, etiqueta: string, enSeccion?: string): string {
  const k = claveTexto(etiqueta)
  const secciones = enSeccion ? [[enSeccion, seccion(ficha, enSeccion)] as const] : ficha.s
  for (const [, pares] of secciones) {
    const par = pares.find(([e]) => claveTexto(e) === k)
    if (par) return par[1]
  }
  return ''
}

/** La primera tabla de la ficha: el historial por periodo (o el de eventos). */
export const tablaHistorial = (ficha: FichaFondos): Tabla | null => ficha.t[0] ?? null

/** Posición de la primera columna que se llame como alguno de `nombres` (sin distinguir tildes ni mayúsculas); -1 si ninguna. */
export function indiceColumna(tabla: Tabla, ...nombres: string[]): number {
  const columnas = tabla[1].map(claveTexto)
  for (const nombre of nombres) {
    const i = columnas.indexOf(claveTexto(nombre))
    if (i !== -1) return i
  }
  return -1
}

/** «$ 3.800.000» → 3800000; «6» → 6; «4,5» → 4.5; vacío o texto → null. */
export function aNumero(texto: string | null | undefined): number | null {
  const limpio = (texto ?? '').replaceAll(/[$\s]/g, '')
  if (!limpio || !/^-?[\d.,]+$/.test(limpio)) return null
  const n = Number(limpio.replaceAll('.', '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

const FORMATO_ENTERO = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 })
const FORMATO_UNA = new Intl.NumberFormat('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** 3800000 → «$ 3.800.000». */
export const pesos = (n: number): string => `$ ${FORMATO_ENTERO.format(Math.round(n))}`

/** 3800000 → «$ 3,8 millones»; 950000 → «$ 950 mil»; para cifras grandes de un vistazo. */
export function pesosCortos(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1e6) return `$ ${FORMATO_UNA.format(n / 1e6)} ${Math.abs(n / 1e6) < 1.95 && Math.abs(n / 1e6) >= 0.95 && FORMATO_UNA.format(n / 1e6) === '1,0' ? 'millón' : 'millones'}`
  if (abs >= 1e3) return `$ ${FORMATO_ENTERO.format(n / 1e3)} mil`
  return pesos(n)
}

/**
 * «1000547866» → «1.000.547.866» (solo si son dígitos; un pasaporte queda igual). Agrupa el texto, sin pasarlo
 * por Number: un número de más de 15 dígitos perdería precisión y se mostraría otro documento.
 */
export function formatoDocumento(documento: string): string {
  return /^\d{4,}$/.test(documento) ? documento.replaceAll(/\B(?=(\d{3})+(?!\d))/g, '.') : documento
}

/** Fecha de corte de los datos cargados (el Power BI de seguimiento). Se actualiza con cada carga nueva de fichas. */
export const CORTE_DATOS = '9 de noviembre de 2026'

const MINUSCULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'en', 'a', 'el', 'para', 'por', 'con', 'al', 'o', 'u'])
const SIGLAS = new Set([
  'ITM', 'EAFIT', 'CES', 'UPB', 'UNAL', 'UDEA', 'SENA', 'EPM', 'ICETEX', 'PACC', 'PQRS', 'TI', 'CC', 'CE', 'PPT', 'NIT', 'IES', 'SNIES', 'ESUMER',
  'CEIPA', 'EIA', 'UNAULA', 'UCC', 'UCO', 'USB', 'IU', 'CUN', 'PUAP', 'PP', 'RO', 'TIC', 'SAS', 'S.A.', 'S.A.S.', 'II', 'III', 'IV', 'FUNLAM', 'IDEA',
  'UNAD', 'UNAC', 'ESCOLME', 'ECCI', 'ATEC', 'IUMAFIS', 'ESAP', 'FUSBC', 'UNIMINUTO',
])

const sinTildes = (texto: string): string => texto.normalize('NFD').replaceAll(/[̀-ͯ]/g, '')

/**
 * Palabras que las bases traen sin tilde (o sin ñ) y que siempre la llevan: vocabulario de instituciones,
 * programas académicos, lugares y trámites, tomado de las palabras más frecuentes de las fichas. No hay
 * nombres ni apellidos de personas a propósito: los de las personas se muestran como están en la base.
 */
const CON_TILDE = new Map(
  `matrícula medellín institución bogotá ingeniería ingenierías tecnología tecnologías católica católico tecnológico tecnológica tecnológicos
  tecnológicas administración educación politécnico politécnica psicología fundación gestión corporación diseño comunicación belén contaduría
  pública público públicas públicos información énfasis física físico autónoma autónomo américa américas latinoamérica básica básico informática
  informático mecánica mecánico cristóbal química químico producción análisis bioanálisis electrónica electrónico enfermería gráfico gráfica
  gráficos gráficas inglés francés alemán portugués japonés español española técnica técnico técnicas técnicos eléctrica eléctrico economía
  económica económicas biomédica biomédico electromecánica electromecánicos construcción matemáticas matemática plásticas odontología pedagogía
  pedagógica mecatrónica mecatrónicos suárez filosofía arquitectónicos recreación nutrición dietética política políticas político música
  biología biológica atención microbiología sebastián instrumentación farmacéutica investigación tomás bioingeniería programación
  bacteriología clínico clínica logística estadística quirúrgica sociología auditoría gastronomía gastronómicos histocitotecnología españa
  planeación criminalística criminología agrícola artística artístico artísticas agronómica antropología turística turísticas turísticos
  geológica geología visión débora aeronáutica prácticas práctica televisión traducción animación bibliotecología petróleos maestría filología
  hispánica teología biotecnología biotecnológica fonoaudiología computación fotografía organización gerontología área sistematización
  astronomía energía automatización martín nanotecnología pasantía méxico prótesis decoración tecnólogos tecnólogo archivística itagüí bíblico
  promoción grabación evaluación dramático edición caracterización operación hotelería nariño realización innovación canadá optometría
  intervención cibernéticos ejecución antioqueña límite comité fidubogotá maría josé andrés cédula ciudadanía extranjería protección crédito
  condonación suspensión finalización terminación cancelación renovación legalización notificación resolución número título académico
  académica académicos académicas jurídica jurídico médica médico robótica telemática genética ética estética didáctica lingüística escénicas
  cosmetología geografía consultoría asesoría dirección formación prevención rehabilitación especialización homologación extensión inclusión
  región unión acción bolívar jardín perú panamá japón bélgica hungría turquía república países sudáfrica taiwán cúcuta ibagué popayán
  montería quibdó chocó córdoba boyacá atlántico caquetá quindío apartadó támesis jericó sonsón peñol guatapé jerónimo amagá titiribí
  angelópolis chigorodó necoclí yolombó berrío valparaíso bárbara cáceres tarazá nechí vegachí yalí anorí briceño entrerríos donmatías
  alejandría concepción cocorná murindó vigía mutatá urabá abriaquí buriticá anzá yondó ebéjico sopetrán cañasgordas`
    .split(/\s+/)
    .filter(Boolean)
    .map((palabra) => [sinTildes(palabra), palabra] as const),
)

/** Nombres propios que no se resuelven palabra por palabra («amigo» sí es una palabra común). */
const FRASES: readonly (readonly [RegExp, string])[] = [[/\bLuis Amigo\b/g, 'Luis Amigó']]

/**
 * Pasa a minúsculas un texto que viene TODO en mayúsculas. Si ya trae alguna minúscula, alguien lo escribió con
 * cuidado y se deja como está. `titulo`: cada palabra con mayúscula inicial, salvo conectores; si no, solo la
 * primera. `tildes`: repone las de CON_TILDE. Las siglas conocidas se conservan.
 */
function aLegible(texto: string | null | undefined, titulo: boolean, tildes: boolean): string {
  const limpio = (texto ?? '').replaceAll(/\s+/g, ' ').trim()
  if (!limpio || limpio !== limpio.toUpperCase()) return limpio
  const legible = limpio
    .split(' ')
    .map((palabra, i) => {
      if (SIGLAS.has(palabra) || SIGLAS.has(palabra.replaceAll(/[(),.;:]/g, ''))) return palabra
      let minuscula = palabra.toLowerCase()
      if (tildes) minuscula = minuscula.replaceAll(/\p{L}+/gu, (tramo) => CON_TILDE.get(sinTildes(tramo)) ?? tramo)
      if (!titulo) return i === 0 ? minuscula.replace(/\p{L}/u, (letra) => letra.toUpperCase()) : minuscula
      if (i > 0 && MINUSCULAS.has(minuscula)) return minuscula
      return minuscula.replaceAll(/(^|[-/(«"'])(\p{L})/gu, (_, antes: string, letra: string) => antes + letra.toUpperCase())
    })
    .join(' ')
  return tildes ? FRASES.reduce((resultado, [patron, reemplazo]) => resultado.replaceAll(patron, reemplazo), legible) : legible
}

/**
 * Para leer el nombre de una PERSONA escrito todo en mayúsculas: «JUAN DE LA CRUZ» → «Juan de la Cruz». No
 * repone tildes: el nombre de alguien se muestra como está en la base.
 */
export const nombrePropio = (texto: string | null | undefined): string => aLegible(texto, true, false)

/**
 * Para leer el nombre de una institución, un programa académico o un lugar: «INSTITUCION UNIVERSITARIA ITM» →
 * «Institución Universitaria ITM», «INGENIERIA DE SISTEMAS» → «Ingeniería de Sistemas», «MEDELLIN» → «Medellín».
 * Repone las tildes del vocabulario conocido y respeta las siglas.
 */
export const tituloLegible = (texto: string | null | undefined): string => aLegible(texto, true, true)

/**
 * Para leer un valor corriente escrito en mayúsculas (modalidad, tipo de documento, motivo): «MATRICULA Y
 * SOSTENIMIENTO» → «Matrícula y sostenimiento», «CEDULA DE CIUDADANIA» → «Cédula de ciudadanía».
 */
export const oracionLegible = (texto: string | null | undefined): string => aLegible(texto, false, true)

/** «2024-1» → { anio: 2024, parte: 1 }; lo que no sea un periodo → null. */
export function partirPeriodo(periodo: string): { anio: number; parte: number } | null {
  const m = /^(\d{4})-(\d)$/.exec(periodo.trim())
  return m ? { anio: Number(m[1]), parte: Number(m[2]) } : null
}

export interface PeriodoBeneficio {
  periodo: string
  /** Estado del periodo como está en la base. */
  estado: string
  categoria: CategoriaEstado
  /** Lo girado en ese periodo, si la tabla lo trae. */
  monto: number | null
  /** La fila completa de la tabla, en el orden de sus columnas. */
  fila: string[]
}

export interface ResumenBeneficio {
  /** Periodos en orden cronológico (el orden de la tabla). */
  periodos: PeriodoBeneficio[]
  primerPeriodo: string | null
  ultimoPeriodo: string | null
  /** Estado del último periodo; si no hay historial, el estado general de la ficha. */
  estadoActual: string
  categoriaActual: CategoriaEstado
  /** Total girado en el beneficio: el campo «Total desembolsado», el acumulado de la tabla o la suma por periodo. */
  totalGirado: number | null
  /** Columna de la tabla de donde sale el monto de cada periodo (para rotular), o null. */
  columnaMonto: string | null
  girosRealizados: number | null
  girosPendientes: number | null
}

const COLUMNAS_MONTO_PERIODO = ['Monto total', 'Desembolsado en el periodo', 'Girado en el periodo', 'Pagado en el periodo']
const COLUMNAS_ACUMULADO = ['Total desembolsado', 'Total girado', 'Valor de los giros realizados']

function ultimoNumero(tabla: Tabla, columna: number): number | null {
  if (columna === -1) return null
  for (let i = tabla[2].length - 1; i >= 0; i--) {
    const n = aNumero(tabla[2][i][columna])
    if (n !== null) return n
  }
  return null
}

/** Lo esencial de un beneficio, sacado de su historial por periodo y de sus secciones. */
export function resumenBeneficio(ficha: FichaFondos): ResumenBeneficio {
  const tabla = ficha.p === 'EVENTOS' ? null : tablaHistorial(ficha)
  const iPeriodo = tabla ? indiceColumna(tabla, 'Periodo') : -1
  const iEstado = tabla ? indiceColumna(tabla, 'Estado') : -1
  const iMonto = tabla ? indiceColumna(tabla, ...COLUMNAS_MONTO_PERIODO) : -1
  const periodos: PeriodoBeneficio[] =
    tabla && iPeriodo !== -1
      ? tabla[2].map((fila) => {
          const estado = iEstado === -1 ? '' : (fila[iEstado] ?? '')
          return {
            periodo: fila[iPeriodo] ?? '',
            estado,
            categoria: categoriaEstado(estado),
            monto: iMonto === -1 ? null : aNumero(fila[iMonto]),
            fila,
          }
        })
      : []
  const ultimo = periodos.at(-1)
  const estadoActual = ultimo?.estado || ficha.e
  const delCampo = aNumero(campo(ficha, 'Total desembolsado'))
  const acumulado = tabla ? ultimoNumero(tabla, indiceColumna(tabla, ...COLUMNAS_ACUMULADO)) : null
  const montos = periodos.map((p) => p.monto).filter((m): m is number => m !== null)
  const suma = montos.length > 0 ? montos.reduce((a, b) => a + b, 0) : null
  return {
    periodos,
    primerPeriodo: periodos[0]?.periodo || null,
    ultimoPeriodo: ultimo?.periodo || null,
    estadoActual,
    categoriaActual: categoriaEstado(estadoActual),
    totalGirado: delCampo ?? acumulado ?? suma,
    columnaMonto: tabla && iMonto !== -1 ? tabla[1][iMonto] : null,
    girosRealizados: tabla ? ultimoNumero(tabla, indiceColumna(tabla, 'Giros realizados')) : null,
    girosPendientes: tabla ? ultimoNumero(tabla, indiceColumna(tabla, 'Giros pendientes')) : null,
  }
}
