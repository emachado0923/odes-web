import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  Req,
  Res,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import {
  COOKIE_SESION_PAI,
  RUTA_COOKIE_PAI,
  type SesionPai as RespuestaSesionPai,
} from '../api-pai.js';
import type { SesionValidaPai } from '../compartido/tipos-servidor.js';
import { ErrorPaiHttp, prohibido, solicitudInvalida } from '../errores-pai.js';
import { FiltroErroresPai } from '../http/filtro-errores-pai.js';
import { SinCacheInterceptor } from '../../repositorio/http/interceptores.js';
import {
  esMismoSitio,
  ipCliente,
  leerCookie,
} from '../../repositorio/http/peticion.js';
import {
  GuardiaPai,
  PermiteContrasenaTemporal,
  SesionPai,
  validarPeticionPai,
} from './guardia-pai.js';
import { ServicioSesionesPai } from './servicio-sesiones-pai.js';

/**
 * Sesión del PAI (cookie pai_sesion: HttpOnly, SameSite=Strict, Secure según
 * ServicioSesionesPai.cookieSegura, Path=/api/pai):
 *   POST   /api/pai/sesion             <- CredencialesPai -> SesionPai + cookie
 *          (rechaza otro sitio con 403 y cuerpos que no son JSON con 400)
 *   GET    /api/pai/sesion             -> SesionPai | 401
 *   DELETE /api/pai/sesion             -> 204 (sin sesión, 204 igual; con sesión exige CSRF)
 *   PUT    /api/pai/sesion/contrasena  <- CambioContrasenaPai -> SesionPai
 * GET, DELETE y PUT contrasena funcionan con una contraseña temporal sin
 * cambiar (@PermiteContrasenaTemporal); el resto de la API responde 403
 * `cambio_contrasena_requerido` hasta que se cambie.
 */
@Controller('pai/sesion')
@UseFilters(FiltroErroresPai)
@UseInterceptors(SinCacheInterceptor)
export class PaiSesionController {
  constructor(
    @Inject(ServicioSesionesPai) private readonly sesiones: ServicioSesionesPai,
  ) {}

  private opcionesCookie(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.sesiones.cookieSegura,
      path: RUTA_COOKIE_PAI,
    };
  }

  @Post()
  @HttpCode(200)
  async iniciar(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() cuerpo: unknown,
  ): Promise<RespuestaSesionPai> {
    // Sin esto, un formulario de otro sitio podría iniciar sesión en la
    // cuenta del atacante en el navegador de la víctima (login CSRF).
    if (!esMismoSitio(req))
      throw prohibido('Solicitud de otro sitio rechazada.');
    if (!req.is('application/json')) {
      throw solicitudInvalida('Envíe { usuario, contrasena } como JSON.');
    }
    const inicio = await this.sesiones.iniciar(cuerpo, {
      ip: ipCliente(req),
      agente: req.get('user-agent') ?? null,
      tokenAnterior: leerCookie(req.headers.cookie, COOKIE_SESION_PAI),
    });
    res.cookie(COOKIE_SESION_PAI, inicio.token, {
      ...this.opcionesCookie(),
      maxAge: inicio.duracionMs,
    });
    return inicio.sesion;
  }

  @Get()
  @UseGuards(GuardiaPai)
  @PermiteContrasenaTemporal()
  obtener(@SesionPai() sesion: SesionValidaPai): RespuestaSesionPai {
    return this.sesiones.aSesionPai(sesion);
  }

  /**
   * Sin sesión válida responde 204 igual (y borra la cookie). Con sesión,
   * exige el token CSRF como cualquier otra escritura (también con una
   * contraseña temporal).
   */
  @Delete()
  @HttpCode(204)
  async cerrar(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    let sesion: SesionValidaPai | null = null;
    try {
      sesion = await validarPeticionPai(req, this.sesiones, {
        permiteContrasenaTemporal: true,
      });
    } catch (error) {
      const sinSesion =
        error instanceof ErrorPaiHttp && error.codigo === 'no_autenticado';
      if (!sinSesion) throw error;
    }
    if (sesion) await this.sesiones.cerrar(sesion);
    res.clearCookie(COOKIE_SESION_PAI, this.opcionesCookie());
  }

  @Put('contrasena')
  @UseGuards(GuardiaPai)
  @PermiteContrasenaTemporal()
  cambiarContrasena(
    @Req() req: Request,
    @SesionPai() sesion: SesionValidaPai,
    @Body() cuerpo: unknown,
  ): Promise<RespuestaSesionPai> {
    return this.sesiones.cambiarContrasena(sesion, cuerpo, {
      ip: ipCliente(req),
    });
  }
}
