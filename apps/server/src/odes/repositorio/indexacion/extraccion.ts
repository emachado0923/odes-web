import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { CacheExtraccion, EntradaCache } from './cache-extraccion.js';
import type { Limitador } from './limitador.js';
import { caracteresVisibles, filtrarRuidoOcr } from './limpieza.js';

/**
 * Extracción de texto con herramientas externas. SOLO se usa al indexar
 * (npm run odes:indexar): el servidor no las necesita.
 *
 * - PDF: `pdftotext -enc UTF-8` (poppler). pdftotext separa las páginas con un
 *   salto de página (\f), así que el número de página de cada texto es exacto.
 *   Las páginas casi sin texto (portadas, gráficos escaneados) pasan por OCR:
 *   `pdftoppm` a ~150 ppp en escala de grises y `tesseract -l spa+eng`. Se usa
 *   el texto del OCR solo si aporta más que el original. Máximo de páginas
 *   con OCR por documento configurable.
 * - PNG/JPG (infografías): tesseract directo, una "página".
 * - DOCX: texto de word/document.xml; las páginas salen de los saltos que Word
 *   guardó (w:lastRenderedPageBreak / saltos de página manuales).
 * - PPTX: una página por diapositiva, en el orden de la presentación.
 *
 * El resultado crudo (texto de cada página y del OCR) se guarda en la caché
 * por hash del archivo: reindexar sin cambios no vuelve a ejecutar nada.
 *
 * El archivo puede ser una ruta local o un ArchivoExtraible: si ya se conoce
 * su sha256 (archivos de la base de datos del repositorio), la caché se
 * consulta sin tener el archivo, y la ruta solo se pide (y el archivo se
 * copia a disco) cuando hace falta ejecutar una herramienta.
 */

const ejecutarArchivo = promisify(execFile);

export interface OpcionesExtraccion {
  /** false = nunca OCR (más rápido; las páginas sin texto quedan vacías). */
  ocr: boolean;
  /** Máximo de páginas de un PDF que pasan por OCR. */
  maxPaginasOcr: number;
  /** Idiomas de tesseract. */
  idiomasOcr: string;
  /** Una página con menos caracteres visibles que esto pasa por OCR. */
  umbralOcr: number;
}

export const OPCIONES_EXTRACCION_POR_DEFECTO: OpcionesExtraccion = {
  ocr: true,
  maxPaginasOcr: 60,
  idiomasOcr: 'spa+eng',
  umbralOcr: 60,
};

export type MetodoExtraccion = 'pdftotext' | 'ocr' | 'docx' | 'pptx';

export interface TextoExtraido {
  /** Texto crudo de cada página (posición 0 = página 1). */
  paginas: string[];
  /** Páginas (desde 1) cuyo texto viene del OCR. */
  paginasOcr: number[];
  /** Páginas que pedían OCR pero quedaron fuera por el tope. */
  paginasSinOcrPorTope: number;
  metodo: MetodoExtraccion;
  /** true si se reutilizó todo desde la caché. */
  desdeCache: boolean;
}

export class ErrorExtraccion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorExtraccion';
  }
}

interface Herramientas {
  limitador: Limitador;
  cache: CacheExtraccion;
}

/** Archivo para extraer cuando no es simplemente una ruta local. */
export interface ArchivoExtraible {
  /** Nombre o ruta con extensión (ayuda a reconocer el formato). */
  readonly nombre: string;
  /** sha256 del contenido (hex), si se conoce; si no, se calcula leyendo el archivo. */
  readonly sha256: string | null;
  /** Ruta local del archivo. Se llama solo si hay que ejecutar una herramienta (y una sola vez). */
  ruta(): Promise<string>;
}

/** Ruta perezosa y memorizada: el archivo se obtiene la primera vez que se pide. */
type RutaPerezosa = () => Promise<string>;

