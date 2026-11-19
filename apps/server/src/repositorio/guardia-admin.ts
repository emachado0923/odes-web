import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { CABECERA_CSRF, COOKIE_SESION } from './api-repositorio.js';
import { noAutenticado, prohibido } from './errores-repositorio.js';
import { esMismoSitio, esMutacion, leerCookie } from './http/peticion.js';
import {
  igualesSeguro,
  type SesionValida,
  ServicioSesiones,
} from './servicios/sesiones.js';

/** Propiedad de la petición donde la guardia deja la sesión validada. */
const CLAVE_SESION = Symbol('sesionRepositorio');

type PeticionConSesion = Request & { [CLAVE_SESION]?: SesionValida };

/**
 * Guardia de la administración del repositorio, reutilizable por otros
 * módulos (importe RepositorioProductosModule y use
 * `@UseGuards(GuardiaAdminRepositorio)`).
 *
 * - Toda petición: cookie `repositorio_sesion` válida; si no, 401.
 * - POST/PUT/PATCH/DELETE: además, que venga de este mismo sitio
 *   (Sec-Fetch-Site / Origin) y la cabecera X-CSRF-Token igual al csrf de la
 *   sesión; si no, 403.
 * - Base no disponible: 503.
 *
 * OJO: la cookie tiene Path=/api/repositorio/admin, así que el navegador
 * solo la envía a rutas bajo ese prefijo. Un endpoint de otro módulo que use
 * esta guardia debe vivir bajo /api/repositorio/admin/... (p. ej.
 * /api/repositorio/admin/odes/reindexar).
 */
@Injectable()
export class GuardiaAdminRepositorio implements CanActivate {
  constructor(
    @Inject(ServicioSesiones) private readonly sesiones: ServicioSesiones,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<PeticionConSesion>();
    req[CLAVE_SESION] = await validarPeticionAdmin(req, this.sesiones);
    return true;
  }
}

/**
 * Valida la sesión y, si la petición cambia algo, el origen y el token CSRF.
 * Lanza 401/403/503; devuelve la sesión. `cookie` es la de la sesión (otro
 * acceso con su propio ServicioSesiones, como los tableros de SIVU, pasa la suya).
 */
export async function validarPeticionAdmin(
  req: Request,
  sesiones: ServicioSesiones,
  cookie: string = COOKIE_SESION,
): Promise<SesionValida> {
  const sesion = await sesiones.validar(leerCookie(req.headers.cookie, cookie));
  if (!sesion) {
    throw noAutenticado('La sesión no existe o venció. Inicie sesión de nuevo.');
  }
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
  return sesion;
}

/** Sesión validada por GuardiaAdminRepositorio (en un parámetro del controlador). */
export const SesionRepositorio = createParamDecorator(
  (_dato: unknown, contexto: ExecutionContext): SesionValida => {
    const req = contexto.switchToHttp().getRequest<PeticionConSesion>();
    const sesion = req[CLAVE_SESION];
    if (!sesion) {
      throw new Error('SesionRepositorio requiere @UseGuards(GuardiaAdminRepositorio).');
    }
    return sesion;
  },
);

/** Sesión de la petición, si pasó por la guardia (para usar fuera de los parámetros). */
export function sesionDePeticion(req: Request): SesionValida | undefined {
  return (req as PeticionConSesion)[CLAVE_SESION];
}
