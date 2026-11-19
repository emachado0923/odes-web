import { z } from 'zod';
import type { CambioContrasenaPai, CredencialesPai } from '../api-pai.js';
import { camposDeErrorZod } from '../compartido/validacion-comun.js';
import { solicitudInvalida } from '../errores-pai.js';
import {
  MAX_LONGITUD_CONTRASENA,
  problemaContrasena,
} from '../../repositorio/dominio/contrasenas.js';

/**
 * Validación (zod) de lo que llega a /api/pai/sesion: credenciales del
 * inicio de sesión y cambio de la propia contraseña. Los errores salen como
 * 400 `solicitud_invalida` con `campos` (mensajes en español por campo).
 */

/** Largo máximo del usuario que se acepta al iniciar sesión (como el repositorio). */
export const MAX_USUARIO_CREDENCIALES = 64;

function esObjeto(cuerpo: unknown): cuerpo is Record<string, unknown> {
  return (
    typeof cuerpo === 'object' && cuerpo !== null && !Array.isArray(cuerpo)
  );
}

const esquemaCredenciales = z.object({
  usuario: z
    .string({ error: 'Escriba el usuario.' })
    .trim()
    .min(1, 'Escriba el usuario.')
    .max(MAX_USUARIO_CREDENCIALES, 'El usuario es demasiado largo.'),
  contrasena: z
    .string({ error: 'Escriba la contraseña.' })
    .min(1, 'Escriba la contraseña.')
    .max(MAX_LONGITUD_CONTRASENA, 'La contraseña es demasiado larga.'),
});

/**
 * { usuario, contrasena } del inicio de sesión. El usuario se pasa a
 * minúsculas; la contraseña no se toca (se normaliza al verificarla).
 */
export function validarCredencialesPai(cuerpo: unknown): CredencialesPai {
  const resultado = esquemaCredenciales.safeParse(
    esObjeto(cuerpo) ? cuerpo : {},
  );
  if (!resultado.success) {
    throw solicitudInvalida(
      'Escriba el usuario y la contraseña.',
      camposDeErrorZod(resultado.error),
    );
  }
  return {
    usuario: resultado.data.usuario.toLowerCase(),
    contrasena: resultado.data.contrasena,
  };
}

const esquemaCambio = z
  .object({
    actual: z
      .string({ error: 'Escriba su contraseña actual.' })
      .min(1, 'Escriba su contraseña actual.')
      .max(MAX_LONGITUD_CONTRASENA, 'La contraseña actual es demasiado larga.'),
    nueva: z
      .string({ error: 'Escriba la contraseña nueva.' })
      .superRefine((nueva, ctx) => {
        const problema = problemaContrasena(nueva);
        if (problema) ctx.addIssue({ code: 'custom', message: problema });
      }),
  })
  .superRefine((datos, ctx) => {
    if (datos.actual.normalize('NFC') === datos.nueva.normalize('NFC')) {
      ctx.addIssue({
        code: 'custom',
        path: ['nueva'],
        message: 'La contraseña nueva debe ser distinta de la actual.',
      });
    }
  });

/** { actual, nueva } de PUT /sesion/contrasena (la nueva con las reglas del repositorio). */
export function validarCambioContrasenaPai(
  cuerpo: unknown,
): CambioContrasenaPai {
  if (!esObjeto(cuerpo)) {
    throw solicitudInvalida('Envíe { actual, nueva } como un objeto JSON.');
  }
  const resultado = esquemaCambio.safeParse(cuerpo);
  if (!resultado.success) {
    throw solicitudInvalida(
      'Revise la contraseña.',
      camposDeErrorZod(resultado.error),
    );
  }
  return resultado.data;
}
