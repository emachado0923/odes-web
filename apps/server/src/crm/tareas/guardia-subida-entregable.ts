import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { ServicioTareasCrm } from './servicio-tareas-crm.js';
import { exigirMismoSitio, idDeRuta, ipDeEquipo, NO_EXISTE_TAREA } from './validacion-tareas.js';

/**
 * Guardias de las subidas multipart de archivos de tareas. Corren ANTES de
 * los interceptores (FileInterceptor/multer escribe el archivo completo, hasta
 * LIMITES_CRM.maxBytesArchivo, en la carpeta temporal): así una subida que de
 * todas formas se rechazaría (otro sitio, tope por IP, tarea ajena, terminada
 * o sin cupo) recibe el 403/429/404/409 sin ocupar disco. La transacción de
 * la subida vuelve a comprobar el estado y el cupo.
 */

/** POST /api/crm/personas/:personaId/tareas/:tareaId/entregables */
@Injectable()
export class GuardiaSubidaEntregableCrm implements CanActivate {
  constructor(@Inject(ServicioTareasCrm) private readonly tareas: ServicioTareasCrm) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<Request>();
    const personaId = idDeRuta(req.params['personaId'], NO_EXISTE_TAREA);
    const tareaId = idDeRuta(req.params['tareaId'], NO_EXISTE_TAREA);
    exigirMismoSitio(req);
    await this.tareas.verificarSubidaEntregable(personaId, tareaId, ipDeEquipo(req));
    return true;
  }
}

/**
 * POST /api/crm/lider/tareas/:id/adjuntos. Va después de GuardiaLiderCrm
 * (sesión, mismo sitio y CSRF), que el controlador pone primero.
 */
@Injectable()
export class GuardiaSubidaAdjuntoCrm implements CanActivate {
  constructor(@Inject(ServicioTareasCrm) private readonly tareas: ServicioTareasCrm) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const req = contexto.switchToHttp().getRequest<Request>();
    await this.tareas.verificarSubidaAdjunto(idDeRuta(req.params['id'], NO_EXISTE_TAREA));
    return true;
  }
}
