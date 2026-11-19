/**
 * Lógica pura de la página de registro (auditoría), probada en
 * registro.test.ts: nombres de las acciones, filtros en la URL (con las
 * mismas reglas que el servidor, para no llegar a un 400) y el detalle de
 * cada entrada en palabras: números y fechas en es-CO (hora de Colombia),
 * códigos internos traducidos (motivo, resultado, rol, origen…).
 */
import {
  ACCIONES_REGISTRO_PAI,
  esCodigoIndicador,
  type AccionRegistroPai,
  type ConsultaRegistroPai,
} from '../api-pai'
import { formatoBytes, formatoFechaHora, formatoNumero } from '../datos/formatos'
import { nombreRol } from '../sesion/contexto'
import { nombreTipoEvidencia } from '../tablero/presentacion'

export const NOMBRES_ACCION: Readonly<Record<AccionRegistroPai, string>> = {
  iniciar_sesion: 'Inició sesión',
  cambiar_contrasena: 'Cambió su contraseña',
  guardar_reporte: 'Guardó un reporte',
  subir_evidencia: 'Subió una evidencia',
  borrar_evidencia: 'Borró una evidencia',
  crear_usuario: 'Creó un usuario',
  editar_usuario: 'Editó un usuario',
  asignar: 'Cambió asignaciones',
  abrir_bimestre: 'Abrió un bimestre',
  cerrar_bimestre: 'Cerró el bimestre',
  otorgar_autorizacion: 'Otorgó una autorización',
  revocar_autorizacion: 'Revocó una autorización',
  cargar_fichas: 'Cargó las fichas',
}

/** Filtros del registro tal como van en la URL de /pai/admin/registro. */
export interface FiltrosRegistro {
  pagina: number
  usuario: number | null
  indicador: string
  accion: AccionRegistroPai | null
}

/** Largo máximo del filtro de indicador (el servidor admite 30 caracteres). */
export const MAX_INDICADOR_REGISTRO = 30
/** Página más alta que acepta el servidor (PAGINA_MAXIMA_REGISTRO en validacion-pai.ts). */
export const PAGINA_MAXIMA_REGISTRO = 100_000

function enteroPositivo(texto: string | null, maximo = Number.MAX_SAFE_INTEGER): number | null {
  if (!texto || !/^\d{1,9}$/.test(texto)) return null
  const valor = Number(texto)
  return valor >= 1 && valor <= maximo ? valor : null
}

/**
 * Problema del filtro de indicador, o null si sirve: vacío, un id (solo
 * dígitos) o un código completo (SAF-TH-02), como exige el servidor.
 */
export function problemaIndicadorRegistro(texto: string): string | null {
  const valor = texto.trim()
  if (!valor) return null
  if (valor.length <= MAX_INDICADOR_REGISTRO && (/^\d{1,10}$/.test(valor) || esCodigoIndicador(valor))) return null
  return 'Escriba el código completo del indicador (p. ej., SAF-TH-02) o su id.'
}

/** Lee los filtros de la URL, ignorando valores inválidos (los que el servidor rechazaría). */
export function leerFiltrosRegistro(parametros: URLSearchParams): FiltrosRegistro {
  const accion = parametros.get('accion')
  const indicador = (parametros.get('indicador') ?? '').trim()
  return {
    pagina: enteroPositivo(parametros.get('pagina'), PAGINA_MAXIMA_REGISTRO) ?? 1,
    usuario: enteroPositivo(parametros.get('usuario')),
    indicador: problemaIndicadorRegistro(indicador) ? '' : indicador,
    accion: accion && (ACCIONES_REGISTRO_PAI as readonly string[]).includes(accion) ? (accion as AccionRegistroPai) : null,
  }
}

/** Parámetros de la URL (sin los vacíos ni la página 1). */
export function parametrosRegistro(filtros: FiltrosRegistro): URLSearchParams {
  const parametros = new URLSearchParams()
  if (filtros.usuario) parametros.set('usuario', String(filtros.usuario))
  if (filtros.indicador.trim()) parametros.set('indicador', filtros.indicador.trim())
  if (filtros.accion) parametros.set('accion', filtros.accion)
  if (filtros.pagina > 1) parametros.set('pagina', String(filtros.pagina))
  return parametros
}

/** Consulta para GET /admin/registro. */
export function consultaRegistro(filtros: FiltrosRegistro): ConsultaRegistroPai {
  return {
    pagina: filtros.pagina,
    usuario: filtros.usuario,
    indicador: filtros.indicador.trim() || null,
    accion: filtros.accion,
  }
}

