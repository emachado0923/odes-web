/**
 * API de administración simulada para las pruebas (fetch y XMLHttpRequest en
 * memoria): sesión con cookie ficticia y token CSRF, documentos, categorías,
 * palabras clave y registro de cambios. Guarda cada petición para revisar
 * método, cabeceras y cuerpo.
 *
 * No es el servidor: implementa solo lo que las pruebas necesitan del
 * contrato (api-repositorio.ts), con las mismas respuestas y errores.
 */
import { vi } from 'vitest'
import {
  CABECERA_CSRF,
  type CategoriaAdmin,
  type DatosDocumento,
  type DocumentoAdmin,
  type SesionAdmin,
} from '../../api-repositorio'
import type { EstadoIndiceAdmin } from '../../../odes/chat/protocolo'
import { documentosReales } from '../../pruebas/datos-prueba'

export const USUARIO_PRUEBA = 'editora'
/** Contraseña de prueba (solo existe en esta simulación). */
export const CLAVE_PRUEBA = 'clave-de-prueba'
export const CSRF_PRUEBA = 'csrf-de-prueba-123'
/** Origen del bucket de Supabase Storage simulado (subida directa). */
export const BUCKET_PRUEBA = 'https://storage.prueba.supabase.co'

export interface PeticionRegistrada {
  metodo: string
  ruta: string
  cabeceras: Record<string, string>
  cuerpo: unknown
}

type Respuesta = { estado: number; cuerpo?: unknown; cabeceras?: Record<string, string> }
type Manejador = (p: PeticionRegistrada) => Respuesta | undefined

const API = '/api/repositorio/admin'

/** Descripción de prueba de exactamente 30 palabras (lo que se pide para publicar). */
export const DESCRIPCION_PRUEBA =
  'El boletín analiza la educación postsecundaria en Medellín con cifras de matrícula, acceso y permanencia, ' +
  'compara las instituciones públicas del Distrito y señala retos de cobertura con calidad y equidad.'

/** Palabras clave para completar 6 en los documentos de prueba (lo que se pide para publicar). */
const CLAVES_RELLENO = ['Acceso', 'Calidad educativa', 'Inclusión', 'Permanencia', 'Financiación', 'Comunas']

/** Las 6 primeras palabras clave del documento, completadas con CLAVES_RELLENO si tiene menos. */
export function seisClaves(claves: readonly string[]): string[] {
  const resultado = claves.slice(0, 6)
  for (const c of CLAVES_RELLENO) {
    if (resultado.length >= 6) break
    if (!resultado.includes(c)) resultado.push(c)
  }
  return resultado
}

function aAdmin(i: number): DocumentoAdmin {
  const d = documentosReales()[i]
  const base = `${API}/documentos/${d.id}`
  return {
    ...d,
    // Publicados: con lo que se exige para publicar (año, descripción y 6 palabras clave).
    anio: d.anio ?? 2020,
    descripcion: DESCRIPCION_PRUEBA,
    claves: seisClaves(d.claves),
    urlVer: d.archivo ? `${base}/ver` : d.urlVer,
    urlDescarga: d.urlDescarga ? `${base}/descargar` : null,
    urlPortada: `${base}/portada?v=0123456789abcdef`,
    urlMiniatura: null,
    publicado: true,
    permiteDescarga: d.urlDescarga !== null,
    urlVerExterna: d.archivo ? null : d.urlVer,
    notasInternas: null,
    creadoEn: '2026-10-08T12:00:00.000Z',
    actualizadoEn: '2026-10-08T12:00:00.000Z',
    actualizadoPor: 'importador',
  }
}

export function error(estado: number, codigo: string, mensaje: string, campos?: Record<string, string>): Respuesta {
  return { estado, cuerpo: { codigo, mensaje, ...(campos ? { campos } : {}) } }
}

