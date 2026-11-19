/**
 * Lo que entrega GET /api/sivu/tableros/fondos-2026: el mismo contrato de
 * apps/server/src/sivu/tableros/datos-fondos.ts (ConjuntoFondos y
 * DatosTableroFondos), repetido aquí porque la web no importa del servidor.
 * Si cambia allá, cambia aquí.
 *
 * Solo cifras agregadas. Un «beneficio» es una persona en una convocatoria de
 * un programa. Las filas se refieren a las dimensiones por posición (índice
 * en dim.programa, dim.convocatoria, dim.periodo…).
 */

export interface ProgramaFondos {
  clave: string
  nombre: string
  corto: string
  /** Pregrado, Posgrado o Movilidad internacional. */
  linea: string
}

export interface MetaFondos {
  titulo: string
  /** Fecha de corte de los datos (AAAA-MM-DD). */
  corte: string
  /** Periodo con que abre el tablero (p. ej. «2026-2»). */
  periodoActual: string
  fuente: string
  generado: string
  beneficios: number
  filasOrigen: number
  excluidos: string
}

export interface DimensionesFondos {
  programa: ProgramaFondos[]
  convocatoria: string[]
  /** De «2005-2» a «2026-2», con los intersemestrales «-3» (muy pocos registros). */
  periodo: string[]
  /** En el orden de recorrido: Activo, Suspensión, … Terminación o cancelación. */
  estado: string[]
  sexo: string[]
  comuna: string[]
  ies: string[]
  pais: string[]
}

export type FilaEstado = [programa: number, convocatoria: number, periodo: number, estado: number, beneficios: number]
/** Montos en pesos; matrícula y sostenimiento son null fuera de los fondos de la Línea Pregrado. */
export type FilaGiro = [
  programa: number,
  periodo: number,
  monto: number,
  matricula: number | null,
  sostenimiento: number | null,
  conGiro: number,
]
/** Estado de cada beneficio en el último periodo registrado. */
export type FilaCohorte = [programa: number, convocatoria: number, estado: number, beneficios: number]
/** Solo beneficios activos (sexo, comunas, ies). */
export type FilaActivos = [programa: number, periodo: number, categoria: number, beneficios: number]
/** Enlaza Mundos. */
export type FilaDestino = [convocatoria: number, pais: number, beneficios: number]

export interface ConjuntoFondos {
  meta: MetaFondos
  dim: DimensionesFondos
  estados: FilaEstado[]
  giros: FilaGiro[]
  cohortes: FilaCohorte[]
  sexo: FilaActivos[]
  comunas: FilaActivos[]
  ies: FilaActivos[]
  destinos: FilaDestino[]
}

export interface PasoIntro {
  icono: string
  titulo: string
  texto: string
}

/** Textos del tablero (apps/server/datos/tableros/fondos-2026/definiciones.json). */
export interface DefinicionesFondos {
  intro?: {
    etiqueta?: string
    titulo?: string
    texto?: string
    subtitulo?: string
    pasos?: PasoIntro[]
    boton?: string
  }
  observatorio?: string
  /** Pie de cada tarjeta. */
  fuente?: string
  /** Fuente de las descargas y de la ventana de bienvenida. */
  nota?: string
  /** Qué es un beneficio. */
  beneficio?: string
  /** Definición de cada estado, por su nombre. */
  estados?: Record<string, string>
  privacidad?: string
}

export interface DatosTableroFondos {
  fondos: ConjuntoFondos
  definiciones: DefinicionesFondos
}
