import { Body, Controller, Delete, Get, HttpCode, Inject, Post, Req, Res, UseFilters, UseInterceptors } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import {
  ErrorRepositorioHttp,
  noAutenticado,
  prohibido,
  solicitudInvalida,
} from '../../repositorio/errores-repositorio.js';
import { FiltroErroresRepositorio } from '../../repositorio/http/filtro-errores.js';
import { SinCacheInterceptor } from '../../repositorio/http/interceptores.js';
import { esMismoSitio, ipCliente, leerCookie } from '../../repositorio/http/peticion.js';
import type { SesionValida } from '../../repositorio/servicios/sesiones.js';
import type { SesionLiderCrm } from '../api-crm.js';
import {
  COOKIE_SESION_CRM,
  RUTA_COOKIE_CRM,
  ServicioSesionesCrm,
  USUARIO_LIDER_CRM,
  validarLider,
} from './servicio-sesiones-crm.js';

/**
 * Sesión del líder del CRM (solo contraseña):
 *   POST   /api/crm/lider/sesion  <- { contrasena } -> SesionLiderCrm + cookie
 *   GET    /api/crm/lider/sesion  -> SesionLiderCrm | 401
 *   DELETE /api/crm/lider/sesion  -> 204 (borra la sesión y la cookie)
 */
@Controller('crm/lider/sesion')
@UseFilters(FiltroErroresRepositorio)
@UseInterceptors(SinCacheInterceptor)
export class SesionLiderCrmController {
  constructor(@Inject(ServicioSesionesCrm) private readonly sesiones: ServicioSesionesCrm) {}

  private opcionesCookie(): CookieOptions {
    return { httpOnly: true, sameSite: 'strict', secure: this.sesiones.cookieSegura, path: RUTA_COOKIE_CRM };
  }

  private aSesionLider(sesion: SesionValida): SesionLiderCrm {
    const admin = this.sesiones.aSesionAdmin(sesion);
    return { nombre: admin.nombre ?? 'Líder', csrf: admin.csrf, expira: admin.expira };
  }

  @Post()
  @HttpCode(200)
  async iniciar(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() cuerpo: unknown,
  ): Promise<SesionLiderCrm> {
    // Sin esto, un formulario de otro sitio podría iniciar sesión (login CSRF).
    if (!esMismoSitio(req)) throw prohibido('Solicitud de otro sitio rechazada.');
    if (!req.is('application/json')) throw solicitudInvalida('Envíe { contrasena } como JSON.');
    const contrasena =
      cuerpo && typeof cuerpo === 'object' ? (cuerpo as { contrasena?: unknown }).contrasena : undefined;
    if (typeof contrasena !== 'string' || contrasena.length === 0 || contrasena.length > 1024) {
      throw solicitudInvalida('Escriba la contraseña.', { contrasena: 'Escriba la contraseña.' });
    }
    try {
      const inicio = await this.sesiones.iniciar(
        { usuario: USUARIO_LIDER_CRM, contrasena },
        {
          ip: ipCliente(req),
          agente: req.get('user-agent') ?? null,
          tokenAnterior: leerCookie(req.headers.cookie, COOKIE_SESION_CRM),
        },
      );
      res.cookie(COOKIE_SESION_CRM, inicio.token, { ...this.opcionesCookie(), maxAge: inicio.duracionMs });
      return {
        nombre: inicio.sesion.nombre ?? 'Líder',
        csrf: inicio.sesion.csrf,
        expira: inicio.sesion.expira,
      };
    } catch (error) {
      // Hay una sola cuenta: el mensaje habla solo de la contraseña.
      if (error instanceof ErrorRepositorioHttp && error.codigo === 'no_autenticado') {
        throw noAutenticado('Contraseña incorrecta.');
      }
      throw error;
    }
  }

  @Get()
  async obtener(@Req() req: Request): Promise<SesionLiderCrm> {
    return this.aSesionLider(await validarLider(req, this.sesiones));
  }

  /** Sin sesión válida responde 204 igual (y borra la cookie). Con sesión, exige el token CSRF. */
  @Delete()
  @HttpCode(204)
  async cerrar(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    let sesion: SesionValida | null = null;
    try {
      sesion = await validarLider(req, this.sesiones);
    } catch (error) {
      if (!(error instanceof ErrorRepositorioHttp && error.codigo === 'no_autenticado')) throw error;
    }
    if (sesion) await this.sesiones.cerrar(sesion);
    res.clearCookie(COOKIE_SESION_CRM, this.opcionesCookie());
  }
}
