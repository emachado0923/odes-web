import { Inject, Injectable } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import {
  type EstadoBimestre,
  NUMEROS_BIMESTRE,
  nombreArchivoExportacion,
  type NumeroBimestre,
  type OrigenReporte,
  type TableroPai,
  type TipoMeta,
  type TipoProceso,
} from '../api-pai.js';
import type { SesionValidaPai } from '../compartido/tipos-servidor.js';
import {
  celdaNumero,
  celdaPorcentaje,
  celdaTexto,
  generarCsv,
} from '../dominio/csv-pai.js';
import { filtrarIndicadoresTablero } from '../dominio/filtros-pai.js';
import { validarConsultaExportacion } from '../dominio/validacion-pai.js';
import { prohibido } from '../errores-pai.js';
import { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import { fecha } from './lectura-pai.js';
import { ServicioTableroPai } from './servicio-tablero.js';

/**
 * GET /admin/exportar.csv: CSV UTF-8 con BOM y separador `;` (Excel es-CO,
 * dominio/csv-pai.ts), una fila por indicador que cumpla los filtros
 * (FiltrosTableroPai, misma semántica que el tablero web,
 * dominio/filtros-pai.ts) con dependencia, proceso, acción, código, nombre,
 * metas, avances, % y los textos del bimestre elegido (por defecto el
 * abierto o, sin bimestre abierto, el último con algún reporte). Nombre:
 * nombreArchivoExportacion(anio, bimestre).
 */
export interface ArchivoCsvPai {
  nombre: string;
  contenido: Buffer;
}

interface FilaTextosBd extends RowDataPacket {
  indicador_id: number;
  logros: string | null;
  observaciones: string | null;
  riesgo_materializado: string | null;
  numeral_riesgo: string | null;
  descripcion_riesgo: string | null;
  fuentes_verificacion: string | null;
  origen: OrigenReporte;
  actualizado_en: Date | null;
}

const NOMBRES_ESTADO: Record<EstadoBimestre, string> = {
  reportado: 'Reportado',
  pendiente: 'Pendiente',
  sin_meta: 'Sin meta',
  futuro: 'Futuro',
};

const NOMBRES_TIPO_META: Record<TipoMeta, string> = {
  numero: 'Número',
  porcentaje: 'Porcentaje',
  a_demanda: 'A demanda',
};

const NOMBRES_TIPO_PROCESO: Record<TipoProceso, string> = {
  proceso: 'Proceso',
  proyecto: 'Proyecto',
};

const NOMBRES_ORIGEN: Record<OrigenReporte, string> = {
  importado: 'Importado de los Excel',
  aplicativo: 'Aplicativo',
};

/** "2026-08-20 10:00" en hora de Colombia (Excel lo reconoce como fecha). */
const FORMATO_FECHA = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Bogota',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

export function encabezadosCsv(bimestre: NumeroBimestre): string[] {
  return [
    'Dependencia',
    'Código del proceso',
    'Proceso o proyecto',
    'Tipo',
    'Línea del Plan de Desarrollo',
    'Dimensión del Plan Estratégico',
    'Programa',
    'Acción',
    'Código del indicador',
    'Indicador',
    'Tipo de meta',
    ...NUMEROS_BIMESTRE.map((b) => `Meta bimestre ${b}`),
    'Meta total',
    ...NUMEROS_BIMESTRE.map((b) => `Avance bimestre ${b}`),
    'Avance total',
    ...NUMEROS_BIMESTRE.map((b) => `% bimestre ${b}`),
    '% total',
    `Estado bimestre ${bimestre}`,
    `Principales avances bimestre ${bimestre}`,
    `Observaciones y dificultades bimestre ${bimestre}`,
    `Riesgo materializado bimestre ${bimestre}`,
    `Numeral del riesgo bimestre ${bimestre}`,
    `Descripción del riesgo y controles bimestre ${bimestre}`,
    `Fuentes de verificación bimestre ${bimestre}`,
    `Evidencias bimestre ${bimestre}`,
    `Origen del reporte bimestre ${bimestre}`,
    `Actualizado bimestre ${bimestre}`,
  ];
}

/** Bimestre de los textos por defecto: el abierto o el último con algún reporte (o el 1). */
export function bimestrePorDefecto(tablero: TableroPai): NumeroBimestre {
  if (tablero.vigencia.bimestreAbierto !== null) {
    return tablero.vigencia.bimestreAbierto;
  }
  for (const b of NUMEROS_BIMESTRE.toReversed()) {
    if (tablero.indicadores.some((i) => i.estados[b - 1] === 'reportado')) {
      return b;
    }
  }
  return 1;
}

@Injectable()
export class ServicioExportacionPai {
  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
    @Inject(ServicioTableroPai) private readonly tablero: ServicioTableroPai,
  ) {}

  async csv(
    sesion: SesionValidaPai,
    consulta: Record<string, unknown>,
  ): Promise<ArchivoCsvPai> {
    if (sesion.rol !== 'administrador') {
      throw prohibido('Solo el administrador exporta el Plan de Acción.');
    }
    const {
      filtros,
      bimestre: pedido,
      vigencia,
    } = validarConsultaExportacion(consulta);
    const { tablero, vigenciaId } = await this.tablero.construir(
      sesion,
      vigencia,
    );
    const bimestre = pedido ?? bimestrePorDefecto(tablero);
    const indicadores = filtrarIndicadoresTablero(tablero, filtros);
    const textos = new Map(
      (
        await this.bd.filas<FilaTextosBd>(
          'SELECT r.indicador_id, r.logros, r.observaciones, r.riesgo_materializado, r.numeral_riesgo, ' +
            'r.descripcion_riesgo, r.fuentes_verificacion, r.origen, r.actualizado_en ' +
            'FROM pai_reportes r JOIN pai_indicadores i ON i.id = r.indicador_id WHERE i.vigencia_id = ? AND r.bimestre = ?',
          [vigenciaId, bimestre],
        )
      ).map((fila) => [Number(fila.indicador_id), fila]),
    );
    const procesos = new Map(tablero.procesos.map((p) => [p.id, p]));
    const dependencias = new Map(tablero.dependencias.map((d) => [d.id, d]));
    const acciones = new Map(tablero.acciones.map((a) => [a.id, a]));
    const i = bimestre - 1;
    const filas = indicadores.map((indicador) => {
      const proceso = procesos.get(indicador.procesoId);
      const dependencia = proceso
        ? dependencias.get(proceso.dependenciaId)
        : undefined;
      const reporte = textos.get(indicador.id);
      const actualizado = fecha(reporte?.actualizado_en);
      return [
        celdaTexto(dependencia?.sigla),
        celdaTexto(proceso?.codigo),
        celdaTexto(proceso?.nombre),
        celdaTexto(proceso ? NOMBRES_TIPO_PROCESO[proceso.tipo] : null),
        celdaTexto(proceso?.lineaPlanDesarrollo),
        celdaTexto(proceso?.dimensionPlanEstrategico),
        celdaTexto(proceso?.programa),
        celdaTexto(acciones.get(indicador.accionId)?.descripcion),
        celdaTexto(indicador.codigo),
        celdaTexto(indicador.nombre),
        celdaTexto(
          indicador.escala === '0-1'
            ? `${NOMBRES_TIPO_META[indicador.tipoMeta]} (escala 0 a 1)`
            : NOMBRES_TIPO_META[indicador.tipoMeta],
        ),
        ...indicador.metas.map((m) => celdaNumero(m)),
        celdaNumero(indicador.metaTotal),
        ...indicador.avances.map((a) => celdaNumero(a)),
        celdaNumero(indicador.avanceTotal),
        ...indicador.porcentajes.map((p) => celdaPorcentaje(p)),
        celdaPorcentaje(indicador.porcentajeTotal),
        celdaTexto(NOMBRES_ESTADO[indicador.estados[i]]),
        celdaTexto(reporte?.logros),
        celdaTexto(reporte?.observaciones),
        celdaTexto(reporte?.riesgo_materializado),
        celdaTexto(reporte?.numeral_riesgo),
        celdaTexto(reporte?.descripcion_riesgo),
        celdaTexto(reporte?.fuentes_verificacion),
        celdaNumero(indicador.evidencias[i]),
        celdaTexto(reporte ? NOMBRES_ORIGEN[reporte.origen] : null),
        celdaTexto(actualizado ? FORMATO_FECHA.format(actualizado) : null),
      ];
    });
    return {
      nombre: nombreArchivoExportacion(tablero.vigencia.anio, bimestre),
      contenido: generarCsv(encabezadosCsv(bimestre), filas),
    };
  }
}
