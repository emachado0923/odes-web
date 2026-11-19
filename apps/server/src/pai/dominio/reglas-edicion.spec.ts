import { describe, expect, it } from 'vitest';
import type { MotivoEdicion, NumeroBimestre, RolPai } from '../api-pai.js';
import {
  type AutorizacionParaRegla,
  bimestreAbiertoAhora,
  bimestreFuturo,
  bimestreReferencia,
  type ContextoEdicionPai,
  decidirEdicion,
  estadoAutorizacion,
  estadoBimestre,
  finBimestre,
  inicioBimestre,
  mensajeCerrado,
} from './reglas-edicion.js';

const AHORA = new Date('2026-08-20T15:00:00Z');
const MINUTO = 60_000;
const DIA = 86_400_000;
const B: NumeroBimestre = 3;
const OTRO: NumeroBimestre = 4;

/** Situaciones del bimestre 3 (el que se quiere editar). */
const SITUACIONES = {
  abierto: { bimestreAbierto: B, abiertoHasta: null },
  abierto_con_plazo: {
    bimestreAbierto: B,
    abiertoHasta: new Date(AHORA.getTime() + DIA),
  },
  plazo_justo_ahora: { bimestreAbierto: B, abiertoHasta: AHORA },
  vencido: {
    bimestreAbierto: B,
    abiertoHasta: new Date(AHORA.getTime() - MINUTO),
  },
  otro_abierto: { bimestreAbierto: OTRO, abiertoHasta: null },
  cerrado: { bimestreAbierto: null, abiertoHasta: null },
} satisfies Record<
  string,
  Pick<ContextoEdicionPai, 'bimestreAbierto' | 'abiertoHasta'>
>;

/** Autorizaciones del usuario que cubren el indicador. */
const AUTORIZACIONES: Record<string, AutorizacionParaRegla[]> = {
  ninguna: [],
  vigente: [
    {
      bimestre: B,
      vigenteHasta: new Date(AHORA.getTime() + DIA),
      revocadaEn: null,
    },
  ],
  revocada: [
    {
      bimestre: B,
      vigenteHasta: new Date(AHORA.getTime() + DIA),
      revocadaEn: new Date(AHORA.getTime() - MINUTO),
    },
  ],
  expirada: [
    {
      bimestre: B,
      vigenteHasta: new Date(AHORA.getTime() - MINUTO),
      revocadaEn: null,
    },
  ],
  vence_justo_ahora: [{ bimestre: B, vigenteHasta: AHORA, revocadaEn: null }],
  de_otro_bimestre: [
    {
      bimestre: OTRO,
      vigenteHasta: new Date(AHORA.getTime() + DIA),
      revocadaEn: null,
    },
  ],
  revocada_y_vigente: [
    {
      bimestre: B,
      vigenteHasta: new Date(AHORA.getTime() + DIA),
      revocadaEn: new Date(AHORA.getTime() - DIA),
    },
    {
      bimestre: B,
      vigenteHasta: new Date(AHORA.getTime() + DIA),
      revocadaEn: null,
    },
  ],
};

/** Lo esperado para un responsable activo con el indicador asignado. */
const ESPERADO: Record<
  keyof typeof SITUACIONES,
  Record<string, MotivoEdicion>
> = {
  abierto: {
    ninguna: 'abierto',
    vigente: 'abierto',
    revocada: 'abierto',
    expirada: 'abierto',
    vence_justo_ahora: 'abierto',
    de_otro_bimestre: 'abierto',
    revocada_y_vigente: 'abierto',
  },
  abierto_con_plazo: {
    ninguna: 'abierto',
    vigente: 'abierto',
    revocada: 'abierto',
    expirada: 'abierto',
    vence_justo_ahora: 'abierto',
    de_otro_bimestre: 'abierto',
    revocada_y_vigente: 'abierto',
  },
  plazo_justo_ahora: {
    ninguna: 'abierto',
    vigente: 'abierto',
    revocada: 'abierto',
    expirada: 'abierto',
    vence_justo_ahora: 'abierto',
    de_otro_bimestre: 'abierto',
    revocada_y_vigente: 'abierto',
  },
  vencido: {
    ninguna: 'cerrado',
    vigente: 'autorizado',
    revocada: 'cerrado',
    expirada: 'cerrado',
    vence_justo_ahora: 'cerrado',
    de_otro_bimestre: 'cerrado',
    revocada_y_vigente: 'autorizado',
  },
  otro_abierto: {
    ninguna: 'cerrado',
    vigente: 'autorizado',
    revocada: 'cerrado',
    expirada: 'cerrado',
    vence_justo_ahora: 'cerrado',
    de_otro_bimestre: 'cerrado',
    revocada_y_vigente: 'autorizado',
  },
  cerrado: {
    ninguna: 'cerrado',
    vigente: 'autorizado',
    revocada: 'cerrado',
    expirada: 'cerrado',
    vence_justo_ahora: 'cerrado',
    de_otro_bimestre: 'cerrado',
    revocada_y_vigente: 'autorizado',
  },
};

