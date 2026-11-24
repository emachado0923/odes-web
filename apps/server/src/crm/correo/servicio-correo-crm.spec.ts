import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { EstadoCorreo } from '../api-crm.js';
import type { ServicioArchivosCrm } from '../archivos/servicio-archivos-crm.js';
import type { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type { Conexion } from '../../repositorio/bd/conexion.js';
import { ErrorRepositorioHttp } from '../../repositorio/errores-repositorio.js';
import { cargarConfiguracionCorreoCrm, type ConfiguracionCorreoCrm } from './configuracion-correo.js';
import { idsAdjuntos, type MensajeCrm, ServicioCorreoCrm } from './servicio-correo-crm.js';
import { conTiempoLimite, describirErrorCorreo, ErrorTiempoCorreo, nombreEml } from './transporte.js';

/**
 * nodemailer de verdad para los modos archivo y memoria (arman el MIME sin
 * red); en smtp, un transporte falso que anota las opciones y responde lo que
 * diga cada prueba. Nada sale a la red.
 */
const smtpFalso = vi.hoisted(() => ({
  opciones: [] as Array<Record<string, unknown>>,
  mensajes: [] as Array<Record<string, any>>,
  responder: (_mensaje: Record<string, any>): Promise<{ messageId: string }> =>
    Promise.resolve({ messageId: '<prueba@smtp.falso>' }),
}));

vi.mock('nodemailer', async (importOriginal) => {
  const real = await importOriginal<typeof import('nodemailer')>();
  const crear = real.createTransport as (...argumentos: unknown[]) => unknown;
  const createTransport = (opciones: unknown, ...resto: unknown[]) => {
    if (typeof opciones === 'object' && opciones !== null && 'host' in opciones) {
      smtpFalso.opciones.push(opciones as Record<string, unknown>);
      return {
        sendMail: (correo: Record<string, any>) => {
          smtpFalso.mensajes.push(correo);
          return smtpFalso.responder(correo);
        },
      };
    }
    return crear(opciones, ...resto);
  };
  return { ...real, createTransport, default: { ...real.default, createTransport } };
});

const CLAVE = 'abcdefghijklmnop';

interface FilaFalsa {
  id: number;
  tarea_id: number | null;
  tipo: string;
  para: string;
  responder_a: string | null;
  asunto: string;
  cuerpo_texto: string;
  cuerpo_html: string;
  adjuntos: string;
  estado: EstadoCorreo;
  intentos: number;
  ultimo_error: string | null;
  id_mensaje: string | null;
  creado_en: Date;
  enviado_en: Date | null;
  ultimo_intento_en: Date | null;
}

/** Resultado de una escritura, como el de mysql2. */
function escrito(affectedRows: number, insertId = 0): [unknown, null] {
  return [{ affectedRows, insertId }, null];
}

/** Base falsa: entiende solo las sentencias de ServicioCorreoCrm sobre crm_correos y crm_tarea_archivos. */
class BdFalsa {
  readonly correos = new Map<number, FilaFalsa>();
  readonly tareas = new Map<number, string>([[7, 'Informe de gestión']]);
  readonly archivos = new Map<number, { nombre: string; archivo_id: number; mime: string }>();
  private siguiente = 1;

  readonly conexion = {
    dialecto: 'mysql',
    query: (sql: string, valores: readonly unknown[] = []) => Promise.resolve(this.consultar(sql, valores)),
  } as unknown as Conexion;

  filas(sql: string, valores: readonly unknown[] = []): Promise<unknown[]> {
    return Promise.resolve(this.consultar(sql, valores)[0] as unknown[]);
  }

  ejecutar(sql: string, valores: readonly unknown[] = []): Promise<unknown> {
    return Promise.resolve(this.consultar(sql, valores)[0]);
  }

  private consultar(sqlOriginal: string, v: readonly unknown[]): [unknown, null] {
    const sql = sqlOriginal.replace(/\s+/g, ' ').trim();

    if (sql.startsWith('INSERT INTO crm_correos')) {
      const id = this.siguiente++;
      const [tarea_id, tipo, para, responder_a, asunto, cuerpo_texto, cuerpo_html, adjuntos, estado, creado_en] = v;
      this.correos.set(id, {
        id,
        tarea_id: tarea_id as number | null,
        tipo: tipo as string,
        para: para as string,
        responder_a: responder_a as string | null,
        asunto: asunto as string,
        cuerpo_texto: cuerpo_texto as string,
        cuerpo_html: cuerpo_html as string,
        adjuntos: adjuntos as string,
        estado: estado as EstadoCorreo,
        intentos: 0,
        ultimo_error: null,
        id_mensaje: null,
        creado_en: creado_en as Date,
        enviado_en: null,
        ultimo_intento_en: null,
      });
      return escrito(1, id);
    }
    if (sql.includes('FROM crm_tarea_archivos ta JOIN crm_almacen_archivos a')) {
      const ids = v[0] as number[];
      return [ids.flatMap((id) => (this.archivos.has(id) ? [{ id, ...this.archivos.get(id) }] : [])), null];
    }
    if (sql.startsWith('UPDATE crm_correos SET')) {
      const id = v.at(-1) as number;
      const fila = this.correos.get(sql.includes("SET estado = 'pendiente'") ? (v[1] as number) : id);
      if (sql.includes("SET estado = 'sin_configurar'")) {
        if (!fila || fila.estado === 'enviado') return escrito(0);
        fila.estado = 'sin_configurar';
        return escrito(1);
      }
      if (sql.includes("SET estado = 'pendiente'")) {
        const [ahora, , limite] = v as [Date, number, Date];
        const libre =
          fila &&
          fila.estado !== 'enviado' &&
          (fila.estado !== 'pendiente' || fila.ultimo_intento_en === null || fila.ultimo_intento_en < limite);
        if (!fila || !libre) return escrito(0);
        fila.estado = 'pendiente';
        fila.ultimo_intento_en = ahora;
        return escrito(1);
      }
      if (!fila) return escrito(0);
      fila.intentos += 1;
      if (sql.includes("SET estado = 'error'")) {
        fila.estado = 'error';
        fila.ultimo_error = v[0] as string;
      } else if (sql.includes("SET estado = 'enviado'")) {
        fila.estado = 'enviado';
        fila.enviado_en = v[0] as Date;
        fila.id_mensaje = v[1] as string | null;
        fila.ultimo_error = null;
      } else {
        throw new Error(`UPDATE inesperado: ${sql}`);
      }
      return escrito(1);
    }
    if (sql.includes('COUNT(CASE')) {
      const todas = [...this.correos.values()];
      return [
        [
          {
            pendientes: todas.filter((f) => f.estado === 'pendiente' || f.estado === 'sin_configurar').length,
            errores: todas.filter((f) => f.estado === 'error').length,
          },
        ],
        null,
      ];
    }
    if (sql.includes('FROM crm_correos c LEFT JOIN crm_tareas t ON t.id = c.tarea_id')) {
      let filas = [...this.correos.values()];
      let i = 0;
      for (const [, columna] of sql.matchAll(/c\.(id|estado|tarea_id) = \?/g)) {
        const valor = v[i++];
        filas = filas.filter((f) => f[columna as 'id' | 'estado' | 'tarea_id'] === valor);
      }
      const limite = Number(/LIMIT (\d+)/.exec(sql)?.[1] ?? 1000);
      return [
        filas
          .toSorted((a, b) => b.id - a.id)
          .slice(0, limite)
          .map((f) => ({ ...f, tarea_titulo: f.tarea_id === null ? null : (this.tareas.get(f.tarea_id) ?? null) })),
        null,
      ];
    }
    throw new Error(`Sentencia inesperada: ${sql}`);
  }
}

/** Archivos falsos: contenido por id del almacén; los que no están, fallan como el servicio real (404). */
function archivosFalsos(contenidos: Map<number, Buffer>): ServicioArchivosCrm {
  return {
    leerCompleto: (archivoId: number) => {
      const contenido = contenidos.get(archivoId);
      return contenido
        ? Promise.resolve(contenido)
        : Promise.reject(new ErrorRepositorioHttp(404, 'no_encontrado', 'El archivo no existe.'));
    },
  } as unknown as ServicioArchivosCrm;
}

function preparar(config: ConfiguracionCorreoCrm, contenidos = new Map<number, Buffer>()) {
  const bd = new BdFalsa();
  const correo = new ServicioCorreoCrm(bd as unknown as BaseDatosRepositorio, config, archivosFalsos(contenidos));
  return { bd, correo };
}

const MEMORIA = cargarConfiguracionCorreoCrm({ CRM_CORREO_MODO: 'memoria', CRM_CORREO_NOMBRE: 'Planeación Sapiencia' });
const SMTP = cargarConfiguracionCorreoCrm({ CRM_CORREO_USUARIO: 'planeacion@gmail.com', CRM_CORREO_CLAVE: 'abcd efgh ijkl mnop' });

function mensaje(cambios: Partial<MensajeCrm> = {}): MensajeCrm {
  return {
    tipo: 'tarea_terminada',
    tareaId: 7,
    para: 'lider@sapiencia.gov.co',
    responderA: 'jose@sapiencia.gov.co',
    asunto: 'Tarea terminada: Informe de gestión (José)',
    texto: 'Hola, Luciana:\n\nJosé terminó una tarea.',
    html: '<p>Hola, Luciana:</p>',
    adjuntos: [],
    ...cambios,
  };
}

const PDF = Buffer.from('%PDF-1.7\nentregable');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

beforeAll(() => Logger.overrideLogger(false));
afterAll(() => Logger.overrideLogger(['log', 'error', 'warn', 'debug', 'verbose']));
afterEach(() => {
  smtpFalso.opciones.length = 0;
  smtpFalso.mensajes.length = 0;
  smtpFalso.responder = () => Promise.resolve({ messageId: '<prueba@smtp.falso>' });
});

describe('encolar', () => {
  it('inserta pendiente, con los ids de los adjuntos en JSON (sin repetidos) y la fecha de creación', async () => {
    const { bd, correo } = preparar(MEMORIA);
    const id = await correo.encolar(bd.conexion, mensaje({ adjuntos: [3, 4, 3, -1], asunto: 'Asunto\r\ncon salto' }));
    expect(id).toBe(1);
    const fila = bd.correos.get(1);
    expect(fila).toMatchObject({
      tarea_id: 7,
      tipo: 'tarea_terminada',
      para: 'lider@sapiencia.gov.co',
      responder_a: 'jose@sapiencia.gov.co',
      asunto: 'Asunto con salto',
      adjuntos: '[3,4]',
      estado: 'pendiente',
      intentos: 0,
    });
    expect(fila?.creado_en).toBeInstanceOf(Date);
  });

  it('sin cuenta queda «sin configurar»', async () => {
    const { bd, correo } = preparar(cargarConfiguracionCorreoCrm({}));
    expect(correo.configurado).toBe(false);
    await correo.encolar(bd.conexion, mensaje({ responderA: null }));
    expect(bd.correos.get(1)).toMatchObject({ estado: 'sin_configurar', responder_a: null });
    expect(await correo.enviar(1)).toEqual({
      correoId: 1,
      estado: 'sin_configurar',
      mensaje: 'El correo quedó pendiente: el correo del CRM no está configurado.',
    });
    expect(bd.correos.get(1)?.intentos).toBe(0);
  });
});

describe('enviar (modo memoria)', () => {
  it('envía con los adjuntos en orden y marca la fila: enviado, enviado_en, id_mensaje, intentos', async () => {
    const { bd, correo } = preparar(MEMORIA, new Map([[50, PDF], [51, PNG]]));
    bd.archivos.set(3, { nombre: 'informe final.pdf', archivo_id: 50, mime: 'application/pdf' });
    bd.archivos.set(4, { nombre: 'foto.png', archivo_id: 51, mime: 'image/png' });
    await correo.encolar(bd.conexion, mensaje({ adjuntos: [4, 3, 99] }));

    expect(await correo.enviar(1)).toEqual({ correoId: 1, estado: 'enviado', mensaje: 'El correo se envió.' });
    const fila = bd.correos.get(1);
    expect(fila).toMatchObject({ estado: 'enviado', intentos: 1, ultimo_error: null });
    expect(fila?.enviado_en).toBeInstanceOf(Date);
    expect(fila?.id_mensaje).toMatch(/^<.+@.+>$/);
    expect(correo.enviadosEnMemoria()).toEqual([
      {
        correoId: 1,
        para: 'lider@sapiencia.gov.co',
        responderA: 'jose@sapiencia.gov.co',
        asunto: 'Tarea terminada: Informe de gestión (José)',
        texto: 'Hola, Luciana:\n\nJosé terminó una tarea.',
        html: '<p>Hola, Luciana:</p>',
        // El 99 ya no existe (lo quitaron después de encolar): se omite.
        adjuntos: [
          { nombre: 'foto.png', mime: 'image/png', bytes: PNG.length },
          { nombre: 'informe final.pdf', mime: 'application/pdf', bytes: PDF.length },
        ],
      },
    ]);

    // Ya enviado: no sale otra vez.
    expect(await correo.enviar(1)).toMatchObject({ estado: 'enviado' });
    expect(correo.enviadosEnMemoria()).toHaveLength(1);
    expect(bd.correos.get(1)?.intentos).toBe(1);
  });

  it('un correo que no existe: error, sin lanzar', async () => {
    const { correo } = preparar(MEMORIA);
    expect(await correo.enviar(404)).toEqual({ correoId: 404, estado: 'error', mensaje: 'El correo no existe.' });
  });

  it('si otro intento está en curso no lo reclama; pasado un minuto, sí', async () => {
    const { bd, correo } = preparar(MEMORIA);
    await correo.encolar(bd.conexion, mensaje());
    const fila = bd.correos.get(1);
    if (!fila) throw new Error('falta la fila');
    fila.ultimo_intento_en = new Date(Date.now() - 5_000);
    expect(await correo.enviar(1)).toMatchObject({ estado: 'pendiente', mensaje: expect.stringMatching(/otra solicitud/) });
    expect(correo.enviadosEnMemoria()).toHaveLength(0);
    fila.ultimo_intento_en = new Date(Date.now() - 61_000);
    expect(await correo.enviar(1)).toMatchObject({ estado: 'enviado' });
    expect(correo.enviadosEnMemoria()).toHaveLength(1);
  });

  it('dos envíos a la vez del mismo correo: sale una sola vez', async () => {
    const { bd, correo } = preparar(MEMORIA);
    await correo.encolar(bd.conexion, mensaje());
    const resultados = await Promise.all([correo.enviar(1), correo.enviar(1)]);
    // El segundo no reclama la fila: ve el envío en curso («pendiente») o ya terminado.
    expect(resultados[0].estado).toBe('enviado');
    expect(['pendiente', 'enviado']).toContain(resultados[1].estado);
    expect(correo.enviadosEnMemoria()).toHaveLength(1);
    expect(bd.correos.get(1)).toMatchObject({ estado: 'enviado', intentos: 1 });
  });

  it('un adjunto que no se puede leer: error con intentos y último error; al reintentar, sale', async () => {
    const contenidos = new Map<number, Buffer>();
    const { bd, correo } = preparar(MEMORIA, contenidos);
    bd.archivos.set(3, { nombre: 'informe.pdf', archivo_id: 50, mime: 'application/pdf' });
    await correo.encolar(bd.conexion, mensaje({ adjuntos: [3] }));

    expect(await correo.enviar(1)).toEqual({
      correoId: 1,
      estado: 'error',
      mensaje: 'El correo quedó pendiente: no se pudo leer un archivo adjunto.',
    });
    expect(bd.correos.get(1)).toMatchObject({
      estado: 'error',
      intentos: 1,
      ultimo_error: 'No se pudo leer un archivo adjunto (EADJUNTO).',
    });
    expect(correo.enviadosEnMemoria()).toHaveLength(0);

    contenidos.set(50, PDF);
    const reintento = await correo.reintentar(1);
    expect(reintento).toMatchObject({ id: 1, estado: 'enviado', intentos: 2, error: null, adjuntos: 1 });
    expect(correo.enviadosEnMemoria()).toHaveLength(1);
  });

  it('una dirección de destino con varias cuentas no sale', async () => {
    const { bd, correo } = preparar(MEMORIA);
    await correo.encolar(bd.conexion, mensaje({ para: 'lider@sapiencia.gov.co, otro@malo.test' }));
    expect(await correo.enviar(1)).toMatchObject({ estado: 'error' });
    expect(bd.correos.get(1)?.ultimo_error).toMatch(/destinatario no es válida/);
    expect(correo.enviadosEnMemoria()).toHaveLength(0);
  });
});

describe('enviar (modo smtp, nodemailer simulado)', () => {
  it('usa la cuenta, el servidor y los tiempos configurados', async () => {
    const { bd, correo } = preparar(SMTP, new Map([[50, PDF]]));
    bd.archivos.set(3, { nombre: 'informe.pdf', archivo_id: 50, mime: 'application/pdf' });
    await correo.encolar(bd.conexion, mensaje({ adjuntos: [3] }));
    expect(smtpFalso.opciones).toEqual([
      expect.objectContaining({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        requireTLS: false,
        auth: { user: 'planeacion@gmail.com', pass: CLAVE },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
        disableFileAccess: true,
        disableUrlAccess: true,
        maxRecipients: 1,
      }),
    ]);

    expect(await correo.enviar(1)).toMatchObject({ estado: 'enviado' });
    expect(bd.correos.get(1)).toMatchObject({ estado: 'enviado', id_mensaje: '<prueba@smtp.falso>', intentos: 1 });
    const [enviado] = smtpFalso.mensajes;
    expect(enviado).toMatchObject({
      from: { name: 'Planeación Sapiencia', address: 'planeacion@gmail.com' },
      to: 'lider@sapiencia.gov.co',
      replyTo: 'jose@sapiencia.gov.co',
      subject: 'Tarea terminada: Informe de gestión (José)',
      text: 'Hola, Luciana:\n\nJosé terminó una tarea.',
      html: '<p>Hola, Luciana:</p>',
      attachments: [{ filename: 'informe.pdf', content: PDF, contentType: 'application/pdf' }],
    });
  });

  it('STARTTLS obligatorio sin TLS desde el inicio', () => {
    preparar(
      cargarConfiguracionCorreoCrm({ CRM_CORREO_USUARIO: 'a@outlook.com', CRM_CORREO_CLAVE: 'x y z w' }),
    );
    expect(smtpFalso.opciones[0]).toMatchObject({ host: 'smtp.office365.com', port: 587, secure: false, requireTLS: true });
  });

  it('un fallo de autenticación queda como error, sin la clave en la fila ni en el aviso', async () => {
    const plain = Buffer.from(`\u0000planeacion@gmail.com\u0000${CLAVE}`).toString('base64');
    smtpFalso.responder = () =>
      Promise.reject(
        Object.assign(new Error(`Invalid login: 535 ${CLAVE}`), {
          code: 'EAUTH',
          responseCode: 535,
          command: `AUTH PLAIN ${plain}`,
          response: `535-5.7.8 Username and Password not accepted (${CLAVE} / ${plain})\r\n535 5.7.8 https://support.google.com/mail/?p=BadCredentials`,
        }),
      );
    const { bd, correo } = preparar(SMTP);
    await correo.encolar(bd.conexion, mensaje());
    const aviso = await correo.enviar(1);
    expect(aviso).toEqual({
      correoId: 1,
      estado: 'error',
      mensaje: 'El correo quedó pendiente: el servidor de correo rechazó el usuario o la contraseña de aplicación.',
    });
    const fila = bd.correos.get(1);
    expect(fila).toMatchObject({ estado: 'error', intentos: 1 });
    expect(fila?.ultimo_error).toMatch(/^El servidor de correo rechazó el usuario o la contraseña de aplicación \(EAUTH 535: 535-5\.7\.8/);
    expect(fila?.ultimo_error).not.toContain(CLAVE);
    expect(fila?.ultimo_error).not.toContain(plain);
    expect(fila?.ultimo_error).not.toMatch(/[\r\n]/);
    expect(JSON.stringify(aviso)).not.toContain(CLAVE);

    // Reintentar después también cuenta el intento.
    smtpFalso.responder = () => Promise.resolve({ messageId: '<ok@smtp.falso>' });
    expect(await correo.reintentar(1)).toMatchObject({ estado: 'enviado', intentos: 2, error: null });
  });

  it('el servidor que no responde corta a tiempo', async () => {
    await expect(conTiempoLimite(new Promise(() => undefined), 20)).rejects.toBeInstanceOf(ErrorTiempoCorreo);
    expect(describirErrorCorreo(new ErrorTiempoCorreo(25_000), SMTP.smtp)).toEqual({
      codigo: 'ETIEMPO',
      motivo: 'el servidor de correo no respondió a tiempo',
      detalle: 'El servidor de correo no respondió a tiempo (ETIEMPO).',
    });
    expect(await conTiempoLimite(Promise.resolve(3), 20)).toBe(3);
  });
});

describe('enviar (modo archivo)', () => {
  let carpeta: string;
  beforeAll(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'crm-correos-'));
  });
  afterAll(async () => {
    await rm(carpeta, { recursive: true, force: true });
  });

  it('escribe el .eml completo en la carpeta (y la crea)', async () => {
    const directorio = join(carpeta, 'eml');
    const config = cargarConfiguracionCorreoCrm({ CRM_CORREO_MODO: 'archivo', CRM_CORREO_DIRECTORIO: directorio });
    const { bd, correo } = preparar(config, new Map([[50, PDF]]));
    bd.archivos.set(3, { nombre: 'Informe – año.pdf', archivo_id: 50, mime: 'application/pdf' });
    await correo.encolar(bd.conexion, mensaje({ adjuntos: [3] }));
    expect(await correo.enviar(1)).toMatchObject({ estado: 'enviado' });

    const [nombre] = await readdir(directorio);
    expect(nombre).toMatch(/^\d{8}-\d{6}-1\.eml$/);
    const eml = await readFile(join(directorio, nombre), 'utf8');
    expect(eml).toContain('\r\n');
    expect(eml).toMatch(/^From: .*<crm@localhost>/m);
    expect(eml).toMatch(/^To: lider@sapiencia\.gov\.co/m);
    expect(eml).toMatch(/^Reply-To: jose@sapiencia\.gov\.co/m);
    expect(eml).toMatch(/^Subject: /m);
    expect(eml).toMatch(/^Auto-Submitted: auto-generated/m);
    expect(eml).toContain('multipart/mixed');
    expect(eml).toContain('application/pdf');
  });

  it('nombre del .eml: fecha y hora UTC y el id', () => {
    expect(nombreEml(42, new Date('2026-11-24T16:05:09.123Z'))).toBe('20261124-160509-42.eml');
  });
});

