import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  type CodigoErrorPai,
  type ErrorPai,
  MENSAJES_ERROR_PAI,
} from '../api-pai.js';
import { ErrorPaiHttp, MENSAJE_OCUPADO_PAI } from '../errores-pai.js';
import {
  ErrorRepositorioHttp,
  MENSAJE_OCUPADO,
} from '../../repositorio/errores-repositorio.js';

/** Cabeceras de un archivo que una respuesta de error no debe heredar. */
const CABECERAS_DE_ARCHIVO = [
  'ETag',
  'Last-Modified',
  'Accept-Ranges',
  'Content-Range',
  'Content-Disposition',
  'Content-Length',
  'Content-Type',
  'Location',
] as const;

const CODIGO_POR_ESTADO: Readonly<Record<number, CodigoErrorPai>> = {
  400: 'solicitud_invalida',
  401: 'no_autenticado',
  403: 'prohibido',
  404: 'no_encontrado',
  405: 'solicitud_invalida',
  409: 'conflicto',
  413: 'demasiado_grande',
  415: 'tipo_no_permitido',
  429: 'demasiados_intentos',
  503: 'no_disponible',
};

/**
 * Mensajes del repositorio que no deben llegar al PAI: los de la base
 * compartida y los mensajes por defecto que hablan de documentos.
 */
const MENSAJES_DEL_REPOSITORIO = /repositorio|documento/i;

/**
 * Filtro de los controladores de /api/pai: todo error sale como JSON ErrorPai
 * con Cache-Control: no-store y mensajes del PAI, sin detalles internos (el
 * detalle de un 500 va solo al registro).
 *
 * - ErrorPaiHttp: tal cual.
 * - ErrorRepositorioHttp (BaseDatosRepositorio, helpers reutilizados del
 *   repositorio): mismo status y código, pero 503 y los mensajes que mencionan
 *   el repositorio o documentos se cambian por los del PAI.
 * - Otras HttpException (multer 413/400, rutas): código por status.
 * - Cualquier otra cosa: 500 `interno`.
 *
 * Uso: `@UseFilters(FiltroErroresPai)` en cada controlador del PAI.
 */
@Catch()
export class FiltroErroresPai implements ExceptionFilter {
  private readonly registro = new Logger('PAI');

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) {
      // A mitad de un archivo: no hay forma de avisar, se corta la conexión.
      res.destroy();
      return;
    }
    const { estado, cuerpo, reintentarEn } = this.traducir(excepcion);
    for (const cabecera of CABECERAS_DE_ARCHIVO) res.removeHeader(cabecera);
    res.status(estado);
    res.setHeader('Cache-Control', 'no-store');
    if (reintentarEn !== undefined) {
      res.setHeader('Retry-After', String(reintentarEn));
    }
    res.json(cuerpo);
  }

  /** Status, cuerpo y Retry-After de cualquier excepción (público para las pruebas). */
  traducir(excepcion: unknown): {
    estado: number;
    cuerpo: ErrorPai;
    reintentarEn: number | undefined;
  } {
    if (excepcion instanceof ErrorPaiHttp) {
      return {
        estado: excepcion.getStatus(),
        cuerpo: excepcion.cuerpo,
        reintentarEn: excepcion.reintentarEn,
      };
    }
    if (excepcion instanceof ErrorRepositorioHttp) {
      const estado = excepcion.getStatus();
      const original = excepcion.cuerpo;
      const codigo: CodigoErrorPai = original.codigo;
      let mensaje = original.mensaje;
      if (codigo === 'no_disponible') {
        mensaje =
          original.mensaje === MENSAJE_OCUPADO
            ? MENSAJE_OCUPADO_PAI
            : MENSAJES_ERROR_PAI.no_disponible;
      } else if (MENSAJES_DEL_REPOSITORIO.test(mensaje)) {
        mensaje = MENSAJES_ERROR_PAI[codigo];
      }
      if (estado >= 500 && codigo !== 'no_disponible')
        this.registrar(excepcion);
      const cuerpo: ErrorPai = { codigo, mensaje };
      if (original.campos) cuerpo.campos = original.campos;
      return { estado, cuerpo, reintentarEn: excepcion.reintentarEn };
    }
    if (excepcion instanceof HttpException) {
      const estado = excepcion.getStatus();
      const codigo = CODIGO_POR_ESTADO[estado] ?? 'interno';
      const mensaje =
        estado === 400
          ? 'La solicitud no es válida: revise los datos enviados (campo de archivo inesperado, demasiados campos o datos mal formados).'
          : MENSAJES_ERROR_PAI[codigo];
      if (estado >= 500) this.registrar(excepcion);
      return {
        estado,
        cuerpo: { codigo, mensaje },
        reintentarEn: undefined,
      };
    }
    this.registrar(excepcion);
    return {
      estado: 500,
      cuerpo: { codigo: 'interno', mensaje: MENSAJES_ERROR_PAI.interno },
      reintentarEn: undefined,
    };
  }

  private registrar(excepcion: unknown): void {
    const error =
      excepcion instanceof Error ? excepcion : new Error(String(excepcion));
    this.registro.error(error.message, error.stack);
  }
}