function contexto(
  cambios: Partial<ContextoEdicionPai> &
    Pick<ContextoEdicionPai, 'bimestreAbierto' | 'abiertoHasta'>,
): ContextoEdicionPai {
  return {
    rol: 'responsable',
    activo: true,
    asignado: true,
    bimestre: B,
    autorizaciones: [],
    ahora: AHORA,
    ...cambios,
  };
}

describe('decidirEdicion: matriz rol × asignación × bimestre × autorización', () => {
  const casos = Object.entries(SITUACIONES).flatMap(([situacion, vigencia]) =>
    Object.entries(AUTORIZACIONES).map(([autorizacion, autorizaciones]) => ({
      situacion: situacion as keyof typeof SITUACIONES,
      autorizacion,
      vigencia,
      autorizaciones,
    })),
  );

  it.each(casos)(
    'responsable activo y asignado, bimestre $situacion, autorización $autorizacion',
    ({ situacion, autorizacion, vigencia, autorizaciones }) => {
      const esperado = ESPERADO[situacion][autorizacion];
      expect(decidirEdicion(contexto({ ...vigencia, autorizaciones }))).toEqual(
        {
          editable: esperado === 'abierto' || esperado === 'autorizado',
          motivo: esperado,
        },
      );
    },
  );

  const sinPermiso: {
    quien: string;
    rol: RolPai;
    activo: boolean;
    asignado: boolean;
  }[] = [
    {
      quien: 'administrador (con todo asignado)',
      rol: 'administrador',
      activo: true,
      asignado: true,
    },
    {
      quien: 'administrador inactivo',
      rol: 'administrador',
      activo: false,
      asignado: true,
    },
    {
      quien: 'responsable sin el indicador asignado',
      rol: 'responsable',
      activo: true,
      asignado: false,
    },
    {
      quien: 'responsable inactivo',
      rol: 'responsable',
      activo: false,
      asignado: true,
    },
    {
      quien: 'responsable inactivo y sin asignar',
      rol: 'responsable',
      activo: false,
      asignado: false,
    },
  ];
  const casosSinPermiso = sinPermiso.flatMap((usuario) =>
    casos.map((caso) => ({
      ...usuario,
      situacion: caso.situacion,
      autorizacion: caso.autorizacion,
      caso,
    })),
  );

  it.each(casosSinPermiso)(
    '$quien: sin_permiso con el bimestre $situacion y autorización $autorizacion',
    ({ rol, activo, asignado, caso }) => {
      expect(
        decidirEdicion(
          contexto({
            ...caso.vigencia,
            autorizaciones: caso.autorizaciones,
            rol,
            activo,
            asignado,
          }),
        ),
      ).toEqual({ editable: false, motivo: 'sin_permiso' });
    },
  );

  it('la autorización del bimestre abierto no hace falta pero tampoco estorba', () => {
    expect(
      decidirEdicion(
        contexto({
          ...SITUACIONES.abierto,
          autorizaciones: AUTORIZACIONES.vigente,
        }),
      ).motivo,
    ).toBe('abierto');
  });

  it('una autorización vigente para otro bimestre no abre este', () => {
    expect(
      decidirEdicion(
        contexto({
          ...SITUACIONES.cerrado,
          bimestre: OTRO,
          autorizaciones: AUTORIZACIONES.vigente,
        }),
      ),
    ).toEqual({ editable: false, motivo: 'cerrado' });
    expect(
      decidirEdicion(
        contexto({
          ...SITUACIONES.cerrado,
          bimestre: OTRO,
          autorizaciones: AUTORIZACIONES.de_otro_bimestre,
        }),
      ),
    ).toEqual({ editable: true, motivo: 'autorizado' });
  });
});

