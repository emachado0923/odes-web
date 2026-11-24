import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type { Conexion } from '../../repositorio/bd/conexion.js';
import {
  CONFIGURACION_REPOSITORIO,
  type ConfiguracionRepositorio,
} from '../../repositorio/configuracion-repositorio.js';
import { validarPeticionAdmin } from '../../repositorio/guardia-admin.js';
import type { registrarCambio } from '../../repositorio/servicios/cambios.js';
import {
  ServicioSesiones,
  type SesionValida,
  type TablasSesiones,
} from '../../repositorio/servicios/sesiones.js';

/**
 * Sesión del líder del CRM (/crm/lider). Es el mismo inicio de sesión de la
 * administración del repositorio y de los tableros (ServicioSesiones:
 * scrypt, token de 256 bits en cookie HttpOnly con solo su sha256 en la base,
 * CSRF, vencimiento por inactividad y absoluto, bloqueo tras 5 fallos del
 * usuario o 20 de la IP en 15 minutos), con sus propias tablas (migración 010).
 *
 * El líder entra solo con la contraseña: hay una única cuenta, de usuario fijo
 * USUARIO_LIDER_CRM, que se crea con `npm run crm:clave-lider`.
 */

/** Cookie de la sesión del líder; viaja a /api/crm (también a las rutas del equipo, que la ignoran). */
export const COOKIE_SESION_CRM = 'crm_sesion';
export const RUTA_COOKIE_CRM = '/api/crm';
/** Usuario fijo de la única cuenta del CRM (el líder escribe solo la contraseña). */
export const USUARIO_LIDER_CRM = 'lider';

export const TABLAS_SESIONES_CRM: TablasSesiones = {
  usuarios: 'crm_acceso_usuarios',
  sesiones: 'crm_acceso_sesiones',
  intentos: 'crm_acceso_intentos',
};

@Injectable()
export class ServicioSesionesCrm extends ServicioSesiones {
  protected override readonly tablas: TablasSesiones = TABLAS_SESIONES_CRM;
  private readonly bitacora = new Logger('CRM');

  constructor(
    @Inject(BaseDatosRepositorio) bd: BaseDatosRepositorio,
    @Inject(CONFIGURACION_REPOSITORIO) config: ConfiguracionRepositorio,
  ) {
    super(bd, config);
  }

  /** Los inicios y cierres de sesión del líder quedan en el log del servidor, sin contraseñas. */
  protected override async registrar(_conexion: Conexion, entrada: Parameters<typeof registrarCambio>[1]): Promise<void> {
    this.bitacora.log(`${entrada.usuario}: ${entrada.detalle ?? entrada.accion}`);
  }
}

/**
 * Sesión del líder de una petición: 401 `no_autenticado` sin sesión válida y,
 * si la petición cambia algo, 403 `prohibido` si viene de otro sitio o sin el
 * X-CSRF-Token correcto. Úsese al principio de cada ruta /api/crm/lider/*.
 */
export function validarLider(req: Request, sesiones: ServicioSesionesCrm): Promise<SesionValida> {
  return validarPeticionAdmin(req, sesiones, COOKIE_SESION_CRM);
}
