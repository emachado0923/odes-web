import { z } from 'zod';
import {
  type IdiomaProducto,
  LIMITES_REPOSITORIO,
  type TipoProducto,
} from '../api-repositorio.js';
import { solicitudInvalida } from '../errores-repositorio.js';
import {
  claveNormalizada,
  MAX_ID_DOCUMENTO,
  PATRON_ID_DOCUMENTO,
  textoLinea,
  textoMultilinea,
} from './normalizacion.js';

/**
 * Validación con zod de lo que llega a la API de administración. Los errores
 * salen como 400 solicitud_invalida con `campos` (un mensaje en español por
 * campo, apto para mostrar junto al campo del formulario).
 */

export const MAX_URL = 2048;
export const MAX_CLAVE = 80;
export const MAX_NUMERO = 20;
export const MAX_EQUIVALENTE = 400;
export const MAX_NOTAS_INTERNAS = 10_000;
export const MAX_CATEGORIA = 100;
export const ANIO_MINIMO = 1900;
export const ANIO_MAXIMO = 2100;

/** Longitud en caracteres (puntos de código), como cuenta MySQL. */
function largo(texto: string): number {
  return [...texto].length;
}

/** Palabras de un texto: fragmentos separados por espacios (como se cuentan las 60 de la descripción). */
export function contarPalabras(texto: string | null | undefined): number {
  const limpio = (texto ?? '').trim();
  return limpio ? limpio.split(/\s+/).length : 0;
}

/** Lo que necesita un producto para estar publicado (comentarios del Observatorio, 12-nov-2026). */
export interface DatosParaPublicar {
  /** Documento, tablero o entrada: los tres se publican con las mismas reglas. */
  tipo: TipoProducto;
  anio: number | null;
  descripcion: string | null;
  claves: readonly string[];
}

/**
 * Problemas que impiden publicar (o mantener publicado) un producto, por
 * campo; vacío si puede publicarse. Documentos, tableros y entradas se
 * publican con año, descripción de 25 a 35 palabras (se piden 30) y 6
 * palabras clave. Los borradores (despublicados) pueden quedar incompletos.
 */
export function problemasParaPublicar(d: DatosParaPublicar): Record<string, string> {
  const problemas: Record<string, string> = {};
  const { minimo, recomendado, maximo } = LIMITES_REPOSITORIO.palabrasDescripcion;
  if (d.anio === null) problemas.anio = 'Para publicar, indique el año de publicación.';
  const palabras = contarPalabras(d.descripcion);
  if (palabras === 0) {
    problemas.descripcion = `Para publicar, escriba la descripción (unas ${recomendado} palabras).`;
  } else if (palabras < minimo || palabras > maximo) {
    problemas.descripcion = `La descripción tiene ${palabras} palabras: para publicar debe tener entre ${minimo} y ${maximo} (se piden ${recomendado}).`;
  }
  if (d.claves.length !== LIMITES_REPOSITORIO.clavesParaPublicar) {
    problemas.claves = `Para publicar, el documento necesita ${LIMITES_REPOSITORIO.clavesParaPublicar} palabras clave (tiene ${d.claves.length}).`;
  }
  return problemas;
}

export function esUrlHttp(texto: string): boolean {
  try {
    const url = new URL(texto);
    return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== '';
  } catch {
    return false;
  }
}

function textoObligatorio(nombre: string, maximo: number) {
  return z
    .string({ error: `${nombre} es obligatorio.` })
    .transform(textoLinea)
    .refine((valor) => valor.length > 0, `${nombre} es obligatorio.`)
    .refine((valor) => largo(valor) <= maximo, `${nombre}: máximo ${maximo} caracteres.`);
}

function textoOpcional(nombre: string, maximo: number, multilinea = false) {
  return z
    .union([z.string(), z.null()], { error: `${nombre} debe ser texto.` })
    .optional()
    .transform((valor) => {
      if (valor === null || valor === undefined) return null;
      const limpio = multilinea ? textoMultilinea(valor) : textoLinea(valor);
      return limpio || null;
    })
    .refine(
      (valor) => valor === null || largo(valor) <= maximo,
      `${nombre}: máximo ${maximo} caracteres.`,
    );
}

function urlOpcional(nombre: string) {
  return z
    .union([z.string(), z.null()], { error: `${nombre} debe ser texto.` })
    .optional()
    .transform((valor) => (valor ? valor.trim() || null : null))
    .refine((valor) => valor === null || valor.length <= MAX_URL, `${nombre}: máximo ${MAX_URL} caracteres.`)
    .refine(
      (valor) => valor === null || esUrlHttp(valor),
      `${nombre} debe ser una dirección completa que empiece por https:// o http://.`,
    );
}

