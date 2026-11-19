/// <reference types="multer" />
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  type OnModuleInit,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { finalize, type Observable } from 'rxjs';
import {
  CONFIGURACION_REPOSITORIO,
  type ConfiguracionRepositorio,
} from '../configuracion-repositorio.js';

/** Las respuestas JSON de la administración no se guardan en ninguna caché. */
@Injectable()
export class SinCacheInterceptor implements NestInterceptor {
  intercept(contexto: ExecutionContext, siguiente: CallHandler): Observable<unknown> {
    contexto.switchToHttp().getResponse<Response>().setHeader('Cache-Control', 'no-store');
    return siguiente.handle();
  }
}

/** Archivos que multer dejó en la carpeta temporal para esta petición. */
function archivosSubidos(req: Request): string[] {
  const rutas: string[] = [];
  if (req.file?.path) rutas.push(req.file.path);
  const archivos = req.files;
  if (Array.isArray(archivos)) {
    for (const archivo of archivos) rutas.push(archivo.path);
  } else if (archivos) {
    for (const lista of Object.values(archivos)) {
      for (const archivo of lista) rutas.push(archivo.path);
    }
  }
  return rutas.filter(Boolean);
}

/**
 * Va antes del interceptor de multer: crea la carpeta temporal (por si la
 * borró un limpiador del sistema) y, al terminar la petición (bien o con
 * error), borra los archivos subidos. El contenido ya quedó en la base.
 */
@Injectable()
export class SubidaTemporalInterceptor implements NestInterceptor, OnModuleInit {
  constructor(
    @Inject(CONFIGURACION_REPOSITORIO)
    private readonly config: ConfiguracionRepositorio,
  ) {}

  /**
   * Al arrancar, borra subidas a medias de una ejecución anterior (más de una
   * hora). Solo toca archivos con el nombre que les da multer (32
   * hexadecimales), por si la carpeta configurada es compartida.
   */
  async onModuleInit(): Promise<void> {
    const carpeta = this.config.directorioTemporal;
    let nombres: string[];
    try {
      nombres = await readdir(carpeta);
    } catch {
      return; // todavía no existe
    }
    const limite = Date.now() - 3_600_000;
    for (const nombre of nombres) {
      if (!/^[0-9a-f]{32}$/.test(nombre)) continue;
      const ruta = join(carpeta, nombre);
      try {
        const datos = await stat(ruta);
        if (datos.isFile() && datos.mtimeMs < limite) await rm(ruta, { force: true });
      } catch {
        // Otro proceso pudo borrarlo: no importa.
      }
    }
  }

  async intercept(
    contexto: ExecutionContext,
    siguiente: CallHandler,
  ): Promise<Observable<unknown>> {
    const req = contexto.switchToHttp().getRequest<Request>();
    await mkdir(this.config.directorioTemporal, { recursive: true, mode: 0o700 });
    return siguiente.handle().pipe(
      finalize(() => {
        for (const ruta of archivosSubidos(req)) {
          void rm(ruta, { force: true });
        }
      }),
    );
  }
}
