import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import {
  CONFIGURACION_REPOSITORIO,
  type ConfiguracionRepositorio,
} from '../repositorio/configuracion-repositorio.js';
import {
  ConfiguracionRepositorioModule,
  RepositorioProductosModule,
} from '../repositorio/repositorio-productos.module.js';
import { PERMISOS_PAI } from './compartido/tipos-servidor.js';
import {
  CONFIGURACION_PAI,
  type ConfiguracionPai,
  cargarConfiguracionPai,
} from './configuracion-pai.js';
import {
  PaiAutorizacionesAdminController,
  PaiExportacionAdminController,
  PaiRegistroAdminController,
  PaiVigenciaAdminController,
} from './controladores/administracion.controller.js';
import {
  PaiIndicadoresController,
  PaiTableroController,
  PaiVigenciaController,
} from './controladores/consulta.controller.js';
import { PaiEvidenciasController } from './evidencias/evidencias.controller.js';
import { ServicioEvidenciasPai } from './evidencias/servicio-evidencias.js';
import { FiltroErroresPai } from './http/filtro-errores-pai.js';
import { ServicioAutorizacionesPai } from './servicios/servicio-autorizaciones.js';
import { ServicioExportacionPai } from './servicios/servicio-exportacion.js';
import { ServicioIndicadoresPai } from './servicios/servicio-indicadores.js';
import { ServicioPermisosPai } from './servicios/servicio-permisos.js';
import { ServicioRegistroPai } from './servicios/servicio-registro.js';
import { ServicioReportesPai } from './servicios/servicio-reportes.js';
import { ServicioTableroPai } from './servicios/servicio-tablero.js';
import { ServicioVigenciaPai } from './servicios/servicio-vigencia.js';
import { GuardiaAdministradorPai, GuardiaPai } from './sesion/guardia-pai.js';
import { PaiSesionController } from './sesion/sesion-pai.controller.js';
import { ServicioSesionesPai } from './sesion/servicio-sesiones-pai.js';
import { PaiUsuariosAdminController } from './usuarios/usuarios-admin.controller.js';
import { ServicioUsuariosPai } from './usuarios/servicio-usuarios-pai.js';

/**
 * Rama /pai: Plan de Acción Institucional de Sapiencia (contrato en
 * api-pai.ts). Usa la base compartida del repositorio (BaseDatosRepositorio,
 * tablas pai_* de la migración 003) y tiene su propia autenticación (cookie
 * pai_sesion, Path=/api/pai) con dos roles: responsable y administrador.
 *
 *   /api/pai/sesion[/contrasena]          sesion/       (srv-autenticacion)
 *   /api/pai/admin/usuarios[...]          usuarios/     (srv-autenticacion)
 *   /api/pai/vigencia, /tablero,
 *   /api/pai/indicadores/:ref[/bimestres/:b]            (srv-dominio)
 *   /api/pai/admin/vigencia, /autorizaciones,
 *   /api/pai/admin/registro, /exportar.csv              (srv-dominio)
 *   /api/pai/indicadores/:id/bimestres/:b/evidencias[/subidas],
 *   /api/pai/evidencias/:id               evidencias/   (srv-evidencias)
 *
 * Este archivo registra TODOS los controladores y proveedores del PAI: las
 * partes implementan sus archivos sin editarlo. PermisosPai (las reglas de
 * edición) se inyecta con el token PERMISOS_PAI.
 *
 * Sin base configurada el servidor arranca igual y /api/pai/* responde 503.
 */
@Module({
  imports: [
    RepositorioProductosModule,
    MulterModule.registerAsync({
      imports: [ConfiguracionRepositorioModule],
      useFactory: (config: ConfiguracionRepositorio) => ({
        dest: config.directorioTemporal,
      }),
      inject: [CONFIGURACION_REPOSITORIO],
    }),
  ],
  controllers: [
    PaiSesionController,
    PaiUsuariosAdminController,
    PaiVigenciaController,
    PaiTableroController,
    PaiIndicadoresController,
    PaiVigenciaAdminController,
    PaiAutorizacionesAdminController,
    PaiRegistroAdminController,
    PaiExportacionAdminController,
    PaiEvidenciasController,
  ],
  providers: [
    {
      provide: CONFIGURACION_PAI,
      useFactory: (): ConfiguracionPai => cargarConfiguracionPai(process.env),
    },
    FiltroErroresPai,
    // srv-autenticacion
    ServicioSesionesPai,
    GuardiaPai,
    GuardiaAdministradorPai,
    ServicioUsuariosPai,
    // srv-dominio
    ServicioPermisosPai,
    { provide: PERMISOS_PAI, useExisting: ServicioPermisosPai },
    ServicioVigenciaPai,
    ServicioTableroPai,
    ServicioIndicadoresPai,
    ServicioReportesPai,
    ServicioAutorizacionesPai,
    ServicioRegistroPai,
    ServicioExportacionPai,
    // srv-evidencias
    ServicioEvidenciasPai,
  ],
})
export class PaiModule {}
