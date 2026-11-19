import { Inject, Injectable } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import type {
  AsignacionesPai,
  ListaUsuariosPai,
  RolPai,
  UsuarioPai,
} from '../api-pai.js';
import { registrarEnPai } from '../compartido/registro-pai.js';
import type { SesionValidaPai } from '../compartido/tipos-servidor.js';
import {
  conflicto,
  type ErrorPaiHttp,
  noEncontrado,
  prohibido,
  solicitudInvalida,
} from '../errores-pai.js';
import { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type {
  Conexion,
  ResultadoEscritura,
} from '../../repositorio/bd/conexion.js';
import { esDuplicado } from '../../repositorio/bd/errores-bd.js';
import { hashContrasena } from '../../repositorio/dominio/contrasenas.js';
import {
  reiniciarIntentosUsuario,
  ServicioSesionesPai,
} from '../sesion/servicio-sesiones-pai.js';
import {
  type AsignacionActualPai,
  diferenciaAsignaciones,
  MENSAJE_ACTOR_NO_ADMINISTRADOR,
  MENSAJE_ULTIMO_ADMINISTRADOR,
  planificarCambiosUsuario,
  quitaUnAdministradorActivo,
  type UsuarioActualPai,
} from './reglas-usuarios.js';
import {
  validarAsignacionesPai,
  validarCambiosUsuarioPai,
  validarUsuarioNuevoPai,
} from './validacion-usuarios.js';

/**
 * Usuarios y asignaciones del PAI (solo el administrador; ver
 * usuarios-admin.controller.ts):
 * - crear: usuario PATRON_USUARIO_PAI único (409 si existe), contraseña
 *   temporal con hashContrasena y debe_cambiar_contrasena = 1;
 * - actualizar: nombre, correo, cargo, rol, activo (false cierra sus
 *   sesiones), contrasenaTemporal (reemplaza, marca debe_cambiar, cierra
 *   sesiones y levanta el bloqueo por intentos fallidos); un administrador
 *   no puede desactivarse, quitarse el rol ni darse una contraseña temporal
 *   (409); al pasar a administrador se borran sus asignaciones (el
 *   administrador ve todo). Concurrencia: la transacción bloquea la fila de
 *   quien hace el cambio y la del usuario, en orden de id, y vuelve a
 *   comprobar que quien lo hace sigue siendo administrador activo (403 si
 *   no); si el cambio desactiva o degrada a un administrador activo, cuenta
 *   con bloqueo los que quedan (409 si no quedaría ninguno). Así dos
 *   administradores que se desactivan a la vez no dejan el PAI sin
 *   administrador;
 * - asignar: reemplaza las asignaciones del usuario EN UNA VIGENCIA (la más
 *   reciente, o ?vigencia=) por los procesos e indicadores dados, que deben
 *   existir en esa vigencia (400 con campos si alguno no existe); solo
 *   responsables (409 al administrador). Las asignaciones de otras
 *   vigencias no se tocan.
 * Cada escritura va en una transacción con su fila en pai_registro
 * ('crear_usuario', 'editar_usuario', 'asignar'), sin contraseñas ni hashes.
 * Las asignaciones de UsuarioPai son las de la vigencia consultada.
 */

/** Filas por INSERT de asignaciones (muy por debajo del límite de parámetros de Postgres). */
const TAMANO_LOTE = 500;

export interface FilaUsuarioPai extends RowDataPacket {
  id: number;
  usuario: string;
  nombre: string;
  correo: string | null;
  cargo: string | null;
  rol: RolPai;
  activo: number;
  debe_cambiar_contrasena: number;
  ultimo_acceso: Date | null;
  creado_en: Date;
  actualizado_en: Date;
}

interface FilaVigencia extends RowDataPacket {
  id: number;
  anio: number;
}

interface FilaAsignacion extends RowDataPacket {
  id: number;
  usuario_id: number;
  proceso_id: number | null;
  indicador_id: number | null;
  codigo_proceso: string | null;
  codigo_indicador: string | null;
}

interface FilaCodigo extends RowDataPacket {
  id: number;
  codigo: string;
}

/** Vigencia en la que se leen o reemplazan las asignaciones. */
export interface VigenciaAsignaciones {
  id: number;
  anio: number;
}

const COLUMNAS_USUARIO =
  'id, usuario, nombre, correo, cargo, rol, activo, debe_cambiar_contrasena, ultimo_acceso, creado_en, actualizado_en';

const SQL_ASIGNACIONES = `SELECT a.id, a.usuario_id, a.proceso_id, a.indicador_id,
       p.codigo AS codigo_proceso, i.codigo AS codigo_indicador
  FROM pai_asignaciones a
  LEFT JOIN pai_procesos p ON p.id = a.proceso_id
  LEFT JOIN pai_indicadores i ON i.id = a.indicador_id
 WHERE COALESCE(p.vigencia_id, i.vigencia_id) = ?`;

function usuarioRepetido(): ErrorPaiHttp {
  return conflicto('Ya existe un usuario con ese nombre de usuario.', {
    usuario: 'Ese usuario ya existe: elija otro.',
  });
}

/** Los `ids` que no están entre los `encontrados`. */
function faltan(
  ids: readonly number[],
  encontrados: Map<number, string>,
): number[] {
  return ids.filter((id) => !encontrados.has(id));
}

function fechaIso(valor: Date | string): string {
  return new Date(valor).toISOString();
}

function aUsuarioActual(fila: FilaUsuarioPai): UsuarioActualPai {
  return {
    id: Number(fila.id),
    usuario: fila.usuario,
    nombre: fila.nombre,
    correo: fila.correo,
    cargo: fila.cargo,
    rol: fila.rol,
    activo: Number(fila.activo) === 1,
    debeCambiarContrasena: Number(fila.debe_cambiar_contrasena) === 1,
  };
}

export function aUsuarioPai(
  fila: FilaUsuarioPai,
  asignaciones: AsignacionesPai = { procesos: [], indicadores: [] },
): UsuarioPai {
  return {
    id: Number(fila.id),
    usuario: fila.usuario,
    nombre: fila.nombre,
    correo: fila.correo,
    cargo: fila.cargo,
    rol: fila.rol,
    activo: Number(fila.activo) === 1,
    debeCambiarContrasena: Number(fila.debe_cambiar_contrasena) === 1,
    ultimoAcceso: fila.ultimo_acceso ? fechaIso(fila.ultimo_acceso) : null,
    creadoEn: fechaIso(fila.creado_en),
    actualizadoEn: fechaIso(fila.actualizado_en),
    asignaciones,
  };
}

/** Asignaciones agrupadas por usuario, con los ids en orden. */
function agruparAsignaciones(
  filas: readonly FilaAsignacion[],
): Map<number, AsignacionesPai> {
  const porUsuario = new Map<number, AsignacionesPai>();
  for (const fila of filas) {
    const usuarioId = Number(fila.usuario_id);
    let asignaciones = porUsuario.get(usuarioId);
    if (!asignaciones) {
      asignaciones = { procesos: [], indicadores: [] };
      porUsuario.set(usuarioId, asignaciones);
    }
    if (fila.proceso_id !== null)
      asignaciones.procesos.push(Number(fila.proceso_id));
    else if (fila.indicador_id !== null) {
      asignaciones.indicadores.push(Number(fila.indicador_id));
    }
  }
  for (const [usuarioId, asignaciones] of porUsuario) {
    porUsuario.set(usuarioId, {
      procesos: asignaciones.procesos.toSorted((a, b) => a - b),
      indicadores: asignaciones.indicadores.toSorted((a, b) => a - b),
    });
  }
  return porUsuario;
}

@Injectable()
export class ServicioUsuariosPai {
  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
    @Inject(ServicioSesionesPai) private readonly sesiones: ServicioSesionesPai,
  ) {}

  /** Todos los usuarios, con sus asignaciones en la vigencia `anio` (null: la más reciente). */
  async listar(anio: number | null = null): Promise<ListaUsuariosPai> {
    const filas = await this.bd.filas<FilaUsuarioPai>(
      `SELECT ${COLUMNAS_USUARIO} FROM pai_usuarios ORDER BY nombre, id`,
    );
    const vigencia = await this.vigencia(null, anio);
    const asignaciones = vigencia
      ? agruparAsignaciones(
          await this.bd.filas<FilaAsignacion>(
            `${SQL_ASIGNACIONES} ORDER BY a.id`,
            [vigencia.id],
          ),
        )
      : new Map<number, AsignacionesPai>();
    return {
      usuarios: filas.map((fila) =>
        aUsuarioPai(fila, asignaciones.get(Number(fila.id))),
      ),
    };
  }

  /** Un usuario con sus asignaciones en la vigencia `anio` (404 si no existe). */
  async obtener(id: number, anio: number | null = null): Promise<UsuarioPai> {
    const [fila] = await this.bd.filas<FilaUsuarioPai>(
      `SELECT ${COLUMNAS_USUARIO} FROM pai_usuarios WHERE id = ?`,
      [id],
    );
    if (!fila) throw noEncontrado('El usuario no existe.');
    const vigencia = await this.vigencia(null, anio);
    const asignaciones = vigencia
      ? agruparAsignaciones(
          await this.bd.filas<FilaAsignacion>(
            `${SQL_ASIGNACIONES} AND a.usuario_id = ? ORDER BY a.id`,
            [vigencia.id, id],
          ),
        ).get(id)
      : undefined;
    return aUsuarioPai(fila, asignaciones);
  }

  async crear(sesion: SesionValidaPai, cuerpo: unknown): Promise<UsuarioPai> {
    const datos = validarUsuarioNuevoPai(cuerpo);
    const hash = await hashContrasena(datos.contrasenaTemporal);
    const id = await this.bd.transaccion(async (conexion) => {
      const [existentes] = await conexion.query<RowDataPacket[]>(
        'SELECT id FROM pai_usuarios WHERE usuario = ?',
        [datos.usuario],
      );
      if (existentes.length > 0) throw usuarioRepetido();
      let resultado: ResultadoEscritura;
      try {
        [resultado] = await conexion.query<ResultadoEscritura>(
          `INSERT INTO pai_usuarios (usuario, nombre, correo, cargo, rol, hash_contrasena, debe_cambiar_contrasena, activo)
           VALUES (?, ?, ?, ?, ?, ?, 1, 1)`,
          [
            datos.usuario,
            datos.nombre,
            datos.correo,
            datos.cargo,
            datos.rol,
            hash,
          ],
        );
      } catch (error) {
        if (esDuplicado(error)) throw usuarioRepetido();
        throw error;
      }
      const nuevoId = Number(resultado.insertId);
      await registrarEnPai(conexion, {
        accion: 'crear_usuario',
        usuarioId: sesion.usuarioId,
        usuario: sesion.usuario,
        detalle: {
          id: nuevoId,
          usuario: datos.usuario,
          nombre: datos.nombre,
          correo: datos.correo,
          cargo: datos.cargo,
          rol: datos.rol,
          contrasenaTemporal: true,
        },
      });
      return nuevoId;
    });
    return this.obtener(id);
  }

  async actualizar(
    sesion: SesionValidaPai,
    id: number,
    cuerpo: unknown,
  ): Promise<UsuarioPai> {
    const cambios = validarCambiosUsuarioPai(cuerpo);
    const hash =
      cambios.contrasenaTemporal !== undefined
        ? await hashContrasena(cambios.contrasenaTemporal)
        : null;
    await this.bd.transaccion(async (conexion) => {
      const actual = await this.leerParaCambiar(conexion, id, sesion.usuarioId);
      const plan = planificarCambiosUsuario(actual, cambios, sesion.usuarioId);
      if (!plan.hayCambios) return;
      if (quitaUnAdministradorActivo(actual, plan)) {
        // Con bloqueo: otra transacción no puede quitar a la vez al último.
        const [otros] = await conexion.query<RowDataPacket[]>(
          "SELECT id FROM pai_usuarios WHERE rol = 'administrador' AND activo = 1 AND id <> ? ORDER BY id FOR UPDATE",
          [id],
        );
        if (otros.length === 0) {
          throw conflicto(MENSAJE_ULTIMO_ADMINISTRADOR, {
            [plan.columnas.activo === 0 ? 'activo' : 'rol']:
              MENSAJE_ULTIMO_ADMINISTRADOR,
          });
        }
      }
      const columnas: [string, unknown][] = Object.entries(plan.columnas);
      if (plan.restablecerContrasena && hash) {
        columnas.push(['hash_contrasena', hash]);
      }
      await conexion.query(
        `UPDATE pai_usuarios SET ${columnas.map(([columna]) => `${columna} = ?`).join(', ')} WHERE id = ?`,
        [...columnas.map(([, valor]) => valor), id],
      );
      if (plan.cerrarSesiones) {
        await this.sesiones.cerrarSesionesDeUsuario(conexion, id);
      }
      if (plan.restablecerContrasena) {
        // La contraseña temporal nueva debe servir ya, aunque la cuenta
        // estuviera bloqueada por intentos fallidos.
        await reiniciarIntentosUsuario(conexion, actual.usuario);
      }
      if (plan.borrarAsignaciones) {
        await conexion.query(
          'DELETE FROM pai_asignaciones WHERE usuario_id = ?',
          [id],
        );
      }
      await registrarEnPai(conexion, {
        accion: 'editar_usuario',
        usuarioId: sesion.usuarioId,
        usuario: sesion.usuario,
        detalle: {
          id,
          usuario: actual.usuario,
          antes: plan.antes,
          despues: plan.despues,
          ...(plan.cerrarSesiones ? { sesionesCerradas: true } : {}),
          ...(plan.borrarAsignaciones ? { asignacionesBorradas: true } : {}),
        },
      });
    });
    return this.obtener(id);
  }

  async asignar(
    sesion: SesionValidaPai,
    id: number,
    cuerpo: unknown,
    anio: number | null = null,
  ): Promise<UsuarioPai> {
    const datos = validarAsignacionesPai(cuerpo);
    const vacio = datos.procesos.length === 0 && datos.indicadores.length === 0;
    const vigenciaAnio = await this.bd.transaccion(async (conexion) => {
      const usuario = await this.leerParaCambiar(
        conexion,
        id,
        sesion.usuarioId,
      );
      if (usuario.rol !== 'responsable') {
        if (vacio) return anio;
        throw conflicto(
          'Solo los responsables tienen asignaciones: el administrador ve todos los indicadores.',
        );
      }
      const vigencia = await this.vigencia(conexion, anio);
      if (!vigencia) {
        if (vacio) return anio;
        throw solicitudInvalida(
          'Todavía no hay una vigencia del PAI cargada: cargue las fichas antes de asignar.',
        );
      }

      const procesos = await this.codigos(
        conexion,
        'pai_procesos',
        vigencia.id,
        datos.procesos,
      );
      const indicadores = await this.codigos(
        conexion,
        'pai_indicadores',
        vigencia.id,
        datos.indicadores,
      );
      const campos: Record<string, string> = {};
      const procesosFaltantes = faltan(datos.procesos, procesos);
      const indicadoresFaltantes = faltan(datos.indicadores, indicadores);
      if (procesosFaltantes.length > 0) {
        campos.procesos = `No existen en la vigencia ${vigencia.anio}: ${procesosFaltantes.join(', ')}.`;
      }
      if (indicadoresFaltantes.length > 0) {
        campos.indicadores = `No existen en la vigencia ${vigencia.anio}: ${indicadoresFaltantes.join(', ')}.`;
      }
      if (Object.keys(campos).length > 0) {
        throw solicitudInvalida(
          `Algunos procesos o indicadores no existen en la vigencia ${vigencia.anio}.`,
          campos,
        );
      }

      const [filasActuales] = await conexion.query<FilaAsignacion[]>(
        `${SQL_ASIGNACIONES} AND a.usuario_id = ? ORDER BY a.id`,
        [vigencia.id, id],
      );
      const actuales: AsignacionActualPai[] = filasActuales.map((fila) => ({
        id: Number(fila.id),
        procesoId: fila.proceso_id === null ? null : Number(fila.proceso_id),
        indicadorId:
          fila.indicador_id === null ? null : Number(fila.indicador_id),
      }));
      const diferencia = diferenciaAsignaciones(actuales, datos);
      if (diferencia.borrar.length === 0 && diferencia.insertar.length === 0) {
        return vigencia.anio;
      }
      for (let i = 0; i < diferencia.borrar.length; i += TAMANO_LOTE) {
        await conexion.query('DELETE FROM pai_asignaciones WHERE id IN (?)', [
          diferencia.borrar.slice(i, i + TAMANO_LOTE),
        ]);
      }
      for (let i = 0; i < diferencia.insertar.length; i += TAMANO_LOTE) {
        const lote = diferencia.insertar
          .slice(i, i + TAMANO_LOTE)
          .map((fila) => [id, fila.procesoId, fila.indicadorId]);
        await conexion.query(
          'INSERT INTO pai_asignaciones (usuario_id, proceso_id, indicador_id) VALUES ?',
          [lote],
        );
      }

      // Códigos para el registro (los quitados salen de las filas actuales).
      const codigosQuitados = new Map<string, string>();
      for (const fila of filasActuales) {
        if (fila.proceso_id !== null && fila.codigo_proceso) {
          codigosQuitados.set(
            `p${Number(fila.proceso_id)}`,
            fila.codigo_proceso,
          );
        }
        if (fila.indicador_id !== null && fila.codigo_indicador) {
          codigosQuitados.set(
            `i${Number(fila.indicador_id)}`,
            fila.codigo_indicador,
          );
        }
      }
      const codigoProceso = (procesoId: number): string =>
        procesos.get(procesoId) ??
        codigosQuitados.get(`p${procesoId}`) ??
        String(procesoId);
      const codigoIndicador = (indicadorId: number): string =>
        indicadores.get(indicadorId) ??
        codigosQuitados.get(`i${indicadorId}`) ??
        String(indicadorId);
      await registrarEnPai(conexion, {
        accion: 'asignar',
        usuarioId: sesion.usuarioId,
        usuario: sesion.usuario,
        detalle: {
          id,
          usuario: usuario.usuario,
          vigencia: vigencia.anio,
          procesos: datos.procesos.map(codigoProceso),
          indicadores: datos.indicadores.map(codigoIndicador),
          agregados: {
            procesos: diferencia.agregados.procesos.map(codigoProceso),
            indicadores: diferencia.agregados.indicadores.map(codigoIndicador),
          },
          quitados: {
            procesos: diferencia.quitados.procesos.map(codigoProceso),
            indicadores: diferencia.quitados.indicadores.map(codigoIndicador),
          },
        },
      });
      return vigencia.anio;
    });
    return this.obtener(id, vigenciaAnio);
  }

  /**
   * Vigencia `anio` (404 si se pidió una que no existe) o, sin año, la más
   * reciente; null si todavía no hay ninguna.
   */
  private async vigencia(
    conexion: Pick<Conexion, 'query'> | null,
    anio: number | null,
  ): Promise<VigenciaAsignaciones | null> {
    const sql =
      anio === null
        ? 'SELECT id, anio FROM pai_vigencias ORDER BY anio DESC LIMIT 1'
        : 'SELECT id, anio FROM pai_vigencias WHERE anio = ?';
    const valores = anio === null ? [] : [anio];
    const filas = conexion
      ? (await conexion.query<FilaVigencia[]>(sql, valores))[0]
      : await this.bd.filas<FilaVigencia>(sql, valores);
    const fila = filas[0];
    if (!fila) {
      if (anio !== null) throw noEncontrado(`La vigencia ${anio} no existe.`);
      return null;
    }
    return { id: Number(fila.id), anio: Number(fila.anio) };
  }

  /**
   * Usuario `id` bloqueado para el resto de la transacción (404 si no
   * existe), junto con la fila de quien hace el cambio (`actorId`), las dos
   * en orden de id (sin interbloqueos entre dos cambios cruzados). La guardia
   * comprobó el rol del actor antes de la transacción; aquí se vuelve a
   * comprobar con la fila bloqueada: si otro administrador lo desactivó o le
   * quitó el rol entre tanto, 403.
   */
  private async leerParaCambiar(
    conexion: Pick<Conexion, 'query'>,
    id: number,
    actorId: number,
  ): Promise<UsuarioActualPai> {
    const ids = [...new Set([id, actorId])].toSorted((a, b) => a - b);
    const [filas] = await conexion.query<FilaUsuarioPai[]>(
      `SELECT ${COLUMNAS_USUARIO} FROM pai_usuarios WHERE id IN (?) ORDER BY id FOR UPDATE`,
      [ids],
    );
    const actor = filas.find((fila) => Number(fila.id) === actorId);
    if (!actor || actor.rol !== 'administrador' || Number(actor.activo) !== 1) {
      throw prohibido(MENSAJE_ACTOR_NO_ADMINISTRADOR);
    }
    const destino = filas.find((fila) => Number(fila.id) === id);
    if (!destino) throw noEncontrado('El usuario no existe.');
    return aUsuarioActual(destino);
  }

  /** id → código de los procesos o indicadores de la vigencia que existen entre `ids`. */
  private async codigos(
    conexion: Pick<Conexion, 'query'>,
    tabla: 'pai_procesos' | 'pai_indicadores',
    vigenciaId: number,
    ids: readonly number[],
  ): Promise<Map<number, string>> {
    const encontrados = new Map<number, string>();
    for (let i = 0; i < ids.length; i += TAMANO_LOTE) {
      const [filas] = await conexion.query<FilaCodigo[]>(
        `SELECT id, codigo FROM ${tabla} WHERE vigencia_id = ? AND id IN (?)`,
        [vigenciaId, ids.slice(i, i + TAMANO_LOTE)],
      );
      for (const fila of filas) encontrados.set(Number(fila.id), fila.codigo);
    }
    return encontrados;
  }
}
