import type { Conexion } from '../../repositorio/bd/conexion.js';
import type { MotivoEdicion, NumeroBimestre, RolPai } from '../api-pai.js';

/**
 * Tipos que comparten los módulos del servidor del PAI (sesión, dominio y
 * evidencias). Este archivo es el punto de encuentro: cada parte programa
 * contra estas interfaces sin depender de la implementación de las otras.
 */

/**
 * Sesión validada que GuardiaPai deja en la petición y que entrega el
 * decorador @SesionPai() (sesion/guardia-pai.ts).
 */
export interface SesionValidaPai {
  /** pai_sesiones.id */
  id: number;
  /** pai_usuarios.id */
  usuarioId: number;
  usuario: string;
  nombre: string;
  rol: RolPai;
  /** Token CSRF de la sesión. */
  csrf: string;
  expira: Date;
  /** Contraseña temporal sin cambiar (la guardia solo deja pasar las rutas de la sesión). */
  debeCambiarContrasena: boolean;
}

/** Lo mínimo de la sesión que necesitan las reglas de permisos. */
export type UsuarioPermisosPai = Pick<SesionValidaPai, 'usuarioId' | 'rol'>;

/** ¿Puede el usuario editar (indicador, bimestre)? y por qué (ver MotivoEdicion). */
export interface DecisionEdicionPai {
  editable: boolean;
  motivo: MotivoEdicion;
}

/** Indicador que el usuario puede editar en un bimestre (resultado de exigirEdicion). */
export interface IndicadorEditablePai {
  indicadorId: number;
  codigo: string;
  procesoId: number;
  vigenciaId: number;
  bimestre: NumeroBimestre;
  motivo: 'abierto' | 'autorizado';
}

export interface OpcionesPermisosPai {
  /**
   * Conexión de una transacción en curso: la consulta se hace dentro de ella
   * (p. ej., al crear una evidencia). Sin ella se usa BaseDatosRepositorio.
   */
  conexion?: Conexion;
  /** Hora de la decisión (por defecto, new Date()). Las pruebas la fijan. */
  ahora?: Date;
}

/**
 * Reglas de visibilidad y edición del PAI (spec §3), siempre en el servidor:
 *
 * - Ver un indicador: el administrador ve todos; el responsable, los
 *   asignados a él (directamente o por su proceso) si su cuenta está activa.
 * - Editar (indicador, b): rol responsable, cuenta activa, indicador asignado
 *   y, además, b es el bimestre abierto de la vigencia del indicador sin
 *   pasar `abierto_hasta` (motivo 'abierto') o hay una autorización no
 *   revocada y no vencida para ese usuario y ese b que cubre el indicador o
 *   su proceso (motivo 'autorizado'). Si no: 'cerrado' (asignado) o
 *   'sin_permiso' (administrador, no asignado o inactivo).
 *
 * La implementa ServicioPermisosPai (servicios/servicio-permisos.ts, parte
 * "dominio") y se inyecta con el token PERMISOS_PAI:
 *
 *   constructor(@Inject(PERMISOS_PAI) private readonly permisos: PermisosPai) {}
 */
export interface PermisosPai {
  /** Decide sin lanzar errores (indicador inexistente: { editable: false, motivo: 'sin_permiso' }). */
  decidirEdicion(
    sesion: UsuarioPermisosPai,
    indicadorId: number,
    bimestre: NumeroBimestre,
    opciones?: OpcionesPermisosPai,
  ): Promise<DecisionEdicionPai>;

  /** ¿Puede ver el indicador? (false también si no existe). */
  puedeVer(
    sesion: UsuarioPermisosPai,
    indicadorId: number,
    opciones?: OpcionesPermisosPai,
  ): Promise<boolean>;

  /** Lanza 404 `no_encontrado` si el indicador no existe o no es visible para el usuario. */
  exigirVisible(
    sesion: UsuarioPermisosPai,
    indicadorId: number,
    opciones?: OpcionesPermisosPai,
  ): Promise<void>;

  /**
   * Lanza 404 si el indicador no existe o no es visible y 403 `prohibido`
   * (con un mensaje que explica el motivo: solo lectura del administrador,
   * bimestre cerrado, fecha límite vencida) si no es editable.
   */
  exigirEdicion(
    sesion: UsuarioPermisosPai,
    indicadorId: number,
    bimestre: NumeroBimestre,
    opciones?: OpcionesPermisosPai,
  ): Promise<IndicadorEditablePai>;
}

/** Token de inyección de PermisosPai. */
export const PERMISOS_PAI = Symbol('PERMISOS_PAI');
