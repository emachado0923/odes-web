import { describe, expect, it } from 'vitest';
import { LIMITES_PAI } from '../api-pai.js';
import { ErrorPaiHttp } from '../errores-pai.js';
import {
  decimales,
  erroresRiesgo,
  fechaIso,
  validarAutorizacion,
  validarConsultaExportacion,
  validarConsultaRegistro,
  validarDatosVigencia,
  validarReporte,
} from './validacion-pai.js';

const AHORA = new Date('2026-08-20T15:00:00Z');

/** El error 400 que lanza `accion` (falla si no lanza). */
function error400(accion: () => unknown): ErrorPaiHttp {
  let capturado: unknown = null;
  try {
    accion();
  } catch (error) {
    capturado = error;
  }
  expect(capturado).toBeInstanceOf(ErrorPaiHttp);
  const error = capturado as ErrorPaiHttp;
  expect(error.getStatus()).toBe(400);
  expect(error.codigo).toBe('solicitud_invalida');
  return error;
}

describe('auxiliares', () => {
  it('decimales', () => {
    expect(decimales(3)).toBe(0);
    expect(decimales(1.25)).toBe(2);
    expect(decimales(0.123456)).toBe(6);
    expect(decimales(1e-7)).toBe(7);
    expect(decimales(1.5e-6)).toBe(7);
    expect(decimales(1e21)).toBe(0);
  });

  it('fechaIso exige zona horaria', () => {
    expect(fechaIso('2026-09-15T23:59:00-05:00')?.toISOString()).toBe(
      '2026-09-16T04:59:00.000Z',
    );
    expect(fechaIso('2026-09-15T10:00:00.123Z')?.toISOString()).toBe(
      '2026-09-15T10:00:00.123Z',
    );
    expect(fechaIso('2026-09-15T10:00')).toBeNull();
    expect(fechaIso('2026-09-15')).toBeNull();
    expect(fechaIso('2026-02-30T10:00:00Z')?.toISOString()).toBe(
      '2026-03-02T10:00:00.000Z',
    );
    expect(fechaIso('2026-13-01T10:00:00Z')).toBeNull();
    expect(fechaIso('2201-01-01T00:00:00Z')).toBeNull();
  });
});

describe('validarReporte', () => {
  it('campos ausentes no cambian; null borra; textos normalizados', () => {
    expect(validarReporte({})).toEqual({ actualizadoEn: undefined });
    const reporte = validarReporte({
      avance: 12.5,
      logros: '  Primer logro \r\nsegunda línea   \u0007',
      observaciones: null,
      riesgoMaterializado: 'sí',
      numeralRiesgo: ' 1,\n 3 ',
      descripcionRiesgo: '   ',
      actualizadoEn: '2026-08-01T10:00:00.000Z',
    });
    expect(reporte).toEqual({
      avance: 12.5,
      logros: 'Primer logro\nsegunda línea',
      observaciones: null,
      riesgoMaterializado: 'SI',
      numeralRiesgo: '1, 3',
      descripcionRiesgo: null,
      actualizadoEn: new Date('2026-08-01T10:00:00.000Z'),
    });
    expect(reporte).not.toHaveProperty('fuentesVerificacion');
  });

  it('ignora campos desconocidos (origen no se puede escribir)', () => {
    expect(validarReporte({ origen: 'importado', avance: 1 })).toEqual({
      avance: 1,
      actualizadoEn: undefined,
    });
  });

  it('actualizadoEn null se conserva (no había reporte)', () => {
    expect(validarReporte({ actualizadoEn: null }).actualizadoEn).toBeNull();
  });

  it.each([
    [-1, 'avance'],
    [1.1234567, 'avance'],
    [LIMITES_PAI.maxAvance + 1, 'avance'],
    ['12', 'avance'],
  ])('avance inválido %s', (avance, campo) => {
    const error = error400(() => validarReporte({ avance }));
    expect(error.campos).toHaveProperty(campo);
  });

  it('acepta 0, 6 decimales y el máximo', () => {
    expect(validarReporte({ avance: 0 }).avance).toBe(0);
    expect(validarReporte({ avance: -0 }).avance).toBe(0);
    expect(validarReporte({ avance: 1.123456 }).avance).toBe(1.123456);
    expect(validarReporte({ avance: LIMITES_PAI.maxAvance }).avance).toBe(
      LIMITES_PAI.maxAvance,
    );
  });

  it('textos de más de 10 000 caracteres (y numeral de más de 200)', () => {
    expect(
      validarReporte({ logros: 'á'.repeat(LIMITES_PAI.maxTexto) }).logros,
    ).toHaveLength(LIMITES_PAI.maxTexto);
    expect(
      error400(() =>
        validarReporte({ logros: 'a'.repeat(LIMITES_PAI.maxTexto + 1) }),
      ).campos,
    ).toHaveProperty('logros');
    expect(
      error400(() => validarReporte({ numeralRiesgo: '1'.repeat(201) })).campos,
    ).toHaveProperty('numeralRiesgo');
    expect(
      error400(() => validarReporte({ fuentesVerificacion: 5 })).campos,
    ).toHaveProperty('fuentesVerificacion');
  });

  it('riesgo materializado solo SI o NO', () => {
    expect(
      validarReporte({ riesgoMaterializado: 'no' }).riesgoMaterializado,
    ).toBe('NO');
    expect(
      validarReporte({ riesgoMaterializado: '' }).riesgoMaterializado,
    ).toBeNull();
    expect(
      error400(() => validarReporte({ riesgoMaterializado: 'tal vez' })).campos,
    ).toHaveProperty('riesgoMaterializado');
  });

  it('actualizadoEn que no es fecha ISO: 400', () => {
    expect(
      error400(() => validarReporte({ actualizadoEn: 'ayer' })).campos,
    ).toHaveProperty('actualizadoEn');
    expect(
      error400(() => validarReporte({ actualizadoEn: 5 })).campos,
    ).toHaveProperty('actualizadoEn');
  });

  it('el cuerpo debe ser un objeto', () => {
    expect(error400(() => validarReporte([])).campos).toBeUndefined();
    expect(error400(() => validarReporte('avance=1')).campos).toBeUndefined();
    expect(error400(() => validarReporte(null)).campos).toBeUndefined();
  });
});

