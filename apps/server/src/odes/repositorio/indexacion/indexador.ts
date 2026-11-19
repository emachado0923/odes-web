import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CacheExtraccion } from './cache-extraccion.js';
import {
  emparejarTraducciones,
  ordenarCategorias,
  tipoDeDocumento,
  type DocumentoIndexable,
  type FormatoArchivo,
} from './documento-indexable.js';
import { escribirIndice, type ResumenEscritura } from './escritor-indice.js';
import {
  type ArchivoExtraible,
  extraerTexto,
  formatoDeArchivo,
  type OpcionesExtraccion,
  type TextoExtraido,
} from './extraccion.js';
import {
  type ArchivoBajoDemanda,
  ErrorArchivoFuente,
  type FuenteRepositorio,
  type RegistroFuente,
} from './fuente.js';
import { Limitador } from './limitador.js';
import { limpiarPaginas } from './limpieza.js';
import {
  generarMiniaturas,
  nombreMiniatura,
  type ResumenMiniaturas,
} from './miniaturas.js';

/**
 * Orquesta la indexación: fuente -> (miniaturas) -> extracción con caché ->
 * limpieza -> índice SQLite. Un archivo que falla no detiene la corrida: el
 * documento queda con sus metadatos (ficha) y el fallo se resume al final.
 *
 * Lo que sí la detiene, SIN tocar el índice vigente:
 * - un error de la fuente (ErrorArchivoFuente: p. ej. la base de datos dejó
 *   de responder al copiar un archivo);
 * - con `maxProporcionFallos`, que fallen demasiados archivos (p. ej. faltan
 *   las herramientas): mejor conservar el índice anterior que publicar uno
 *   sin texto.
 */

/** La indexación se detuvo antes de escribir el índice (el anterior queda intacto). */
export class ErrorIndexacion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorIndexacion';
  }
}

export interface OpcionesIndexacion {
  fuente: FuenteRepositorio;
  rutaIndice: string;
  /** true = no extrae texto: solo fichas de metadatos (rápido). */
  soloMetadatos: boolean;
  extraccion: OpcionesExtraccion;
  /** Carpeta de la caché de extracción, o null para no usarla. */
  directorioCache: string | null;
  /** false = ignora lo guardado en la caché (pero la reescribe). */
  reutilizarCache: boolean;
  /** Procesos externos a la vez (pdftotext, tesseract, cwebp…). */
  concurrencia: number;
  /** Carpeta de las miniaturas (para generarlas o comprobar que existen). */
  directorioMiniaturas: string;
  generarMiniaturas: boolean;
  registro: (mensaje: string) => void;
  /**
   * Si fallan más de esta proporción (0-1) de los documentos con archivo, no
   * se escribe el índice (ErrorIndexacion). null/ausente = sin tope.
   */
  maxProporcionFallos?: number | null;
}

export interface FalloIndexacion {
  id: string;
  motivo: string;
}

export interface ResultadoIndexacion {
  fuente: string;
  escritura: ResumenEscritura;
  conArchivo: number;
  /** Documentos con archivo cuyo texto quedó vacío (sin capa de texto ni OCR útil). */
  sinTexto: string[];
  fallos: FalloIndexacion[];
  avisosFuente: string[];
  /** Documentos que dejaron de estar publicados durante la indexación (no se incluyen). */
  retirados: string[];
  /** paquete | mysql, si la fuente lo informa. */
  origenFuente: string | null;
  /** Documentos con miniatura servida por la fuente (base de datos). */
  conUrlMiniatura: number;
  ocr: { paginas: number; documentos: string[]; paginasSinOcrPorTope: number };
  desdeCache: number;
  traduccionesEmparejadas: number;
  miniaturas: ResumenMiniaturas | null;
  portadasSinMiniatura: number;
  duracionMs: number;
}

/** Lo que recibe extraerTexto: la ruta local o el archivo bajo demanda. */
function aExtraible(archivo: string | ArchivoBajoDemanda): string | ArchivoExtraible {
  if (typeof archivo === 'string') return archivo;
  return {
    nombre: archivo.nombre,
    sha256: archivo.sha256,
    ruta: () => archivo.obtener(),
  };
}

function nombreArchivo(archivo: RegistroFuente['archivo']): string | null {
  if (archivo === null) return null;
  return typeof archivo === 'string' ? archivo : archivo.nombre;
}

