import type {
  BetaTool,
  BetaToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { z } from 'zod';
import type {
  DocumentoRepositorio,
  FiltrosRepositorio,
  FragmentoRepositorio,
  RepositorioOdes,
} from '../repositorio/repositorio.tipos.js';
import {
  etiquetaCategoria,
  NOMBRE_IDIOMA,
  recortar,
  textoPaginas,
  tituloFragmento,
} from './catalogo.js';
import {
  bloqueSearchResult,
  caracteresFuente,
  type Fuente,
  fuenteAuxiliar,
  fuenteDeDocumento,
} from './fuentes.js';

/**
 * Herramientas que Claude usa para consultar el repositorio. Las definiciones
 * son JSON Schema estricto (`strict: true`, `additionalProperties: false`,
 * sin minimum/maxLength, que el modo estricto no admite) con
 * `eager_input_streaming: true` porque todas las peticiones van por streaming.
 * Con streaming ansioso la API ya no valida la entrada, así que cada entrada
 * se valida aquí con zod antes de ejecutar nada.
 */

export const NOMBRE_BUSCAR = 'buscar_documentos';
export const NOMBRE_LISTAR = 'listar_documentos';
export const NOMBRE_LEER = 'leer_documento';

export type HerramientaProtocolo = 'buscar' | 'listar' | 'leer';

const HERRAMIENTA_PROTOCOLO: Readonly<Record<string, HerramientaProtocolo>> = {
  [NOMBRE_BUSCAR]: 'buscar',
  [NOMBRE_LISTAR]: 'listar',
  [NOMBRE_LEER]: 'leer',
};

/** Fragmentos por búsqueda (el contrato del repositorio admite hasta 20). */
const FRAGMENTOS_POR_BUSQUEDA = 8;
const LISTADO_POR_DEFECTO = 10;
const LISTADO_MAXIMO = 25;
/** Tope de texto por resultado de herramienta (el de la ronda y la pregunta está en motor-ia.ts). */
export const MAX_CARACTERES_RESULTADO = 40_000;
/**
 * Herramientas que se ejecutan por respuesta del modelo (llamadas en
 * paralelo). Las demás reciben un tool_result de error: sin este tope, una
 * respuesta con 40 leer_documento sumaría ~1,5 MB a cada llamada siguiente.
 */
export const MAX_HERRAMIENTAS_POR_RONDA = 4;

const ANIO = { type: 'integer' } as const;

/**
 * Definiciones de las herramientas. Deben ser idénticas byte a byte entre
 * peticiones (van al inicio del prompt y forman parte de la caché): solo
 * dependen de la lista de categorías del índice.
 */
export function definirHerramientas(categorias: readonly string[]): BetaTool[] {
  const listaCategorias = categorias.length > 0 ? categorias.join(', ') : '';
  const propiedadCategorias = {
    type: 'array',
    items:
      categorias.length > 0
        ? { type: 'string', enum: [...categorias] }
        : { type: 'string' },
    description:
      'Limita a estas categorías del repositorio. Omítelo para buscar en todas.' +
      (listaCategorias ? ` Valores posibles: ${listaCategorias}.` : ''),
  };
  const propiedadIdioma = {
    type: 'string',
    enum: ['es', 'en'],
    description:
      'Idioma del documento: "es" (español, la gran mayoría) o "en" (traducciones al inglés). Omítelo para ambos.',
  };
  return [
    {
      name: NOMBRE_BUSCAR,
      description:
        'Búsqueda de texto completo en los documentos del Repositorio del Observatorio (boletines, estudios, ' +
        'infografías, informes de tendencias, notas temáticas y otros productos) y en las fichas de los tableros de ' +
        'Power BI y de los productos que no tienen texto propio. Úsala SIEMPRE antes de responder cualquier pregunta sobre cifras, hallazgos, ' +
        'conceptos, fechas o documentos del Observatorio, y vuelve a usarla con otras palabras si los resultados ' +
        'no responden la pregunta. Devuelve los fragmentos más relevantes con su documento y páginas; cada ' +
        'resultado empieza con una línea "[id: …]" que sirve para leer_documento.',
      input_schema: {
        type: 'object',
        properties: {
          consulta: {
            type: 'string',
            description:
              'Palabras clave en español, sin signos de pregunta (p. ej. "deserción educación superior 2023" o ' +
              '"tasa de tránsito inmediato"). Prefiere términos que aparecerían en el documento.',
          },
          categorias: propiedadCategorias,
          anio_desde: { ...ANIO, description: 'Año de publicación mínimo (inclusive).' },
          anio_hasta: { ...ANIO, description: 'Año de publicación máximo (inclusive).' },
          idioma: propiedadIdioma,
        },
        required: ['consulta'],
        additionalProperties: false,
      },
      strict: true,
      eager_input_streaming: true,
    },
    {
      name: NOMBRE_LISTAR,
      description:
        'Lista el catálogo del repositorio (solo metadatos: título, categoría, año, idioma, palabras clave), del ' +
        'más reciente al más antiguo, con el total de coincidencias. Úsala para preguntas sobre qué documentos ' +
        'existen, cuántos hay, cuál es el más reciente de una categoría o qué tableros de Power BI hay. No ' +
        'sirve para conocer el contenido: para eso usa buscar_documentos o leer_documento.',
      input_schema: {
        type: 'object',
        properties: {
          texto: {
            type: 'string',
            description: 'Texto libre sobre título, subtítulo y palabras clave.',
          },
          palabra_clave: {
            type: 'string',
            description: 'Una palabra clave exacta del repositorio (p. ej. "Deserción").',
          },
          categorias: propiedadCategorias,
          anio_desde: { ...ANIO, description: 'Año de publicación mínimo (inclusive).' },
          anio_hasta: { ...ANIO, description: 'Año de publicación máximo (inclusive).' },
          idioma: propiedadIdioma,
          limite: {
            type: 'integer',
            description: `Cuántos documentos devolver (por defecto ${LISTADO_POR_DEFECTO}, máximo ${LISTADO_MAXIMO}).`,
          },
        },
        required: [],
        additionalProperties: false,
      },
      strict: true,
      eager_input_streaming: true,
    },
    {
      name: NOMBRE_LEER,
      description:
        'Lee el texto de un documento concreto por páginas (desde 1), usando el id que aparece en la línea ' +
        '"[id: …]" de los resultados. Úsala cuando un resultado de búsqueda sea prometedor pero incompleto, ' +
        'o para revisar una sección (metodología, conclusiones, una tabla). Lee pocas páginas a la vez.',
      input_schema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Id exacto del documento.' },
          pagina_desde: { type: 'integer', description: 'Primera página (desde 1).' },
          pagina_hasta: { type: 'integer', description: 'Última página (inclusive).' },
        },
        required: ['id'],
        additionalProperties: false,
      },
      strict: true,
      eager_input_streaming: true,
    },
  ];
}

