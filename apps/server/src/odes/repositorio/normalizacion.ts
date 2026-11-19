/**
 * Normalización del texto para el índice de búsqueda del repositorio.
 *
 * El indexador y las consultas usan EXACTAMENTE las mismas funciones, así que
 * lo que se guarda en la tabla FTS5 y lo que se busca siempre coincide:
 *
 *   "Las deserciones en Educación Superior (2018-2)"
 *     -> palabras:  las · deserciones · en · educación · superior · 2018 · 2
 *     -> sin palabras vacías ni letras sueltas: deserciones · educación · superior · 2018 · 2
 *     -> raíces ligeras y sin tildes: desercion · educacion · superior · 2018 · 2
 *
 * - Minúsculas y sin diacríticos (á -> a, ñ -> n, ü -> u), con compatibilidad
 *   Unicode (ligaduras "ﬁ" -> "fi", superíndices "²" -> "2").
 * - Palabras vacías del español y del inglés fuera (de, la, the, of…).
 * - Raíces "ligeras" del español: solo se pliegan plurales y género
 *   (becas = beca, mujeres = mujer, estudiantes = estudiante = estudiant,
 *   educativo = educativa). No es un stemmer agresivo a propósito: educación y
 *   educativa siguen siendo términos distintos.
 * - Las cifras quedan tal cual (2018, 11, 19): solo coinciden exactas.
 */

/** Palabras vacías ya plegadas (minúsculas y sin tildes). */
export const PALABRAS_VACIAS: ReadonlySet<string> = new Set(
  // Español
  (
    'a al algo algun alguna algunas alguno algunos ante antes aqui asi aun ' +
    'cada cual cuales cualquier cuando cuanta cuantas cuanto cuantos como con contra cuyo cuya ' +
    'de del desde donde durante e el ella ellas ello ellos en entre era eran eres es esa esas ' +
    'ese eso esos esta estaba estan estar estas este esto estos fue fueron ha habia han hasta ' +
    'hay la las le les lo los mas me mi mis mucha muchas mucho muchos muy nada ni no nos nosotros ' +
    'o otra otras otro otros para pero poco por porque pues que quien quienes se sea sean segun ser ' +
    'si sido siendo sin sino sobre son su sus tal tambien tan tanto te tiene tienen toda todas todo ' +
    'todos tu tus u un una unas uno unos usted ustedes y ya yo ' +
    // Fórmulas de pregunta que no aportan al tema
    'dime dame quiero quisiera puedes podrias favor hola gracias ' +
    // Inglés
    'about an and are as at be been but by can could did do does for from had has have how if in ' +
    'into is it its of on or our should than that the their them there these they this those to ' +
    'was we were what when where which who why will with would you your'
  )
    .split(/\s+/)
    .filter(Boolean),
);

/** Ordinales y grados que pegan letras a las cifras ("N.º 19", "11°", "1ª"). */
const ORDINALES = /[ºª°]/g;

/** Separa palabras: todo lo que no es letra ni cifra. */
const SEPARADOR = /[^\p{L}\p{N}]+/u;

const MARCAS = /\p{M}+/gu;

/** Máximo de caracteres de una palabra indexable (más largo = basura de OCR o URL). */
const LARGO_MAXIMO_PALABRA = 40;

/** Minúsculas y compatibilidad Unicode, conservando las tildes. */
export function minusculas(texto: string): string {
  return texto.replace(ORDINALES, ' ').normalize('NFKC').toLowerCase();
}

/** Quita diacríticos: "Educación" -> "educacion", "año" -> "ano". */
export function plegar(texto: string): string {
  return minusculas(texto).normalize('NFD').replace(MARCAS, '');
}

/** Palabras del texto en minúsculas, todavía con tildes. */
function palabrasConTildes(texto: string): string[] {
  return minusculas(texto).split(SEPARADOR).filter(Boolean);
}

