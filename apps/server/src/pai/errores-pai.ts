import { HttpException } from '@nestjs/common';
import {
  type CodigoErrorPai,
  type ErrorPai,
  LIMITES_PAI,
  MENSAJES_ERROR_PAI,
} from './api-pai.js';

/**
 * Errores HTTP de la rama /pai, con el cuerpo ErrorPai { codigo, mensaje,
 * campos? } y mensajes propios del PAI (no los del repositorio). Extiende
 * HttpException para que Nest responda igual el status y el cuerpo aunque el
 * error salga de una guardia. Los controladores del PAI usan además
 * FiltroErroresPai (http/filtro-errores-pai.ts), que también traduce los
 * errores de la base compartida (BaseDatosRepositorio lanza
 * ErrorRepositorioHttp "El repositorio no está disponible…").
 */
export class ErrorPaiHttp extends HttpException {
  readonly codigo: CodigoErrorPai;
  readonly campos: Record<string, string> | undefined;
  /** Segundos para la cabecera Retry-After (429, 503). */
  readonly reintentarEn: number | undefined;

  constructor(
    status: number,
    codigo: CodigoErrorPai,
    mensaje: string,
    opciones: { campos?: Record<string, string>; reintentarEn?: number } = {},
  ) {
    const cuerpo: ErrorPai = { codigo, mensaje };
    if (opciones.campos && Object.keys(opciones.campos).length > 0) {
      cuerpo.campos = opciones.campos;
    }
    super(cuerpo, status);
    this.name = 'ErrorPaiHttp';
    // Por defecto Nest pondría "Error Pai Http": así el registro y las
    // pruebas ven el mensaje real.
    this.message = mensaje;
    this.codigo = codigo;
    this.campos = cuerpo.campos;
    this.reintentarEn = opciones.reintentarEn;
  }

  get cuerpo(): ErrorPai {
    return this.getResponse() as ErrorPai;
  }
}

export const MENSAJE_NO_DISPONIBLE_PAI = MENSAJES_ERROR_PAI.no_disponible;

export const MENSAJE_OCUPADO_PAI =
  'El Plan de Acción Institucional está atendiendo muchas solicitudes a la vez. Intente de nuevo en unos segundos.';

/** 503: la base no está disponible (o le falta la migración 003). */
export function noDisponible(reintentarEn = 30): ErrorPaiHttp {
  return new ErrorPaiHttp(503, 'no_disponible', MENSAJE_NO_DISPONIBLE_PAI, {
    reintentarEn,
  });
}

/** 503 por carga momentánea (la base funciona): Retry-After corto. */
export function ocupado(reintentarEn = 2): ErrorPaiHttp {
  return new ErrorPaiHttp(503, 'no_disponible', MENSAJE_OCUPADO_PAI, {
    reintentarEn,
  });
}

export function noEncontrado(
  mensaje = MENSAJES_ERROR_PAI.no_encontrado,
): ErrorPaiHttp {
  return new ErrorPaiHttp(404, 'no_encontrado', mensaje);
}

export function solicitudInvalida(
  mensaje: string,
  campos?: Record<string, string>,
): ErrorPaiHttp {
  return new ErrorPaiHttp(400, 'solicitud_invalida', mensaje, { campos });
}

export function conflicto(
  mensaje: string,
  campos?: Record<string, string>,
): ErrorPaiHttp {
  return new ErrorPaiHttp(409, 'conflicto', mensaje, { campos });
}

export function noAutenticado(
  mensaje = MENSAJES_ERROR_PAI.no_autenticado,
): ErrorPaiHttp {
  return new ErrorPaiHttp(401, 'no_autenticado', mensaje);
}

export function prohibido(
  mensaje = MENSAJES_ERROR_PAI.prohibido,
): ErrorPaiHttp {
  return new ErrorPaiHttp(403, 'prohibido', mensaje);
}

/** 403 mientras la sesión tiene una contraseña temporal sin cambiar. */
export function cambioContrasenaRequerido(): ErrorPaiHttp {
  return new ErrorPaiHttp(
    403,
    'cambio_contrasena_requerido',
    MENSAJES_ERROR_PAI.cambio_contrasena_requerido,
  );
}

export function demasiadoGrande(
  mensaje = MENSAJES_ERROR_PAI.demasiado_grande,
  campos?: Record<string, string>,
): ErrorPaiHttp {
  return new ErrorPaiHttp(413, 'demasiado_grande', mensaje, { campos });
}

export function tipoNoPermitido(
  mensaje = MENSAJES_ERROR_PAI.tipo_no_permitido,
  campos?: Record<string, string>,
): ErrorPaiHttp {
  return new ErrorPaiHttp(415, 'tipo_no_permitido', mensaje, { campos });
}

/** 429 del inicio de sesión bloqueado (Retry-After en segundos). */
export function demasiadosIntentos(
  reintentarEn: number,
  mensaje = MENSAJES_ERROR_PAI.demasiados_intentos,
): ErrorPaiHttp {
  return new ErrorPaiHttp(429, 'demasiados_intentos', mensaje, {
    reintentarEn,
  });
}

/** 409 al superar LIMITES_PAI.maxEvidenciasPorReporte. */
export function demasiadasEvidencias(): ErrorPaiHttp {
  return conflicto(
    `Este reporte ya tiene ${LIMITES_PAI.maxEvidenciasPorReporte} evidencias, el máximo permitido. Borre alguna antes de subir otra.`,
  );
}