// ── Validación (zod) ──────────────────────────────────────────────────────

const anioOpcional = z.number().int().min(1900).max(2100).nullish();
const idiomaOpcional = z.enum(['es', 'en']).nullish();
const categoriasOpcionales = z.array(z.string().max(80)).max(12).nullish();

const esquemaBuscar = z.strictObject({
  consulta: z.string().trim().min(1).max(400),
  categorias: categoriasOpcionales,
  anio_desde: anioOpcional,
  anio_hasta: anioOpcional,
  idioma: idiomaOpcional,
});

const esquemaListar = z.strictObject({
  texto: z.string().trim().max(400).nullish(),
  palabra_clave: z.string().trim().max(120).nullish(),
  categorias: categoriasOpcionales,
  anio_desde: anioOpcional,
  anio_hasta: anioOpcional,
  idioma: idiomaOpcional,
  limite: z.number().int().min(1).max(100).nullish(),
});

const esquemaLeer = z.strictObject({
  id: z.string().trim().min(1).max(200),
  pagina_desde: z.number().int().min(1).max(10000).nullish(),
  pagina_hasta: z.number().int().min(1).max(10000).nullish(),
});

// ── Ejecución ─────────────────────────────────────────────────────────────

/** Caracteres de texto de un tool_result (lo que pesa en las llamadas siguientes). */
export function caracteresContenido(contenido: NonNullable<BetaToolResultBlockParam['content']>): number {
  if (typeof contenido === 'string') return contenido.length;
  let total = 0;
  for (const bloque of contenido) {
    if (bloque.type === 'text') {
      total += bloque.text.length;
    } else if (bloque.type === 'search_result') {
      total += bloque.title.length + bloque.source.length;
      for (const parte of bloque.content) total += parte.text.length;
    }
  }
  return total;
}

