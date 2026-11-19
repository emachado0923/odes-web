import { z } from 'zod';
import {
  type AsignacionesPai,
  LIMITES_PAI,
  PATRON_USUARIO_PAI,
  ROLES_PAI,
  type RolPai,
} from '../api-pai.js';
import { largo, validarCuerpo } from '../compartido/validacion-comun.js';
import { problemaContrasena } from '../../repositorio/dominio/contrasenas.js';
import { textoLinea } from '../../repositorio/dominio/normalizacion.js';

/**
 * Validación (zod) de la administración de usuarios del PAI:
 * POST /admin/usuarios, PATCH /admin/usuarios/:id y
 * PUT /admin/usuarios/:id/asignaciones. Los errores salen como 400
 * `solicitud_invalida` con `campos` (validarCuerpo).
 */

/** Correo: sin espacios, una @ y un dominio con punto (sin pretender validar el RFC 5322). */
export const PATRON_CORREO = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

/** Máximo de ids por lista de asignaciones (los 27 procesos y 344 indicadores caben de sobra). */
export const MAX_ASIGNACIONES = 5_000;

export const MENSAJE_USUARIO_INVALIDO =
  'El usuario debe tener de 3 a 64 caracteres: minúsculas, números, punto, guion o guion bajo (empieza por letra o número).';

const esquemaUsuario = z
  .string({ error: 'Escriba el usuario.' })
  .transform((valor) => valor.trim().toLowerCase())
  .refine((valor) => PATRON_USUARIO_PAI.test(valor), MENSAJE_USUARIO_INVALIDO);

const esquemaNombre = z
  .string({ error: 'Escriba el nombre.' })
  .transform(textoLinea)
  .refine((valor) => valor.length > 0, 'Escriba el nombre.')
  .refine(
    (valor) => largo(valor) <= LIMITES_PAI.maxNombreUsuario,
    `El nombre: máximo ${LIMITES_PAI.maxNombreUsuario} caracteres.`,
  );

/**
 * Texto opcional de una línea: undefined si no vino (no cambia), null si
 * vino null o vacío (borra).
 */
function textoOpcional(nombre: string, maximo: number) {
  return z
    .union([z.string(), z.null()], { error: `${nombre} debe ser texto.` })
    .optional()
    .transform((valor) => {
      if (valor === undefined) return undefined;
      if (valor === null) return null;
      return textoLinea(valor) || null;
    })
    .refine(
      (valor) =>
        valor === undefined || valor === null || largo(valor) <= maximo,
      `${nombre}: máximo ${maximo} caracteres.`,
    );
}

const esquemaCorreo = textoOpcional('El correo', LIMITES_PAI.maxCorreo).refine(
  (valor) => valor === undefined || valor === null || PATRON_CORREO.test(valor),
  'Escriba un correo válido (por ejemplo, nombre@sapiencia.gov.co).',
);

const esquemaCargo = textoOpcional('El cargo', LIMITES_PAI.maxCargo);

const esquemaRol = z.enum(ROLES_PAI as [RolPai, ...RolPai[]], {
  error: 'Elija el rol: responsable o administrador.',
});

const esquemaContrasenaTemporal = z
  .string({ error: 'Escriba la contraseña temporal.' })
  .superRefine((valor, ctx) => {
    const problema = problemaContrasena(valor);
    if (problema) ctx.addIssue({ code: 'custom', message: problema });
  });

export interface UsuarioNuevoValido {
  usuario: string;
  nombre: string;
  correo: string | null;
  cargo: string | null;
  rol: RolPai;
  contrasenaTemporal: string;
}

const esquemaUsuarioNuevo = z.object({
  usuario: esquemaUsuario,
  nombre: esquemaNombre,
  correo: esquemaCorreo,
  cargo: esquemaCargo,
  rol: esquemaRol,
  contrasenaTemporal: esquemaContrasenaTemporal,
});

/** POST /admin/usuarios */
export function validarUsuarioNuevoPai(cuerpo: unknown): UsuarioNuevoValido {
  const datos = validarCuerpo(
    esquemaUsuarioNuevo,
    cuerpo,
    'Revise los datos del usuario.',
  );
  return {
    usuario: datos.usuario,
    nombre: datos.nombre,
    correo: datos.correo ?? null,
    cargo: datos.cargo ?? null,
    rol: datos.rol,
    contrasenaTemporal: datos.contrasenaTemporal,
  };
}

/** Cambios de PATCH /admin/usuarios/:id: lo que no vino queda undefined. */
export interface CambiosUsuarioValidos {
  nombre?: string;
  correo?: string | null;
  cargo?: string | null;
  rol?: RolPai;
  activo?: boolean;
  contrasenaTemporal?: string;
}

const esquemaCambiosUsuario = z.object({
  nombre: esquemaNombre.optional(),
  correo: esquemaCorreo,
  cargo: esquemaCargo,
  rol: esquemaRol.optional(),
  activo: z.boolean({ error: 'Activo debe ser verdadero o falso.' }).optional(),
  contrasenaTemporal: esquemaContrasenaTemporal.optional(),
});

/** PATCH /admin/usuarios/:id (solo los campos que vinieron). */
export function validarCambiosUsuarioPai(
  cuerpo: unknown,
): CambiosUsuarioValidos {
  const datos = validarCuerpo(
    esquemaCambiosUsuario,
    cuerpo,
    'Revise los datos del usuario.',
  );
  const cambios: CambiosUsuarioValidos = {};
  if (datos.nombre !== undefined) cambios.nombre = datos.nombre;
  if (datos.correo !== undefined) cambios.correo = datos.correo;
  if (datos.cargo !== undefined) cambios.cargo = datos.cargo;
  if (datos.rol !== undefined) cambios.rol = datos.rol;
  if (datos.activo !== undefined) cambios.activo = datos.activo;
  if (datos.contrasenaTemporal !== undefined) {
    cambios.contrasenaTemporal = datos.contrasenaTemporal;
  }
  return cambios;
}

function listaIds(que: string) {
  return z
    .array(
      z
        .number({ error: `Cada ${que} debe ser un id numérico.` })
        .int(`Cada ${que} debe ser un id entero.`)
        .min(1, `Cada ${que} debe ser un id positivo.`)
        .max(2_147_483_647, `Id de ${que} fuera de rango.`),
      { error: `Envíe una lista de ids de ${que}s.` },
    )
    .max(MAX_ASIGNACIONES, `Máximo ${MAX_ASIGNACIONES} ${que}s.`)
    .transform((ids) => [...new Set(ids)].toSorted((a, b) => a - b));
}

const esquemaAsignaciones = z.object({
  procesos: listaIds('proceso'),
  indicadores: listaIds('indicador'),
});

/** PUT /admin/usuarios/:id/asignaciones: listas sin repetidos, en orden. */
export function validarAsignacionesPai(cuerpo: unknown): AsignacionesPai {
  return validarCuerpo(
    esquemaAsignaciones,
    cuerpo,
    'Revise los procesos e indicadores asignados.',
  );
}