function enteroOpcional(nombre: string, minimo: number, maximo: number) {
  return z
    .union([z.number(), z.null()], { error: `${nombre} debe ser un número.` })
    .optional()
    .transform((valor) => valor ?? null)
    .refine(
      (valor) => valor === null || (Number.isInteger(valor) && valor >= minimo && valor <= maximo),
      `${nombre} debe ser un entero entre ${minimo} y ${maximo}.`,
    );
}

const esquemaClaves = z
  .array(z.string({ error: 'Cada palabra clave debe ser texto.' }), {
    error: 'Las palabras clave deben ser una lista.',
  })
  .max(50, 'Demasiadas palabras clave.')
  .transform((lista) => {
    // Limpias, sin vacías y sin repetidas (sin distinguir tildes ni mayúsculas).
    const vistas = new Set<string>();
    const claves: string[] = [];
    for (const texto of lista) {
      const limpia = textoLinea(texto);
      const clave = claveNormalizada(limpia);
      if (!clave || vistas.has(clave)) continue;
      vistas.add(clave);
      claves.push(limpia);
    }
    return claves;
  })
  .refine(
    (claves) => claves.length <= LIMITES_REPOSITORIO.maxClaves,
    `Máximo ${LIMITES_REPOSITORIO.maxClaves} palabras clave.`,
  )
  .refine(
    (claves) => claves.every((clave) => largo(clave) <= MAX_CLAVE),
    `Cada palabra clave puede tener máximo ${MAX_CLAVE} caracteres.`,
  );

const esquemaDocumento = z.object({
  id: z
    .union([z.string(), z.null()])
    .optional()
    .transform((valor) => (valor ? valor.trim() || null : null))
    .refine(
      (valor) =>
        valor === null ||
        (valor.length <= MAX_ID_DOCUMENTO && PATRON_ID_DOCUMENTO.test(valor)),
      `El identificador solo puede tener minúsculas sin tildes, números y guiones (máximo ${MAX_ID_DOCUMENTO}).`,
    ),
  titulo: textoObligatorio('El título', LIMITES_REPOSITORIO.maxTitulo),
  subtitulo: textoOpcional('El subtítulo', LIMITES_REPOSITORIO.maxSubtitulo),
  descripcion: textoOpcional('La descripción', LIMITES_REPOSITORIO.maxDescripcion),
  categoria: textoObligatorio('La categoría', MAX_CATEGORIA),
  numero: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((valor) =>
      valor === null || valor === undefined ? null : textoLinea(String(valor)) || null,
    )
    .refine((valor) => valor === null || largo(valor) <= MAX_NUMERO, `El número: máximo ${MAX_NUMERO} caracteres.`),
  anio: enteroOpcional('El año', ANIO_MINIMO, ANIO_MAXIMO),
  mes: enteroOpcional('El mes', 1, 12),
  idioma: z.enum(['es', 'en'], { error: 'El idioma debe ser "es" o "en".' }),
  tipo: z.enum(['documento', 'tablero', 'entrada'], {
    error: 'El tipo debe ser documento, tablero o entrada.',
  }),
  claves: esquemaClaves.optional().transform((claves) => claves ?? []),
  urlVerExterna: urlOpcional('La URL externa'),
  urlEntradaBlog: urlOpcional('La URL de la entrada del blog'),
  nota: textoOpcional('La nota', LIMITES_REPOSITORIO.maxNota),
  permiteDescarga: z.boolean({ error: 'Indique si se permite la descarga (true o false).' }),
  orden: enteroOpcional('La posición', 1, 1_000_000),
  equivalenteEnEspanol: textoOpcional('El equivalente en español', MAX_EQUIVALENTE),
  notasInternas: textoOpcional('Las notas internas', MAX_NOTAS_INTERNAS, true),
});

export interface DatosDocumentoValidos {
  id: string | null;
  titulo: string;
  subtitulo: string | null;
  descripcion: string | null;
  categoria: string;
  numero: string | null;
  anio: number | null;
  mes: number | null;
  idioma: IdiomaProducto;
  tipo: TipoProducto;
  claves: string[];
  urlVerExterna: string | null;
  urlEntradaBlog: string | null;
  nota: string | null;
  permiteDescarga: boolean;
  orden: number | null;
  equivalenteEnEspanol: string | null;
  notasInternas: string | null;
}

function camposDeError(error: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const problema of error.issues) {
    const campo = String(problema.path[0] ?? 'solicitud');
    campos[campo] ??= problema.message;
  }
  return campos;
}

