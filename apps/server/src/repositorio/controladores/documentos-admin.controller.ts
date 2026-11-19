/// <reference types="multer" />
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Logger,
  Param,
  Post,
  Put,
  Req,
  Res,
  UploadedFile,
  UploadedFiles,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  FileFieldsInterceptor,
  FileInterceptor,
} from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import {
  type DocumentoAdmin,
  LIMITES_REPOSITORIO,
  nombreDescarga,
  type RespuestaSubida,
  type SubidaPorPartes,
} from '../api-repositorio.js';
import { extensionDeMime } from '../archivos/tipos-archivo.js';
import { esIdDocumento } from '../dominio/validacion.js';
import { noEncontrado } from '../errores-repositorio.js';
import { GuardiaAdminRepositorio, SesionRepositorio } from '../guardia-admin.js';
import { CACHE_ADMIN, enviarArchivo } from '../http/enviar-archivo.js';
import { FiltroErroresRepositorio } from '../http/filtro-errores.js';
import {
  SinCacheInterceptor,
  SubidaTemporalInterceptor,
} from '../http/interceptores.js';
import {
  type ArchivoSubido,
  ServicioDocumentosAdmin,
} from '../servicios/documentos-admin.js';
import { ServicioLecturaRepositorio } from '../servicios/lectura-repositorio.js';
import type { SesionValida } from '../servicios/sesiones.js';

function idValido(id: string): string {
  if (!esIdDocumento(id)) throw noEncontrado('El documento no existe.');
  return id;
}

function aSubido(archivo: Express.Multer.File | undefined): ArchivoSubido | undefined {
  if (!archivo) return undefined;
  return {
    ruta: archivo.path,
    nombreOriginal: archivo.originalname ?? '',
    mimeDeclarado: archivo.mimetype ?? '',
    bytes: archivo.size,
  };
}

/** Límites de multer: un solo archivo y pocos campos de texto. */
const LIMITES_ARCHIVO = {
  fileSize: LIMITES_REPOSITORIO.maxBytesArchivo,
  files: 1,
  fields: 10,
  parts: 12,
  fieldSize: 64 * 1024,
};

const LIMITES_PORTADA = {
  fileSize: LIMITES_REPOSITORIO.maxBytesPortada,
  files: 2,
  fields: 10,
  parts: 12,
  fieldSize: 64 * 1024,
};

/**
 * Documentos de la administración (todos, también despublicados) bajo
 * /api/repositorio/admin/documentos. Exige sesión; las escrituras, además,
 * el token CSRF (GuardiaAdminRepositorio).
 */
@Controller('repositorio/admin/documentos')
@UseGuards(GuardiaAdminRepositorio)
@UseFilters(FiltroErroresRepositorio)
export class RepositorioDocumentosAdminController {
  private readonly registro = new Logger('Repositorio');

  constructor(
    @Inject(ServicioDocumentosAdmin)
    private readonly documentos: ServicioDocumentosAdmin,
    @Inject(ServicioLecturaRepositorio)
    private readonly lectura: ServicioLecturaRepositorio,
  ) {}

  @Get()
  @UseInterceptors(SinCacheInterceptor)
  async listar(): Promise<{ documentos: DocumentoAdmin[] }> {
    return { documentos: await this.documentos.listar() };
  }

  @Get(':id')
  @UseInterceptors(SinCacheInterceptor)
  obtener(@Param('id') id: string): Promise<DocumentoAdmin> {
    return this.documentos.obtener(idValido(id));
  }

  @Post()
  @HttpCode(201)
  @UseInterceptors(SinCacheInterceptor)
  crear(@Body() cuerpo: unknown, @SesionRepositorio() sesion: SesionValida): Promise<DocumentoAdmin> {
    return this.documentos.crear(cuerpo, sesion.usuario);
  }

  @Put(':id')
  @UseInterceptors(SinCacheInterceptor)
  actualizar(
    @Param('id') id: string,
    @Body() cuerpo: unknown,
    @SesionRepositorio() sesion: SesionValida,
  ): Promise<DocumentoAdmin> {
    return this.documentos.actualizar(idValido(id), cuerpo, sesion.usuario);
  }

  @Post(':id/publicar')
  @HttpCode(200)
  @UseInterceptors(SinCacheInterceptor)
  publicar(@Param('id') id: string, @SesionRepositorio() sesion: SesionValida): Promise<DocumentoAdmin> {
    return this.documentos.publicar(idValido(id), sesion.usuario);
  }

  @Post(':id/despublicar')
  @HttpCode(200)
  @UseInterceptors(SinCacheInterceptor)
  despublicar(@Param('id') id: string, @SesionRepositorio() sesion: SesionValida): Promise<DocumentoAdmin> {
    return this.documentos.despublicar(idValido(id), sesion.usuario);
  }

  @Delete(':id')
  @HttpCode(204)
  @UseInterceptors(SinCacheInterceptor)
  async borrar(
    @Param('id') id: string,
    @Body() cuerpo: unknown,
    @SesionRepositorio() sesion: SesionValida,
  ): Promise<void> {
    await this.documentos.borrar(idValido(id), cuerpo, sesion.usuario);
  }