/** Tres correos: uno pendiente (tarea 7, dos adjuntos), uno sin configurar (sin tarea) y uno con error (tarea 7). */
async function conVarios() {
  const { bd, correo } = preparar(MEMORIA);
  await correo.encolar(bd.conexion, mensaje({ adjuntos: [1, 2] }));
  await correo.encolar(bd.conexion, mensaje({ tareaId: null, tipo: 'tarea_asignada' }));
  await correo.encolar(bd.conexion, mensaje({ tipo: 'tarea_devuelta' }));
  const tercero = bd.correos.get(3);
  if (tercero) {
    tercero.estado = 'error';
    tercero.intentos = 2;
    tercero.ultimo_error = 'Falló.';
  }
  const segundo = bd.correos.get(2);
  if (segundo) segundo.estado = 'sin_configurar';
  return { bd, correo };
}

describe('bandeja', () => {
  it('lista los más recientes primero, con el título de la tarea y la cantidad de adjuntos', async () => {
    const { bd, correo } = await conVarios();
    const lista = await correo.listar();
    expect(lista.map((c) => c.id)).toEqual([3, 2, 1]);
    expect(lista[2]).toEqual({
      id: 1,
      tareaId: 7,
      tareaTitulo: 'Informe de gestión',
      tipo: 'tarea_terminada',
      para: 'lider@sapiencia.gov.co',
      asunto: 'Tarea terminada: Informe de gestión (José)',
      estado: 'pendiente',
      intentos: 0,
      error: null,
      adjuntos: 2,
      creadoEn: bd.correos.get(1)?.creado_en.toISOString(),
      enviadoEn: null,
    });
    expect(lista[1]).toMatchObject({ tareaId: null, tareaTitulo: null, estado: 'sin_configurar' });
  });

  it('filtra por estado y por tarea, con límite', async () => {
    const { correo } = await conVarios();
    expect((await correo.listar({ estado: 'error' })).map((c) => c.id)).toEqual([3]);
    expect((await correo.listar({ tareaId: 7 })).map((c) => c.id)).toEqual([3, 1]);
    expect((await correo.listar({ estado: 'pendiente', tareaId: 7 })).map((c) => c.id)).toEqual([1]);
    expect((await correo.listar({ limite: 1 })).map((c) => c.id)).toEqual([3]);
  });

  it('cuenta pendientes (también los sin configurar) y errores', async () => {
    const { correo } = await conVarios();
    expect(await correo.contar()).toEqual({ pendientes: 2, errores: 1 });
  });

  it('reintentar: 404 si no existe y 409 si ya salió', async () => {
    const { bd, correo } = await conVarios();
    const noExiste = await correo.reintentar(99).catch((error: unknown) => error);
    expect(noExiste).toBeInstanceOf(ErrorRepositorioHttp);
    expect((noExiste as ErrorRepositorioHttp).getStatus()).toBe(404);
    expect((noExiste as ErrorRepositorioHttp).cuerpo.mensaje).toBe('El correo no existe.');

    const primero = bd.correos.get(1);
    if (primero) primero.estado = 'enviado';
    const enviado = await correo.reintentar(1).catch((error: unknown) => error);
    expect((enviado as ErrorRepositorioHttp).getStatus()).toBe(409);
    expect((enviado as ErrorRepositorioHttp).cuerpo.mensaje).toBe('Ese correo ya se envió.');

    // Uno con error (sin adjuntos): sale y devuelve la fila al día.
    expect(await correo.reintentar(3)).toMatchObject({ id: 3, estado: 'enviado', intentos: 3, error: null });
  });
});

