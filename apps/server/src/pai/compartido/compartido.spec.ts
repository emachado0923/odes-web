import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  HttpException,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { RAIZ_SERVIDOR } from '../../config/configuracion.js';
import { TABLAS_CON_ID } from '../../repositorio/bd/conexion.js';
import {
  noDisponible as noDisponibleRepositorio,
  noEncontrado as noEncontradoRepositorio,
  ocupado as ocupadoRepositorio,
  solicitudInvalida as solicitudInvalidaRepositorio,
} from '../../repositorio/errores-repositorio.js';
import { MENSAJES_ERROR_PAI } from '../api-pai.js';
import {
  BUCKET_EVIDENCIAS_POR_DEFECTO,
  cargarConfiguracionPai,
} from '../configuracion-pai.js';
import {
  cambioContrasenaRequerido,
  demasiadasEvidencias,
  demasiadosIntentos,
  MENSAJE_OCUPADO_PAI,
} from '../errores-pai.js';
import { FiltroErroresPai } from '../http/filtro-errores-pai.js';
import { PaiModule } from '../pai.module.js';
import { PERMISOS_PAI } from './tipos-servidor.js';
import {
  bimestreDeRuta,
  enteroDeConsulta,
  idDeRuta,
  largo,
  validarCuerpo,
  vigenciaDeConsulta,
} from './validacion-comun.js';

afterEach(() => {
  vi.restoreAllMocks();
});

/** El error que lanza `fn` (o undefined). */
function capturar(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  return undefined;
}

/** Tablas que crea un guion de migración. */
function tablasDe(sql: string): string[] {
  return [...sql.matchAll(/^CREATE TABLE IF NOT EXISTS (\w+)/gm)].map(
    (m) => m[1],
  );
}

describe('FiltroErroresPai', () => {
  const filtro = new FiltroErroresPai();

  it('deja pasar los errores del PAI con su Retry-After', () => {
    expect(filtro.traducir(cambioContrasenaRequerido())).toEqual({
      estado: 403,
      cuerpo: {
        codigo: 'cambio_contrasena_requerido',
        mensaje: MENSAJES_ERROR_PAI.cambio_contrasena_requerido,
      },
      reintentarEn: undefined,
    });
    expect(filtro.traducir(demasiadosIntentos(600))).toMatchObject({
      estado: 429,
      reintentarEn: 600,
    });
    expect(filtro.traducir(demasiadasEvidencias())).toMatchObject({
      estado: 409,
      cuerpo: { codigo: 'conflicto' },
    });
  });

  it('cambia los mensajes del repositorio (base compartida) por los del PAI', () => {
    expect(filtro.traducir(noDisponibleRepositorio(5))).toEqual({
      estado: 503,
      cuerpo: {
        codigo: 'no_disponible',
        mensaje: MENSAJES_ERROR_PAI.no_disponible,
      },
      reintentarEn: 5,
    });
    expect(filtro.traducir(ocupadoRepositorio())).toMatchObject({
      estado: 503,
      cuerpo: { mensaje: MENSAJE_OCUPADO_PAI },
      reintentarEn: 2,
    });
    expect(filtro.traducir(noEncontradoRepositorio()).cuerpo).toEqual({
      codigo: 'no_encontrado',
      mensaje: MENSAJES_ERROR_PAI.no_encontrado,
    });
    // Un mensaje que no habla del repositorio se conserva, con sus campos.
    expect(
      filtro.traducir(
        solicitudInvalidaRepositorio('Escriba el usuario y la contraseña.', {
          usuario: 'Falta',
        }),
      ).cuerpo,
    ).toEqual({
      codigo: 'solicitud_invalida',
      mensaje: 'Escriba el usuario y la contraseña.',
      campos: { usuario: 'Falta' },
    });
  });

  it('otras excepciones: código por status; lo inesperado es 500 sin detalles', () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    expect(filtro.traducir(new PayloadTooLargeException())).toMatchObject({
      estado: 413,
      cuerpo: { codigo: 'demasiado_grande' },
    });
    expect(filtro.traducir(new HttpException('x', 404)).cuerpo.codigo).toBe(
      'no_encontrado',
    );
    expect(filtro.traducir(new Error('SELECT secreto FROM tabla'))).toEqual({
      estado: 500,
      cuerpo: { codigo: 'interno', mensaje: MENSAJES_ERROR_PAI.interno },
      reintentarEn: undefined,
    });
  });

  it('responde JSON con no-store, Retry-After y sin cabeceras de archivo', () => {
    const cabeceras = new Map<string, string>([
      ['Content-Disposition', 'attachment'],
    ]);
    const res = {
      headersSent: false,
      estado: 0,
      cuerpo: undefined as unknown,
      removeHeader: (nombre: string) => cabeceras.delete(nombre),
      setHeader: (nombre: string, valor: string) =>
        cabeceras.set(nombre, valor),
      status(estado: number) {
        this.estado = estado;
        return this;
      },
      json(cuerpo: unknown) {
        this.cuerpo = cuerpo;
        return this;
      },
    };
    const host = { switchToHttp: () => ({ getResponse: () => res }) };
    filtro.catch(noDisponibleRepositorio(30), host as never);
    expect(res.estado).toBe(503);
    expect(res.cuerpo).toEqual({
      codigo: 'no_disponible',
      mensaje: MENSAJES_ERROR_PAI.no_disponible,
    });
    expect(Object.fromEntries(cabeceras)).toEqual({
      'Cache-Control': 'no-store',
      'Retry-After': '30',
    });
  });
});