function quitarTildes(palabra: string): string {
  return palabra.normalize('NFD').replace(MARCAS, '');
}

const VOCAL = /[aeiou]/;

/**
 * Raíz ligera de una palabra en minúsculas CON tildes (la tilde distingue el
 * singular "interés" del plural "intereses"). Devuelve la raíz sin tildes.
 *
 * 1. Plural: "-ces" tras vocal -> "-z" (luces -> luz); "-es" tras l, r, n, d,
 *    j, s, y, z -> se quita (mujeres -> mujer, meses -> mes); "-s" tras vocal
 *    SIN tilde -> se quita (becas -> beca). "país", "inglés", "interés"
 *    (vocal con tilde + s) son singulares y no se tocan.
 * 2. Género / vocal final: si quedan 5 letras o más, se quita una a, e u o
 *    final sin tilde (educativa = educativo -> educativ, estudiante -> estudiant).
 *
 * Las palabras con cifras o de menos de 4 letras no se tocan.
 */
export function raiz(palabra: string): string {
  if (palabra.length < 4 || !/^\p{L}+$/u.test(palabra)) {
    return quitarTildes(palabra);
  }
  let r = palabra;
  const n = r.length;
  if (n >= 5 && r.endsWith('ces') && VOCAL.test(quitarTildes(r[n - 4]!))) {
    r = `${r.slice(0, -3)}z`;
  } else if (n >= 5 && r.endsWith('es') && /[lrndjsyz]/.test(r[n - 3]!)) {
    r = r.slice(0, -2);
  } else if (r.endsWith('s') && VOCAL.test(r[n - 2]!)) {
    r = r.slice(0, -1);
  }
  if (r.length >= 5 && /[aeo]$/.test(r)) {
    r = r.slice(0, -1);
  }
  return quitarTildes(r);
}

/** ¿Se descarta la palabra (ya plegada) del índice y de las consultas? */
export function esPalabraVacia(palabraPlegada: string): boolean {
  if (PALABRAS_VACIAS.has(palabraPlegada)) return true;
  // Letras sueltas ("n" de "N.º", "s" de "people's"); las cifras sueltas sí cuentan.
  if (palabraPlegada.length === 1 && !/\p{N}/u.test(palabraPlegada)) {
    return true;
  }
  return palabraPlegada.length > LARGO_MAXIMO_PALABRA;
}

/**
 * Términos indexables de un texto, en orden: sin palabras vacías y reducidos
 * a su raíz. Es la forma en que el texto se guarda en la tabla FTS5.
 */
export function terminos(texto: string): string[] {
  const resultado: string[] = [];
  for (const palabra of palabrasConTildes(texto)) {
    if (esPalabraVacia(quitarTildes(palabra))) continue;
    resultado.push(raiz(palabra));
  }
  return resultado;
}

/** Texto normalizado para una columna FTS5: términos separados por espacios. */
export function normalizarParaIndice(texto: string): string {
  return terminos(texto).join(' ');
}

/**
 * Variantes de raíz de una palabra escrita por una persona (para consultas).
 * Quien escribe sin tildes ("interes", "pais", "ingles") no podría coincidir
 * con la raíz de "interés" / "país" / "inglés", porque sin la tilde parecen
 * plurales: se agrega también la raíz "como singular".
 */
export function variantesDeRaiz(palabra: string): string[] {
  const minuscula = minusculas(palabra);
  const principal = raiz(minuscula);
  const variantes = [principal];
  // La raíz de un singular con tilde ("interés", "país") es la palabra misma.
  if (/^[a-z]+$/.test(minuscula) && /[ei]s$/.test(minuscula)) {
    if (minuscula !== principal) variantes.push(minuscula);
  }
  return variantes;
}

/** Clave para comparar nombres de categoría o palabras clave ("Boletines" = "boletín"). */
export function claveComparacion(texto: string): string {
  return terminos(texto).join(' ');
}