describe('detalles', () => {
  it('al arrancar escribe la configuración en el log, sin la clave', () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    try {
      preparar(SMTP).correo.onModuleInit();
      expect(log).toHaveBeenCalledTimes(1);
      const [texto] = log.mock.calls[0] as [string];
      expect(texto).toMatch(/^correo del CRM: smtp smtp\.gmail\.com:465 como planeacion@gmail\.com/);
      expect(texto).not.toContain(CLAVE);
    } finally {
      log.mockRestore();
    }
  });

  it('los ids de adjuntos se leen del JSON, ignorando lo que no sirve', () => {
    expect(idsAdjuntos('[3, 4, "5", 3, 0, -2, 1.5, null]')).toEqual([3, 4, 5]);
    expect(idsAdjuntos('no es json')).toEqual([]);
    expect(idsAdjuntos('{"a": 1}')).toEqual([]);
    expect(idsAdjuntos([7])).toEqual([7]);
  });

  it('un error desconocido conserva su mensaje (recortado y sin la clave)', () => {
    const descrito = describirErrorCorreo(new Error(`algo raro con ${CLAVE}\nen dos líneas`), SMTP.smtp);
    expect(descrito.codigo).toBe('DESCONOCIDO');
    expect(descrito.motivo).toBe('no se pudo enviar el correo');
    expect(descrito.detalle).toBe('No se pudo enviar el correo (DESCONOCIDO: algo raro con [oculto] en dos líneas).');
    expect(describirErrorCorreo('texto', null).codigo).toBe('DESCONOCIDO');
    const largo = describirErrorCorreo({ code: 'EMESSAGE', response: `552 ${'x'.repeat(5000)}` }, null);
    expect(Array.from(largo.detalle).length).toBeLessThanOrEqual(1000);
  });
});
