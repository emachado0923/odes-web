import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { CABECERA_CSRF, COOKIE_SESION_PAI } from '../api-pai.js';
import type { SesionValidaPai } from '../compartido/tipos-servidor.js';
import {
  cambioContrasenaRequerido,
  noAutenticado,
  prohibido,
} from '../errores-pai.js';
import {
  esMismoSitio,
  esMutacion,
  leerCookie,
} from '../../repositorio/http/peticion.js';
import { igualesSeguro } from '../../repositorio/servicios/sesiones.js';
import {
  MENSAJE_SESION_VENCIDA,
  ServicioSesionesPai,
} from './servicio-sesiones-pai.js';

/**
 * Guardias de la API del PAI. Uso en un controlador:
 *
 *   @UseGuards(GuardiaPai)               sesión válida (ambos roles)
 *   @UseGuards(GuardiaAdministradorPai)  sesión válida + rol administrador
 *                                        (no hace falta poner también GuardiaPai)
 *   @SesionPai() sesion: SesionValidaPai la sesión en un parámetro
 *
 * Las dos guardias, en este orden:
 * 1. leen la cookie pai_sesion (leerCookie de repositorio/http/peticion.ts) y
 *    validan la sesión (401 si no hay o venció; 503 si la base no está);
 * 2. en POST/PUT/PATCH/DELETE exigen mismo sitio (esMismoSitio) y X-CSRF-Token
 *    igual al csrf de la sesión (igualesSeguro); si no, 403 `prohibido`;
 * 3. con debeCambiarContrasena, solo dejan pasar los manejadores marcados con
 *    @PermiteContrasenaTemporal() (los de /sesion); los demás responden 403
 *    `cambio_contrasena_requerido`, así que TODO controlador del PAI que use
 *    una de estas guardias queda cerrado hasta que se cambie la contraseña;
 * 4. GuardiaAdministradorPai responde 403 `prohibido` a un responsable;
 * 5. dejan la sesión en la petición (guardarSesionEnPeticion) para @SesionPai().
 * El rol y el estado de la cuenta se leen de pai_usuarios en cada petición:
 * un cambio de rol o una desactivación rigen de inmediato.
 */

/** Propiedad de la petición donde la guardia deja la sesión validada. */
const CLAVE_SESION = Symbol('sesionPai');

type PeticionConSesion = Request & { [CLAVE_SESION]?: SesionValidaPai };

/** Metadato de @PermiteContrasenaTemporal(). */
export const PERMITE_CONTRASENA_TEMPORAL = 'pai:permiteContrasenaTemporal';

/**
 * Marca un manejador (o un controlador) como usable con una contraseña
 * temporal sin cambiar: GET /sesion, PUT /sesion/contrasena.
 */
export const PermiteContrasenaTemporal = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMITE_CONTRASENA_TEMPORAL, true);

export interface OpcionesValidacionPai {
  /** Deja pasar una sesión con contraseña temporal (por defecto, false). */
  permiteContrasenaTemporal?: boolean;
  /** Exige rol administrador (por defecto, false). */
  soloAdministrador?: boolean;
}

export const MENSAJE_SOLO_ADMINISTRADOR =
  'Solo el administrador del PAI (Planeación) puede hacer esto.';

/**
 * Valida la sesión de la petición y, si cambia algo, el origen y el CSRF.
 * Lanza 401/403/503; devuelve la sesión. (La usan las guardias y DELETE
 * /sesion, que responde 204 aunque no haya sesión.)
 */
export async function validarPeticionPai(
  req: Request,
  sesiones: ServicioSesionesPai,
  opciones: OpcionesValidacionPai = {},
): Promise<SesionValidaPai> {
  const sesion = await sesiones.validar(
    leerCookie(req.headers.cookie, COOKIE_SESION_PAI),
  );
  if (!sesion) throw noAutenticado(MENSAJE_SESION_VENCIDA);
  if (esMutacion(req.method)) {
    if (!esMismoSitio(req)) {
      throw prohibido('Solicitud de otro sitio rechazada.');
    }
    const csrf = req.get(CABECERA_CSRF);
    if (!csrf || !igualesSeguro(csrf, sesion.csrf)) {
      throw prohibido(
        'Falta el token de seguridad (X-CSRF-Token) o no es válido. Recargue la página.',
      );
    }
  }
  if (sesion.debeCambiarContrasena && !opciones.permiteContrasenaTemporal) {
    throw cambioContrasenaRequerido();
  }
  if (opciones.soloAdministrador && sesion.rol !== 'administrador') {
    throw prohibido(MENSAJE_SOLO_ADMINISTRADOR);
  }
  return sesion;
}

/** ¿El manejador o su controlador llevan @PermiteContrasenaTemporal()? */
function permiteContrasenaTemporal(
  reflector: Reflector,
  contexto: ExecutionContext,
): boolean {
  return (
    reflector.getAllAndOverride<boolean | undefined>(
      PERMITE_CONTRASENA_TEMPORAL,
      [contexto.getHandler(), contexto.getClass()],
    ) === true
  );
}

/** Sesión válida, de cualquiera de los dos roles. */
@Injectable()
export class GuardiaPai implements CanActivate {
  constructor(
    @Inject(ServicioSesionesPai)
    protected readonly sesiones: ServicioSesionesPai,
    @Inject(Reflector) protected readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<Request>();
    const sesion = await validarPeticionPai(req, this.sesiones, {
      permiteContrasenaTemporal: permiteContrasenaTemporal(
        this.reflector,
        contexto,
      ),
    });
    guardarSesionEnPeticion(req, sesion);
    return true;
  }
}

/** Sesión válida con rol administrador (403 `prohibido` a un responsable). */
@Injectable()
export class GuardiaAdministradorPai implements CanActivate {
  constructor(
    @Inject(ServicioSesionesPai)
    protected readonly sesiones: ServicioSesionesPai,
    @Inject(Reflector) protected readonly reflector: Reflector,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<Request>();
    const sesion = await validarPeticionPai(req, this.sesiones, {
      permiteContrasenaTemporal: permiteContrasenaTemporal(
        this.reflector,
        contexto,
      ),
      soloAdministrador: true,
    });
    guardarSesionEnPeticion(req, sesion);
    return true;
  }
}

/** Deja la sesión validada en la petición (para @SesionPai y sesionPaiDePeticion). */
export function guardarSesionEnPeticion(
  req: Request,
  sesion: SesionValidaPai,
): void {
  (req as PeticionConSesion)[CLAVE_SESION] = sesion;
}

/** Sesión de la petición, si pasó por una guardia del PAI. */
export function sesionPaiDePeticion(req: Request): SesionValidaPai | undefined {
  return (req as PeticionConSesion)[CLAVE_SESION];
}

/**
 * Sesión validada por GuardiaPai / GuardiaAdministradorPai, en un parámetro
 * del controlador: `@SesionPai() sesion: SesionValidaPai`.
 *
 * Ojo: el tipo de la respuesta de /sesion del contrato también se llama
 * SesionPai (api-pai.ts). En un archivo que use los dos, importe el tipo con
 * otro nombre: `import type { SesionPai as RespuestaSesionPai } from '../api-pai.js'`.
 */
export const SesionPai = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): SesionValidaPai => {
    const req = contexto.switchToHttp().getRequest<Request>();
    const sesion = sesionPaiDePeticion(req);
    if (!sesion) {
      throw new Error(
        'SesionPai requiere @UseGuards(GuardiaPai) o @UseGuards(GuardiaAdministradorPai).',
      );
    }
    return sesion;
  },
);