describe('erroresRiesgo', () => {
  it('con SI exige numeral y descripción', () => {
    expect(
      erroresRiesgo({
        riesgoMaterializado: 'SI',
        numeralRiesgo: null,
        descripcionRiesgo: null,
      }),
    ).toEqual({
      numeralRiesgo: expect.any(String),
      descripcionRiesgo: expect.any(String),
    });
    expect(
      erroresRiesgo({
        riesgoMaterializado: 'SI',
        numeralRiesgo: '2',
        descripcionRiesgo: 'Se cayó el sistema',
      }),
    ).toEqual({});
    expect(
      erroresRiesgo({
        riesgoMaterializado: 'NO',
        numeralRiesgo: null,
        descripcionRiesgo: null,
      }),
    ).toEqual({});
    expect(
      erroresRiesgo({
        riesgoMaterializado: null,
        numeralRiesgo: null,
        descripcionRiesgo: null,
      }),
    ).toEqual({});
  });
});

describe('validarDatosVigencia', () => {
  it('abrir con o sin fecha límite futura; cerrar', () => {
    expect(
      validarDatosVigencia({ bimestreAbierto: 4, abiertoHasta: null }, AHORA),
    ).toEqual({
      bimestreAbierto: 4,
      abiertoHasta: null,
    });
    expect(validarDatosVigencia({ bimestreAbierto: 4 }, AHORA)).toEqual({
      bimestreAbierto: 4,
      abiertoHasta: null,
    });
    expect(
      validarDatosVigencia(
        { bimestreAbierto: 4, abiertoHasta: '2026-09-15T23:59:00-05:00' },
        AHORA,
      ),
    ).toEqual({
      bimestreAbierto: 4,
      abiertoHasta: new Date('2026-09-16T04:59:00Z'),
    });
    expect(
      validarDatosVigencia(
        { bimestreAbierto: null, abiertoHasta: null },
        AHORA,
      ),
    ).toEqual({
      bimestreAbierto: null,
      abiertoHasta: null,
    });
  });

  it.each([
    [{ bimestreAbierto: 7 }, 'bimestreAbierto'],
    [{ bimestreAbierto: 2.5 }, 'bimestreAbierto'],
    [{ bimestreAbierto: '3' }, 'bimestreAbierto'],
    [{}, 'bimestreAbierto'],
    [
      { bimestreAbierto: 3, abiertoHasta: '2026-08-20T09:59:00-05:00' },
      'abiertoHasta',
    ],
    [{ bimestreAbierto: 3, abiertoHasta: 'mañana' }, 'abiertoHasta'],
    [
      { bimestreAbierto: null, abiertoHasta: '2026-12-01T00:00:00Z' },
      'abiertoHasta',
    ],
  ])('inválido %j', (cuerpo, campo) => {
    expect(
      error400(() => validarDatosVigencia(cuerpo, AHORA)).campos,
    ).toHaveProperty(campo);
  });
});

