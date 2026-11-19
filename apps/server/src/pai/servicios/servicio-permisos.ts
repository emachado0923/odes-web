import { Inject, Injectable } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import {
  NUMEROS_BIMESTRE,
  type NumeroBimestre,
  type RolPai,
} from '../api-pai.js';
import type {
  DecisionEdicionPai,
  IndicadorEditablePai,
  OpcionesPermisosPai,
  PermisosPai,
  UsuarioPermisosPai,
} from '../compartido/tipos-servidor.js';
import {
  type AutorizacionParaRegla,
  decidirEdicion,
  MENSAJE_SOLO_LECTURA_ADMINISTRADOR,
  mensajeCerrado,
} from '../dominio/reglas-edicion.js';
import { noEncontrado, prohibido } from '../errores-pai.js';
import { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import {
  type ConsultorPai,
  consultorDe,
  fecha,
  type FilaVigenciaPai,
  numero,
} from './lectura-pai.js';

/**
 * Implementación de PermisosPai (compartido/tipos-servidor.ts): consulta la
 * cuenta (rol y activa, siempre de la base: un cambio del administrador vale
 * en la siguiente petición), las asignaciones (pai_asignaciones, por proceso
 * o por indicador), la vigencia del indicador (bimestre_abierto,
 * abierto_hasta) y las autorizaciones vigentes, y decide con
 * dominio/reglas-edicion.ts. pai.module.ts la registra también con el token
 * PERMISOS_PAI (useExisting), que es el que inyectan las evidencias.
 *
 * Para muchos indicadores a la vez (tablero, ficha, respuesta del PUT) los
 * servicios del dominio usan contexto(): una sola lectura del usuario y
 * decisiones en memoria con las mismas reglas.
 */

/** Lo que las reglas necesitan del usuario. */
export interface DatosUsuarioPermisosPai {
  usuarioId: number;
  rol: RolPai;
  activo: boolean;
  procesos: ReadonlySet<number>;
  indicadores: ReadonlySet<number>;
  /** Autorizaciones no revocadas y no vencidas al leerlas. */
  autorizaciones: readonly (AutorizacionParaRegla & {
    procesoId: number | null;
    indicadorId: number | null;
  })[];
}

/** Indicador visto por las reglas (id y proceso). */
export interface IndicadorParaPermisos {
  id: number;
  procesoId: number;
}

/** Decisiones de un usuario sobre los indicadores de una vigencia, sin más consultas. */
export class ContextoPermisosPai {
  constructor(
    readonly usuario: DatosUsuarioPermisosPai | null,
    readonly vigencia: Pick<
      FilaVigenciaPai,
      'bimestreAbierto' | 'abiertoHasta'
    >,
    readonly ahora: Date,
  ) {}

  /** ¿Ve todos los indicadores? (administrador activo). */
  get veTodo(): boolean {
    return this.usuario?.rol === 'administrador' && this.usuario.activo;
  }

  asignado(indicador: IndicadorParaPermisos): boolean {
    const usuario = this.usuario;
    if (!usuario) return false;
    return (
      usuario.indicadores.has(indicador.id) ||
      usuario.procesos.has(indicador.procesoId)
    );
  }

  /** Administrador activo: todo; responsable activo: lo asignado; inactivo: nada. */
  puedeVer(indicador: IndicadorParaPermisos): boolean {
    if (!this.usuario?.activo) return false;
    return this.veTodo || this.asignado(indicador);
  }

  decidir(
    indicador: IndicadorParaPermisos,
    bimestre: NumeroBimestre,
  ): DecisionEdicionPai {
    const usuario = this.usuario;
    if (!usuario) return { editable: false, motivo: 'sin_permiso' };
    return decidirEdicion({
      rol: usuario.rol,
      activo: usuario.activo,
      asignado: this.asignado(indicador),
      bimestre,
      bimestreAbierto: this.vigencia.bimestreAbierto,
      abiertoHasta: this.vigencia.abiertoHasta,
      autorizaciones: usuario.autorizaciones.filter(
        (a) =>
          a.indicadorId === indicador.id || a.procesoId === indicador.procesoId,
      ),
      ahora: this.ahora,
    });
  }

  /** Las 6 decisiones (índice 0 = Bimestre 1). */
  decidirTodos(indicador: IndicadorParaPermisos): DecisionEdicionPai[] {
    return NUMEROS_BIMESTRE.map((b) => this.decidir(indicador, b));
  }
}

interface FilaUsuarioBd extends RowDataPacket {
  rol: RolPai;
  activo: number;
}

interface FilaAsignacionBd extends RowDataPacket {
  proceso_id: number | null;
  indicador_id: number | null;
}

interface FilaAutorizacionBd extends RowDataPacket {
  bimestre: number;
  proceso_id: number | null;
  indicador_id: number | null;
  vigente_hasta: Date;
  revocada_en: Date | null;
}

interface FilaIndicadorPermisosBd extends RowDataPacket {
  id: number;
  codigo: string;
  proceso_id: number;
  vigencia_id: number;
  bimestre_abierto: number | null;
  abierto_hasta: Date | null;
}

/** Datos del usuario para las reglas (null si la cuenta no existe). */
export async function leerUsuarioPermisos(
  consultar: ConsultorPai,
  usuarioId: number,
  ahora: Date,
): Promise<DatosUsuarioPermisosPai | null> {
  const [usuario] = await consultar<FilaUsuarioBd>(
    'SELECT rol, activo FROM pai_usuarios WHERE id = ?',
    [usuarioId],
  );
  if (!usuario) return null;
  const rol = usuario.rol;
  const activo = Number(usuario.activo) === 1;
  const procesos = new Set<number>();
  const indicadores = new Set<number>();
  const autorizaciones: DatosUsuarioPermisosPai['autorizaciones'][number][] =
    [];
  // Solo los responsables activos tienen asignaciones y autorizaciones que cuenten.
  if (rol === 'responsable' && activo) {
    const asignaciones = await consultar<FilaAsignacionBd>(
      'SELECT proceso_id, indicador_id FROM pai_asignaciones WHERE usuario_id = ?',
      [usuarioId],
    );
    for (const fila of asignaciones) {
      if (fila.proceso_id !== null) procesos.add(Number(fila.proceso_id));
      if (fila.indicador_id !== null)
        indicadores.add(Number(fila.indicador_id));
    }
    const filas = await consultar<FilaAutorizacionBd>(
      'SELECT bimestre, proceso_id, indicador_id, vigente_hasta, revocada_en FROM pai_autorizaciones ' +
        'WHERE usuario_id = ? AND revocada_en IS NULL AND vigente_hasta > ?',
      [usuarioId, ahora],
    );
    for (const fila of filas) {
      autorizaciones.push({
        bimestre: Number(fila.bimestre) as NumeroBimestre,
        procesoId: numero(fila.proceso_id),
        indicadorId: numero(fila.indicador_id),
        vigenteHasta: fecha(fila.vigente_hasta) ?? new Date(0),
        revocadaEn: fecha(fila.revocada_en),
      });
    }
  }
  return {
    usuarioId,
    rol,
    activo,
    procesos,
    indicadores,
    autorizaciones,
  };
}

@Injectable()
export class ServicioPermisosPai implements PermisosPai {
  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
  ) {}

  /** Contexto de decisiones de un usuario sobre una vigencia (una lectura del usuario). */
  async contexto(
    sesion: UsuarioPermisosPai,
    vigencia: Pick<FilaVigenciaPai, 'bimestreAbierto' | 'abiertoHasta'>,
    opciones: OpcionesPermisosPai = {},
  ): Promise<ContextoPermisosPai> {
    const ahora = opciones.ahora ?? new Date();
    const usuario = await leerUsuarioPermisos(
      consultorDe(this.bd, opciones.conexion),
      sesion.usuarioId,
      ahora,
    );
    return new ContextoPermisosPai(usuario, vigencia, ahora);
  }

  /** Indicador (con su vigencia) y contexto del usuario; null si el indicador no existe. */
  private async cargar(
    sesion: UsuarioPermisosPai,
    indicadorId: number,
    opciones: OpcionesPermisosPai = {},
  ): Promise<{
    indicador: FilaIndicadorPermisosBd;
    contexto: ContextoPermisosPai;
  } | null> {
    const consultar = consultorDe(this.bd, opciones.conexion);
    const [indicador] = await consultar<FilaIndicadorPermisosBd>(
      'SELECT i.id, i.codigo, i.proceso_id, i.vigencia_id, v.bimestre_abierto, v.abierto_hasta ' +
        'FROM pai_indicadores i JOIN pai_vigencias v ON v.id = i.vigencia_id WHERE i.id = ?',
      [indicadorId],
    );
    if (!indicador) return null;
    const ahora = opciones.ahora ?? new Date();
    const usuario = await leerUsuarioPermisos(
      consultar,
      sesion.usuarioId,
      ahora,
    );
    const bimestreAbierto = numero(indicador.bimestre_abierto);
    return {
      indicador,
      contexto: new ContextoPermisosPai(
        usuario,
        {
          bimestreAbierto: (bimestreAbierto ?? null) as NumeroBimestre | null,
          abiertoHasta: fecha(indicador.abierto_hasta),
        },
        ahora,
      ),
    };
  }

  private static aIndicador(
    fila: FilaIndicadorPermisosBd,
  ): IndicadorParaPermisos {
    return { id: Number(fila.id), procesoId: Number(fila.proceso_id) };
  }

  async decidirEdicion(
    sesion: UsuarioPermisosPai,
    indicadorId: number,
    bimestre: NumeroBimestre,
    opciones?: OpcionesPermisosPai,
  ): Promise<DecisionEdicionPai> {
    const datos = await this.cargar(sesion, indicadorId, opciones);
    if (!datos) return { editable: false, motivo: 'sin_permiso' };
    return datos.contexto.decidir(
      ServicioPermisosPai.aIndicador(datos.indicador),
      bimestre,
    );
  }

  async puedeVer(
    sesion: UsuarioPermisosPai,
    indicadorId: number,
    opciones?: OpcionesPermisosPai,
  ): Promise<boolean> {
    const datos = await this.cargar(sesion, indicadorId, opciones);
    if (!datos) return false;
    return datos.contexto.puedeVer(
      ServicioPermisosPai.aIndicador(datos.indicador),
    );
  }

  async exigirVisible(
    sesion: UsuarioPermisosPai,
    indicadorId: number,
    opciones?: OpcionesPermisosPai,
  ): Promise<void> {
    if (!(await this.puedeVer(sesion, indicadorId, opciones))) {
      throw noEncontrado('El indicador no existe.');
    }
  }

  async exigirEdicion(
    sesion: UsuarioPermisosPai,
    indicadorId: number,
    bimestre: NumeroBimestre,
    opciones?: OpcionesPermisosPai,
  ): Promise<IndicadorEditablePai> {
    const datos = await this.cargar(sesion, indicadorId, opciones);
    const indicador = datos
      ? ServicioPermisosPai.aIndicador(datos.indicador)
      : null;
    if (!datos || !indicador || !datos.contexto.puedeVer(indicador)) {
      throw noEncontrado('El indicador no existe.');
    }
    const decision = datos.contexto.decidir(indicador, bimestre);
    if (decision.motivo === 'abierto' || decision.motivo === 'autorizado') {
      return {
        indicadorId: indicador.id,
        codigo: datos.indicador.codigo,
        procesoId: indicador.procesoId,
        vigenciaId: Number(datos.indicador.vigencia_id),
        bimestre,
        motivo: decision.motivo,
      };
    }
    if (datos.contexto.usuario?.rol === 'administrador') {
      throw prohibido(MENSAJE_SOLO_LECTURA_ADMINISTRADOR);
    }
    const { bimestreAbierto, abiertoHasta } = datos.contexto.vigencia;
    throw prohibido(mensajeCerrado(bimestre, bimestreAbierto, abiertoHasta));
  }
}
