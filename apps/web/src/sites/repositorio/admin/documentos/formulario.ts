/**
 * Formulario de un documento (TypeScript puro): valores del formulario,
 * conversión a DatosDocumento, validación (las mismas reglas que el
 * servidor, para avisar antes de enviar), palabras clave y la vista previa
 * de la tarjeta.
 */
import {
  LIMITES_REPOSITORIO,
  type DatosDocumento,
  type DocumentoAdmin,
  type DocumentoPublico,
  type IdiomaProducto,
  type TipoProducto,
} from '../../api-repositorio'
import { claveNormalizada, textoLinea } from '../datos/formatos'

/** Mismos límites que el servidor (dominio/validacion.ts). */
export const LIMITES = {
  ...LIMITES_REPOSITORIO,
  maxId: 120,
  maxNumero: 20,
  maxUrl: 2048,
  maxClave: 80,
  maxCategoria: 100,
  maxEquivalente: 400,
  maxNotasInternas: 10_000,
  anioMinimo: 1900,
  anioMaximo: 2100,
} as const

export const PATRON_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface ValoresFormulario {
  id: string
  titulo: string
  subtitulo: string
  descripcion: string
  categoria: string
  numero: string
  anio: string
  mes: string
  idioma: IdiomaProducto
  tipo: TipoProducto
  claves: string[]
  urlVerExterna: string
  urlEntradaBlog: string
  nota: string
  permiteDescarga: boolean
  orden: string
  equivalenteEnEspanol: string
  notasInternas: string
}

export type CampoFormulario = keyof ValoresFormulario

/** Orden de los campos en pantalla (para el resumen de errores). */
export const ORDEN_CAMPOS: CampoFormulario[] = [
  'id',
  'titulo',
  'subtitulo',
  'descripcion',
  'categoria',
  'numero',
  'anio',
  'mes',
  'idioma',
  'tipo',
  'claves',
  'urlVerExterna',
  'urlEntradaBlog',
  'nota',
  'permiteDescarga',
  'orden',
  'equivalenteEnEspanol',
  'notasInternas',
]

export const ETIQUETAS: Record<CampoFormulario, string> = {
  id: 'Identificador',
  titulo: 'Título',
  subtitulo: 'Subtítulo',
  descripcion: 'Descripción',
  categoria: 'Categoría',
  numero: 'Número de edición',
  anio: 'Año',
  mes: 'Mes',
  idioma: 'Idioma',
  tipo: 'Tipo',
  claves: 'Palabras clave',
  urlVerExterna: 'URL externa',
  urlEntradaBlog: 'Entrada del blog',
  nota: 'Nota visible',
  permiteDescarga: 'Descarga',
  orden: 'Posición en «Más recientes»',
  equivalenteEnEspanol: 'Equivalente en español',
  notasInternas: 'Notas internas',
}

export function valoresIniciales(doc: DocumentoAdmin | null, categoriaPorDefecto = ''): ValoresFormulario {
  if (!doc) {
    return {
      id: '',
      titulo: '',
      subtitulo: '',
      descripcion: '',
      categoria: categoriaPorDefecto,
      numero: '',
      anio: String(new Date().getFullYear()),
      mes: '',
      idioma: 'es',
      tipo: 'documento',
      claves: [],
      urlVerExterna: '',
      urlEntradaBlog: '',
      nota: '',
      permiteDescarga: true,
      orden: '',
      equivalenteEnEspanol: '',
      notasInternas: '',
    }
  }
  return {
    id: doc.id,
    titulo: doc.titulo,
    subtitulo: doc.subtitulo ?? '',
    descripcion: doc.descripcion ?? '',
    categoria: doc.categoria,
    numero: doc.numero ?? '',
    anio: doc.anio === null ? '' : String(doc.anio),
    mes: doc.mes === null ? '' : String(doc.mes),
    idioma: doc.idioma,
    tipo: doc.tipo,
    claves: [...doc.claves],
    urlVerExterna: doc.urlVerExterna ?? '',
    urlEntradaBlog: doc.urlEntradaBlog ?? '',
    nota: doc.nota ?? '',
    permiteDescarga: doc.permiteDescarga,
    orden: String(doc.orden),
    equivalenteEnEspanol: doc.equivalenteEnEspanol ?? '',
    notasInternas: doc.notasInternas ?? '',
  }
}

/** true si el tipo exige URL externa y no lleva descarga. */
export function esSoloEnlace(tipo: TipoProducto): boolean {
  return tipo !== 'documento'
}

function textoONulo(valor: string): string | null {
  const t = textoLinea(valor)
  return t || null
}

function enteroONulo(valor: string): number | null {
  const t = valor.trim()
  return t ? Number(t) : null
}