function memorizar(obtener: () => Promise<string>): RutaPerezosa {
  let promesa: Promise<string> | null = null;
  return () => {
    promesa ??= obtener();
    return promesa;
  };
}

async function ejecutar(
  herramientas: Herramientas,
  comando: string,
  argumentos: string[],
  opciones: { timeout: number; binario?: boolean } = { timeout: 120_000 },
): Promise<string> {
  return herramientas.limitador.ejecutar(async () => {
    try {
      const { stdout } = await ejecutarArchivo(comando, argumentos, {
        timeout: opciones.timeout,
        maxBuffer: 256 * 1024 * 1024,
        encoding: 'utf8',
        // tesseract usa OpenMP: un hilo por proceso, el paralelismo lo da el limitador.
        env: { ...process.env, OMP_THREAD_LIMIT: '1' },
      });
      return stdout;
    } catch (error) {
      const detalle = error as NodeJS.ErrnoException & {
        stderr?: string;
        killed?: boolean;
      };
      if (detalle.code === 'ENOENT') {
        throw new ErrorExtraccion(
          `No se encontró "${comando}". Instale poppler (pdftotext, pdftoppm, pdfinfo), tesseract (con spa y eng) y unzip.`,
        );
      }
      const motivo = detalle.killed
        ? `tiempo agotado (${opciones.timeout / 1000} s)`
        : (detalle.stderr?.trim().split('\n').at(-1) ?? detalle.message);
      throw new ErrorExtraccion(`${comando} falló: ${motivo}`);
    }
  });
}

/** Divide la salida de pdftotext en páginas (el \f final cierra la última). */
export function paginasDePdftotext(salida: string): string[] {
  const paginas = salida.split('\f');
  if (paginas.length > 1 && paginas.at(-1)!.trim() === '') paginas.pop();
  return paginas;
}

/** Tamaño de cada página (en puntos) según `pdfinfo -f 1 -l N`. */
export function tamanosDePdfinfo(
  salida: string,
): Map<number, { ancho: number; alto: number }> {
  const tamanos = new Map<number, { ancho: number; alto: number }>();
  for (const linea of salida.split('\n')) {
    const coincidencia = /^Page\s+(\d+)\s+size:\s+([\d.]+)\s+x\s+([\d.]+)/.exec(
      linea,
    );
    if (coincidencia) {
      tamanos.set(Number(coincidencia[1]), {
        ancho: Number(coincidencia[2]),
        alto: Number(coincidencia[3]),
      });
    }
  }
  return tamanos;
}

const ENTIDADES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodificarEntidades(texto: string): string {
  return texto.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entidad, cuerpo: string) => {
      if (cuerpo.startsWith('#x') || cuerpo.startsWith('#X')) {
        const codigo = Number.parseInt(cuerpo.slice(2), 16);
        return Number.isFinite(codigo) && codigo <= 0x10ffff
          ? String.fromCodePoint(codigo)
          : entidad;
      }
      if (cuerpo.startsWith('#')) {
        const codigo = Number.parseInt(cuerpo.slice(1), 10);
        return Number.isFinite(codigo) && codigo <= 0x10ffff
          ? String.fromCodePoint(codigo)
          : entidad;
      }
      return ENTIDADES[cuerpo.toLowerCase()] ?? entidad;
    },
  );
}

/** Páginas de texto de un word/document.xml. */
export function paginasDeDocx(xml: string): string[] {
  const marcado = xml
    // Códigos de campo (TOC, PAGEREF…) y texto borrado no son contenido.
    .replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/g, '')
    .replace(/<w:delText\b[^>]*>[\s\S]*?<\/w:delText>/g, '')
    .replace(/<w:lastRenderedPageBreak\s*\/>/g, '\f')
    .replace(/<w:br\b[^>]*w:type="page"[^>]*\/>/g, '\f')
    .replace(/<w:tab\s*\/>/g, ' ')
    .replace(/<w:(br|cr)\b[^>]*\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n\n')
    .replace(/<[^>]+>/g, '');
  const paginas = decodificarEntidades(marcado).split('\f');
  // Un salto al final (o al comienzo) deja una página vacía que no existe.
  while (paginas.length > 1 && paginas.at(-1)!.trim() === '') paginas.pop();
  while (paginas.length > 1 && paginas[0]!.trim() === '') paginas.shift();
  return paginas;
}

