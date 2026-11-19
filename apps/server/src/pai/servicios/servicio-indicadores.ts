import { Inject, Injectable } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import {
  esCodigoIndicador,
  type FichaIndicadorPai,
  NUMEROS_BIMESTRE,
  type NumeroBimestre,
  type RiesgoFichaPai,
  type TipoProceso,
} from '../api-pai.js';
import type { SesionValidaPai } from '../compartido/tipos-servidor.js';
import { noEncontrado } from '../errores-pai.js';
import { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import {
  calcularBase,
  COLUMNAS_INDICADOR,
  type ConsultorPai,
  consultorDe,
  estadosDe,
  fecha,
  type FilaIndicadorBd,
  indicadorDeFila,
  leerEvidencias,
  leerReportesCompletos,
  numero,
  porcentajeRespuesta,
  reporteBimestre,
  resumenDeCompleto,
} from './lectura-pai.js';
import { ServicioPermisosPai } from './servicio-permisos.js';

/**
 * GET /indicadores/:ref[?vigencia=]: la ficha completa (proceso, acción,
 * riesgos, productos, responsables, cálculo y los 6 bimestres con textos,
 * evidencias y banderas). `ref` es el id numérico o el código (sin
 * distinguir mayúsculas). El código se busca en la vigencia `?vigencia=` o,
 * sin ella, en la más reciente que lo tenga; con un id y `?vigencia=`, el
 * indicador debe ser de esa vigencia. 404 si no existe o no es visible para
 * el usuario.
 */

interface FilaFichaBd extends FilaIndicadorBd {
  productos: string | null;
  rol_responsable: string | null;
  responsable: string | null;
  corresponsables: string | null;
  anio: number;
  bimestre_abierto: number | null;
  abierto_hasta: Date | null;
  p_clave: string;
  p_codigo: string;
  p_nombre: string;
  p_dependencia_id: number;
  p_tipo: TipoProceso;
  p_programa: string | null;
  p_linea: string | null;
  p_dimension: string | null;
  p_orden: number;
  p_codigo_proyecto: string | null;
  p_objetivo: string | null;
  d_sigla: string;
  d_nombre: string;
  a_orden: number;
  a_descripcion: string;
}

interface FilaIdBd extends RowDataPacket {
  id: number;
}

interface FilaRiesgoFichaBd extends RowDataPacket {
  id: number;
  proceso_id: number;
  numeral: number | null;
  texto: string;
  descripcion: string | null;
  corrupcion: number;
  bloque: number | null;
}

function noExiste() {
  return noEncontrado('El indicador no existe.');
}

@Injectable()
export class ServicioIndicadoresPai {
  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
    @Inject(ServicioPermisosPai)
    private readonly permisos: ServicioPermisosPai,
  ) {}

  /**
   * id del indicador de `ref` (id o código); null si no existe. Un código se
   * busca en la vigencia `anio` o, sin ella, en la más reciente que lo tenga.
   */
  async resolver(
    ref: string,
    consultar: ConsultorPai = consultorDe(this.bd),
    anio: number | null = null,
  ): Promise<number | null> {
    const texto = ref.trim();
    if (/^[1-9]\d{0,9}$/.test(texto)) {
      const id = Number(texto);
      return id <= 2_147_483_647 ? id : null;
    }
    if (!esCodigoIndicador(texto)) return null;
    const [fila] = await consultar<FilaIdBd>(
      anio === null
        ? 'SELECT i.id FROM pai_indicadores i JOIN pai_vigencias v ON v.id = i.vigencia_id WHERE i.codigo = ? ORDER BY v.anio DESC LIMIT 1'
        : 'SELECT i.id FROM pai_indicadores i JOIN pai_vigencias v ON v.id = i.vigencia_id WHERE i.codigo = ? AND v.anio = ?',
      anio === null ? [texto.toUpperCase()] : [texto.toUpperCase(), anio],
    );
    return fila ? Number(fila.id) : null;
  }

  async ficha(
    sesion: SesionValidaPai,
    ref: string,
    anio: number | null = null,
    ahora = new Date(),
  ): Promise<FichaIndicadorPai> {
    const consultar = consultorDe(this.bd);
    const id = await this.resolver(ref, consultar, anio);
    if (id === null) throw noExiste();
    const [fila] = await consultar<FilaFichaBd>(
      `SELECT ${COLUMNAS_INDICADOR}, i.productos, i.rol_responsable, i.responsable, i.corresponsables, ` +
        'v.anio, v.bimestre_abierto, v.abierto_hasta, ' +
        'p.clave AS p_clave, p.codigo AS p_codigo, p.nombre AS p_nombre, p.dependencia_id AS p_dependencia_id, ' +
        'p.tipo AS p_tipo, p.programa AS p_programa, p.linea_plan_desarrollo AS p_linea, ' +
        'p.dimension_plan_estrategico AS p_dimension, p.orden AS p_orden, p.codigo_proyecto AS p_codigo_proyecto, ' +
        'p.objetivo AS p_objetivo, d.sigla AS d_sigla, d.nombre AS d_nombre, ' +
        'a.orden AS a_orden, a.descripcion AS a_descripcion ' +
        'FROM pai_indicadores i JOIN pai_vigencias v ON v.id = i.vigencia_id ' +
        'JOIN pai_procesos p ON p.id = i.proceso_id JOIN pai_dependencias d ON d.id = p.dependencia_id ' +
        'JOIN pai_acciones a ON a.id = i.accion_id WHERE i.id = ?',
      [id],
    );
    if (!fila || (anio !== null && Number(fila.anio) !== anio)) {
      throw noExiste();
    }
    const indicador = indicadorDeFila(fila);
    const vigencia = {
      bimestreAbierto: numero(fila.bimestre_abierto) as NumeroBimestre | null,
      abiertoHasta: fecha(fila.abierto_hasta),
    };
    const contexto = await this.permisos.contexto(sesion, vigencia, { ahora });
    if (!contexto.puedeVer(indicador)) throw noExiste();

    const riesgos = await consultar<FilaRiesgoFichaBd>(
      'SELECT r.id, r.proceso_id, r.numeral, r.texto, r.descripcion, r.corrupcion, r.bloque ' +
        'FROM pai_accion_riesgos ar JOIN pai_riesgos r ON r.id = ar.riesgo_id WHERE ar.accion_id = ? ORDER BY ar.orden',
      [indicador.accionId],
    );
    const reportes = await leerReportesCompletos(consultar, indicador.id);
    const evidencias = await leerEvidencias(consultar, indicador.id);
    const porBimestre = NUMEROS_BIMESTRE.map((b) =>
      reportes.find((r) => r.bimestre === b),
    );
    const evidenciasDe = (b: number) =>
      evidencias.filter((e) => e.bimestre === b);
    const resumenes = porBimestre.map((r) =>
      r
        ? resumenDeCompleto(r, indicador.id, evidenciasDe(r.bimestre).length)
        : undefined,
    );
    const calculo = calcularBase(indicador, resumenes);
    const estados = estadosDe(indicador, resumenes, {
      anio: Number(fila.anio),
      bimestreAbierto: vigencia.bimestreAbierto,
      ahora,
    });
    const decisiones = contexto.decidirTodos(indicador);

    return {
      id: indicador.id,
      codigo: indicador.codigo,
      nombre: indicador.nombre,
      orden: indicador.orden,
      tipoMeta: indicador.tipoMeta,
      escala: indicador.escala,
      vigencia: Number(fila.anio),
      proceso: {
        id: indicador.procesoId,
        clave: fila.p_clave,
        codigo: fila.p_codigo,
        nombre: fila.p_nombre,
        dependenciaId: Number(fila.p_dependencia_id),
        tipo: fila.p_tipo,
        programa: fila.p_programa ?? null,
        lineaPlanDesarrollo: fila.p_linea ?? null,
        dimensionPlanEstrategico: fila.p_dimension ?? null,
        orden: Number(fila.p_orden),
        dependencia: {
          id: Number(fila.p_dependencia_id),
          sigla: fila.d_sigla,
          nombre: fila.d_nombre,
        },
        codigoProyecto: fila.p_codigo_proyecto ?? null,
        objetivo: fila.p_objetivo ?? null,
      },
      accion: {
        id: indicador.accionId,
        orden: Number(fila.a_orden),
        descripcion: fila.a_descripcion,
      },
      riesgos: riesgos.map((r): RiesgoFichaPai => ({
        id: Number(r.id),
        procesoId: Number(r.proceso_id),
        numeral: numero(r.numeral),
        texto: r.texto,
        corrupcion: Number(r.corrupcion) === 1,
        descripcion: r.descripcion ?? null,
        bloque: numero(r.bloque),
      })),
      productos: fila.productos ?? null,
      rolResponsable: fila.rol_responsable ?? null,
      responsable: fila.responsable ?? null,
      corresponsables: fila.corresponsables ?? null,
      metaTotal: calculo.metaTotal,
      avanceTotal: calculo.avanceTotal,
      porcentajeTotal: porcentajeRespuesta(calculo.porcentajeTotal),
      calculo: indicador.calculo,
      bimestres: NUMEROS_BIMESTRE.map((b, i) =>
        reporteBimestre(
          indicador,
          b,
          porBimestre[i],
          evidenciasDe(b),
          decisiones[i],
          estados[i],
          calculo.porcentajes[i],
        ),
      ),
    };
  }
}