/**
 * DatosDocumento para la API. Al editar, `orden` solo se envía si cambió
 * (si no, el servidor lo recalcula al cambiar el año o el mes).
 */
export function aDatos(v: ValoresFormulario, original: DocumentoAdmin | null): DatosDocumento {
  const soloEnlace = esSoloEnlace(v.tipo)
  const orden = enteroONulo(v.orden)
  const datos: DatosDocumento = {
    titulo: textoLinea(v.titulo),
    subtitulo: textoONulo(v.subtitulo),
    descripcion: textoONulo(v.descripcion),
    categoria: textoLinea(v.categoria),
    numero: textoONulo(v.numero),
    anio: enteroONulo(v.anio),
    mes: v.anio.trim() ? enteroONulo(v.mes) : null,
    idioma: v.idioma,
    tipo: v.tipo,
    claves: v.claves.map(textoLinea).filter(Boolean),
    urlVerExterna: v.urlVerExterna.trim() || null,
    urlEntradaBlog: v.urlEntradaBlog.trim() || null,
    nota: textoONulo(v.nota),
    permiteDescarga: soloEnlace ? false : v.permiteDescarga,
    orden: original && orden === original.orden ? null : orden,
    equivalenteEnEspanol: textoONulo(v.equivalenteEnEspanol),
    notasInternas: v.notasInternas.replace(/\r\n?/g, '\n').trim() || null,
  }
  if (!original && v.id.trim()) datos.id = v.id.trim()
  return datos
}

function largo(texto: string): number {
  return [...texto].length
}

export function esUrlHttp(texto: string): boolean {
  try {
    const url = new URL(texto)
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== ''
  } catch {
    return false
  }
}

export type Errores = Partial<Record<CampoFormulario | 'archivo' | 'portada', string>>

export interface ContextoValidacion {
  creando: boolean
  /** El documento está (o va a quedar) publicado: se exige lo necesario para publicar. */
  publicado?: boolean
}

/** Palabras de un texto: fragmentos separados por espacios (igual que el servidor). */
export function contarPalabras(texto: string): number {
  const limpio = texto.trim()
  return limpio ? limpio.split(/\s+/).length : 0
}

/**
 * Lo que le falta a un producto (documento, tablero o entrada) para
 * publicarse, por campo (mismas reglas que el servidor,
 * problemasParaPublicar): año, descripción de 25 a 35 palabras (se piden 30)
 * y 6 palabras clave. Vacío si puede publicarse.
 */
export function faltasParaPublicar(v: Pick<ValoresFormulario, 'tipo' | 'anio' | 'descripcion' | 'claves'>): Errores {
  const e: Errores = {}
  const { minimo, recomendado, maximo } = LIMITES.palabrasDescripcion
  if (!v.anio.trim()) e.anio = 'Para publicar, indique el año de publicación.'
  const palabras = contarPalabras(v.descripcion)
  if (!palabras) e.descripcion = `Para publicar, escriba la descripción (unas ${recomendado} palabras).`
  else if (palabras < minimo || palabras > maximo) {
    e.descripcion = `La descripción tiene ${palabras} palabras: para publicar debe tener entre ${minimo} y ${maximo} (se piden ${recomendado}).`
  }
  const claves = v.claves.map(textoLinea).filter(Boolean)
  if (claves.length !== LIMITES.clavesParaPublicar) {
    e.claves = `Para publicar, el documento necesita ${LIMITES.clavesParaPublicar} palabras clave (tiene ${claves.length}).`
  }
  return e
}

