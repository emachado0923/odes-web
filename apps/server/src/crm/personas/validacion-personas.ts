import { z } from 'zod';
import { LIMITES_CRM } from '../api-crm.js';
import { PATRON_CORREO } from '../../pai/usuarios/validacion-usuarios.js';
import { sinControl, textoLinea } from '../../repositorio/dominio/normalizacion.js';
import { noEncontrado, solicitudInvalida } from '../../repositorio/errores-repositorio.js';

/**
 * Validación (zod) de la pantalla Equipo del líder:
 *   POST  /api/crm/lider/personas      <- NuevaPersonaCrm
 *   PATCH /api/crm/lider/personas/:id  <- EdicionPersonaCrm
 * Los errores salen como 400 `solicitud_invalida` con `campos`.
 */

export const MENSAJE_PERSONA_NO_EXISTE = 'La persona no existe.';
export const MENSAJE_CORREO_REPETIDO = 'Ya hay una persona con ese correo.';
export const MENSAJE_ULTIMO_LIDER = 'No se puede desactivar al único líder activo.';

/** `orden` que acepta una edición (y tope del que se asigna al crear). */
export const MAX_ORDEN_PERSONA = 9999;

/** Mayor id de ruta (INT con signo). */
const MAX_ID = 2_147_483_647;

/** Largo en caracteres (puntos de código), como lo cuenta un VARCHAR. */
function largo(texto: string): number {
  return [...texto].length;
}

const MENSAJE_CORREO_INVALIDO = 'Escriba un correo válido (por ejemplo, nombre@sapiencia.gov.co).';

/**
 * Recortado y con espacios simples. Los tabuladores y saltos pasan antes a
 * espacio: textoLinea quita los caracteres de control antes de colapsar, y
 * «Ana\tPérez» quedaría «AnaPérez».
 */
const esquemaNombre = z
  .string({ error: 'Escriba el nombre.' })
  .transform((valor) => textoLinea(valor.replace(/\s+/g, ' ')))
  .refine((valor) => valor.length > 0, 'Escriba el nombre.')
  .refine(
    (valor) => largo(valor) <= LIMITES_CRM.nombrePersona,
    `El nombre: máximo ${LIMITES_CRM.nombrePersona} caracteres.`,
  );

const esquemaCorreo = z
  .string({ error: 'Escriba el correo.' })
  .transform((valor) => valor.normalize('NFC').trim().toLowerCase())
  .superRefine((valor, ctx) => {
    if (valor.length === 0) {
      ctx.addIssue({ code: 'custom', message: 'Escriba el correo.' });
    } else if (largo(valor) > LIMITES_CRM.correo) {
      ctx.addIssue({ code: 'custom', message: `El correo: máximo ${LIMITES_CRM.correo} caracteres.` });
    } else if (sinControl(valor) !== valor || !PATRON_CORREO.test(valor)) {
      ctx.addIssue({ code: 'custom', message: MENSAJE_CORREO_INVALIDO });
    }
  });

const esquemaEsLider = z.boolean({ error: 'Indique si es líder (verdadero o falso).' });

const esquemaActivo = z.boolean({ error: 'Indique si está activa (verdadero o falso).' });

const esquemaPuedeCrearTareas = z.boolean({ error: 'Indique si puede crearse tareas (verdadero o falso).' });

const MENSAJE_ORDEN = `El orden debe ser un número entero de 0 a ${MAX_ORDEN_PERSONA}.`;

const esquemaOrden = z
  .number({ error: MENSAJE_ORDEN })
  .int(MENSAJE_ORDEN)
  .min(0, MENSAJE_ORDEN)
  .max(MAX_ORDEN_PERSONA, MENSAJE_ORDEN);

const esquemaNuevaPersona = z.object({
  nombre: esquemaNombre,
  correo: esquemaCorreo,
  esLider: esquemaEsLider.optional(),
});

const esquemaEdicionPersona = z.object({
  nombre: esquemaNombre.optional(),
  correo: esquemaCorreo.optional(),
  activo: esquemaActivo.optional(),
  orden: esquemaOrden.optional(),
  puedeCrearTareas: esquemaPuedeCrearTareas.optional(),
});

/** { "ruta.del.campo": "primer mensaje" }; un error del objeto completo queda en "". */
function camposDeErrorZod(error: z.ZodError): Record<string, string> {
  const campos: Record<string, string> = {};
  for (const problema of error.issues) {
    const ruta = problema.path.map(String).join('.');
    if (!(ruta in campos)) campos[ruta] = problema.message;
  }
  return campos;
}

function validarObjeto<T extends z.ZodType>(esquema: T, cuerpo: unknown): z.output<T> {
  if (typeof cuerpo !== 'object' || cuerpo === null || Array.isArray(cuerpo)) {
    throw solicitudInvalida('Envíe los datos como un objeto JSON.');
  }
  const resultado = esquema.safeParse(cuerpo);
  if (!resultado.success) {
    throw solicitudInvalida('Revise los datos de la persona.', camposDeErrorZod(resultado.error));
  }
  return resultado.data;
}

export interface PersonaNuevaValida {
  nombre: string;
  /** Recortado y en minúsculas. */
  correo: string;
  esLider: boolean;
}

/** POST /api/crm/lider/personas */
export function validarPersonaNueva(cuerpo: unknown): PersonaNuevaValida {
  const datos = validarObjeto(esquemaNuevaPersona, cuerpo);
  return { nombre: datos.nombre, correo: datos.correo, esLider: datos.esLider ?? false };
}

/** Cambios de PATCH /api/crm/lider/personas/:id: lo que no vino queda fuera. */
export interface CambiosPersonaValidos {
  nombre?: string;
  correo?: string;
  activo?: boolean;
  orden?: number;
  puedeCrearTareas?: boolean;
}

/** PATCH /api/crm/lider/personas/:id (al menos un campo). */
export function validarCambiosPersona(cuerpo: unknown): CambiosPersonaValidos {
  const datos = validarObjeto(esquemaEdicionPersona, cuerpo);
  const cambios: CambiosPersonaValidos = {};
  if (datos.nombre !== undefined) cambios.nombre = datos.nombre;
  if (datos.correo !== undefined) cambios.correo = datos.correo;
  if (datos.activo !== undefined) cambios.activo = datos.activo;
  if (datos.orden !== undefined) cambios.orden = datos.orden;
  if (datos.puedeCrearTareas !== undefined) cambios.puedeCrearTareas = datos.puedeCrearTareas;
  if (Object.keys(cambios).length === 0) {
    throw solicitudInvalida('Envíe al menos un cambio: nombre, correo, activo, orden o puedeCrearTareas.');
  }
  return cambios;
}

/** Id de persona válido: entero positivo que cabe en un INT. */
export function esIdPersona(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isSafeInteger(valor) && valor > 0 && valor <= MAX_ID;
}

/** Id de un parámetro de ruta (entero positivo, máximo 2147483647); si no, 404. */
export function idPersonaDeRuta(texto: string): number {
  if (!/^[1-9]\d{0,9}$/.test(texto)) throw noEncontrado(MENSAJE_PERSONA_NO_EXISTE);
  const id = Number(texto);
  if (id > MAX_ID) throw noEncontrado(MENSAJE_PERSONA_NO_EXISTE);
  return id;
}
