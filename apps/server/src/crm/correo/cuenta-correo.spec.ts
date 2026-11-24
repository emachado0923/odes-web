import { Logger } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type { Conexion } from '../../repositorio/bd/conexion.js';
import { ErrorRepositorioHttp } from '../../repositorio/errores-repositorio.js';
import type { ServicioArchivosCrm } from '../archivos/servicio-archivos-crm.js';
import { cifrarClave, derivarLlave, type LlaveCuentaCorreoCrm } from './cifrado-cuenta.js';
import { cargarConfiguracionCorreoCrm, type ConfiguracionCorreoCrm } from './configuracion-correo.js';
import {
  CORREO_PRUEBA,
  MENSAJE_AUTH_GMAIL,
  MENSAJE_CLAVE_FALTA,
  MENSAJE_CLAVE_OTRA_CUENTA,
  MENSAJE_HOST_FALTA,
  MENSAJE_MANDAN_VARIABLES,
  MENSAJE_PRUEBA_SIN_CUENTA,
  MENSAJE_SIN_LLAVE,
  mensajeErrorPrueba,
  resultadoPrueba,
  ServicioCuentaCorreoCrm,
  TopeEnMemoria,
  validarCuentaCorreo,
  validarPruebaCorreo,
} from './cuenta-correo.js';
import { type FabricaTransporteCrm, ServicioCorreoCrm } from './servicio-correo-crm.js';
import type { CorreoSalienteCrm } from './transporte.js';

const CLAVE = 'abcdefghijklmnop';
const LLAVE: LlaveCuentaCorreoCrm = { llave: derivarLlave('secreto-de-prueba'), origen: 'contraseña de la base' };
const SIN_LLAVE: LlaveCuentaCorreoCrm = { llave: null, origen: null };
const DESACTIVADO = cargarConfiguracionCorreoCrm({ CRM_URL_SITIO: 'https://crm.sapiencia.test' });
const MEMORIA = cargarConfiguracionCorreoCrm({ CRM_CORREO_MODO: 'memoria' });
const SMTP_VARIABLES = cargarConfiguracionCorreoCrm({
  CRM_CORREO_USUARIO: 'variables@gmail.com',
  CRM_CORREO_CLAVE: 'zzzz yyyy xxxx wwww',
});

/** El error HTTP que lanza `accion`. */
function errorDe(accion: () => unknown): ErrorRepositorioHttp {
  try {
    accion();
  } catch (error) {
    if (error instanceof ErrorRepositorioHttp) return error;
    throw error;
  }
  throw new Error('No lanzó.');
}

async function errorAsincrono(promesa: Promise<unknown>): Promise<ErrorRepositorioHttp> {
  try {
    await promesa;
  } catch (error) {
    if (error instanceof ErrorRepositorioHttp) return error;
    throw error;
  }
  throw new Error('No lanzó.');
}

/** Base falsa: solo las sentencias de ServicioCuentaCorreoCrm sobre crm_correo_cuenta. */
class BdCuentaFalsa {
  fila: Record<string, unknown> | null = null;
  readonly sentencias: string[] = [];

  readonly conexion = {
    dialecto: 'mysql',
    query: (sql: string, valores: readonly unknown[] = []) => Promise.resolve(this.consultar(sql, valores)),
  } as unknown as Conexion;

  filas(sql: string, valores: readonly unknown[] = []): Promise<unknown> {
    return Promise.resolve(this.consultar(sql, valores)[0]);
  }

  ejecutar(sql: string, valores: readonly unknown[] = []): Promise<unknown> {
    return Promise.resolve(this.consultar(sql, valores)[0]);
  }

  transaccion<T>(accion: (conexion: Conexion) => Promise<T>): Promise<T> {
    return accion(this.conexion);
  }

  /** Guarda una fila como la dejaría el servicio, cifrada con `llave`. */
  sembrar(cambios: Record<string, unknown> = {}, llave: Buffer = LLAVE.llave as Buffer): void {
    this.fila = {
      usuario: 'planeacion.crm@gmail.com',
      clave_cifrada: cifrarClave(CLAVE, llave),
      host: 'smtp.gmail.com',
      puerto: 465,
      seguro: 1,
      nombre: 'Planeación Sapiencia',
      actualizado_en: new Date('2026-11-24T15:00:00.000Z'),
      actualizado_por: 'Luciana',
      ...cambios,
    };
  }

