import { Controller, Get, HttpCode, Inject, Param, Post, Query, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import type { CorreoCrm } from '../api-crm.js';
import { ServicioCorreoCrm } from '../correo/servicio-correo-crm.js';
import { GuardiaLiderCrm } from '../sesion/guardia-lider.js';
import { FiltroErroresRepositorio } from '../../repositorio/http/filtro-errores.js';
import { SinCacheInterceptor } from '../../repositorio/http/interceptores.js';
import { estadoCorreoDeConsulta, idDeRuta, NO_EXISTE_CORREO } from './validacion-tareas.js';

/**
 * Bandeja de correos del líder (GuardiaLiderCrm):
 *
 *   GET  /api/crm/lider/correos?estado=<EstadoCorreo>  -> CorreoCrm[] (los 200 más recientes)
 *   POST /api/crm/lider/correos/:id/reintentar         -> CorreoCrm
 */
@Controller('crm/lider/correos')
@UseGuards(GuardiaLiderCrm)
@UseFilters(FiltroErroresRepositorio)
@UseInterceptors(SinCacheInterceptor)
export class CorreosLiderCrmController {
  constructor(@Inject(ServicioCorreoCrm) private readonly correo: ServicioCorreoCrm) {}

  @Get()
  listar(@Query('estado') estado: unknown): Promise<CorreoCrm[]> {
    const filtro = estadoCorreoDeConsulta(estado);
    return this.correo.listar(filtro === undefined ? {} : { estado: filtro });
  }

  @Post(':id/reintentar')
  @HttpCode(200)
  reintentar(@Param('id') id: string): Promise<CorreoCrm> {
    return this.correo.reintentar(idDeRuta(id, NO_EXISTE_CORREO));
  }
}