function rechazar(campos: Record<string, string>): never {
  throw solicitudInvalida(
    Object.keys(campos).length === 1
      ? Object.values(campos)[0]
      : 'Revise los campos marcados.',
    campos,
  );
}

/** Valida DatosDocumento. Lanza 400 con los errores por campo. */
export function validarDatosDocumento(cuerpo: unknown): DatosDocumentoValidos {
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
    throw solicitudInvalida('Envíe los datos del documento como un objeto JSON.');
  }
  const resultado = esquemaDocumento.safeParse(cuerpo);
  if (!resultado.success) rechazar(camposDeError(resultado.error));
  const datos = resultado.data as DatosDocumentoValidos;
  const campos: Record<string, string> = {};
  if (datos.mes !== null && datos.anio === null) {
    campos.mes = 'El mes solo se puede indicar si hay año.';
  }
  if (datos.tipo !== 'documento') {
    const nombre = datos.tipo === 'tablero' ? 'Un tablero' : 'Una entrada';
    if (!datos.urlVerExterna) {
      campos.urlVerExterna = `${nombre} necesita la URL externa (Power BI, blog...).`;
    }
    if (datos.permiteDescarga) {
      campos.permiteDescarga = `${nombre} no tiene descarga.`;
    }
  }
  if (Object.keys(campos).length > 0) rechazar(campos);
  return datos;
}

const esquemaCredenciales = z.object({
  usuario: z.string().trim().min(1).max(64),
  contrasena: z.string().min(1).max(1024),
});

export function validarCredenciales(cuerpo: unknown): {
  usuario: string;
  contrasena: string;
} {
  const resultado = esquemaCredenciales.safeParse(cuerpo);
  if (!resultado.success) {
    throw solicitudInvalida('Escriba el usuario y la contraseña.');
  }
  return {
    usuario: resultado.data.usuario.toLowerCase(),
    contrasena: resultado.data.contrasena,
  };
}

/** Usuario de administración: minúsculas, números, punto, guion y guion bajo. */
export const PATRON_USUARIO = /^[a-z0-9][a-z0-9._-]{2,63}$/;

const esquemaNombreCategoria = textoObligatorio('El nombre', MAX_CATEGORIA);

export function validarCategoriaNueva(cuerpo: unknown): { nombre: string } {
  const resultado = z.object({ nombre: esquemaNombreCategoria }).safeParse(cuerpo);
  if (!resultado.success) rechazar(camposDeError(resultado.error));
  return resultado.data;
}

export function validarCambioCategoria(cuerpo: unknown): {
  nombre: string | null;
  orden: number | null;
} {
  const resultado = z
    .object({
      nombre: esquemaNombreCategoria.optional(),
      orden: enteroOpcional('La posición', 1, 1000),
    })
    .safeParse(cuerpo);
  if (!resultado.success) rechazar(camposDeError(resultado.error));
  const { nombre, orden } = resultado.data;
  if (nombre === undefined && orden === null) {
    throw solicitudInvalida('Indique el nombre o la posición de la categoría.');
  }
  return { nombre: nombre ?? null, orden };
}

export function validarPalabraClave(cuerpo: unknown): { texto: string } {
  const resultado = z
    .object({ texto: textoObligatorio('La palabra clave', MAX_CLAVE) })
    .safeParse(cuerpo);
  if (!resultado.success) rechazar(camposDeError(resultado.error));
  return resultado.data;
}

export function validarConfirmacion(cuerpo: unknown): { confirmarId: string } {
  const resultado = z
    .object({ confirmarId: z.string().trim().min(1).max(MAX_ID_DOCUMENTO) })
    .safeParse(cuerpo);
  if (!resultado.success) {
    throw solicitudInvalida(
      'Para borrar definitivamente, envíe { confirmarId } con el identificador del documento.',
      { confirmarId: 'Escriba el identificador del documento para confirmar.' },
    );
  }
  return resultado.data;
}

/** ?limite= del registro de cambios: 1 a 500, por defecto 50. */
export function validarLimite(valor: unknown, porDefecto = 50): number {
  if (valor === undefined || valor === '') return porDefecto;
  const numero = typeof valor === 'string' && /^\d+$/.test(valor) ? Number(valor) : NaN;
  if (!Number.isInteger(numero) || numero < 1 || numero > 500) {
    throw solicitudInvalida('limite debe ser un entero entre 1 y 500.');
  }
  return numero;
}

/** Identificador de documento válido (si no, la ruta responde 404). */
export function esIdDocumento(id: string): boolean {
  return id.length <= MAX_ID_DOCUMENTO && PATRON_ID_DOCUMENTO.test(id);
}
