import type {
  EstadoAutorizacion,
  EstadoBimestre,
  NumeroBimestre,
  RolPai,
} from '../api-pai.js';
import type { DecisionEdicionPai } from '../compartido/tipos-servidor.js';

/**
 * Reglas puras de edición y de estado (spec §3), con su matriz de pruebas
 * (rol × asignación × bimestre abierto / cerrado / vencido × autorización
 * vigente / revocada / expirada) en reglas-edicion.spec.ts.
 * ServicioPermisosPai reúne los datos de la base y decide con estas
 * funciones; no hay temporizadores: todo se evalúa con la hora de la
 * petición (Vercel congela la función entre peticiones).
 */

/** Diferencia de Colombia con UTC (America/Bogota no tiene horario de verano). */
const DESFASE_COLOMBIA_MS = 5 * 60 * 60 * 1000;

/** Autorización tal como la guarda pai_autorizaciones (solo lo que decide). */
export interface AutorizacionParaRegla {
  bimestre: NumeroBimestre;
  vigenteHasta: Date;
  revocadaEn: Date | null;
}

/** vigente: no revocada y vigente_hasta todavía no llega; si no, revocada o vencida. */
export function estadoAutorizacion(
  autorizacion: Pick<AutorizacionParaRegla, 'vigenteHasta' | 'revocadaEn'>,
  ahora: Date,
): EstadoAutorizacion {
  if (autorizacion.revocadaEn !== null) return 'revocada';
  return autorizacion.vigenteHasta.getTime() > ahora.getTime()
    ? 'vigente'
    : 'vencida';
}

export interface ContextoEdicionPai {
  rol: RolPai;
  activo: boolean;
  /** El indicador está asignado al usuario (directamente o por su proceso). */
  asignado: boolean;
  bimestre: NumeroBimestre;
  bimestreAbierto: NumeroBimestre | null;
  abiertoHasta: Date | null;
  /**
   * Autorizaciones del usuario que cubren el indicador o su proceso (de
   * cualquier bimestre y estado: la regla elige las del bimestre vigentes).
   */
  autorizaciones: readonly AutorizacionParaRegla[];
  ahora: Date;
}

/** ¿Está abierto el bimestre ahora? (bimestre_abierto y sin pasar abierto_hasta). */
export function bimestreAbiertoAhora(
  bimestreAbierto: NumeroBimestre | null,
  abiertoHasta: Date | null,
  ahora: Date,
): boolean {
  if (bimestreAbierto === null) return false;
  return abiertoHasta === null || ahora.getTime() <= abiertoHasta.getTime();
}

/**
 * Puede editar (usuario, indicador, b) si es responsable, su cuenta está
 * activa, tiene el indicador asignado y, además, b es el bimestre abierto
 * dentro de su fecha límite ('abierto') o tiene una autorización vigente
 * para b ('autorizado'). Si no: 'cerrado' (responsable activo con el
 * indicador asignado) o 'sin_permiso' (administrador, no asignado o
 * inactivo). El administrador nunca edita.
 */
export function decidirEdicion(
  contexto: ContextoEdicionPai,
): DecisionEdicionPai {
  if (
    contexto.rol !== 'responsable' ||
    !contexto.activo ||
    !contexto.asignado
  ) {
    return { editable: false, motivo: 'sin_permiso' };
  }
  if (
    contexto.bimestre === contexto.bimestreAbierto &&
    bimestreAbiertoAhora(
      contexto.bimestreAbierto,
      contexto.abiertoHasta,
      contexto.ahora,
    )
  ) {
    return { editable: true, motivo: 'abierto' };
  }
  const autorizado = contexto.autorizaciones.some(
    (autorizacion) =>
      autorizacion.bimestre === contexto.bimestre &&
      estadoAutorizacion(autorizacion, contexto.ahora) === 'vigente',
  );
  if (autorizado) return { editable: true, motivo: 'autorizado' };
  return { editable: false, motivo: 'cerrado' };
}

/** Primer instante del bimestre en Colombia (Bimestre 1 = 1 de enero 00:00, hora de Bogotá). */
export function inicioBimestre(anio: number, bimestre: NumeroBimestre): Date {
  return new Date(Date.UTC(anio, (bimestre - 1) * 2, 1) + DESFASE_COLOMBIA_MS);
}