/** Texto de una diapositiva (ppt/slides/slideN.xml). */
export function textoDeDiapositiva(xml: string): string {
  return decodificarEntidades(
    xml
      .replace(/<a:br\b[^>]*\/>/g, '\n')
      .replace(/<\/a:p>/g, '\n')
      .replace(/<\/p:sp>/g, '\n\n')
      .replace(/<[^>]+>/g, ''),
  );
}

/**
 * Rutas de las diapositivas en el orden de la presentación
 * (presentation.xml -> sldIdLst, resuelto con presentation.xml.rels).
 */
export function ordenDeDiapositivas(
  presentacionXml: string,
  relacionesXml: string,
  entradas: readonly string[],
): string[] {
  const destinos = new Map<string, string>();
  for (const relacion of relacionesXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(relacion[0])?.[1];
    const destino = /\bTarget="([^"]+)"/.exec(relacion[0])?.[1];
    if (id && destino)
      destinos.set(id, destino.replace(/^\/?(ppt\/)?/, 'ppt/'));
  }
  const ordenadas: string[] = [];
  for (const sld of presentacionXml.matchAll(/<p:sldId\b[^>]*>/g)) {
    const rid = /\br:id="([^"]+)"/.exec(sld[0])?.[1];
    const destino = rid ? destinos.get(rid) : undefined;
    if (destino && entradas.includes(destino)) ordenadas.push(destino);
  }
  if (ordenadas.length > 0) return ordenadas;
  // Sin presentation.xml legible: orden numérico de slideN.xml.
  return entradas
    .filter((entrada) => /^ppt\/slides\/slide\d+\.xml$/.test(entrada))
    .toSorted(
      (a, b) =>
        Number(/(\d+)\.xml$/.exec(a)![1]) - Number(/(\d+)\.xml$/.exec(b)![1]),
    );
}

async function ocrDeImagen(
  herramientas: Herramientas,
  ruta: string,
  opciones: OpcionesExtraccion,
): Promise<string> {
  return ejecutar(
    herramientas,
    'tesseract',
    [ruta, 'stdout', '-l', opciones.idiomasOcr],
    {
      timeout: 300_000,
    },
  );
}

/** Resolución para que el lado mayor de la página no pase de 6000 px. */
function resolucionOcr(
  tamano: { ancho: number; alto: number } | undefined,
): number {
  const ladoMayor = tamano ? Math.max(tamano.ancho, tamano.alto) : 842;
  return Math.max(72, Math.min(150, Math.floor((6000 * 72) / ladoMayor)));
}

async function ocrDePaginaPdf(
  herramientas: Herramientas,
  ruta: string,
  pagina: number,
  resolucion: number,
  opciones: OpcionesExtraccion,
): Promise<string> {
  const directorio = await mkdtemp(join(tmpdir(), 'odes-ocr-'));
  try {
    const prefijo = join(directorio, 'pagina');
    await ejecutar(herramientas, 'pdftoppm', [
      '-f',
      String(pagina),
      '-l',
      String(pagina),
      '-r',
      String(resolucion),
      '-gray',
      '-png',
      '-singlefile',
      ruta,
      prefijo,
    ]);
    return await ocrDeImagen(herramientas, `${prefijo}.png`, opciones);
  } finally {
    await rm(directorio, { recursive: true, force: true });
  }
}

