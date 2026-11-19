import type { z } from 'zod';
import { esNumeroBimestre, type NumeroBimestre } from '../api-pai.js';
import { noEncontrado, solicitudInvalida } from '../errores-pai.js';

/**
 * Ayudas de validación que comparten los controladores y servicios del PAI
 * (los esquemas zod de cada parte viven en su carpeta).
 */

/** Largo en caracteres (puntos de código, no unidades UTF-16). */
export function largo(texto: string): number {
  return [...texto].length;
}

/**
 * Errores por campo de zod: { "ruta.del.campo": "primer mensaje" }. Un error
 * del objeto completo queda en la clave "".
 */
export function camposDeErrorZod(error: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const problema of error.issues) {
    const ruta = problema.path.map(String).join('.');
    if (!(ruta in campos)) campos[ruta] = problema.message;
  }
  return campos;
}

/**
 * Valida `cuerpo` con `esquema`. Si no es un objeto JSON o no cumple, lanza
 * 400 `solicitud_invalida` con `mensaje` y los errores por campo.
 */
export function validarCuerpo<T extends z.ZodType>(
  esquema: T,
  cuerpo: unknown,
  mensaje = 'Revise los datos enviados.',
): z.output<T> {
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
    throw solicitudInvalida('Envíe los datos como un objeto JSON.');
  }
  const resultado = esquema.safeParse(cuerpo);
  if (!resultado.success) {
    throw solicitudInvalida(mensaje, camposDeErrorZod(resultado.error));
  }
  return resultado.data;
}

/** id de un parámetro de ruta (entero positivo); si no, 404. */
export function idDeRuta(texto: string, que = 'El recurso'): number {
  if (!/^[1-9]\d{0,9}$/.test(texto)) {
    throw noEncontrado(`${que} no existe.`);
  }
  const id = Number(texto);
  if (id > 2_147_483_647) throw noEncontrado(`${que} no existe.`);
  return id;
}

/** Bimestre de un parámetro de ruta (1-6); si no, 404. */
export function bimestreDeRuta(texto: string): NumeroBimestre {
  const numero = /^[1-6]$/.test(texto) ? Number(texto) : NaN;
  if (!esNumeroBimestre(numero)) {
    throw noEncontrado('El bimestre no existe (debe ser de 1 a 6).');
  }
  return numero;
}

/**
 * ?vigencia= de la consulta: null si no vino (se usa la más reciente); si no
 * es un año válido, 400.
 */
export function vigenciaDeConsulta(valor: unknown): number | null {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string' || !/^\d{4}$/.test(valor)) {
    throw solicitudInvalida('La vigencia debe ser un año de cuatro cifras.', {
      vigencia: 'Año inválido.',
    });
  }
  const anio = Number(valor);
  if (anio < 2000 || anio > 2100) {
    throw solicitudInvalida('La vigencia debe estar entre 2000 y 2100.', {
      vigencia: 'Año inválido.',
    });
  }
  return anio;
}

/** Entero positivo opcional de la consulta (?pagina=, ?usuario=…); si no, 400. */
export function enteroDeConsulta(
  valor: unknown,
  nombre: string,
  { minimo = 1, maximo = 2_147_483_647 } = {},
): number | null {
  if (valor === undefined || valor === null || valor === '') return null;
  const numero =
    typeof valor === 'string' && /^\d{1,10}$/.test(valor) ? Number(valor) : NaN;
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) {
    throw solicitudInvalida(
      `${nombre} debe ser un número entero entre ${minimo} y ${maximo}.`,
      { [nombre]: 'Número inválido.' },
    );
  }
  return numero;
}
