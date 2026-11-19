import { createHash } from 'node:crypto';
import { type ExecutionContext, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  COOKIE_SESION_PAI,
  MENSAJES_ERROR_PAI,
  RUTA_COOKIE_PAI,
} from '../api-pai.js';
import type { SesionValidaPai } from '../compartido/tipos-servidor.js';
import { ErrorPaiHttp } from '../errores-pai.js';
import type { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type {
  Conexion,
  ResultadoEscritura,
} from '../../repositorio/bd/conexion.js';
import { cargarConfiguracionRepositorio } from '../../repositorio/configuracion-repositorio.js';
import { hashContrasena } from '../../repositorio/dominio/contrasenas.js';
import {
  INTENTO_CORRECTO,
  INTENTO_EN_CURSO,
  INTENTO_FALLIDO,
  MENSAJE_CREDENCIALES,
} from '../../repositorio/servicios/sesiones.js';
import {
  GuardiaAdministradorPai,
  GuardiaPai,
  PermiteContrasenaTemporal,
  sesionPaiDePeticion,
  validarPeticionPai,
} from './guardia-pai.js';
import { PaiSesionController } from './sesion-pai.controller.js';
import {
  claveCambioContrasena,
  MENSAJE_CONTRASENA_ACTUAL,
  PATRON_TOKEN_PAI,
  ServicioSesionesPai,
} from './servicio-sesiones-pai.js';
import {
  validarCambioContrasenaPai,
  validarCredencialesPai,
} from './validacion-sesion.js';

/**
 * Unitarias de la sesión del PAI: validación, guardias (CSRF, mismo sitio,
 * contraseña temporal, rol), servicio de sesiones contra una base falsa y el
 * controlador (cookie). Las pruebas contra MySQL/Postgres reales están en
 * test/pai-sesion.e2e-spec.ts.
 */

const CONFIG = cargarConfiguracionRepositorio({});
const CONTRASENA = 'una-clave-larga-de-prueba';
const CSRF = 'c'.repeat(43);

function sha256(texto: string): string {
  return createHash('sha256').update(texto).digest('hex');
}

/** Error que lanza una promesa (falla si no lanza). */
async function errorDe(promesa: Promise<unknown>): Promise<ErrorPaiHttp> {
  try {
    await promesa;
  } catch (error) {
    if (error instanceof ErrorPaiHttp) return error;
    throw error;
  }
  throw new Error('Se esperaba un ErrorPaiHttp');
}

function errorSincrono(funcion: () => unknown): ErrorPaiHttp {
  try {
    funcion();
  } catch (error) {
    if (error instanceof ErrorPaiHttp) return error;
    throw error;
  }
  throw new Error('Se esperaba un ErrorPaiHttp');
}

function sesionPrueba(cambios: Partial<SesionValidaPai> = {}): SesionValidaPai {
  return {
    id: 10,
    usuarioId: 3,
    usuario: 'responsable1',
    nombre: 'Responsable Uno',
    rol: 'responsable',
    csrf: CSRF,
    expira: new Date('2026-10-11T18:00:00Z'),
    debeCambiarContrasena: false,
    ...cambios,
  };
}

// ── Validación ────────────────────────────────────────────────────────────

describe('validarCredencialesPai', () => {
  it('pasa el usuario a minúsculas y deja la contraseña tal cual', () => {
    expect(
      validarCredencialesPai({
        usuario: '  Ana.Perez ',
        contrasena: ' Clave ',
      }),
    ).toEqual({ usuario: 'ana.perez', contrasena: ' Clave ' });
  });

  it.each([
    [undefined, ['usuario', 'contrasena']],
    [null, ['usuario', 'contrasena']],
    [[], ['usuario', 'contrasena']],
    [{ usuario: 'ana' }, ['contrasena']],
    [{ usuario: '  ', contrasena: 'x' }, ['usuario']],
    [{ usuario: 'a'.repeat(65), contrasena: 'x' }, ['usuario']],
    [{ usuario: 'ana', contrasena: 'x'.repeat(1025) }, ['contrasena']],
    [{ usuario: 5, contrasena: 'x' }, ['usuario']],
  ])('rechaza %j con 400 y campos', (cuerpo, campos) => {
    const error = errorSincrono(() => validarCredencialesPai(cuerpo));
    expect(error.getStatus()).toBe(400);
    expect(error.codigo).toBe('solicitud_invalida');
    expect(Object.keys(error.campos ?? {}).toSorted()).toEqual(
      campos.toSorted(),
    );
  });
});

describe('validarCambioContrasenaPai', () => {
  it('acepta una nueva válida y distinta', () => {
    expect(
      validarCambioContrasenaPai({
        actual: 'temporal-123456',
        nueva: CONTRASENA,
      }),
    ).toEqual({ actual: 'temporal-123456', nueva: CONTRASENA });
  });

  it('exige la actual y una nueva con las reglas del repositorio', () => {
    expect(
      errorSincrono(() => validarCambioContrasenaPai('x')).getStatus(),
    ).toBe(400);
    const sinActual = errorSincrono(() =>
      validarCambioContrasenaPai({ actual: '', nueva: CONTRASENA }),
    );
    expect(sinActual.campos).toEqual({
      actual: 'Escriba su contraseña actual.',
    });
    const corta = errorSincrono(() =>
      validarCambioContrasenaPai({ actual: 'x', nueva: 'corta' }),
    );
    expect(corta.campos?.nueva).toMatch(/al menos 12 caracteres/);
    const espacios = errorSincrono(() =>
      validarCambioContrasenaPai({ actual: 'x', nueva: ` ${CONTRASENA}` }),
    );
    expect(espacios.campos?.nueva).toMatch(/espacios/);
  });

  it('la nueva debe ser distinta de la actual (también en otra forma Unicode)', () => {
    const igual = errorSincrono(() =>
      validarCambioContrasenaPai({
        actual: 'contraseña-larga-1',
        nueva: 'contrasen\u0303a-larga-1',
      }),
    );
    expect(igual.campos).toEqual({
      nueva: 'La contraseña nueva debe ser distinta de la actual.',
    });
  });
});

// ── Guardias ──────────────────────────────────────────────────────────────

interface PeticionFalsa {
  method: string;
  headers: Record<string, string | undefined>;
  get(nombre: string): string | undefined;
}

function peticion(
  metodo: string,
  cabeceras: Record<string, string> = {},
): Request {
  const minusculas = Object.fromEntries(
    Object.entries(cabeceras).map(([clave, valor]) => [
      clave.toLowerCase(),
      valor,
    ]),
  );
  const req: PeticionFalsa = {
    method: metodo,
    headers: minusculas,
    get: (nombre) => minusculas[nombre.toLowerCase()],
  };
  return req as unknown as Request;
}

/** ServicioSesionesPai falso: la sesión del token "valido" (43 caracteres). */
function sesionesFalsas(sesion: SesionValidaPai | null): ServicioSesionesPai {
  return {
    validar: async (token: string | undefined) =>
      token === 't'.repeat(43) ? sesion : null,
  } as unknown as ServicioSesionesPai;
}

const COOKIE = `${COOKIE_SESION_PAI}=${'t'.repeat(43)}`;

function peticionConCookie(): Request {
  return peticion('GET', { cookie: COOKIE });
}

describe('validarPeticionPai', () => {
  it('sin cookie o con una inválida: 401 no_autenticado', async () => {
    const sesiones = sesionesFalsas(sesionPrueba());
    const sinCookie = await errorDe(
      validarPeticionPai(peticion('GET'), sesiones),
    );
    expect(sinCookie.getStatus()).toBe(401);
    expect(sinCookie.codigo).toBe('no_autenticado');
    const otra = await errorDe(
      validarPeticionPai(
        peticion('GET', { cookie: `${COOKIE_SESION_PAI}=${'x'.repeat(43)}` }),
        sesiones,
      ),
    );
    expect(otra.getStatus()).toBe(401);
    // La cookie del repositorio no sirve para el PAI.
    const repositorio = await errorDe(
      validarPeticionPai(
        peticion('GET', { cookie: `repositorio_sesion=${'t'.repeat(43)}` }),
        sesiones,
      ),
    );
    expect(repositorio.getStatus()).toBe(401);
  });

  it('GET con sesión: la devuelve (sin pedir CSRF)', async () => {
    const sesion = sesionPrueba();
    await expect(
      validarPeticionPai(
        peticion('GET', { cookie: COOKIE }),
        sesionesFalsas(sesion),
      ),
    ).resolves.toBe(sesion);
  });

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
    '%s exige X-CSRF-Token válido y mismo sitio',
    async (metodo) => {
      const sesiones = sesionesFalsas(sesionPrueba());
      for (const cabeceras of [
        { cookie: COOKIE },
        { cookie: COOKIE, 'X-CSRF-Token': `${CSRF}x` },
        { cookie: COOKIE, 'X-CSRF-Token': 'd'.repeat(43) },
        {
          cookie: COOKIE,
          'X-CSRF-Token': CSRF,
          Origin: 'https://otro.example',
        },
        {
          cookie: COOKIE,
          'X-CSRF-Token': CSRF,
          'Sec-Fetch-Site': 'cross-site',
        },
        { cookie: COOKIE, 'X-CSRF-Token': CSRF, 'Sec-Fetch-Site': 'same-site' },
      ] as Record<string, string>[]) {
        const error = await errorDe(
          validarPeticionPai(peticion(metodo, cabeceras), sesiones),
        );
        expect(error.getStatus()).toBe(403);
        expect(error.codigo).toBe('prohibido');
      }
      await expect(
        validarPeticionPai(
          peticion(metodo, {
            cookie: COOKIE,
            'X-CSRF-Token': CSRF,
            'Sec-Fetch-Site': 'same-origin',
          }),
          sesiones,
        ),
      ).resolves.toMatchObject({ usuario: 'responsable1' });
      await expect(
        validarPeticionPai(
          peticion(metodo, {
            cookie: COOKIE,
            'X-CSRF-Token': CSRF,
            Origin: 'http://pai.local',
            Host: 'pai.local',
          }),
          sesiones,
        ),
      ).resolves.toBeTruthy();
    },
  );

  it('contraseña temporal: 403 cambio_contrasena_requerido salvo que se permita', async () => {
    const sesiones = sesionesFalsas(
      sesionPrueba({ debeCambiarContrasena: true }),
    );
    const error = await errorDe(
      validarPeticionPai(peticion('GET', { cookie: COOKIE }), sesiones),
    );
    expect(error.getStatus()).toBe(403);
    expect(error.codigo).toBe('cambio_contrasena_requerido');
    expect(error.cuerpo.mensaje).toBe(
      MENSAJES_ERROR_PAI.cambio_contrasena_requerido,
    );
    await expect(
      validarPeticionPai(peticion('GET', { cookie: COOKIE }), sesiones, {
        permiteContrasenaTemporal: true,
      }),
    ).resolves.toMatchObject({ debeCambiarContrasena: true });
    // El CSRF se comprueba antes: una petición de otro sitio no se entera.
    const sinCsrf = await errorDe(
      validarPeticionPai(peticion('PUT', { cookie: COOKIE }), sesiones),
    );
    expect(sinCsrf.codigo).toBe('prohibido');
  });

  it('soloAdministrador: 403 al responsable, pasa el administrador', async () => {
    const responsable = await errorDe(
      validarPeticionPai(
        peticion('GET', { cookie: COOKIE }),
        sesionesFalsas(sesionPrueba()),
        { soloAdministrador: true },
      ),
    );
    expect(responsable.getStatus()).toBe(403);
    expect(responsable.codigo).toBe('prohibido');
    expect(responsable.cuerpo.mensaje).toMatch(/administrador/);
    await expect(
      validarPeticionPai(
        peticion('GET', { cookie: COOKIE }),
        sesionesFalsas(sesionPrueba({ rol: 'administrador' })),
        { soloAdministrador: true },
      ),
    ).resolves.toMatchObject({ rol: 'administrador' });
    // Un administrador con contraseña temporal primero debe cambiarla.
    const temporal = await errorDe(
      validarPeticionPai(
        peticion('GET', { cookie: COOKIE }),
        sesionesFalsas(
          sesionPrueba({ rol: 'administrador', debeCambiarContrasena: true }),
        ),
        { soloAdministrador: true },
      ),
    );
    expect(temporal.codigo).toBe('cambio_contrasena_requerido');
  });
});

