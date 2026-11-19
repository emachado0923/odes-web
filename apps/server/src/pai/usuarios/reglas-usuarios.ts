import type { AsignacionesPai, RolPai } from '../api-pai.js';
import { conflicto } from '../errores-pai.js';
import type { CambiosUsuarioValidos } from './validacion-usuarios.js';

/**
 * Reglas puras de la administración de usuarios del PAI (sin base): qué
 * columnas cambia un PATCH, cuándo se cierran las sesiones del usuario y
 * cómo se reemplaza su conjunto de asignaciones.
 */

/** Lo que importa del usuario para planear un cambio. */
export interface UsuarioActualPai {
  id: number;
  usuario: string;
  nombre: string;
  correo: string | null;
  cargo: string | null;
  rol: RolPai;
  activo: boolean;
  debeCambiarContrasena: boolean;
}

/** Valores de las columnas de pai_usuarios que cambian (sin el hash). */
export interface ColumnasUsuarioPai {
  nombre?: string;
  correo?: string | null;
  cargo?: string | null;
  rol?: RolPai;
  activo?: 0 | 1;
  debe_cambiar_contrasena?: 1;
}

export interface PlanCambiosUsuario {
  /** ¿Hay algo que escribir? (false: el PATCH no cambia nada). */
  hayCambios: boolean;
  columnas: ColumnasUsuarioPai;
  /** Hay que guardar el hash de la contraseña temporal nueva. */
  restablecerContrasena: boolean;
  /** Desactivado o con contraseña temporal nueva: se borran sus sesiones. */
  cerrarSesiones: boolean;
  /** Pasó a administrador: sus asignaciones sobran (ve todo). */
  borrarAsignaciones: boolean;
  /** Para el registro: valores anteriores y nuevos de lo que cambió (sin contraseñas). */
  antes: Record<string, unknown>;
  despues: Record<string, unknown>;
}

export const MENSAJE_AUTODESACTIVAR = 'No puede desactivar su propia cuenta.';
export const MENSAJE_AUTOQUITAR_ROL =
  'No puede quitarse a sí mismo el rol de administrador: pídaselo a otro administrador.';
export const MENSAJE_AUTORRESTABLECER =
  'Para cambiar su propia contraseña use la opción «Cuenta» (exige la contraseña actual).';
export const MENSAJE_ULTIMO_ADMINISTRADOR =
  'Debe quedar al menos un administrador activo en el Plan de Acción Institucional.';
export const MENSAJE_ACTOR_NO_ADMINISTRADOR =
  'Su cuenta ya no es de un administrador activo: no puede hacer este cambio.';

/**
 * Plan de un PATCH /admin/usuarios/:id hecho por el administrador `actorId`.
 * Lanza 409 si el administrador intenta desactivarse, quitarse el rol o
 * darse una contraseña temporal. Esto solo protege la cuenta propia: que
 * siempre quede al menos un administrador activo lo garantiza además
 * ServicioUsuariosPai.actualizar con bloqueos (dos administradores que se
 * desactivan uno al otro a la vez no ven el cambio del otro sin ellos).
 */
export function planificarCambiosUsuario(
  actual: UsuarioActualPai,
  cambios: CambiosUsuarioValidos,
  actorId: number,
): PlanCambiosUsuario {
  const esElMismo = actual.id === actorId;
  if (esElMismo) {
    if (cambios.activo === false && actual.activo) {
      throw conflicto(MENSAJE_AUTODESACTIVAR, {
        activo: MENSAJE_AUTODESACTIVAR,
      });
    }
    if (cambios.rol === 'responsable' && actual.rol === 'administrador') {
      throw conflicto(MENSAJE_AUTOQUITAR_ROL, { rol: MENSAJE_AUTOQUITAR_ROL });
    }
    if (cambios.contrasenaTemporal !== undefined) {
      throw conflicto(MENSAJE_AUTORRESTABLECER, {
        contrasenaTemporal: MENSAJE_AUTORRESTABLECER,
      });
    }
  }

  const columnas: ColumnasUsuarioPai = {};
  const antes: Record<string, unknown> = {};
  const despues: Record<string, unknown> = {};
  const anotar = <K extends 'nombre' | 'correo' | 'cargo' | 'rol'>(
    campo: K,
    valor: UsuarioActualPai[K] | undefined,
  ): void => {
    if (valor === undefined || valor === actual[campo]) return;
    (columnas as Record<string, unknown>)[campo] = valor;
    antes[campo] = actual[campo];
    despues[campo] = valor;
  };
  anotar('nombre', cambios.nombre);
  anotar('correo', cambios.correo);
  anotar('cargo', cambios.cargo);
  anotar('rol', cambios.rol);

  let cerrarSesiones = false;
  if (cambios.activo !== undefined && cambios.activo !== actual.activo) {
    columnas.activo = cambios.activo ? 1 : 0;
    antes.activo = actual.activo;
    despues.activo = cambios.activo;
    if (!cambios.activo) cerrarSesiones = true;
  }

  const restablecerContrasena = cambios.contrasenaTemporal !== undefined;
  if (restablecerContrasena) {
    columnas.debe_cambiar_contrasena = 1;
    antes.debeCambiarContrasena = actual.debeCambiarContrasena;
    despues.debeCambiarContrasena = true;
    despues.contrasenaTemporal = 'restablecida';
    cerrarSesiones = true;
  }

  const borrarAsignaciones =
    columnas.rol === 'administrador' && actual.rol === 'responsable';

  return {
    hayCambios: Object.keys(columnas).length > 0 || restablecerContrasena,
    columnas,
    restablecerContrasena,
    cerrarSesiones,
    borrarAsignaciones,
    antes,
    despues,
  };
}

