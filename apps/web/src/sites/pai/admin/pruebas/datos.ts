/**
 * Datos de prueba de la administración y la sesión del PAI: un tablero
 * pequeño (2 dependencias, 3 procesos, 5 indicadores), cuentas,
 * autorizaciones y entradas del registro. Pasan la validación de
 * datos/validacionPai.ts.
 */
import type {
  AutorizacionPai,
  EntradaRegistroPai,
  IndicadorTableroPai,
  ResumenAvancePai,
  TableroPai,
  UsuarioPai,
  VigenciaPai,
} from '../../api-pai'
import { sesionPrueba, vigenciaPrueba } from '../../pruebas/datosPrueba'

export const CONTRASENA_PRUEBA = 'contraseña-de-prueba-1'

function indicador(
  id: number,
  codigo: string,
  nombre: string,
  procesoId: number,
  accionId: number,
  cambios: Partial<IndicadorTableroPai> = {},
): IndicadorTableroPai {
  return {
    id,
    codigo,
    nombre,
    procesoId,
    accionId,
    orden: 1,
    tipoMeta: 'numero',
    metas: [1, 1, 1, 1, 1, 1],
    metaTotal: 6,
    avances: [1, 1, 0.5, null, null, null],
    avanceTotal: 2.5,
    porcentajes: [1, 1, 0.5, null, null, null],
    porcentajeTotal: 2.5 / 6,
    estados: ['reportado', 'reportado', 'reportado', 'pendiente', 'futuro', 'futuro'],
    editables: [false, false, false, false, false, false],
    motivos: ['sin_permiso', 'sin_permiso', 'sin_permiso', 'sin_permiso', 'sin_permiso', 'sin_permiso'],
    tieneTextos: [true, true, false, false, false, false],
    evidencias: [1, 0, 0, 0, 0, 0],
    actualizadoEn: ['2026-03-05T15:00:00.000Z', '2026-05-05T15:00:00.000Z', '2026-07-05T15:00:00.000Z', null, null, null],
    ...cambios,
  }
}

function resumen(logros: (number | null)[], avanceAnual: number | null, indicadores: number, pendientes: number): ResumenAvancePai {
  return {
    logros,
    avanceAnual,
    indicadores,
    conteo: { bimestre: 4, reportados: indicadores - pendientes, pendientes, sinMeta: 0 },
  }
}

export function tableroPrueba(vigencia: VigenciaPai = vigenciaPrueba()): TableroPai {
  const general = resumen([0.9, 0.8, 0.45, 0.2, null, null], 0.41, 5, 3)
  const conteo = vigencia.bimestreAbierto === null ? null : general.conteo
  return {
    vigencia,
    dependencias: [
      { id: 1, sigla: 'SAF', nombre: 'Subdirección Administrativa y Financiera' },
      { id: 2, sigla: 'DTF', nombre: 'Dirección Técnica de Fondos' },
    ],
    procesos: [
      {
        id: 11,
        clave: 'saf-talento-humano',
        codigo: 'SAF-TH',
        nombre: 'Gestión del Talento Humano',
        dependenciaId: 1,
        tipo: 'proceso',
        programa: null,
        lineaPlanDesarrollo: 'Línea 1',
        dimensionPlanEstrategico: 'Talento humano',
        orden: 1,
      },
      {
        id: 12,
        clave: 'saf-atencion',
        codigo: 'SAF-AC',
        nombre: 'Atención a la Ciudadanía',
        dependenciaId: 1,
        tipo: 'proceso',
        programa: null,
        lineaPlanDesarrollo: 'Línea 1',
        dimensionPlanEstrategico: 'Servicio',
        orden: 2,
      },
      {
        id: 21,
        clave: 'dtf-fondos',
        codigo: 'DTF-GF',
        nombre: 'Gestión de Fondos',
        dependenciaId: 2,
        tipo: 'proyecto',
        programa: 'Educación superior',
        lineaPlanDesarrollo: 'Línea 2',
        dimensionPlanEstrategico: 'Acceso',
        orden: 1,
      },
    ],
    riesgos: [{ id: 101, procesoId: 11, numeral: 1, texto: '1. Pérdida de información', corrupcion: false }],
    acciones: [
      { id: 201, procesoId: 11, orden: 1, descripcion: 'Plan de capacitación', riesgoIds: [101] },
      { id: 202, procesoId: 12, orden: 1, descripcion: 'Atención de PQRSD', riesgoIds: [] },
      { id: 203, procesoId: 21, orden: 1, descripcion: 'Convocatorias de fondos', riesgoIds: [] },
    ],
    indicadores: [
      indicador(1001, 'SAF-TH-01', 'Capacitaciones realizadas', 11, 201),
      indicador(1002, 'SAF-TH-02', 'Evaluaciones de desempeño', 11, 201, { orden: 2 }),
      indicador(1003, 'SAF-AC-01', 'PQRSD respondidas a tiempo', 12, 202, { tipoMeta: 'porcentaje' }),
      indicador(1004, 'DTF-GF-01', 'Convocatorias abiertas', 21, 203),
      indicador(1005, 'DTF-GF-02', 'Créditos condonados', 21, 203, { orden: 2 }),
    ],
    resumen: {
      general: { ...general, conteo },
      dependencias: [
        { ...resumen([1, 0.9, 0.5, 0.3, null, null], 0.45, 3, 2), conteo, dependenciaId: 1 },
        { ...resumen([0.8, 0.7, 0.4, null, null, null], 0.36, 2, 1), dependenciaId: 2 },
      ],
      procesos: [
        { ...resumen([1, 1, 0.5, 0.25, null, null], 0.42, 2, 1), procesoId: 11 },
        { ...resumen([1, 0.8, 0.5, 0.4, null, null], 0.5, 1, 1), procesoId: 12 },
        { ...resumen([0.8, 0.7, 0.4, null, null, null], 0.36, 2, 1), procesoId: 21 },
      ],
    },
  }
}