  @Put(':id/archivo')
  @UseInterceptors(
    SinCacheInterceptor,
    SubidaTemporalInterceptor,
    FileInterceptor('archivo', { limits: LIMITES_ARCHIVO }),
  )
  subirArchivo(
    @Param('id') id: string,
    @UploadedFile() archivo: Express.Multer.File | undefined,
    @Body() cuerpo: unknown,
    @SesionRepositorio() sesion: SesionValida,
  ): Promise<DocumentoAdmin> {
    // Sin archivo multipart y con JSON { subida }: último paso de una subida
    // directa a Supabase Storage o por partes (ver POST /api/repositorio/admin/subidas).
    if (!archivo && cuerpo && typeof cuerpo === 'object' && 'subida' in cuerpo) {
      return this.documentos.subirArchivoDirecto(idValido(id), cuerpo, sesion.usuario, sesion.usuarioId);
    }
    return this.documentos.subirArchivo(idValido(id), aSubido(archivo), sesion.usuario);
  }

  @Delete(':id/archivo')
  @UseInterceptors(SinCacheInterceptor)
  quitarArchivo(@Param('id') id: string, @SesionRepositorio() sesion: SesionValida): Promise<DocumentoAdmin> {
    return this.documentos.quitarArchivo(idValido(id), sesion.usuario);
  }

  @Put(':id/portada')
  @UseInterceptors(
    SinCacheInterceptor,
    SubidaTemporalInterceptor,
    FileFieldsInterceptor(
      [
        { name: 'portada', maxCount: 1 },
        { name: 'miniatura', maxCount: 1 },
      ],
      { limits: LIMITES_PORTADA },
    ),
  )
  subirPortada(
    @Param('id') id: string,
    @UploadedFiles()
    archivos: { portada?: Express.Multer.File[]; miniatura?: Express.Multer.File[] } | undefined,
    @SesionRepositorio() sesion: SesionValida,
  ): Promise<DocumentoAdmin> {
    return this.documentos.subirPortada(
      idValido(id),
      aSubido(archivos?.portada?.[0]),
      aSubido(archivos?.miniatura?.[0]),
      sesion.usuario,
    );
  }

  // ── Archivos para la administración (también de despublicados) ─────────

  @Get(':id/ver')
  ver(@Param('id') id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    return this.enviar(id, 'archivo', req, res, 'inline');
  }

  @Get(':id/descargar')
  descargar(@Param('id') id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    return this.enviar(id, 'archivo', req, res, 'attachment');
  }

  @Get(':id/portada')
  portada(@Param('id') id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    return this.enviar(id, 'portada', req, res);
  }

  @Get(':id/miniatura')
  miniatura(@Param('id') id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    return this.enviar(id, 'miniatura', req, res);
  }

  private async enviar(
    id: string,
    recurso: 'archivo' | 'portada' | 'miniatura',
    req: Request,
    res: Response,
    disposicion?: 'inline' | 'attachment',
  ): Promise<void> {
    const { registro, referencia } = await this.documentos.referenciaAdmin(idValido(id), recurso);
    await enviarArchivo(req, res, {
      archivo: referencia,
      almacen: this.lectura.almacenArchivos,
      cacheControl: CACHE_ADMIN,
      disposicion: disposicion
        ? {
            tipo: disposicion,
            nombre: nombreDescarga(registro, extensionDeMime(referencia.mime)),
          }
        : undefined,
      registro: this.registro,
    });
  }
}

/**
 * POST /api/repositorio/admin/subidas: prepara la subida de un archivo
 * (RespuestaSubida). Con Supabase Storage, una URL firmada para subirlo
 * directo al bucket; con los archivos en la base, el tamaño de parte para
 * subirlo por partes (POST /subidas/partes y PUT /subidas/partes/:uuid/:n).
 * Así un PDF grande nunca va en una sola petición (en Vercel una petición no
 * puede llevar más de 4,5 MB).
 */
@Controller('repositorio/admin/subidas')
@UseGuards(GuardiaAdminRepositorio)
@UseFilters(FiltroErroresRepositorio)
export class RepositorioSubidasAdminController {
  constructor(
    @Inject(ServicioDocumentosAdmin)
    private readonly documentos: ServicioDocumentosAdmin,
  ) {}

  @Post()
  @HttpCode(200)
  @UseInterceptors(SinCacheInterceptor)
  preparar(): Promise<RespuestaSubida> {
    return this.documentos.prepararSubida();
  }

  @Post('partes')
  @HttpCode(201)
  @UseInterceptors(SinCacheInterceptor)
  iniciarPorPartes(
    @Body() cuerpo: unknown,
    @SesionRepositorio() sesion: SesionValida,
  ): Promise<SubidaPorPartes> {
    return this.documentos.iniciarSubidaPorPartes(sesion.usuarioId, cuerpo);
  }

  /** Una parte, en binario (application/octet-stream). El cuerpo se lee aquí, con tope. */
  @Put('partes/:uuid/:n')
  @HttpCode(204)
  @UseInterceptors(SinCacheInterceptor)
  async recibirParte(
    @Param('uuid') uuid: string,
    @Param('n') n: string,
    @Req() req: Request,
    @SesionRepositorio() sesion: SesionValida,
  ): Promise<void> {
    await this.documentos.recibirParte(sesion.usuarioId, uuid, n, req);
  }
}