export class ApiSimulada {
  sesionActiva = false
  peticiones: PeticionRegistrada[] = []
  documentos: DocumentoAdmin[]
  categorias: CategoriaAdmin[]
  palabras = [
    { id: 1, texto: 'Educación superior', documentos: 40 },
    { id: 2, texto: 'Acceso', documentos: 30 },
    { id: 3, texto: 'Deserción', documentos: 12 },
    { id: 4, texto: 'Matrícula', documentos: 25 },
    { id: 5, texto: 'Palabra sin uso', documentos: 0 },
  ]
  cambios = [
    { id: 2, fecha: '2026-10-08T15:00:00.000Z', usuario: 'editora', accion: 'publicar', documentoId: 'boletin-29', detalle: 'Publicó «Boletín 29»' },
    { id: 1, fecha: '2026-10-08T12:00:00.000Z', usuario: 'importador', accion: 'crear', documentoId: null, detalle: 'Carga inicial' },
  ]
  /** Estado del índice del Asistente ODES (GET /odes/indice). */
  indiceOdes: EstadoIndiceAdmin = {
    indice: {
      disponible: true,
      generado: '2026-10-08T10:00:00.000Z',
      origen: 'paquete',
      documentos: 372,
      documentosConTexto: 365,
      paginas: 9000,
      paginasOcr: 120,
      bytes: 52_000_000,
      error: null,
    },
    repositorio: {
      publicados: 372,
      actualizado: '2026-10-08T12:00:00.000Z',
      cambiado: true,
      motivo: 'El índice se generó desde el paquete de datos, no desde la base: reindexe para usar lo publicado.',
    },
    reindexacion: { estado: 'inactiva', inicio: null, fin: null, usuario: null, error: null, registro: [] },
  }
  /**
   * true = archivos en Supabase Storage: POST /subidas responde una URL
   * firmada del bucket simulado (BUCKET_PRUEBA) y PUT .../archivo acepta el
   * JSON { subida, nombre, tipo } en lugar del multipart.
   */
  subidaDirecta = false
  /**
   * Con un número (y sin subidaDirecta): archivos en la base con subida por
   * partes de ese tamaño. POST /subidas lo anuncia, POST /subidas/partes da
   * una ruta, PUT /subidas/partes/<uuid>/<n> guarda cada parte y PUT
   * .../archivo con { subida } arma el archivo.
   */
  tamanoParte: number | null = null
  /** Archivos recibidos por el bucket simulado, por ruta de subida. */
  bucket = new Map<string, Blob>()
  /** Partes recibidas, por ruta de subida (partes/<uuid>). */
  partes = new Map<string, Blob[]>()
  /** Respuestas forzadas para la próxima petición que coincida (método + ruta exacta o patrón). */
  private forzadas: { metodo: string; ruta: string | RegExp; respuesta: Respuesta; veces: number }[] = []

  constructor(cantidad = 60) {
    this.documentos = Array.from({ length: cantidad }, (_, i) => aAdmin(i))
    const nombres = ['Boletín', 'Estudio', 'Infografía', 'Nota temática', 'Informe dinámico', 'Informe de tendencias', 'Educación superior en cifras', 'Otros productos']
    this.categorias = nombres.map((nombre, i) => ({
      id: i + 1,
      nombre,
      orden: i + 1,
      documentos: this.documentos.filter((d) => d.categoria === nombre).length,
    }))
  }

  sesion(): SesionAdmin {
    return { usuario: USUARIO_PRUEBA, nombre: 'Editora de prueba', csrf: CSRF_PRUEBA, expira: '2026-10-09T00:00:00.000Z' }
  }

  /** La próxima petición `metodo ruta` responde `respuesta` (`veces` veces). */
  forzar(metodo: string, ruta: string | RegExp, respuesta: Respuesta, veces = 1): void {
    this.forzadas.push({ metodo, ruta, respuesta, veces })
  }

  mutaciones(): PeticionRegistrada[] {
    return this.peticiones.filter((p) => p.metodo !== 'GET')
  }

  documento(id: string): DocumentoAdmin {
    const d = this.documentos.find((x) => x.id === id)
    if (!d) throw new Error(`No existe ${id}`)
    return d
  }

  responder(p: PeticionRegistrada): Respuesta {
    this.peticiones.push(p)
    const i = this.forzadas.findIndex(
      (f) => f.metodo === p.metodo && (typeof f.ruta === 'string' ? f.ruta === p.ruta : f.ruta.test(p.ruta)),
    )
    if (i >= 0) {
      const f = this.forzadas[i]
      if (--f.veces <= 0) this.forzadas.splice(i, 1)
      return f.respuesta
    }
    return this.manejar(p)
  }

