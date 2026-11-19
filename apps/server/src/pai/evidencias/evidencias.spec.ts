import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LIMITES_PAI, RUTA_API_PAI, TIPOS_EVIDENCIA } from '../api-pai.js';
import {
  AlmacenArchivosBd,
  resumenBuffer,
} from '../../repositorio/archivos/almacen-archivos.js';
import { ClienteStorage } from '../../repositorio/archivos/almacen-supabase.js';
import { MIME } from '../../repositorio/archivos/tipos-archivo.js';
import type { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import { ErrorRepositorioHttp } from '../../repositorio/errores-repositorio.js';
import { ErrorDeConfiguracion } from '../../config/configuracion.js';
import type { ConfiguracionPai } from '../configuracion-pai.js';
import { ErrorPaiHttp } from '../errores-pai.js';
import {
  CACHE_EVIDENCIA,
  crearAlmacenEvidencias,
  esRutaPrivada,
  esSubidaEvidencia,
  rutaPrivadaNueva,
} from './almacen-evidencias.js';
import {
  aEvidenciaPai,
  evidenciasDeReportes,
  urlDescargaEvidencia,
} from './evidencia-pai.js';
import { nombreEvidencia } from './servicio-evidencias.js';

const CONFIG_PAI: ConfiguracionPai = {
  bucketEvidencias: 'pai-evidencias',
  segundosUrlFirmada: 60,
};
const SUPABASE = {
  url: 'https://abcd.supabase.co',
  clave: 'sb_secret_x',
  bucket: 'repositorio',
};

/** BaseDatosRepositorio mínima: almacenamiento y, si hace falta, filas. */
function bdFalsa(
  almacenamiento: typeof SUPABASE | null,
  filas: (sql: string) => unknown[] = () => [],
): BaseDatosRepositorio {
  return {
    almacenamiento,
    tamanoTrozo: 1024 * 1024,
    filas: (sql: string) => Promise.resolve(filas(sql)),
  } as unknown as BaseDatosRepositorio;
}

/**
 * fetch falso: anota cada petición y responde lo indicado. La consulta del
 * bucket (GET /bucket/<id>, la comprobación de que es privado) responde
 * privado y no se anota, salvo `bucketPublico`.
 */
function fetchFalso(
  responder: (url: string, init: RequestInit) => Response,
  { bucketPublico = false }: { bucketPublico?: boolean } = {},
) {
  const peticiones: Array<{ url: string; init: RequestInit }> = [];
  const pedir = (async (
    entrada: string | URL | Request,
    init: RequestInit = {},
  ) => {
    const url = String(entrada);
    if (url.includes('/storage/v1/bucket/')) {
      return Response.json({ id: 'pai-evidencias', public: bucketPublico });
    }
    peticiones.push({ url, init });
    return responder(url, init);
  }) as typeof fetch;
  return { peticiones, pedir };
}

describe('nombre de la evidencia', () => {
  it.each([
    ['informe final.pdf', MIME.pdf, 'informe final.pdf'],
    ['  Informe\tde   avance.PDF ', MIME.pdf, 'Informe de avance.PDF'],
    ['C:\\Users\\ana\\Desktop\\acta.docx', MIME.docx, 'acta.docx'],
    ['../../etc/avance.xlsx', MIME.xlsx, 'avance.xlsx'],
    ['acta\u0000 firmada\u0007.pdf', MIME.pdf, 'acta firmada.pdf'],
    // Sin extensión: se agrega la del tipo real.
    ['blob', MIME.png, 'blob.png'],
    ['foto de la reunión', MIME.jpeg, 'foto de la reunión.jpg'],
    // Sin nombre útil: uno genérico con la extensión del tipo real.
    ['', MIME.pdf, 'evidencia.pdf'],
    ['..', MIME.webp, 'evidencia.webp'],
    ['carpeta/', MIME.pptx, 'evidencia.pptx'],
  ])('%j (%s) -> %j', (original, mime, esperado) => {
    expect(nombreEvidencia(original, mime)).toBe(esperado);
  });

  it('arregla los nombres UTF-8 que busboy entrega leídos como latin1', () => {
    const latin1 = Buffer.from(
      'Ejecución bimestre 4 – año.pdf',
      'utf8',
    ).toString('latin1');
    expect(nombreEvidencia(latin1, MIME.pdf)).toBe(
      'Ejecución bimestre 4 – año.pdf',
    );
  });

  it('recorta a LIMITES_PAI.maxNombreArchivo caracteres conservando la extensión', () => {
    const nombre = nombreEvidencia(`${'á'.repeat(400)}.xlsx`, MIME.xlsx);
    expect([...nombre]).toHaveLength(LIMITES_PAI.maxNombreArchivo);
    expect(nombre.endsWith('.xlsx')).toBe(true);
    const emojis = nombreEvidencia(`${'📊'.repeat(300)}.pdf`, MIME.pdf);
    expect([...emojis]).toHaveLength(LIMITES_PAI.maxNombreArchivo);
    expect(emojis.endsWith('📊.pdf')).toBe(true);
  });

  it('los tipos de evidencia del contrato son los que reconoce el detector', () => {
    expect([...TIPOS_EVIDENCIA].toSorted()).toEqual(
      [
        MIME.pdf,
        MIME.png,
        MIME.jpeg,
        MIME.webp,
        MIME.docx,
        MIME.xlsx,
        MIME.pptx,
      ].toSorted(),
    );
  });
});

describe('rutas del bucket privado', () => {
  it('evidencias/<uuid>.<extensión del tipo real> y subidas/<uuid>', () => {
    const ruta = rutaPrivadaNueva(MIME.xlsx);
    expect(ruta).toMatch(/^evidencias\/[0-9a-f-]{36}\.xlsx$/);
    expect(esRutaPrivada(ruta)).toBe(true);
    expect(rutaPrivadaNueva(MIME.jpeg)).toMatch(/\.jpg$/);
    expect(rutaPrivadaNueva(MIME.pdf)).not.toBe(rutaPrivadaNueva(MIME.pdf));
    expect(
      esSubidaEvidencia('subidas/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d'),
    ).toBe(true);
  });

  it.each([
    'archivos/7-abc.pdf',
    'evidencias/../archivos/x.pdf',
    'subidas/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d/../x',
    'subidas/no-es-uuid',
    '',
    null,
    42,
  ])('rechaza %j', (ruta) => {
    expect(esRutaPrivada(ruta)).toBe(false);
    expect(esSubidaEvidencia(ruta)).toBe(false);
  });
});

describe('filas de pai_evidencias', () => {
  it('aEvidenciaPai: números, fecha ISO y URL de descarga', () => {
    expect(
      aEvidenciaPai({
        id: 7 as never,
        nombre: 'acta.pdf',
        tipo: MIME.pdf,
        bytes: '1234' as never,
        subido_en: new Date('2026-10-11T15:00:00.000Z'),
        subido_por_nombre: null,
      }),
    ).toEqual({
      id: 7,
      nombre: 'acta.pdf',
      tipo: MIME.pdf,
      bytes: 1234,
      subidoEn: '2026-10-11T15:00:00.000Z',
      subidoPor: null,
      urlDescarga: `${RUTA_API_PAI}/evidencias/7`,
    });
    expect(urlDescargaEvidencia(12)).toBe('/api/pai/evidencias/12');
  });

  it('evidenciasDeReportes agrupa por reporte, en lotes de 500 y sin consultar si no hay reportes', async () => {
    const consultas: unknown[][] = [];
    const conexion = {
      query: (_sql: string, valores: unknown[]) => {
        consultas.push(valores);
        const ids = valores[0] as number[];
        const filas = ids
          .filter((id) => id % 2 === 0)
          .map((id) => ({
            id: id * 10,
            reporte_id: id,
            nombre: `r${id}.pdf`,
            tipo: MIME.pdf,
            bytes: 1,
            subido_en: '2026-10-11T15:00:00Z',
            subido_por_nombre: 'Ana',
          }));
        return Promise.resolve([filas, []]);
      },
    };
    expect((await evidenciasDeReportes(conexion as never, [])).size).toBe(0);
    expect(consultas).toHaveLength(0);
    const ids = Array.from({ length: 1001 }, (_v, i) => i + 1);
    const mapa = await evidenciasDeReportes(conexion as never, [...ids, 2, 4]);
    expect(consultas.map((valores) => (valores[0] as number[]).length)).toEqual(
      [500, 500, 1],
    );
    expect(mapa.size).toBe(500);
    expect(mapa.get(2)).toEqual([
      expect.objectContaining({
        id: 20,
        subidoPor: 'Ana',
        urlDescarga: '/api/pai/evidencias/20',
      }),
    ]);
    expect(mapa.has(3)).toBe(false);
  });
});

describe('almacén de evidencias', () => {
  let carpeta: string;
  const datos = Buffer.from('%PDF-1.7\nevidencia del PAI\n%%EOF');

  beforeAll(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'pai-evidencias-'));
    await writeFile(join(carpeta, 'a.pdf'), datos);
  });
  afterAll(async () => {
    await rm(carpeta, { recursive: true, force: true });
  });

  it('sin Supabase: en la base, sin subidas directas ni URL firmadas (las grandes, por partes)', async () => {
    const sentencias: string[] = [];
    const bd = {
      ...bdFalsa(null),
      ejecutar: (sql: string) => {
        sentencias.push(sql);
        return Promise.resolve({ affectedRows: 2, insertId: 0 });
      },
    } as unknown as BaseDatosRepositorio;
    const almacen = crearAlmacenEvidencias(bd, CONFIG_PAI);
    expect(almacen.directa).toBe(false);
    expect(almacen.porPartes).toBe(true);
    expect(almacen.enBase).toBeInstanceOf(AlmacenArchivosBd);
    const archivo = {
      ruta: join(carpeta, 'a.pdf'),
      mime: MIME.pdf,
      resumen: resumenBuffer(datos),
    };
    expect(await almacen.subirContenido(archivo)).toBeNull();
    expect(await almacen.urlDescarga('evidencias/x.pdf', 'a.pdf')).toBeNull();
    await expect(
      almacen.crearSubida({ usuarioId: 1, indicadorId: 2, bimestre: 4 }),
    ).rejects.toThrow(/multipart/);
    expect(
      await almacen.esSubidaDe('subidas/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d', {
        usuarioId: 1,
        indicadorId: 2,
        bimestre: 4,
      }),
    ).toBe(false);
    // Sin bucket: la recolección solo purga las subidas por partes vencidas (con sus partes).
    expect(await almacen.recolectarHuerfanos()).toEqual({
      objetos: 0,
      subidas: 2,
    });
    expect(sentencias).toEqual(['DELETE FROM pai_subidas WHERE creado_en <= ?']);
  });

  it('con Supabase: se niega a usar el bucket público del repositorio para las evidencias', () => {
    expect(() =>
      crearAlmacenEvidencias(bdFalsa(SUPABASE), {
        ...CONFIG_PAI,
        bucketEvidencias: SUPABASE.bucket,
      }),
    ).toThrow(ErrorDeConfiguracion);
  });

  it('con Supabase: sube al bucket PRIVADO sin upsert ni caché y firma descargas de 60 s', async () => {
    const { peticiones, pedir } = fetchFalso((url) =>
      url.includes('/object/sign/')
        ? Response.json({
            signedURL: '/object/sign/pai-evidencias/evidencias/x.pdf?token=t',
          })
        : Response.json({}),
    );
    const privado = new ClienteStorage(
      { ...SUPABASE, bucket: CONFIG_PAI.bucketEvidencias },
      pedir,
    );
    const almacen = crearAlmacenEvidencias(
      bdFalsa(SUPABASE),
      CONFIG_PAI,
      privado,
    );
    expect(almacen.directa).toBe(true);

    const ruta = await almacen.subirContenido({
      ruta: join(carpeta, 'a.pdf'),
      mime: MIME.pdf,
      resumen: resumenBuffer(datos),
    });
    expect(esRutaPrivada(ruta)).toBe(true);
    expect(peticiones[0]!.url).toBe(
      `https://abcd.supabase.co/storage/v1/object/pai-evidencias/${ruta}`,
    );
    expect(peticiones[0]!.init.headers).toMatchObject({
      'Content-Type': MIME.pdf,
      'x-upsert': 'false',
      'cache-control': CACHE_EVIDENCIA,
    });

    const url = await almacen.urlDescarga('evidencias/x.pdf', 'Acta N.º 3.pdf');
    expect(url).toBe(
      'https://abcd.supabase.co/storage/v1/object/sign/pai-evidencias/evidencias/x.pdf?token=t&download=Acta%20N.%C2%BA%203.pdf',
    );
    expect(JSON.parse(String(peticiones[1]!.init.body))).toEqual({
      expiresIn: 60,
    });
    // Nunca se pide nada al bucket público ni se arma una URL pública.
    expect(
      peticiones.every(
        ({ url: u }) => !u.includes('/repositorio') && !u.includes('/public/'),
      ),
    ).toBe(true);
  });

  it('con Supabase: un bucket de evidencias PÚBLICO no se usa: 503 y error en el registro (BD-9)', async () => {
    const { peticiones, pedir } = fetchFalso(() => Response.json({}), {
      bucketPublico: true,
    });
    const almacen = crearAlmacenEvidencias(
      bdFalsa(SUPABASE),
      CONFIG_PAI,
      new ClienteStorage({ ...SUPABASE, bucket: 'pai-evidencias' }, pedir),
    );
    const registro = vi
      .spyOn(
        (almacen as unknown as { registro: { error: () => void } }).registro,
        'error',
      )
      .mockImplementation(() => undefined);
    for (const intento of [
      () =>
        almacen.subirContenido({
          ruta: join(carpeta, 'a.pdf'),
          mime: MIME.pdf,
          resumen: resumenBuffer(datos),
        }),
      () => almacen.urlDescarga('evidencias/x.pdf', 'a.pdf'),
      () =>
        almacen.crearSubida({ usuarioId: 1, indicadorId: 2, bimestre: 4 }),
    ]) {
      const error = await intento().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ErrorPaiHttp);
      expect((error as ErrorPaiHttp).getStatus()).toBe(503);
    }
    // No subió ni firmó nada.
    expect(peticiones).toHaveLength(0);
    expect(registro).toHaveBeenCalledWith(
      expect.stringMatching(/pai-evidencias de las evidencias del PAI es PÚBLICO/),
    );
  });

  it('ClienteStorage.borrar parte los borrados en lotes de 500 rutas (BD-1)', async () => {
    const { peticiones, pedir } = fetchFalso(() => Response.json([]));
    const cliente = new ClienteStorage(
      { ...SUPABASE, bucket: 'pai-evidencias' },
      pedir,
    );
    const rutas = Array.from({ length: 1201 }, (_v, i) => `subidas/${i}`);
    await cliente.borrar(rutas);
    expect(
      peticiones.map(
        ({ init }) =>
          (JSON.parse(String(init.body)) as { prefixes: string[] }).prefixes
            .length,
      ),
    ).toEqual([500, 500, 201]);
    await cliente.borrar([]);
    expect(peticiones).toHaveLength(3);
  });

  it('con Supabase: no sube un archivo que cambió después de validarlo', async () => {
    const { peticiones, pedir } = fetchFalso(() => Response.json({}));
    const almacen = crearAlmacenEvidencias(
      bdFalsa(SUPABASE),
      CONFIG_PAI,
      new ClienteStorage({ ...SUPABASE, bucket: 'pai-evidencias' }, pedir),
    );
    await expect(
      almacen.subirContenido({
        ruta: join(carpeta, 'a.pdf'),
        mime: MIME.pdf,
        resumen: resumenBuffer(Buffer.from('otro contenido')),
      }),
    ).rejects.toThrow(/cambió/);
    expect(peticiones).toHaveLength(0);
  });

  it('con Supabase: un 5xx de Storage es 503 (no disponible), no 500', async () => {
    const { pedir } = fetchFalso(() =>
      Response.json({ message: 'caído' }, { status: 503 }),
    );
    const almacen = crearAlmacenEvidencias(
      bdFalsa(SUPABASE),
      CONFIG_PAI,
      new ClienteStorage({ ...SUPABASE, bucket: 'pai-evidencias' }, pedir),
    );
    const error = await almacen
      .urlDescarga('evidencias/x.pdf', 'a.pdf')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorRepositorioHttp);
    expect((error as ErrorRepositorioHttp).getStatus()).toBe(503);
  });

  it('con Supabase: borrarContenido y borrarSubida no lanzan, avisan, y solo borran rutas del PAI', async () => {
    const { peticiones, pedir } = fetchFalso(() =>
      Response.json({ message: 'caído' }, { status: 500 }),
    );
    const almacen = crearAlmacenEvidencias(
      bdFalsa(SUPABASE),
      CONFIG_PAI,
      new ClienteStorage({ ...SUPABASE, bucket: 'pai-evidencias' }, pedir),
    );
    const aviso = vi.spyOn(
      (almacen as unknown as { registro: { warn: () => void } }).registro,
      'warn',
    );
    aviso.mockImplementation(() => undefined);
    const ruta = rutaPrivadaNueva(MIME.pdf);
    await expect(
      almacen.borrarContenido([null, 'archivos/1-x.pdf', ruta]),
    ).resolves.toBeUndefined();
    expect(JSON.parse(String(peticiones[0]!.init.body))).toEqual({
      prefixes: [ruta],
    });
    await expect(
      almacen.borrarSubida('archivos/1-x.pdf'),
    ).resolves.toBeUndefined();
    expect(peticiones).toHaveLength(1);
    await expect(
      almacen.borrarSubida('subidas/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d'),
    ).resolves.toBeUndefined();
    expect(peticiones).toHaveLength(2);
    expect(aviso).toHaveBeenCalledTimes(2);
  });

  it('recolectarHuerfanos: objetos sin evidencia de más de una hora y subidas sin fila de más de 2 h 10 min', async () => {
    const ahora = new Date('2026-10-11T12:00:00.000Z');
    const hace = (minutos: number) =>
      new Date(ahora.getTime() - minutos * 60_000).toISOString();
    const usada = 'evidencias/00000000-0000-4000-8000-000000000001.pdf';
    const huerfanaVieja = 'evidencias/00000000-0000-4000-8000-000000000002.pdf';
    const huerfanaNueva = 'evidencias/00000000-0000-4000-8000-000000000003.pdf';
    const sinFecha = 'evidencias/00000000-0000-4000-8000-000000000004.pdf';
    const { peticiones, pedir } = fetchFalso((_url, init) => {
      if (init.method === 'DELETE') return Response.json([]);
      const { prefix } = JSON.parse(String(init.body)) as { prefix: string };
      return Response.json(
        prefix === 'evidencias'
          ? [
              { name: usada.slice(11), id: 1, created_at: hace(600) },
              { name: huerfanaVieja.slice(11), id: 2, created_at: hace(61) },
              { name: huerfanaNueva.slice(11), id: 3, created_at: hace(5) },
              { name: sinFecha.slice(11), id: 4 },
            ]
          : [
              {
                name: '00000000-0000-4000-8000-00000000000a',
                id: 5,
                created_at: hace(25 * 60),
              },
              {
                name: '00000000-0000-4000-8000-00000000000b',
                id: 6,
                created_at: hace(60),
              },
              // Vieja, pero sigue pendiente en pai_subidas: no se toca.
              {
                name: '00000000-0000-4000-8000-00000000000c',
                id: 7,
                created_at: hace(25 * 60),
              },
            ],
      );
    });
    const consultas: string[] = [];
    const almacen = crearAlmacenEvidencias(
      bdFalsa(SUPABASE, (sql) => {
        consultas.push(sql);
        if (sql.includes('FROM pai_evidencias')) return [{ ruta_privada: usada }];
        if (sql.startsWith('SELECT ruta FROM pai_subidas')) {
          return [{ ruta: 'subidas/00000000-0000-4000-8000-00000000000c' }];
        }
        return [];
      }),
      CONFIG_PAI,
      new ClienteStorage({ ...SUPABASE, bucket: 'pai-evidencias' }, pedir),
    );
    expect(await almacen.recolectarHuerfanos({ ahora })).toEqual({
      objetos: 1,
      subidas: 1,
    });
    expect(consultas.some((sql) => /FROM pai_evidencias/.test(sql))).toBe(true);
    const borrado = peticiones.find(({ init }) => init.method === 'DELETE')!;
    expect(borrado.url).toBe(
      'https://abcd.supabase.co/storage/v1/object/pai-evidencias',
    );
    expect(JSON.parse(String(borrado.init.body))).toEqual({
      prefixes: [huerfanaVieja, 'subidas/00000000-0000-4000-8000-00000000000a'],
    });
  });
});