class ControladorDePrueba {
  @PermiteContrasenaTemporal()
  permitido(): void {}

  normal(): void {}
}

@PermiteContrasenaTemporal()
class ControladorPermitido {
  cualquiera(): void {}
}

function contexto(
  req: Request,
  clase: new () => object,
  manejador: (...args: never[]) => unknown,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => manejador,
    getClass: () => clase,
  } as unknown as ExecutionContext;
}

describe('GuardiaPai y GuardiaAdministradorPai', () => {
  const reflector = new Reflector();

  it('GuardiaPai deja la sesión en la petición', async () => {
    const sesion = sesionPrueba();
    const guardia = new GuardiaPai(sesionesFalsas(sesion), reflector);
    const req = peticion('GET', { cookie: COOKIE });
    await expect(
      guardia.canActivate(
        contexto(
          req,
          ControladorDePrueba,
          ControladorDePrueba.prototype.normal,
        ),
      ),
    ).resolves.toBe(true);
    expect(sesionPaiDePeticion(req)).toBe(sesion);
  });

  it('@PermiteContrasenaTemporal en el método o en la clase abre la puerta', async () => {
    const guardia = new GuardiaPai(
      sesionesFalsas(sesionPrueba({ debeCambiarContrasena: true })),
      reflector,
    );
    const normal = await errorDe(
      guardia.canActivate(
        contexto(
          peticionConCookie(),
          ControladorDePrueba,
          ControladorDePrueba.prototype.normal,
        ),
      ),
    );
    expect(normal.codigo).toBe('cambio_contrasena_requerido');
    await expect(
      guardia.canActivate(
        contexto(
          peticionConCookie(),
          ControladorDePrueba,
          ControladorDePrueba.prototype.permitido,
        ),
      ),
    ).resolves.toBe(true);
    await expect(
      guardia.canActivate(
        contexto(
          peticionConCookie(),
          ControladorPermitido,
          ControladorPermitido.prototype.cualquiera,
        ),
      ),
    ).resolves.toBe(true);
  });

  it('GuardiaAdministradorPai: 403 al responsable', async () => {
    const req = peticion('GET', { cookie: COOKIE });
    const ctx = contexto(
      req,
      ControladorDePrueba,
      ControladorDePrueba.prototype.normal,
    );
    const responsable = await errorDe(
      new GuardiaAdministradorPai(
        sesionesFalsas(sesionPrueba()),
        reflector,
      ).canActivate(ctx),
    );
    expect(responsable.getStatus()).toBe(403);
    expect(sesionPaiDePeticion(req)).toBeUndefined();
    await expect(
      new GuardiaAdministradorPai(
        sesionesFalsas(sesionPrueba({ rol: 'administrador' })),
        reflector,
      ).canActivate(ctx),
    ).resolves.toBe(true);
    expect(sesionPaiDePeticion(req)?.rol).toBe('administrador');
  });
});

