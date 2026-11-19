import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import type {
  AutorizacionPai,
  ListaAutorizacionesPai,
  PaginaRegistroPai,
  VigenciaPai,
} from '../api-pai.js';
import type { SesionValidaPai } from '../compartido/tipos-servidor.js';
import {
  idDeRuta,
  vigenciaDeConsulta,
} from '../compartido/validacion-comun.js';
import { FiltroErroresPai } from '../http/filtro-errores-pai.js';
import { contentDisposition } from '../../repositorio/http/cabeceras.js';
import { SinCacheInterceptor } from '../../repositorio/http/interceptores.js';
import { GuardiaAdministradorPai, SesionPai } from '../sesion/guardia-pai.js';
import { ServicioAutorizacionesPai } from '../servicios/servicio-autorizaciones.js';
import { ServicioExportacionPai } from '../servicios/servicio-exportacion.js';
import { ServicioRegistroPai } from '../servicios/servicio-registro.js';
import { ServicioVigenciaPai } from '../servicios/servicio-vigencia.js';

/**
 * Administración del dominio (solo el administrador):
 *   PUT    /api/pai/admin/vigencia[?vigencia=]   <- DatosVigenciaPai -> VigenciaPai
 *   GET    /api/pai/admin/autorizaciones         -> ListaAutorizacionesPai
 *   POST   /api/pai/admin/autorizaciones         <- DatosAutorizacionPai -> 201 AutorizacionPai
 *   DELETE /api/pai/admin/autorizaciones/:id     -> AutorizacionPai (revocada)
 *   GET    /api/pai/admin/registro               -> PaginaRegistroPai
 *   GET    /api/pai/admin/exportar.csv           -> text/csv (attachment)
 */
@Controller('pai/admin/vigencia')
@UseGuards(GuardiaAdministradorPai)
@UseFilters(FiltroErroresPai)
@UseInterceptors(SinCacheInterceptor)
export class PaiVigenciaAdminController {
  constructor(
    @Inject(ServicioVigenciaPai)
    private readonly vigencias: ServicioVigenciaPai,
  ) {}

  @Put()
  actualizar(
    @SesionPai() sesion: SesionValidaPai,
    @Body() cuerpo: unknown,
    @Query('vigencia') vigencia: unknown,
  ): Promise<VigenciaPai> {
    return this.vigencias.actualizar(
      sesion,
      cuerpo,
      vigenciaDeConsulta(vigencia),
    );
  }
}

@Controller('pai/admin/autorizaciones')
@UseGuards(GuardiaAdministradorPai)
@UseFilters(FiltroErroresPai)
@UseInterceptors(SinCacheInterceptor)
export class PaiAutorizacionesAdminController {
  constructor(
    @Inject(ServicioAutorizacionesPai)
    private readonly autorizaciones: ServicioAutorizacionesPai,
  ) {}

  @Get()
  listar(): Promise<ListaAutorizacionesPai> {
    return this.autorizaciones.listar();
  }

  @Post()
  @HttpCode(201)
  otorgar(
    @SesionPai() sesion: SesionValidaPai,
    @Body() cuerpo: unknown,
  ): Promise<AutorizacionPai> {
    return this.autorizaciones.otorgar(sesion, cuerpo);
  }

  @Delete(':id')
  revocar(
    @SesionPai() sesion: SesionValidaPai,
    @Param('id') id: string,
  ): Promise<AutorizacionPai> {
    return this.autorizaciones.revocar(sesion, idDeRuta(id, 'La autorización'));
  }
}

@Controller('pai/admin/registro')
@UseGuards(GuardiaAdministradorPai)
@UseFilters(FiltroErroresPai)
@UseInterceptors(SinCacheInterceptor)
export class PaiRegistroAdminController {
  constructor(
    @Inject(ServicioRegistroPai) private readonly registro: ServicioRegistroPai,
  ) {}

  @Get()
  listar(
    @Query() consulta: Record<string, unknown>,
  ): Promise<PaginaRegistroPai> {
    return this.registro.listar(consulta);
  }
}

@Controller('pai/admin')
@UseGuards(GuardiaAdministradorPai)
@UseFilters(FiltroErroresPai)
export class PaiExportacionAdminController {
  constructor(
    @Inject(ServicioExportacionPai)
    private readonly exportacion: ServicioExportacionPai,
  ) {}

  /** Content-Type text/csv; charset=utf-8, Content-Disposition attachment, Cache-Control private, no-store. */
  @Get('exportar.csv')
  async exportar(
    @SesionPai() sesion: SesionValidaPai,
    @Query() consulta: Record<string, unknown>,
    @Res() res: Response,
  ): Promise<void> {
    // Si falla antes de responder, FiltroErroresPai responde el JSON ErrorPai.
    const archivo = await this.exportacion.csv(sesion, consulta);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      contentDisposition('attachment', archivo.nombre),
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Length', String(archivo.contenido.length));
    res.status(200).end(archivo.contenido);
  }
}
