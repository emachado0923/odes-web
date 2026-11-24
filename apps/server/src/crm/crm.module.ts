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
import { ServicioArchivosCrm } from './archivos/servicio-archivos-crm.js';
import { CONFIGURACION_CORREO_CRM, cargarConfiguracionCorreoCrm } from './correo/configuracion-correo.js';
import { ServicioCorreoCrm } from './correo/servicio-correo-crm.js';
import { PersonasCrmController, PersonasLiderCrmController } from './personas/personas.controller.js';
import { ServicioPersonasCrm } from './personas/servicio-personas-crm.js';
import { GuardiaLiderCrm } from './sesion/guardia-lider.js';
import { SesionLiderCrmController } from './sesion/sesion-lider.controller.js';
import { ServicioSesionesCrm } from './sesion/servicio-sesiones-crm.js';
import { CorreosLiderCrmController } from './tareas/correos-lider.controller.js';
import { ServicioTareasCrm } from './tareas/servicio-tareas-crm.js';
import { TareasEquipoCrmController } from './tareas/tareas-equipo.controller.js';
import { TareasLiderCrmController } from './tareas/tareas-lider.controller.js';

/**
 * Rama /crm: tareas de la Oficina de Planeación (contrato en api-crm.ts).
 * Usa la base compartida del repositorio (BaseDatosRepositorio, tablas crm_*
 * de la migración 010) y tiene su propia sesión para el líder (cookie
 * crm_sesion, Path=/api/crm). El equipo entra sin cuenta.
 *
 *   /api/crm/lider/sesion                 sesion/     (sesión del líder)
 *   /api/crm/personas, /:id/foto          personas/   (lista pública y fotos)
 *   /api/crm/lider/personas[...]          personas/   (pantalla Equipo del líder)
 *   /api/crm/personas/:id/tareas[...]     tareas/     (tablero de cada persona)
 *   /api/crm/lider/resumen, /tareas[...]  tareas/     (panel del líder)
 *   /api/crm/lider/correos[...]           tareas/     (bandeja de correos)
 *   archivos/  almacén crm_almacen_* y validación de archivos
 *   correo/    configuración (CRM_CORREO_*), plantillas y envío (crm_correos)
 *
 * Este archivo registra TODOS los controladores y proveedores del CRM: cada
 * parte implementa sus archivos sin editarlo.
 *
 * Sin base configurada el servidor arranca igual y /api/crm/* responde 503.
 * Sin CRM_CORREO_* el CRM funciona y los correos quedan «sin configurar».
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
    SesionLiderCrmController,
    PersonasCrmController,
    PersonasLiderCrmController,
    TareasEquipoCrmController,
    TareasLiderCrmController,
    CorreosLiderCrmController,
  ],
  providers: [
    ServicioSesionesCrm,
    GuardiaLiderCrm,
    ServicioPersonasCrm,
    ServicioTareasCrm,
    ServicioArchivosCrm,
    ServicioCorreoCrm,
    { provide: CONFIGURACION_CORREO_CRM, useFactory: () => cargarConfiguracionCorreoCrm(process.env) },
  ],
})
export class CrmModule {}
