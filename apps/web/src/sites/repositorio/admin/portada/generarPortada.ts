/**
 * Genera la portada (JPEG 720 × 720, calidad 80) y la miniatura (WebP
 * 192 × 192, o PNG si el navegador no sabe codificar WebP) en el navegador:
 *
 * - desde un PDF: pdf.js rasteriza la primera página a 1400 px de ancho (como
 *   el paquete original) y composicion.ts la compone;
 * - desde una imagen: la misma composición, o la imagen tal cual (llevada a
 *   720 px) si ya es cuadrada.
 *
 * Usa el DOM (canvas): en las pruebas se simula este módulo.
 */
import {
  CALIDAD_JPEG,
  CALIDAD_MINIATURA,
  MAX_PIXELES_LIENZO,
  ajustarCuadrada,
  componerPortada,
  esCuadrada,
  escalaRender,
  miniaturaDe,
  type Corte,
  type Imagen,
} from './composicion'
import { abrirPdf } from './pdf'

export type OrigenPortada = 'pdf' | 'imagen' | 'imagen-cuadrada'

export interface PortadaGenerada {
  portada: Blob
  miniatura: { datos: Blob; nombre: string }
  /** URL blob: de la portada para la vista previa (liberarla con URL.revokeObjectURL). */
  url: string
  urlMiniatura: string
  origen: OrigenPortada
  /** Tamaño de la página o imagen de origen, en píxeles. */
  origenAncho: number
  origenAlto: number
  recortada: boolean
  corte: Corte | null
}

/** Píxeles máximos de una imagen de origen antes de reducirla al decodificar (límite del lienzo). */
const MAX_PIXELES_IMAGEN = MAX_PIXELES_LIENZO

function lienzo(ancho: number, alto: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas')
  canvas.width = ancho
  canvas.height = alto
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new ErrorPortada('El navegador no permitió crear un lienzo (canvas) para la portada.')
  return { canvas, ctx }
}

function aBlob(canvas: HTMLCanvasElement, tipo: string, calidad?: number): Promise<Blob> {
  return new Promise((resolver, rechazar) => {
    canvas.toBlob(
      (blob) => (blob ? resolver(blob) : rechazar(new ErrorPortada('No se pudo codificar la imagen.'))),
      tipo,
      calidad,
    )
  })
}

function aCanvas(img: Imagen): HTMLCanvasElement {
  const { canvas, ctx } = lienzo(img.ancho, img.alto)
  ctx.putImageData(new ImageData(img.datos, img.ancho, img.alto), 0, 0)
  return canvas
}

/** Deja que el navegador pinte el aviso "Generando…" antes del trabajo pesado. */
function respirar(): Promise<void> {
  return new Promise((resolver) => setTimeout(resolver, 0))
}

async function codificar(
  portada: Imagen,
  datos: Omit<PortadaGenerada, 'portada' | 'miniatura' | 'url' | 'urlMiniatura'>,
): Promise<PortadaGenerada> {
  const jpeg = await aBlob(aCanvas(portada), 'image/jpeg', CALIDAD_JPEG)
  const chica = aCanvas(miniaturaDe(portada))
  let miniatura = await aBlob(chica, 'image/webp', CALIDAD_MINIATURA)
  let nombre = 'miniatura.webp'
  // Safari antiguo devuelve PNG cuando no sabe codificar WebP: el servidor acepta las dos.
  if (miniatura.type !== 'image/webp') {
    miniatura = miniatura.type === 'image/png' ? miniatura : await aBlob(chica, 'image/png')
    nombre = 'miniatura.png'
  }
  return {
    portada: jpeg,
    miniatura: { datos: miniatura, nombre },
    url: URL.createObjectURL(jpeg),
    urlMiniatura: URL.createObjectURL(miniatura),
    ...datos,
  }
}