describe('bimestreAbiertoAhora', () => {
  it('sin bimestre abierto: false', () => {
    expect(bimestreAbiertoAhora(null, null, AHORA)).toBe(false);
  });

  it('sin fecha límite: abierto', () => {
    expect(bimestreAbiertoAhora(2, null, AHORA)).toBe(true);
  });

  it('la fecha límite se evalúa con la hora de la petición (inclusive)', () => {
    expect(bimestreAbiertoAhora(2, new Date(AHORA.getTime() + 1), AHORA)).toBe(
      true,
    );
    expect(bimestreAbiertoAhora(2, AHORA, AHORA)).toBe(true);
    expect(bimestreAbiertoAhora(2, new Date(AHORA.getTime() - 1), AHORA)).toBe(
      false,
    );
  });
});

describe('estadoAutorizacion', () => {
  it('vigente, vencida (vigente_hasta ya llegó) o revocada (manda sobre la fecha)', () => {
    expect(
      estadoAutorizacion(
        { vigenteHasta: new Date(AHORA.getTime() + 1), revocadaEn: null },
        AHORA,
      ),
    ).toBe('vigente');
    expect(
      estadoAutorizacion({ vigenteHasta: AHORA, revocadaEn: null }, AHORA),
    ).toBe('vencida');
    expect(
      estadoAutorizacion(
        { vigenteHasta: new Date(AHORA.getTime() - DIA), revocadaEn: AHORA },
        AHORA,
      ),
    ).toBe('revocada');
    expect(
      estadoAutorizacion(
        { vigenteHasta: new Date(AHORA.getTime() + DIA), revocadaEn: AHORA },
        AHORA,
      ),
    ).toBe('revocada');
  });
});

