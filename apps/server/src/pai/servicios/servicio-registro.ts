import { Inject, Injectable } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import {
  type AccionRegistroPai,
  LIMITES_PAI,
  type NumeroBimestre,
  type PaginaRegistroPai,
} from '../api-pai.js';
import { validarConsultaRegistro } from '../dominio/validacion-pai.js';
import { objetoJson } from '../carga/datos-fichas.js';
import { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import { iso, numero } from './lectura-pai.js';

/**
 * GET /admin/registro: auditoría paginada (LIMITES_PAI.registroPorPagina,
 * más reciente primero) con filtros usuario (id), indicador (id o código) y
 * accion. `detalle` sale como objeto (JSON.parse; null si no es JSON). La
 * escritura es registrarEnPai (compartido/registro-pai.ts).
 */

interface FilaRegistroBd extends RowDataPacket {
  id: number;
  fecha: Date;
  usuario_id: number | null;
  usuario: string | null;
  accion: AccionRegistroPai;
  indicador_id: number | null;
  codigo_indicador: string | null;
  bimestre: number | null;
  detalle: string | null;
}

interface FilaTotalBd extends RowDataPacket {
  total: number;
}

@Injectable()
export class ServicioRegistroPai {
  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
  ) {}

  async listar(consulta: Record<string, unknown>): Promise<PaginaRegistroPai> {
    const filtros = validarConsultaRegistro(consulta);
    const condiciones: string[] = [];
    const valores: unknown[] = [];
    if (filtros.usuario !== null) {
      condiciones.push('usuario_id = ?');
      valores.push(filtros.usuario);
    }
    if (typeof filtros.indicador === 'number') {
      condiciones.push('indicador_id = ?');
      valores.push(filtros.indicador);
    } else if (typeof filtros.indicador === 'string') {
      condiciones.push('codigo_indicador = ?');
      valores.push(filtros.indicador);
    }
    if (filtros.accion !== null) {
      condiciones.push('accion = ?');
      valores.push(filtros.accion);
    }
    const donde =
      condiciones.length > 0 ? ` WHERE ${condiciones.join(' AND ')}` : '';
    const porPagina = LIMITES_PAI.registroPorPagina;
    const [conteo] = await this.bd.filas<FilaTotalBd>(
      `SELECT COUNT(*) AS total FROM pai_registro${donde}`,
      valores,
    );
    const filas = await this.bd.filas<FilaRegistroBd>(
      'SELECT id, fecha, usuario_id, usuario, accion, indicador_id, codigo_indicador, bimestre, detalle ' +
        `FROM pai_registro${donde} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...valores, porPagina, (filtros.pagina - 1) * porPagina],
    );
    return {
      entradas: filas.map((fila) => ({
        id: Number(fila.id),
        fecha: iso(fila.fecha) ?? '',
        usuarioId: numero(fila.usuario_id),
        usuario: fila.usuario ?? null,
        accion: fila.accion,
        indicadorId: numero(fila.indicador_id),
        codigoIndicador: fila.codigo_indicador ?? null,
        bimestre: numero(fila.bimestre) as NumeroBimestre | null,
        detalle: objetoJson(fila.detalle),
      })),
      pagina: filtros.pagina,
      porPagina,
      total: Number(conteo?.total ?? 0),
    };
  }
}
