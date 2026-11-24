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
import { crearLlaveCuentaCorreoCrm, LLAVE_CUENTA_CORREO_CRM } from './correo/cifrado-cuenta.js';
import { CONFIGURACION_CORREO_CRM, cargarConfiguracionCorreoCrm } from './correo/configuracion-correo.js';
import { CuentaCorreoLiderCrmController } from './correo/cuenta-correo.controller.js';
import { ServicioCuentaCorreoCrm } from './correo/cuenta-correo.js';
import { FABRICA_TRANSPORTE_CORREO_CRM, ServicioCorreoCrm } from './correo/servicio-correo-crm.js';
import { crearTransporteCrm } from './correo/transporte.js';
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
 *   /api/crm/lider/correo/cuenta, /prueba correo/     (cuenta de correo guardada por el líder)
 *   archivos/  almacén crm_almacen_* y validación de archivos
 *   correo/    configuración (CRM_CORREO_*, o la cuenta cifrada de crm_correo_cuenta),
 *              plantillas y envío (crm_correos)
 *
 * Este archivo registra TODOS los controladores y proveedores del CRM: cada
 * parte implementa sus archivos sin editarlo.
 *
 * Sin base configurada el servidor arranca igual y /api/crm/* responde 503.
 * Sin CRM_CORREO_* el CRM funciona y los correos quedan «sin configurar»
 * hasta que el líder guarde la cuenta en /crm/lider/correos (migración 011).
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
    CuentaCorreoLiderCrmController,
  ],
  providers: [
    ServicioSesionesCrm,
    GuardiaLiderCrm,
    ServicioPersonasCrm,
    ServicioTareasCrm,
    ServicioArchivosCrm,
    ServicioCorreoCrm,
    ServicioCuentaCorreoCrm,
    { provide: CONFIGURACION_CORREO_CRM, useFactory: () => cargarConfiguracionCorreoCrm(process.env) },
    {
      provide: LLAVE_CUENTA_CORREO_CRM,
      useFactory: (config: ConfiguracionRepositorio) => crearLlaveCuentaCorreoCrm(process.env, config),
      inject: [CONFIGURACION_REPOSITORIO],
    },
    { provide: FABRICA_TRANSPORTE_CORREO_CRM, useValue: crearTransporteCrm },
  ],
})
export class CrmModule {}
