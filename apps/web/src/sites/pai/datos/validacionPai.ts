/**
 * Validación de las respuestas de la API del PAI: no se confía en la forma
 * del JSON (zod es solo del servidor). Cada función devuelve el objeto
 * tipado o lanza ErrorPai('datos'). Se toleran campos de más; los que faltan
 * o tienen otro tipo hacen fallar la validación, salvo los opcionales.
 */
import {
  ACCIONES_REGISTRO_PAI,
  ESTADOS_BIMESTRE,
  MOTIVOS_EDICION,
  REGLAS_TOTAL,
  ROLES_PAI,
  TIPOS_META,
  TIPOS_PROCESO,
  type AccionTableroPai,
  type AsignacionesPai,
  type AutorizacionPai,
  type BimestreInfo,
  type CalculoIndicadorPai,
  type ConteoEstadosPai,
  type DependenciaPai,
  type EntradaRegistroPai,
  type EstadoAutorizacion,
  type EvidenciaPai,
  type FichaIndicadorPai,
  type IndicadorTableroPai,
  type ListaAutorizacionesPai,
  type ListaUsuariosPai,
  type NumeroBimestre,
  type OrigenReporte,
  type PaginaRegistroPai,
  type ProcesoFichaPai,
  type ProcesoTableroPai,
  type ReporteBimestrePai,
  type RespuestaReportePai,
  type RespuestaSubidaPai,
  type SubidaPorPartesPai,
  type ResumenAvancePai,
  type RiesgoMaterializado,
  type ResumenTableroPai,
  type RiesgoFichaPai,
  type RiesgoTableroPai,
  type SesionPai,
  type TableroPai,
  type UsuarioPai,
  type VigenciaPai,
} from '../api-pai'
import { ErrorPai } from './errores'

type Objeto = Record<string, unknown>

function esObjeto(valor: unknown): valor is Objeto {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function invalida(que: string): never {
  throw new ErrorPai('datos', `La respuesta del servidor no tiene ${que} con la forma esperada.`)
}

function objeto(valor: unknown, que: string): Objeto {
  if (!esObjeto(valor)) invalida(que)
  return valor
}

function texto(valor: unknown, que: string): string {
  if (typeof valor !== 'string') invalida(que)
  return valor
}

function textoNoVacio(valor: unknown, que: string): string {
  if (typeof valor !== 'string' || !valor.trim()) invalida(que)
  return valor
}

function textoONulo(valor: unknown, que: string): string | null {
  if (valor === null || valor === undefined) return null
  return texto(valor, que)
}

function numero(valor: unknown, que: string): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) invalida(que)
  return valor
}

function numeroONulo(valor: unknown, que: string): number | null {
  if (valor === null || valor === undefined) return null
  return numero(valor, que)
}

function entero(valor: unknown, que: string): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor)) invalida(que)
  return valor
}

function enteroONulo(valor: unknown, que: string): number | null {
  if (valor === null || valor === undefined) return null
  return entero(valor, que)
}

function booleano(valor: unknown, que: string): boolean {
  if (typeof valor !== 'boolean') invalida(que)
  return valor
}

function enumeracion<T extends string>(valor: unknown, valores: readonly T[], que: string): T {
  if (typeof valor !== 'string' || !(valores as readonly string[]).includes(valor)) invalida(que)
  return valor as T
}

function bimestre(valor: unknown, que: string): NumeroBimestre {
  if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < 1 || valor > 6) invalida(que)
  return valor as NumeroBimestre
}

function bimestreONulo(valor: unknown, que: string): NumeroBimestre | null {
  if (valor === null || valor === undefined) return null
  return bimestre(valor, que)
}

function lista<T>(valor: unknown, que: string, elemento: (v: unknown) => T): T[] {
  if (!Array.isArray(valor)) invalida(que)
  return valor.map(elemento)
}

/** Lista "por bimestre": exactamente 6 elementos. */
function seis<T>(valor: unknown, que: string, elemento: (v: unknown) => T): T[] {
  if (!Array.isArray(valor) || valor.length !== 6) invalida(que)
  return valor.map(elemento)
}

function enteros(valor: unknown, que: string): number[] {
  return lista(valor, que, (v) => entero(v, que))
}

// ── Sesión y vigencia ──────────────────────────────────────────────────────

export function validarSesion(valor: unknown): SesionPai {
  const o = objeto(valor, 'la sesión')
  return {
    id: entero(o.id, 'la sesión'),
    usuario: textoNoVacio(o.usuario, 'la sesión'),
    nombre: texto(o.nombre, 'la sesión'),
    rol: enumeracion(o.rol, ROLES_PAI, 'la sesión'),
    csrf: textoNoVacio(o.csrf, 'la sesión'),
    expira: texto(o.expira, 'la sesión'),
    debeCambiarContrasena: booleano(o.debeCambiarContrasena, 'la sesión'),
  }
}

