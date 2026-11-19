import {
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Req,
  Res,
  UseFilters,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { nombreDescarga } from '../api-repositorio.js';
import { extensionDeMime } from '../archivos/tipos-archivo.js';
import { esIdDocumento } from '../dominio/validacion.js';
import { noEncontrado } from '../errores-repositorio.js';
import {
  CACHE_DOCUMENTO,
  CACHE_IMAGEN,
  CACHE_IMAGEN_VERSIONADA,
  enviarArchivo,
} from '../http/enviar-archivo.js';
import { FiltroErroresRepositorio } from '../http/filtro-errores.js';
import { noModificado } from '../http/rango.js';
import { ServicioLecturaRepositorio } from '../servicios/lectura-repositorio.js';
import { versionImagen } from '../servicios/registros.js';

/**
 * API pública (sin sesión) bajo /api/repositorio/documentos. Solo documentos
 * publicados y solo archivos guardados en la base propia: nunca hace de
 * proxy de URL externas. Despublicado o inexistente: 404.
 */
@Controller('repositorio/documentos')
@UseFilters(FiltroErroresRepositorio)
export class RepositorioPublicoController {
  private readonly registro = new Logger('Repositorio');

  constructor(
    @Inject(ServicioLecturaRepositorio)
    private readonly lectura: ServicioLecturaRepositorio,
  ) {}

  /** ListadoPublico con ETag (304 si no cambió) y revalidación en cada visita. */
  @Get()
  async listado(@Req() req: Request, @Res() res: Response): Promise<void> {
    const { cuerpo, etag, actualizado } = await this.lectura.listadoPublico();
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('ETag', etag);
    res.setHeader('Last-Modified', actualizado.toUTCString());
    if (
      noModificado(
        {
          ifNoneMatch: req.get('if-none-match'),
          ifModifiedSince: req.get('if-modified-since'),
        },
        etag,
        actualizado,
      )
    ) {
      res.status(304).end();
      return;
    }
    res.status(200);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', String(cuerpo.length));
    res.end(req.method === 'HEAD' ? undefined : cuerpo);
  }

  @Get(':id/ver')
  async ver(@Param('id') id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    await this.enviarDocumento(id, 'inline', req, res);
  }

  @Get(':id/descargar')
  async descargar(@Param('id') id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    await this.enviarDocumento(id, 'attachment', req, res);
  }

  @Get(':id/portada')
  async portada(@Param('id') id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    await this.enviarImagen(id, 'portada', req, res);
  }

  @Get(':id/miniatura')
  async miniatura(@Param('id') id: string, @Req() req: Request, @Res() res: Response): Promise<void> {
    await this.enviarImagen(id, 'miniatura', req, res);
  }

  private async enviarDocumento(
    id: string,
    tipo: 'inline' | 'attachment',
    req: Request,
    res: Response,
  ): Promise<void> {
    const documento = esIdDocumento(id) ? await this.lectura.documentoPublicado(id) : null;
    const archivo = documento?.archivo;
    if (!documento || !archivo) throw noEncontrado();
    if (tipo === 'attachment' && !documento.permiteDescarga) {
      throw noEncontrado('Este documento no se puede descargar.');
    }
    await enviarArchivo(req, res, {
      archivo,
      almacen: this.lectura.almacenArchivos,
      cacheControl: CACHE_DOCUMENTO,
      disposicion: {
        tipo,
        nombre: nombreDescarga(documento, extensionDeMime(archivo.mime)),
      },
      registro: this.registro,
    });
  }

  private async enviarImagen(
    id: string,
    recurso: 'portada' | 'miniatura',
    req: Request,
    res: Response,
  ): Promise<void> {
    const documento = esIdDocumento(id) ? await this.lectura.documentoPublicado(id) : null;
    const imagen = documento?.[recurso];
    if (!documento || !imagen) throw noEncontrado();
    // Con ?v=<versión vigente> la URL cambia si se reemplaza la imagen: caché larga.
    const versionada = req.query.v === versionImagen(imagen);
    await enviarArchivo(req, res, {
      archivo: imagen,
      almacen: this.lectura.almacenArchivos,
      cacheControl: versionada ? CACHE_IMAGEN_VERSIONADA : CACHE_IMAGEN,
      registro: this.registro,
    });
  }
}
