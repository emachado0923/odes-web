import { Inject, Injectable } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import type {
  AccionTableroPai,
  DependenciaPai,
  IndicadorTableroPai,
  ProcesoTableroPai,
  ResumenAvancePai,
  ResumenTableroPai,
  RiesgoTableroPai,
  TableroPai,
  TipoProceso,
} from '../api-pai.js';
import type { SesionValidaPai } from '../compartido/tipos-servidor.js';
import {
  combinarResumenes,
  contarEstados,
  resumirIndicadores,
} from '../dominio/calculo-pai.js';
import { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import {
  calcularBase,
  COLUMNAS_INDICADOR,
  consultorDe,
  type FilaIndicadorBd,
  filaTablero,
  indicadorDeFila,
  leerResumenReportes,
  numero,
  porcentajeRespuesta,
  reportesPorIndicador,
  SQL_ASIGNADO,
} from './lectura-pai.js';
import { ServicioPermisosPai } from './servicio-permisos.js';
import { ServicioVigenciaPai } from './servicio-vigencia.js';

/**
 * GET /tablero: catálogos (acotados a lo que tiene indicadores visibles),
 * indicadores visibles con metas, avances, % (dominio/calculo-pai.ts),
 * estados, banderas por bimestre (las mismas reglas que PermisosPai,
 * calculadas en bloque con ServicioPermisosPai.contexto, sin una consulta
 * por indicador), conteo de evidencias y resumen por proceso, dependencia y
 * general. Sin textos largos de los reportes (esos van en la ficha).
 *
 * Tamaño medido con el PAI 2026 completo (344 indicadores, administrador):
 * ver el informe de pai-dominio.e2e-spec.ts ("tamaño del tablero").
 */

interface FilaDependenciaBd extends RowDataPacket {
  id: number;
  sigla: string;
  nombre: string;
}

interface FilaProcesoBd extends RowDataPacket {
  id: number;
  clave: string;
  codigo: string;
  nombre: string;
  dependencia_id: number;
  tipo: TipoProceso;
  programa: string | null;
  linea_plan_desarrollo: string | null;
  dimension_plan_estrategico: string | null;
  orden: number;
}

interface FilaAccionBd extends RowDataPacket {
  id: number;
  proceso_id: number;
  orden: number;
  descripcion: string;
}

interface FilaAccionRiesgoBd extends RowDataPacket {
  accion_id: number;
  riesgo_id: number;
}

interface FilaRiesgoBd extends RowDataPacket {
  id: number;
  proceso_id: number;
  numeral: number | null;
  texto: string;
  corrupcion: number;
}

/** Resultado interno: el tablero y el id de su vigencia (para la exportación). */
export interface TableroConstruidoPai {
  tablero: TableroPai;
  vigenciaId: number;
}

function redondearResumen<T extends ResumenAvancePai>(resumen: T): T {
  return {
    ...resumen,
    logros: resumen.logros.map(porcentajeRespuesta),
    avanceAnual: porcentajeRespuesta(resumen.avanceAnual),
  };
}

@Injectable()
export class ServicioTableroPai {
  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
    @Inject(ServicioVigenciaPai)
    private readonly vigencias: ServicioVigenciaPai,
    @Inject(ServicioPermisosPai)
    private readonly permisos: ServicioPermisosPai,
  ) {}

  async obtener(
    sesion: SesionValidaPai,
    anio: number | null,
  ): Promise<TableroPai> {
    return (await this.construir(sesion, anio)).tablero;
  }

  async construir(
    sesion: SesionValidaPai,
    anio: number | null,
    ahora = new Date(),
  ): Promise<TableroConstruidoPai> {
    const consultar = consultorDe(this.bd);
    const { fila: vigenciaFila, vigencia } = await this.vigencias.leer(
      anio,
      ahora,
      consultar,
    );
    const contexto = await this.permisos.contexto(sesion, vigenciaFila, {
      ahora,
    });
    const usuario = contexto.usuario;
    const vacio: TableroConstruidoPai = {
      vigenciaId: vigenciaFila.id,
      tablero: {
        vigencia,
        dependencias: [],
        procesos: [],
        riesgos: [],
        acciones: [],
        indicadores: [],
        resumen: {
          general: {
            ...resumirIndicadores([]),
            conteo: contarEstados([], vigencia.bimestreAbierto),
          },
          dependencias: [],
          procesos: [],
        },
      },
    };
    if (!usuario?.activo) return vacio;
    const soloAsignados = !contexto.veTodo;
    const vigenciaId = vigenciaFila.id;

    const filasIndicadores = await consultar<FilaIndicadorBd>(
      `SELECT ${COLUMNAS_INDICADOR} FROM pai_indicadores i WHERE i.vigencia_id = ?${soloAsignados ? ` AND ${SQL_ASIGNADO}` : ''}`,
      soloAsignados ? [vigenciaId, usuario.usuarioId] : [vigenciaId],
    );
    if (filasIndicadores.length === 0) return vacio;
    const indicadoresBase = filasIndicadores.map(indicadorDeFila);
    const reportes = reportesPorIndicador(
      await leerResumenReportes(
        consultar,
        { vigenciaId },
        soloAsignados ? usuario.usuarioId : null,
      ),
    );
    const filasDependencias = await consultar<FilaDependenciaBd>(
      'SELECT id, sigla, nombre FROM pai_dependencias WHERE vigencia_id = ? ORDER BY orden, id',
      [vigenciaId],
    );
    const filasProcesos = await consultar<FilaProcesoBd>(
      'SELECT id, clave, codigo, nombre, dependencia_id, tipo, programa, linea_plan_desarrollo, dimension_plan_estrategico, orden ' +
        'FROM pai_procesos WHERE vigencia_id = ? ORDER BY orden, id',
      [vigenciaId],
    );
    const filasAcciones = await consultar<FilaAccionBd>(
      'SELECT a.id, a.proceso_id, a.orden, a.descripcion FROM pai_acciones a JOIN pai_procesos p ON p.id = a.proceso_id ' +
        'WHERE p.vigencia_id = ? ORDER BY a.proceso_id, a.orden',
      [vigenciaId],
    );
    const filasAccionRiesgos = await consultar<FilaAccionRiesgoBd>(
      'SELECT ar.accion_id, ar.riesgo_id FROM pai_accion_riesgos ar JOIN pai_acciones a ON a.id = ar.accion_id ' +
        'JOIN pai_procesos p ON p.id = a.proceso_id WHERE p.vigencia_id = ? ORDER BY ar.accion_id, ar.orden',
      [vigenciaId],
    );
    const filasRiesgos = await consultar<FilaRiesgoBd>(
      'SELECT r.id, r.proceso_id, r.numeral, r.texto, r.corrupcion FROM pai_riesgos r JOIN pai_procesos p ON p.id = r.proceso_id ' +
        'WHERE p.vigencia_id = ? ORDER BY r.proceso_id, r.orden',
      [vigenciaId],
    );

    // Catálogos acotados a lo visible.
    const procesosVisibles = new Set(indicadoresBase.map((i) => i.procesoId));
    const accionesVisibles = new Set(indicadoresBase.map((i) => i.accionId));
    const procesos: ProcesoTableroPai[] = filasProcesos
      .filter((p) => procesosVisibles.has(Number(p.id)))
      .map((p) => ({
        id: Number(p.id),
        clave: p.clave,
        codigo: p.codigo,
        nombre: p.nombre,
        dependenciaId: Number(p.dependencia_id),
        tipo: p.tipo,
        programa: p.programa ?? null,
        lineaPlanDesarrollo: p.linea_plan_desarrollo ?? null,
        dimensionPlanEstrategico: p.dimension_plan_estrategico ?? null,
        orden: Number(p.orden),
      }));
    const dependenciasVisibles = new Set(procesos.map((p) => p.dependenciaId));
    const dependencias: DependenciaPai[] = filasDependencias
      .filter((d) => dependenciasVisibles.has(Number(d.id)))
      .map((d) => ({ id: Number(d.id), sigla: d.sigla, nombre: d.nombre }));
    const riesgosDeAccion = new Map<number, number[]>();
    for (const fila of filasAccionRiesgos) {
      const accionId = Number(fila.accion_id);
      if (!accionesVisibles.has(accionId)) continue;
      const lista = riesgosDeAccion.get(accionId) ?? [];
      lista.push(Number(fila.riesgo_id));
      riesgosDeAccion.set(accionId, lista);
    }
    const acciones: AccionTableroPai[] = filasAcciones
      .filter((a) => accionesVisibles.has(Number(a.id)))
      .map((a) => ({
        id: Number(a.id),
        procesoId: Number(a.proceso_id),
        orden: Number(a.orden),
        descripcion: a.descripcion,
        riesgoIds: riesgosDeAccion.get(Number(a.id)) ?? [],
      }));
    const riesgosUsados = new Set([...riesgosDeAccion.values()].flat());
    const riesgos: RiesgoTableroPai[] = filasRiesgos
      .filter((r) => riesgosUsados.has(Number(r.id)))
      .map((r) => ({
        id: Number(r.id),
        procesoId: Number(r.proceso_id),
        numeral: numero(r.numeral),
        texto: r.texto,
        corrupcion: Number(r.corrupcion) === 1,
      }));

    // Orden: dependencia, proceso, acción, indicador.
    const posicionDependencia = new Map(dependencias.map((d, i) => [d.id, i]));
    const procesoPorId = new Map(procesos.map((p) => [p.id, p]));
    const posicionProceso = new Map(procesos.map((p, i) => [p.id, i]));
    const ordenAccion = new Map(acciones.map((a) => [a.id, a.orden]));
    const clave = (procesoId: number, accionId: number, orden: number) => [
      posicionDependencia.get(
        procesoPorId.get(procesoId)?.dependenciaId ?? -1,
      ) ?? 0,
      posicionProceso.get(procesoId) ?? 0,
      ordenAccion.get(accionId) ?? 0,
      orden,
    ];
    indicadoresBase.sort((a, b) => {
      const ka = clave(a.procesoId, a.accionId, a.orden);
      const kb = clave(b.procesoId, b.accionId, b.orden);
      for (let i = 0; i < ka.length; i++) {
        if (ka[i] !== kb[i]) return ka[i] - kb[i];
      }
      return a.id - b.id;
    });

    const contextoFilas = {
      anio: vigencia.anio,
      bimestreAbierto: vigencia.bimestreAbierto,
      ahora,
    };
    const indicadores: IndicadorTableroPai[] = [];
    const paraResumen = new Map<
      number,
      {
        indicador: IndicadorTableroPai;
        metaTotal: number;
        calculo: ReturnType<typeof calcularBase>;
      }[]
    >();
    for (const base of indicadoresBase) {
      const deIndicador = reportes.get(base.id) ?? [
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      ];
      const calculo = calcularBase(base, deIndicador);
      const fila = filaTablero(
        base,
        deIndicador,
        contexto.decidirTodos(base),
        contextoFilas,
        calculo,
      );
      indicadores.push(fila);
      const lista = paraResumen.get(base.procesoId) ?? [];
      lista.push({ indicador: fila, metaTotal: base.metaTotal, calculo });
      paraResumen.set(base.procesoId, lista);
    }

    const resumen = this.resumir(
      procesos,
      dependencias,
      paraResumen,
      vigencia.bimestreAbierto,
    );
    return {
      vigenciaId,
      tablero: {
        vigencia,
        dependencias,
        procesos,
        riesgos,
        acciones,
        indicadores,
        resumen,
      },
    };
  }

  /**
   * Resumen por proceso (sus indicadores), dependencia (sus procesos) y
   * general (las dependencias). Los bimestres 'futuro' (todavía no se deben
   * reportar) no entran en los logros ni en el avance anual; en los demás,
   * el indicador que no reportó cuenta como 0 % (calculo-pai.ts).
   */
  private resumir(
    procesos: readonly ProcesoTableroPai[],
    dependencias: readonly DependenciaPai[],
    porProceso: Map<
      number,
      {
        indicador: IndicadorTableroPai;
        metaTotal: number;
        calculo: ReturnType<typeof calcularBase>;
      }[]
    >,
    bimestreAbierto: TableroPai['vigencia']['bimestreAbierto'],
  ): ResumenTableroPai {
    const resumenProceso = new Map<number, ResumenAvancePai>();
    for (const proceso of procesos) {
      const lista = porProceso.get(proceso.id) ?? [];
      resumenProceso.set(proceso.id, {
        // Con los % sin redondear (el redondeo es solo de la respuesta).
        ...resumirIndicadores(
          lista.map(({ indicador, metaTotal, calculo }) => ({
            metas: indicador.metas,
            porcentajes: calculo.porcentajes,
            metaTotal,
            porcentajeTotal: calculo.porcentajeTotal,
            estados: indicador.estados,
          })),
        ),
        conteo: contarEstados(
          lista.map(({ indicador }) => indicador.estados),
          bimestreAbierto,
        ),
      });
    }
    const resumenDependencia = new Map<number, ResumenAvancePai>();
    for (const dependencia of dependencias) {
      resumenDependencia.set(
        dependencia.id,
        combinarResumenes(
          procesos
            .filter((p) => p.dependenciaId === dependencia.id)
            .map((p) => resumenProceso.get(p.id) as ResumenAvancePai),
        ),
      );
    }
    const general = combinarResumenes([...resumenDependencia.values()]);
    return {
      general: redondearResumen({
        ...general,
        conteo: general.conteo ?? contarEstados([], bimestreAbierto),
      }),
      dependencias: dependencias.map((d) =>
        redondearResumen({
          dependenciaId: d.id,
          ...(resumenDependencia.get(d.id) as ResumenAvancePai),
        }),
      ),
      procesos: procesos.map((p) =>
        redondearResumen({
          procesoId: p.id,
          ...(resumenProceso.get(p.id) as ResumenAvancePai),
        }),
      ),
    };
  }
}