/** Rasteriza la primera página del PDF a 1400 px de ancho. */
async function rasterizarPrimeraPagina(datos: Uint8Array): Promise<Imagen> {
  const { documento, cerrar } = await abrirPdf(datos)
  try {
    const pagina = await documento.getPage(1)
    const base = pagina.getViewport({ scale: 1 })
    const vista = pagina.getViewport({ scale: escalaRender(base.width, base.height) })
    const ancho = Math.max(1, Math.round(vista.width))
    const alto = Math.max(1, Math.round(vista.height))
    const { canvas, ctx } = lienzo(ancho, alto)
    await pagina.render({ canvas, viewport: vista, background: 'rgb(255,255,255)' }).promise
    const imagen = ctx.getImageData(0, 0, ancho, alto)
    pagina.cleanup()
    return { ancho, alto, datos: imagen.data }
  } finally {
    await cerrar()
  }
}

/**
 * Error con un mensaje en español apto para mostrar. Cualquier otro error
 * (p. ej., no se pudo descargar este módulo tras un despliegue) se muestra
 * con un texto genérico.
 */
export class ErrorPortada extends Error {
  constructor(mensaje: string, opciones?: { cause?: unknown }) {
    super(mensaje, opciones)
    this.name = 'ErrorPortada'
  }
}

/** Mensaje en español para un error de pdf.js (sus mensajes vienen en inglés). */
export function mensajeErrorPdf(error: unknown): string {
  const nombre = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : ''
  if (nombre === 'PasswordException') return 'El PDF está protegido con contraseña.'
  if (nombre === 'InvalidPDFException') return 'El archivo no es un PDF válido o está dañado.'
  return 'No se pudo leer la primera página del PDF.'
}

/** Portada a partir de un PDF (archivo elegido o descargado del servidor). */
export async function portadaDesdePdf(fuente: Blob | ArrayBuffer): Promise<PortadaGenerada> {
  const bytes = new Uint8Array(fuente instanceof Blob ? await fuente.arrayBuffer() : fuente.slice(0))
  let pagina: Imagen
  try {
    pagina = await rasterizarPrimeraPagina(bytes)
  } catch (error) {
    // Un fallo al descargar pdf.js (p. ej., tras un despliegue) también llega aquí.
    throw new ErrorPortada(mensajeErrorPdf(error), { cause: error })
  }
  await respirar()
  const r = componerPortada(pagina)
  return codificar(r.imagen, {
    origen: 'pdf',
    origenAncho: pagina.ancho,
    origenAlto: pagina.alto,
    recortada: r.disposicion.recortada,
    corte: r.corte,
  })
}

/** Portada a partir de una imagen (JPEG, PNG o WebP). */
export async function portadaDesdeImagen(archivo: Blob): Promise<PortadaGenerada> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(archivo)
    if (bitmap.width * bitmap.height > MAX_PIXELES_IMAGEN) {
      const f = Math.sqrt(MAX_PIXELES_IMAGEN / (bitmap.width * bitmap.height))
      const reducido = await createImageBitmap(archivo, {
        resizeWidth: Math.max(1, Math.round(bitmap.width * f)),
        resizeHeight: Math.max(1, Math.round(bitmap.height * f)),
        resizeQuality: 'high',
      })
      bitmap.close()
      bitmap = reducido
    }
  } catch {
    throw new ErrorPortada('No se pudo leer la imagen. Use un JPEG, PNG o WebP.')
  }
  const { ancho, alto } = { ancho: bitmap.width, alto: bitmap.height }
  const { ctx } = lienzo(ancho, alto)
  // Las zonas transparentes quedan blancas.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, ancho, alto)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const imagen: Imagen = { ancho, alto, datos: ctx.getImageData(0, 0, ancho, alto).data }
  await respirar()
  if (esCuadrada(imagen)) {
    return codificar(ajustarCuadrada(imagen), {
      origen: 'imagen-cuadrada',
      origenAncho: ancho,
      origenAlto: alto,
      recortada: false,
      corte: null,
    })
  }
  const r = componerPortada(imagen)
  return codificar(r.imagen, {
    origen: 'imagen',
    origenAncho: ancho,
    origenAlto: alto,
    recortada: r.disposicion.recortada,
    corte: r.corte,
  })
}

/** Libera las URL blob: de una portada generada. */
export function liberarPortada(p: PortadaGenerada | null): void {
  if (!p) return
  URL.revokeObjectURL(p.url)
  URL.revokeObjectURL(p.urlMiniatura)
}