function validarBimestreInfo(valor: unknown): BimestreInfo {
  const o = objeto(valor, 'los bimestres')
  return {
    numero: bimestre(o.numero, 'los bimestres'),
    nombre: texto(o.nombre, 'los bimestres'),
    meses: texto(o.meses, 'los bimestres'),
  }
}

export function validarVigencia(valor: unknown): VigenciaPai {
  const que = 'la vigencia'
  const o = objeto(valor, que)
  return {
    anio: entero(o.anio, que),
    bimestreAbierto: bimestreONulo(o.bimestreAbierto, que),
    abiertoHasta: textoONulo(o.abiertoHasta, que),
    abiertoAhora: booleano(o.abiertoAhora, que),
    bimestres: seis(o.bimestres, que, validarBimestreInfo),
    vigencias: enteros(o.vigencias ?? [], que),
    ahora: texto(o.ahora, que),
    actualizadoEn: textoONulo(o.actualizadoEn, que),
    actualizadoPor: textoONulo(o.actualizadoPor, que),
  }
}

// ── Tablero ────────────────────────────────────────────────────────────────

function validarDependencia(valor: unknown): DependenciaPai {
  const que = 'las dependencias'
  const o = objeto(valor, que)
  return { id: entero(o.id, que), sigla: texto(o.sigla, que), nombre: texto(o.nombre, que) }
}

function validarProceso(valor: unknown): ProcesoTableroPai {
  const que = 'los procesos'
  const o = objeto(valor, que)
  return {
    id: entero(o.id, que),
    clave: texto(o.clave, que),
    codigo: texto(o.codigo, que),
    nombre: texto(o.nombre, que),
    dependenciaId: entero(o.dependenciaId, que),
    tipo: enumeracion(o.tipo, TIPOS_PROCESO, que),
    programa: textoONulo(o.programa, que),
    lineaPlanDesarrollo: textoONulo(o.lineaPlanDesarrollo, que),
    dimensionPlanEstrategico: textoONulo(o.dimensionPlanEstrategico, que),
    orden: entero(o.orden, que),
  }
}

function validarRiesgo(valor: unknown): RiesgoTableroPai {
  const que = 'los riesgos'
  const o = objeto(valor, que)
  return {
    id: entero(o.id, que),
    procesoId: entero(o.procesoId, que),
    numeral: enteroONulo(o.numeral, que),
    texto: texto(o.texto, que),
    corrupcion: booleano(o.corrupcion, que),
  }
}

function validarAccion(valor: unknown): AccionTableroPai {
  const que = 'las acciones'
  const o = objeto(valor, que)
  return {
    id: entero(o.id, que),
    procesoId: entero(o.procesoId, que),
    orden: entero(o.orden, que),
    descripcion: texto(o.descripcion, que),
    riesgoIds: enteros(o.riesgoIds, que),
  }
}

/**
 * `escala` de los indicadores de tipo porcentaje ('0-100' | '0-1' | null;
 * EscalaPorcentajePai en el contrato): se conserva si viene. Se agrega aparte
 * para que el validador funcione con la copia del contrato que la tenga o no.
 */
function conEscala<T extends object>(destino: T, o: Record<string, unknown>, que: string): T {
  if (o.escala === undefined) return destino
  if (o.escala !== null && o.escala !== '0-100' && o.escala !== '0-1') invalida(que)
  return Object.assign(destino, { escala: o.escala })
}

export function validarIndicadorTablero(valor: unknown): IndicadorTableroPai {
  const que = 'el indicador'
  const o = objeto(valor, que)
  return conEscala<IndicadorTableroPai>({
    id: entero(o.id, que),
    codigo: textoNoVacio(o.codigo, que),
    nombre: texto(o.nombre, que),
    procesoId: entero(o.procesoId, que),
    accionId: entero(o.accionId, que),
    orden: entero(o.orden, que),
    tipoMeta: enumeracion(o.tipoMeta, TIPOS_META, que),
    metas: seis(o.metas, que, (v) => numero(v, que)),
    metaTotal: numero(o.metaTotal, que),
    avances: seis(o.avances, que, (v) => numeroONulo(v, que)),
    avanceTotal: numeroONulo(o.avanceTotal, que),
    porcentajes: seis(o.porcentajes, que, (v) => numeroONulo(v, que)),
    porcentajeTotal: numeroONulo(o.porcentajeTotal, que),
    estados: seis(o.estados, que, (v) => enumeracion(v, ESTADOS_BIMESTRE, que)),
    editables: seis(o.editables, que, (v) => booleano(v, que)),
    motivos: seis(o.motivos, que, (v) => enumeracion(v, MOTIVOS_EDICION, que)),
    tieneTextos: seis(o.tieneTextos, que, (v) => booleano(v, que)),
    evidencias: seis(o.evidencias, que, (v) => entero(v, que)),
    actualizadoEn: seis(o.actualizadoEn, que, (v) => textoONulo(v, que)),
  }, o, que)
}

