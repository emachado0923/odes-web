import { Inject, Injectable } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import {
  NUMEROS_BIMESTRE,
  type NumeroBimestre,
  type OrigenReporte,
  type RespuestaReportePai,
  type RiesgoMaterializado,
} from '../api-pai.js';
import { registrarEnPai } from '../compartido/registro-pai.js';
import type { SesionValidaPai } from '../compartido/tipos-servidor.js';
import {
  CAMPOS_REPORTE,
  type CampoReporte,
  erroresRiesgo,
  validarReporte,
} from '../dominio/validacion-pai.js';
import { conflicto, solicitudInvalida } from '../errores-pai.js';
import {
  BaseDatosRepositorio,
  ErrorReintentar,
} from '../../repositorio/bd/base-datos.js';
import type { Conexion } from '../../repositorio/bd/conexion.js';
import { esDuplicado } from '../../repositorio/bd/errores-bd.js';
import {
  calcularBase,
  COLUMNAS_INDICADOR,
  consultorDe,
  estadosDe,
  fecha,
  type FilaIndicadorBd,
  filaTablero,
  indicadorDeFila,
  leerEvidencias,
  leerReportesCompletos,
  leerResumenReportes,
  leerVigencia,
  numero,
  reporteBimestre,
  reportesPorIndicador,
} from './lectura-pai.js';
import { ServicioPermisosPai } from './servicio-permisos.js';

/**
 * PUT /indicadores/:id/bimestres/:b: upsert de pai_reportes en una
 * transacción:
 *   exigirEdicion (dentro de la transacción: 404 / 403) -> validarReporte
 *   (400) -> lee el reporte con FOR UPDATE -> concurrencia optimista
 *   (actualizadoEn distinto del guardado: 409 `conflicto`) -> regla del
 *   riesgo sobre el resultado final (400) -> escribe solo si algo cambió,
 *   con origen 'aplicativo' y actualizado_por -> registrarEnPai
 *   ('guardar_reporte', detalle { antes, despues } con los campos que
 *   cambiaron) -> vuelve a leer y devuelve el reporte y la fila del tablero
 *   recalculada.
 *
 * actualizado_en es el token de concurrencia: lo pone la base (trigger en
 * Postgres; en MySQL lo fija esta escritura, siempre mayor que el anterior,
 * para que dos guardados en el mismo milisegundo no compartan token). Un
 * reporte sin avance ni textos (el que crea la primera evidencia de un
 * bimestre) no tiene nada que pisar: ahí `actualizadoEn: null` también vale
 * (la casilla pudo quedarse con el null de antes de subir la evidencia).
 * Si otro crea el reporte entre la lectura y la inserción, la transacción se
 * repite entera (ErrorReintentar) y decide con el reporte ya creado: igual
 * en MySQL y en Postgres.
 */

type ValoresReporte = {
  avance: number | null;
  logros: string | null;
  observaciones: string | null;
  riesgoMaterializado: RiesgoMaterializado | null;
  numeralRiesgo: string | null;
  descripcionRiesgo: string | null;
  fuentesVerificacion: string | null;
};

interface FilaReporteBd extends RowDataPacket {
  id: number;
  avance: number | null;
  logros: string | null;
  observaciones: string | null;
  riesgo_materializado: RiesgoMaterializado | null;
  numeral_riesgo: string | null;
  descripcion_riesgo: string | null;
  fuentes_verificacion: string | null;
  origen: OrigenReporte;
  actualizado_en: Date;
}

const VACIO: ValoresReporte = {
  avance: null,
  logros: null,
  observaciones: null,
  riesgoMaterializado: null,
  numeralRiesgo: null,
  descripcionRiesgo: null,
  fuentesVerificacion: null,
};

function valoresDeFila(fila: FilaReporteBd | undefined): ValoresReporte {
  if (!fila) return { ...VACIO };
  return {
    avance: numero(fila.avance),
    logros: fila.logros ?? null,
    observaciones: fila.observaciones ?? null,
    riesgoMaterializado: fila.riesgo_materializado ?? null,
    numeralRiesgo: fila.numeral_riesgo ?? null,
    descripcionRiesgo: fila.descripcion_riesgo ?? null,
    fuentesVerificacion: fila.fuentes_verificacion ?? null,
  };
}

