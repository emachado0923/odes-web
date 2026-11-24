import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ErrorDeConfiguracion } from '../../config/configuracion.js';
import {
  cargarConfiguracionCorreoCrm,
  describirConfiguracionCorreoCrm,
  hostPorDominio,
} from './configuracion-correo.js';

/** Contraseña de aplicación como la muestra Google (con espacios). */
const CLAVE = 'abcd efgh ijkl mnop';
const CLAVE_LIMPIA = 'abcdefghijklmnop';

function errorDe(env: NodeJS.ProcessEnv): ErrorDeConfiguracion {
  let capturado: unknown;
  try {
    cargarConfiguracionCorreoCrm(env);
  } catch (error) {
    capturado = error;
  }
  expect(capturado).toBeInstanceOf(ErrorDeConfiguracion);
  return capturado as ErrorDeConfiguracion;
}

describe('configuración del correo del CRM', () => {
  it('sin cuenta queda desactivado (el CRM funciona igual)', () => {
    expect(cargarConfiguracionCorreoCrm({})).toEqual({
      modo: 'desactivado',
      smtp: null,
      remitente: { nombre: 'Planeación Sapiencia', correo: 'crm@localhost' },
      directorio: null,
      urlSitio: null,
    });
  });

  it('con una sola de las dos variables también queda desactivado', () => {
    expect(cargarConfiguracionCorreoCrm({ CRM_CORREO_USUARIO: 'planeacion@gmail.com' }).modo).toBe('desactivado');
    expect(cargarConfiguracionCorreoCrm({ CRM_CORREO_CLAVE: CLAVE }).modo).toBe('desactivado');
  });

  it('Gmail: smtp por defecto, smtp.gmail.com:465 con TLS y la clave sin espacios', () => {
    const config = cargarConfiguracionCorreoCrm({
      CRM_CORREO_USUARIO: 'planeacion.sapiencia@gmail.com',
      CRM_CORREO_CLAVE: ` ${CLAVE} `,
    });
    expect(config.modo).toBe('smtp');
    expect(config.smtp).toEqual({
      host: 'smtp.gmail.com',
      puerto: 465,
      seguro: true,
      usuario: 'planeacion.sapiencia@gmail.com',
      clave: CLAVE_LIMPIA,
    });
    expect(config.remitente).toEqual({ nombre: 'Planeación Sapiencia', correo: 'planeacion.sapiencia@gmail.com' });
    expect(config.directorio).toBeNull();
  });

  it.each([
    ['a@gmail.com', 'smtp.gmail.com'],
    ['a@GoogleMail.com', 'smtp.gmail.com'],
    ['a@outlook.com', 'smtp.office365.com'],
    ['a@hotmail.com', 'smtp.office365.com'],
    ['a@live.com', 'smtp.office365.com'],
    ['a@sapiencia.onmicrosoft.com', 'smtp.office365.com'],
    ['a@sapiencia.gov.co', null],
    ['a@outlook.com.co', null],
  ])('el servidor de %s es %s', (correo, host) => {
    expect(hostPorDominio(correo)).toBe(host);
  });

  it('Outlook / Microsoft 365: 587 con STARTTLS obligatorio', () => {
    const config = cargarConfiguracionCorreoCrm({
      CRM_CORREO_USUARIO: 'planeacion@sapiencia.onmicrosoft.com',
      CRM_CORREO_CLAVE: 'otra clave',
    });
    expect(config.smtp).toMatchObject({ host: 'smtp.office365.com', puerto: 587, seguro: false, clave: 'otraclave' });
  });

  it('con otro dominio exige CRM_CORREO_HOST y explica qué poner', () => {
    const error = errorDe({ CRM_CORREO_USUARIO: 'planeacion@sapiencia.gov.co', CRM_CORREO_CLAVE: CLAVE });
    expect(error.message).toMatch(/CRM_CORREO_HOST/);
    expect(error.message).toMatch(/smtp\.gmail\.com/);
    expect(error.message).not.toContain(CLAVE_LIMPIA);

    const config = cargarConfiguracionCorreoCrm({
      CRM_CORREO_USUARIO: 'planeacion@sapiencia.gov.co',
      CRM_CORREO_CLAVE: CLAVE,
      CRM_CORREO_HOST: 'SMTP.Gmail.com',
    });
    expect(config.smtp).toMatchObject({ host: 'smtp.gmail.com', puerto: 465, seguro: true });
    const otro = cargarConfiguracionCorreoCrm({
      CRM_CORREO_USUARIO: 'planeacion@sapiencia.gov.co',
      CRM_CORREO_CLAVE: CLAVE,
      CRM_CORREO_HOST: 'correo.sapiencia.gov.co',
    });
    expect(otro.smtp).toMatchObject({ host: 'correo.sapiencia.gov.co', puerto: 587, seguro: false });
  });

  it('puerto, seguro y nombre explícitos', () => {
    const config = cargarConfiguracionCorreoCrm({
      CRM_CORREO_USUARIO: 'planeacion@gmail.com',
      CRM_CORREO_CLAVE: CLAVE,
      CRM_CORREO_PUERTO: '587',
      CRM_CORREO_NOMBRE: '  Oficina\nde   Planeación ',
    });
    expect(config.smtp).toMatchObject({ puerto: 587, seguro: false });
    expect(config.remitente.nombre).toBe('Oficina de Planeación');
    const seguro = cargarConfiguracionCorreoCrm({
      CRM_CORREO_USUARIO: 'planeacion@gmail.com',
      CRM_CORREO_CLAVE: CLAVE,
      CRM_CORREO_PUERTO: '2465',
      CRM_CORREO_SEGURO: 'SI',
    });
    expect(seguro.smtp).toMatchObject({ puerto: 2465, seguro: true });
  });

  it.each([
    [{ CRM_CORREO_MODO: 'sendgrid' }, /CRM_CORREO_MODO/],
    [{ CRM_CORREO_MODO: 'smtp' }, /CRM_CORREO_USUARIO.*CRM_CORREO_CLAVE/],
    [{ CRM_CORREO_USUARIO: 'planeacion', CRM_CORREO_CLAVE: CLAVE }, /CRM_CORREO_USUARIO/],
    [{ CRM_CORREO_USUARIO: 'a@gmail.com, b@gmail.com', CRM_CORREO_CLAVE: CLAVE }, /CRM_CORREO_USUARIO/],
    [{ CRM_CORREO_USUARIO: 'a@gmail.com', CRM_CORREO_CLAVE: CLAVE, CRM_CORREO_PUERTO: '0' }, /CRM_CORREO_PUERTO/],
    [{ CRM_CORREO_USUARIO: 'a@gmail.com', CRM_CORREO_CLAVE: CLAVE, CRM_CORREO_PUERTO: '70000' }, /CRM_CORREO_PUERTO/],
    [{ CRM_CORREO_USUARIO: 'a@gmail.com', CRM_CORREO_CLAVE: CLAVE, CRM_CORREO_PUERTO: '46.5' }, /CRM_CORREO_PUERTO/],
    [{ CRM_CORREO_USUARIO: 'a@gmail.com', CRM_CORREO_CLAVE: CLAVE, CRM_CORREO_SEGURO: 'quizas' }, /CRM_CORREO_SEGURO/],
    [{ CRM_CORREO_USUARIO: 'a@gmail.com', CRM_CORREO_CLAVE: CLAVE, CRM_CORREO_HOST: 'smtp.gmail.com:465' }, /CRM_CORREO_HOST/],
    [{ CRM_CORREO_USUARIO: 'a@gmail.com', CRM_CORREO_CLAVE: CLAVE, CRM_CORREO_HOST: 'smtps://smtp.gmail.com' }, /CRM_CORREO_HOST/],
    [{ CRM_URL_SITIO: 'planeacion.sapiencia.gov.co' }, /CRM_URL_SITIO/],
    [{ CRM_URL_SITIO: 'javascript:alert(1)' }, /CRM_URL_SITIO/],
    [{ CRM_URL_SITIO: 'https://sitio.gov.co/?x=1' }, /CRM_URL_SITIO/],
  ])('rechaza al arrancar %j', (env, mensaje) => {
    const error = errorDe(env as NodeJS.ProcessEnv);
    expect(error.message).toMatch(mensaje);
    expect(error.message).not.toContain(CLAVE_LIMPIA);
  });

  it('modo archivo: carpeta temporal por defecto o la de CRM_CORREO_DIRECTORIO, resuelta', () => {
    const archivo = cargarConfiguracionCorreoCrm({ CRM_CORREO_MODO: 'ARCHIVO' });
    expect(archivo).toMatchObject({
      modo: 'archivo',
      smtp: null,
      directorio: join(tmpdir(), 'crm-correos'),
      remitente: { correo: 'crm@localhost' },
    });
    expect(cargarConfiguracionCorreoCrm({ CRM_CORREO_MODO: 'archivo', CRM_CORREO_DIRECTORIO: 'tmp/correos' }).directorio).toBe(
      resolve('tmp/correos'),
    );
    // Con cuenta, el remitente es la cuenta aunque no salga por SMTP.
    expect(
      cargarConfiguracionCorreoCrm({ CRM_CORREO_MODO: 'memoria', CRM_CORREO_USUARIO: 'x@sapiencia.gov.co', CRM_CORREO_CLAVE: CLAVE }),
    ).toMatchObject({ modo: 'memoria', smtp: null, directorio: null, remitente: { correo: 'x@sapiencia.gov.co' } });
  });

  it('el modo explícito manda aunque haya cuenta', () => {
    expect(
      cargarConfiguracionCorreoCrm({ CRM_CORREO_MODO: 'desactivado', CRM_CORREO_USUARIO: 'a@gmail.com', CRM_CORREO_CLAVE: CLAVE }),
    ).toMatchObject({ modo: 'desactivado', smtp: null });
  });

  it('CRM_URL_SITIO sin barra final', () => {
    expect(cargarConfiguracionCorreoCrm({ CRM_URL_SITIO: 'https://planeacion.sapiencia.gov.co/' }).urlSitio).toBe(
      'https://planeacion.sapiencia.gov.co',
    );
    expect(cargarConfiguracionCorreoCrm({ CRM_URL_SITIO: 'http://localhost:5173/base//' }).urlSitio).toBe(
      'http://localhost:5173/base',
    );
  });

  it('la descripción para el log dice modo, servidor y cuenta, nunca la clave', () => {
    const smtp = cargarConfiguracionCorreoCrm({ CRM_CORREO_USUARIO: 'x@gmail.com', CRM_CORREO_CLAVE: CLAVE });
    const texto = describirConfiguracionCorreoCrm(smtp);
    expect(texto).toContain('correo del CRM: smtp smtp.gmail.com:465 como x@gmail.com');
    expect(texto).not.toContain(CLAVE_LIMPIA);
    expect(texto).not.toContain('abcd');
    expect(describirConfiguracionCorreoCrm(cargarConfiguracionCorreoCrm({}))).toMatch(/desactivado/);
    expect(describirConfiguracionCorreoCrm(cargarConfiguracionCorreoCrm({ CRM_CORREO_MODO: 'archivo' }))).toContain(
      join(tmpdir(), 'crm-correos'),
    );
  });
});
