import type {
  DocumentoRepositorio,
  FragmentoRepositorio,
  RepositorioOdes,
} from '../repositorio/repositorio.tipos.js';
import type { DocumentoEncontrado, DocumentoResumen } from './protocolo.js';

/** Utilidades de presentación de documentos del repositorio (sin estado). */

export const NOMBRE_IDIOMA: Readonly<Record<'es' | 'en', string>> = {
  es: 'español',
  en: 'inglés',
};

export function resumenDocumento(doc: DocumentoRepositorio): DocumentoResumen {
  return {
    id: doc.id,
    titulo: doc.titulo,
    ...(doc.subtitulo ? { subtitulo: doc.subtitulo } : {}),
    categoria: doc.categoria,
    anio: doc.anio,
    idioma: doc.idioma,
    tipo: doc.tipo,
    url: doc.url,
    ...(doc.portada ? { portada: doc.portada } : {}),
    ...(doc.urlMiniatura ? { urlMiniatura: doc.urlMiniatura } : {}),
  };
}

/** "Boletín 29" o "Estudio" (sin número). */
export function etiquetaCategoria(doc: DocumentoRepositorio): string {
  return doc.numero ? `${doc.categoria} ${doc.numero}` : doc.categoria;
}

/** "págs. 3–5", "pág. 4" o "" si no hay páginas. */
export function textoPaginas(
  inicio: number | null,
  fin: number | null,
): string {
  if (inicio === null) return '';
  if (fin === null || fin === inicio) return `pág. ${inicio}`;
  return `págs. ${inicio}–${fin}`;
}

/** "Boletín 29 — Título (2024), pág. 5". */
export function tituloFragmento(
  doc: DocumentoRepositorio,
  inicio: number | null,
  fin: number | null,
): string {
  const paginas = textoPaginas(inicio, fin);
  const base = `${etiquetaCategoria(doc)} — ${recortar(doc.titulo, 140)} (${doc.anio})`;
  return paginas ? `${base}, ${paginas}` : base;
}

/** Recorta en un límite de palabra y agrega "…" si hizo falta. */
export function recortar(texto: string, maximo: number): string {
  const limpio = texto.replace(/\s+/g, ' ').trim();
  if (limpio.length <= maximo) return limpio;
  const corte = limpio.slice(0, maximo - 1);
  const espacio = corte.lastIndexOf(' ');
  return `${(espacio > maximo * 0.6 ? corte.slice(0, espacio) : corte).replace(/[\s.,;:]+$/, '')}…`;
}

export function documentoEncontrado(
  fragmento: FragmentoRepositorio,
): DocumentoEncontrado {
  const extracto = recortar(fragmento.texto, 300);
  return {
    ...resumenDocumento(fragmento.documento),
    urlFragmento: fragmento.url,
    paginaInicio: fragmento.paginaInicio,
    paginaFin: fragmento.paginaFin,
    ...(extracto ? { extracto } : {}),
  };
}

/**
 * Resumen compacto del catálogo para el prompt de sistema: categorías con
 * su cantidad, rango de años, idiomas y documentos con texto. Solo cambia
 * cuando se reconstruye el índice, así que no rompe la caché del prompt.
 */
export function resumenCatalogo(repositorio: RepositorioOdes): string {
  const estado = repositorio.estado();
  const categorias = repositorio.categorias();
  const lineas: string[] = [];
  lineas.push(
    `- ${estado.documentos} documentos en total; ${estado.documentosConTexto} tienen el texto completo indexado (el resto, como los tableros de Power BI, solo tiene metadatos).`,
  );
  const porCategoria = categorias.map(
    (categoria) =>
      `${categoria} (${repositorio.listar({ categorias: [categoria] }, 1).total})`,
  );
  if (porCategoria.length > 0) {
    lineas.push(`- Categorías: ${porCategoria.join(', ')}.`);
  }
  const anios = aniosConDocumentos(repositorio);
  if (anios) {
    lineas.push(
      `- Años de publicación: de ${anios.desde} a ${anios.hasta}; algunos documentos no tienen fecha ("S. F.").`,
    );
  }
  const enIngles = repositorio.listar({ idioma: 'en' }, 1).total;
  const enEspanol = repositorio.listar({ idioma: 'es' }, 1).total;
  lineas.push(
    `- Idiomas: ${enEspanol} en español y ${enIngles} traducciones al inglés (idioma "en").`,
  );
  return lineas.join('\n');
}

/** Primer y último año con documentos (consulta año por año: el índice no expone el rango). */
function aniosConDocumentos(
  repositorio: RepositorioOdes,
): { desde: number; hasta: number } | null {
  const hoy = new Date().getUTCFullYear() + 1;
  let desde: number | null = null;
  let hasta: number | null = null;
  for (let anio = 1990; anio <= hoy; anio++) {
    if (repositorio.listar({ anioDesde: anio, anioHasta: anio }, 1).total > 0) {
      desde ??= anio;
      hasta = anio;
    }
  }
  return desde !== null && hasta !== null ? { desde, hasta } : null;
}