describe('inicioBimestre y estadoBimestre', () => {
  it('los bimestres empiezan a las 00:00 de Colombia (05:00 UTC)', () => {
    expect(inicioBimestre(2026, 1).toISOString()).toBe(
      '2026-01-01T05:00:00.000Z',
    );
    expect(inicioBimestre(2026, 4).toISOString()).toBe(
      '2026-07-01T05:00:00.000Z',
    );
    expect(inicioBimestre(2026, 6).toISOString()).toBe(
      '2026-11-01T05:00:00.000Z',
    );
  });

  const base = {
    meta: 2,
    reportado: false,
    bimestreAbierto: 4 as NumeroBimestre | null,
    anioVigencia: 2026,
    ahora: AHORA,
  };

  it('reportado manda sobre todo (también en un bimestre futuro o sin meta)', () => {
    expect(estadoBimestre({ ...base, reportado: true, bimestre: 6 })).toBe(
      'reportado',
    );
    expect(
      estadoBimestre({ ...base, reportado: true, meta: 0, bimestre: 1 }),
    ).toBe('reportado');
  });

  it('futuro: no ha empezado (hora de Colombia), salvo el bimestre abierto', () => {
    expect(estadoBimestre({ ...base, bimestre: 5 })).toBe('futuro');
    expect(estadoBimestre({ ...base, bimestre: 6, meta: 0 })).toBe('futuro');
    // El abierto nunca es futuro, aunque no haya empezado.
    expect(estadoBimestre({ ...base, bimestre: 5, bimestreAbierto: 5 })).toBe(
      'pendiente',
    );
    // 30 de junio 23:59 en Bogotá = 1 de julio 04:59 UTC: el Bimestre 4 aún no empieza.
    const antes = new Date('2026-07-01T04:59:00Z');
    expect(
      estadoBimestre({
        ...base,
        bimestreAbierto: null,
        bimestre: 4,
        ahora: antes,
      }),
    ).toBe('futuro');
    // Abrir un bimestre que no ha empezado no vuelve exigibles los anteriores
    // que tampoco han empezado.
    expect(
      estadoBimestre({
        ...base,
        bimestreAbierto: 6,
        bimestre: 5,
        ahora: antes,
      }),
    ).toBe('futuro');
  });

  it('futuro: posterior al bimestre de referencia aunque ya haya empezado', () => {
    // 11 de octubre de 2026 con el Bimestre 4 abierto: el 5 (en curso) y el 6
    // todavía no se reportan.
    const hoy = new Date('2026-10-11T17:00:00Z');
    const conAbierto = { ...base, bimestreAbierto: 4 as const, ahora: hoy };
    expect(estadoBimestre({ ...conAbierto, bimestre: 5 })).toBe('futuro');
    expect(estadoBimestre({ ...conAbierto, bimestre: 6 })).toBe('futuro');
    expect(estadoBimestre({ ...conAbierto, bimestre: 4 })).toBe('pendiente');
    expect(estadoBimestre({ ...conAbierto, bimestre: 3 })).toBe('pendiente');
    expect(estadoBimestre({ ...conAbierto, bimestre: 5, meta: 0 })).toBe(
      'futuro',
    );
    // Con un reporte (p. ej., por una autorización) es reportado.
    expect(
      estadoBimestre({ ...conAbierto, bimestre: 5, reportado: true }),
    ).toBe('reportado');
    // Aunque haya pasado la fecha límite del abierto, la referencia sigue
    // siendo el abierto: el 5 nunca se abrió.
    expect(
      estadoBimestre({
        ...conAbierto,
        bimestre: 5,
        ahora: new Date('2026-12-15T17:00:00Z'),
      }),
    ).toBe('futuro');
    // Sin bimestre abierto: la referencia es el último que ya terminó (el 4
    // termina el 1 de septiembre a las 00:00 de Bogotá).
    const sinAbierto = { ...base, bimestreAbierto: null, ahora: hoy };
    expect(estadoBimestre({ ...sinAbierto, bimestre: 4 })).toBe('pendiente');
    expect(estadoBimestre({ ...sinAbierto, bimestre: 5 })).toBe('futuro');
    expect(
      estadoBimestre({
        ...sinAbierto,
        bimestre: 4,
        ahora: new Date('2026-07-01T05:00:00Z'),
      }),
    ).toBe('futuro');
    expect(
      estadoBimestre({
        ...sinAbierto,
        bimestre: 4,
        ahora: new Date('2026-09-01T05:00:00Z'),
      }),
    ).toBe('pendiente');
  });

  it('bimestreReferencia y finBimestre', () => {
    expect(finBimestre(2026, 4).toISOString()).toBe('2026-09-01T05:00:00.000Z');
    expect(finBimestre(2026, 6).toISOString()).toBe('2027-01-01T05:00:00.000Z');
    const hoy = new Date('2026-10-11T17:00:00Z');
    expect(bimestreReferencia(2026, 4, hoy)).toBe(4);
    expect(bimestreReferencia(2026, 2, hoy)).toBe(2);
    expect(bimestreReferencia(2026, null, hoy)).toBe(4);
    expect(bimestreReferencia(2026, null, new Date('2026-09-01T04:59:59Z'))).toBe(3);
    expect(bimestreReferencia(2025, null, hoy)).toBe(6);
    expect(bimestreReferencia(2027, null, hoy)).toBe(0);
    expect(
      bimestreFuturo({ bimestre: 6, bimestreAbierto: 6, anioVigencia: 2027, ahora: hoy }),
    ).toBe(false);
    expect(
      bimestreFuturo({ bimestre: 1, bimestreAbierto: null, anioVigencia: 2027, ahora: hoy }),
    ).toBe(true);
  });

  it('pendiente con meta > 0; sin_meta con meta 0', () => {
    expect(estadoBimestre({ ...base, bimestre: 2 })).toBe('pendiente');
    expect(estadoBimestre({ ...base, bimestre: 2, meta: 0 })).toBe('sin_meta');
  });

  it('vigencias pasadas cerradas no tienen futuros; las próximas, todos (menos el abierto)', () => {
    expect(
      estadoBimestre({
        ...base,
        anioVigencia: 2025,
        bimestre: 6,
        bimestreAbierto: null,
      }),
    ).toBe('pendiente');
    expect(
      estadoBimestre({
        ...base,
        anioVigencia: 2027,
        bimestre: 1,
        bimestreAbierto: null,
      }),
    ).toBe('futuro');
  });
});

describe('mensajeCerrado', () => {
  it('explica por qué no se puede editar', () => {
    expect(mensajeCerrado(3, null, null)).toMatch(/No hay un bimestre abierto/);
    expect(mensajeCerrado(3, 4, null)).toMatch(
      /El Bimestre 3 está cerrado: solo se puede reportar el Bimestre 4/,
    );
    expect(mensajeCerrado(3, 3, new Date('2026-09-16T04:59:00Z'))).toMatch(
      /El plazo para reportar el Bimestre 3 venció el 15 de septiembre de 2026/,
    );
  });
});