/** Errores por campo (vacío si todo está bien). Mismas reglas que el servidor. */
export function validar(v: ValoresFormulario, ctx: ContextoValidacion): Errores {
  const e: Errores = {}
  const id = v.id.trim()
  if (ctx.creando && id && (id.length > LIMITES.maxId || !PATRON_ID.test(id))) {
    e.id = `Solo minúsculas sin tildes, números y guiones (máximo ${LIMITES.maxId}). Ejemplo: boletin-30-educacion-2025.`
  }
  const titulo = textoLinea(v.titulo)
  if (!titulo) e.titulo = 'Escriba el título.'
  else if (largo(titulo) > LIMITES.maxTitulo) e.titulo = `Máximo ${LIMITES.maxTitulo} caracteres (tiene ${largo(titulo)}).`
  const subtitulo = textoLinea(v.subtitulo)
  if (largo(subtitulo) > LIMITES.maxSubtitulo) {
    e.subtitulo = `Máximo ${LIMITES.maxSubtitulo} caracteres (tiene ${largo(subtitulo)}).`
  }
  if (!textoLinea(v.categoria)) e.categoria = 'Elija la categoría.'
  if (largo(textoLinea(v.numero)) > LIMITES.maxNumero) e.numero = `Máximo ${LIMITES.maxNumero} caracteres.`
  const anio = v.anio.trim()
  if (anio && (!/^\d{4}$/.test(anio) || Number(anio) < LIMITES.anioMinimo || Number(anio) > LIMITES.anioMaximo)) {
    e.anio = `Escriba un año entre ${LIMITES.anioMinimo} y ${LIMITES.anioMaximo}.`
  }
  const descripcion = textoLinea(v.descripcion)
  if (largo(descripcion) > LIMITES.maxDescripcion) {
    e.descripcion = `Máximo ${LIMITES.maxDescripcion} caracteres (tiene ${largo(descripcion)}).`
  }
  if (v.mes && !anio) e.mes = 'El mes solo se puede indicar si hay año.'
  if (v.claves.length > LIMITES.maxClaves) e.claves = `Máximo ${LIMITES.maxClaves} palabras clave.`
  else if (v.claves.some((c) => largo(textoLinea(c)) > LIMITES.maxClave)) {
    e.claves = `Cada palabra clave puede tener máximo ${LIMITES.maxClave} caracteres.`
  }
  const urlVer = v.urlVerExterna.trim()
  if (urlVer && !esUrlHttp(urlVer)) e.urlVerExterna = 'Escriba una dirección completa que empiece por https:// o http://.'
  else if (urlVer.length > LIMITES.maxUrl) e.urlVerExterna = `Máximo ${LIMITES.maxUrl} caracteres.`
  else if (!urlVer && esSoloEnlace(v.tipo)) {
    e.urlVerExterna =
      v.tipo === 'tablero'
        ? 'Un tablero necesita la URL externa (por ejemplo, el enlace público de Power BI).'
        : 'Una entrada necesita la URL externa (la dirección de la entrada del blog).'
  }
  const urlBlog = v.urlEntradaBlog.trim()
  if (urlBlog && !esUrlHttp(urlBlog)) e.urlEntradaBlog = 'Escriba una dirección completa que empiece por https:// o http://.'
  else if (urlBlog.length > LIMITES.maxUrl) e.urlEntradaBlog = `Máximo ${LIMITES.maxUrl} caracteres.`
  const nota = textoLinea(v.nota)
  if (largo(nota) > LIMITES.maxNota) e.nota = `Máximo ${LIMITES.maxNota} caracteres (tiene ${largo(nota)}).`
  const orden = v.orden.trim()
  if (orden && (!/^\d+$/.test(orden) || Number(orden) < 1 || Number(orden) > 1_000_000)) {
    e.orden = 'Escriba un número entero desde 1 (1 = el más reciente), o déjelo vacío.'
  }
  if (largo(textoLinea(v.equivalenteEnEspanol)) > LIMITES.maxEquivalente) {
    e.equivalenteEnEspanol = `Máximo ${LIMITES.maxEquivalente} caracteres.`
  }
  if (largo(v.notasInternas) > LIMITES.maxNotasInternas) {
    e.notasInternas = `Máximo ${LIMITES.maxNotasInternas.toLocaleString('es-CO')} caracteres.`
  }
  // Publicado: además, lo necesario para estarlo (sin tapar los errores de formato de arriba).
  if (ctx.publicado) return { ...faltasParaPublicar(v), ...e }
  return e
}

/** ¿Cambió algo respecto a los valores guardados? */
export function hayCambios(a: ValoresFormulario, b: ValoresFormulario): boolean {
  for (const campo of ORDEN_CAMPOS) {
    const x = a[campo]
    const y = b[campo]
    if (Array.isArray(x) && Array.isArray(y)) {
      if (x.length !== y.length || x.some((c, i) => c !== y[i])) return true
    } else if (x !== y) return true
  }
  return false
}

// ── Palabras clave ──────────────────────────────────────────────────────────

export interface ResultadoClave {
  claves: string[]
  /** Mensaje para anunciar (agregada, ya estaba, forma existente, límite). */
  aviso: string
  agregada: boolean
}

/**
 * Agrega una palabra clave. Si ya existe en el repositorio escrita de otra
 * forma (sin tildes ni mayúsculas igual), se usa la forma existente para que
 * se escriba igual en todas las tarjetas.
 */