function validarConteo(valor: unknown): ConteoEstadosPai | null {
  if (valor === null || valor === undefined) return null
  const que = 'el resumen'
  const o = objeto(valor, que)
  return {
    bimestre: bimestre(o.bimestre, que),
    reportados: entero(o.reportados, que),
    pendientes: entero(o.pendientes, que),
    sinMeta: entero(o.sinMeta, que),
  }
}

function validarResumenAvance(o: Objeto): ResumenAvancePai {
  const que = 'el resumen'
  return {
    logros: seis(o.logros, que, (v) => numeroONulo(v, que)),
    avanceAnual: numeroONulo(o.avanceAnual, que),
    indicadores: entero(o.indicadores, que),
    conteo: validarConteo(o.conteo),
  }
}

function validarResumen(valor: unknown): ResumenTableroPai {
  const que = 'el resumen'
  const o = objeto(valor, que)
  return {
    general: validarResumenAvance(objeto(o.general, que)),
    dependencias: lista(o.dependencias, que, (v) => {
      const d = objeto(v, que)
      return { ...validarResumenAvance(d), dependenciaId: entero(d.dependenciaId, que) }
    }),
    procesos: lista(o.procesos, que, (v) => {
      const p = objeto(v, que)
      return { ...validarResumenAvance(p), procesoId: entero(p.procesoId, que) }
    }),
  }
}

export function validarTablero(valor: unknown): TableroPai {
  const que = 'el tablero'
  const o = objeto(valor, que)
  return {
    vigencia: validarVigencia(o.vigencia),
    dependencias: lista(o.dependencias, que, validarDependencia),
    procesos: lista(o.procesos, que, validarProceso),
    riesgos: lista(o.riesgos, que, validarRiesgo),
    acciones: lista(o.acciones, que, validarAccion),
    indicadores: lista(o.indicadores, que, validarIndicadorTablero),
    resumen: validarResumen(o.resumen),
  }
}

// ── Ficha y reportes ───────────────────────────────────────────────────────

export function validarEvidencia(valor: unknown): EvidenciaPai {
  const que = 'la evidencia'
  const o = objeto(valor, que)
  return {
    id: entero(o.id, que),
    nombre: texto(o.nombre, que),
    tipo: texto(o.tipo, que),
    bytes: entero(o.bytes, que),
    subidoEn: texto(o.subidoEn, que),
    subidoPor: textoONulo(o.subidoPor, que),
    urlDescarga: textoNoVacio(o.urlDescarga, que),
  }
}

export function validarReporte(valor: unknown): ReporteBimestrePai {
  const que = 'el reporte'
  const o = objeto(valor, que)
  const riesgo = o.riesgoMaterializado
  return {
    bimestre: bimestre(o.bimestre, que),
    meta: numero(o.meta, que),
    avance: numeroONulo(o.avance, que),
    porcentaje: numeroONulo(o.porcentaje, que),
    estado: enumeracion(o.estado, ESTADOS_BIMESTRE, que),
    logros: textoONulo(o.logros, que),
    observaciones: textoONulo(o.observaciones, que),
    riesgoMaterializado:
      riesgo === null || riesgo === undefined ? null : enumeracion<RiesgoMaterializado>(riesgo, ['SI', 'NO'], que),
    numeralRiesgo: textoONulo(o.numeralRiesgo, que),
    descripcionRiesgo: textoONulo(o.descripcionRiesgo, que),
    fuentesVerificacion: textoONulo(o.fuentesVerificacion, que),
    evidencias: lista(o.evidencias, que, validarEvidencia),
    origen:
      o.origen === null || o.origen === undefined
        ? null
        : enumeracion<OrigenReporte>(o.origen, ['importado', 'aplicativo'], que),
    actualizadoEn: textoONulo(o.actualizadoEn, que),
    actualizadoPor: textoONulo(o.actualizadoPor, que),
    editable: booleano(o.editable, que),
    motivo: enumeracion(o.motivo, MOTIVOS_EDICION, que),
  }
}