  private manejar(p: PeticionRegistrada): Respuesta {
    if (p.ruta.startsWith(BUCKET_PRUEBA)) {
      // PUT directo al bucket con la URL firmada: sin cookie ni CSRF.
      const subida = /\/(subidas\/[^?]+)\?token=/.exec(p.ruta)?.[1]
      if (p.metodo !== 'PUT' || !subida) return error(400, 'solicitud_invalida', 'Firma inválida')
      this.bucket.set(subida, p.cuerpo as Blob)
      return { estado: 200, cuerpo: { Key: subida } }
    }
    const ruta = p.ruta.replace(API, '').split('?')[0]
    if (ruta === '/sesion') {
      if (p.metodo === 'POST') {
        const c = p.cuerpo as { usuario?: string; contrasena?: string }
        if (c.usuario !== USUARIO_PRUEBA || c.contrasena !== CLAVE_PRUEBA) {
          return error(401, 'no_autenticado', 'Usuario o contraseña incorrectos.')
        }
        this.sesionActiva = true
        return { estado: 200, cuerpo: this.sesion() }
      }
      if (p.metodo === 'DELETE') {
        this.sesionActiva = false
        return { estado: 204 }
      }
    }
    if (!this.sesionActiva) return error(401, 'no_autenticado', 'La sesión no existe o venció. Inicie sesión de nuevo.')
    if (p.metodo !== 'GET' && p.cabeceras[CABECERA_CSRF.toLowerCase()] !== CSRF_PRUEBA) {
      return error(403, 'prohibido', 'Falta el token de seguridad (X-CSRF-Token) o no es válido.')
    }
    const manejadores: Manejador[] = [
      () => (ruta === '/sesion' && p.metodo === 'GET' ? { estado: 200, cuerpo: this.sesion() } : undefined),
      () => {
        if (ruta !== '/subidas' || p.metodo !== 'POST') return undefined
        if (!this.subidaDirecta) {
          return {
            estado: 200,
            cuerpo:
              this.tamanoParte === null
                ? { directa: false }
                : { directa: false, tamanoParte: this.tamanoParte, maxBytes: 80 * 1024 * 1024 },
          }
        }
        const subida = `subidas/0000000${this.bucket.size}-1111-2222-3333-444444444444`
        return {
          estado: 200,
          cuerpo: {
            directa: true,
            ruta: subida,
            url: `${BUCKET_PRUEBA}/storage/v1/object/upload/sign/repositorio/${subida}?token=t${this.bucket.size}`,
            maxBytes: 80 * 1024 * 1024,
          },
        }
      },
      () => {
        if (ruta !== '/subidas/partes' || p.metodo !== 'POST' || this.tamanoParte === null) return undefined
        const subida = `partes/0000000${this.partes.size}-1111-2222-3333-444444444444`
        this.partes.set(subida, [])
        return { estado: 201, cuerpo: { ruta: subida, tamanoParte: this.tamanoParte } }
      },
      () => {
        const parte = /^\/subidas\/(partes\/[0-9a-f-]{36})\/(\d+)$/.exec(ruta)
        if (!parte || p.metodo !== 'PUT') return undefined
        const recibidas = this.partes.get(parte[1])
        if (!recibidas) return error(400, 'solicitud_invalida', 'La subida no es válida o ya venció.')
        recibidas[Number(parte[2])] = p.cuerpo as Blob
        return { estado: 204 }
      },
      () => (ruta === '/documentos' && p.metodo === 'GET' ? { estado: 200, cuerpo: { documentos: this.documentos } } : undefined),
      () => (ruta === '/documentos' && p.metodo === 'POST' ? this.crear(p.cuerpo as DatosDocumento) : undefined),
      () => this.documentoRuta(ruta, p),
      () => (ruta === '/categorias' && p.metodo === 'GET' ? { estado: 200, cuerpo: { categorias: this.categorias } } : undefined),
      () => (ruta === '/palabras-clave' && p.metodo === 'GET' ? { estado: 200, cuerpo: { palabras: this.palabras } } : undefined),
      () => (ruta === '/cambios' && p.metodo === 'GET' ? { estado: 200, cuerpo: { cambios: this.cambios } } : undefined),
      () => (ruta === '/odes/indice' && p.metodo === 'GET' ? { estado: 200, cuerpo: this.indiceOdes } : undefined),
      () => {
        if (ruta !== '/odes/reindexar' || p.metodo !== 'POST') return undefined
        if (this.indiceOdes.reindexacion.estado === 'en_curso') return error(409, 'conflicto', 'Ya hay una reindexación en curso.')
        this.indiceOdes = {
          ...this.indiceOdes,
          reindexacion: { estado: 'en_curso', inicio: '2026-10-08T15:00:00.000Z', fin: null, usuario: USUARIO_PRUEBA, error: null, registro: ['Leyendo 372 documentos…'] },
        }
        return { estado: 202, cuerpo: this.indiceOdes }
      },
    ]
    for (const m of manejadores) {
      const r = m(p)
      if (r) return r
    }
    return error(404, 'no_encontrado', `No simulado: ${p.metodo} ${p.ruta}`)
  }

