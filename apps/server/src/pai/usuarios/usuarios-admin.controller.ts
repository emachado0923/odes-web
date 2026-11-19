import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { ListaUsuariosPai, UsuarioPai } from '../api-pai.js';
import {
  idDeRuta,
  vigenciaDeConsulta,
} from '../compartido/validacion-comun.js';
import type { SesionValidaPai } from '../compartido/tipos-servidor.js';
import { FiltroErroresPai } from '../http/filtro-errores-pai.js';
import { SinCacheInterceptor } from '../../repositorio/http/interceptores.js';
import { GuardiaAdministradorPai, SesionPai } from '../sesion/guardia-pai.js';
import { ServicioUsuariosPai } from './servicio-usuarios-pai.js';

/**
 * Administración de usuarios del PAI (solo el administrador; un responsable
 * recibe 403 y una contraseña temporal sin cambiar, 403
 * `cambio_contrasena_requerido`):
 *
 *   GET   /api/pai/admin/usuarios                   -> ListaUsuariosPai
 *   POST  /api/pai/admin/usuarios                   <- DatosUsuarioNuevoPai -> 201 UsuarioPai
 *   PATCH /api/pai/admin/usuarios/:id               <- CambiosUsuarioPai -> UsuarioPai
 *   PUT   /api/pai/admin/usuarios/:id/asignaciones  <- AsignacionesPai -> UsuarioPai
 *
 * Las asignaciones (en las respuestas y al reemplazarlas) son las de la
 * vigencia más reciente, o la de `?vigencia=2026`.
 */
@Controller('pai/admin/usuarios')
@UseGuards(GuardiaAdministradorPai)
@UseFilters(FiltroErroresPai)
@UseInterceptors(SinCacheInterceptor)
export class PaiUsuariosAdminController {
  constructor(
    @Inject(ServicioUsuariosPai) private readonly usuarios: ServicioUsuariosPai,
  ) {}

  @Get()
  listar(@Query('vigencia') vigencia: unknown): Promise<ListaUsuariosPai> {
    return this.usuarios.listar(vigenciaDeConsulta(vigencia));
  }

  @Post()
  @HttpCode(201)
  crear(
    @SesionPai() sesion: SesionValidaPai,
    @Body() cuerpo: unknown,
  ): Promise<UsuarioPai> {
    return this.usuarios.crear(sesion, cuerpo);
  }

  @Patch(':id')
  actualizar(
    @SesionPai() sesion: SesionValidaPai,
    @Param('id') id: string,
    @Body() cuerpo: unknown,
  ): Promise<UsuarioPai> {
    return this.usuarios.actualizar(sesion, idDeRuta(id, 'El usuario'), cuerpo);
  }

  @Put(':id/asignaciones')
  asignar(
    @SesionPai() sesion: SesionValidaPai,
    @Param('id') id: string,
    @Body() cuerpo: unknown,
    @Query('vigencia') vigencia: unknown,
  ): Promise<UsuarioPai> {
    return this.usuarios.asignar(
      sesion,
      idDeRuta(id, 'El usuario'),
      cuerpo,
      vigenciaDeConsulta(vigencia),
    );
  }
}