export function agregarClave(claves: readonly string[], texto: string, existentes: readonly string[]): ResultadoClave {
  const limpia = textoLinea(texto)
  if (!limpia) return { claves: [...claves], aviso: '', agregada: false }
  if (claves.length >= LIMITES.maxClaves) {
    return { claves: [...claves], aviso: `Ya tiene ${LIMITES.maxClaves} palabras clave, el máximo.`, agregada: false }
  }
  if (largo(limpia) > LIMITES.maxClave) {
    return { claves: [...claves], aviso: `Máximo ${LIMITES.maxClave} caracteres por palabra clave.`, agregada: false }
  }
  const clave = claveNormalizada(limpia)
  const repetida = claves.find((c) => claveNormalizada(c) === clave)
  if (repetida) return { claves: [...claves], aviso: `«${repetida}» ya está en la lista.`, agregada: false }
  const existente = existentes.find((c) => claveNormalizada(c) === clave)
  if (existente && existente !== limpia) {
    return {
      claves: [...claves, existente],
      aviso: `Se agregó «${existente}», como ya está escrita en el repositorio.`,
      agregada: true,
    }
  }
  return {
    claves: [...claves, existente ?? limpia],
    aviso: existente ? `Se agregó «${existente}».` : `Se agregó «${limpia}» (palabra clave nueva).`,
    agregada: true,
  }
}

export interface Sugerencia {
  texto: string
  documentos: number
}

/** Sugerencias para lo escrito: primero las que empiezan igual, luego las más usadas. Máximo `limite`. */
export function sugerirClaves(
  escrito: string,
  existentes: readonly Sugerencia[],
  yaElegidas: readonly string[],
  limite = 8,
): Sugerencia[] {
  const q = claveNormalizada(escrito)
  if (!q) return []
  const elegidas = new Set(yaElegidas.map(claveNormalizada))
  const candidatas: { s: Sugerencia; nivel: number }[] = []
  for (const s of existentes) {
    const k = claveNormalizada(s.texto)
    if (elegidas.has(k)) continue
    let nivel = -1
    if (k.startsWith(q)) nivel = 0
    else if (k.split(' ').some((p) => p.startsWith(q))) nivel = 1
    else if (k.includes(q)) nivel = 2
    if (nivel >= 0) candidatas.push({ s, nivel })
  }
  return candidatas
    .sort((a, b) => a.nivel - b.nivel || b.s.documentos - a.s.documentos || a.s.texto.localeCompare(b.s.texto, 'es'))
    .slice(0, limite)
    .map((c) => c.s)
}

// ── Vista previa ────────────────────────────────────────────────────────────

/** Ruta ficticia para la vista previa: la tarjeta muestra los botones, pero no lleva a ningún lado. */
export const URL_VISTA_PREVIA = '/repositorio/admin#vista-previa'

export interface ExtrasVistaPrevia {
  /** Archivo elegido que todavía no se ha subido. */
  archivoPendiente: { extension: string; tipo: string; bytes: number } | null
  /** Se quitará el archivo al guardar. */
  quitarArchivo: boolean
}

/** DocumentoPublico con lo que hay en el formulario, para la tarjeta de la vista previa. */
export function documentoVistaPrevia(
  v: ValoresFormulario,
  original: DocumentoAdmin | null,
  extras: ExtrasVistaPrevia,
): DocumentoPublico {
  const archivo = extras.archivoPendiente
    ? { ...extras.archivoPendiente, sha256: '' }
    : extras.quitarArchivo
      ? null
      : (original?.archivo ?? null)
  const soloEnlace = esSoloEnlace(v.tipo)
  const urlExterna = esUrlHttp(v.urlVerExterna.trim()) ? v.urlVerExterna.trim() : null
  const urlVer = archivo && !soloEnlace ? URL_VISTA_PREVIA : (urlExterna ?? (archivo ? URL_VISTA_PREVIA : ''))
  const anio = /^\d{4}$/.test(v.anio.trim()) ? Number(v.anio.trim()) : null
  return {
    id: original?.id ?? (v.id.trim() || 'documento-nuevo'),
    orden: original?.orden ?? 1,
    titulo: textoLinea(v.titulo) || 'Documento sin título',
    subtitulo: textoONulo(v.subtitulo),
    descripcion: textoONulo(v.descripcion),
    categoria: textoLinea(v.categoria) || 'Sin categoría',
    numero: textoONulo(v.numero),
    anio,
    mes: null,
    idioma: v.idioma,
    tipo: v.tipo,
    claves: v.claves,
    urlVer,
    urlDescarga: archivo && v.permiteDescarga && !soloEnlace ? URL_VISTA_PREVIA : null,
    urlEntradaBlog: esUrlHttp(v.urlEntradaBlog.trim()) ? v.urlEntradaBlog.trim() : null,
    nota: textoONulo(v.nota),
    urlPortada: original?.urlPortada ?? null,
    urlMiniatura: original?.urlMiniatura ?? null,
    archivo,
    equivalenteEnEspanol: textoONulo(v.equivalenteEnEspanol),
  }
}