export interface ResultadoHerramienta {
  /** Herramienta en términos del protocolo; null si el nombre es desconocido. */
  readonly herramienta: HerramientaProtocolo | null;
  /** Texto para el evento 'busqueda'; null si la entrada no era válida. */
  readonly descripcion: string | null;
  readonly contenido: NonNullable<BetaToolResultBlockParam['content']>;
  readonly esError: boolean;
  /** Fuentes en el mismo orden que sus bloques search_result en `contenido`. */
  readonly fuentes: readonly Fuente[];
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().trim();
}

/** Resultado de una herramienta que no devolvió fuentes: texto plano. */
function resultadoTexto(
  herramienta: HerramientaProtocolo | null,
  descripcion: string | null,
  texto: string,
  esError: boolean,
): ResultadoHerramienta {
  return {
    herramienta,
    descripcion,
    contenido: [{ type: 'text', text: texto }],
    esError,
    fuentes: [],
  };
}

/** Resultado con fuentes: todos los bloques del tool_result son search_result. */
function resultadoFuentes(
  herramienta: HerramientaProtocolo,
  descripcion: string,
  fuentes: Fuente[],
): ResultadoHerramienta {
  // Se respeta el tope de tamaño quitando las fuentes menos relevantes (al final).
  const elegidas: Fuente[] = [];
  let total = 0;
  for (const fuente of fuentes) {
    const tamano = caracteresFuente(fuente);
    if (elegidas.length > 0 && total + tamano > MAX_CARACTERES_RESULTADO) break;
    elegidas.push(fuente);
    total += tamano;
  }
  return {
    herramienta,
    descripcion,
    contenido: elegidas.map(bloqueSearchResult),
    esError: false,
    fuentes: elegidas,
  };
}

function entradaInvalida(
  herramienta: HerramientaProtocolo,
  entrada: unknown,
  error: z.ZodError,
): ResultadoHerramienta {
  const problemas = error.issues
    .slice(0, 5)
    .map((problema) => `${problema.path.join('.') || '(raíz)'}: ${problema.message}`)
    .join('; ');
  return resultadoTexto(
    herramienta,
    null,
    JSON.stringify({ INVALID_JSON: JSON.stringify(entrada) ?? 'undefined', error: problemas }),
    true,
  );
}

interface Contexto {
  readonly repositorio: RepositorioOdes;
  readonly categorias: readonly string[];
}

function resolverCategorias(
  pedidas: readonly string[] | null | undefined,
  contexto: Contexto,
): { categorias?: string[]; desconocidas: string[] } {
  if (!pedidas || pedidas.length === 0) return { desconocidas: [] };
  const porNombre = new Map(contexto.categorias.map((c) => [normalizar(c), c]));
  const categorias: string[] = [];
  const desconocidas: string[] = [];
  for (const pedida of pedidas) {
    const encontrada = porNombre.get(normalizar(pedida));
    if (encontrada) {
      if (!categorias.includes(encontrada)) categorias.push(encontrada);
    } else {
      desconocidas.push(pedida);
    }
  }
  return { categorias, desconocidas };
}

function filtrosDe(
  entrada: {
    categorias?: string[] | null;
    anio_desde?: number | null;
    anio_hasta?: number | null;
    idioma?: 'es' | 'en' | null;
  },
  contexto: Contexto,
): { filtros: FiltrosRepositorio; desconocidas: string[] } {
  const { categorias, desconocidas } = resolverCategorias(entrada.categorias, contexto);
  let desde = entrada.anio_desde ?? undefined;
  let hasta = entrada.anio_hasta ?? undefined;
  if (desde !== undefined && hasta !== undefined && desde > hasta) {
    [desde, hasta] = [hasta, desde];
  }
  return {
    filtros: {
      ...(categorias && categorias.length > 0 ? { categorias } : {}),
      ...(desde !== undefined ? { anioDesde: desde } : {}),
      ...(hasta !== undefined ? { anioHasta: hasta } : {}),
      ...(entrada.idioma ? { idioma: entrada.idioma } : {}),
    },
    desconocidas,
  };
}

