/// <reference types="multer" />
/**
 * Personas del equipo:
 *
 *   GET    /api/crm/personas                  -> PersonaCrm[]        (PersonasCrmController, sin sesión)
 *   GET    /api/crm/personas/:personaId/foto  -> imagen | 404
 *   GET    /api/crm/lider/personas            -> PersonaAdminCrm[]   (PersonasLiderCrmController)
 *   POST   /api/crm/lider/personas            -> PersonaAdminCrm (201)
 *   PATCH  /api/crm/lider/personas/:id        -> PersonaAdminCrm
 *   PUT    /api/crm/lider/personas/:id/foto   -> PersonaAdminCrm
 *   DELETE /api/crm/lider/personas/:id/foto   -> PersonaAdminCrm
 *
 * Las del líder pasan por GuardiaLiderCrm (sesión y, en las que cambian algo,
 * mismo sitio + CSRF). Como las guardias corren antes que los interceptores,
 * nadie sin sesión llega a que multer deje la foto en la carpeta temporal;
 * SubidaTemporalInterceptor la borra al terminar.
 */
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
  Put,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import type { PersonaAdminCrm, PersonaCrm } from '../api-crm.js';
import { LIMITES_MULTER_FOTO_CRM } from '../archivos/servicio-archivos-crm.js';
import { GuardiaLiderCrm } from '../sesion/guardia-lider.js';
import { solicitudInvalida } from '../../repositorio/errores-repositorio.js';
import { FiltroErroresRepositorio } from '../../repositorio/http/filtro-errores.js';
import { SinCacheInterceptor, SubidaTemporalInterceptor } from '../../repositorio/http/interceptores.js';
import { ServicioPersonasCrm } from './servicio-personas-crm.js';
import { idPersonaDeRuta } from './validacion-personas.js';

/** POST y PATCH: solo JSON (un formulario de otro sitio no puede mandar application/json sin CORS). */
function exigirJson(req: Request): void {
  if (!req.is('application/json')) {
    throw solicitudInvalida('Envíe los datos como JSON (Content-Type: application/json).');
  }
}

@Controller('crm/personas')
@UseFilters(FiltroErroresRepositorio)
export class PersonasCrmController {
  constructor(@Inject(ServicioPersonasCrm) private readonly personas: ServicioPersonasCrm) {}

  @Get()
  @UseInterceptors(SinCacheInterceptor)
  listar(): Promise<PersonaCrm[]> {
    return this.personas.listarPublicas();
  }

  /** Sin SinCacheInterceptor: el servicio de archivos pone la caché de la foto. */
  @Get(':personaId/foto')
  foto(@Param('personaId') personaId: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    return this.personas.enviarFoto(req, res, idPersonaDeRuta(personaId));
  }
}

@Controller('crm/lider/personas')
@UseGuards(GuardiaLiderCrm)
@UseFilters(FiltroErroresRepositorio)
@UseInterceptors(SinCacheInterceptor)
export class PersonasLiderCrmController {
  constructor(@Inject(ServicioPersonasCrm) private readonly personas: ServicioPersonasCrm) {}

  @Get()
  listar(): Promise<PersonaAdminCrm[]> {
    return this.personas.listarAdmin();
  }

  @Post()
  @HttpCode(201)
  crear(@Req() req: Request, @Body() cuerpo: unknown): Promise<PersonaAdminCrm> {
    exigirJson(req);
    return this.personas.crear(cuerpo);
  }

  @Patch(':id')
  editar(@Param('id') id: string, @Req() req: Request, @Body() cuerpo: unknown): Promise<PersonaAdminCrm> {
    const personaId = idPersonaDeRuta(id);
    exigirJson(req);
    return this.personas.editar(personaId, cuerpo);
  }

  @Put(':id/foto')
  @UseInterceptors(SubidaTemporalInterceptor, FileInterceptor('archivo', { limits: LIMITES_MULTER_FOTO_CRM }))
  ponerFoto(
    @Param('id') id: string,
    @UploadedFile() archivo: Express.Multer.File | undefined,
  ): Promise<PersonaAdminCrm> {
    return this.personas.ponerFoto(idPersonaDeRuta(id), archivo);
  }

  @Delete(':id/foto')
  quitarFoto(@Param('id') id: string): Promise<PersonaAdminCrm> {
    return this.personas.quitarFoto(idPersonaDeRuta(id));
  }
}
