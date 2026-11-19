/// <reference types="multer" />
import {
  Body,
  type CanActivate,
  Controller,
  Delete,
  type ExecutionContext,
  Get,
  HttpCode,
  Inject,
  Injectable,
  Param,
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
import {
  type EvidenciaPai,
  LIMITES_PAI,
  type RespuestaSubidaPai,
  type SubidaPorPartesPai,
} from '../api-pai.js';
import type { SesionValidaPai } from '../compartido/tipos-servidor.js';
import { bimestreDeRuta, idDeRuta } from '../compartido/validacion-comun.js';
import { FiltroErroresPai } from '../http/filtro-errores-pai.js';
import {
  SinCacheInterceptor,
  SubidaTemporalInterceptor,
} from '../../repositorio/http/interceptores.js';
import {
  GuardiaPai,
  SesionPai,
  sesionPaiDePeticion,
} from '../sesion/guardia-pai.js';
import {
  type ArchivoEvidenciaSubido,
  ServicioEvidenciasPai,
} from './servicio-evidencias.js';

/** Límites de multer: un solo archivo y pocos campos de texto. */
const LIMITES_MULTER = {
  fileSize: LIMITES_PAI.maxBytesEvidencia,
  files: 1,
  fields: 10,
  parts: 12,
  fieldSize: 64 * 1024,
};

function aSubido(
  archivo: Express.Multer.File | undefined,
): ArchivoEvidenciaSubido | undefined {
  if (!archivo) return undefined;
  return {
    ruta: archivo.path,
    nombreOriginal: archivo.originalname ?? '',
    mimeDeclarado: archivo.mimetype ?? '',
    bytes: archivo.size,
  };
}

/**
 * Para la subida multipart, después de GuardiaPai y ANTES de los
 * interceptores (FileInterceptor/multer escribe el archivo completo, hasta
 * 25 MB, en la carpeta temporal): comprueba que el usuario puede editar ese
 * (indicador, bimestre) y que el reporte tiene cupo. Así quien no puede
 * subir (el administrador, un responsable sin el indicador, un bimestre
 * cerrado) recibe el 403/404/409 sin ocupar disco. Las subidas directas
 * (JSON) se comprueban en el servicio.
 */
@Injectable()
export class GuardiaSubidaEvidenciaPai implements CanActivate {
  constructor(
    @Inject(ServicioEvidenciasPai)
    private readonly evidencias: ServicioEvidenciasPai,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<Request>();
    if (!req.is('multipart/form-data')) return true;
    const sesion = sesionPaiDePeticion(req);
    if (!sesion) return false;
    await this.evidencias.verificarAntes(
      sesion,
      idDeRuta(String(req.params.id), 'El indicador'),
      bimestreDeRuta(String(req.params.b)),
    );
    return true;
  }
}

/**
 * Evidencias de los reportes (reglas en servicio-evidencias.ts):
 *
 *   POST   /api/pai/indicadores/:id/bimestres/:b/evidencias/subidas -> RespuestaSubidaPai
 *   POST   /api/pai/indicadores/:id/bimestres/:b/evidencias  multipart "archivo" o JSON -> 201 EvidenciaPai
 *   GET    /api/pai/evidencias/:id                           -> archivo | 302 (URL firmada)
 *   DELETE /api/pai/evidencias/:id                           -> 204
 *
 * GuardiaPai (sesión, CSRF y mismo sitio en las mutaciones); subir y borrar
 * exigen poder editar el (indicador, bimestre); descargar, verlo. En la
 * subida multipart, GuardiaSubidaEvidenciaPai lo comprueba antes de que
 * multer deje el archivo en la carpeta temporal del repositorio (25 MB como
 * máximo); SubidaTemporalInterceptor lo borra al terminar. En Vercel el cuerpo no
 * puede pasar de 4,5 MB: con Supabase la web sube directo al bucket privado.
 */
@Controller('pai')
@UseGuards(GuardiaPai)
@UseFilters(FiltroErroresPai)
export class PaiEvidenciasController {
  constructor(
    @Inject(ServicioEvidenciasPai)
    private readonly evidencias: ServicioEvidenciasPai,
  ) {}

  @Post('indicadores/:id/bimestres/:b/evidencias/subidas')
  @HttpCode(200)
  @UseInterceptors(SinCacheInterceptor)
  prepararSubida(
    @SesionPai() sesion: SesionValidaPai,
    @Param('id') id: string,
    @Param('b') b: string,
  ): Promise<RespuestaSubidaPai> {
    return this.evidencias.prepararSubida(
      sesion,
      idDeRuta(id, 'El indicador'),
      bimestreDeRuta(b),
    );
  }

  @Post('indicadores/:id/bimestres/:b/evidencias/subidas/partes')
  @HttpCode(201)
  @UseInterceptors(SinCacheInterceptor)
  iniciarSubidaPorPartes(
    @SesionPai() sesion: SesionValidaPai,
    @Param('id') id: string,
    @Param('b') b: string,
    @Body() cuerpo: unknown,
  ): Promise<SubidaPorPartesPai> {
    return this.evidencias.iniciarSubidaPorPartes(
      sesion,
      idDeRuta(id, 'El indicador'),
      bimestreDeRuta(b),
      cuerpo,
    );
  }

  /** Una parte, en binario (application/octet-stream). El cuerpo se lee en el servicio, con tope. */
  @Put('subidas/partes/:uuid/:n')
  @HttpCode(204)
  @UseInterceptors(SinCacheInterceptor)
  async recibirParte(
    @SesionPai() sesion: SesionValidaPai,
    @Param('uuid') uuid: string,
    @Param('n') n: string,
    @Req() req: Request,
  ): Promise<void> {
    await this.evidencias.recibirParte(sesion, uuid, n, req);
  }

  @Post('indicadores/:id/bimestres/:b/evidencias')
  @HttpCode(201)
  @UseGuards(GuardiaSubidaEvidenciaPai)
  @UseInterceptors(
    SinCacheInterceptor,
    SubidaTemporalInterceptor,
    FileInterceptor('archivo', { limits: LIMITES_MULTER }),
  )
  crear(
    @SesionPai() sesion: SesionValidaPai,
    @Param('id') id: string,
    @Param('b') b: string,
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body() cuerpo: unknown,
  ): Promise<EvidenciaPai> {
    return this.evidencias.crear(
      sesion,
      idDeRuta(id, 'El indicador'),
      bimestreDeRuta(b),
      aSubido(archivo),
      cuerpo,
    );
  }

  @Get('evidencias/:id')
  descargar(
    @SesionPai() sesion: SesionValidaPai,
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return this.evidencias.descargar(
      sesion,
      idDeRuta(id, 'La evidencia'),
      req,
      res,
    );
  }

  @Delete('evidencias/:id')
  @HttpCode(204)
  @UseInterceptors(SinCacheInterceptor)
  borrar(
    @SesionPai() sesion: SesionValidaPai,
    @Param('id') id: string,
  ): Promise<void> {
    return this.evidencias.borrar(sesion, idDeRuta(id, 'La evidencia'));
  }
}