function textoFiltros(filtros: FiltrosRepositorio): string {
  const partes: string[] = [];
  if (filtros.categorias?.length) partes.push(filtros.categorias.join(', '));
  if (filtros.anioDesde !== undefined && filtros.anioHasta !== undefined) {
    partes.push(
      filtros.anioDesde === filtros.anioHasta
        ? String(filtros.anioDesde)
        : `${filtros.anioDesde}–${filtros.anioHasta}`,
    );
  } else if (filtros.anioDesde !== undefined) {
    partes.push(`desde ${filtros.anioDesde}`);
  } else if (filtros.anioHasta !== undefined) {
    partes.push(`hasta ${filtros.anioHasta}`);
  }
  if (filtros.idioma) partes.push(`en ${NOMBRE_IDIOMA[filtros.idioma]}`);
  return partes.length > 0 ? ` (${partes.join('; ')})` : '';
}

function avisoCategorias(desconocidas: string[], contexto: Contexto): string {
  return (
    `Categorías desconocidas: ${desconocidas.join(', ')}. ` +
    `Las categorías válidas son: ${contexto.categorias.join(', ')}.`
  );
}

const TIPO_LEGIBLE: Readonly<Record<DocumentoRepositorio['tipo'], string>> = {
  pdf: 'documento PDF',
  tablero:
    'tablero de Power BI (solo metadatos: las cifras se consultan abriendo el tablero en su enlace)',
  entrada: 'entrada de blog',
  imagen: 'infografía en imagen',
  otro: 'otro formato',
};

/** Ficha de catálogo (metadatos) de un documento, como texto citable. */
export function fichaDocumento(doc: DocumentoRepositorio): string {
  const lineas = [`Título: ${doc.titulo}`];
  if (doc.subtitulo) lineas.push(`Subtítulo: ${doc.subtitulo}`);
  lineas.push(
    `Categoría: ${etiquetaCategoria(doc)}. Año: ${doc.anio}. Idioma: ${NOMBRE_IDIOMA[doc.idioma]}.`,
  );
  lineas.push(`Tipo: ${TIPO_LEGIBLE[doc.tipo]}.`);
  if (doc.claves.length > 0) lineas.push(`Palabras clave: ${doc.claves.join(', ')}.`);
  if (doc.nota) lineas.push(`Nota: ${doc.nota}`);
  lineas.push(
    doc.textoIndexado
      ? `Texto completo indexado: sí${doc.paginas ? ` (${doc.paginas} páginas)` : ''}.`
      : 'Texto completo indexado: no (solo hay estos metadatos).',
  );
  return lineas.join('\n');
}

function fuenteDeFragmento(fragmento: FragmentoRepositorio): Fuente {
  return fuenteDeDocumento(
    fragmento.documento,
    fragmento.paginaInicio,
    fragmento.paginaFin,
    fragmento.url,
    fragmento.texto,
  );
}

function buscar(entrada: z.infer<typeof esquemaBuscar>, contexto: Contexto): ResultadoHerramienta {
  const { filtros, desconocidas } = filtrosDe(entrada, contexto);
  const descripcion = `Buscando “${recortar(entrada.consulta, 80)}”${textoFiltros(filtros)}`;
  if (desconocidas.length > 0) {
    return resultadoTexto('buscar', descripcion, avisoCategorias(desconocidas, contexto), true);
  }
  const fragmentos = contexto.repositorio.buscar(
    entrada.consulta,
    filtros,
    FRAGMENTOS_POR_BUSQUEDA,
  );
  if (fragmentos.length === 0) {
    return resultadoTexto(
      'buscar',
      descripcion,
      'Sin resultados para esa consulta. Prueba con sinónimos o términos más generales, quita filtros, ' +
        'o usa listar_documentos para ver qué documentos existen sobre el tema.',
      false,
    );
  }
  return resultadoFuentes('buscar', descripcion, fragmentos.map(fuenteDeFragmento));
}

