/**
 * Normalización de textos: claves de comparación (sin tildes ni mayúsculas),
 * limpieza de lo que escribe el administrador y generación de identificadores
 * (slugs) para documentos nuevos.
 */

/** Quita caracteres de control (deja tabulador y saltos de línea si `multilinea`). */
export function sinControl(texto: string, multilinea = false): string {
  let resultado = '';
  for (const caracter of texto) {
    const codigo = caracter.codePointAt(0) ?? 0;
    const salto = codigo === 0x0a || codigo === 0x09 || codigo === 0x0d;
    const control =
      codigo < 0x20 ||
      codigo === 0x7f ||
      (codigo >= 0x80 && codigo < 0xa0) ||
      codigo === 0x2028 ||
      codigo === 0x2029;
    if (!control || (multilinea && salto)) resultado += caracter;
  }
  return resultado;
}

/** Texto de una línea: NFC, sin control y con espacios simples. */
export function textoLinea(texto: string): string {
  return sinControl(texto.normalize('NFC'))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Texto de varias líneas (notas internas): NFC, saltos \n, sin control. */
export function textoMultilinea(texto: string): string {
  return sinControl(texto.normalize('NFC'), true)
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

/**
 * Clave de comparación de una palabra clave: minúsculas, sin tildes ni
 * diéresis (la ñ también pasa a n, como en la intercalación _ai_ci de MySQL) y
 * espacios simples. "Educación  Superior" y "educacion superior" -> igual.
 */
export function claveNormalizada(texto: string): string {
  return textoLinea(texto)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

/** Mismas palabras clave, en el mismo orden, sin distinguir tildes ni mayúsculas. */
export function mismasClaves(a: readonly string[], b: readonly string[]): boolean {
  return (
    a.length === b.length &&
    a.every((texto, indice) => claveNormalizada(texto) === claveNormalizada(b[indice]))
  );
}

/** Palabras vacías que no aportan al identificador. */
const PALABRAS_VACIAS = new Set([
  'a', 'al', 'ante', 'con', 'de', 'del', 'desde', 'el', 'en', 'entre', 'la',
  'las', 'lo', 'los', 'o', 'para', 'por', 'segun', 'sin', 'sobre', 'su',
  'sus', 'un', 'una', 'unos', 'unas', 'y', 'e', 'u', 'que', 'se',
  'the', 'of', 'and', 'in', 'for', 'to', 'on', 'an', 'by', 'at', 'from', 'with',
]);

/** "Boletín N.º 19: Fe de erratas" -> "boletin-n-19-fe-de-erratas" */
export function slug(texto: string): string {
  return claveNormalizada(texto)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const PATRON_ID_DOCUMENTO = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_ID_DOCUMENTO = 120;

/** Recorta un slug a `maximo` caracteres sin partir palabras. */
function recortarSlug(texto: string, maximo: number): string {
  if (texto.length <= maximo) return texto;
  const corte = texto.slice(0, maximo + 1);
  const ultimoGuion = corte.lastIndexOf('-');
  return (ultimoGuion > 0 ? corte.slice(0, ultimoGuion) : corte.slice(0, maximo))
    .replace(/-+$/, '');
}

/**
 * Identificador legible para un documento nuevo, con el mismo estilo que los
 * del paquete: categoría, número, "en" si está en inglés, hasta 6 palabras
 * del título (sin palabras vacías) y año. Ej.:
 * "boletin-19-fe-erratas-boletin-n-19-2021".
 */
export function generarIdDocumento(d: {
  categoria: string;
  numero?: string | null;
  titulo: string;
  anio?: number | null;
  idioma?: string | null;
}): string {
  const palabras = slug(d.titulo)
    .split('-')
    .filter((palabra) => palabra && !PALABRAS_VACIAS.has(palabra))
    .slice(0, 6);
  const anio = d.anio ? String(d.anio) : '';
  const partes = [
    slug(d.categoria),
    d.numero ? slug(d.numero) : '',
    d.idioma === 'en' ? 'en' : '',
    ...palabras,
  ].filter(Boolean);
  // Sin repetir el año si el título ya termina en él.
  if (anio && partes.at(-1) !== anio) partes.push(anio);
  const base = recortarSlug(partes.join('-'), 90);
  return base || 'documento';
}

/** Agrega -2, -3... hasta que `existe` diga que no está usado. */
export async function idUnico(
  base: string,
  existe: (id: string) => Promise<boolean>,
): Promise<string> {
  if (!(await existe(base))) return base;
  for (let n = 2; n < 10_000; n++) {
    const sufijo = `-${n}`;
    const candidato = `${recortarSlug(base, MAX_ID_DOCUMENTO - sufijo.length)}${sufijo}`;
    if (!(await existe(candidato))) return candidato;
  }
  throw new Error('No se pudo generar un identificador único.');
}