/**
 * Fin del periodo del bimestre en Colombia: el primer instante del bimestre
 * siguiente (el del Bimestre 6 es el 1 de enero del año siguiente, 00:00 de
 * Bogotá).
 */
export function finBimestre(anio: number, bimestre: NumeroBimestre): Date {
  return new Date(Date.UTC(anio, bimestre * 2, 1) + DESFASE_COLOMBIA_MS);
}

/**
 * Bimestre de referencia de la vigencia: hasta él los bimestres ya se deben
 * reportar. Es el bimestre abierto (bimestre_abierto, aunque haya pasado su
 * fecha límite) o, sin bimestre abierto, el último cuyo periodo ya terminó en
 * hora de Colombia; 0 si todavía no ha terminado ninguno (p. ej., una
 * vigencia que no ha empezado).
 */
export function bimestreReferencia(
  anioVigencia: number,
  bimestreAbierto: NumeroBimestre | null,
  ahora: Date,
): NumeroBimestre | 0 {
  if (bimestreAbierto !== null) return bimestreAbierto;
  let referencia: NumeroBimestre | 0 = 0;
  for (const b of [1, 2, 3, 4, 5, 6] as const) {
    if (finBimestre(anioVigencia, b).getTime() <= ahora.getTime()) {
      referencia = b;
    }
  }
  return referencia;
}

export interface ContextoEstadoPai {
  meta: number;
  /** Tiene avance (aunque sea 0) o algún texto. */
  reportado: boolean;
  bimestre: NumeroBimestre;
  bimestreAbierto: NumeroBimestre | null;
  anioVigencia: number;
  ahora: Date;
}

/**
 * ¿Todavía no se debe reportar el bimestre? Es posterior al bimestre de
 * referencia (bimestreReferencia) o aún no empieza. El bimestre abierto
 * nunca es futuro.
 */
export function bimestreFuturo(
  contexto: Pick<
    ContextoEstadoPai,
    'bimestre' | 'bimestreAbierto' | 'anioVigencia' | 'ahora'
  >,
): boolean {
  const { bimestre, bimestreAbierto, anioVigencia, ahora } = contexto;
  if (bimestre === bimestreAbierto) return false;
  if (bimestre > bimestreReferencia(anioVigencia, bimestreAbierto, ahora)) {
    return true;
  }
  return inicioBimestre(anioVigencia, bimestre).getTime() > ahora.getTime();
}

/**
 * EstadoBimestre (ver api-pai.ts): reportado > futuro > pendiente > sin_meta.
 * Un bimestre que todavía no se debe reportar (bimestreFuturo) y no tiene
 * nada queda 'futuro', nunca 'pendiente': no es un incumplimiento.
 */
export function estadoBimestre(contexto: ContextoEstadoPai): EstadoBimestre {
  if (contexto.reportado) return 'reportado';
  if (bimestreFuturo(contexto)) return 'futuro';
  return contexto.meta > 0 ? 'pendiente' : 'sin_meta';
}

/** Fecha y hora de Colombia para los mensajes ("15 de septiembre de 2026, 11:59 p. m."). */
export function fechaColombia(fecha: Date): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(fecha);
}

/**
 * Mensaje del 403 cuando el responsable tiene el indicador asignado pero la
 * casilla está cerrada (motivo 'cerrado').
 */
export function mensajeCerrado(
  bimestre: NumeroBimestre,
  bimestreAbierto: NumeroBimestre | null,
  abiertoHasta: Date | null,
): string {
  if (bimestreAbierto === null) {
    return `No hay un bimestre abierto para reportar. Pida al administrador que abra el Bimestre ${bimestre} o le otorgue una autorización.`;
  }
  if (bimestre === bimestreAbierto && abiertoHasta !== null) {
    return `El plazo para reportar el Bimestre ${bimestre} venció el ${fechaColombia(abiertoHasta)}. Pida al administrador una autorización para modificarlo.`;
  }
  return `El Bimestre ${bimestre} está cerrado: solo se puede reportar el Bimestre ${bimestreAbierto}. Pida al administrador una autorización para modificarlo.`;
}

/** Mensaje del 403 para el administrador (solo lectura de los reportes). */
export const MENSAJE_SOLO_LECTURA_ADMINISTRADOR =
  'El administrador consulta los reportes en solo lectura: los diligencia el responsable del indicador.';