function listar(entrada: z.infer<typeof esquemaListar>, contexto: Contexto): ResultadoHerramienta {
  const { filtros, desconocidas } = filtrosDe(entrada, contexto);
  const texto = entrada.texto || undefined;
  const palabraClave = entrada.palabra_clave || undefined;
  const termino = texto ?? palabraClave;
  const descripcion =
    `Consultando el catálogo${termino ? `: “${recortar(termino, 60)}”` : ''}${textoFiltros(filtros)}`;
  if (desconocidas.length > 0) {
    return resultadoTexto('listar', descripcion, avisoCategorias(desconocidas, contexto), true);
  }
  const limite = Math.min(entrada.limite ?? LISTADO_POR_DEFECTO, LISTADO_MAXIMO);
  const { total, documentos } = contexto.repositorio.listar(
    {
      ...filtros,
      ...(texto ? { texto } : {}),
      ...(palabraClave ? { palabraClave } : {}),
    },
    limite,
  );
  if (documentos.length === 0) {
    return resultadoTexto(
      'listar',
      descripcion,
      'Ningún documento del catálogo coincide con esos criterios. Prueba con menos filtros u otras palabras.',
      false,
    );
  }
  const fuentes = documentos.map((doc) =>
    fuenteDeDocumento(doc, null, null, doc.url, fichaDocumento(doc)),
  );
  fuentes.push(
    fuenteAuxiliar(
      'odes:catalogo/total',
      'Total del listado',
      `Coinciden ${total} documentos en total; se muestran los ${documentos.length} más recientes.`,
    ),
  );
  return resultadoFuentes('listar', descripcion, fuentes);
}

function leer(entrada: z.infer<typeof esquemaLeer>, contexto: Contexto): ResultadoHerramienta {
  const documento = contexto.repositorio.obtener(entrada.id);
  let desde = entrada.pagina_desde ?? undefined;
  let hasta = entrada.pagina_hasta ?? undefined;
  if (desde !== undefined && hasta !== undefined && desde > hasta) {
    [desde, hasta] = [hasta, desde];
  }
  const paginas = textoPaginas(desde ?? null, hasta ?? desde ?? null);
  if (!documento) {
    return resultadoTexto(
      'leer',
      `Abriendo el documento “${recortar(entrada.id, 60)}”`,
      `No existe un documento con el id "${entrada.id}". Copia el id exacto de la línea "[id: …]" de un ` +
        'resultado de buscar_documentos o listar_documentos.',
      true,
    );
  }
  const descripcion = `Leyendo “${tituloFragmento(documento, null, null)}”${paginas ? `, ${paginas}` : ''}`;
  const fragmentos = contexto.repositorio.leer(entrada.id, desde, hasta);
  if (fragmentos === null) {
    return resultadoTexto('leer', descripcion, `No existe un documento con el id "${entrada.id}".`, true);
  }
  if (fragmentos.length === 0) {
    const ficha = fuenteDeDocumento(
      documento,
      null,
      null,
      documento.url,
      documento.textoIndexado
        ? `${fichaDocumento(documento)}\nNo hay texto en las páginas pedidas.`
        : fichaDocumento(documento),
    );
    return resultadoFuentes('leer', descripcion, [ficha]);
  }
  return resultadoFuentes('leer', descripcion, fragmentos.map(fuenteDeFragmento));
}

/**
 * Valida la entrada de una herramienta y la ejecuta contra el repositorio.
 * Nunca lanza por datos del modelo: devuelve un resultado `esError`.
 */
export function ejecutarHerramienta(
  nombre: string,
  entrada: unknown,
  contexto: Contexto,
): ResultadoHerramienta {
  const herramienta = HERRAMIENTA_PROTOCOLO[nombre] ?? null;
  switch (nombre) {
    case NOMBRE_BUSCAR: {
      const validada = esquemaBuscar.safeParse(entrada);
      return validada.success
        ? buscar(validada.data, contexto)
        : entradaInvalida('buscar', entrada, validada.error);
    }
    case NOMBRE_LISTAR: {
      const validada = esquemaListar.safeParse(entrada);
      return validada.success
        ? listar(validada.data, contexto)
        : entradaInvalida('listar', entrada, validada.error);
    }
    case NOMBRE_LEER: {
      const validada = esquemaLeer.safeParse(entrada);
      return validada.success
        ? leer(validada.data, contexto)
        : entradaInvalida('leer', entrada, validada.error);
    }
    default:
      return resultadoTexto(
        herramienta,
        null,
        `Herramienta desconocida: "${nombre}". Usa ${NOMBRE_BUSCAR}, ${NOMBRE_LISTAR} o ${NOMBRE_LEER}.`,
        true,
      );
  }
}
