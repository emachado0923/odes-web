/**
 * Datos del tablero "Matrícula en educación superior en Medellín (2000-2025)":
 * el JSON que escribe apps/web/datos-tableros/matricula-historica/etl_matricula_historica.py
 * en public/tableros/matricula-historica/datos/matricula.json.
 */

export interface IesHistorica {
  nombre: string
  corto: string
  caracter: string
  /** Códigos del SNIES (COD_IES) que se juntan en esta institución. */
  codigos: string[]
}

export interface ProgramaHistorico {
  codigo: string
  nombre: string
  /** Posición en dim.ies. */
  ies: number
}

export interface DimensionesHistoricas {
  ies: IesHistorica[]
  programa: ProgramaHistorico[]
  nivel: string[]
  nivelAcad: string[]
  /** Para cada nivel, su posición en nivelAcad (pregrado o posgrado). */
  acadDeNivel: number[]
  modalidad: string[]
  area: string[]
  nbc: string[]
  sector: string[]
  sexo: string[]
}

/**
 * [año, programa, nivel, modalidad, área, nbc, sector, femenino, masculino, no binario, trans]:
 * año es la posición en `anios`; los cinco siguientes, posiciones en dim; los cuatro últimos, matriculados.
 */
export type FilaHistorica = [number, number, number, number, number, number, number, number, number, number, number]

export interface ReferenciaHistorica {
  /** Matriculados por año. */
  total: number[]
  /** nivel × sector × sexo × año (en el orden de dim.nivel, dim.sector, dim.sexo y anios). */
  cubo: number[][][][]
}

export type Territorio = 'Antioquia' | 'Colombia'

export interface MatriculaHistorica {
  meta: {
    municipio: string
    desde: number
    hasta: number
    fuente: string
    generado: string
    regla: string
    /** Matrícula de programas de Medellín que ese año solo reportaron el semestre no oficial. */
    fueraDelDatoAnual: number[]
  }
  anios: number[]
  dim: DimensionesHistoricas
  filas: FilaHistorica[]
  referencia: Record<Territorio, ReferenciaHistorica>
}