// ── Servicio de sesiones contra una base falsa ────────────────────────────

interface Consulta {
  sql: string;
  valores: unknown[];
  enTransaccion: boolean;
}

type Responder = (sql: string, valores: unknown[]) => unknown;

/** BaseDatosRepositorio falsa: registra cada sentencia y responde con `responder`. */
class BdFalsa {
  readonly consultas: Consulta[] = [];
  listos = 0;

  constructor(private readonly responder: Responder) {}

  async listo(): Promise<void> {
    this.listos++;
  }

  async filas(sql: string, valores: unknown[] = []): Promise<unknown[]> {
    this.consultas.push({ sql, valores, enTransaccion: false });
    return (this.responder(sql, valores) as unknown[] | undefined) ?? [];
  }

  async ejecutar(
    sql: string,
    valores: unknown[] = [],
  ): Promise<ResultadoEscritura> {
    this.consultas.push({ sql, valores, enTransaccion: false });
    return (
      (this.responder(sql, valores) as ResultadoEscritura | undefined) ?? {
        insertId: 0,
        affectedRows: 1,
      }
    );
  }

  async transaccion<T>(accion: (conexion: Conexion) => Promise<T>): Promise<T> {
    const conexion = {
      dialecto: 'mysql',
      query: async (sql: string, valores: unknown[] = []) => {
        this.consultas.push({ sql, valores, enTransaccion: true });
        const respuesta = this.responder(sql, valores);
        return [respuesta ?? { insertId: 0, affectedRows: 1 }, undefined];
      },
    } as unknown as Conexion;
    return accion(conexion);
  }

  /** Sentencias que contienen `texto`. */
  con(texto: string): Consulta[] {
    return this.consultas.filter((consulta) => consulta.sql.includes(texto));
  }
}

