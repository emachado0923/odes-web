import { HttpException } from '@nestjs/common';
import type {
  CodigoErrorRepositorio,
  ErrorRepositorio,
} from './api-repositorio.js';

/**
 * Error HTTP de la rama /repositorio. Extiende HttpException para que, aunque
 * lo lance la guardia de administración en un controlador de otro módulo (sin
 * FiltroErroresRepositorio), Nest responda igual el status y el cuerpo JSON
 * ErrorRepositorio { codigo, mensaje, campos? }.
 */
export class ErrorRepositorioHttp extends HttpException {
  readonly codigo: CodigoErrorRepositorio;
  readonly campos: Record<string, string> | undefined;
  /** Segundos para la cabecera Retry-After (429, 503). */
  readonly reintentarEn: number | undefined;

  constructor(
    status: number,
    codigo: CodigoErrorRepositorio,
    mensaje: string,
    opciones: { campos?: Record<string, string>; reintentarEn?: number } = {},
  ) {
    const cuerpo: ErrorRepositorio = { codigo, mensaje };
    if (opciones.campos && Object.keys(opciones.campos).length > 0) {
      cuerpo.campos = opciones.campos;
    }
    super(cuerpo, status);
    this.name = 'ErrorRepositorioHttp';
    this.codigo = codigo;
    this.campos = cuerpo.campos;
    this.reintentarEn = opciones.reintentarEn;
  }

  get cuerpo(): ErrorRepositorio {
    return this.getResponse() as ErrorRepositorio;
  }
}

export const MENSAJE_NO_DISPONIBLE =
  'El repositorio no está disponible en este momento. Intente de nuevo en unos minutos.';

export function noDisponible(reintentarEn = 30): ErrorRepositorioHttp {
  return new ErrorRepositorioHttp(503, 'no_disponible', MENSAJE_NO_DISPONIBLE, {
    reintentarEn,
  });
}

export const MENSAJE_OCUPADO =
  'El repositorio está atendiendo muchas solicitudes a la vez. Intente de nuevo en unos segundos.';

/** 503 por carga momentánea (la base funciona): mismo código, Retry-After corto. */
export function ocupado(reintentarEn = 2): ErrorRepositorioHttp {
  return new ErrorRepositorioHttp(503, 'no_disponible', MENSAJE_OCUPADO, {
    reintentarEn,
  });
}

export function noEncontrado(
  mensaje = 'El documento no existe o no está publicado.',
): ErrorRepositorioHttp {
  return new ErrorRepositorioHttp(404, 'no_encontrado', mensaje);
}

export function solicitudInvalida(
  mensaje: string,
  campos?: Record<string, string>,
): ErrorRepositorioHttp {
  return new ErrorRepositorioHttp(400, 'solicitud_invalida', mensaje, {
    campos,
  });
}

export function conflicto(mensaje: string): ErrorRepositorioHttp {
  return new ErrorRepositorioHttp(409, 'conflicto', mensaje);
}

export function noAutenticado(
  mensaje = 'Inicie sesión para continuar.',
): ErrorRepositorioHttp {
  return new ErrorRepositorioHttp(401, 'no_autenticado', mensaje);
}

export function prohibido(mensaje: string): ErrorRepositorioHttp {
  return new ErrorRepositorioHttp(403, 'prohibido', mensaje);
}

export function demasiadoGrande(
  mensaje: string,
  campos?: Record<string, string>,
): ErrorRepositorioHttp {
  return new ErrorRepositorioHttp(413, 'demasiado_grande', mensaje, { campos });
}

/** 429 con Retry-After (segundos). */
export function demasiadosIntentos(reintentarEn: number, mensaje: string): ErrorRepositorioHttp {
  return new ErrorRepositorioHttp(429, 'demasiados_intentos', mensaje, { reintentarEn });
}

export function tipoNoPermitido(
  mensaje: string,
  campos?: Record<string, string>,
): ErrorRepositorioHttp {
  return new ErrorRepositorioHttp(415, 'tipo_no_permitido', mensaje, {
    campos,
  });
}
