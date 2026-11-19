/**
 * Tipos de la ventanilla de consulta de los fondos. La ficha es genérica (la
 * arma apps/server/datos/tableros/fondos-2026/etl_consulta.py): la web no
 * conoce cada base, solo secciones de pares etiqueta-valor y tablas.
 */

/** Sección de datos: [título, [[etiqueta, valor], …]]. Los valores ya vienen formateados. */
export type Seccion = [string, [string, string][]]

/** Tabla: [título, columnas, filas]. La primera es el historial por periodo (o de eventos). */
export type Tabla = [string, string[], string[][]]

/** Ficha de un beneficio (una persona en una convocatoria de un programa) o de sus eventos. */
export interface FichaFondos {
  /** Clave del programa: EPM, PP, PUAP RO, PUAP PP, CDJ, MB, MD, FA, EFE, EM o EVENTOS. */
  p: string
  /** Convocatoria (por ejemplo «2019-2»); vacía en EVENTOS. */
  c: string
  /** Nombre de la persona, como está en la base (casi siempre en mayúsculas). */
  n: string
  /** Estado general del beneficio, como está en la base. */
  e: string
  s: Seccion[]
  t: Tabla[]
}

export interface ResultadoConsulta {
  /** Documento normalizado por el servidor (sin puntos ni espacios). */
  documento: string
  fichas: FichaFondos[]
}

/** Consulta hecha en esta sesión; vive solo en memoria (nunca en localStorage: son datos personales). */
export interface ConsultaReciente {
  documento: string
  nombre: string | null
  beneficios: number
}