  private crear(datos: DatosDocumento): Respuesta {
    const id = datos.id ?? 'documento-nuevo-2026'
    const doc: DocumentoAdmin = {
      ...aAdmin(0),
      ...this.desdeDatos(datos),
      id,
      orden: 1,
      archivo: null,
      urlVer: datos.urlVerExterna ?? '',
      urlDescarga: null,
      urlPortada: null,
      urlMiniatura: null,
      publicado: false,
    }
    this.documentos.unshift(doc)
    return { estado: 201, cuerpo: doc }
  }

  private desdeDatos(d: DatosDocumento): Partial<DocumentoAdmin> {
    return {
      titulo: d.titulo,
      subtitulo: d.subtitulo ?? null,
      descripcion: d.descripcion ?? null,
      categoria: d.categoria,
      numero: d.numero ?? null,
      anio: d.anio ?? null,
      mes: d.mes ?? null,
      idioma: d.idioma,
      tipo: d.tipo,
      claves: d.claves,
      urlVerExterna: d.urlVerExterna ?? null,
      urlEntradaBlog: d.urlEntradaBlog ?? null,
      nota: d.nota ?? null,
      permiteDescarga: d.permiteDescarga,
      equivalenteEnEspanol: d.equivalenteEnEspanol ?? null,
      notasInternas: d.notasInternas ?? null,
      actualizadoPor: USUARIO_PRUEBA,
    }
  }

  private documentoRuta(ruta: string, p: PeticionRegistrada): Respuesta | undefined {
    const m = ruta.match(/^\/documentos\/([^/]+)(?:\/(.+))?$/)
    if (!m) return undefined
    const id = decodeURIComponent(m[1])
    const indice = this.documentos.findIndex((d) => d.id === id)
    if (indice < 0) return error(404, 'no_encontrado', 'El documento no existe.')
    const doc = this.documentos[indice]
    const guardar = (nuevo: DocumentoAdmin): Respuesta => {
      this.documentos[indice] = nuevo
      return { estado: 200, cuerpo: nuevo }
    }
    const sub = m[2]
    if (!sub && p.metodo === 'GET') return { estado: 200, cuerpo: doc }
    if (!sub && p.metodo === 'PUT') return guardar({ ...doc, ...this.desdeDatos(p.cuerpo as DatosDocumento) })
    if (!sub && p.metodo === 'DELETE') {
      if ((p.cuerpo as { confirmarId?: string }).confirmarId !== id) {
        return error(400, 'solicitud_invalida', 'La confirmación no coincide.', { confirmarId: 'La confirmación no coincide con el identificador del documento.' })
      }
      if (doc.publicado) return error(409, 'conflicto', 'Despublique el documento antes de borrarlo definitivamente.')
      this.documentos.splice(indice, 1)
      return { estado: 204 }
    }
    if (sub === 'publicar' || sub === 'despublicar') return guardar({ ...doc, publicado: sub === 'publicar' })
    if (sub === 'archivo' && p.metodo === 'PUT') {
      const directa = p.cuerpo instanceof FormData ? null : (p.cuerpo as { subida?: string; tipo?: string })
      const porPartes = directa ? this.partes.get(directa.subida ?? '') : undefined
      const recibido = directa ? (porPartes ? new Blob(porPartes) : this.bucket.get(directa.subida ?? '')) : null
      if (directa && !recibido) return error(400, 'solicitud_invalida', 'La subida no existe.')
      const archivo = recibido
        ? { type: directa?.tipo ?? '', size: recibido.size }
        : ((p.cuerpo as FormData).get('archivo') as File)
      return guardar({
        ...doc,
        archivo: { tipo: archivo.type, bytes: archivo.size, extension: 'pdf', sha256: 'abc' },
        urlVer: `${API}/documentos/${id}/ver`,
      })
    }
    if (sub === 'archivo' && p.metodo === 'DELETE') return guardar({ ...doc, archivo: null, urlVer: doc.urlVerExterna ?? '' })
    if (sub === 'portada' && p.metodo === 'PUT') {
      return guardar({ ...doc, urlPortada: `${API}/documentos/${id}/portada?v=fedcba9876543210` })
    }
    return undefined
  }
}

