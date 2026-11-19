import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type {
  CodigoErrorRepositorio,
  ErrorRepositorio,
} from '../api-repositorio.js';
import { ErrorRepositorioHttp } from '../errores-repositorio.js';

/** Cabeceras de un archivo que una respuesta de error no debe heredar. */
const CABECERAS_DE_ARCHIVO = [
  'ETag',
  'Last-Modified',
  'Accept-Ranges',
  'Content-Range',
  'Content-Disposition',
  'Content-Length',
  'Content-Type',
] as const;

const CODIGO_POR_ESTADO: Readonly<Record<number, CodigoErrorRepositorio>> = {
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

const MENSAJE_POR_CODIGO: Readonly<Record<CodigoErrorRepositorio, string>> = {
  solicitud_invalida: 'La solicitud no es válida.',
  no_autenticado: 'Inicie sesión para continuar.',
  prohibido: 'No tiene permiso para hacer esto.',
  no_encontrado: 'No se encontró lo que busca.',
  conflicto: 'La operación no se puede hacer en el estado actual.',
  demasiado_grande: 'El archivo o la solicitud supera el tamaño permitido.',
  tipo_no_permitido: 'El tipo de archivo no está permitido.',
  demasiados_intentos: 'Demasiados intentos. Espere unos minutos.',
  no_disponible:
    'El repositorio no está disponible en este momento. Intente de nuevo en unos minutos.',
  interno: 'Ocurrió un error inesperado. Intente de nuevo.',
};

/**
 * Filtro de los controladores de /api/repositorio: todo error sale como JSON
 * ErrorRepositorio con Cache-Control: no-store, sin detalles internos (el
 * detalle de un 500 va solo al registro).
 */
@Catch()
export class FiltroErroresRepositorio implements ExceptionFilter {
  private readonly registro = new Logger('Repositorio');

  catch(excepcion: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) {
      // A mitad de un archivo: no hay forma de avisar, se corta la conexión.
      res.destroy();
      return;
    }
    let estado = 500;
    let cuerpo: ErrorRepositorio;
    let reintentarEn: number | undefined;
    if (excepcion instanceof ErrorRepositorioHttp) {
      estado = excepcion.getStatus();
      cuerpo = excepcion.cuerpo;
      reintentarEn = excepcion.reintentarEn;
    } else if (excepcion instanceof HttpException) {
      // Excepciones de Nest: multer (413 por tamaño, 400 por campos), rutas...
      estado = excepcion.getStatus();
      const codigo = CODIGO_POR_ESTADO[estado] ?? 'interno';
      cuerpo = {
        codigo,
        mensaje:
          estado === 413
            ? 'El archivo supera el tamaño máximo permitido.'
            : estado === 400
              ? 'La solicitud no es válida: revise el formulario (campo de archivo inesperado, demasiados campos o datos mal formados).'
              : MENSAJE_POR_CODIGO[codigo],
      };
      if (estado >= 500) this.registrar(excepcion);
    } else {
      this.registrar(excepcion);
      cuerpo = { codigo: 'interno', mensaje: MENSAJE_POR_CODIGO.interno };
    }
    for (const cabecera of CABECERAS_DE_ARCHIVO) res.removeHeader(cabecera);
    res.status(estado);
    res.setHeader('Cache-Control', 'no-store');
    if (reintentarEn !== undefined) {
      res.setHeader('Retry-After', String(reintentarEn));
    }
    res.json(cuerpo);
  }

  private registrar(excepcion: unknown): void {
    const error =
      excepcion instanceof Error ? excepcion : new Error(String(excepcion));
    this.registro.error(error.message, error.stack);
  }
}
