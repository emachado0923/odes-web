import type { RowDataPacket } from 'mysql2/promise';
import { describe, expect, it } from 'vitest';
import type { TableroPai } from '../api-pai.js';
import {
  ContextoPermisosPai,
  type DatosUsuarioPermisosPai,
  leerUsuarioPermisos,
} from './servicio-permisos.js';
import type { ConsultorPai } from './lectura-pai.js';
import { bimestrePorDefecto, encabezadosCsv } from './servicio-exportacion.js';

const AHORA = new Date('2026-08-20T15:00:00Z');
const DIA = 86_400_000;
const ABIERTO_4 = { bimestreAbierto: 4 as const, abiertoHasta: null };

function usuario(
  cambios: Partial<DatosUsuarioPermisosPai> = {},
): DatosUsuarioPermisosPai {
  return {
    usuarioId: 7,
    rol: 'responsable',
    activo: true,
    procesos: new Set([10]),
    indicadores: new Set([200]),
    autorizaciones: [],
    ...cambios,
  };
}

/** Indicador 100 del proceso 10 (asignado por proceso), 200 del 20 (suelto), 300 del 30 (no asignado). */
const POR_PROCESO = { id: 100, procesoId: 10 };
const SUELTO = { id: 200, procesoId: 20 };
const AJENO = { id: 300, procesoId: 30 };

describe('ContextoPermisosPai', () => {
  it('responsable: ve lo asignado por proceso o por indicador; edita el bimestre abierto', () => {
    const contexto = new ContextoPermisosPai(usuario(), ABIERTO_4, AHORA);
    expect(contexto.veTodo).toBe(false);
    expect(
      [POR_PROCESO, SUELTO, AJENO].map((i) => contexto.puedeVer(i)),
    ).toEqual([true, true, false]);
    expect(contexto.decidirTodos(POR_PROCESO).map((d) => d.motivo)).toEqual([
      'cerrado',
      'cerrado',
      'cerrado',
      'abierto',
      'cerrado',
      'cerrado',
    ]);
    expect(contexto.decidir(AJENO, 4)).toEqual({
      editable: false,
      motivo: 'sin_permiso',
    });
  });

  it('las autorizaciones cuentan solo para el indicador o el proceso que cubren', () => {
    const contexto = new ContextoPermisosPai(
      usuario({
        autorizaciones: [
          {
            bimestre: 2,
            procesoId: 10,
            indicadorId: null,
            vigenteHasta: new Date(AHORA.getTime() + DIA),
            revocadaEn: null,
          },
          {
            bimestre: 3,
            procesoId: null,
            indicadorId: 200,
            vigenteHasta: new Date(AHORA.getTime() + DIA),
            revocadaEn: null,
          },
          // De un indicador no asignado: no sirve.
          {
            bimestre: 1,
            procesoId: null,
            indicadorId: 300,
            vigenteHasta: new Date(AHORA.getTime() + DIA),
            revocadaEn: null,
          },
        ],
      }),
      ABIERTO_4,
      AHORA,
    );
    expect(contexto.decidir(POR_PROCESO, 2)).toEqual({
      editable: true,
      motivo: 'autorizado',
    });
    expect(contexto.decidir(POR_PROCESO, 3).motivo).toBe('cerrado');
    expect(contexto.decidir(SUELTO, 3)).toEqual({
      editable: true,
      motivo: 'autorizado',
    });
    expect(contexto.decidir(SUELTO, 2).motivo).toBe('cerrado');
    expect(contexto.decidir(AJENO, 1).motivo).toBe('sin_permiso');
  });

  it('administrador: ve todo y nunca edita', () => {
    const contexto = new ContextoPermisosPai(
      usuario({
        rol: 'administrador',
        procesos: new Set(),
        indicadores: new Set(),
      }),
      ABIERTO_4,
      AHORA,
    );
    expect(contexto.veTodo).toBe(true);
    expect(contexto.puedeVer(AJENO)).toBe(true);
    expect(
      contexto.decidirTodos(AJENO).every((d) => d.motivo === 'sin_permiso'),
    ).toBe(true);
  });

  it('cuenta inactiva o inexistente: no ve ni edita nada', () => {
    for (const datos of [
      usuario({ activo: false }),
      usuario({ rol: 'administrador', activo: false }),
      null,
    ]) {
      const contexto = new ContextoPermisosPai(datos, ABIERTO_4, AHORA);
      expect(contexto.veTodo).toBe(false);
      expect(contexto.puedeVer(POR_PROCESO)).toBe(false);
      expect(contexto.decidir(POR_PROCESO, 4)).toEqual({
        editable: false,
        motivo: 'sin_permiso',
      });
    }
  });
});