function cabecerasDe(h: HeadersInit | undefined): Record<string, string> {
  const r: Record<string, string> = {}
  new Headers(h).forEach((v, k) => (r[k] = v))
  return r
}

/** Instala fetch y XMLHttpRequest simulados. Llamar en beforeEach; vi.unstubAllGlobals() en afterEach. */
export function instalarApi(api: ApiSimulada): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (entrada: RequestInfo | URL, init: RequestInit = {}) => {
      const ruta = String(entrada)
      if (init.signal?.aborted) throw new DOMException('Abortado', 'AbortError')
      const texto = typeof init.body === 'string' ? init.body : null
      const r = api.responder({
        metodo: (init.method ?? 'GET').toUpperCase(),
        ruta,
        cabeceras: { ...cabecerasDe(init.headers), 'x-credentials': String(init.credentials ?? '') },
        cuerpo: texto ? JSON.parse(texto) : (init.body ?? null),
      })
      return new Response(r.estado === 204 || r.cuerpo === undefined ? null : JSON.stringify(r.cuerpo), {
        status: r.estado,
        headers: { 'Content-Type': 'application/json', ...r.cabeceras },
      })
    }),
  )

  class XhrSimulado {
    status = 0
    responseText = ''
    responseType = ''
    private metodo = 'GET'
    private ruta = ''
    private cabeceras: Record<string, string> = {}
    private respuestaCabeceras: Record<string, string> = {}
    private oyentes = new Map<string, (() => void)[]>()
    upload = {
      oyentes: [] as ((e: { lengthComputable: boolean; loaded: number; total: number }) => void)[],
      addEventListener(_tipo: string, f: (e: { lengthComputable: boolean; loaded: number; total: number }) => void) {
        this.oyentes.push(f)
      },
    }
    open(metodo: string, ruta: string) {
      this.metodo = metodo
      this.ruta = ruta
    }
    setRequestHeader(nombre: string, valor: string) {
      this.cabeceras[nombre.toLowerCase()] = valor
    }
    getResponseHeader(nombre: string) {
      return this.respuestaCabeceras[nombre] ?? null
    }
    addEventListener(tipo: string, f: () => void) {
      this.oyentes.set(tipo, [...(this.oyentes.get(tipo) ?? []), f])
    }
    abort() {
      for (const f of this.oyentes.get('abort') ?? []) f()
    }
    send(cuerpo: FormData | Blob) {
      setTimeout(() => {
        for (const f of this.upload.oyentes) f({ lengthComputable: true, loaded: 50, total: 100 })
        const r = api.responder({ metodo: this.metodo, ruta: this.ruta, cabeceras: this.cabeceras, cuerpo })
        this.status = r.estado
        this.respuestaCabeceras = r.cabeceras ?? {}
        this.responseText = r.cuerpo === undefined ? '' : JSON.stringify(r.cuerpo)
        for (const f of this.upload.oyentes) f({ lengthComputable: true, loaded: 100, total: 100 })
        for (const f of this.oyentes.get('load') ?? []) f()
      }, 0)
    }
  }
  vi.stubGlobal('XMLHttpRequest', XhrSimulado)
}
