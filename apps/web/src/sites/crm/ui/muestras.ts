/**
 * Datos ficticios con la forma real del contrato (api-crm.ts), para el
 * muestrario y las pruebas. Las personas son inventadas. Las fechas se
 * calculan desde `hoy` para que siempre haya una vencida, una para hoy, etc.
 */
import { inicialesDe, type ArchivoCrm, type ConteoTareasCrm, type PersonaCrm, type ResponsableCrm, type TareaCrm } from '../api-crm'
import { hoyBogota } from './formato'

/** 'AAAA-MM-DD' + n días. */
export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

/** Retrato de prueba (SVG en línea) para ver una persona con foto. */
const FOTO_MUESTRA = `data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#C4E9F8"/><circle cx="48" cy="38" r="17" fill="#0B3A56"/><path d="M14 96c3-21 17-32 34-32s31 11 34 32Z" fill="#0E5074"/></svg>`,
)}`

function persona(id: number, nombre: string, conteo: Partial<ConteoTareasCrm> = {}, extra: Partial<PersonaCrm> = {}): PersonaCrm {
  return {
    id,
    nombre,
    iniciales: inicialesDe(nombre),
    esLider: false,
    foto: null,
    conteo: { pendientes: 0, enProceso: 0, terminadasRecientes: 0, vencidas: 0, ...conteo },
    ...extra,
  }
}

export const PERSONAS_MUESTRA: PersonaCrm[] = [
  persona(1, 'Martha Lucía Giraldo Arango', { pendientes: 1, terminadasRecientes: 3 }, { esLider: true }),
  persona(2, 'Ana María Restrepo Gil', { pendientes: 3, enProceso: 2, terminadasRecientes: 2, vencidas: 1 }),
  persona(3, 'Carlos Andrés Mejía Duque', { enProceso: 2, terminadasRecientes: 5 }),
  persona(4, 'Luciana Vélez Arenas', { pendientes: 2, terminadasRecientes: 1, vencidas: 2 }),
  persona(5, 'Juan Esteban Ochoa Ríos', { terminadasRecientes: 4 }),
  persona(6, 'Daniela Cardona Zapata', { pendientes: 5, enProceso: 1 }, { foto: FOTO_MUESTRA }),
  // Foto que no existe: se ven las iniciales.
  persona(7, 'Santiago Henao Patiño', { pendientes: 1, enProceso: 1, terminadasRecientes: 1 }, { foto: '/api/crm/personas/7/foto?v=no-existe' }),
  persona(8, 'Valentina Mora Quintero', { pendientes: 2, enProceso: 3, terminadasRecientes: 6, vencidas: 1 }),
]

export function responsableDe(p: PersonaCrm): ResponsableCrm {
  return { id: p.id, nombre: p.nombre, iniciales: p.iniciales, foto: p.foto }
}

/** Una tarea con valores por defecto razonables; `cambios` pisa lo que haga falta. */
export function tareaMuestra(cambios: Partial<TareaCrm> & Pick<TareaCrm, 'id' | 'titulo'>): TareaCrm {
  return {
    estado: 'pendiente',
    responsable: responsableDe(PERSONAS_MUESTRA[1]),
    fechaLimite: null,
    vencida: false,
    requiereEntregable: false,
    adjuntos: 0,
    entregables: 0,
    creadaEn: '2026-11-03T14:00:00.000Z',
    actualizadaEn: '2026-11-20T15:30:00.000Z',
    terminadaEn: null,
    ...cambios,
  }
}

/** Las tareas de una persona (o del equipo, con varios responsables), con fechas desde `hoy`. */
export function tareasMuestra(hoy: string = hoyBogota()): TareaCrm[] {
  const [, ana, carlos, luciana, , daniela] = PERSONAS_MUESTRA
  return [
    tareaMuestra({
      id: 101,
      titulo: 'Consolidar el informe trimestral de indicadores del PAI',
      fechaLimite: sumarDias(hoy, 5),
      requiereEntregable: true,
      adjuntos: 2,
    }),
    tareaMuestra({
      id: 102,
      titulo: 'Revisar la ficha técnica de la convocatoria del fondo de becas 2027',
      fechaLimite: sumarDias(hoy, -3),
      vencida: true,
      adjuntos: 1,
      responsable: responsableDe(luciana),
    }),
    tareaMuestra({ id: 103, titulo: 'Actualizar la matriz de riesgos de la oficina', responsable: responsableDe(carlos) }),
    tareaMuestra({
      id: 104,
      titulo: 'Preparar la presentación del avance de metas para el comité directivo',
      estado: 'en_proceso',
      fechaLimite: hoy,
      requiereEntregable: true,
      entregables: 1,
      responsable: responsableDe(daniela),
    }),
    tareaMuestra({
      id: 105,
      titulo: 'Cruzar la base de beneficiarios con los reportes de deserción',
      estado: 'en_proceso',
      fechaLimite: sumarDias(hoy, 1),
      responsable: responsableDe(ana),
    }),
    tareaMuestra({
      id: 106,
      titulo: 'Enviar el seguimiento de metas de octubre',
      estado: 'terminada',
      fechaLimite: sumarDias(hoy, -4),
      entregables: 1,
      requiereEntregable: true,
      terminadaEn: `${sumarDias(hoy, -2)}T20:15:00.000Z`,
    }),
    tareaMuestra({
      id: 107,
      titulo: 'Depurar los registros duplicados del tablero de fondos',
      estado: 'terminada',
      terminadaEn: `${sumarDias(hoy, -6)}T16:40:00.000Z`,
      responsable: responsableDe(carlos),
    }),
  ]
}

export const ARCHIVOS_MUESTRA: ArchivoCrm[] = [
  {
    id: 1,
    tipo: 'adjunto',
    nombre: 'Lineamientos informe trimestral.pdf',
    mime: 'application/pdf',
    bytes: 845_312,
    subidoEn: '2026-11-18T15:12:00.000Z',
    url: '#archivo-1',
  },
  {
    id: 2,
    tipo: 'adjunto',
    nombre: 'Matriz de indicadores 2026.xlsx',
    mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes: 3_565_158,
    subidoEn: '2026-11-18T15:13:00.000Z',
    url: '#archivo-2',
  },
  {
    id: 3,
    tipo: 'entregable',
    nombre: 'Informe trimestral, versión para revisión.docx',
    mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes: 412_908,
    subidoEn: '2026-11-21T22:05:00.000Z',
    url: '#archivo-3',
  },
  {
    id: 4,
    tipo: 'entregable',
    nombre: 'Foto del acta firmada.jpg',
    mime: 'image/jpeg',
    bytes: 1_904_221,
    subidoEn: '2026-11-22T13:47:00.000Z',
    url: '#archivo-4',
  },
]