  private consultar(sqlOriginal: string, v: readonly unknown[]): [unknown, null] {
    const sql = sqlOriginal.replace(/\s+/g, ' ').trim();
    this.sentencias.push(sql);
    if (sql.startsWith('SELECT usuario, clave_cifrada')) return [this.fila ? [{ ...this.fila }] : [], null];
    if (sql.startsWith('SELECT clave_cifrada') && sql.endsWith('FROM crm_correo_cuenta WHERE id = 1 FOR UPDATE')) {
      const { clave_cifrada, usuario, host } = this.fila ?? {};
      return [this.fila ? [{ clave_cifrada, usuario, host }] : [], null];
    }
    if (sql.startsWith('INSERT INTO crm_correo_cuenta') || sql.startsWith('UPDATE crm_correo_cuenta')) {
      const [usuario, clave_cifrada, host, puerto, seguro, nombre, actualizado_en, actualizado_por] = v;
      this.fila = { usuario, clave_cifrada, host, puerto, seguro, nombre, actualizado_en, actualizado_por };
      return [{ affectedRows: 1, insertId: 0 }, null];
    }
    if (sql.startsWith('DELETE FROM crm_correo_cuenta')) {
      const borradas = this.fila ? 1 : 0;
      this.fila = null;
      return [{ affectedRows: borradas, insertId: 0 }, null];
    }
    throw new Error(`Sentencia no esperada: ${sql}`);
  }
}

function servicio(config: ConfiguracionCorreoCrm, llave: LlaveCuentaCorreoCrm = LLAVE) {
  const bd = new BdCuentaFalsa();
  const cuentas = new ServicioCuentaCorreoCrm(bd as unknown as BaseDatosRepositorio, config, llave);
  return { bd, cuentas };
}

beforeAll(() => Logger.overrideLogger(false));
afterAll(() => Logger.overrideLogger(['log', 'error', 'warn', 'debug', 'verbose']));
afterEach(() => vi.restoreAllMocks());

describe('validarCuentaCorreo', () => {
  it('Gmail: quita los espacios de la clave y deduce servidor, puerto 465, TLS y el nombre por defecto', () => {
    expect(validarCuentaCorreo({ usuario: ' planeacion.crm@gmail.com ', clave: 'abcd efgh\tijkl mnop' })).toEqual({
      usuario: 'planeacion.crm@gmail.com',
      clave: CLAVE,
      host: 'smtp.gmail.com',
      puerto: 465,
      seguro: true,
      nombre: 'Planeación Sapiencia',
    });
    expect(validarCuentaCorreo({ usuario: 'planeacion@outlook.com', clave: 'x' })).toMatchObject({
      host: 'smtp.office365.com',
      puerto: 587,
      seguro: false,
    });
  });

  it('Google Workspace (@sapiencia.gov.co): sin servidor es 400 en campos.host; con él, puerto y TLS por defecto', () => {
    const error = errorDe(() => validarCuentaCorreo({ usuario: 'planeacion@sapiencia.gov.co', clave: CLAVE }));
    expect(error.getStatus()).toBe(400);
    expect(error.campos).toEqual({ host: MENSAJE_HOST_FALTA });
    expect(MENSAJE_HOST_FALTA).toContain('smtp.gmail.com');
    expect(validarCuentaCorreo({ usuario: 'planeacion@sapiencia.gov.co', host: ' SMTP.Gmail.com ' })).toMatchObject({
      host: 'smtp.gmail.com',
      puerto: 465,
      seguro: true,
      clave: null,
    });
    expect(
      validarCuentaCorreo({ usuario: 'planeacion@sapiencia.gov.co', host: 'smtp.gmail.com', puerto: 587 }),
    ).toMatchObject({ puerto: 587, seguro: false });
    expect(
      validarCuentaCorreo({ usuario: 'a@sapiencia.gov.co', host: 'correo.sapiencia.gov.co', puerto: 2525, seguro: true }),
    ).toMatchObject({ puerto: 2525, seguro: true });
  });

  it('clave vacía, en null u omitida = conservar la guardada; nombre en una línea', () => {
    for (const clave of [undefined, null, '', '   ']) {
      expect(validarCuentaCorreo({ usuario: 'x@gmail.com', clave }).clave).toBeNull();
    }
    expect(validarCuentaCorreo({ usuario: 'x@gmail.com', nombre: '  Oficina\tde \n Planeación ' }).nombre).toBe(
      'Oficina de Planeación',
    );
  });

  it('400 con el campo de cada error', () => {
    const casos: [Record<string, unknown>, string][] = [
      [{ usuario: 'planeacion' }, 'usuario'],
      [{ usuario: 'a@b.co, c@d.co' }, 'usuario'],
      [{}, 'usuario'],
      [{ usuario: 'x@gmail.com', host: 'https://smtp.gmail.com' }, 'host'],
      [{ usuario: 'x@gmail.com', host: 'smtp.gmail.com:465' }, 'host'],
      [{ usuario: 'x@gmail.com', puerto: 0 }, 'puerto'],
      [{ usuario: 'x@gmail.com', puerto: 70_000 }, 'puerto'],
      [{ usuario: 'x@gmail.com', puerto: '465' }, 'puerto'],
      [{ usuario: 'x@gmail.com', puerto: 465.5 }, 'puerto'],
      [{ usuario: 'x@gmail.com', seguro: 'si' }, 'seguro'],
      [{ usuario: 'x@gmail.com', clave: 'a'.repeat(201) }, 'clave'],
      [{ usuario: 'x@gmail.com', clave: 'ñ'.repeat(180) }, 'clave'],
      [{ usuario: 'x@gmail.com', clave: 12345 }, 'clave'],
      [{ usuario: 'x@gmail.com', nombre: 'n'.repeat(101) }, 'nombre'],
    ];
    for (const [cuerpo, campo] of casos) {
      const error = errorDe(() => validarCuentaCorreo(cuerpo));
      // El cuerpo va en lo comparado para que un fallo diga qué caso fue.
      expect({ cuerpo, estado: error.getStatus(), campos: Object.keys(error.campos ?? {}) }).toEqual({
        cuerpo,
        estado: 400,
        campos: [campo],
      });
    }
    for (const cuerpo of [null, [], 'texto']) expect(errorDe(() => validarCuentaCorreo(cuerpo)).getStatus()).toBe(400);
  });
});