function validarCalculo(valor: unknown): CalculoIndicadorPai {
  const que = 'el cálculo del indicador'
  const o = objeto(valor, que)
  let topePorBimestre: CalculoIndicadorPai['topePorBimestre'] = null
  if (o.topePorBimestre !== null && o.topePorBimestre !== undefined) {
    const t = objeto(o.topePorBimestre, que)
    topePorBimestre = { bimestres: seis(t.bimestres, que, (v) => booleano(v, que)), total: booleano(t.total, que) }
  }
  return {
    reglaMetaTotal: enumeracion(o.reglaMetaTotal, REGLAS_TOTAL, que),
    divisorMetaTotal: numeroONulo(o.divisorMetaTotal, que),
    reglaAvanceTotal: enumeracion(o.reglaAvanceTotal, REGLAS_TOTAL, que),
    divisorAvanceTotal: numeroONulo(o.divisorAvanceTotal, que),
    tope100: o.tope100 === null || o.tope100 === undefined ? null : booleano(o.tope100, que),
    topePorBimestre,
  }
}

function validarRiesgoFicha(valor: unknown): RiesgoFichaPai {
  const que = 'los riesgos'
  const o = objeto(valor, que)
  return { ...validarRiesgo(o), descripcion: textoONulo(o.descripcion, que), bloque: enteroONulo(o.bloque, que) }
}

function validarProcesoFicha(valor: unknown): ProcesoFichaPai {
  const que = 'el proceso'
  const o = objeto(valor, que)
  return {
    ...validarProceso(o),
    dependencia: validarDependencia(o.dependencia),
    codigoProyecto: textoONulo(o.codigoProyecto, que),
    objetivo: textoONulo(o.objetivo, que),
  }
}

export function validarFicha(valor: unknown): FichaIndicadorPai {
  const que = 'la ficha del indicador'
  const o = objeto(valor, que)
  const accion = objeto(o.accion, que)
  return conEscala<FichaIndicadorPai>({
    id: entero(o.id, que),
    codigo: textoNoVacio(o.codigo, que),
    nombre: texto(o.nombre, que),
    orden: entero(o.orden, que),
    tipoMeta: enumeracion(o.tipoMeta, TIPOS_META, que),
    vigencia: entero(o.vigencia, que),
    proceso: validarProcesoFicha(o.proceso),
    accion: { id: entero(accion.id, que), orden: entero(accion.orden, que), descripcion: texto(accion.descripcion, que) },
    riesgos: lista(o.riesgos, que, validarRiesgoFicha),
    productos: textoONulo(o.productos, que),
    rolResponsable: textoONulo(o.rolResponsable, que),
    responsable: textoONulo(o.responsable, que),
    corresponsables: textoONulo(o.corresponsables, que),
    metaTotal: numero(o.metaTotal, que),
    avanceTotal: numeroONulo(o.avanceTotal, que),
    porcentajeTotal: numeroONulo(o.porcentajeTotal, que),
    calculo: validarCalculo(o.calculo),
    bimestres: seis(o.bimestres, que, validarReporte),
  }, o, que)
}

export function validarRespuestaReporte(valor: unknown): RespuestaReportePai {
  const o = objeto(valor, 'el reporte guardado')
  return { reporte: validarReporte(o.reporte), indicador: validarIndicadorTablero(o.indicador) }
}

function enteroPositivoOpcional(valor: unknown, que: string): number | undefined {
  if (valor === undefined || valor === null) return undefined
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor < 1) invalida(que)
  return valor
}

/** SubidaPorPartesPai: la ruta partes/<uuid> y el tamaño de cada parte. */
export function validarSubidaPorPartes(valor: unknown): SubidaPorPartesPai {
  const que = 'la subida'
  const o = objeto(valor, que)
  const ruta = textoNoVacio(o.ruta, que)
  const tamanoParte = enteroPositivoOpcional(o.tamanoParte, que)
  if (!/^partes\/[0-9a-f-]{36}$/.test(ruta) || tamanoParte === undefined) invalida(que)
  return { ruta, tamanoParte }
}