/** Consultor falso: responde según el texto de la consulta y guarda las llamadas. */
function consultorFalso(respuestas: Record<string, RowDataPacket[]>): {
  consultar: ConsultorPai;
  llamadas: { sql: string; valores: unknown[] }[];
} {
  const llamadas: { sql: string; valores: unknown[] }[] = [];
  const consultar = (async (sql: string, valores: unknown[] = []) => {
    llamadas.push({ sql, valores });
    const clave = Object.keys(respuestas).find((texto) => sql.includes(texto));
    return clave ? respuestas[clave] : [];
  }) as ConsultorPai;
  return { consultar, llamadas };
}

describe('leerUsuarioPermisos', () => {
  it('responsable activo: asignaciones y autorizaciones vigentes (filtradas en la consulta con la hora dada)', async () => {
    const { consultar, llamadas } = consultorFalso({
      'FROM pai_usuarios': [
        { rol: 'responsable', activo: 1 },
      ] as RowDataPacket[],
      'FROM pai_asignaciones': [
        { proceso_id: 10, indicador_id: null },
        { proceso_id: null, indicador_id: 200 },
      ] as RowDataPacket[],
      'FROM pai_autorizaciones': [
        {
          bimestre: 2,
          proceso_id: 10,
          indicador_id: null,
          vigente_hasta: new Date(AHORA.getTime() + DIA),
          revocada_en: null,
        },
      ] as RowDataPacket[],
    });
    const datos = await leerUsuarioPermisos(consultar, 7, AHORA);
    expect(datos).toMatchObject({
      usuarioId: 7,
      rol: 'responsable',
      activo: true,
    });
    expect([...(datos?.procesos ?? [])]).toEqual([10]);
    expect([...(datos?.indicadores ?? [])]).toEqual([200]);
    expect(datos?.autorizaciones).toHaveLength(1);
    const autorizaciones = llamadas.find((l) =>
      l.sql.includes('pai_autorizaciones'),
    );
    expect(autorizaciones?.sql).toMatch(
      /revocada_en IS NULL AND vigente_hasta > \?/,
    );
    expect(autorizaciones?.valores).toEqual([7, AHORA]);
  });

  it('administrador o inactivo: no lee asignaciones; cuenta inexistente: null', async () => {
    const admin = consultorFalso({
      'FROM pai_usuarios': [
        { rol: 'administrador', activo: 1 },
      ] as RowDataPacket[],
    });
    expect((await leerUsuarioPermisos(admin.consultar, 1, AHORA))?.rol).toBe(
      'administrador',
    );
    expect(admin.llamadas).toHaveLength(1);
    const inactivo = consultorFalso({
      'FROM pai_usuarios': [
        { rol: 'responsable', activo: 0 },
      ] as RowDataPacket[],
    });
    expect(
      (await leerUsuarioPermisos(inactivo.consultar, 2, AHORA))?.activo,
    ).toBe(false);
    expect(inactivo.llamadas).toHaveLength(1);
    expect(
      await leerUsuarioPermisos(consultorFalso({}).consultar, 3, AHORA),
    ).toBeNull();
  });
});

function tablero(
  bimestreAbierto: TableroPai['vigencia']['bimestreAbierto'],
  estados: string[][],
): TableroPai {
  return {
    vigencia: { bimestreAbierto },
    indicadores: estados.map((e) => ({ estados: e })),
  } as unknown as TableroPai;
}

describe('exportación: bimestre por defecto y encabezados', () => {

  it('el abierto; sin abierto, el último con algún reporte; si no, el 1', () => {
    expect(
      bimestrePorDefecto(
        tablero(5, [
          [
            'reportado',
            'reportado',
            'reportado',
            'pendiente',
            'pendiente',
            'futuro',
          ],
        ]),
      ),
    ).toBe(5);
    expect(
      bimestrePorDefecto(
        tablero(null, [
          [
            'reportado',
            'reportado',
            'reportado',
            'pendiente',
            'pendiente',
            'futuro',
          ],
        ]),
      ),
    ).toBe(3);
    expect(
      bimestrePorDefecto(
        tablero(null, [
          [
            'pendiente',
            'pendiente',
            'sin_meta',
            'pendiente',
            'futuro',
            'futuro',
          ],
        ]),
      ),
    ).toBe(1);
  });

  it('encabezados con el bimestre de los textos', () => {
    const encabezados = encabezadosCsv(3);
    expect(encabezados).toHaveLength(11 + 7 + 7 + 7 + 10);
    expect(encabezados).toContain('Principales avances bimestre 3');
    expect(encabezados).toContain('% total');
    expect(new Set(encabezados).size).toBe(encabezados.length);
  });
});