const MAX_VALOR = 160

/** Un valor del detalle como texto corto ("—" si es null). */
export function textoValor(valor: unknown): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  let texto: string
  if (typeof valor === 'string') texto = valor
  else if (typeof valor === 'number' || typeof valor === 'boolean') texto = String(valor)
  else {
    try {
      texto = JSON.stringify(valor)
    } catch {
      texto = String(valor)
    }
  }
  texto = texto.replace(/\s+/g, ' ').trim()
  return texto.length > MAX_VALOR ? `${texto.slice(0, MAX_VALOR - 1)}…` : texto
}

export interface LineaDetalle {
  campo: string
  /** Solo en los cambios (antes -> después). */
  antes?: string
  valor: string
}

function esObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

const ANTERIORES = ['anterior', 'antes', 'previo']
const NUEVOS = ['nuevo', 'despues', 'actual']

/** Acciones cuyo `motivo` es el MotivoEdicion del reporte (en las autorizaciones es el texto del administrador). */
const ACCIONES_DE_REPORTE: ReadonlySet<string> = new Set(['guardar_reporte', 'subir_evidencia', 'borrar_evidencia'])
const ACCIONES_DE_INGRESO: ReadonlySet<string> = new Set(['iniciar_sesion', 'cambiar_contrasena'])

const TEXTO_MOTIVO_REPORTE: Readonly<Record<string, string>> = {
  abierto: 'bimestre abierto',
  autorizado: 'con autorización de Planeación',
  cerrado: 'bimestre cerrado',
  sin_permiso: 'sin permiso',
}
const TEXTO_MOTIVO_INGRESO: Readonly<Record<string, string>> = {
  contrasena: 'contraseña incorrecta',
  inactivo: 'cuenta inactiva',
}
const TEXTO_RESULTADO: Readonly<Record<string, string>> = {
  correcto: 'correcto',
  fallido: 'fallido',
  bloqueado: 'bloqueado por intentos fallidos',
}
const TEXTO_ORIGEN: Readonly<Record<string, string>> = {
  importado: 'importado de la ficha (Excel)',
  aplicativo: 'aplicativo',
}

/** Fecha ISO 8601 con hora (como las que escribe el servidor). */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

function recortar(texto: string): string {
  const limpio = texto.replace(/\s+/g, ' ').trim()
  return limpio.length > MAX_VALOR ? `${limpio.slice(0, MAX_VALOR - 1)}…` : limpio
}

/**
 * Un valor del detalle para mostrar: números y fechas en es-CO (hora de
 * Colombia), sí/no, y los códigos internos en palabras según el campo y la
 * acción. Lo desconocido queda como textoValor.
 */
export function valorDetalle(campo: string, valor: unknown, accion?: AccionRegistroPai | string | null): string {
  if (valor === null || valor === undefined || valor === '') return '—'
  if (typeof valor === 'boolean') return valor ? 'sí' : 'no'
  if (typeof valor === 'number') {
    if (campo === 'avance') return formatoNumero(valor, true)
    if (campo === 'bytes') return formatoBytes(valor)
    // ids, años, bimestres, conteos: tal cual (sin separador de miles).
    return String(valor)
  }
  if (typeof valor === 'string') {
    if (ISO.test(valor)) return formatoFechaHora(valor) || valor
    if (campo === 'motivo' && accion && ACCIONES_DE_REPORTE.has(accion)) return TEXTO_MOTIVO_REPORTE[valor] ?? recortar(valor)
    if (campo === 'motivo' && accion && ACCIONES_DE_INGRESO.has(accion)) return TEXTO_MOTIVO_INGRESO[valor] ?? recortar(valor)
    if (campo === 'resultado') return TEXTO_RESULTADO[valor] ?? recortar(valor)
    if (campo === 'origenAnterior' || campo === 'origen') return TEXTO_ORIGEN[valor] ?? recortar(valor)
    if (campo === 'rol' && (valor === 'responsable' || valor === 'administrador')) return nombreRol(valor)
    if (campo === 'riesgoMaterializado' && (valor === 'SI' || valor === 'NO')) return valor === 'SI' ? 'Sí' : 'No'
    if (campo === 'tipo' && valor.includes('/')) {
      const nombre = nombreTipoEvidencia(valor)
      return nombre === 'Archivo' ? recortar(valor) : nombre
    }
    return recortar(valor)
  }
  if (Array.isArray(valor)) {
    return valor.length === 0 ? '—' : recortar(valor.map((v) => valorDetalle(campo, v, accion)).join(', '))
  }
  if (esObjeto(valor)) {
    // p. ej., agregados: { procesos: [...], indicadores: [...] }
    const partes = Object.entries(valor)
      .filter(([, v]) => !(Array.isArray(v) && v.length === 0) && v !== null && v !== undefined)
      .map(([clave, v]) => `${etiquetaCampo(clave).toLowerCase()}: ${valorDetalle(clave, v, accion)}`)
    return partes.length === 0 ? '—' : recortar(partes.join('; '))
  }
  return textoValor(valor)
}

