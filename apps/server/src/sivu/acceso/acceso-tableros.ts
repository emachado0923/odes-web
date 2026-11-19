import { Inject, Injectable, Logger } from '@nestjs/common';
import { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type { Conexion } from '../../repositorio/bd/conexion.js';
import {
  CONFIGURACION_REPOSITORIO,
  type ConfiguracionRepositorio,
} from '../../repositorio/configuracion-repositorio.js';
import type { registrarCambio } from '../../repositorio/servicios/cambios.js';
import { ServicioSesiones, type TablasSesiones } from '../../repositorio/servicios/sesiones.js';

/**
 * Acceso a los tableros privados de SIVU (hoy, /tableros/fondos-2026).
 *
 * Es el mismo inicio de sesión de la administración del repositorio
 * (ServicioSesiones: contraseñas con scrypt, token de 256 bits en una cookie
 * HttpOnly con solo su sha256 en la base, CSRF, vencimiento por inactividad y
 * absoluto, y bloqueo tras 5 fallos por usuario o 20 por IP en 15 minutos),
 * pero con sus propias cuentas y sesiones (migración 008): una cuenta de
 * tableros no entra a la administración ni al PAI.
 *
 *   POST   /api/sivu/sesion   <- { usuario, contrasena } -> sesión + cookie
 *   GET    /api/sivu/sesion   -> sesión | 401
 *   DELETE /api/sivu/sesion   -> 204
 */

/** Cookie de la sesión de los tableros; viaja solo a /api/sivu. */
export const COOKIE_SESION_TABLEROS = 'sivu_sesion';
export const RUTA_COOKIE_TABLEROS = '/api/sivu';

const TABLAS_SESIONES_TABLEROS: TablasSesiones = {
  usuarios: 'sivu_acceso_usuarios',
  sesiones: 'sivu_acceso_sesiones',
  intentos: 'sivu_acceso_intentos',
};

@Injectable()
export class ServicioSesionesTableros extends ServicioSesiones {
  protected override readonly tablas: TablasSesiones = TABLAS_SESIONES_TABLEROS;
  private readonly bitacora = new Logger('Tableros');

  constructor(
    @Inject(BaseDatosRepositorio) bd: BaseDatosRepositorio,
    @Inject(CONFIGURACION_REPOSITORIO) config: ConfiguracionRepositorio,
  ) {
    super(bd, config);
  }

  /**
   * Los inicios y cierres de sesión de los tableros no van al registro de
   * cambios del repositorio (ese es de la administración): quedan en el log
   * del servidor, sin contraseñas.
   */
  protected override async registrar(_conexion: Conexion, entrada: Parameters<typeof registrarCambio>[1]): Promise<void> {
    this.bitacora.log(`${entrada.usuario}: ${entrada.detalle ?? entrada.accion}`);
  }
}
