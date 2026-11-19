/**
 * Datos para las pruebas: los 372 productos reales del Repositorio (paquete
 * Septiembre/observatorio/repositorio-datos/repositorio.json, v4.2) en forma
 * compacta, convertidos a DocumentoPublico como los entregaría la API.
 *
 * repositorio-v4-2.json guarda solo lo que usan la búsqueda, los filtros y la
 * tarjeta; las URL se arman aquí igual que en el servidor.
 */
import type { DocumentoPublico, IdiomaProducto, ListadoPublico, TipoProducto } from '../api-repositorio'
import compacto from './repositorio-v4-2.json'

interface Compacto {
  id: string
  orden: number
  titulo: string
  subtitulo?: string
  categoria: string
  numero?: string
  anio?: number
  idioma: string
  tipo: string
  claves: string[]
  /** Tiene entrada de blog. */
  blog?: number
  /** Tiene nota (los 6 estudios de OneDrive). */
  nota?: number
  /** Extensión del archivo propio, si tiene. */
  archivo?: string
  /** Permite descarga. */
  descarga?: number
}

export const CATEGORIAS_PRUEBA = [
  'Boletín',
  'Estudio',
  'Infografía',
  'Nota temática',
  'Informe dinámico',
  'Informe de tendencias',
  'Educación superior en cifras',
  'Otros productos',
]

export const NOTA_ONEDRIVE = 'El archivo está en OneDrive de Sapiencia: al abrirlo puede pedir iniciar sesión.'

function aPublico(c: Compacto): DocumentoPublico {
  const api = `/api/repositorio/documentos/${c.id}`
  return {
    id: c.id,
    orden: c.orden,
    titulo: c.titulo,
    subtitulo: c.subtitulo ?? null,
    categoria: c.categoria,
    numero: c.numero ?? null,
    anio: c.anio ?? null,
    mes: null,
    idioma: c.idioma as IdiomaProducto,
    tipo: c.tipo as TipoProducto,
    claves: c.claves,
    descripcion: null,
    urlVer: c.archivo ? `${api}/ver` : `https://app.powerbi.com/view?r=${c.id}`,
    urlDescarga: c.archivo && c.descarga ? `${api}/descargar` : null,
    urlEntradaBlog: c.blog ? `https://sapiencia.gov.co/${c.id}/` : null,
    nota: c.nota ? NOTA_ONEDRIVE : null,
    urlPortada: `${api}/portada`,
    urlMiniatura: `${api}/miniatura`,
    archivo: c.archivo ? { tipo: 'application/pdf', bytes: 1000, extension: c.archivo, sha256: '' } : null,
    equivalenteEnEspanol: null,
  }
}

/** Los 372 documentos, en el orden "Más recientes". */
export function documentosReales(): DocumentoPublico[] {
  return (compacto as Compacto[]).map(aPublico)
}

export function listadoReal(): ListadoPublico {
  const documentos = documentosReales()
  return { actualizado: '2026-10-08T00:00:00.000Z', total: documentos.length, categorias: CATEGORIAS_PRUEBA, documentos }
}

/** Un documento de prueba con valores por defecto. */
export function documento(parcial: Partial<DocumentoPublico> = {}): DocumentoPublico {
  return {
    id: 'boletin-19-fe-de-erratas',
    orden: 1,
    titulo: 'Fe de erratas del Boletín N.º 19',
    subtitulo: null,
    categoria: 'Boletín',
    numero: '19',
    anio: 2020,
    mes: null,
    idioma: 'es',
    tipo: 'documento',
    claves: ['Acceso'],
    descripcion: null,
    urlVer: '/api/repositorio/documentos/boletin-19-fe-de-erratas/ver',
    urlDescarga: '/api/repositorio/documentos/boletin-19-fe-de-erratas/descargar',
    urlEntradaBlog: null,
    nota: null,
    urlPortada: '/api/repositorio/documentos/boletin-19-fe-de-erratas/portada',
    urlMiniatura: null,
    archivo: { tipo: 'application/pdf', bytes: 1000, extension: 'pdf', sha256: '' },
    equivalenteEnEspanol: null,
    ...parcial,
  }
}

export function listado(documentos: DocumentoPublico[], categorias: string[] = CATEGORIAS_PRUEBA): ListadoPublico {
  return { actualizado: '2026-10-08T00:00:00.000Z', total: documentos.length, categorias, documentos }
}
