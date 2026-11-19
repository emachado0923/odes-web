import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ErrorRepositorioHttp } from '../../repositorio/errores-repositorio.js';
import type {
  DocumentoLectura,
  ListadoLectura,
} from '../../repositorio/servicios/lectura-repositorio.js';
import { rutaCerrojo } from '../repositorio/indexacion/cerrojo.js';
import { escribirIndice } from '../repositorio/indexacion/escritor-indice.js';
import { huellaDocumentos } from '../repositorio/indexacion/fuente-mysql.js';
import type { RepositorioOdes } from '../repositorio/repositorio.tipos.js';
import {
  MOTIVO_SIN_REINDEXACION,
  type OpcionesReindexacion,
  opcionesReindexacionDesdeEntorno,
} from './configuracion-reindexacion.js';
import { ServicioIndiceOdes } from './servicio-indice.js';

/**
 * Estado del índice y reindexación con un indexador FALSO (un script de Node
 * que imita las salidas del real: líneas de progreso, --resultado y código
 * de salida). El indexador real se prueba en indexador.spec.ts y de punta a
 * punta con MySQL.
 */

beforeAll(() => Logger.overrideLogger(false));
afterAll(() => Logger.overrideLogger(['log', 'error', 'warn', 'debug', 'verbose']));

const directorios: string[] = [];
const servicios: ServicioIndiceOdes[] = [];
const procesos: ChildProcess[] = [];
afterEach(async () => {
  for (const servicio of servicios.splice(0)) await servicio.onModuleDestroy();
  for (const proceso of procesos.splice(0)) proceso.kill('SIGKILL');
  for (const directorio of directorios.splice(0)) rmSync(directorio, { recursive: true, force: true });
});

function carpeta(): string {
  const directorio = mkdtempSync(join(tmpdir(), 'odes-servicio-indice-'));
  directorios.push(directorio);
  return directorio;
}

/**
 * Indexador falso. Lee --resultado y escribe ahí `resultado` (si se da),
 * imprime `lineas`, espera `esperaMs` y sale con `codigo`.
 */
interface Guion {
  lineas?: string[];
  errores?: string[];
  esperaMs?: number;
  codigo?: number;
  resultado?: object | null;
}

function scriptFalso(
  directorio: string,
  { lineas = [], errores = [], esperaMs = 0, codigo = 0, resultado = { ok: true } }: Guion = {},
): string {
  const ruta = join(directorio, `indexador-falso-${Math.random().toString(36).slice(2)}.mjs`);
  writeFileSync(
    ruta,
    `import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const destino = args[args.indexOf('--resultado') + 1];
writeFileSync(${JSON.stringify(join(directorio, 'argumentos.json'))}, JSON.stringify(args));
for (const linea of ${JSON.stringify(lineas)}) console.log(linea);
for (const linea of ${JSON.stringify(errores)}) console.error(linea);
setTimeout(() => {
  const resultado = ${JSON.stringify(resultado)};
  if (resultado) writeFileSync(destino, JSON.stringify(resultado));
  process.exit(${codigo});
}, ${esperaMs});
`,
  );
  return ruta;
}

function documento(id: string): DocumentoLectura {
  return {
    id,
    orden: 1,
    titulo: `Título ${id}`,
    subtitulo: null,
    categoria: 'Boletín',
    numero: null,
    anio: 2024,
    mes: null,
    idioma: 'es',
    tipo: 'documento',
    claves: [],
    urlVer: `/api/repositorio/documentos/${id}/ver`,
    urlDescarga: null,
    urlVerExterna: null,
    urlOriginal: null,
    urlEntradaBlog: null,
    nota: null,
    equivalenteEnEspanol: null,
    archivo: null,
    portada: null,
    miniatura: null,
    actualizadoEn: '2026-10-08T00:00:00.000Z',
  };
}

interface Entorno {
  servicio: ServicioIndiceOdes;
  opciones: OpcionesReindexacion;
  directorio: string;
  repositorio: { comprobarAhora: ReturnType<typeof vi.fn<() => void>> };
  lectura: { listado: ListadoLectura; falla: boolean; listarPublicados(): Promise<ListadoLectura> };
}

function entorno(script: string | null, extra: Partial<OpcionesReindexacion> = {}): Entorno {
  const directorio = carpeta();
  const opciones: OpcionesReindexacion = {
    rutaIndice: join(directorio, 'indice.sqlite'),
    comando: { ejecutable: process.execPath, argumentos: script ? [script] : [], requiere: script },
    concurrencia: 2,
    timeoutMs: 30_000,
    directorioTemporal: directorio,
    ...extra,
  };
  const repositorio = { comprobarAhora: vi.fn<() => void>() };
  const lectura = {
    listado: { version: 3, actualizado: '2026-10-08T10:00:00.000Z', documentos: [documento('uno'), documento('dos')] },
    falla: false,
    async listarPublicados(): Promise<ListadoLectura> {
      if (this.falla) throw new Error('base caída');
      return this.listado;
    },
  };
  const servicio = new ServicioIndiceOdes(opciones, repositorio as unknown as RepositorioOdes, lectura);
  servicios.push(servicio);
  return { servicio, opciones, directorio, repositorio, lectura };
}