function servicio(bd: BdFalsa): ServicioSesionesPai {
  return new ServicioSesionesPai(bd as unknown as BaseDatosRepositorio, CONFIG);
}

let HASH: string;

beforeAll(async () => {
  // El aviso de bloqueo de una cuenta no ensucia la salida de las pruebas.
  Logger.overrideLogger(false);
  HASH = await hashContrasena(CONTRASENA);
});

interface OpcionesLogin {
  usuario?: Record<string, unknown> | null;
  fallos?: number;
  fallosIp?: number;
  ultimo?: Date | null;
  /** Fallos que ve registrarFallo ya con el bloqueo de la fila. */
  fallosConBloqueo?: number;
}

function responderLogin(opciones: OpcionesLogin = {}): Responder {
  const usuario =
    opciones.usuario === undefined
      ? {
          id: 3,
          usuario: 'responsable1',
          nombre: 'Responsable Uno',
          rol: 'responsable',
          hash_contrasena: HASH,
          debe_cambiar_contrasena: 0,
          activo: 1,
        }
      : opciones.usuario;
  return (sql, valores) => {
    if (sql.startsWith('INSERT INTO pai_intentos_acceso')) {
      return { insertId: 77, affectedRows: 1 };
    }
    if (sql.includes('COUNT(*) AS fallos, MAX')) {
      const porIp = sql.includes('WHERE ip = ?');
      return [
        {
          fallos: porIp ? (opciones.fallosIp ?? 1) : (opciones.fallos ?? 1),
          ultimo: opciones.ultimo ?? null,
        },
      ];
    }
    if (sql.includes('SELECT COUNT(*) AS fallos FROM pai_intentos_acceso')) {
      return [{ fallos: opciones.fallosConBloqueo ?? 1 }];
    }
    if (sql.includes('FROM pai_usuarios WHERE usuario = ?')) {
      return usuario && valores[0] === usuario.usuario ? [usuario] : [];
    }
    if (
      sql.includes('FROM pai_usuarios WHERE id = ?') &&
      !sql.includes('FOR UPDATE')
    ) {
      return usuario ? [usuario] : [];
    }
    if (sql.startsWith('INSERT INTO pai_sesiones')) {
      return { insertId: 555, affectedRows: 1 };
    }
    return undefined;
  };
}

/** Detalle JSON de las filas de pai_registro escritas. */
function registros(bd: BdFalsa): { accion: unknown; detalle: unknown }[] {
  return bd.con('INSERT INTO pai_registro').map((consulta) => ({
    accion: consulta.valores[3],
    detalle: JSON.parse(String(consulta.valores[7])),
  }));
}

async function intentarInicio(
  opciones: OpcionesLogin,
  credenciales: { usuario: string; contrasena: string },
): Promise<{ bd: BdFalsa; error: ErrorPaiHttp }> {
  const bd = new BdFalsa(responderLogin(opciones));
  const error = await errorDe(
    servicio(bd).iniciar(credenciales, { ip: '10.0.0.1', agente: null }),
  );
  return { bd, error };
}

/** Fila de pai_sesiones JOIN pai_usuarios, válida salvo `cambios`. */
function filaSesion(cambios: Record<string, unknown> = {}) {
  return {
    id: 9,
    csrf: CSRF,
    ultimo_uso: new Date(Date.now() - 10_000),
    expira_en: new Date(Date.now() + 3_600_000),
    usuario_id: 3,
    usuario: 'responsable1',
    nombre: 'Responsable Uno',
    rol: 'responsable',
    debe_cambiar_contrasena: 0,
    activo: 1,
    ...cambios,
  };
}

/** Base falsa para cambiar la contraseña del usuario 3. */
function responderCambio(temporal: boolean, activo = 1): Responder {
  return responderLogin({
    usuario: {
      id: 3,
      usuario: 'responsable1',
      nombre: 'Responsable Uno (actualizado)',
      rol: 'responsable',
      hash_contrasena: HASH,
      debe_cambiar_contrasena: temporal ? 1 : 0,
      activo,
    },
  });
}

