import { describe, expect, it } from 'vitest';
import { claveColumna, claveFondo, type Consultar, type Fila, fichasSapiencia, lectorDe, numero, periodo, pesos, texto } from './fichas-sapiencia.js';

/** Base falsa: responde según la tabla que nombra la consulta. Datos inventados. */
function baseFalsa(tablas: Record<string, Fila[]>): { consultar: Consultar; consultas: string[] } {
  const consultas: string[] = [];
  const consultar: Consultar = async (sql) => {
    consultas.push(sql);
    const tabla = Object.keys(tablas).find((t) => new RegExp(`FROM ${t}\\b`).test(sql));
    return tabla ? tablas[tabla] : [];
  };
  return { consultar, consultas };
}

const transaccion = (periodoRenovado: string, estado: number, nombre: string, matricula: number | null, sostenimiento: number | null): Fila => ({
  id: periodoRenovado,
  docconvfondo: '999000111-2019-2EPM',
  DOCUMENTO: '999000111',
  convocatoria: '2019-2',
  fondo_sapiencia: 'EPM',
  periodo_renovado: periodoRenovado,
  estado,
  estado_nombre: nombre,
  motivo_estado: 'Renovado',
  modalidad: 'MATRICULA Y SOSTENIMIENTO',
  semestres_financiar: 8,
  giros_realizados: 2,
  monto_matricula: matricula,
  monto_sostenimiento: sostenimiento,
  estado_general: 'NOTIFICADO',
  motivo_finalizacion: 'None',
  pacc: 'SI',
  operador_financiero: 'FIDUCIARIA DE PRUEBA',
});

describe('valores de la base de Sapiencia', () => {
  it('lee texto, números y pesos como el ETL', () => {
    expect(texto(null)).toBe('');
    expect(texto('None')).toBe('');
    expect(texto('2025-08-14 00:00:00')).toBe('2025-08-14');
    expect(texto('4.00')).toBe('4');
    expect(texto('  dos   espacios ')).toBe('dos espacios');
    expect(numero('2051020.00')).toBe(2_051_020);
    expect(numero('$ 3.800.000')).toBe(3_800_000);
    expect(numero('PRESENCIAL')).toBeNull();
    expect(pesos(3_800_000)).toBe('$ 3.800.000');
    expect(pesos('')).toBe('');
  });

  it('pone el periodo con guion aunque la base escriba «2020 2»', () => {
    expect(periodo('2020 2')).toBe('2020-2');
    expect(periodo('2020-2')).toBe('2020-2');
    expect(periodo('')).toBe('');
  });

  it('encuentra columnas aunque cambien espacios, guiones bajos o tildes mal guardadas', () => {
    expect(claveColumna('PERÍODO RENOVADO')).toBe(claveColumna('PER�ODO RENOVADO'));
    expect(claveColumna('ID USUARIO (TI)')).toBe(claveColumna('ID_USUARIO_TI'));
    const leer = lectorDe([{ 'PER�ODO RENOVADO': '2021-1', ESTADO_GENERAL: 'ACTIVO' }]);
    expect(leer({ 'PER�ODO RENOVADO': '2021-1', ESTADO_GENERAL: 'ACTIVO' }, 'PERIODO RENOVADO')).toBe('2021-1');
    expect(leer({ 'PER�ODO RENOVADO': '2021-1', ESTADO_GENERAL: 'ACTIVO' }, 'ESTADO GENERAL')).toBe('ACTIVO');
  });

  it('reconoce el programa de pregrado por su fondo', () => {
    expect(claveFondo('EPM')).toBe('EPM');
    expect(claveFondo('PRESUPUESTO PARTICIPATIVO')).toBe('PP');
    expect(claveFondo('PUAP PP')).toBe('PUAP PP');
    expect(claveFondo('PUAP RO')).toBe('PUAP RO');
    expect(claveFondo('CONSEJO DISTRITAL DE JUVENTUD')).toBe('CDJ');
  });
});