/** ¿El plan desactiva o pasa a responsable a un administrador hoy activo? */
export function quitaUnAdministradorActivo(
  actual: Pick<UsuarioActualPai, 'rol' | 'activo'>,
  plan: Pick<PlanCambiosUsuario, 'columnas'>,
): boolean {
  if (actual.rol !== 'administrador' || !actual.activo) return false;
  return plan.columnas.activo === 0 || plan.columnas.rol === 'responsable';
}

/** Fila de pai_asignaciones del usuario (en la vigencia que se reemplaza). */
export interface AsignacionActualPai {
  id: number;
  procesoId: number | null;
  indicadorId: number | null;
}

export interface DiferenciaAsignaciones {
  /** ids de las filas de pai_asignaciones que se borran. */
  borrar: number[];
  /** Filas nuevas (exactamente uno de los dos no es null). */
  insertar: { procesoId: number | null; indicadorId: number | null }[];
  agregados: AsignacionesPai;
  quitados: AsignacionesPai;
}

/** Sin repetidos y en orden ascendente. */
function ordenar(lista: readonly number[]): number[] {
  return [...new Set(lista)].toSorted((a, b) => a - b);
}

/**
 * Cómo pasar de las asignaciones `actuales` a `nuevas` tocando lo mínimo:
 * las filas que siguen se conservan (con su fecha de creación).
 */
export function diferenciaAsignaciones(
  actuales: readonly AsignacionActualPai[],
  nuevas: AsignacionesPai,
): DiferenciaAsignaciones {
  const procesosNuevos = new Set(nuevas.procesos);
  const indicadoresNuevos = new Set(nuevas.indicadores);
  const procesosActuales = new Set<number>();
  const indicadoresActuales = new Set<number>();
  const borrar: number[] = [];
  const quitados: AsignacionesPai = { procesos: [], indicadores: [] };

  for (const fila of actuales) {
    if (fila.procesoId !== null) {
      if (
        procesosNuevos.has(fila.procesoId) &&
        !procesosActuales.has(fila.procesoId)
      ) {
        procesosActuales.add(fila.procesoId);
      } else {
        borrar.push(fila.id);
        if (!procesosNuevos.has(fila.procesoId))
          quitados.procesos.push(fila.procesoId);
      }
    } else if (fila.indicadorId !== null) {
      if (
        indicadoresNuevos.has(fila.indicadorId) &&
        !indicadoresActuales.has(fila.indicadorId)
      ) {
        indicadoresActuales.add(fila.indicadorId);
      } else {
        borrar.push(fila.id);
        if (!indicadoresNuevos.has(fila.indicadorId)) {
          quitados.indicadores.push(fila.indicadorId);
        }
      }
    } else {
      // Fila imposible por el CHECK de la tabla: se limpia.
      borrar.push(fila.id);
    }
  }

  const agregados: AsignacionesPai = {
    procesos: [...procesosNuevos].filter((id) => !procesosActuales.has(id)),
    indicadores: [...indicadoresNuevos].filter(
      (id) => !indicadoresActuales.has(id),
    ),
  };
  return {
    borrar: borrar.toSorted((a, b) => a - b),
    insertar: [
      ...ordenar(agregados.procesos).map((procesoId) => ({
        procesoId,
        indicadorId: null,
      })),
      ...ordenar(agregados.indicadores).map((indicadorId) => ({
        procesoId: null,
        indicadorId,
      })),
    ],
    agregados: {
      procesos: ordenar(agregados.procesos),
      indicadores: ordenar(agregados.indicadores),
    },
    quitados: {
      procesos: ordenar(quitados.procesos),
      indicadores: ordenar(quitados.indicadores),
    },
  };
}