describe('ServicioSesionesPai.iniciar', () => {
  it('cuerpo inválido: 400 sin tocar la base', async () => {
    const bd = new BdFalsa(responderLogin());
    const error = await errorDe(
      servicio(bd).iniciar({ usuario: 'x' }, { ip: '10.0.0.1', agente: null }),
    );
    expect(error.getStatus()).toBe(400);
    expect(bd.listos).toBe(0);
    expect(bd.consultas).toEqual([]);
  });

  it('crea la sesión: token aleatorio (en la base solo su sha256), rotación y registro', async () => {
    const bd = new BdFalsa(responderLogin());
    const anterior = 'a'.repeat(43);
    const inicio = await servicio(bd).iniciar(
      { usuario: 'Responsable1', contrasena: CONTRASENA },
      {
        ip: '10.0.0.1',
        agente: 'Navegador de prueba',
        tokenAnterior: anterior,
      },
    );
    expect(inicio.token).toMatch(PATRON_TOKEN_PAI);
    expect(inicio.duracionMs).toBe(CONFIG.sesionMaximaMs);
    expect(inicio.sesion).toMatchObject({
      id: 3,
      usuario: 'responsable1',
      nombre: 'Responsable Uno',
      rol: 'responsable',
      debeCambiarContrasena: false,
    });
    expect(inicio.sesion.csrf).toMatch(PATRON_TOKEN_PAI);
    expect(inicio.sesion.csrf).not.toBe(inicio.token);
    const expira = Date.parse(inicio.sesion.expira);
    expect(expira - Date.now()).toBeLessThanOrEqual(CONFIG.sesionInactividadMs);
    expect(expira - Date.now()).toBeGreaterThan(
      CONFIG.sesionInactividadMs - 5_000,
    );

    const [reserva] = bd.con('INSERT INTO pai_intentos_acceso');
    expect(reserva.valores.slice(0, 3)).toEqual([
      'responsable1',
      '10.0.0.1',
      INTENTO_EN_CURSO,
    ]);
    const [insercion] = bd.con('INSERT INTO pai_sesiones');
    expect(insercion.enTransaccion).toBe(true);
    expect(insercion.valores[0]).toBe(sha256(inicio.token));
    expect(insercion.valores).not.toContain(inicio.token);
    expect(insercion.valores.slice(1, 3)).toEqual([inicio.sesion.csrf, 3]);
    expect(insercion.valores.slice(6)).toEqual([
      '10.0.0.1',
      'Navegador de prueba',
    ]);
    expect(
      bd.con('DELETE FROM pai_sesiones WHERE token_hash = ?')[0].valores,
    ).toEqual([sha256(anterior)]);
    expect(
      bd.con('UPDATE pai_intentos_acceso SET exito = ?')[0].valores,
    ).toEqual([INTENTO_CORRECTO, 77]);
    expect(registros(bd)).toEqual([
      { accion: 'iniciar_sesion', detalle: { resultado: 'correcto' } },
    ]);
    // Nada de contraseñas ni hashes en el registro.
    const textoRegistro = JSON.stringify(bd.con('INSERT INTO pai_registro'));
    expect(textoRegistro).not.toContain(CONTRASENA);
    expect(textoRegistro).not.toContain('scrypt$');
    // El intento quedó resuelto: la limpieza solo borra intentos "en curso".
    expect(
      bd.con('DELETE FROM pai_intentos_acceso WHERE id = ? AND exito = ?')[0]
        .valores,
    ).toEqual([77, INTENTO_EN_CURSO]);
  });

  it('marca la contraseña temporal en la sesión', async () => {
    const bd = new BdFalsa(
      responderLogin({
        usuario: {
          id: 4,
          usuario: 'nuevo',
          nombre: 'Nuevo',
          rol: 'administrador',
          hash_contrasena: HASH,
          debe_cambiar_contrasena: 1,
          activo: 1,
        },
      }),
    );
    const inicio = await servicio(bd).iniciar(
      { usuario: 'nuevo', contrasena: CONTRASENA },
      { ip: '10.0.0.1', agente: null },
    );
    expect(inicio.sesion).toMatchObject({
      rol: 'administrador',
      debeCambiarContrasena: true,
    });
  });

  it('contraseña equivocada, usuario inexistente o inactivo: el mismo 401', async () => {
    const mala = await intentarInicio(
      {},
      { usuario: 'responsable1', contrasena: 'otra-clave-larga' },
    );
    const nadie = await intentarInicio(
      {},
      { usuario: 'nadie', contrasena: CONTRASENA },
    );
    const inactivo = await intentarInicio(
      {
        usuario: {
          id: 5,
          usuario: 'inactivo',
          nombre: 'Inactivo',
          rol: 'responsable',
          hash_contrasena: HASH,
          debe_cambiar_contrasena: 0,
          activo: 0,
        },
      },
      { usuario: 'inactivo', contrasena: CONTRASENA },
    );
    for (const { error, bd } of [mala, nadie, inactivo]) {
      expect(error.getStatus()).toBe(401);
      expect(error.cuerpo).toEqual({
        codigo: 'no_autenticado',
        mensaje: MENSAJE_CREDENCIALES,
      });
      expect(bd.con('INSERT INTO pai_sesiones')).toEqual([]);
      expect(
        bd.con('UPDATE pai_intentos_acceso SET exito = ?')[0].valores,
      ).toEqual([INTENTO_FALLIDO, 77]);
    }
    expect(registros(mala.bd)).toEqual([
      {
        accion: 'iniciar_sesion',
        detalle: { resultado: 'fallido', motivo: 'contrasena' },
      },
    ]);
    expect(mala.bd.con('FOR UPDATE')).toHaveLength(1);
    // Del usuario inexistente no queda nada en el registro.
    expect(registros(nadie.bd)).toEqual([]);
    expect(registros(inactivo.bd)).toEqual([
      {
        accion: 'iniciar_sesion',
        detalle: { resultado: 'fallido', motivo: 'inactivo' },
      },
    ]);
  });

  it('el fallo que completa el límite anota el bloqueo una vez', async () => {
    const bd = new BdFalsa(responderLogin({ fallos: 5, fallosConBloqueo: 5 }));
    await errorDe(
      servicio(bd).iniciar(
        { usuario: 'responsable1', contrasena: 'otra-clave-larga' },
        { ip: '10.0.0.1', agente: null },
      ),
    );
    expect(registros(bd).map((r) => r.detalle)).toEqual([
      { resultado: 'fallido', motivo: 'contrasena' },
      { resultado: 'bloqueado', minutos: 15, fallos: 5 },
    ]);
  });

  it('bloqueado: 429 con Retry-After, sin verificar y borrando la reserva', async () => {
    for (const opciones of [
      { fallos: 6, ultimo: new Date(Date.now() - 60_000) },
      { fallosIp: 21, ultimo: new Date(Date.now() - 60_000) },
    ]) {
      const bd = new BdFalsa(responderLogin(opciones));
      const error = await errorDe(
        servicio(bd).iniciar(
          { usuario: 'responsable1', contrasena: CONTRASENA },
          { ip: '10.0.0.1', agente: null },
        ),
      );
      expect(error.getStatus()).toBe(429);
      expect(error.codigo).toBe('demasiados_intentos');
      expect(error.reintentarEn).toBeGreaterThan(13 * 60);
      expect(error.reintentarEn).toBeLessThanOrEqual(14 * 60);
      expect(error.cuerpo.mensaje).toMatch(/Espere 14 minutos/);
      expect(bd.con('FROM pai_usuarios')).toEqual([]);
      expect(
        bd.con('DELETE FROM pai_intentos_acceso WHERE id = ? AND exito = ?')[0]
          .valores,
      ).toEqual([77, INTENTO_EN_CURSO]);
    }
  });

  it('un bloqueo que ya pasó no impide entrar', async () => {
    const bd = new BdFalsa(
      responderLogin({ fallos: 9, ultimo: new Date(Date.now() - 16 * 60_000) }),
    );
    await expect(
      servicio(bd).iniciar(
        { usuario: 'responsable1', contrasena: CONTRASENA },
        { ip: '10.0.0.1', agente: null },
      ),
    ).resolves.toMatchObject({ sesion: { usuario: 'responsable1' } });
  });

  it('un usuario no ASCII se cuenta por su sha256 y la IPv6 por su /64', async () => {
    const bd = new BdFalsa(responderLogin());
    await errorDe(
      servicio(bd).iniciar(
        { usuario: 'josé', contrasena: CONTRASENA },
        { ip: '2001:db8:1:2:3:4:5:6', agente: null },
      ),
    );
    const [reserva] = bd.con('INSERT INTO pai_intentos_acceso');
    expect(reserva.valores[0]).toMatch(/^#[0-9a-f]{63}$/);
    expect(reserva.valores[1]).toBe('2001:db8:1:2::/64');
  });
});

describe('ServicioSesionesPai.validar', () => {
  const token = 'k'.repeat(43);

  it('sin token o con uno mal formado: null (pero comprueba la base: 503 y no 401)', async () => {
    for (const valor of [
      undefined,
      '',
      'corto',
      `${token}x`,
      'k'.repeat(42) + '!',
    ]) {
      const bd = new BdFalsa(() => undefined);
      await expect(servicio(bd).validar(valor)).resolves.toBeNull();
      expect(bd.listos).toBe(1);
      expect(bd.consultas).toEqual([]);
    }
  });

  it('busca por el sha256 del token y devuelve la sesión con rol y contraseña temporal', async () => {
    const fila = filaSesion({
      rol: 'administrador',
      debe_cambiar_contrasena: 1,
    });
    const bd = new BdFalsa((sql) =>
      sql.includes('FROM pai_sesiones s') ? [fila] : undefined,
    );
    const sesion = await servicio(bd).validar(token);
    expect(bd.consultas[0].valores).toEqual([sha256(token)]);
    expect(sesion).toEqual({
      id: 9,
      usuarioId: 3,
      usuario: 'responsable1',
      nombre: 'Responsable Uno',
      rol: 'administrador',
      csrf: CSRF,
      expira: new Date(fila.ultimo_uso.getTime() + CONFIG.sesionInactividadMs),
      debeCambiarContrasena: true,
    });
    // Usada hace 10 s: no se reescribe ultimo_uso.
    expect(bd.con('UPDATE pai_sesiones')).toEqual([]);
  });

  it('actualiza ultimo_uso como mucho una vez por minuto', async () => {
    const fila = filaSesion({ ultimo_uso: new Date(Date.now() - 5 * 60_000) });
    const bd = new BdFalsa((sql) =>
      sql.includes('FROM pai_sesiones s') ? [fila] : undefined,
    );
    const sesion = await servicio(bd).validar(token);
    const [actualizacion] = bd.con('UPDATE pai_sesiones SET ultimo_uso = ?');
    expect(actualizacion.valores[1]).toBe(9);
    expect(sesion?.expira.getTime()).toBeGreaterThan(
      Date.now() + CONFIG.sesionInactividadMs - 5_000,
    );
  });

  it('el vencimiento absoluto gana si llega antes que el de inactividad', async () => {
    const expira = new Date(Date.now() + 60_000);
    const bd = new BdFalsa((sql) =>
      sql.includes('FROM pai_sesiones s')
        ? [filaSesion({ expira_en: expira })]
        : undefined,
    );
    expect((await servicio(bd).validar(token))?.expira).toEqual(expira);
  });

  it.each([
    ['vencida', { expira_en: new Date(Date.now() - 1000) }],
    [
      'inactiva',
      {
        ultimo_uso: new Date(Date.now() - CONFIG.sesionInactividadMs - 60_000),
      },
    ],
    ['de una cuenta desactivada', { activo: 0 }],
  ])('una sesión %s se borra y da null', async (_caso, cambios) => {
    const bd = new BdFalsa((sql) =>
      sql.includes('FROM pai_sesiones s') ? [filaSesion(cambios)] : undefined,
    );
    await expect(servicio(bd).validar(token)).resolves.toBeNull();
    expect(bd.con('DELETE FROM pai_sesiones WHERE id = ?')[0].valores).toEqual([
      9,
    ]);
  });

  it('token desconocido: null sin borrar nada', async () => {
    const bd = new BdFalsa(() => []);
    await expect(servicio(bd).validar(token)).resolves.toBeNull();
    expect(bd.con('DELETE')).toEqual([]);
  });
});

describe('ServicioSesionesPai.cambiarContrasena', () => {
  const NUEVA = 'otra-clave-nueva-y-larga';

  it('cuerpo inválido: 400 sin tocar la base', async () => {
    const bd = new BdFalsa(responderCambio(true));
    const error = await errorDe(
      servicio(bd).cambiarContrasena(sesionPrueba(), {
        actual: CONTRASENA,
        nueva: 'corta',
      }),
    );
    expect(error.getStatus()).toBe(400);
    expect(bd.consultas).toEqual([]);
  });

  it('la actual equivocada: 400 con campos.actual y cuenta como intento fallido del cambio (no del inicio de sesión)', async () => {
    const bd = new BdFalsa(responderCambio(true));
    const error = await errorDe(
      servicio(bd).cambiarContrasena(
        sesionPrueba(),
        { actual: 'no-es-la-actual', nueva: NUEVA },
        { ip: '10.0.0.2' },
      ),
    );
    expect(error.getStatus()).toBe(400);
    expect(error.cuerpo).toEqual({
      codigo: 'solicitud_invalida',
      mensaje: MENSAJE_CONTRASENA_ACTUAL,
      campos: { actual: MENSAJE_CONTRASENA_ACTUAL },
    });
    // Clave propia del cambio de contraseña (SEG-6): no la del inicio de sesión.
    expect(
      bd.con('INSERT INTO pai_intentos_acceso')[0].valores.slice(0, 2),
    ).toEqual([claveCambioContrasena(sesionPrueba().usuarioId), '10.0.0.2']);
    expect(
      bd.con('UPDATE pai_intentos_acceso SET exito = ?')[0].valores,
    ).toEqual([INTENTO_FALLIDO, 77]);
    expect(registros(bd)).toEqual([
      {
        accion: 'cambiar_contrasena',
        detalle: { resultado: 'fallido', motivo: 'contrasena' },
      },
    ]);
    expect(bd.con('UPDATE pai_usuarios SET hash_contrasena')).toEqual([]);
  });

  it('bloqueado por intentos: 429', async () => {
    const bd = new BdFalsa(
      responderLogin({ fallos: 6, ultimo: new Date(Date.now() - 1000) }),
    );
    const error = await errorDe(
      servicio(bd).cambiarContrasena(sesionPrueba(), {
        actual: CONTRASENA,
        nueva: NUEVA,
      }),
    );
    expect(error.getStatus()).toBe(429);
  });

  it('cuenta desactivada mientras tanto: 401', async () => {
    const bd = new BdFalsa(responderCambio(false, 0));
    const error = await errorDe(
      servicio(bd).cambiarContrasena(sesionPrueba(), {
        actual: CONTRASENA,
        nueva: NUEVA,
      }),
    );
    expect(error.getStatus()).toBe(401);
  });

  it('guarda el hash nuevo, quita la marca temporal y cierra las demás sesiones', async () => {
    const bd = new BdFalsa(responderCambio(true));
    const sesion = sesionPrueba({ debeCambiarContrasena: true });
    const respuesta = await servicio(bd).cambiarContrasena(sesion, {
      actual: CONTRASENA,
      nueva: NUEVA,
    });
    expect(respuesta).toEqual({
      id: 3,
      usuario: 'responsable1',
      nombre: 'Responsable Uno (actualizado)',
      rol: 'responsable',
      csrf: CSRF,
      expira: sesion.expira.toISOString(),
      debeCambiarContrasena: false,
    });
    const [actualizacion] = bd.con(
      'UPDATE pai_usuarios SET hash_contrasena = ?',
    );
    expect(actualizacion.sql).toContain('debe_cambiar_contrasena = 0');
    expect(String(actualizacion.valores[0])).toMatch(/^scrypt\$/);
    expect(actualizacion.valores[0]).not.toBe(HASH);
    expect(
      bd.con('DELETE FROM pai_sesiones WHERE usuario_id = ? AND id <> ?')[0]
        .valores,
    ).toEqual([3, 10]);
    expect(
      bd.con('UPDATE pai_intentos_acceso SET exito = ?')[0].valores,
    ).toEqual([INTENTO_CORRECTO, 77]);
    expect(registros(bd)).toEqual([
      {
        accion: 'cambiar_contrasena',
        detalle: { resultado: 'correcto', temporal: true },
      },
    ]);
    expect(JSON.stringify(bd.con('INSERT INTO pai_registro'))).not.toContain(
      NUEVA,
    );
  });
});

describe('ServicioSesionesPai: otras operaciones', () => {
  it('cerrar y cerrarSesionesDeUsuario borran filas (dentro de la transacción si se pasa)', async () => {
    const bd = new BdFalsa(() => undefined);
    const sesiones = servicio(bd);
    await sesiones.cerrar(sesionPrueba());
    await sesiones.cerrarSesionesDeUsuario(null, 3);
    const enTransaccion: unknown[][] = [];
    await sesiones.cerrarSesionesDeUsuario(
      {
        query: async (_sql: string, valores?: readonly unknown[]) => {
          enTransaccion.push([...(valores ?? [])]);
          return [{ insertId: 0, affectedRows: 0 }, undefined];
        },
      } as Pick<Conexion, 'query'>,
      4,
    );
    expect(bd.consultas.map((c) => [c.sql, c.valores])).toEqual([
      ['DELETE FROM pai_sesiones WHERE id = ?', [10]],
      ['DELETE FROM pai_sesiones WHERE usuario_id = ?', [3]],
    ]);
    expect(enTransaccion).toEqual([[4]]);
  });

  it('aSesionPai: id del usuario, fecha ISO y sin el id de la sesión', () => {
    const bd = new BdFalsa(() => undefined);
    expect(servicio(bd).aSesionPai(sesionPrueba())).toEqual({
      id: 3,
      usuario: 'responsable1',
      nombre: 'Responsable Uno',
      rol: 'responsable',
      csrf: CSRF,
      expira: '2026-10-11T18:00:00.000Z',
      debeCambiarContrasena: false,
    });
  });

  it('cookieSegura sigue la configuración del repositorio', () => {
    const bd = new BdFalsa(() => undefined) as unknown as BaseDatosRepositorio;
    expect(new ServicioSesionesPai(bd, CONFIG).cookieSegura).toBe(false);
    expect(
      new ServicioSesionesPai(
        bd,
        cargarConfiguracionRepositorio({ REPOSITORIO_COOKIE_SEGURA: 'true' }),
      ).cookieSegura,
    ).toBe(true);
  });
});

// ── Controlador ───────────────────────────────────────────────────────────

interface Cookie {
  nombre: string;
  valor?: string;
  opciones: Record<string, unknown>;
  borrar: boolean;
}

function respuestaFalsa(): { res: Response; cookies: Cookie[] } {
  const cookies: Cookie[] = [];
  const res = {
    cookie: (
      nombre: string,
      valor: string,
      opciones: Record<string, unknown>,
    ) => {
      cookies.push({ nombre, valor, opciones, borrar: false });
    },
    clearCookie: (nombre: string, opciones: Record<string, unknown>) => {
      cookies.push({ nombre, opciones, borrar: true });
    },
  } as unknown as Response;
  return { res, cookies };
}

function peticionJson(
  metodo: string,
  cabeceras: Record<string, string> = {},
): Request {
  const req = peticion(metodo, cabeceras) as unknown as Record<string, unknown>;
  req.is = (tipo: string) =>
    tipo === 'application/json' &&
    String(
      (req.headers as Record<string, string>)['content-type'] ?? '',
    ).startsWith('application/json');
  req.ip = '10.0.0.9';
  return req as unknown as Request;
}

describe('PaiSesionController', () => {
  const sesionInicio = {
    id: 3,
    usuario: 'responsable1',
    nombre: 'Responsable Uno',
    rol: 'responsable' as const,
    csrf: CSRF,
    expira: '2026-10-11T18:00:00.000Z',
    debeCambiarContrasena: false,
  };

  function controlador(sesion: SesionValidaPai | null = null) {
    const llamadas: unknown[][] = [];
    const sesiones = {
      cookieSegura: true,
      validar: async (token: string | undefined) =>
        token === 't'.repeat(43) ? sesion : null,
      iniciar: async (cuerpo: unknown, contextoAcceso: unknown) => {
        llamadas.push(['iniciar', cuerpo, contextoAcceso]);
        return {
          sesion: sesionInicio,
          token: 'n'.repeat(43),
          duracionMs: 1000,
        };
      },
      cerrar: async (s: SesionValidaPai) => {
        llamadas.push(['cerrar', s.id]);
      },
    } as unknown as ServicioSesionesPai;
    return { ctrl: new PaiSesionController(sesiones), llamadas };
  }

  it('POST: rechaza otro sitio (403) y cuerpos que no son JSON (400) sin iniciar', async () => {
    const { ctrl, llamadas } = controlador();
    const { res } = respuestaFalsa();
    const otroSitio = await errorDe(
      ctrl.iniciar(
        peticionJson('POST', {
          'content-type': 'application/json',
          'sec-fetch-site': 'cross-site',
        }),
        res,
        {},
      ),
    );
    expect(otroSitio.getStatus()).toBe(403);
    const formulario = await errorDe(
      ctrl.iniciar(
        peticionJson('POST', {
          'content-type': 'application/x-www-form-urlencoded',
        }),
        res,
        {},
      ),
    );
    expect(formulario.getStatus()).toBe(400);
    expect(llamadas).toEqual([]);
  });

  it('POST: pone la cookie pai_sesion HttpOnly, SameSite=Strict, Secure y Path=/api/pai', async () => {
    const { ctrl, llamadas } = controlador();
    const { res, cookies } = respuestaFalsa();
    const respuesta = await ctrl.iniciar(
      peticionJson('POST', {
        'content-type': 'application/json',
        'user-agent': 'Agente',
        cookie: `${COOKIE_SESION_PAI}=${'v'.repeat(43)}`,
      }),
      res,
      { usuario: 'responsable1', contrasena: CONTRASENA },
    );
    expect(respuesta).toBe(sesionInicio);
    expect(llamadas).toEqual([
      [
        'iniciar',
        { usuario: 'responsable1', contrasena: CONTRASENA },
        { ip: '10.0.0.9', agente: 'Agente', tokenAnterior: 'v'.repeat(43) },
      ],
    ]);
    expect(cookies).toEqual([
      {
        nombre: COOKIE_SESION_PAI,
        valor: 'n'.repeat(43),
        borrar: false,
        opciones: {
          httpOnly: true,
          sameSite: 'strict',
          secure: true,
          path: RUTA_COOKIE_PAI,
          maxAge: 1000,
        },
      },
    ]);
  });

  it('DELETE sin sesión: 204 y borra la cookie', async () => {
    const { ctrl, llamadas } = controlador(null);
    const { res, cookies } = respuestaFalsa();
    await ctrl.cerrar(peticionJson('DELETE'), res);
    expect(llamadas).toEqual([]);
    expect(cookies).toEqual([
      {
        nombre: COOKIE_SESION_PAI,
        borrar: true,
        opciones: {
          httpOnly: true,
          sameSite: 'strict',
          secure: true,
          path: RUTA_COOKIE_PAI,
        },
      },
    ]);
  });

  it('DELETE con sesión: exige CSRF y funciona con una contraseña temporal', async () => {
    const { ctrl, llamadas } = controlador(
      sesionPrueba({ debeCambiarContrasena: true }),
    );
    const { res, cookies } = respuestaFalsa();
    const sinCsrf = await errorDe(
      ctrl.cerrar(peticionJson('DELETE', { cookie: COOKIE }), res),
    );
    expect(sinCsrf.getStatus()).toBe(403);
    expect(cookies).toEqual([]);
    await ctrl.cerrar(
      peticionJson('DELETE', { cookie: COOKIE, 'x-csrf-token': CSRF }),
      res,
    );
    expect(llamadas).toEqual([['cerrar', 10]]);
    expect(cookies).toHaveLength(1);
  });
});
