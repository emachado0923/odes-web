import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { noAutenticado } from '../../repositorio/errores-repositorio.js';
import type { SesionValida } from '../../repositorio/servicios/sesiones.js';
import { ServicioSesionesCrm, validarLider } from './servicio-sesiones-crm.js';

/** Dónde deja la guardia la sesión validada, dentro de la petición. */
const CLAVE_SESION = Symbol('sesionLiderCrm');

type PeticionConSesion = Request & { [CLAVE_SESION]?: SesionValida };

/**
 * Guardia de las rutas /api/crm/lider/*: sesión del líder (401) y, en las que
 * cambian algo, mismo sitio + X-CSRF-Token (403). Como las guardias corren
 * antes que los interceptores, en una subida multipart nadie sin sesión llega
 * a que multer escriba el archivo en la carpeta temporal.
 *
 *   @UseGuards(GuardiaLiderCrm)
 *   metodo(@SesionLider() sesion: SesionValida) { … }
 */
@Injectable()
export class GuardiaLiderCrm implements CanActivate {
  constructor(@Inject(ServicioSesionesCrm) private readonly sesiones: ServicioSesionesCrm) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<PeticionConSesion>();
    req[CLAVE_SESION] = await validarLider(req, this.sesiones);
    return true;
  }
}

/** La sesión que validó GuardiaLiderCrm (401 si la ruta no tenía la guardia). */
export const SesionLider = createParamDecorator((_dato: unknown, contexto: ExecutionContext): SesionValida => {
  const sesion = contexto.switchToHttp().getRequest<PeticionConSesion>()[CLAVE_SESION];
  if (!sesion) throw noAutenticado('Inicie sesión para continuar.');
  return sesion;
});
