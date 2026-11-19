/**
 * Datos de prueba del tablero y de la ficha del PAI (solo para las pruebas:
 * ningún componente lo importa). Un tablero pequeño con dos dependencias,
 * tres procesos (uno es proyecto, con programa), riesgos, acciones y cuatro
 * indicadores, con el bimestre 4 abierto:
 *
 *   SAF (1) ── SAF-TH (10, proceso) ── acción 1000 [riesgo 100 (RC)] ── SAF-TH-01 (1)
 *           │                       └─ acción 1001 [riesgo 101]      ── SAF-TH-02 (2)
 *           └─ SAF-AC (11, proceso) ── acción 1100 [riesgo 110]      ── SAF-AC-01 (3)
 *   OPE (2) ── OPE-PPEP (20, proyecto, programa) ── acción 2000 [riesgo 200] ── OPE-PPEP-16 (4)
 *
 * Para el responsable, solo el bimestre 4 de SAF-TH-01 y de OPE-PPEP-16 es
 * editable; el administrador ve todo en solo lectura.
 */
import type {
  FichaIndicadorPai,
  IndicadorTableroPai,
  MotivoEdicion,
  NumeroBimestre,
  ReporteBimestrePai,
  RespuestaReportePai,
  RolPai,
  TableroPai,
  VigenciaPai,
} from '../api-pai'
import { vigenciaPrueba } from '../pruebas/datosPrueba'

export const FECHA_PRUEBA = '2026-07-10T15:00:00.000Z'

export function indicadorPrueba(cambios: Partial<IndicadorTableroPai> & Pick<IndicadorTableroPai, 'id' | 'codigo'>): IndicadorTableroPai {
  return {
    nombre: `Indicador ${cambios.codigo}`,
    procesoId: 10,
    accionId: 1000,
    orden: 1,
    tipoMeta: 'numero',
    metas: [2, 2, 2, 2, 2, 2],
    metaTotal: 12,
    avances: [2, 1, 0, null, null, null],
    avanceTotal: 3,
    porcentajes: [1, 0.5, 0, null, null, null],
    porcentajeTotal: 0.25,
    estados: ['reportado', 'reportado', 'reportado', 'pendiente', 'futuro', 'futuro'],
    editables: [false, false, false, false, false, false],
    motivos: ['cerrado', 'cerrado', 'cerrado', 'cerrado', 'cerrado', 'cerrado'],
    tieneTextos: [true, true, false, false, false, false],
    evidencias: [1, 0, 0, 0, 0, 0],
    actualizadoEn: [FECHA_PRUEBA, FECHA_PRUEBA, FECHA_PRUEBA, null, null, null],
    ...cambios,
  }
}