/**
 * Líneas para mostrar el detalle de una entrada. Si trae valores anteriores
 * y nuevos ({ antes: {...}, despues: {...} }), una línea por campo que
 * cambió ("Avance: 3 -> 5"); si no, una línea por dato. Los valores van ya
 * en palabras (valorDetalle).
 */
export function lineasDetalle(
  detalle: Record<string, unknown> | null,
  accion?: AccionRegistroPai | string | null,
): LineaDetalle[] {
  if (!detalle) return []
  const claveAnterior = ANTERIORES.find((c) => esObjeto(detalle[c]))
  const claveNuevo = NUEVOS.find((c) => esObjeto(detalle[c]))
  if (claveAnterior && claveNuevo) {
    const anterior = detalle[claveAnterior] as Record<string, unknown>
    const nuevo = detalle[claveNuevo] as Record<string, unknown>
    const campos = [...new Set([...Object.keys(anterior), ...Object.keys(nuevo)])]
    const lineas: LineaDetalle[] = campos
      .filter((campo) => textoValor(anterior[campo]) !== textoValor(nuevo[campo]))
      .map((campo) => ({
        campo,
        antes: valorDetalle(campo, anterior[campo], accion),
        valor: valorDetalle(campo, nuevo[campo], accion),
      }))
    for (const [campo, valor] of Object.entries(detalle)) {
      if (campo !== claveAnterior && campo !== claveNuevo) lineas.push({ campo, valor: valorDetalle(campo, valor, accion) })
    }
    return lineas
  }
  return Object.entries(detalle).map(([campo, valor]) => ({ campo, valor: valorDetalle(campo, valor, accion) }))
}

/** Nombre legible de los campos que escribe el servidor en pai_registro.detalle. */
const ETIQUETAS_DETALLE: Readonly<Record<string, string>> = {
  avance: 'Avance',
  logros: 'Principales avances',
  observaciones: 'Observaciones',
  riesgoMaterializado: 'Riesgo materializado',
  numeralRiesgo: 'Numeral del riesgo',
  descripcionRiesgo: 'Descripción del riesgo',
  fuentesVerificacion: 'Fuentes de verificación',
  motivo: 'Motivo',
  origenAnterior: 'Origen anterior',
  nuevo: 'Reporte nuevo',
  resultado: 'Resultado',
  temporal: 'Contraseña temporal',
  minutos: 'Minutos',
  fallos: 'Fallos',
  vigencia: 'Vigencia',
  bimestreAbierto: 'Bimestre abierto',
  abiertoHasta: 'Abierto hasta',
  autorizacion: 'Autorización',
  responsable: 'Responsable',
  alcance: 'Alcance',
  procesoId: 'Proceso (id)',
  vigenteHasta: 'Vigente hasta',
  evidenciaId: 'Evidencia (id)',
  nombre: 'Nombre',
  tipo: 'Tipo',
  bytes: 'Bytes',
  id: 'id',
  usuario: 'Usuario',
  correo: 'Correo',
  cargo: 'Cargo',
  rol: 'Rol',
  activo: 'Activo',
  contrasenaTemporal: 'Contraseña temporal',
  sesionesCerradas: 'Sesiones cerradas',
  asignacionesBorradas: 'Asignaciones borradas',
  procesos: 'Procesos',
  indicadores: 'Indicadores',
  agregados: 'Agregados',
  quitados: 'Quitados',
  sha256: 'SHA-256',
  avisos: 'Avisos',
  forzar: 'Forzada',
  origen: 'Origen',
}

/** "riesgoMaterializado" -> "Riesgo materializado" (los desconocidos quedan igual). */
export function etiquetaCampo(campo: string): string {
  return ETIQUETAS_DETALLE[campo] ?? campo
}

/** Un valor ya convertido a texto, con sí/no en vez de true/false. */
export function valorMostrado(texto: string): string {
  if (texto === 'true') return 'sí'
  if (texto === 'false') return 'no'
  return texto
}

/** Número de páginas (al menos 1). */
export function totalPaginas(total: number, porPagina: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, porPagina)))
}
