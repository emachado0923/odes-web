/**
 * Limpieza del texto extraído (pdftotext, OCR, XML de Office) antes de
 * fragmentarlo. Es texto para leer (lo ve el modelo y la persona en las
 * citas), así que se conservan tildes, mayúsculas y signos.
 */

const LIGADURAS: Readonly<Record<string, string>> = {
  '\uFB00': 'ff',
  '\uFB01': 'fi',
  '\uFB02': 'fl',
  '\uFB03': 'ffi',
  '\uFB04': 'ffl',
  '\uFB05': 'st',
  '\uFB06': 'st',
};

/** Guion suave, espacios de ancho cero, BOM, marcas de dirección. */
const INVISIBLES = /[\u00AD\u200B-\u200F\u2060\uFEFF]/g;
/** Controles y caracteres de uso privado (iconos de fuentes). */
const CONTROLES = /[\p{Cc}\p{Co}]/gu;
const ESPACIOS = /[\t\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

/** Normaliza caracteres: NFC, ligaduras, invisibles, controles y espacios raros. */
export function normalizarCaracteres(texto: string): string {
  return texto
    .normalize('NFC')
    .replace(/[\uFB00-\uFB06]/g, (ligadura) => LIGADURAS[ligadura] ?? ligadura)
    .replace(/\r\n?/g, '\n')
    .replace(INVISIBLES, '')
    .replace(CONTROLES, (caracter) => (caracter === '\n' ? caracter : ' '))
    .replace(ESPACIOS, ' ');
}

/** "educa-\nción" -> "educación" (solo entre minúsculas). */
export function unirGuionesDeLinea(texto: string): string {
  return texto.replace(/(\p{Ll})[-\u2010\u00AD]\n[ \t]*(\p{Ll})/gu, '$1$2');
}

/**
 * Une las líneas de cada bloque (pdftotext separa los bloques con una línea
 * en blanco) y devuelve los bloques, sin espacios repetidos.
 */
export function bloquesDeTexto(texto: string): string[] {
  // Primero se unen los guiones de fin de línea (incluido el guion suave,
  // que normalizarCaracteres elimina) y después se normalizan los caracteres.
  const unido = unirGuionesDeLinea(
    texto.normalize('NFC').replace(/\r\n?/g, '\n'),
  );
  return normalizarCaracteres(unido)
    .split(/\n[ \t]*\n+/)
    .map((bloque) =>
      bloque
        .split('\n')
        .map((linea) => linea.replace(/ {2,}/g, ' ').trim())
        .filter(Boolean)
        .join(' '),
    )
    .filter((bloque) => bloque && !esRelleno(bloque));
}

/**
 * Bloques de relleno que se repiten en casi todas las piezas del Observatorio
 * (redes y sitio web) o que no tienen letras ni cifras (viñetas, guiones).
 */
const BLOQUES_DE_RELLENO = [
  /^@sapienciamed$/i,
  /^(?:https?:\/\/)?(?:www\.)?sapiencia\.gov\.co\/?$/i,
];

function esRelleno(bloque: string): boolean {
  return (
    !/[\p{L}\p{N}]/u.test(bloque) ||
    BLOQUES_DE_RELLENO.some((patron) => patron.test(bloque))
  );
}

/** Cantidad de caracteres que no son espacio. */
export function caracteresVisibles(texto: string): number {
  return texto.replace(/\s+/g, '').length;
}

/**
 * Filtra las líneas de ruido típicas del OCR ("Ww", "UN,", "‘~—"): deja las que
 * tienen una palabra de 3 letras o más, o alguna cifra.
 */
export function filtrarRuidoOcr(texto: string): string {
  return normalizarCaracteres(texto)
    .split('\n')
    .map((linea) => linea.trim())
    .filter((linea) => {
      if (!linea) return true; // conserva la separación de bloques
      const alfanumericos = linea.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
      if (alfanumericos < 3) return false;
      if (alfanumericos / linea.length < 0.5) return false;
      return /\p{L}{3,}/u.test(linea) || /\p{N}/u.test(linea);
    })
    .join('\n');
}

/** Clave para comparar bloques candidatos a encabezado: sin cifras ni mayúsculas. */
function claveEncabezado(bloque: string): string {
  return bloque.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
}

/** Bloques que se revisan al comienzo y al final de cada página. */
const BLOQUES_DE_BORDE = 2;

function enBorde(indice: number, total: number): boolean {
  return indice < BLOQUES_DE_BORDE || indice >= total - BLOQUES_DE_BORDE;
}

/** Bloque corto con alguna palabra: candidato a encabezado o pie. */
function esCandidato(bloque: string): boolean {
  return bloque.length <= 100 && /\p{L}{3,}/u.test(bloque);
}

/**
 * Quita encabezados y pies de página repetidos (documentos de 4 páginas o
 * más con texto):
 * - bloques cortos (≤ 100 caracteres, con alguna palabra) que aparecen al
 *   comienzo o al final de al menos el 40 % de las páginas (mínimo 3); las
 *   cifras se comparan como comodín ("Página 3 de 20" = "Página 7 de 20");
 * - números de página sueltos: un número al comienzo o al final de la página
 *   que avanza con ella (misma diferencia con el número real de la página en
 *   el 40 % de las páginas). Los demás números (datos de gráficos) se quedan.
 */
export function quitarEncabezadosRepetidos(paginas: string[][]): string[][] {
  const conTexto = paginas.filter((bloques) => bloques.length > 0);
  if (conTexto.length < 4) return paginas;
  const umbral = Math.max(3, Math.ceil(conTexto.length * 0.4));

  const conteo = new Map<string, number>();
  const desfases = new Map<number, number>();
  paginas.forEach((bloques, indicePagina) => {
    const enPagina = new Set<string>();
    bloques.forEach((bloque, indice) => {
      if (enBorde(indice, bloques.length) && esCandidato(bloque)) {
        enPagina.add(claveEncabezado(bloque));
      }
    });
    for (const clave of enPagina)
      conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
    const desfasesPagina = new Set<number>();
    for (const bloque of [bloques[0], bloques.at(-1)]) {
      if (bloque !== undefined && /^\d{1,4}$/.test(bloque)) {
        desfasesPagina.add(Number(bloque) - (indicePagina + 1));
      }
    }
    for (const desfase of desfasesPagina)
      desfases.set(desfase, (desfases.get(desfase) ?? 0) + 1);
  });
  const repetidos = new Set(
    [...conteo].filter(([, veces]) => veces >= umbral).map(([clave]) => clave),
  );
  const desfasesNumeracion = new Set(
    [...desfases]
      .filter(([, veces]) => veces >= umbral)
      .map(([desfase]) => desfase),
  );
  if (repetidos.size === 0 && desfasesNumeracion.size === 0) return paginas;

  return paginas.map((bloques, indicePagina) =>
    bloques.filter((bloque, indice) => {
      const extremo = indice === 0 || indice === bloques.length - 1;
      if (
        extremo &&
        /^\d{1,4}$/.test(bloque) &&
        desfasesNumeracion.has(Number(bloque) - (indicePagina + 1))
      ) {
        return false;
      }
      return !(
        enBorde(indice, bloques.length) &&
        esCandidato(bloque) &&
        repetidos.has(claveEncabezado(bloque))
      );
    }),
  );
}

/**
 * Limpia las páginas de un documento: bloques por página, sin encabezados ni
 * pies repetidos, unidos con salto de línea.
 */
export function limpiarPaginas(textos: readonly string[]): string[] {
  const bloques = quitarEncabezadosRepetidos(textos.map(bloquesDeTexto));
  return bloques.map((bloquesPagina) => bloquesPagina.join('\n'));
}