/** RespuestaSubidaPai (URL firmada solo con https o del propio sitio). */
export function validarRespuestaSubida(valor: unknown): RespuestaSubidaPai {
  const que = 'la subida'
  const o = objeto(valor, que)
  if (typeof o.directa !== 'boolean') invalida(que)
  if (!o.directa) {
    // tamanoParte y maxBytes: la subida por partes (un servidor anterior no los manda).
    const tamanoParte = enteroPositivoOpcional(o.tamanoParte, que)
    const maxBytes = enteroPositivoOpcional(o.maxBytes, que)
    return {
      directa: false,
      ...(tamanoParte === undefined ? {} : { tamanoParte }),
      ...(maxBytes === undefined ? {} : { maxBytes }),
    }
  }
  const ruta = textoNoVacio(o.ruta, que)
  const url = textoNoVacio(o.url, que)
  const maxBytes = numero(o.maxBytes, que)
  let destino: URL
  try {
    destino = new URL(url, window.location.href)
  } catch {
    invalida(que)
  }
  if (destino.protocol !== 'https:' && destino.origin !== window.location.origin) invalida(que)
  return { directa: true, ruta, url: destino.href, maxBytes }
}

// ── Administración ─────────────────────────────────────────────────────────

function validarAsignaciones(valor: unknown): AsignacionesPai {
  const que = 'las asignaciones'
  const o = objeto(valor, que)
  return { procesos: enteros(o.procesos, que), indicadores: enteros(o.indicadores, que) }
}

export function validarUsuario(valor: unknown): UsuarioPai {
  const que = 'el usuario'
  const o = objeto(valor, que)
  return {
    id: entero(o.id, que),
    usuario: textoNoVacio(o.usuario, que),
    nombre: texto(o.nombre, que),
    correo: textoONulo(o.correo, que),
    cargo: textoONulo(o.cargo, que),
    rol: enumeracion(o.rol, ROLES_PAI, que),
    activo: booleano(o.activo, que),
    debeCambiarContrasena: booleano(o.debeCambiarContrasena, que),
    ultimoAcceso: textoONulo(o.ultimoAcceso, que),
    creadoEn: texto(o.creadoEn, que),
    actualizadoEn: texto(o.actualizadoEn, que),
    asignaciones: validarAsignaciones(o.asignaciones),
  }
}

export function validarUsuarios(valor: unknown): ListaUsuariosPai {
  const o = objeto(valor, 'la lista de usuarios')
  return { usuarios: lista(o.usuarios, 'la lista de usuarios', validarUsuario) }
}

const ESTADOS_AUTORIZACION: readonly EstadoAutorizacion[] = ['vigente', 'vencida', 'revocada']

export function validarAutorizacion(valor: unknown): AutorizacionPai {
  const que = 'la autorización'
  const o = objeto(valor, que)
  return {
    id: entero(o.id, que),
    usuarioId: entero(o.usuarioId, que),
    usuario: texto(o.usuario, que),
    nombreUsuario: texto(o.nombreUsuario, que),
    bimestre: bimestre(o.bimestre, que),
    procesoId: enteroONulo(o.procesoId, que),
    indicadorId: enteroONulo(o.indicadorId, que),
    alcance: texto(o.alcance, que),
    vigenteHasta: texto(o.vigenteHasta, que),
    motivo: texto(o.motivo, que),
    otorgadaPor: textoONulo(o.otorgadaPor, que),
    otorgadaEn: texto(o.otorgadaEn, que),
    revocadaEn: textoONulo(o.revocadaEn, que),
    revocadaPor: textoONulo(o.revocadaPor, que),
    estado: enumeracion(o.estado, ESTADOS_AUTORIZACION, que),
  }
}

export function validarAutorizaciones(valor: unknown): ListaAutorizacionesPai {
  const o = objeto(valor, 'la lista de autorizaciones')
  return { autorizaciones: lista(o.autorizaciones, 'la lista de autorizaciones', validarAutorizacion) }
}

function validarEntradaRegistro(valor: unknown): EntradaRegistroPai {
  const que = 'el registro'
  const o = objeto(valor, que)
  return {
    id: entero(o.id, que),
    fecha: texto(o.fecha, que),
    usuarioId: enteroONulo(o.usuarioId, que),
    usuario: textoONulo(o.usuario, que),
    accion: enumeracion(o.accion, ACCIONES_REGISTRO_PAI, que),
    indicadorId: enteroONulo(o.indicadorId, que),
    codigoIndicador: textoONulo(o.codigoIndicador, que),
    bimestre: bimestreONulo(o.bimestre, que),
    detalle: o.detalle === null || o.detalle === undefined ? null : objeto(o.detalle, que),
  }
}

export function validarPaginaRegistro(valor: unknown): PaginaRegistroPai {
  const que = 'el registro'
  const o = objeto(valor, que)
  return {
    entradas: lista(o.entradas, que, validarEntradaRegistro),
    pagina: entero(o.pagina, que),
    porPagina: entero(o.porPagina, que),
    total: entero(o.total, que),
  }
}
