import { Inject, Injectable } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import type {
  AutorizacionPai,
  ListaAutorizacionesPai,
  NumeroBimestre,
} from '../api-pai.js';
import { registrarEnPai } from '../compartido/registro-pai.js';
import type { SesionValidaPai } from '../compartido/tipos-servidor.js';
import { estadoAutorizacion } from '../dominio/reglas-edicion.js';
import { validarAutorizacion } from '../dominio/validacion-pai.js';
import {
  conflicto,
  noEncontrado,
  prohibido,
  solicitudInvalida,
} from '../errores-pai.js';
import { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type { ResultadoEscritura } from '../../repositorio/bd/conexion.js';
import {
  type ConsultorPai,
  consultorDe,
  fecha,
  iso,
  numero,
} from './lectura-pai.js';

/**
 * Autorizaciones para reportar un bimestre que no es el abierto
 * (pai_autorizaciones): otorgar (responsable activo, bimestre 1-6, proceso o
 * indicador existente —exactamente uno— que el responsable tenga asignado,
 * vigente_hasta futura, motivo), listar (vigentes primero) y revocar
 * (revocada_en / revocada_por; 409 si ya estaba revocada). Registra
 * 'otorgar_autorizacion' / 'revocar_autorizacion' en la misma transacción.
 */

/**
 * Máximo de autorizaciones NO vigentes (vencidas o revocadas) que devuelve
 * la lista, las más recientes. Las vigentes van siempre todas: son las que
 * dan permiso y el administrador debe poder verlas y revocarlas.
 */
export const MAX_AUTORIZACIONES_LISTA = 1000;

interface FilaAutorizacionBd extends RowDataPacket {
  id: number;
  usuario_id: number;
  usuario: string;
  nombre_usuario: string;
  bimestre: number;
  proceso_id: number | null;
  indicador_id: number | null;
  proceso_codigo: string | null;
  proceso_nombre: string | null;
  indicador_codigo: string | null;
  indicador_nombre: string | null;
  vigente_hasta: Date;
  motivo: string;
  otorgada_por: string | null;
  otorgada_en: Date;
  revocada_en: Date | null;
  revocada_por: string | null;
}

const SQL_AUTORIZACIONES =
  'SELECT a.id, a.usuario_id, u.usuario, u.nombre AS nombre_usuario, a.bimestre, a.proceso_id, a.indicador_id, ' +
  'p.codigo AS proceso_codigo, p.nombre AS proceso_nombre, i.codigo AS indicador_codigo, i.nombre AS indicador_nombre, ' +
  'a.vigente_hasta, a.motivo, og.nombre AS otorgada_por, a.otorgada_en, a.revocada_en, rv.nombre AS revocada_por ' +
  'FROM pai_autorizaciones a JOIN pai_usuarios u ON u.id = a.usuario_id ' +
  'LEFT JOIN pai_procesos p ON p.id = a.proceso_id LEFT JOIN pai_indicadores i ON i.id = a.indicador_id ' +
  'LEFT JOIN pai_usuarios og ON og.id = a.otorgada_por LEFT JOIN pai_usuarios rv ON rv.id = a.revocada_por';

function aAutorizacion(fila: FilaAutorizacionBd, ahora: Date): AutorizacionPai {
  const vigenteHasta = fecha(fila.vigente_hasta) ?? new Date(0);
  const revocadaEn = fecha(fila.revocada_en);
  const alcance =
    fila.indicador_id !== null
      ? `${fila.indicador_codigo ?? '?'} · ${fila.indicador_nombre ?? ''}`
      : `${fila.proceso_codigo ?? '?'} · ${fila.proceso_nombre ?? ''}`;
  return {
    id: Number(fila.id),
    usuarioId: Number(fila.usuario_id),
    usuario: fila.usuario,
    nombreUsuario: fila.nombre_usuario,
    bimestre: Number(fila.bimestre) as NumeroBimestre,
    procesoId: numero(fila.proceso_id),
    indicadorId: numero(fila.indicador_id),
    alcance,
    vigenteHasta: vigenteHasta.toISOString(),
    motivo: fila.motivo,
    otorgadaPor: fila.otorgada_por ?? null,
    otorgadaEn: iso(fila.otorgada_en) ?? '',
    revocadaEn: revocadaEn?.toISOString() ?? null,
    revocadaPor: fila.revocada_por ?? null,
    estado: estadoAutorizacion({ vigenteHasta, revocadaEn }, ahora),
  };
}

interface FilaUsuarioBd extends RowDataPacket {
  rol: string;
  activo: number;
  nombre: string;
}

interface FilaExisteBd extends RowDataPacket {
  id: number;
  proceso_id?: number;
}

@Injectable()
export class ServicioAutorizacionesPai {
  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
  ) {}

  private async leer(
    consultar: ConsultorPai,
    id: number,
    ahora: Date,
  ): Promise<AutorizacionPai | null> {
    const [fila] = await consultar<FilaAutorizacionBd>(
      `${SQL_AUTORIZACIONES} WHERE a.id = ?`,
      [id],
    );
    return fila ? aAutorizacion(fila, ahora) : null;
  }

  async listar(ahora = new Date()): Promise<ListaAutorizacionesPai> {
    const orden = 'ORDER BY a.otorgada_en DESC, a.id DESC';
    // Todas las vigentes (sin límite) y, aparte, las demás más recientes.
    const vigentes = await this.bd.filas<FilaAutorizacionBd>(
      `${SQL_AUTORIZACIONES} WHERE a.revocada_en IS NULL AND a.vigente_hasta > ? ${orden}`,
      [ahora],
    );
    const otras = await this.bd.filas<FilaAutorizacionBd>(
      `${SQL_AUTORIZACIONES} WHERE a.revocada_en IS NOT NULL OR a.vigente_hasta <= ? ${orden} LIMIT ?`,
      [ahora, MAX_AUTORIZACIONES_LISTA],
    );
    // Primero las vigentes; dentro de cada grupo, de la más reciente a la más antigua.
    return {
      autorizaciones: [...vigentes, ...otras].map((fila) =>
        aAutorizacion(fila, ahora),
      ),
    };
  }

  async otorgar(
    sesion: SesionValidaPai,
    cuerpo: unknown,
  ): Promise<AutorizacionPai> {
    if (sesion.rol !== 'administrador') {
      throw prohibido('Solo el administrador otorga autorizaciones.');
    }
    const ahora = new Date();
    const datos = validarAutorizacion(cuerpo, ahora);
    return this.bd.transaccion(async (conexion) => {
      const consultar = consultorDe(this.bd, conexion);
      const [usuario] = await consultar<FilaUsuarioBd>(
        'SELECT rol, activo, nombre FROM pai_usuarios WHERE id = ?',
        [datos.usuarioId],
      );
      if (!usuario) {
        throw solicitudInvalida('El usuario no existe.', {
          usuarioId: 'El usuario no existe.',
        });
      }
      if (usuario.rol !== 'responsable' || Number(usuario.activo) !== 1) {
        throw solicitudInvalida(
          'Las autorizaciones solo se otorgan a responsables con la cuenta activa.',
          { usuarioId: 'Elija un responsable activo.' },
        );
      }
      // El alcance existe y el responsable lo tiene asignado (si no, la autorización no serviría).
      let asignado: FilaExisteBd[];
      if (datos.indicadorId !== null) {
        const [indicador] = await consultar<FilaExisteBd>(
          'SELECT id, proceso_id FROM pai_indicadores WHERE id = ?',
          [datos.indicadorId],
        );
        if (!indicador) {
          throw solicitudInvalida('El indicador no existe.', {
            indicadorId: 'El indicador no existe.',
          });
        }
        asignado = await consultar<FilaExisteBd>(
          'SELECT id FROM pai_asignaciones WHERE usuario_id = ? AND (indicador_id = ? OR proceso_id = ?) LIMIT 1',
          [datos.usuarioId, datos.indicadorId, Number(indicador.proceso_id)],
        );
      } else {
        const [proceso] = await consultar<FilaExisteBd>(
          'SELECT id FROM pai_procesos WHERE id = ?',
          [datos.procesoId],
        );
        if (!proceso) {
          throw solicitudInvalida('El proceso no existe.', {
            procesoId: 'El proceso no existe.',
          });
        }
        asignado = await consultar<FilaExisteBd>(
          'SELECT a.id FROM pai_asignaciones a LEFT JOIN pai_indicadores i ON i.id = a.indicador_id ' +
            'WHERE a.usuario_id = ? AND (a.proceso_id = ? OR i.proceso_id = ?) LIMIT 1',
          [datos.usuarioId, datos.procesoId, datos.procesoId],
        );
      }
      if (asignado.length === 0) {
        throw conflicto(
          `${usuario.nombre} no tiene asignado ese ${datos.indicadorId !== null ? 'indicador' : 'proceso'}: asígneselo primero.`,
          {
            [datos.indicadorId !== null ? 'indicadorId' : 'procesoId']:
              'El responsable no lo tiene asignado.',
          },
        );
      }
      const [resultado] = await conexion.query<ResultadoEscritura>(
        'INSERT INTO pai_autorizaciones (usuario_id, bimestre, proceso_id, indicador_id, vigente_hasta, motivo, otorgada_por, otorgada_en) ' +
          'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [
          datos.usuarioId,
          datos.bimestre,
          datos.procesoId,
          datos.indicadorId,
          datos.vigenteHasta,
          datos.motivo,
          sesion.usuarioId,
          ahora,
        ],
      );
      const autorizacion = await this.leer(
        consultar,
        Number(resultado.insertId),
        ahora,
      );
      if (!autorizacion)
        throw new Error('La autorización recién creada no se encontró.');
      await registrarEnPai(conexion, {
        accion: 'otorgar_autorizacion',
        usuarioId: sesion.usuarioId,
        usuario: sesion.usuario,
        indicadorId: datos.indicadorId,
        bimestre: datos.bimestre,
        fecha: ahora,
        detalle: {
          autorizacion: autorizacion.id,
          responsable: autorizacion.usuario,
          alcance: autorizacion.alcance,
          procesoId: datos.procesoId,
          vigenteHasta: autorizacion.vigenteHasta,
          motivo: datos.motivo,
        },
      });
      return autorizacion;
    });
  }

  async revocar(sesion: SesionValidaPai, id: number): Promise<AutorizacionPai> {
    if (sesion.rol !== 'administrador') {
      throw prohibido('Solo el administrador revoca autorizaciones.');
    }
    const ahora = new Date();
    return this.bd.transaccion(async (conexion) => {
      const consultar = consultorDe(this.bd, conexion);
      const [fila] = await consultar<
        FilaExisteBd & { revocada_en: Date | null }
      >(
        'SELECT id, revocada_en FROM pai_autorizaciones WHERE id = ? FOR UPDATE',
        [id],
      );
      if (!fila) throw noEncontrado('La autorización no existe.');
      if (fila.revocada_en !== null) {
        throw conflicto('La autorización ya estaba revocada.');
      }
      await conexion.query(
        'UPDATE pai_autorizaciones SET revocada_en = ?, revocada_por = ? WHERE id = ?',
        [ahora, sesion.usuarioId, id],
      );
      const autorizacion = (await this.leer(
        consultar,
        id,
        ahora,
      )) as AutorizacionPai;
      await registrarEnPai(conexion, {
        accion: 'revocar_autorizacion',
        usuarioId: sesion.usuarioId,
        usuario: sesion.usuario,
        indicadorId: autorizacion.indicadorId,
        bimestre: autorizacion.bimestre,
        fecha: ahora,
        detalle: {
          autorizacion: autorizacion.id,
          responsable: autorizacion.usuario,
          alcance: autorizacion.alcance,
          procesoId: autorizacion.procesoId,
        },
      });
      return autorizacion;
    });
  }
}