async function extraerPdf(
  herramientas: Herramientas,
  ruta: RutaPerezosa,
  entrada: EntradaCache,
  opciones: OpcionesExtraccion,
): Promise<TextoExtraido> {
  let desdeCache = true;
  if (!entrada.nativas) {
    desdeCache = false;
    entrada.nativas = paginasDePdftotext(
      await ejecutar(herramientas, 'pdftotext', [
        '-enc',
        'UTF-8',
        '-q',
        await ruta(),
        '-',
      ]),
    );
  }
  const nativas = entrada.nativas;
  const candidatas = nativas
    .map((texto, indice) => ({
      pagina: indice + 1,
      visibles: caracteresVisibles(texto),
    }))
    .filter(({ visibles }) => visibles < opciones.umbralOcr)
    .map(({ pagina }) => pagina);

  const conOcr = opciones.ocr
    ? candidatas.slice(0, opciones.maxPaginasOcr)
    : [];
  const faltantes = conOcr.filter(
    (pagina) => entrada.ocr[pagina] === undefined,
  );
  if (faltantes.length > 0) {
    desdeCache = false;
    const local = await ruta();
    const tamanos = tamanosDePdfinfo(
      await ejecutar(herramientas, 'pdfinfo', [
        '-f',
        '1',
        '-l',
        String(nativas.length),
        local,
      ]),
    );
    await Promise.all(
      faltantes.map(async (pagina) => {
        entrada.ocr[pagina] = await ocrDePaginaPdf(
          herramientas,
          local,
          pagina,
          resolucionOcr(tamanos.get(pagina)),
          opciones,
        );
      }),
    );
  }

  const paginas = [...nativas];
  const paginasOcr: number[] = [];
  for (const pagina of conOcr) {
    const ocr = filtrarRuidoOcr(entrada.ocr[pagina] ?? '');
    const visiblesOcr = caracteresVisibles(ocr);
    if (
      visiblesOcr >= 20 &&
      visiblesOcr >= caracteresVisibles(nativas[pagina - 1]!) + 20
    ) {
      paginas[pagina - 1] = ocr;
      paginasOcr.push(pagina);
    }
  }
  return {
    paginas,
    paginasOcr,
    paginasSinOcrPorTope: opciones.ocr ? candidatas.length - conOcr.length : 0,
    metodo: 'pdftotext',
    desdeCache,
  };
}

async function extraerImagen(
  herramientas: Herramientas,
  ruta: RutaPerezosa,
  entrada: EntradaCache,
  opciones: OpcionesExtraccion,
): Promise<TextoExtraido> {
  if (!opciones.ocr) {
    return {
      paginas: [''],
      paginasOcr: [],
      paginasSinOcrPorTope: 1,
      metodo: 'ocr',
      desdeCache: false,
    };
  }
  let desdeCache = true;
  if (entrada.ocr[1] === undefined) {
    desdeCache = false;
    entrada.ocr[1] = await ocrDeImagen(herramientas, await ruta(), opciones);
  }
  return {
    paginas: [filtrarRuidoOcr(entrada.ocr[1])],
    paginasOcr: [1],
    paginasSinOcrPorTope: 0,
    metodo: 'ocr',
    desdeCache,
  };
}

async function extraerDocx(
  herramientas: Herramientas,
  ruta: RutaPerezosa,
  entrada: EntradaCache,
): Promise<TextoExtraido> {
  let desdeCache = true;
  if (!entrada.nativas) {
    desdeCache = false;
    const xml = await ejecutar(
      herramientas,
      'unzip',
      ['-p', await ruta(), 'word/document.xml'],
      {
        timeout: 60_000,
      },
    );
    if (!xml.trim())
      throw new ErrorExtraccion('El DOCX no tiene word/document.xml.');
    entrada.nativas = paginasDeDocx(xml);
  }
  return {
    paginas: entrada.nativas,
    paginasOcr: [],
    paginasSinOcrPorTope: 0,
    metodo: 'docx',
    desdeCache,
  };
}