interface Extraido {
  registro: RegistroFuente;
  formato: FormatoArchivo | null;
  texto: TextoExtraido | null;
  paginas: string[];
  fallo: string | null;
}

export async function indexar(
  opciones: OpcionesIndexacion,
): Promise<ResultadoIndexacion> {
  const inicio = Date.now();
  const limitador = new Limitador(opciones.concurrencia);
  const lectura = await opciones.fuente.leer();
  opciones.registro(
    `Fuente: ${lectura.descripcion}. ${lectura.registros.length} registros.`,
  );
  for (const aviso of lectura.avisos) opciones.registro(`  aviso: ${aviso}`);

  let miniaturas: ResumenMiniaturas | null = null;
  if (opciones.generarMiniaturas) {
    opciones.registro(
      `Generando miniaturas en ${opciones.directorioMiniaturas}…`,
    );
    miniaturas = await generarMiniaturas(
      lectura.registros,
      opciones.directorioMiniaturas,
      limitador,
    );
  }

  const cache = new CacheExtraccion(
    opciones.directorioCache,
    opciones.extraccion.idiomasOcr,
    opciones.reutilizarCache,
  );
  let hechos = 0;
  const total = lectura.registros.length;
  // Documentos en curso a la vez (cada uno abre su archivo para el hash):
  // acota los descriptores abiertos; los procesos los acota `limitador`.
  const documentosEnCurso = new Limitador(
    Math.max(2, opciones.concurrencia * 2),
  );
  // Primer error de la fuente: los documentos que aún no empezaron se saltan
  // y, cuando terminan los que están en curso, la indexación se detiene.
  let abortado: ErrorArchivoFuente | null = null;
  const resultados = await Promise.allSettled(
    lectura.registros.map((registro) =>
      documentosEnCurso.ejecutar(async (): Promise<Extraido> => {
        const { archivo, metadatos } = registro;
        const nombre = nombreArchivo(archivo);
        const formato = nombre
          ? formatoDeArchivo(nombre, metadatos.archivoTipo)
          : null;
        const resultado: Extraido = {
          registro,
          formato,
          texto: null,
          paginas: [],
          fallo: null,
        };
        if (archivo && !opciones.soloMetadatos && abortado === null) {
          try {
            if (!formato)
              throw new Error(
                `formato no admitido (${metadatos.archivoTipo ?? nombre})`,
              );
            resultado.texto = await extraerTexto(
              aExtraible(archivo),
              metadatos.archivoTipo,
              opciones.extraccion,
              {
                limitador,
                cache,
              },
            );
            resultado.paginas = limpiarPaginas(resultado.texto.paginas);
          } catch (error) {
            if (error instanceof ErrorArchivoFuente) {
              abortado ??= error;
              throw error;
            }
            resultado.fallo =
              error instanceof Error ? error.message : String(error);
          } finally {
            if (typeof archivo !== 'string') await archivo.liberar();
          }
        }
        hechos += 1;
        if (hechos % 50 === 0 || hechos === total) {
          opciones.registro(`  ${hechos}/${total} documentos procesados`);
        }
        return resultado;
      }),
    ),
  );
  if (abortado) throw abortado;
  const todos = resultados.map((resultado) => {
    if (resultado.status === 'rejected') throw resultado.reason;
    return resultado.value;
  });

  // Documentos despublicados mientras se indexaba (fuentes que lo informan).
  let extraidos = todos;
  let retirados: string[] = [];
  if (opciones.fuente.idsVigentes) {
    const vigentes = await opciones.fuente.idsVigentes();
    retirados = todos
      .filter((e) => !vigentes.has(e.registro.metadatos.id))
      .map((e) => e.registro.metadatos.id);
    if (retirados.length > 0) {
      extraidos = todos.filter((e) => vigentes.has(e.registro.metadatos.id));
      opciones.registro(
        `  ${retirados.length} documentos dejaron de estar publicados durante la indexación y no se incluyen: ${retirados.join(', ')}`,
      );
    }
  }

  const fallidos = extraidos.filter((e) => e.fallo !== null);
  const conArchivo = extraidos.filter((e) => e.registro.archivo !== null);
  const tope = opciones.maxProporcionFallos;
  if (
    tope !== null &&
    tope !== undefined &&
    !opciones.soloMetadatos &&
    conArchivo.length > 0 &&
    fallidos.length / conArchivo.length > tope
  ) {
    const motivos = [...new Set(fallidos.map((e) => e.fallo))].slice(0, 3);
    throw new ErrorIndexacion(
      `Falló la extracción de texto de ${fallidos.length} de ${conArchivo.length} archivos ` +
        `(más del ${Math.round(tope * 100)} %), así que no se reemplazó el índice. ` +
        `Motivo${motivos.length > 1 ? 's' : ''}: ${motivos.join(' | ')}`,
    );
  }

  const metadatosVigentes = extraidos.map((e) => e.registro.metadatos);
  const pares = emparejarTraducciones(metadatosVigentes);
  const porId = new Map(metadatosVigentes.map((m) => [m.id, m]));
  let portadasSinMiniatura = 0;
  const documentos: DocumentoIndexable[] = extraidos.map(
    ({ registro, formato, texto, paginas }) => {
      const { metadatos } = registro;
      const portada = nombreMiniatura(metadatos.id);
      const tieneMiniatura = existsSync(
        join(opciones.directorioMiniaturas, portada),
      );
      if (registro.portada && !tieneMiniatura) portadasSinMiniatura += 1;
      const equivalenteId = pares.get(metadatos.id) ?? null;
      return {
        id: metadatos.id,
        orden: metadatos.orden,
        titulo: metadatos.titulo,
        subtitulo: metadatos.subtitulo,
        categoria: metadatos.categoria,
        numero: metadatos.numero,
        anio: metadatos.anio,
        mes: metadatos.mes,
        idioma: metadatos.idioma,
        tipo: tipoDeDocumento(metadatos, formato),
        formato,
        claves: metadatos.claves,
        urlVer: metadatos.urlVer,
        tieneArchivo: registro.archivo !== null,
        portada: tieneMiniatura ? portada : null,
        urlMiniatura: metadatos.urlMiniatura ?? null,
        nota: metadatos.nota,
        equivalente:
          metadatos.idioma === 'en'
            ? metadatos.equivalenteEnEspanol
            : equivalenteId
              ? (porId.get(equivalenteId)?.titulo ?? null)
              : null,
        equivalenteId,
        paginas,
        paginasOcr: texto?.paginasOcr ?? [],
      };
    },
  );

  const ocrPorDocumento = extraidos.filter(
    (e) => (e.texto?.paginasOcr.length ?? 0) > 0,
  );
  const extra = {
    paginas_ocr: ocrPorDocumento.reduce(
      (suma, e) => suma + e.texto!.paginasOcr.length,
      0,
    ),
    documentos_ocr: ocrPorDocumento.length,
  };
  const escritura = escribirIndice(opciones.rutaIndice, {
    generado: new Date().toISOString(),
    fuente: lectura.descripcion,
    versionFuente: lectura.version,
    origenFuente: lectura.origen ?? null,
    huellaFuente: lectura.huella ?? null,
    categorias: ordenarCategorias(documentos.map((d) => d.categoria)),
    documentos,
    extra,
  });

  return {
    fuente: lectura.descripcion,
    escritura,
    conArchivo: conArchivo.length,
    sinTexto: extraidos
      .filter(
        (e) =>
          e.registro.archivo !== null &&
          !e.fallo &&
          !opciones.soloMetadatos &&
          e.paginas.join('').replace(/\s+/g, '').length < 50,
      )
      .map((e) => e.registro.metadatos.id),
    fallos: fallidos.map((e) => ({
      id: e.registro.metadatos.id,
      motivo: e.fallo!,
    })),
    avisosFuente: lectura.avisos,
    retirados,
    origenFuente: lectura.origen ?? null,
    conUrlMiniatura: documentos.filter((d) => d.urlMiniatura).length,
    ocr: {
      paginas: extra.paginas_ocr,
      documentos: ocrPorDocumento.map((e) => e.registro.metadatos.id),
      paginasSinOcrPorTope: extraidos.reduce(
        (suma, e) => suma + (e.texto?.paginasSinOcrPorTope ?? 0),
        0,
      ),
    },
    desdeCache: extraidos.filter((e) => e.texto?.desdeCache).length,
    traduccionesEmparejadas: [...pares.keys()].filter(
      (id) => porId.get(id)?.idioma === 'en',
    ).length,
    miniaturas,
    portadasSinMiniatura,
    duracionMs: Date.now() - inicio,
  };
}
