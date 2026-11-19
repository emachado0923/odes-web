import {
  esPalabraVacia,
  minusculas,
  plegar,
  raiz,
  terminos,
  variantesDeRaiz,
} from './normalizacion.js';

/**
 * Construcción SEGURA de consultas FTS5 a partir de texto libre.
 *
 * El texto de la persona (o del modelo) nunca llega tal cual a MATCH: se
 * parte en palabras de letras y cifras con las mismas reglas del indexador y
 * cada término se escribe entre comillas dobles. Así las comillas,
 * paréntesis, asteriscos, guiones, dos puntos, ^, NEAR, AND/OR/NOT o nombres
 * de columna que traiga el texto no pueden cambiar la sintaxis de la
 * consulta: solo quedan términos citados unidos por AND / OR que arma este
 * módulo.
 *
 * - Palabras de 6 letras o más en su raíz buscan por prefijo
 *   (matricul* -> matrícula, matriculados).
 * - Las cifras solo coinciden exactas.
 * - Palabras unidas por guion, barra o punto ("2018-2", "COVID-19") forman una
 *   frase: sus términos deben ir seguidos en el texto.
 * - Algunas siglas y palabras en inglés se amplían a su equivalente en
 *   español (IES, ETDH, PP, IA, dropout…), porque casi todo el repositorio
 *   está en español.
 */

export interface ConsultaFts {
  /** Todos los grupos deben aparecer (Y). */
  readonly y: string;
  /** Basta con uno de los grupos (O). */
  readonly o: string;
  /** Cantidad de grupos (palabras o frases) de la consulta. */
  readonly grupos: number;
}

/** Máximo de grupos: una consulta más larga se recorta (evita consultas costosas). */
export const MAX_GRUPOS_CONSULTA = 16;

/** Largo mínimo de la raíz para buscar por prefijo. */
const LARGO_MINIMO_PREFIJO = 6;

/** Máximo de caracteres de texto libre que se analizan. */
const LARGO_MAXIMO_TEXTO = 600;

/**
 * Separadores entre "trozos". Dentro de un trozo, las palabras unidas por
 * guion, barra, punto o apóstrofo forman una frase.
 */
const SEPARADOR_TROZOS = /[^\p{L}\p{N}\-\u2010-\u2013/._'\u2019]+/u;
const SEPARADOR_PALABRAS = /[^\p{L}\p{N}]+/u;

/** Término ya normalizado: solo letras y cifras (nunca comillas). */
const TERMINO_SEGURO = /^[\p{L}\p{N}]+$/u;

/**
 * Ampliaciones de consulta (clave: palabra plegada). Cada valor es texto que
 * se normaliza igual que el índice y se agrega como alternativa (O).
 */
const AMPLIACIONES: Readonly<Record<string, readonly string[]>> = {
  ies: ['instituciones de educación superior'],
  pp: ['presupuesto participativo'],
  etdh: ['educación para el trabajo y el desarrollo humano'],
  ia: ['inteligencia artificial'],
  ai: ['inteligencia artificial'],
  abandono: ['deserción'],
  cuarta: ['4ta'],
  '4ta': ['cuarta'],
  '4th': ['cuarta', '4ta'],
  // Inglés -> español
  dropout: ['deserción'],
  dropouts: ['deserción'],
  enrollment: ['matrícula'],
  enrolment: ['matrícula'],
  scholarship: ['becas'],
  scholarships: ['becas'],
  expectations: ['expectativas'],
  graduates: ['graduados'],
  employment: ['empleo'],
  employability: ['empleabilidad'],
  women: ['mujeres'],
  gender: ['género'],
  research: ['investigación'],
  student: ['estudiantes'],
  students: ['estudiantes'],
  university: ['universidad'],
  universities: ['universidades'],
  quality: ['calidad'],
  financing: ['financiación'],
  funding: ['financiación'],
  loans: ['créditos'],
  dashboard: ['tablero'],
  dashboards: ['tablero'],
  bulletin: ['boletín'],
  infographic: ['infografía'],
  trends: ['tendencias'],
  skills: ['habilidades'],
  access: ['acceso'],
  survey: ['encuesta'],
  satisfaction: ['satisfacción'],
  labor: ['laboral'],
  labour: ['laboral'],
};

function citar(termino: string, prefijo: boolean): string {
  // Defensa en profundidad: nunca debería llegar algo distinto de letras/cifras.
  if (!TERMINO_SEGURO.test(termino)) {
    throw new Error(
      `Término de consulta no válido: ${JSON.stringify(termino)}`,
    );
  }
  return prefijo ? `"${termino}"*` : `"${termino}"`;
}

function citarFrase(partes: readonly string[]): string {
  for (const parte of partes) citar(parte, false);
  return `"${partes.join(' ')}"`;
}

function terminoSimple(raizTermino: string): string {
  const prefijo =
    raizTermino.length >= LARGO_MINIMO_PREFIJO && !/\p{N}/u.test(raizTermino);
  return citar(raizTermino, prefijo);
}

function alternativasDePalabra(palabra: string): string[] {
  const alternativas = variantesDeRaiz(palabra).map(terminoSimple);
  for (const ampliacion of AMPLIACIONES[plegar(palabra)] ?? []) {
    const partes = terminos(ampliacion);
    if (partes.length === 1) alternativas.push(terminoSimple(partes[0]!));
    else if (partes.length > 1) alternativas.push(citarFrase(partes));
  }
  return [...new Set(alternativas)];
}

/**
 * Grupos de la consulta: cada uno es una lista de alternativas FTS5 seguras
 * (términos citados, con o sin prefijo, o frases citadas).
 */
export function gruposDeConsulta(texto: string): string[][] {
  const grupos: string[][] = [];
  const vistos = new Set<string>();
  const trozos = minusculas(texto.slice(0, LARGO_MAXIMO_TEXTO)).split(
    SEPARADOR_TROZOS,
  );
  for (const trozo of trozos) {
    const palabras = trozo
      .split(SEPARADOR_PALABRAS)
      .filter((palabra) => palabra && !esPalabraVacia(plegar(palabra)));
    if (palabras.length === 0) continue;
    const alternativas =
      palabras.length === 1
        ? alternativasDePalabra(palabras[0]!)
        : [citarFrase(palabras.map((palabra) => raiz(palabra)))];
    const clave = alternativas.join('|');
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    grupos.push(alternativas);
    if (grupos.length >= MAX_GRUPOS_CONSULTA) break;
  }
  return grupos;
}

/**
 * Consulta FTS5 (Y y O) para un texto libre, o null si no queda ningún
 * término útil (texto vacío, solo signos o solo palabras vacías).
 */
export function construirConsulta(texto: string): ConsultaFts | null {
  const grupos = gruposDeConsulta(texto);
  if (grupos.length === 0) return null;
  const y = grupos
    .map((alternativas) =>
      alternativas.length === 1
        ? alternativas[0]!
        : `(${alternativas.join(' OR ')})`,
    )
    .join(' AND ');
  const o = [...new Set(grupos.flat())].join(' OR ');
  return { y, o, grupos: grupos.length };
}

/** Restringe una expresión FTS5 (ya segura) a algunas columnas. */
export function restringirAColumnas(
  expresion: string,
  columnas: readonly string[],
): string {
  return `{${columnas.join(' ')}} : (${expresion})`;
}