/** Los cuatro indicadores de prueba, vistos por un responsable (B4 editable en 1 y 4). */
function indicadoresPrueba(): IndicadorTableroPai[] {
  return [
    indicadorPrueba({
      id: 1,
      codigo: 'SAF-TH-01',
      nombre: 'Porcentaje de ejecución del plan de bienestar',
      editables: [false, false, false, true, false, false],
      motivos: ['cerrado', 'cerrado', 'cerrado', 'abierto', 'cerrado', 'cerrado'],
    }),
    indicadorPrueba({
      id: 2,
      codigo: 'SAF-TH-02',
      nombre: 'Capacitaciones realizadas',
      accionId: 1001,
      orden: 1,
      metas: [0, 0, 1, 1, 0, 0],
      metaTotal: 2,
      avances: [null, null, 1, 1, null, null],
      avanceTotal: 2,
      porcentajes: [null, null, 1, 1, null, null],
      porcentajeTotal: 1,
      estados: ['sin_meta', 'sin_meta', 'reportado', 'reportado', 'futuro', 'futuro'],
      tieneTextos: [false, false, true, true, false, false],
      evidencias: [0, 0, 2, 1, 0, 0],
      actualizadoEn: [null, null, FECHA_PRUEBA, FECHA_PRUEBA, null, null],
    }),
    indicadorPrueba({
      id: 3,
      codigo: 'SAF-AC-01',
      nombre: 'Índice de satisfacción ciudadana',
      procesoId: 11,
      accionId: 1100,
      tipoMeta: 'porcentaje',
      metas: [0, 0, 0, 0, 0, 100],
      metaTotal: 100,
      avances: [null, null, null, null, null, null],
      avanceTotal: null,
      porcentajes: [null, null, null, null, null, null],
      porcentajeTotal: null,
      estados: ['sin_meta', 'sin_meta', 'sin_meta', 'sin_meta', 'futuro', 'futuro'],
      tieneTextos: [false, false, false, false, false, false],
      evidencias: [0, 0, 0, 0, 0, 0],
      actualizadoEn: [null, null, null, null, null, null],
    }),
    indicadorPrueba({
      id: 4,
      codigo: 'OPE-PPEP-16',
      nombre: 'Mesa Distrital de Permanencia acompañada (a demanda)',
      procesoId: 20,
      accionId: 2000,
      tipoMeta: 'a_demanda',
      metas: [100, 100, 100, 100, 100, 100],
      metaTotal: 100,
      avances: [100, 100, 50, null, null, null],
      avanceTotal: 41.6666666667,
      porcentajes: [1, 1, 0.5, null, null, null],
      porcentajeTotal: 0.416666666667,
      estados: ['reportado', 'reportado', 'reportado', 'pendiente', 'futuro', 'futuro'],
      editables: [false, false, false, true, false, false],
      motivos: ['cerrado', 'cerrado', 'cerrado', 'abierto', 'cerrado', 'cerrado'],
      tieneTextos: [true, false, false, false, false, false],
      evidencias: [0, 0, 0, 0, 0, 0],
    }),
  ]
}

function comoAdministrador(indicador: IndicadorTableroPai): IndicadorTableroPai {
  return {
    ...indicador,
    editables: [false, false, false, false, false, false],
    motivos: ['sin_permiso', 'sin_permiso', 'sin_permiso', 'sin_permiso', 'sin_permiso', 'sin_permiso'],
  }
}

export interface OpcionesTableroPrueba {
  rol?: RolPai
  vigencia?: VigenciaPai
  /** Reemplaza la lista de indicadores (p. ej., [] para un responsable sin asignaciones). */
  indicadores?: IndicadorTableroPai[]
}