function indiceDePrueba(ruta: string, extra: { origen: string; huella: string | null }): void {
  escribirIndice(ruta, {
    generado: '2026-10-08T09:00:00.000Z',
    fuente: 'prueba',
    versionFuente: '3',
    origenFuente: extra.origen,
    huellaFuente: extra.huella,
    categorias: ['Boletín'],
    documentos: [],
  });
}

async function conflicto(promesa: Promise<unknown>): Promise<ErrorRepositorioHttp> {
  const error = await promesa.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ErrorRepositorioHttp);
  expect((error as ErrorRepositorioHttp).getStatus()).toBe(409);
  return error as ErrorRepositorioHttp;
}

describe('ServicioIndiceOdes: estado', () => {
  it('sin índice: lo dice y pide reindexar', async () => {
    const { servicio } = entorno(null);
    const estado = await servicio.estado();
    expect(estado.indice).toMatchObject({ disponible: false, generado: null, origen: null, error: expect.stringMatching(/todavía no se ha generado/) });
    expect(estado.repositorio).toEqual({
      publicados: 2,
      actualizado: '2026-10-08T10:00:00.000Z',
      cambiado: true,
      motivo: expect.stringMatching(/No hay un índice/),
    });
    expect(estado.reindexacion).toEqual({ estado: 'inactiva', inicio: null, fin: null, usuario: null, error: null, registro: [] });
  });

  it('índice desde la base: compara su huella con lo publicado hoy', async () => {
    const { servicio, opciones, lectura } = entorno(null);
    indiceDePrueba(opciones.rutaIndice, { origen: 'mysql', huella: huellaDocumentos(lectura.listado.documentos) });
    let estado = await servicio.estado();
    expect(estado.indice).toMatchObject({ disponible: true, generado: '2026-10-08T09:00:00.000Z', origen: 'mysql', error: null });
    expect(estado.repositorio).toMatchObject({ cambiado: false, motivo: null });

    lectura.listado = { ...lectura.listado, version: 4, documentos: [documento('uno')] };
    estado = await servicio.estado();
    expect(estado.repositorio).toMatchObject({ publicados: 1, cambiado: true, motivo: expect.stringMatching(/después de generar el índice/) });

    lectura.falla = true;
    estado = await servicio.estado();
    expect(estado.repositorio).toMatchObject({ publicados: null, cambiado: null, motivo: expect.stringMatching(/No se pudo consultar/) });
  });

  it('índice desde el paquete: siempre conviene reindexar', async () => {
    const { servicio, opciones } = entorno(null);
    indiceDePrueba(opciones.rutaIndice, { origen: 'paquete', huella: null });
    const estado = await servicio.estado();
    expect(estado.indice.origen).toBe('paquete');
    expect(estado.repositorio).toMatchObject({ cambiado: true, motivo: expect.stringMatching(/desde el paquete de datos/) });
  });
});

