/**
 * pdf.js, cargado solo cuando hace falta (import dinámico: no llega ni al
 * chunk de la página pública ni al de la administración hasta que se genera
 * una portada).
 *
 * Funciona con la CSP de producción:
 * - El worker sale del propio servidor (Vite ?url: /assets/pdf.worker-*.mjs,
 *   worker-src 'self').
 * - pdf.js 6 ya no usa eval ni new Function (la opción isEvalSupported
 *   desapareció); no hace falta 'unsafe-eval'.
 * - Los decodificadores en WebAssembly (JPEG 2000 y JBIG2) y las fuentes
 *   estándar no incrustadas (Symbol, ZapfDingbats) también se sirven desde el
 *   propio servidor: el worker se los pide a esta página (useWorkerFetch:
 *   false) y FabricaDatosBinarios los busca con su URL con hash de Vite.
 *   WebAssembly necesita 'wasm-unsafe-eval', que la CSP ya permite.
 */
import type { PDFDocumentProxy } from 'pdfjs-dist'

type Pdfjs = typeof import('pdfjs-dist')

/** Recursos que el worker puede pedir, con su URL de Vite (se descargan solo si se piden). */
const RECURSOS: Readonly<Record<string, () => Promise<{ default: string }>>> = {
  'openjpeg.wasm': () => import('pdfjs-dist/wasm/openjpeg.wasm?url'),
  'jbig2.wasm': () => import('pdfjs-dist/wasm/jbig2.wasm?url'),
  'FoxitSymbol.pfb': () => import('pdfjs-dist/standard_fonts/FoxitSymbol.pfb?url'),
  'FoxitDingbats.pfb': () => import('pdfjs-dist/standard_fonts/FoxitDingbats.pfb?url'),
}

/** BinaryDataFactory de pdf.js: entrega los recursos por nombre de archivo. */
class FabricaDatosBinarios {
  async fetch({ kind, filename }: { kind: string; filename: string }): Promise<Uint8Array> {
    const cargar = RECURSOS[filename]
    if (!cargar) throw new Error(`pdf.js pidió un recurso que no está disponible: ${kind} ${filename}`)
    const url = (await cargar()).default
    const respuesta = await fetch(url)
    if (!respuesta.ok) throw new Error(`No se pudo descargar ${filename} (${respuesta.status}).`)
    return new Uint8Array(await respuesta.arrayBuffer())
  }
}

let carga: Promise<Pdfjs> | null = null

export function cargarPdfjs(): Promise<Pdfjs> {
  carga ??= Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.mjs?url')])
    .then(([pdfjs, worker]) => {
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default
      return pdfjs
    })
    .catch((error: unknown) => {
      carga = null
      throw error
    })
  return carga
}

export interface PdfAbierto {
  documento: PDFDocumentProxy
  /** Libera el documento y su worker (loadingTask.destroy()). */
  cerrar: () => Promise<void>
}

/** Abre un PDF (los bytes se transfieren al worker). */
export async function abrirPdf(datos: Uint8Array): Promise<PdfAbierto> {
  const pdfjs = await cargarPdfjs()
  const tarea = pdfjs.getDocument({
    data: datos,
    BinaryDataFactory: FabricaDatosBinarios,
    useWorkerFetch: false,
    useSystemFonts: true,
    enableXfa: false,
    stopAtErrors: false,
  })
  try {
    return { documento: await tarea.promise, cerrar: () => tarea.destroy() }
  } catch (error) {
    await tarea.destroy().catch(() => {})
    throw error
  }
}
