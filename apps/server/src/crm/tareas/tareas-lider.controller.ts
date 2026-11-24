/// <reference types="multer" />
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import type {
  ArchivoCrm,
  EstadoAvisoCrm,
  ResultadoDevolverCrm,
  ResumenLiderCrm,
  TareaCrm,
  TareaDetalleCrm,
} from '../api-crm.js';
import { LIMITES_MULTER_CRM } from '../archivos/servicio-archivos-crm.js';
import { GuardiaLiderCrm, SesionLider } from '../sesion/guardia-lider.js';
import { FiltroErroresRepositorio } from '../../repositorio/http/filtro-errores.js';
import { SinCacheInterceptor, SubidaTemporalInterceptor } from '../../repositorio/http/interceptores.js';
import { ipCliente } from '../../repositorio/http/peticion.js';
import type { SesionValida } from '../../repositorio/servicios/sesiones.js';
import { GuardiaSubidaAdjuntoCrm } from './guardia-subida-entregable.js';
import { ServicioTareasCrm } from './servicio-tareas-crm.js';
import {
  exigirJson,
  filtroTareasLider,
  idDeRuta,
  NO_EXISTE_ARCHIVO,
  NO_EXISTE_TAREA,
  validarDevolver,
  validarEdicionTarea,
  validarNuevaTarea,
} from './validacion-tareas.js';

/**
 * Panel del líder (GuardiaLiderCrm: sesión y, en las que cambian algo, mismo
 * sitio + X-CSRF-Token; reglas en servicio-tareas-crm.ts):
 *
 *   GET    /api/crm/lider/resumen                         -> ResumenLiderCrm
 *   GET    /api/crm/lider/tareas?responsable=&estado=&q=&terminadas= -> TareaCrm[]
 *   POST   /api/crm/lider/tareas                          -> 201 TareaDetalleCrm
 *   GET    /api/crm/lider/tareas/:id                      -> TareaDetalleCrm (con correos)
 *   PATCH  /api/crm/lider/tareas/:id                      -> TareaDetalleCrm
 *   DELETE /api/crm/lider/tareas/:id                      -> 204
 *   POST   /api/crm/lider/tareas/:id/adjuntos             -> 201 ArchivoCrm
 *   DELETE /api/crm/lider/tareas/:id/adjuntos/:archivoId  -> 204
 *   GET    /api/crm/lider/tareas/:id/archivos/:archivoId  -> el archivo
 *   POST   /api/crm/lider/tareas/:id/avisar               -> EstadoAvisoCrm
 *   POST   /api/crm/lider/tareas/:id/devolver             -> ResultadoDevolverCrm
 *
 * Las descargas no llevan SinCacheInterceptor: la caché la pone el servicio
 * de archivos.
 */
@Controller('crm/lider')
@UseGuards(GuardiaLiderCrm)
@UseFilters(FiltroErroresRepositorio)
export class TareasLiderCrmController {
  constructor(@Inject(ServicioTareasCrm) private readonly tareas: ServicioTareasCrm) {}

  @Get('resumen')
  @UseInterceptors(SinCacheInterceptor)
  resumen(): Promise<ResumenLiderCrm> {
    return this.tareas.resumen();
  }

  @Get('tareas')
  @UseInterceptors(SinCacheInterceptor)
  listar(@Query() consulta: unknown): Promise<TareaCrm[]> {
    return this.tareas.listarLider(filtroTareasLider(consulta));
  }

  @Post('tareas')
  @HttpCode(201)
  @UseInterceptors(SinCacheInterceptor)
  crear(@Req() req: Request, @Body() cuerpo: unknown): Promise<TareaDetalleCrm> {
    exigirJson(req);
    return this.tareas.crear(validarNuevaTarea(cuerpo), ipCliente(req));
  }

  @Get('tareas/:id')
  @UseInterceptors(SinCacheInterceptor)
  detalle(@Param('id') id: string): Promise<TareaDetalleCrm> {
    return this.tareas.detalleLider(idDeRuta(id, NO_EXISTE_TAREA));
  }

  @Patch('tareas/:id')
  @UseInterceptors(SinCacheInterceptor)
  editar(@Req() req: Request, @Param('id') id: string, @Body() cuerpo: unknown): Promise<TareaDetalleCrm> {
    const tareaId = idDeRuta(id, NO_EXISTE_TAREA);
    exigirJson(req);
    return this.tareas.editar(tareaId, validarEdicionTarea(cuerpo), ipCliente(req));
  }

  @Delete('tareas/:id')
  @HttpCode(204)
  @UseInterceptors(SinCacheInterceptor)
  async eliminar(@Param('id') id: string): Promise<void> {
    await this.tareas.eliminar(idDeRuta(id, NO_EXISTE_TAREA));
  }

  /** La tarea y el cupo se comprueban antes de multer (GuardiaSubidaAdjuntoCrm, después de GuardiaLiderCrm). */
  @Post('tareas/:id/adjuntos')
  @HttpCode(201)
  @UseGuards(GuardiaSubidaAdjuntoCrm)
  @UseInterceptors(
    SinCacheInterceptor,
    SubidaTemporalInterceptor,
    FileInterceptor('archivo', { limits: LIMITES_MULTER_CRM }),
  )
  subirAdjunto(
    @Req() req: Request,
    @Param('id') id: string,
    @UploadedFile() archivo: Express.Multer.File | undefined,
  ): Promise<ArchivoCrm> {
    return this.tareas.subirAdjunto(idDeRuta(id, NO_EXISTE_TAREA), archivo, ipCliente(req));
  }

  @Delete('tareas/:id/adjuntos/:archivoId')
  @HttpCode(204)
  @UseInterceptors(SinCacheInterceptor)
  async quitarAdjunto(
    @Req() req: Request,
    @Param('id') id: string,
    @Param('archivoId') archivoId: string,
  ): Promise<void> {
    await this.tareas.quitarAdjunto(
      idDeRuta(id, NO_EXISTE_TAREA),
      idDeRuta(archivoId, NO_EXISTE_ARCHIVO),
      ipCliente(req),
    );
  }

  @Get('tareas/:id/archivos/:archivoId')
  descargar(
    @Req() req: Request,
    @Res() res: Response,
    @Param('id') id: string,
    @Param('archivoId') archivoId: string,
  ): Promise<void> {
    return this.tareas.descargarLider(idDeRuta(id, NO_EXISTE_ARCHIVO), idDeRuta(archivoId, NO_EXISTE_ARCHIVO), req, res);
  }

  @Post('tareas/:id/avisar')
  @HttpCode(200)
  @UseInterceptors(SinCacheInterceptor)
  avisar(
    @Req() req: Request,
    @SesionLider() sesion: SesionValida,
    @Param('id') id: string,
  ): Promise<EstadoAvisoCrm> {
    return this.tareas.avisar(idDeRuta(id, NO_EXISTE_TAREA), this.tareas.origen(req), ipCliente(req), sesion.nombre);
  }

  @Post('tareas/:id/devolver')
  @HttpCode(200)
  @UseInterceptors(SinCacheInterceptor)
  devolver(
    @Req() req: Request,
    @SesionLider() sesion: SesionValida,
    @Param('id') id: string,
    @Body() cuerpo: unknown,
  ): Promise<ResultadoDevolverCrm> {
    const tareaId = idDeRuta(id, NO_EXISTE_TAREA);
    exigirJson(req);
    const { observacion } = validarDevolver(cuerpo);
    return this.tareas.devolver(tareaId, observacion, this.tareas.origen(req), ipCliente(req), sesion.nombre);
  }
}