/** ¿Sin avance ni ningún texto? (p. ej., creado solo para guardar evidencias). */
function sinDatos(valores: ValoresReporte): boolean {
  return Object.values(valores).every((valor) => valor === null);
}

function elegir(
  valores: ValoresReporte,
  campos: readonly CampoReporte[],
): Partial<ValoresReporte> {
  return Object.fromEntries(campos.map((campo) => [campo, valores[campo]]));
}

export const MENSAJE_CONFLICTO_REPORTE =
  'Otra persona guardó este reporte mientras usted lo editaba. Recargue para ver los cambios antes de volver a guardar.';

@Injectable()
export class ServicioReportesPai {
  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
    @Inject(ServicioPermisosPai)
    private readonly permisos: ServicioPermisosPai,
  ) {}

  async guardar(
    sesion: SesionValidaPai,
    indicadorId: number,
    bimestre: NumeroBimestre,
    cuerpo: unknown,
  ): Promise<RespuestaReportePai> {
    const ahora = new Date();
    return this.bd.transaccion(async (conexion) => {
      const editable = await this.permisos.exigirEdicion(
        sesion,
        indicadorId,
        bimestre,
        { conexion, ahora },
      );
      const datos = validarReporte(cuerpo);
      const [filas] = await conexion.query<FilaReporteBd[]>(
        'SELECT id, avance, logros, observaciones, riesgo_materializado, numeral_riesgo, descripcion_riesgo, ' +
          'fuentes_verificacion, origen, actualizado_en FROM pai_reportes WHERE indicador_id = ? AND bimestre = ? FOR UPDATE',
        [indicadorId, bimestre],
      );
      const anterior = filas[0];
      const guardadoEn = anterior ? fecha(anterior.actualizado_en) : null;
      const antes = valoresDeFila(anterior);
      if (datos.actualizadoEn !== undefined) {
        const esperado = datos.actualizadoEn?.getTime() ?? null;
        const coincide = (guardadoEn?.getTime() ?? null) === esperado;
        // null frente a un reporte vacío: no hay nada que se pueda perder.
        if (!coincide && !(esperado === null && sinDatos(antes))) {
          throw conflicto(MENSAJE_CONFLICTO_REPORTE, {
            actualizadoEn: 'El reporte cambió desde que lo abrió.',
          });
        }
      }
      const despues: ValoresReporte = { ...antes };
      for (const campo of CAMPOS_REPORTE) {
        const valor = datos[campo];
        if (valor !== undefined) {
          (despues as Record<CampoReporte, unknown>)[campo] = valor;
        }
      }
      const errores = erroresRiesgo(despues);
      if (Object.keys(errores).length > 0) {
        throw solicitudInvalida(
          'Si el riesgo se materializó, indique el numeral y la descripción.',
          errores,
        );
      }
      const cambiados = CAMPOS_REPORTE.filter(
        (campo) => antes[campo] !== despues[campo],
      );
      if (cambiados.length > 0) {
        // Siempre mayor que el anterior (ver el comentario del módulo).
        const nuevoToken = new Date(
          Math.max(ahora.getTime(), (guardadoEn?.getTime() ?? 0) + 1),
        );
        await this.escribir(
          conexion,
          anterior?.id ?? null,
          indicadorId,
          bimestre,
          despues,
          sesion.usuarioId,
          nuevoToken,
        );
        await registrarEnPai(conexion, {
          accion: 'guardar_reporte',
          usuarioId: sesion.usuarioId,
          usuario: sesion.usuario,
          indicadorId,
          codigoIndicador: editable.codigo,
          bimestre,
          fecha: ahora,
          detalle: {
            motivo: editable.motivo,
            ...(anterior && anterior.origen !== 'aplicativo'
              ? { origenAnterior: anterior.origen }
              : {}),
            nuevo: !anterior,
            antes: elegir(antes, cambiados),
            despues: elegir(despues, cambiados),
          },
        });
      }
      return this.respuesta(conexion, sesion, indicadorId, bimestre, ahora);
    });
  }

  private async escribir(
    conexion: Conexion,
    reporteId: number | null,
    indicadorId: number,
    bimestre: NumeroBimestre,
    valores: ValoresReporte,
    usuarioId: number,
    actualizadoEn: Date,
  ): Promise<void> {
    const columnas = [
      valores.avance,
      valores.logros,
      valores.observaciones,
      valores.riesgoMaterializado,
      valores.numeralRiesgo,
      valores.descripcionRiesgo,
      valores.fuentesVerificacion,
    ];
    if (reporteId !== null) {
      await conexion.query(
        'UPDATE pai_reportes SET avance = ?, logros = ?, observaciones = ?, riesgo_materializado = ?, numeral_riesgo = ?, ' +
          "descripcion_riesgo = ?, fuentes_verificacion = ?, origen = 'aplicativo', actualizado_por = ?, actualizado_en = ? WHERE id = ?",
        [...columnas, usuarioId, actualizadoEn, reporteId],
      );
      return;
    }
    try {
      await conexion.query(
        'INSERT INTO pai_reportes (indicador_id, bimestre, avance, logros, observaciones, riesgo_materializado, numeral_riesgo, ' +
          "descripcion_riesgo, fuentes_verificacion, origen, actualizado_por, actualizado_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'aplicativo', ?, ?)",
        [indicadorId, bimestre, ...columnas, usuarioId, actualizadoEn],
      );
    } catch (error) {
      // Alguien creó el reporte entre la lectura y la inserción (otro
      // guardado o la primera evidencia): se repite la transacción, que ya
      // lo encuentra y decide con la concurrencia optimista (409 solo si el
      // cliente mandó actualizadoEn y el reporte nuevo tiene datos).
      if (esDuplicado(error)) throw new ErrorReintentar(error);
      throw error;
    }
  }

  /** Reporte guardado y fila del tablero recalculada (leídos en la misma transacción). */
  private async respuesta(
    conexion: Conexion,
    sesion: SesionValidaPai,
    indicadorId: number,
    bimestre: NumeroBimestre,
    ahora: Date,
  ): Promise<RespuestaReportePai> {
    const consultar = consultorDe(this.bd, conexion);
    const [fila] = await consultar<FilaIndicadorBd & { anio: number }>(
      `SELECT ${COLUMNAS_INDICADOR}, v.anio FROM pai_indicadores i JOIN pai_vigencias v ON v.id = i.vigencia_id WHERE i.id = ?`,
      [indicadorId],
    );
    const indicador = indicadorDeFila(fila);
    const vigencia = await leerVigencia(consultar, Number(fila.anio));
    const contexto = await this.permisos.contexto(sesion, vigencia, {
      conexion,
      ahora,
    });
    const resumenes = reportesPorIndicador(
      await leerResumenReportes(consultar, { indicadorId }),
    ).get(indicadorId) ?? [
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ];
    const calculo = calcularBase(indicador, resumenes);
    const contextoFilas = {
      anio: vigencia.anio,
      bimestreAbierto: vigencia.bimestreAbierto,
      ahora,
    };
    const decisiones = contexto.decidirTodos(indicador);
    const filaIndicador = filaTablero(
      indicador,
      resumenes,
      decisiones,
      contextoFilas,
      calculo,
    );
    const completo = (await leerReportesCompletos(consultar, indicadorId)).find(
      (r) => r.bimestre === bimestre,
    );
    const evidencias = await leerEvidencias(consultar, indicadorId, bimestre);
    const indice = NUMEROS_BIMESTRE.indexOf(bimestre);
    return {
      reporte: reporteBimestre(
        indicador,
        bimestre,
        completo,
        evidencias,
        decisiones[indice],
        estadosDe(indicador, resumenes, contextoFilas)[indice],
        calculo.porcentajes[indice],
      ),
      indicador: filaIndicador,
    };
  }
}