export function tableroPrueba({ rol = 'responsable', vigencia = vigenciaPrueba({ bimestreAbierto: 4 }), indicadores }: OpcionesTableroPrueba = {}): TableroPai {
  const lista = indicadores ?? indicadoresPrueba().map((i) => (rol === 'administrador' ? comoAdministrador(i) : i))
  const conteo = vigencia.bimestreAbierto ? { bimestre: vigencia.bimestreAbierto, reportados: 1, pendientes: 1, sinMeta: 0 } : null
  return {
    vigencia,
    dependencias: [
      { id: 1, sigla: 'SAF', nombre: 'Subdirección Administrativa, Financiera y de Apoyo' },
      { id: 2, sigla: 'OPE', nombre: 'Planeación Estratégica' },
    ],
    procesos: [
      {
        id: 10,
        clave: 'saf-talento-humano',
        codigo: 'SAF-TH',
        nombre: 'Gestión del Talento Humano',
        dependenciaId: 1,
        tipo: 'proceso',
        programa: null,
        lineaPlanDesarrollo: '1. Creemos en la educación',
        dimensionPlanEstrategico: 'Talento humano',
        orden: 1,
      },
      {
        id: 11,
        clave: 'saf-atencion-ciudadania',
        codigo: 'SAF-AC',
        nombre: 'Atención a la Ciudadanía',
        dependenciaId: 1,
        tipo: 'proceso',
        programa: null,
        lineaPlanDesarrollo: '2. Creemos en la seguridad',
        dimensionPlanEstrategico: null,
        orden: 2,
      },
      {
        id: 20,
        clave: 'ope-ppep',
        codigo: 'OPE-PPEP',
        nombre: 'Permanencia en la educación superior',
        dependenciaId: 2,
        tipo: 'proyecto',
        programa: 'Educación superior para todos',
        lineaPlanDesarrollo: '1. Creemos en la educación',
        dimensionPlanEstrategico: 'Cobertura',
        orden: 3,
      },
    ],
    riesgos: [
      { id: 100, procesoId: 10, numeral: 1, texto: '1. Recibir dádivas por realizar trámites (RC)', corrupcion: true },
      { id: 101, procesoId: 10, numeral: 2, texto: '2. Pérdida de información de las hojas de vida', corrupcion: false },
      { id: 110, procesoId: 11, numeral: 1, texto: '1. Respuestas fuera de términos', corrupcion: false },
      { id: 200, procesoId: 20, numeral: 1, texto: '1. Deserción de los estudiantes', corrupcion: false },
    ],
    acciones: [
      { id: 1000, procesoId: 10, orden: 1, descripcion: 'Ejecutar el plan de bienestar laboral', riesgoIds: [100] },
      { id: 1001, procesoId: 10, orden: 2, descripcion: 'Capacitar a los servidores', riesgoIds: [101] },
      { id: 1100, procesoId: 11, orden: 1, descripcion: 'Medir la satisfacción de la ciudadanía', riesgoIds: [110] },
      { id: 2000, procesoId: 20, orden: 1, descripcion: 'Acompañar la mesa distrital de permanencia', riesgoIds: [200] },
    ],
    indicadores: lista,
    resumen: {
      general: { logros: [1, 0.75, 0.5, 1, null, null], avanceAnual: 0.55, indicadores: lista.length, conteo },
      dependencias: [
        { dependenciaId: 1, logros: [1, 0.5, 0.5, 1, null, null], avanceAnual: 0.62, indicadores: 3, conteo },
        { dependenciaId: 2, logros: [1, 1, 0.5, null, null, null], avanceAnual: 0.42, indicadores: 1, conteo },
      ],
      procesos: [
        { procesoId: 10, logros: [1, 0.5, 0.5, 1, null, null], avanceAnual: 0.625, indicadores: 2, conteo },
        { procesoId: 11, logros: [null, null, null, null, null, 0], avanceAnual: null, indicadores: 1, conteo },
        { procesoId: 20, logros: [1, 1, 0.5, null, null, null], avanceAnual: 0.42, indicadores: 1, conteo },
      ],
    },
  }
}

export function reportePrueba(
  bimestre: NumeroBimestre,
  cambios: Partial<ReporteBimestrePai> = {},
): ReporteBimestrePai {
  return {
    bimestre,
    meta: 2,
    avance: null,
    porcentaje: null,
    estado: bimestre >= 5 ? 'futuro' : 'pendiente',
    logros: null,
    observaciones: null,
    riesgoMaterializado: null,
    numeralRiesgo: null,
    descripcionRiesgo: null,
    fuentesVerificacion: null,
    evidencias: [],
    origen: null,
    actualizadoEn: null,
    actualizadoPor: null,
    editable: false,
    motivo: 'cerrado',
    ...cambios,
  }
}

