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
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type {
  CambioRegistro,
  CategoriaAdmin,
  PalabraClaveAdmin,
} from '../api-repositorio.js';
import { BaseDatosRepositorio } from '../bd/base-datos.js';
import { esIdDocumento, validarLimite } from '../dominio/validacion.js';
import { noEncontrado, solicitudInvalida } from '../errores-repositorio.js';
import { GuardiaAdminRepositorio, SesionRepositorio } from '../guardia-admin.js';
import { FiltroErroresRepositorio } from '../http/filtro-errores.js';
import { SinCacheInterceptor } from '../http/interceptores.js';
import { listarCambios } from '../servicios/cambios.js';
import { ServicioCatalogos } from '../servicios/catalogos.js';
import type { SesionValida } from '../servicios/sesiones.js';

function idNumerico(id: string, que: string): number {
  if (!/^\d{1,10}$/.test(id)) throw noEncontrado(`${que} no existe.`);
  return Number(id);
}

/**
 * Categorías, palabras clave y registro de cambios de la administración, bajo
 * /api/repositorio/admin.
 */
@Controller('repositorio/admin')
@UseGuards(GuardiaAdminRepositorio)
@UseFilters(FiltroErroresRepositorio)
@UseInterceptors(SinCacheInterceptor)
export class RepositorioCatalogosAdminController {
  constructor(
    @Inject(ServicioCatalogos) private readonly catalogos: ServicioCatalogos,
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
  ) {}

  @Get('categorias')
  async categorias(): Promise<{ categorias: CategoriaAdmin[] }> {
    return { categorias: await this.catalogos.listarCategorias() };
  }

  @Post('categorias')
  @HttpCode(201)
  crearCategoria(@Body() cuerpo: unknown, @SesionRepositorio() sesion: SesionValida): Promise<CategoriaAdmin> {
    return this.catalogos.crearCategoria(cuerpo, sesion.usuario);
  }

  @Put('categorias/:id')
  actualizarCategoria(
    @Param('id') id: string,
    @Body() cuerpo: unknown,
    @SesionRepositorio() sesion: SesionValida,
  ): Promise<CategoriaAdmin> {
    return this.catalogos.actualizarCategoria(idNumerico(id, 'La categoría'), cuerpo, sesion.usuario);
  }

  @Delete('categorias/:id')
  @HttpCode(204)
  async borrarCategoria(@Param('id') id: string, @SesionRepositorio() sesion: SesionValida): Promise<void> {
    await this.catalogos.borrarCategoria(idNumerico(id, 'La categoría'), sesion.usuario);
  }

  @Get('palabras-clave')
  async palabras(): Promise<{ palabras: PalabraClaveAdmin[] }> {
    return { palabras: await this.catalogos.listarPalabras() };
  }

  @Put('palabras-clave/:id')
  renombrarPalabra(
    @Param('id') id: string,
    @Body() cuerpo: unknown,
    @SesionRepositorio() sesion: SesionValida,
  ): Promise<PalabraClaveAdmin> {
    return this.catalogos.renombrarPalabra(idNumerico(id, 'La palabra clave'), cuerpo, sesion.usuario);
  }

  @Delete('palabras-clave/:id')
  @HttpCode(204)
  async borrarPalabra(@Param('id') id: string, @SesionRepositorio() sesion: SesionValida): Promise<void> {
    await this.catalogos.borrarPalabra(idNumerico(id, 'La palabra clave'), sesion.usuario);
  }

  /** ?limite=50 (1-500) y, opcional, ?documento=<id> para el historial de uno. */
  @Get('cambios')
  async cambios(
    @Query('limite') limite: unknown,
    @Query('documento') documento: unknown,
  ): Promise<{ cambios: CambioRegistro[] }> {
    let documentoId: string | null = null;
    if (documento !== undefined && documento !== '') {
      if (typeof documento !== 'string' || !esIdDocumento(documento)) {
        throw solicitudInvalida('documento debe ser el identificador de un documento.');
      }
      documentoId = documento;
    }
    return {
      cambios: await listarCambios(this.bd, { limite: validarLimite(limite), documentoId }),
    };
  }
}