describe('fichas en vivo', () => {
  it('un documento con letras no se consulta', async () => {
    const { consultar, consultas } = baseFalsa({});
    expect(await fichasSapiencia(consultar, 'AB12345')).toEqual([]);
    expect(consultas).toEqual([]);
  });

  it('arma la ficha de pregrado: periodos en orden, estado por nombre, giros pendientes y total', async () => {
    const { consultar } = baseFalsa({
      informacion_transaccional: [
        transaccion('2020-1', 3, 'SUSPENSION TEMPORAL', null, null),
        transaccion('2019-2', 1, 'ACTIVO', 2_500_000, 1_300_000),
        transaccion('2020-2', 24, 'NOTIFICADO', 0, 0),
      ],
      informacion_personal: [{ docconvfondo: '999000111-2019-2EPM', nombre_completo: 'PERSONA DE PRUEBA', celular: '3000000000' }],
      informacion_programas_academicos: [{ docconvfondo: '999000111-2019-2EPM', ies_actual: 'UNIVERSIDAD DE PRUEBA' }],
      prorroga_periodo_de_gracia: [{ docconvfondo: '999000111-2019-2EPM', fecha_fin_prorroga: '2026-06-30' }],
      renuncia_o_terminacion: [],
      mejores_bachilleres: [],
    });
    const [ficha] = await fichasSapiencia(consultar, '999000111');
    expect(ficha).toMatchObject({ p: 'EPM', c: '2019-2', n: 'PERSONA DE PRUEBA', e: 'NOTIFICADO' });
    const [titulo, columnas, filas] = ficha.t[0];
    expect(titulo).toBe('Historial por periodo');
    expect(columnas).toEqual(['Periodo', 'Estado', 'Motivo', 'Modalidad', 'Giros realizados', 'Giros pendientes', 'Semestres a financiar', 'Matrícula', 'Sostenimiento', 'Monto total']);
    expect(filas.map((f) => f[0])).toEqual(['2019-2', '2020-1', '2020-2']);
    expect(filas[0]).toEqual(['2019-2', 'ACTIVO', 'Renovado', 'MATRICULA Y SOSTENIMIENTO', '2', '6', '8', '$ 2.500.000', '$ 1.300.000', '$ 3.800.000']);
    // Sin montos, las celdas de pesos quedan vacías (no «$ 0»).
    expect(filas[1].slice(7)).toEqual(['', '', '']);
    const cierre = Object.fromEntries(ficha.s.find(([t]) => t === 'Cierre y PACC')?.[1] ?? []);
    expect(cierre).toMatchObject({ 'Total desembolsado': '$ 3.800.000', 'Motivo de finalización': 'NO APLICA', 'Fecha máxima del periodo de gracia': '2026-06-30', PACC: 'SI' });
    const beneficio = Object.fromEntries(ficha.s.find(([t]) => t === 'Beneficio')?.[1] ?? []);
    expect(beneficio['También en Mejores Bachilleres']).toBe('NO');
  });

  it('en posgrado toma el estado general con texto aunque las columnas vengan intercambiadas, y agrupa por beneficio', async () => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- fila de prueba de este caso, al lado de donde se usa
    const fila = (p: string, girado: string): Fila => ({
      id: p,
      docconvfondo: '999000222-2023-2FA',
      documento: '999000222',
      convocatoria: '2023-2',
      id_fondo: 3,
      estado_general: '0',
      id_estado_general_actual: 'NO ACTIVO',
      periodo_renovado: p,
      estado_periodo_renovado: 'PERIODO DE GRACIA',
      valor_girado_periodo_num: girado,
      valor_giros_realizados_num: '20000000.00',
      nombre_completo_beneficaria: 'OTRA PERSONA DE PRUEBA',
    });
    const { consultar } = baseFalsa({ posgrado_beneficio_periodo: [fila('2024-1', '10000000.00'), fila('2023-2', '10000000.00')] });
    const [ficha] = await fichasSapiencia(consultar, '999000222');
    expect(ficha).toMatchObject({ p: 'FA', c: '2023-2', e: 'NO ACTIVO' });
    expect(Object.fromEntries(ficha.s[0][1])['Estado general']).toBe('NO ACTIVO');
    expect(ficha.t[0][2].map((f) => f[0])).toEqual(['2023-2', '2024-1']);
    expect(ficha.t[0][1].at(-1)).toBe('Total desembolsado');
    expect(ficha.t[0][2][0].at(-1)).toBe('$ 20.000.000');
  });

  it('Mejores Deportistas: periodo «2020 2» ordenado con los demás y columnas con tildes mal guardadas', async () => {
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- fila de prueba de este caso, al lado de donde se usa
    const fila = (p: string): Fila => ({ id: p, CONVOCATORIA: '2020-2', 'DOCUMENTO BENEFICIARIO': '999000333', 'PER�ODO RENOVADO': p, ESTADO: 'ACTIVO' });
    const { consultar } = baseFalsa({ mejores_deportistas: [fila('2021-1'), fila('2020 2')] });
    const fichas = await fichasSapiencia(consultar, '999000333');
    const md = fichas.find((f) => f.p === 'MD');
    expect(md?.t[0][2].map((f) => f[0])).toEqual(['2020-2', '2021-1']);
  });

  it('los eventos salen en una ficha aparte, en orden de fecha', async () => {
    const { consultar } = baseFalsa({
      vista_eventos_beneficiarios: [
        { fecha_evento: '2025-03-04', periodo_evento: '2025-1', tipo_evento: 'Prorroga de periodo de gracia' },
        { fecha_evento: '2021-02-11', periodo_evento: '2021-1', tipo_evento: 'Suspension temporal' },
      ],
    });
    const fichas = await fichasSapiencia(consultar, '999000444');
    expect(fichas).toHaveLength(1);
    expect(fichas[0].p).toBe('EVENTOS');
    expect(fichas[0].t[0][2].map((f) => f[0])).toEqual(['2021-02-11', '2025-03-04']);
  });
});