describe('validarAutorizacion', () => {
  const valido = {
    usuarioId: 7,
    bimestre: 2,
    procesoId: 3,
    vigenteHasta: '2026-08-30T23:59:00-05:00',
    motivo: '  Corrección del avance de abril  ',
  };

  it('normaliza y exige exactamente uno de proceso o indicador', () => {
    expect(validarAutorizacion(valido, AHORA)).toEqual({
      usuarioId: 7,
      bimestre: 2,
      procesoId: 3,
      indicadorId: null,
      vigenteHasta: new Date('2026-08-31T04:59:00Z'),
      motivo: 'Corrección del avance de abril',
    });
    expect(
      validarAutorizacion({ ...valido, procesoId: null, indicadorId: 9 }, AHORA)
        .indicadorId,
    ).toBe(9);
    expect(
      error400(() => validarAutorizacion({ ...valido, indicadorId: 9 }, AHORA))
        .campos,
    ).toHaveProperty('indicadorId');
    expect(
      error400(() =>
        validarAutorizacion({ ...valido, procesoId: undefined }, AHORA),
      ).campos,
    ).toHaveProperty('procesoId');
  });

  it('vigenteHasta hasta un año después de hoy', () => {
    const enUnAnio = new Date(AHORA.getTime() + 365 * 86_400_000);
    expect(
      validarAutorizacion({ ...valido, vigenteHasta: enUnAnio.toISOString() }, AHORA)
        .vigenteHasta,
    ).toEqual(enUnAnio);
  });

  it.each([
    [{ usuarioId: 0 }, 'usuarioId'],
    [{ usuarioId: null }, 'usuarioId'],
    [{ bimestre: 0 }, 'bimestre'],
    [{ bimestre: null }, 'bimestre'],
    [{ procesoId: -2 }, 'procesoId'],
    [{ vigenteHasta: '2026-08-19T00:00:00Z' }, 'vigenteHasta'],
    [{ vigenteHasta: null }, 'vigenteHasta'],
    // Más de un año después: no se otorgan permisos casi indefinidos (SEG-7).
    [{ vigenteHasta: '2099-12-31T23:59:00Z' }, 'vigenteHasta'],
    [{ vigenteHasta: new Date(AHORA.getTime() + 367 * 86_400_000).toISOString() }, 'vigenteHasta'],
    [{ motivo: '   ' }, 'motivo'],
    [{ motivo: 'x'.repeat(LIMITES_PAI.maxMotivoAutorizacion + 1) }, 'motivo'],
  ])('inválido %j', (cambio, campo) => {
    expect(
      error400(() => validarAutorizacion({ ...valido, ...cambio }, AHORA))
        .campos,
    ).toHaveProperty(campo);
  });
});

describe('validarConsultaRegistro', () => {
  it('valores por defecto y conversión', () => {
    expect(validarConsultaRegistro({})).toEqual({
      pagina: 1,
      usuario: null,
      indicador: null,
      accion: null,
    });
    expect(
      validarConsultaRegistro({
        pagina: '3',
        usuario: '5',
        indicador: 'saf-th-02',
        accion: 'guardar_reporte',
      }),
    ).toEqual({
      pagina: 3,
      usuario: 5,
      indicador: 'SAF-TH-02',
      accion: 'guardar_reporte',
    });
    expect(
      validarConsultaRegistro({ indicador: '42', accion: '' }).indicador,
    ).toBe(42);
  });

  it.each([
    { pagina: '0' },
    { pagina: 'x' },
    { pagina: '100001' },
    { usuario: '-1' },
    { indicador: 'no es código' },
    { accion: 'borrar_todo' },
    { accion: ['a', 'b'] },
  ])('inválido %j', (consulta) => {
    expect(
      error400(() => validarConsultaRegistro(consulta)).campos,
    ).toBeDefined();
  });
});

describe('validarConsultaExportacion', () => {
  it('filtros vacíos = sin filtro', () => {
    expect(validarConsultaExportacion({ dependencia: '', q: '  ' })).toEqual({
      filtros: {
        dependencia: null,
        proceso: null,
        programa: null,
        riesgo: null,
        linea: null,
        dimension: null,
        tipo: null,
        estado: null,
        q: null,
      },
      bimestre: null,
      vigencia: null,
    });
  });

  it('convierte los filtros, el bimestre y la vigencia', () => {
    const consulta = validarConsultaExportacion({
      dependencia: '1',
      proceso: '2',
      programa: 'Programa X',
      riesgo: '3',
      linea: '1. Creemos',
      dimension: 'Dimensión',
      tipo: 'proyecto',
      estado: 'pendiente',
      q: 'encuesta',
      bimestre: '4',
      vigencia: '2026',
    });
    expect(consulta).toEqual({
      filtros: {
        dependencia: 1,
        proceso: 2,
        programa: 'Programa X',
        riesgo: 3,
        linea: '1. Creemos',
        dimension: 'Dimensión',
        tipo: 'proyecto',
        estado: 'pendiente',
        q: 'encuesta',
      },
      bimestre: 4,
      vigencia: 2026,
    });
  });

  it.each([
    { dependencia: 'SAF' },
    { tipo: 'programa' },
    { estado: 'futuro' },
    { bimestre: '7' },
    { vigencia: '26' },
    { q: 'x'.repeat(201) },
  ])('inválido %j', (consulta) => {
    expect(
      error400(() => validarConsultaExportacion(consulta)).campos,
    ).toBeDefined();
  });
});
