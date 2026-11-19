import { Module } from '@nestjs/common';
import { RepositorioProductosModule } from '../../repositorio/repositorio-productos.module.js';
import { RepositorioModule } from '../repositorio/repositorio.module.js';
import {
  OPCIONES_REINDEXACION,
  opcionesReindexacionDesdeEntorno,
} from './configuracion-reindexacion.js';
import { IndiceOdesAdminController } from './indice-admin.controller.js';
import { ServicioIndiceOdes } from './servicio-indice.js';

/**
 * Administración del índice del Asistente ODES desde /repositorio/admin:
 * estado del índice y reindexación con la base del repositorio como fuente.
 * Usa la guardia y la lectura que exporta RepositorioProductosModule, y el
 * índice (RepositorioOdes) de RepositorioModule.
 */
@Module({
  imports: [RepositorioProductosModule, RepositorioModule],
  controllers: [IndiceOdesAdminController],
  providers: [
    {
      provide: OPCIONES_REINDEXACION,
      useFactory: () => opcionesReindexacionDesdeEntorno(process.env),
    },
    ServicioIndiceOdes,
  ],
})
export class OdesAdminModule {}
