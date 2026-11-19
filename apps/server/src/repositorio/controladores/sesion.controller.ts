import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import {
  COOKIE_SESION,
  RUTA_API_REPOSITORIO,
  type SesionAdmin,
} from '../api-repositorio.js';
import {
  ErrorRepositorioHttp,
  prohibido,
  solicitudInvalida,
} from '../errores-repositorio.js';
import {
  GuardiaAdminRepositorio,
  SesionRepositorio,
  validarPeticionAdmin,
} from '../guardia-admin.js';
import { FiltroErroresRepositorio } from '../http/filtro-errores.js';
import { SinCacheInterceptor } from '../http/interceptores.js';
import { esMismoSitio, ipCliente, leerCookie } from '../http/peticion.js';
import { type SesionValida, ServicioSesiones } from '../servicios/sesiones.js';

/** La cookie solo viaja a la API de administración. */
export const RUTA_COOKIE = `${RUTA_API_REPOSITORIO}/admin`;

/**
 * Sesión de la administración:
 *   POST   /api/repositorio/admin/sesion  <- { usuario, contrasena } -> SesionAdmin + cookie
 *   GET    /api/repositorio/admin/sesion  -> SesionAdmin | 401
 *   DELETE /api/repositorio/admin/sesion  -> 204 (borra la sesión y la cookie)
 */
@Controller('repositorio/admin/sesion')
@UseFilters(FiltroErroresRepositorio)
@UseInterceptors(SinCacheInterceptor)
export class RepositorioSesionController {
  constructor(
    @Inject(ServicioSesiones) private readonly sesiones: ServicioSesiones,
  ) {}

  private opcionesCookie(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.sesiones.cookieSegura,
      path: RUTA_COOKIE,
    };
  }

  @Post()
  @HttpCode(200)
  async iniciar(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() cuerpo: unknown,
  ): Promise<SesionAdmin> {
    // Sin esto, un formulario de otro sitio podría iniciar sesión en la
    // cuenta del atacante en el navegador de la víctima (login CSRF).
    if (!esMismoSitio(req)) throw prohibido('Solicitud de otro sitio rechazada.');
    if (!req.is('application/json')) {
      throw solicitudInvalida('Envíe { usuario, contrasena } como JSON.');
    }
    const inicio = await this.sesiones.iniciar(cuerpo, {
      ip: ipCliente(req),
      agente: req.get('user-agent') ?? null,
      tokenAnterior: leerCookie(req.headers.cookie, COOKIE_SESION),
    });
    res.cookie(COOKIE_SESION, inicio.token, {
      ...this.opcionesCookie(),
      maxAge: inicio.duracionMs,
    });
    return inicio.sesion;
  }

  @Get()
  @UseGuards(GuardiaAdminRepositorio)
  obtener(@SesionRepositorio() sesion: SesionValida): SesionAdmin {
    return this.sesiones.aSesionAdmin(sesion);
  }

  /**
   * Sin sesión válida responde 204 igual (y borra la cookie). Con sesión,
   * exige el token CSRF como cualquier otra escritura.
   */
  @Delete()
  @HttpCode(204)
  async cerrar(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    let sesion: SesionValida | null = null;
    try {
      sesion = await validarPeticionAdmin(req, this.sesiones);
    } catch (error) {
      const sinSesion =
        error instanceof ErrorRepositorioHttp && error.codigo === 'no_autenticado';
      if (!sinSesion) throw error;
    }
    if (sesion) await this.sesiones.cerrar(sesion);
    res.clearCookie(COOKIE_SESION, this.opcionesCookie());
  }
}