export function usuarioPrueba(id: number, cambios: Partial<UsuarioPai> = {}): UsuarioPai {
  return {
    id,
    usuario: `usuario${id}`,
    nombre: `Usuario ${id}`,
    correo: null,
    cargo: null,
    rol: 'responsable',
    activo: true,
    debeCambiarContrasena: false,
    ultimoAcceso: null,
    creadoEn: '2026-01-10T15:00:00.000Z',
    actualizadoEn: '2026-01-10T15:00:00.000Z',
    asignaciones: { procesos: [], indicadores: [] },
    ...cambios,
  }
}

/** La administradora de la sesión de prueba (id 1), una responsable de SAF-TH (id 2) y otro de DTF-GF-01 (id 3). */
export function usuariosPrueba(): UsuarioPai[] {
  const admin = sesionPrueba('administrador')
  const responsable = sesionPrueba('responsable')
  return [
    usuarioPrueba(admin.id, {
      usuario: admin.usuario,
      nombre: admin.nombre,
      rol: 'administrador',
      correo: 'planeacion@sapiencia.gov.co',
      ultimoAcceso: '2026-10-11T14:00:00.000Z',
    }),
    usuarioPrueba(responsable.id, {
      usuario: responsable.usuario,
      nombre: responsable.nombre,
      cargo: 'Profesional universitaria',
      asignaciones: { procesos: [11], indicadores: [] },
    }),
    usuarioPrueba(3, {
      usuario: 'carlos.ruiz',
      nombre: 'Carlos Ruiz',
      debeCambiarContrasena: true,
      asignaciones: { procesos: [], indicadores: [1004] },
    }),
  ]
}

export function autorizacionPrueba(id: number, cambios: Partial<AutorizacionPai> = {}): AutorizacionPai {
  return {
    id,
    usuarioId: 2,
    usuario: 'responsable.saf',
    nombreUsuario: 'Responsable SAF',
    bimestre: 2,
    procesoId: 11,
    indicadorId: null,
    alcance: 'SAF-TH · Gestión del Talento Humano',
    vigenteHasta: '2026-12-31T04:59:59.999Z',
    motivo: 'Corregir el reporte del bimestre 2',
    otorgadaPor: 'Planeación Estratégica',
    otorgadaEn: '2026-08-01T15:00:00.000Z',
    revocadaEn: null,
    revocadaPor: null,
    estado: 'vigente',
    ...cambios,
  }
}

export function entradaRegistroPrueba(id: number, cambios: Partial<EntradaRegistroPai> = {}): EntradaRegistroPai {
  return {
    id,
    fecha: '2026-09-10T15:00:00.000Z',
    usuarioId: 2,
    usuario: 'responsable.saf',
    accion: 'guardar_reporte',
    indicadorId: 1001,
    codigoIndicador: 'SAF-TH-01',
    bimestre: 4,
    detalle: { anterior: { avance: null, logros: null }, nuevo: { avance: 3, logros: 'Se hicieron 3 capacitaciones' } },
    ...cambios,
  }
}
