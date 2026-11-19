import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { BaseDatosRepositorio } from './bd/base-datos.js';
import {
  CONFIGURACION_REPOSITORIO,
  type ConfiguracionRepositorio,
  cargarConfiguracionRepositorio,
} from './configuracion-repositorio.js';
import { RepositorioCatalogosAdminController } from './controladores/catalogos-admin.controller.js';
import {
  RepositorioDocumentosAdminController,
  RepositorioSubidasAdminController,
} from './controladores/documentos-admin.controller.js';
import { RepositorioPublicoController } from './controladores/publico.controller.js';
import { RepositorioSesionController } from './controladores/sesion.controller.js';
import { GuardiaAdminRepositorio } from './guardia-admin.js';
import { FiltroErroresRepositorio } from './http/filtro-errores.js';
import {
  SinCacheInterceptor,
  SubidaTemporalInterceptor,
} from './http/interceptores.js';
import { ServicioCatalogos } from './servicios/catalogos.js';
import { ServicioDocumentosAdmin } from './servicios/documentos-admin.js';
import { ServicioLecturaRepositorio } from './servicios/lectura-repositorio.js';
import { ServicioSesiones } from './servicios/sesiones.js';

/**
 * Configuración REPOSITORIO_* como proveedor compartido (también la usa
 * MulterModule para la carpeta temporal). Las pruebas la reemplazan con
 * overrideProvider(CONFIGURACION_REPOSITORIO).
 */
@Module({
  providers: [
    {
      provide: CONFIGURACION_REPOSITORIO,
      useFactory: (): ConfiguracionRepositorio =>
        cargarConfiguracionRepositorio(process.env),
    },
  ],
  exports: [CONFIGURACION_REPOSITORIO],
})
export class ConfiguracionRepositorioModule {}

/**
 * Rama /repositorio: Repositorio de Productos del Observatorio de Sapiencia,
 * con la base (MySQL o Postgres) como fuente de verdad, los archivos en la
 * base o en Supabase Storage, y una administración con sesión. (No confundir con RepositorioModule de
 * src/odes, que es el índice SQLite del Asistente ODES.)
 *
 *   /api/repositorio/documentos[/:id/(ver|descargar|portada|miniatura)]  pública
 *   /api/repositorio/admin/...                                           con sesión
 *
 * Exporta, para otros módulos:
 *   - ServicioLecturaRepositorio: lectura de los documentos publicados y de
 *     sus archivos (sin notas internas).
 *   - GuardiaAdminRepositorio (+ ServicioSesiones, del que depende) y el
 *     decorador SesionRepositorio: endpoints solo para administradores.
 *
 * La configuración (REPOSITORIO_*) se lee de process.env al crear el módulo.
 * Sin base configurada el servidor arranca igual y esta API responde 503.
 */
@Module({
  imports: [
    ConfiguracionRepositorioModule,
    MulterModule.registerAsync({
      imports: [ConfiguracionRepositorioModule],
      useFactory: (config: ConfiguracionRepositorio) => ({
        dest: config.directorioTemporal,
      }),
      inject: [CONFIGURACION_REPOSITORIO],
    }),
  ],
  controllers: [
    RepositorioPublicoController,
    RepositorioSesionController,
    RepositorioDocumentosAdminController,
    RepositorioSubidasAdminController,
    RepositorioCatalogosAdminController,
  ],
  providers: [
    BaseDatosRepositorio,
    ServicioLecturaRepositorio,
    ServicioSesiones,
    ServicioDocumentosAdmin,
    ServicioCatalogos,
    GuardiaAdminRepositorio,
    FiltroErroresRepositorio,
    SinCacheInterceptor,
    SubidaTemporalInterceptor,
  ],
  exports: [
    ServicioLecturaRepositorio,
    ServicioSesiones,
    GuardiaAdminRepositorio,
    BaseDatosRepositorio,
    ConfiguracionRepositorioModule,
  ],
})
export class RepositorioProductosModule {}