/** Ficha de SAF-TH-01 vista por el responsable (B4 editable) o por el administrador. */
export function fichaPrueba(rol: RolPai = 'responsable'): FichaIndicadorPai {
  const motivo = (b: NumeroBimestre): MotivoEdicion => (rol === 'administrador' ? 'sin_permiso' : b === 4 ? 'abierto' : 'cerrado')
  return {
    id: 1,
    codigo: 'SAF-TH-01',
    nombre: 'Porcentaje de ejecución del plan de bienestar',
    orden: 1,
    tipoMeta: 'numero',
    vigencia: 2026,
    proceso: {
      id: 10,
      clave: 'saf-talento-humano',
      codigo: 'SAF-TH',
      nombre: 'Gestión del Talento Humano',
      dependenciaId: 1,
      tipo: 'proceso',
      programa: null,
      lineaPlanDesarrollo: '1. Creemos en la educación',
      dimensionPlanEstrategico: 'Talento humano',
      orden: 1,
      dependencia: { id: 1, sigla: 'SAF', nombre: 'Subdirección Administrativa, Financiera y de Apoyo' },
      codigoProyecto: null,
      objetivo: 'Fortalecer el bienestar de los servidores.',
    },
    accion: { id: 1000, orden: 1, descripcion: 'Ejecutar el plan de bienestar laboral' },
    riesgos: [
      {
        id: 100,
        procesoId: 10,
        numeral: 1,
        texto: '1. Recibir dádivas por realizar trámites (RC)',
        corrupcion: true,
        descripcion: 'Recibir dádivas por realizar trámites',
        bloque: 1,
      },
    ],
    productos: 'Informe de ejecución del plan de bienestar',
    rolResponsable: 'Profesional de Talento Humano',
    responsable: 'Subdirector(a) Administrativo(a)',
    corresponsables: null,
    metaTotal: 12,
    avanceTotal: 3,
    porcentajeTotal: 0.25,
    calculo: {
      reglaMetaTotal: 'suma',
      divisorMetaTotal: null,
      reglaAvanceTotal: 'suma',
      divisorAvanceTotal: null,
      tope100: true,
      topePorBimestre: null,
    },
    bimestres: [
      reportePrueba(1, {
        avance: 2,
        porcentaje: 1,
        estado: 'reportado',
        logros: 'Se realizaron dos jornadas de bienestar.',
        observaciones: 'Sin dificultades.',
        riesgoMaterializado: 'NO',
        fuentesVerificacion: 'Listas de asistencia.',
        evidencias: [
          {
            id: 51,
            nombre: 'asistencia-enero.pdf',
            tipo: 'application/pdf',
            bytes: 120_000,
            subidoEn: FECHA_PRUEBA,
            subidoPor: 'Responsable SAF',
            urlDescarga: '/api/pai/evidencias/51',
          },
        ],
        origen: 'importado',
        actualizadoEn: FECHA_PRUEBA,
        motivo: motivo(1),
      }),
      reportePrueba(2, { avance: 1, porcentaje: 0.5, estado: 'reportado', logros: 'Una jornada.', origen: 'importado', actualizadoEn: FECHA_PRUEBA, motivo: motivo(2) }),
      reportePrueba(3, { avance: 0, porcentaje: 0, estado: 'reportado', origen: 'importado', actualizadoEn: FECHA_PRUEBA, motivo: motivo(3) }),
      reportePrueba(4, { editable: rol === 'responsable', motivo: motivo(4) }),
      reportePrueba(5, { motivo: motivo(5) }),
      reportePrueba(6, { motivo: motivo(6) }),
    ],
  }
}

/** Respuesta del PUT para un indicador del tablero con un nuevo reporte. */
export function respuestaReportePrueba(
  indicador: IndicadorTableroPai,
  reporte: ReporteBimestrePai,
): RespuestaReportePai {
  const i = reporte.bimestre - 1
  const cambiar = <T>(lista: T[], valor: T) => lista.map((v, j) => (j === i ? valor : v))
  return {
    reporte,
    indicador: {
      ...indicador,
      avances: cambiar(indicador.avances, reporte.avance),
      porcentajes: cambiar(indicador.porcentajes, reporte.porcentaje),
      estados: cambiar(indicador.estados, reporte.estado),
      actualizadoEn: cambiar(indicador.actualizadoEn, reporte.actualizadoEn),
      tieneTextos: cambiar(indicador.tieneTextos, Boolean(reporte.logros || reporte.observaciones || reporte.fuentesVerificacion)),
    },
  }
}
