import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Req, Res, UseFilters, UseInterceptors } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import type { SesionAdmin } from '../../repositorio/api-repositorio.js';
import { ErrorRepositorioHttp, prohibido, solicitudInvalida } from '../../repositorio/errores-repositorio.js';
import { validarPeticionAdmin } from '../../repositorio/guardia-admin.js';
import { FiltroErroresRepositorio } from '../../repositorio/http/filtro-errores.js';
import { SinCacheInterceptor } from '../../repositorio/http/interceptores.js';
import { esMismoSitio, ipCliente, leerCookie } from '../../repositorio/http/peticion.js';
import type { SesionValida } from '../../repositorio/servicios/sesiones.js';
import { COOKIE_SESION_TABLEROS, RUTA_COOKIE_TABLEROS, ServicioSesionesTableros } from './acceso-tableros.js';

/**
 * Sesión de los tableros privados de SIVU (ver acceso-tableros.ts):
 *   POST   /api/sivu/sesion  <- { usuario, contrasena } -> sesión + cookie
 *   GET    /api/sivu/sesion  -> sesión | 401
 *   DELETE /api/sivu/sesion  -> 204 (borra la sesión y la cookie)
 */
@Controller('sivu/sesion')
@UseFilters(FiltroErroresRepositorio)
@UseInterceptors(SinCacheInterceptor)
export class SesionTablerosController {
  constructor(@Inject(ServicioSesionesTableros) private readonly sesiones: ServicioSesionesTableros) {}

  private opcionesCookie(): CookieOptions {
    return { httpOnly: true, sameSite: 'strict', secure: this.sesiones.cookieSegura, path: RUTA_COOKIE_TABLEROS };
  }

  @Post()
  @HttpCode(200)
  async iniciar(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() cuerpo: unknown): Promise<SesionAdmin> {
    // Sin esto, un formulario de otro sitio podría iniciar sesión en una cuenta ajena (login CSRF).
    if (!esMismoSitio(req)) throw prohibido('Solicitud de otro sitio rechazada.');
    if (!req.is('application/json')) throw solicitudInvalida('Envíe { usuario, contrasena } como JSON.');
    const inicio = await this.sesiones.iniciar(cuerpo, {
      ip: ipCliente(req),
      agente: req.get('user-agent') ?? null,
      tokenAnterior: leerCookie(req.headers.cookie, COOKIE_SESION_TABLEROS),
    });
    res.cookie(COOKIE_SESION_TABLEROS, inicio.token, { ...this.opcionesCookie(), maxAge: inicio.duracionMs });
    return inicio.sesion;
  }

  @Get()
  async obtener(@Req() req: Request): Promise<SesionAdmin> {
    return this.sesiones.aSesionAdmin(await validarPeticionAdmin(req, this.sesiones, COOKIE_SESION_TABLEROS));
  }

  /** Sin sesión válida responde 204 igual (y borra la cookie). Con sesión, exige el token CSRF. */
  @Delete()
  @HttpCode(204)
  async cerrar(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    let sesion: SesionValida | null = null;
    try {
      sesion = await validarPeticionAdmin(req, this.sesiones, COOKIE_SESION_TABLEROS);
    } catch (error) {
      if (!(error instanceof ErrorRepositorioHttp && error.codigo === 'no_autenticado')) throw error;
    }
    if (sesion) await this.sesiones.cerrar(sesion);
    res.clearCookie(COOKIE_SESION_TABLEROS, this.opcionesCookie());
  }
}
