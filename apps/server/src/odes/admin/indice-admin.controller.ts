import {
  Controller,
  Get,
  Header,
  HttpCode,
  Inject,
  Post,
  Res,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  GuardiaAdminRepositorio,
  SesionRepositorio,
} from '../../repositorio/guardia-admin.js';
import { FiltroErroresRepositorio } from '../../repositorio/http/filtro-errores.js';
import type { SesionValida } from '../../repositorio/servicios/sesiones.js';
import type { EstadoIndiceAdmin } from '../chat/protocolo.js';
import { ServicioIndiceOdes } from './servicio-indice.js';

/** Ruta del estado (también va en la cabecera Location del 202). */
export const RUTA_ESTADO_INDICE = '/api/repositorio/admin/odes/indice';

/**
 * Administración del índice del Asistente ODES, desde /repositorio/admin.
 *
 *   GET  /api/repositorio/admin/odes/indice     -> EstadoIndiceAdmin
 *   POST /api/repositorio/admin/odes/reindexar  -> 202 EstadoIndiceAdmin (409 si ya hay una)
 *
 * Vive bajo /api/repositorio/admin (y no bajo /api/odes) porque la cookie de
 * la sesión de administración tiene Path=/api/repositorio/admin: el
 * navegador no la enviaría a otra ruta. La guardia del repositorio exige la
 * sesión (401), y en el POST el token CSRF y el mismo sitio (403). Los
 * errores salen como el resto de la administración: JSON { codigo, mensaje }.
 */
@Controller('repositorio/admin/odes')
@UseGuards(GuardiaAdminRepositorio)
@UseFilters(FiltroErroresRepositorio)
export class IndiceOdesAdminController {
  constructor(
    @Inject(ServicioIndiceOdes) private readonly servicio: ServicioIndiceOdes,
  ) {}

  @Get('indice')
  @Header('Cache-Control', 'no-store')
  estado(): Promise<EstadoIndiceAdmin> {
    return this.servicio.estado();
  }

  @Post('reindexar')
  @HttpCode(202)
  @Header('Cache-Control', 'no-store')
  reindexar(
    @SesionRepositorio() sesion: SesionValida,
    @Res({ passthrough: true }) res: Response,
  ): Promise<EstadoIndiceAdmin> {
    res.setHeader('Location', RUTA_ESTADO_INDICE);
    return this.servicio.reindexar(sesion.usuario);
  }
}
