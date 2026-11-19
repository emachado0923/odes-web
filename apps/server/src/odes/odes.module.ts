import { Module } from '@nestjs/common';
import { OdesAdminModule } from './admin/odes-admin.module.js';
import { ChatController, INTERVALO_PING_SSE } from './chat/chat.controller.js';
import { CLIENTE_ANTHROPIC, crearClienteAnthropic } from './chat/cliente-anthropic.js';
import { INTERVALO_PING_MS } from './chat/escritor-sse.js';
import { LimitadorUso } from './chat/limitador-uso.js';
import { ServicioChat } from './chat/servicio-chat.js';
import {
  CONFIGURACION_ODES,
  type ConfiguracionOdes,
  cargarConfiguracionOdes,
} from './configuracion-odes.js';
import { OdesController } from './odes.controller.js';
import { OdesService } from './odes.service.js';
import { RepositorioModule } from './repositorio/repositorio.module.js';

/**
 * Rama /odes: Asistente ODES, un chat que responde con los documentos del
 * Repositorio del Observatorio como fuente (Claude + índice SQLite FTS5).
 *
 *   GET  /api/odes          información del sitio
 *   GET  /api/odes/estado   modo del asistente y estado del índice
 *   POST /api/odes/chat     conversación (Server-Sent Events)
 *   GET  /api/repositorio/admin/odes/indice     (admin) estado del índice
 *   POST /api/repositorio/admin/odes/reindexar  (admin) reindexar desde la base
 *
 * La configuración se lee de process.env al crear el módulo (main.ts ya
 * cargó apps/server/.env); si no es válida, el servidor no arranca.
 */
@Module({
  imports: [RepositorioModule, OdesAdminModule],
  controllers: [OdesController, ChatController],
  providers: [
    OdesService,
    { provide: CONFIGURACION_ODES, useFactory: () => cargarConfiguracionOdes(process.env) },
    {
      provide: CLIENTE_ANTHROPIC,
      useFactory: (config: ConfiguracionOdes) => crearClienteAnthropic(config),
      inject: [CONFIGURACION_ODES],
    },
    {
      provide: LimitadorUso,
      useFactory: (config: ConfiguracionOdes) => new LimitadorUso(config),
      inject: [CONFIGURACION_ODES],
    },
    { provide: INTERVALO_PING_SSE, useValue: INTERVALO_PING_MS },
    ServicioChat,
  ],
  exports: [ServicioChat],
})
export class OdesModule {}
