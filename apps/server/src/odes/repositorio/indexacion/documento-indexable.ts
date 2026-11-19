import type { IdiomaDocumento, TipoDocumento } from '../repositorio.tipos.js';
import { claveComparacion } from '../normalizacion.js';
import type { MetadatosFuente } from './fuente.js';

/**
 * Documento listo para escribir en el índice: metadatos ya mapeados al
 * contrato del repositorio + texto limpio por página.
 */
export interface DocumentoIndexable {
  id: string;
  orden: number;
  titulo: string;
  subtitulo: string | null;
  categoria: string;
  numero: string | null;
  /** null = "S. F.". */
  anio: number | null;
  mes: number | null;
  idioma: IdiomaDocumento;
  tipo: TipoDocumento;
  /** Formato real del archivo propio, si hay. */
  formato: FormatoArchivo | null;
  claves: string[];
  urlVer: string;
  tieneArchivo: boolean;
  /** Nombre de la miniatura en /odes/portadas/, o null. */
  portada: string | null;
  /** URL de la miniatura servida por la fuente (base del repositorio), o null/ausente. */
  urlMiniatura?: string | null;
  nota: string | null;
  /** en: original en español (texto del paquete); es: título de la traducción al inglés. */
  equivalente: string | null;
  equivalenteId: string | null;
  /** Texto limpio de cada página (posición 0 = página 1); vacío si no hay texto. */
  paginas: string[];
  /** Páginas (desde 1) cuyo texto viene del OCR. */
  paginasOcr: number[];
}

export type FormatoArchivo = 'pdf' | 'imagen' | 'docx' | 'pptx';

/** Mínimo de caracteres visibles para considerar que un documento tiene texto. */
export const MINIMO_CARACTERES_TEXTO = 50;

/** Orden de presentación de las categorías del repositorio (las nuevas van después, A-Z). */
export const ORDEN_CATEGORIAS: readonly string[] = [
  'Boletín',
  'Estudio',
  'Infografía',
  'Nota temática',
  'Informe dinámico',
  'Informe de tendencias',
  'Educación superior en cifras',
  'Otros productos',
];

export function ordenarCategorias(presentes: Iterable<string>): string[] {
  const conocidas = new Map(
    ORDEN_CATEGORIAS.map((nombre, indice) => [nombre, indice]),
  );
  return [...new Set(presentes)].toSorted((a, b) => {
    const ia = conocidas.get(a) ?? Number.MAX_SAFE_INTEGER;
    const ib = conocidas.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ia - ib || a.localeCompare(b, 'es');
  });
}

/**
 * Tipo del contrato: tablero / entrada tal cual; un documento según su
 * archivo (PDF -> pdf, PNG/JPG -> imagen, DOCX/PPTX -> otro). Un documento
 * sin copia (los estudios de OneDrive) es pdf si su enlace es de un PDF.
 */
export function tipoDeDocumento(
  metadatos: Pick<MetadatosFuente, 'tipo' | 'urlVer'>,
  formato: FormatoArchivo | null,
): TipoDocumento {
  if (metadatos.tipo === 'tablero') return 'tablero';
  if (metadatos.tipo === 'entrada') return 'entrada';
  if (formato === 'pdf') return 'pdf';
  if (formato === 'imagen') return 'imagen';
  if (formato === 'docx' || formato === 'pptx') return 'otro';
  // OneDrive/SharePoint marca los PDF con /:b:/ en el enlace para compartir.
  return /\/:b:\/|\.pdf(?:$|[?#])/i.test(metadatos.urlVer) ? 'pdf' : 'otro';
}

export function anioComoTexto(anio: number | null): string {
  return anio === null ? 'S. F.' : String(anio);
}

/**
 * Empareja cada traducción al inglés con su original en español, a partir de
 * `equivalenteEnEspanol` ("Título del original (Categoría N, 2022)").
 * Devuelve id -> id del documento equivalente (en los dos sentidos).
 */
export function emparejarTraducciones(
  metadatos: readonly MetadatosFuente[],
): Map<string, string> {
  const espanolPorTitulo = new Map<string, MetadatosFuente[]>();
  for (const documento of metadatos) {
    if (documento.idioma !== 'es') continue;
    const clave = claveComparacion(documento.titulo);
    espanolPorTitulo.set(clave, [
      ...(espanolPorTitulo.get(clave) ?? []),
      documento,
    ]);
  }
  const pares = new Map<string, string>();
  for (const traduccion of metadatos) {
    if (traduccion.idioma !== 'en' || !traduccion.equivalenteEnEspanol)
      continue;
    const coincidencia = /^(.*)\s\(([^()]*)\)\s*$/.exec(
      traduccion.equivalenteEnEspanol,
    );
    const tituloOriginal = coincidencia
      ? coincidencia[1]!
      : traduccion.equivalenteEnEspanol;
    const detalle = coincidencia?.[2] ?? '';
    const candidatos =
      espanolPorTitulo.get(claveComparacion(tituloOriginal)) ?? [];
    const original =
      candidatos.find(
        (candidato) =>
          candidato.categoria === traduccion.categoria &&
          detalle.includes(anioComoTexto(candidato.anio)),
      ) ??
      candidatos.find(
        (candidato) => candidato.categoria === traduccion.categoria,
      ) ??
      candidatos[0];
    if (!original) continue;
    pares.set(traduccion.id, original.id);
    if (!pares.has(original.id)) pares.set(original.id, traduccion.id);
  }
  return pares;
}
