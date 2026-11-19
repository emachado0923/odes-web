import { Controller, Get, Header, Inject, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { claveLimiteIp } from '../../seguridad/clave-ip.js';
import { errorChat } from './errores-chat.js';
import { EscritorSse } from './escritor-sse.js';
import { type Rechazo, LimitadorUso } from './limitador-uso.js';
import type { ErrorChat, EstadoAsistente } from './protocolo.js';
import { seudonimoIp } from './registro-uso.js';
import { ServicioChat } from './servicio-chat.js';
import { esJson, origenPermitido, validarSolicitud } from './validacion.js';

/** Token del intervalo de ping del flujo SSE (las pruebas lo acortan). */
export const INTERVALO_PING_SSE = Symbol('INTERVALO_PING_SSE');

const MENSAJES_LIMITE: Readonly<Record<Rechazo['motivo'], string>> = {
  minuto: 'Has hecho muchas preguntas en poco tiempo. Espera un momento e intenta de nuevo.',
  dia: 'Llegaste al máximo de preguntas por hoy. Vuelve a intentarlo mañana.',
  global: 'El asistente alcanzó el máximo de consultas por hoy. Vuelve a intentarlo mañana.',
};

/**
 * Chat del Asistente ODES (protocolo en ./protocolo.ts):
 *   GET  /api/odes/estado  -> EstadoAsistente
 *   POST /api/odes/chat    -> text/event-stream con EventoChat
 * Los errores anteriores al flujo son JSON ErrorChat (400/403/413/429/503).
 */
@Controller('odes')
export class ChatController {
  constructor(
    @Inject(ServicioChat) private readonly servicio: ServicioChat,
    @Inject(LimitadorUso) private readonly limitador: LimitadorUso,
    @Inject(INTERVALO_PING_SSE) private readonly intervaloPing: number,
  ) {}

  @Get('estado')
  @Header('Cache-Control', 'no-store')
  estado(): EstadoAsistente {
    return this.servicio.estado();
  }

  @Post('chat')
  async chat(@Req() req: Request, @Res() res: Response): Promise<void> {
    if (!origenPermitido(req)) {
      return responderError(res, 403, errorChat('solicitud_invalida', 'Solicitud de otro sitio rechazada.'));
    }
    if (!esJson(req)) {
      return responderError(
        res,
        400,
        errorChat('solicitud_invalida', 'La solicitud debe enviarse como JSON (Content-Type: application/json).'),
      );
    }
    const validacion = validarSolicitud(req.body);
    if (!validacion.ok) {
      return responderError(res, validacion.status, validacion.error);
    }
    if (!this.servicio.repositorioDisponible()) {
      return responderError(
        res,
        503,
        errorChat('no_disponible', 'El repositorio de documentos no está disponible en este momento. Intenta más tarde.'),
      );
    }
    const ip = req.ip ?? req.socket.remoteAddress ?? 'desconocida';
    // Una IPv6 cuenta por su /64: rotar direcciones del mismo prefijo no da
    // cupo nuevo (ver seguridad/clave-ip.ts).
    const rechazo =
      this.limitador.intentarIp(claveLimiteIp(ip)) ??
      (this.servicio.modo === 'ia' ? this.limitador.intentarGlobal() : null);
    if (rechazo) {
      res.setHeader('Retry-After', String(rechazo.reintentarEn));
      return responderError(res, 429, errorChat('limite_uso', MENSAJES_LIMITE[rechazo.motivo]));
    }

    const escritor = new EscritorSse(res, this.intervaloPing);
    try {
      await this.servicio.responder(
        validacion.mensajes,
        (evento) => {
          escritor.enviar(evento);
        },
        escritor.senal,
        seudonimoIp(ip),
      );
    } finally {
      escritor.terminar();
    }
  }
}

function responderError(res: Response, status: number, error: ErrorChat): void {
  res.status(status).setHeader('Cache-Control', 'no-store');
  res.json(error);
}
