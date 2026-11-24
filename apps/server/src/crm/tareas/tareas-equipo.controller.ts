/// <reference types="multer" />
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
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
import type { ArchivoCrm, ResultadoTerminarCrm, TableroPersonaCrm, TareaDetalleCrm } from '../api-crm.js';
import { LIMITES_MULTER_CRM } from '../archivos/servicio-archivos-crm.js';
import { FiltroErroresRepositorio } from '../../repositorio/http/filtro-errores.js';
import { SinCacheInterceptor, SubidaTemporalInterceptor } from '../../repositorio/http/interceptores.js';
import { GuardiaSubidaEntregableCrm } from './guardia-subida-entregable.js';
import { ServicioTareasCrm } from './servicio-tareas-crm.js';
import {
  exigirJson,
  exigirMismoSitio,
  idDeRuta,
  ipDeEquipo,
  NO_EXISTE_ARCHIVO,
  NO_EXISTE_PERSONA,
  NO_EXISTE_TAREA,
  terminadasDeConsulta,
  validarCambioEstado,
  validarTerminar,
} from './validacion-tareas.js';

/** Mismo sitio (403) y la clave de IP con la que se cuenta el tope y se anota el evento. */
function mutacionEquipo(req: Request): string {
  exigirMismoSitio(req);
  return ipDeEquipo(req);
}

/**
 * Tablero de cada persona del equipo (sin cuenta; reglas en
 * servicio-tareas-crm.ts):
 *
 *   GET    /api/crm/personas/:personaId/tareas?terminadas=recientes|todas -> TableroPersonaCrm
 *   GET    /api/crm/personas/:personaId/tareas/:tareaId                   -> TareaDetalleCrm
 *   POST   /api/crm/personas/:personaId/tareas/:tareaId/estado            -> TareaDetalleCrm
 *   POST   /api/crm/personas/:personaId/tareas/:tareaId/entregables       -> 201 ArchivoCrm
 *   DELETE /api/crm/personas/:personaId/tareas/:tareaId/entregables/:archivoId -> 204
 *   POST   /api/crm/personas/:personaId/tareas/:tareaId/terminar          -> ResultadoTerminarCrm
 *   GET    /api/crm/personas/:personaId/tareas/:tareaId/archivos/:archivoId -> el archivo
 *
 * Las que cambian algo rechazan las peticiones de otro sitio (403) y cuentan
 * en el tope por IP (429). Las descargas no llevan SinCacheInterceptor: la
 * caché la pone el servicio de archivos.
 */
@Controller('crm/personas/:personaId/tareas')
@UseFilters(FiltroErroresRepositorio)
export class TareasEquipoCrmController {
  constructor(@Inject(ServicioTareasCrm) private readonly tareas: ServicioTareasCrm) {}

  @Get()
  @UseInterceptors(SinCacheInterceptor)
  tablero(@Param('personaId') personaId: string, @Query('terminadas') terminadas: unknown): Promise<TableroPersonaCrm> {
    return this.tareas.tablero(idDeRuta(personaId, NO_EXISTE_PERSONA), terminadasDeConsulta(terminadas));
  }

  @Get(':tareaId')
  @UseInterceptors(SinCacheInterceptor)
  detalle(@Param('personaId') personaId: string, @Param('tareaId') tareaId: string): Promise<TareaDetalleCrm> {
    return this.tareas.detalleEquipo(idDeRuta(personaId, NO_EXISTE_TAREA), idDeRuta(tareaId, NO_EXISTE_TAREA));
  }

  @Post(':tareaId/estado')
  @HttpCode(200)
  @UseInterceptors(SinCacheInterceptor)
  cambiarEstado(
    @Req() req: Request,
    @Param('personaId') personaId: string,
    @Param('tareaId') tareaId: string,
    @Body() cuerpo: unknown,
  ): Promise<TareaDetalleCrm> {
    const persona = idDeRuta(personaId, NO_EXISTE_TAREA);
    const tarea = idDeRuta(tareaId, NO_EXISTE_TAREA);
    const ip = mutacionEquipo(req);
    exigirJson(req);
    const { estado } = validarCambioEstado(cuerpo);
    return this.tareas.cambiarEstado(persona, tarea, estado, ip);
  }

  /** Mismo sitio, tope por IP, tarea y cupo: GuardiaSubidaEntregableCrm, antes de multer. */
  @Post(':tareaId/entregables')
  @HttpCode(201)
  @UseGuards(GuardiaSubidaEntregableCrm)
  @UseInterceptors(
    SinCacheInterceptor,
    SubidaTemporalInterceptor,
    FileInterceptor('archivo', { limits: LIMITES_MULTER_CRM }),
  )
  subirEntregable(
    @Req() req: Request,
    @Param('personaId') personaId: string,
    @Param('tareaId') tareaId: string,
    @UploadedFile() archivo: Express.Multer.File | undefined,
  ): Promise<ArchivoCrm> {
    return this.tareas.subirEntregable(
      idDeRuta(personaId, NO_EXISTE_TAREA),
      idDeRuta(tareaId, NO_EXISTE_TAREA),
      archivo,
      ipDeEquipo(req),
    );
  }

  @Delete(':tareaId/entregables/:archivoId')
  @HttpCode(204)
  @UseInterceptors(SinCacheInterceptor)
  async quitarEntregable(
    @Req() req: Request,
    @Param('personaId') personaId: string,
    @Param('tareaId') tareaId: string,
    @Param('archivoId') archivoId: string,
  ): Promise<void> {
    const persona = idDeRuta(personaId, NO_EXISTE_TAREA);
    const tarea = idDeRuta(tareaId, NO_EXISTE_TAREA);
    const archivo = idDeRuta(archivoId, NO_EXISTE_ARCHIVO);
    const ip = mutacionEquipo(req);
    await this.tareas.quitarEntregable(persona, tarea, archivo, ip);
  }

  @Post(':tareaId/terminar')
  @HttpCode(200)
  @UseInterceptors(SinCacheInterceptor)
  terminar(
    @Req() req: Request,
    @Param('personaId') personaId: string,
    @Param('tareaId') tareaId: string,
    @Body() cuerpo: unknown,
  ): Promise<ResultadoTerminarCrm> {
    const persona = idDeRuta(personaId, NO_EXISTE_TAREA);
    const tarea = idDeRuta(tareaId, NO_EXISTE_TAREA);
    const ip = mutacionEquipo(req);
    exigirJson(req);
    const { nota } = validarTerminar(cuerpo);
    return this.tareas.terminar(persona, tarea, nota, ip, this.tareas.origen(req));
  }

  @Get(':tareaId/archivos/:archivoId')
  descargar(
    @Req() req: Request,
    @Res() res: Response,
    @Param('personaId') personaId: string,
    @Param('tareaId') tareaId: string,
    @Param('archivoId') archivoId: string,
  ): Promise<void> {
    return this.tareas.descargarEquipo(
      idDeRuta(personaId, NO_EXISTE_ARCHIVO),
      idDeRuta(tareaId, NO_EXISTE_ARCHIVO),
      idDeRuta(archivoId, NO_EXISTE_ARCHIVO),
      req,
      res,
    );
  }
}