async function extraerPptx(
  herramientas: Herramientas,
  rutaPerezosa: RutaPerezosa,
  entrada: EntradaCache,
): Promise<TextoExtraido> {
  let desdeCache = true;
  if (!entrada.nativas) {
    desdeCache = false;
    const ruta = await rutaPerezosa();
    const lista = (
      await ejecutar(herramientas, 'unzip', ['-Z1', ruta], { timeout: 60_000 })
    )
      .split('\n')
      .map((linea) => linea.trim())
      .filter(Boolean);
    const leerEntrada = async (nombre: string): Promise<string> =>
      lista.includes(nombre)
        ? ejecutar(herramientas, 'unzip', ['-p', ruta, nombre], {
            timeout: 60_000,
          })
        : '';
    const diapositivas = ordenDeDiapositivas(
      await leerEntrada('ppt/presentation.xml'),
      await leerEntrada('ppt/_rels/presentation.xml.rels'),
      lista,
    );
    if (diapositivas.length === 0)
      throw new ErrorExtraccion('El PPTX no tiene diapositivas.');
    entrada.nativas = [];
    for (const diapositiva of diapositivas) {
      entrada.nativas.push(textoDeDiapositiva(await leerEntrada(diapositiva)));
    }
  }
  return {
    paginas: entrada.nativas,
    paginasOcr: [],
    paginasSinOcrPorTope: 0,
    metodo: 'pptx',
    desdeCache,
  };
}

const MIME_PDF = 'application/pdf';
const MIME_DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const MIME_PPTX =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

/** Formato que el indexador sabe leer, por tipo MIME o extensión. */
export function formatoDeArchivo(
  ruta: string,
  tipoMime: string | null,
): 'pdf' | 'imagen' | 'docx' | 'pptx' | null {
  const extension = /\.([a-z0-9]+)$/i.exec(ruta)?.[1]?.toLowerCase();
  if (tipoMime === MIME_PDF || extension === 'pdf') return 'pdf';
  if (
    tipoMime === 'image/png' ||
    tipoMime === 'image/jpeg' ||
    ['png', 'jpg', 'jpeg'].includes(extension ?? '')
  ) {
    return 'imagen';
  }
  if (tipoMime === MIME_DOCX || extension === 'docx') return 'docx';
  if (tipoMime === MIME_PPTX || extension === 'pptx') return 'pptx';
  return null;
}

/**
 * Extrae el texto crudo de un archivo (con caché por hash). Lanza
 * ErrorExtraccion si el formato no se admite o una herramienta falla; los
 * errores al obtener un ArchivoExtraible (ruta()) se propagan tal cual.
 */
export async function extraerTexto(
  archivo: string | ArchivoExtraible,
  tipoMime: string | null,
  opciones: OpcionesExtraccion,
  herramientas: Herramientas,
): Promise<TextoExtraido> {
  const nombre = typeof archivo === 'string' ? archivo : archivo.nombre;
  const formato = formatoDeArchivo(nombre, tipoMime);
  if (!formato)
    throw new ErrorExtraccion(`Formato no admitido (${tipoMime ?? nombre}).`);
  const ruta = memorizar(
    typeof archivo === 'string'
      ? () => Promise.resolve(archivo)
      : () => archivo.ruta(),
  );
  const entrada =
    typeof archivo !== 'string' && archivo.sha256
      ? await herramientas.cache.abrirPorHash(archivo.sha256)
      : await herramientas.cache.abrir(await ruta());
  try {
    switch (formato) {
      case 'pdf':
        return await extraerPdf(herramientas, ruta, entrada, opciones);
      case 'imagen':
        return await extraerImagen(herramientas, ruta, entrada, opciones);
      case 'docx':
        return await extraerDocx(herramientas, ruta, entrada);
      case 'pptx':
        return await extraerPptx(herramientas, ruta, entrada);
    }
  } finally {
    // Se guarda también lo parcial (p. ej. pdftotext listo y un OCR fallido).
    await herramientas.cache.guardar(entrada);
  }
}