describe('ServicioIndiceOdes: reindexar', () => {
  it('corre el indexador con la base como fuente, una sola vez a la vez, y al terminar recarga el índice', async () => {
    const directorio = carpeta();
    const script = scriptFalso(directorio, {
      lineas: ['Fuente:  base de datos', '  50/372 documentos procesados', '\u001b[32mÍndice escrito.\u001b[0m'],
      esperaMs: 400,
    });
    const { servicio, opciones, repositorio } = entorno(script);

    const inicial = await servicio.reindexar('admin');
    expect(inicial.reindexacion).toMatchObject({ estado: 'en_curso', usuario: 'admin', fin: null, error: null });
    const error = await conflicto(servicio.reindexar('otra'));
    expect(error.cuerpo.mensaje).toMatch(/Ya hay una reindexación en curso \(la inició admin/);

    await servicio.esperar();
    const final = await servicio.estado();
    expect(final.reindexacion).toMatchObject({ estado: 'completada', usuario: 'admin', error: null });
    expect(final.reindexacion.fin).not.toBeNull();
    expect(final.reindexacion.registro).toEqual(['Fuente:  base de datos', '  50/372 documentos procesados', 'Índice escrito.']);
    expect(repositorio.comprobarAhora).toHaveBeenCalledOnce();

    const argumentos = JSON.parse(
      (await import('node:fs')).readFileSync(join(directorio, 'argumentos.json'), 'utf8'),
    ) as string[];
    expect(argumentos.slice(0, 6)).toEqual(['--fuente', 'mysql', '--indice', opciones.rutaIndice, '--concurrencia', '2']);
    expect(argumentos[6]).toBe('--resultado');
    // El JSON de resultado se borra al terminar.
    expect(existsSync(argumentos[7]!)).toBe(false);
    expect(readdirSync(opciones.directorioTemporal).filter((n) => n.startsWith('odes-reindexar-'))).toEqual([]);

    // Terminada, se puede volver a pedir.
    await servicio.reindexar('admin');
    await servicio.esperar();
  });

  it('si falla, el motivo del --resultado queda en el estado (p. ej. faltan herramientas)', async () => {
    const mensaje = 'Faltan herramientas de indexación en esta máquina: tesseract. Instálelas…';
    const script = scriptFalso(carpeta(), {
      errores: [`Error: ${mensaje}`],
      codigo: 3,
      resultado: { ok: false, codigo: 'herramientas', error: mensaje },
    });
    const { servicio, repositorio } = entorno(script);
    await servicio.reindexar('admin');
    await servicio.esperar();
    const { reindexacion } = await servicio.estado();
    expect(reindexacion).toMatchObject({ estado: 'fallida', error: mensaje });
    expect(repositorio.comprobarAhora).not.toHaveBeenCalled();
  });

  it('sin --resultado usa la última línea "Error:" o el código de salida', async () => {
    const conLinea = entorno(scriptFalso(carpeta(), { errores: ['Aviso: algo', 'Error: se cayó todo'], codigo: 1, resultado: null }));
    await conLinea.servicio.reindexar('admin');
    await conLinea.servicio.esperar();
    expect((await conLinea.servicio.estado()).reindexacion.error).toBe('se cayó todo');

    const sinNada = entorno(scriptFalso(carpeta(), { codigo: 9, resultado: null }));
    await sinNada.servicio.reindexar('admin');
    await sinNada.servicio.esperar();
    expect((await sinNada.servicio.estado()).reindexacion.error).toMatch(/terminó con el código 9; el índice anterior no se modificó/);
  });

  it('se detiene al agotarse el tiempo máximo', async () => {
    const { servicio } = entorno(scriptFalso(carpeta(), { esperaMs: 20_000 }), { timeoutMs: 300 });
    await servicio.reindexar('admin');
    await servicio.esperar();
    expect((await servicio.estado()).reindexacion).toMatchObject({
      estado: 'fallida',
      error: expect.stringMatching(/Se agotó el tiempo máximo de la reindexación/),
    });
  });

  it('respeta el cerrojo de otro proceso vivo (p. ej. npm run odes:indexar) y lo muestra en el estado', async () => {
    const { servicio, opciones } = entorno(scriptFalso(carpeta()));
    const otro = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)']);
    procesos.push(otro);
    const inicio = new Date(Date.now() - 60_000).toISOString();
    writeFileSync(
      rutaCerrojo(opciones.rutaIndice),
      JSON.stringify({ pid: otro.pid, host: hostname(), inicio, descripcion: 'odes:indexar --fuente paquete' }),
    );
    const error = await conflicto(servicio.reindexar('admin'));
    expect(error.cuerpo.mensaje).toContain(`otro proceso (desde ${inicio})`);
    expect((await servicio.estado()).reindexacion).toMatchObject({
      estado: 'en_curso',
      inicio,
      usuario: null,
      registro: [expect.stringMatching(/odes:indexar --fuente paquete/)],
    });
  });

  it('un cerrojo abandonado no impide reindexar', async () => {
    const { servicio, opciones } = entorno(scriptFalso(carpeta()));
    const terminado = spawn(process.execPath, ['-e', '0']);
    await new Promise((resolver) => terminado.on('close', resolver));
    writeFileSync(
      rutaCerrojo(opciones.rutaIndice),
      JSON.stringify({ pid: terminado.pid, host: hostname(), inicio: new Date().toISOString(), descripcion: 'x' }),
    );
    await servicio.reindexar('admin');
    await servicio.esperar();
    expect((await servicio.estado()).reindexacion.estado).toBe('completada');
  });

  it('sin el indexador compilado responde 409 con instrucciones', async () => {
    const { servicio } = entorno(join(carpeta(), 'no-existe.js'));
    const error = await conflicto(servicio.reindexar('admin'));
    expect(error.cuerpo.mensaje).toMatch(/no está compilado.*npm run build/);
    expect((await servicio.estado()).reindexacion.estado).toBe('inactiva');
  });

  it('en Vercel (o con ODES_REINDEXAR=desactivado) responde 409 con instrucciones', async () => {
    expect(opcionesReindexacionDesdeEntorno({ VERCEL: '1' }).desactivada).toBe(MOTIVO_SIN_REINDEXACION);
    expect(opcionesReindexacionDesdeEntorno({ ODES_REINDEXAR: 'desactivado' }).desactivada).toBe(MOTIVO_SIN_REINDEXACION);
    expect(opcionesReindexacionDesdeEntorno({}).desactivada).toBeNull();
    const { servicio } = entorno(null, { desactivada: MOTIVO_SIN_REINDEXACION });
    const error = await conflicto(servicio.reindexar('editora'));
    expect(error.cuerpo.mensaje).toMatch(/solo lectura.*npm run odes:indexar/);
  });

  it('al apagar el servidor detiene el indexador', async () => {
    const { servicio } = entorno(scriptFalso(carpeta(), { esperaMs: 20_000 }));
    await servicio.reindexar('admin');
    await servicio.onModuleDestroy();
    expect((await servicio.estado()).reindexacion).toMatchObject({ estado: 'fallida', error: expect.stringMatching(/SIGTERM/) });
  });
});