describe('configuración del PAI', () => {
  it('bucket privado de las evidencias: por defecto, válido y distinto del público', () => {
    expect(cargarConfiguracionPai({})).toEqual({
      bucketEvidencias: BUCKET_EVIDENCIAS_POR_DEFECTO,
      segundosUrlFirmada: 60,
    });
    expect(
      cargarConfiguracionPai({ PAI_SUPABASE_BUCKET: 'evidencias-pai' })
        .bucketEvidencias,
    ).toBe('evidencias-pai');
    expect(() =>
      cargarConfiguracionPai({ PAI_SUPABASE_BUCKET: 'Mayúsculas' }),
    ).toThrow(/PAI_SUPABASE_BUCKET/);
    expect(() =>
      cargarConfiguracionPai({ PAI_SUPABASE_BUCKET: 'repositorio' }),
    ).toThrow(/distinto/);
    expect(() =>
      cargarConfiguracionPai({
        PAI_SUPABASE_BUCKET: 'archivos',
        REPOSITORIO_SUPABASE_BUCKET: 'archivos',
      }),
    ).toThrow(/distinto/);
  });
});

describe('validación común', () => {
  it('ids y bimestres de la ruta: 404 si no son válidos', () => {
    expect(idDeRuta('15')).toBe(15);
    for (const malo of ['0', '-1', '1.5', 'abc', '01', '99999999999']) {
      expect(() => idDeRuta(malo, 'El indicador')).toThrow(
        'El indicador no existe.',
      );
    }
    expect(bimestreDeRuta('6')).toBe(6);
    for (const malo of ['0', '7', 'uno', '']) {
      expect(() => bimestreDeRuta(malo)).toThrow(/bimestre/);
    }
  });

  it('consulta: vigencia y enteros opcionales', () => {
    expect(vigenciaDeConsulta(undefined)).toBeNull();
    expect(vigenciaDeConsulta('2026')).toBe(2026);
    expect(() => vigenciaDeConsulta('26')).toThrow(/año/);
    expect(() => vigenciaDeConsulta(['2026', '2025'])).toThrow(/año/);
    expect(enteroDeConsulta('', 'pagina')).toBeNull();
    expect(enteroDeConsulta('3', 'pagina')).toBe(3);
    expect(() => enteroDeConsulta('0', 'pagina')).toThrow(/pagina/);
  });

  it('validarCuerpo: objeto JSON y errores por campo', () => {
    const esquema = z.object({
      avance: z
        .number({ error: 'El avance debe ser un número.' })
        .min(0, 'El avance no puede ser negativo.'),
    });
    expect(validarCuerpo(esquema, { avance: 3 })).toEqual({ avance: 3 });
    expect(() => validarCuerpo(esquema, [1])).toThrow(
      'Envíe los datos como un objeto JSON.',
    );
    expect(
      capturar(() =>
        validarCuerpo(esquema, { avance: -1 }, 'Revise el avance.'),
      ),
    ).toMatchObject({
      cuerpo: {
        codigo: 'solicitud_invalida',
        mensaje: 'Revise el avance.',
        campos: { avance: 'El avance no puede ser negativo.' },
      },
    });
    expect(largo('ñandú')).toBe(5);
  });
});