describe('validarPruebaCorreo', () => {
  it('sin para (o vacío) va al líder; con para, un correo válido', () => {
    expect(validarPruebaCorreo(undefined)).toEqual({ para: null });
    expect(validarPruebaCorreo({})).toEqual({ para: null });
    expect(validarPruebaCorreo({ para: '  ' })).toEqual({ para: null });
    expect(validarPruebaCorreo({ para: ' jose@sapiencia.gov.co ' })).toEqual({ para: 'jose@sapiencia.gov.co' });
    for (const cuerpo of [{ para: 'jose' }, { para: 5 }, { para: 'a@b.co, c@d.co' }, []]) {
      expect(errorDe(() => validarPruebaCorreo(cuerpo)).getStatus()).toBe(400);
    }
    expect(errorDe(() => validarPruebaCorreo({ para: 'jose' })).campos).toEqual({ para: expect.any(String) });
  });
});

describe('errores de la prueba en palabras claras', () => {
  const GMAIL = { host: 'smtp.gmail.com', puerto: 465, seguro: true, usuario: 'planeacion.crm@gmail.com', clave: CLAVE };
  const OFFICE = { ...GMAIL, host: 'smtp.office365.com', puerto: 587, seguro: false };

  it('usuario o contraseña rechazados (EAUTH, 534, 535)', () => {
    expect(mensajeErrorPrueba(Object.assign(new Error('Invalid login'), { code: 'EAUTH' }), GMAIL)).toBe(MENSAJE_AUTH_GMAIL);
    expect(mensajeErrorPrueba({ responseCode: 535 }, GMAIL)).toBe(MENSAJE_AUTH_GMAIL);
    expect(mensajeErrorPrueba({ responseCode: 534 }, null)).toBe(MENSAJE_AUTH_GMAIL);
    expect(mensajeErrorPrueba({ code: 'EAUTH' }, OFFICE)).toMatch(/^El servidor de correo \(smtp\.office365\.com\) rechazó/);
  });

  it('sin conexión: «No se pudo conectar con <host>:<puerto>.»', () => {
    for (const code of ['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'ETIEMPO', 'ECONNREFUSED']) {
      expect(mensajeErrorPrueba({ code }, GMAIL)).toBe('No se pudo conectar con smtp.gmail.com:465.');
    }
  });

  it('otro error: el código, sin la clave ni la respuesta del servidor', () => {
    const error = Object.assign(new Error(`rechazado ${CLAVE}`), { code: 'EENVELOPE', response: `550 ${CLAVE}` });
    const mensaje = mensajeErrorPrueba(error, GMAIL);
    expect(mensaje).toContain('(código EENVELOPE)');
    expect(mensaje).not.toContain(CLAVE);
    expect(mensajeErrorPrueba(new Error('raro'), GMAIL)).toBe('No se pudo enviar el correo de prueba (código DESCONOCIDO).');
  });

  it('resultado de la prueba', () => {
    expect(resultadoPrueba({ estado: 'enviado', smtp: GMAIL }, 'a@b.co')).toEqual({
      enviado: true,
      para: 'a@b.co',
      mensaje: 'Se envió un correo de prueba a a@b.co.',
    });
    expect(resultadoPrueba({ estado: 'sin_configurar' }, 'a@b.co')).toEqual({
      enviado: false,
      para: 'a@b.co',
      mensaje: MENSAJE_PRUEBA_SIN_CUENTA,
    });
    expect(resultadoPrueba({ estado: 'error', error: { code: 'EAUTH' }, smtp: GMAIL }, 'a@b.co').mensaje).toBe(
      MENSAJE_AUTH_GMAIL,
    );
  });
});

describe('TopeEnMemoria', () => {
  it('10 por hora: el 11.º espera hasta que se libere el primero; devolver libera el último', () => {
    const tope = new TopeEnMemoria(10, 3_600_000);
    const inicio = 1_000_000;
    for (let i = 0; i < 10; i++) expect(tope.tomar(inicio + i * 1000)).toBe(0);
    expect(tope.tomar(inicio + 10_000)).toBe(3590);
    tope.devolver();
    expect(tope.tomar(inicio + 11_000)).toBe(0);
    expect(tope.tomar(inicio + 3_600_000)).toBe(0);
  });
});

describe('ServicioCuentaCorreoCrm: variables o base', () => {
  it('con las variables (aunque sean de memoria) mandan ellas: GET las muestra sin editar y PUT/DELETE son 409', async () => {
    const { bd, cuentas } = servicio(MEMORIA);
    expect(await cuentas.obtener()).toEqual({
      origen: 'variables',
      modo: 'memoria',
      usuario: null,
      host: null,
      puerto: null,
      seguro: null,
      nombre: 'Planeación Sapiencia',
      tieneClave: false,
      editable: false,
      actualizadoEn: null,
    });
    const guardar = await errorAsincrono(cuentas.guardar({ usuario: 'x@gmail.com', clave: CLAVE }, 'Luciana'));
    expect(guardar.getStatus()).toBe(409);
    expect(guardar.cuerpo.mensaje).toBe(MENSAJE_MANDAN_VARIABLES);
    expect((await errorAsincrono(cuentas.borrar('Luciana'))).getStatus()).toBe(409);
    expect(bd.sentencias).toEqual([]);

    const smtp = servicio(SMTP_VARIABLES).cuentas;
    const cuenta = await smtp.obtener();
    expect(cuenta).toMatchObject({
      origen: 'variables',
      modo: 'smtp',
      usuario: 'variables@gmail.com',
      host: 'smtp.gmail.com',
      puerto: 465,
      seguro: true,
      tieneClave: true,
      editable: false,
    });
    expect(JSON.stringify(cuenta)).not.toContain('zzzzyyyy');
  });

  it('sin variables: la cuenta de la base (sin la clave), o ninguna', async () => {
    const { bd, cuentas } = servicio(DESACTIVADO);
    expect(await cuentas.obtener()).toMatchObject({ origen: 'ninguna', modo: 'desactivado', editable: true, tieneClave: false });
    bd.sembrar();
    const cuenta = await cuentas.obtener();
    expect(cuenta).toEqual({
      origen: 'base',
      modo: 'smtp',
      usuario: 'planeacion.crm@gmail.com',
      host: 'smtp.gmail.com',
      puerto: 465,
      seguro: true,
      nombre: 'Planeación Sapiencia',
      tieneClave: true,
      editable: true,
      actualizadoEn: '2026-11-24T15:00:00.000Z',
    });
    expect(JSON.stringify(cuenta)).not.toContain(CLAVE);
    expect((await cuentas.guardada())?.clave).toBe(CLAVE);
  });

  it('una clave cifrada con otro secreto queda como sin clave, con un solo aviso en el log (sin datos)', async () => {
    const aviso = vi.spyOn(Logger.prototype, 'warn');
    const { bd, cuentas } = servicio(DESACTIVADO);
    bd.sembrar({}, derivarLlave('el-secreto-de-antes'));
    expect(await cuentas.obtener()).toMatchObject({ origen: 'base', modo: 'desactivado', tieneClave: false });
    expect(await cuentas.guardada()).toMatchObject({ clave: null });
    expect(aviso).toHaveBeenCalledTimes(1);
    expect(String(aviso.mock.calls[0]?.[0])).not.toContain('planeacion.crm');
  });

  it('guardar cifra la clave (la fila no la tiene en claro), la conserva si no viene y borrar la quita', async () => {
    const registro = vi.spyOn(Logger.prototype, 'log');
    const { bd, cuentas } = servicio(DESACTIVADO);
    const sinClave = await errorAsincrono(cuentas.guardar({ usuario: 'planeacion.crm@gmail.com' }, 'Luciana'));
    expect(sinClave.campos).toEqual({ clave: MENSAJE_CLAVE_FALTA });
    expect(bd.fila).toBeNull();

    const guardada = await cuentas.guardar({ usuario: 'planeacion.crm@gmail.com', clave: 'abcd efgh ijkl mnop' }, 'Luciana');
    expect(guardada).toMatchObject({ origen: 'base', modo: 'smtp', tieneClave: true, host: 'smtp.gmail.com', puerto: 465 });
    expect(JSON.stringify(guardada)).not.toContain(CLAVE);
    expect(String(bd.fila?.clave_cifrada)).toMatch(/^v1\./);
    expect(JSON.stringify(bd.fila)).not.toContain(CLAVE);
    expect(bd.fila).toMatchObject({ seguro: 1, actualizado_por: 'Luciana' });
    expect(registro.mock.calls.map((c) => String(c[0])).join('\n')).not.toContain(CLAVE);
    expect(registro.mock.calls.map((c) => String(c[0])).join('\n')).toContain('guardada por Luciana: planeacion.crm@gmail.com en smtp.gmail.com:465');

    const cifrada = bd.fila?.clave_cifrada;
    await cuentas.guardar({ usuario: 'planeacion.crm@gmail.com', nombre: 'Oficina de Planeación' }, 'Luciana');
    expect(bd.fila).toMatchObject({ clave_cifrada: cifrada, nombre: 'Oficina de Planeación' });
    expect((await cuentas.guardada())?.clave).toBe(CLAVE);

    expect(await cuentas.borrar('Luciana')).toMatchObject({ origen: 'ninguna', tieneClave: false });
    expect(bd.fila).toBeNull();
    expect(await cuentas.guardada({ maxEdadMs: 30_000 })).toBeNull();
  });

  it('sin clave no se cambia la cuenta ni el servidor: la clave guardada no sale hacia otro lado', async () => {
    const { bd, cuentas } = servicio(DESACTIVADO);
    bd.sembrar();
    const antes = { ...bd.fila };
    // Quien tenga la sesión del líder no conoce la clave: si pudiera conservarla
    // y cambiar el servidor, la prueba se la mandaría (AUTH) a su propio SMTP.
    for (const cambio of [
      { usuario: 'planeacion.crm@gmail.com', host: 'smtp.atacante.example', puerto: 587, seguro: false },
      { usuario: 'planeacion.crm@gmail.com', host: 'smtp.atacante.example', clave: '' },
      { usuario: 'otra.cuenta@gmail.com' },
    ]) {
      const error = await errorAsincrono(cuentas.guardar(cambio, 'Luciana'));
      expect(error.getStatus()).toBe(400);
      expect(error.campos).toEqual({ clave: MENSAJE_CLAVE_OTRA_CUENTA });
    }
    expect(bd.fila).toEqual(antes);

    // La misma cuenta en el mismo servidor (sin importar mayúsculas) conserva la clave aunque cambien puerto y TLS.
    await cuentas.guardar({ usuario: 'Planeacion.CRM@gmail.com', host: 'SMTP.Gmail.com', puerto: 587, seguro: false }, 'Luciana');
    expect(await cuentas.guardada()).toMatchObject({ host: 'smtp.gmail.com', puerto: 587, clave: CLAVE });
    // Con la clave escrita, sí cambia de servidor.
    await cuentas.guardar({ usuario: 'planeacion.crm@gmail.com', host: 'smtp.otro.example', clave: 'qqqq rrrr' }, 'Luciana');
    expect(await cuentas.guardada()).toMatchObject({ host: 'smtp.otro.example', clave: 'qqqqrrrr' });
  });

  it('sin secreto para la llave, guardar es 409', async () => {
    const { cuentas } = servicio(DESACTIVADO, SIN_LLAVE);
    const error = await errorAsincrono(cuentas.guardar({ usuario: 'x@gmail.com', clave: CLAVE }, null));
    expect(error.getStatus()).toBe(409);
    expect(error.cuerpo.mensaje).toBe(MENSAJE_SIN_LLAVE);
  });
});

/** ServicioCorreoCrm con la base falsa, la cuenta de la base y un transporte falso. */
function correoCon(config: ConfiguracionCorreoCrm) {
  const { bd, cuentas } = servicio(config);
  const usadas: ConfiguracionCorreoCrm[] = [];
  const enviados: CorreoSalienteCrm[] = [];
  let fallo: unknown = null;
  const fabrica: FabricaTransporteCrm = (configuracion) => {
    usadas.push(configuracion);
    if (configuracion.modo === 'desactivado') return null;
    return {
      enviar(correo) {
        if (fallo) return Promise.reject(fallo);
        enviados.push(correo);
        return Promise.resolve({ idMensaje: '<prueba@falso>' });
      },
    };
  };
  const correo = new ServicioCorreoCrm(
    bd as unknown as BaseDatosRepositorio,
    config,
    {} as ServicioArchivosCrm,
    cuentas,
    fabrica,
  );
  return { bd, cuentas, correo, usadas, enviados, fallar: (error: unknown) => (fallo = error) };
}

describe('ServicioCorreoCrm con la cuenta de la base', () => {
  it('sin variables ni cuenta no está configurado; con cuenta legible, sí, y la prueba sale con ella', async () => {
    const { bd, correo, usadas, enviados } = correoCon(DESACTIVADO);
    expect(await correo.estaConfigurado()).toBe(false);
    expect(await correo.enviarPrueba('lider@sapiencia.gov.co')).toEqual({ estado: 'sin_configurar' });

    bd.sembrar();
    // estaConfigurado se fía de lo leído hace menos de 30 s; enviar relee siempre.
    expect(await correo.estaConfigurado()).toBe(false);
    expect(await correo.enviarPrueba('lider@sapiencia.gov.co')).toMatchObject({ estado: 'enviado' });
    expect(await correo.estaConfigurado()).toBe(true);
    expect(usadas.at(-1)).toMatchObject({
      modo: 'smtp',
      smtp: { host: 'smtp.gmail.com', puerto: 465, seguro: true, usuario: 'planeacion.crm@gmail.com', clave: CLAVE },
      remitente: { nombre: 'Planeación Sapiencia', correo: 'planeacion.crm@gmail.com' },
      urlSitio: 'https://crm.sapiencia.test',
    });
    expect(enviados.at(-1)).toMatchObject({ para: 'lider@sapiencia.gov.co', asunto: CORREO_PRUEBA.asunto, adjuntos: [] });
  });

  it('el transporte se guarda mientras la cuenta no cambie (actualizado_en) y se rehace al cambiar', async () => {
    const { bd, cuentas, correo, usadas } = correoCon(DESACTIVADO);
    bd.sembrar();
    const antes = usadas.length;
    await correo.enviarPrueba('a@b.co');
    await correo.enviarPrueba('a@b.co');
    expect(usadas.length - antes).toBe(1);
    await cuentas.guardar({ usuario: 'otra.cuenta@gmail.com', clave: 'qqqq rrrr ssss tttt' }, 'Luciana');
    await correo.enviarPrueba('a@b.co');
    expect(usadas.length - antes).toBe(2);
    expect(usadas.at(-1)?.smtp).toMatchObject({ usuario: 'otra.cuenta@gmail.com', clave: 'qqqqrrrrsssstttt' });
    // Otra instancia la borra: el siguiente envío lo nota.
    bd.fila = null;
    expect(await correo.enviarPrueba('a@b.co')).toEqual({ estado: 'sin_configurar' });
  });

  it('con variables mandan ellas aunque haya cuenta en la base; un error vuelve para traducirlo', async () => {
    const { bd, correo, usadas, fallar } = correoCon(MEMORIA);
    bd.sembrar();
    expect(await correo.estaConfigurado()).toBe(true);
    expect(await correo.enviarPrueba('a@b.co')).toMatchObject({ estado: 'enviado', smtp: null });
    expect(usadas.map((c) => c.modo)).toEqual(['memoria']);
    expect(bd.sentencias).toEqual([]);
    const error = Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535 });
    fallar(error);
    expect(await correo.enviarPrueba('a@b.co')).toEqual({ estado: 'error', error, smtp: null });
  });
});