describe('módulo y migración 003', () => {
  it('PaiModule registra los 10 controladores y PermisosPai con su token', () => {
    const controladores = (
      Reflect.getMetadata('controllers', PaiModule) as { name: string }[]
    ).map((c) => c.name);
    expect(controladores.toSorted()).toEqual(
      [
        'PaiAutorizacionesAdminController',
        'PaiEvidenciasController',
        'PaiExportacionAdminController',
        'PaiIndicadoresController',
        'PaiRegistroAdminController',
        'PaiSesionController',
        'PaiTableroController',
        'PaiUsuariosAdminController',
        'PaiVigenciaAdminController',
        'PaiVigenciaController',
      ].toSorted(),
    );
    const proveedores = Reflect.getMetadata(
      'providers',
      PaiModule,
    ) as unknown[];
    expect(
      proveedores.some(
        (p) =>
          typeof p === 'object' &&
          p !== null &&
          (p as { provide?: unknown }).provide === PERMISOS_PAI,
      ),
    ).toBe(true);
  });

  it('las dos versiones de 003-pai.sql crean las mismas 18 tablas (con su almacén de archivos), todas las de id están en TABLAS_CON_ID y no tocan esquema_version', async () => {
    const carpeta = join(RAIZ_SERVIDOR, 'db', 'repositorio');
    const mysql = await readFile(
      join(carpeta, 'migraciones', '003-pai.sql'),
      'utf8',
    );
    const postgres = await readFile(
      join(carpeta, 'postgres', 'migraciones', '003-pai.sql'),
      'utf8',
    );
    expect(tablasDe(mysql)).toHaveLength(18);
    expect(tablasDe(postgres)).toEqual(tablasDe(mysql));
    const conId = [
      ...mysql.matchAll(
        /CREATE TABLE IF NOT EXISTS (\w+) \(\s*id\s+\w+ UNSIGNED NOT NULL AUTO_INCREMENT/g,
      ),
    ].map((m) => m[1]);
    expect(conId).toHaveLength(16);
    expect(conId.filter((tabla) => !TABLAS_CON_ID.has(tabla))).toEqual([]);
    const conIdentidad = [
      ...postgres.matchAll(
        /CREATE TABLE IF NOT EXISTS (\w+) \(\s*id\s+(?:integer|bigint) GENERATED BY DEFAULT AS IDENTITY/g,
      ),
    ].map((m) => m[1]);
    expect(conIdentidad).toEqual(conId);
    for (const sql of [mysql, postgres])
      expect(sql).not.toMatch(/INSERT\s+(IGNORE\s+)?INTO\s+(sistema_)?esquema_version/i);
    // El divisor de sentencias de MySQL trata # como comentario.
    expect(mysql).not.toContain('#');
  });
});

/** Los 7 campos de un reporte con textos del máximo (10 000 caracteres). */
function camposLargos(letra: string) {
  return {
    logros: letra.repeat(10_000),
    observaciones: `${letra}"`.repeat(5_000),
    riesgoMaterializado: 'SI',
    numeralRiesgo: letra.repeat(200),
    descripcionRiesgo: `${letra}\n`.repeat(5_000),
    fuentesVerificacion: `${letra}\\`.repeat(5_000),
    avance: 12.5,
  };
}

describe('detalleJson del registro (NEG-4 / BD-7)', () => {
  it('un guardar_reporte con los 7 campos de 10 000 caracteres antes y después se guarda entero', async () => {
    const { detalleJson } = await import('./registro-pai.js');
    const campos = camposLargos;
    const detalle = { antes: campos('a'), despues: campos('b'), motivo: 'abierto' };
    const texto = detalleJson(detalle) as string;
    expect(JSON.parse(texto)).toEqual(detalle);
  });

  it('si aun así no cabe, recorta cada texto y conserva la estructura', async () => {
    const { detalleJson, MAX_DETALLE_REGISTRO, MAX_TEXTO_DETALLE_RECORTADO } =
      await import('./registro-pai.js');
    const enorme = 'x'.repeat(MAX_DETALLE_REGISTRO);
    const guardado = JSON.parse(
      detalleJson({ antes: { logros: enorme }, despues: { logros: 'corto' }, motivo: 'abierto' }) as string,
    ) as Record<string, Record<string, string> | string | boolean>;
    expect(guardado.recortado).toBe(true);
    expect(guardado.motivo).toBe('abierto');
    expect(guardado.despues).toEqual({ logros: 'corto' });
    const antes = (guardado.antes as Record<string, string>).logros;
    expect(antes.startsWith('x'.repeat(MAX_TEXTO_DETALLE_RECORTADO))).toBe(true);
    expect(antes).toMatch(/\[recortado: 1000000 caracteres\]$/);
    expect(detalleJson(null)).toBeNull();
  });
});
