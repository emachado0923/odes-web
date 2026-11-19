import type { AddressInfo } from 'node:net';
import type { RowDataPacket } from 'mysql2/promise';
import { Client as ClientePg } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  COOKIE_SESION_PAI,
  MENSAJES_ERROR_PAI,
  RUTA_API_PAI,
  type SesionPai,
  type UsuarioPai,
} from '../src/pai/api-pai.js';
import {
  desactivarUsuarioCli,
  guardarUsuarioCli,
  sqlCrearUsuarioPai,
  sqlDesactivarUsuarioPai,
} from '../src/pai/cli/crear-usuario-comun.js';
import { BaseDatosRepositorio } from '../src/repositorio/bd/base-datos.js';
import { hashContrasena } from '../src/repositorio/dominio/contrasenas.js';
import {
  MAX_FALLOS_IP,
  MAX_FALLOS_USUARIO,
  MENSAJE_CREDENCIALES,
} from '../src/repositorio/servicios/sesiones.js';
import { crearDistTemporal, type DistTemporal } from './dist-temporal.js';
import {
  asignarPai,
  CONTRASENA_PRUEBA_PAI,
  crearFixturePai,
  crearUsuarioPai,
  type FixturePai,
  iniciarSesionPai,
  type SesionPaiPrueba,
} from './pai-apoyo.js';
import {
  type AppPrueba,
  avisarSiNoHayBd,
  type BasePrueba,
  crearAppRepositorio,
  crearBasePrueba,
  ES_POSTGRES,
  HAY_BD,
  MOTOR_PRUEBAS,
  URL_POSTGRES_PRUEBAS,
} from './repositorio-apoyo.js';

/**
 * Autenticación del PAI contra una base DESECHABLE (MySQL o Postgres, ver
 * repositorio-apoyo.ts): inicio de sesión por rol, cookie, 401/403/429,
 * CSRF y mismo sitio en toda la API, contraseña temporal, administración de
 * usuarios (crear, editar, desactivar, restablecer) y asignaciones, la CLI
 * pai:crear-usuario y su --solo-sql (en Postgres).
 *
 * Las rutas de otras partes (tablero, reportes, evidencias, administración
 * del bimestre…) se usan solo para comprobar que la guardia las cierra antes
 * de llegar al manejador (401/403), así que no dependen de su implementación.
 */

avisarSiNoHayBd('pai-sesion.e2e-spec.ts');

const API = RUTA_API_PAI;
const NUEVA = 'contraseña-nueva-del-pai-2026';
const TEMPORAL = 'temporal-del-pai-2026';
const SILENCIO = {
  log: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete';

/** Petición con la cookie de la sesión. */
function con(r: request.Test, s: SesionPaiPrueba): request.Test {
  return r.set('Cookie', s.cookie);
}

/** Petición con la cookie y el token CSRF (una escritura legítima). */
function escritura(r: request.Test, s: SesionPaiPrueba): request.Test {
  return r.set('Cookie', s.cookie).set('X-CSRF-Token', s.csrf);
}

describe.skipIf(!HAY_BD)(
  `PAI con ${MOTOR_PRUEBAS}: sesión, guardias y usuarios (e2e)`,
  () => {
    let base: BasePrueba;
    let dist: DistTemporal;
    let prueba: AppPrueba;
    let datos: FixturePai;
    let idAdmin: number;
    let idResp: number;
    let admin: SesionPaiPrueba;
    let resp: SesionPaiPrueba;

    const agente = () => request(prueba.servidor);
    const contar = async (
      sql: string,
      valores: unknown[] = [],
    ): Promise<number> => {
      const [filas] = await base.admin.query<RowDataPacket[]>(sql, valores);
      return Number(Object.values(filas[0])[0]);
    };
    const filas = async (
      sql: string,
      valores: unknown[] = [],
    ): Promise<RowDataPacket[]> =>
      (await base.admin.query<RowDataPacket[]>(sql, valores))[0];
    const ultimoRegistro = async (
      accion: string,
    ): Promise<Record<string, unknown>> => {
      const [fila] = await filas(
        'SELECT usuario, usuario_id, detalle FROM pai_registro WHERE accion = ? ORDER BY id DESC LIMIT 1',
        [accion],
      );
      return {
        ...fila,
        detalle: fila?.detalle ? JSON.parse(String(fila.detalle)) : null,
      };
    };

    beforeAll(async () => {
      base = await crearBasePrueba('pai');
      dist = await crearDistTemporal();
      datos = await crearFixturePai(base, { bimestreAbierto: 4 });
      idAdmin = await crearUsuarioPai(base, {
        usuario: 'planeacion',
        rol: 'administrador',
        nombre: 'Oficina de Planeación',
      });
      idResp = await crearUsuarioPai(base, {
        usuario: 'responsable1',
        rol: 'responsable',
        nombre: 'Responsable Uno',
      });
      prueba = await crearAppRepositorio(base.config, dist.directorio);
      admin = await iniciarSesionPai(prueba.servidor, 'planeacion');
      resp = await iniciarSesionPai(prueba.servidor, 'responsable1');
    });

    beforeEach(async () => {
      // Cada prueba empieza sin intentos fallidos acumulados (límite por IP).
      await base.admin.query('DELETE FROM pai_intentos_acceso');
    });

    afterAll(async () => {
      await prueba?.cerrar();
      await base?.borrar();
      await dist?.limpiar();
    });

    describe('inicio de sesión', () => {
      it('cookie HttpOnly, SameSite=Strict y Path=/api/pai; SesionPai por rol', async () => {
        for (const [usuario, rol, nombre, id] of [
          [
            'planeacion',
            'administrador',
            'Oficina de Planeación',
            () => idAdmin,
          ],
          ['responsable1', 'responsable', 'Responsable Uno', () => idResp],
        ] as const) {
          const res = await agente()
            .post(`${API}/sesion`)
            .send({
              usuario: usuario.toUpperCase(),
              contrasena: CONTRASENA_PRUEBA_PAI,
            })
            .expect(200);
          const cookie = ([] as string[]).concat(res.headers['set-cookie'])[0];
          expect(cookie).toMatch(
            new RegExp(`^${COOKIE_SESION_PAI}=[A-Za-z0-9_-]{43};`),
          );
          expect(cookie).toMatch(/Path=\/api\/pai(;|$)/);
          expect(cookie).toMatch(/HttpOnly/);
          expect(cookie).toMatch(/SameSite=Strict/);
          expect(cookie).not.toMatch(/Secure/); // NODE_ENV de pruebas
          expect(res.headers['cache-control']).toBe('no-store');
          const sesion = res.body as SesionPai;
          expect(sesion).toMatchObject({
            id: id(),
            usuario,
            nombre,
            rol,
            debeCambiarContrasena: false,
          });
          expect(sesion.csrf).toMatch(/^[A-Za-z0-9_-]{43}$/);
          expect(Date.parse(sesion.expira)).toBeGreaterThan(Date.now());
          const actual = await agente()
            .get(`${API}/sesion`)
            .set('Cookie', cookie.split(';')[0])
            .expect(200);
          expect(actual.body).toEqual(sesion);
          expect(actual.headers['cache-control']).toBe('no-store');
        }
        // En la base, el token solo como sha256.
        expect(
          await contar(
            'SELECT COUNT(*) FROM pai_sesiones WHERE LENGTH(token_hash) = 64',
          ),
        ).toBe(await contar('SELECT COUNT(*) FROM pai_sesiones'));
        expect((await ultimoRegistro('iniciar_sesion')).detalle).toEqual({
          resultado: 'correcto',
        });
      });

      it('contraseña equivocada, usuario inexistente o cuenta inactiva: el mismo 401', async () => {
        await crearUsuarioPai(base, {
          usuario: 'inactivo',
          rol: 'responsable',
          activo: false,
        });
        const intentos = [
          { usuario: 'responsable1', contrasena: 'no-es-esta-clave' },
          { usuario: 'nadie', contrasena: CONTRASENA_PRUEBA_PAI },
          { usuario: 'inactivo', contrasena: CONTRASENA_PRUEBA_PAI },
        ];
        const cuerpos = [];
        for (const credenciales of intentos) {
          const res = await agente()
            .post(`${API}/sesion`)
            .send(credenciales)
            .expect(401);
          expect(res.headers['set-cookie']).toBeUndefined();
          cuerpos.push(res.body);
        }
        expect(cuerpos).toEqual(
          Array.from({ length: 3 }, () => ({
            codigo: 'no_autenticado',
            mensaje: MENSAJE_CREDENCIALES,
          })),
        );
        expect((await ultimoRegistro('iniciar_sesion')).detalle).toEqual({
          resultado: 'fallido',
          motivo: 'inactivo',
        });
        expect(
          await contar(
            "SELECT COUNT(*) FROM pai_registro WHERE usuario = 'nadie'",
          ),
        ).toBe(0);

        const vacio = await agente()
          .post(`${API}/sesion`)
          .send({ usuario: 'responsable1' })
          .expect(400);
        expect(vacio.body.campos).toEqual({
          contrasena: 'Escriba la contraseña.',
        });
        await agente()
          .post(`${API}/sesion`)
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(`usuario=responsable1&contrasena=${CONTRASENA_PRUEBA_PAI}`)
          .expect(400);
        for (const [cabecera, valor] of [
          ['Origin', 'https://otro-sitio.example'],
          ['Sec-Fetch-Site', 'cross-site'],
        ]) {
          const res = await agente()
            .post(`${API}/sesion`)
            .set(cabecera, valor)
            .send({
              usuario: 'responsable1',
              contrasena: CONTRASENA_PRUEBA_PAI,
            })
            .expect(403);
          expect(res.body.codigo).toBe('prohibido');
        }
      });

      it('un usuario con tildes o emoji recibe 401 (no 500) y cuenta para el límite de la IP', async () => {
        for (const usuario of [
          'josé',
          'JOSÉ',
          'andrés',
          '😀',
          'ñ'.repeat(64),
        ]) {
          const res = await agente()
            .post(`${API}/sesion`)
            .send({ usuario, contrasena: 'no-es-esta-clave' })
            .expect(401);
          expect(res.body.mensaje).toBe(MENSAJE_CREDENCIALES);
        }
        expect(
          await contar(
            "SELECT COUNT(*) FROM pai_intentos_acceso WHERE exito = 0 AND usuario LIKE '#%'",
          ),
        ).toBe(5);
      });

      it('sin cookie o con una inventada: 401 en la sesión y en el resto de la API', async () => {
        const rutas: [Metodo, string][] = [
          ['get', '/sesion'],
          ['put', '/sesion/contrasena'],
          ['get', '/vigencia'],
          ['get', '/tablero'],
          ['get', `/indicadores/${datos.indicadores.th01}`],
          ['put', `/indicadores/${datos.indicadores.th01}/bimestres/4`],
          ['get', '/evidencias/1'],
          ['get', '/admin/usuarios'],
          ['get', '/admin/registro'],
        ];
        for (const cookie of [
          undefined,
          `${COOKIE_SESION_PAI}=inventada`,
          `${COOKIE_SESION_PAI}=${'a'.repeat(43)}`,
          // La cookie del repositorio no sirve en el PAI.
          `repositorio_sesion=${resp.cookie.split('=')[1]}`,
        ]) {
          for (const [metodo, ruta] of rutas) {
            let peticion = agente()[metodo](`${API}${ruta}`);
            if (cookie) peticion = peticion.set('Cookie', cookie);
            const res = await peticion.send({});
            expect(res.status, `${metodo} ${ruta}`).toBe(401);
            expect(res.body.codigo).toBe('no_autenticado');
            expect(res.headers['cache-control']).toBe('no-store');
          }
        }
        // Y la del PAI no abre la administración del repositorio.
        await agente()
          .get('/api/repositorio/admin/sesion')
          .set('Cookie', `repositorio_sesion=${resp.cookie.split('=')[1]}`)
          .expect(401);
      });

      it('rota el token al iniciar sesión de nuevo con la cookie anterior', async () => {
        const primera = await iniciarSesionPai(prueba.servidor, 'responsable1');
        const res = await agente()
          .post(`${API}/sesion`)
          .set('Cookie', primera.cookie)
          .send({ usuario: 'responsable1', contrasena: CONTRASENA_PRUEBA_PAI })
          .expect(200);
        await con(agente().get(`${API}/sesion`), primera).expect(401);
        const nueva = ([] as string[])
          .concat(res.headers['set-cookie'])[0]
          .split(';')[0];
        expect(nueva).not.toBe(primera.cookie);
        await agente().get(`${API}/sesion`).set('Cookie', nueva).expect(200);
      });

      it('vence por inactividad y por duración máxima', async () => {
        const inactiva = await iniciarSesionPai(
          prueba.servidor,
          'responsable1',
        );
        const vieja = await iniciarSesionPai(prueba.servidor, 'responsable1');
        await base.admin.query(
          'UPDATE pai_sesiones SET ultimo_uso = ? WHERE csrf = ?',
          [new Date(Date.now() - 31 * 60_000), inactiva.csrf],
        );
        await base.admin.query(
          'UPDATE pai_sesiones SET expira_en = ? WHERE csrf = ?',
          [new Date(Date.now() - 1000), vieja.csrf],
        );
        await con(agente().get(`${API}/sesion`), inactiva).expect(401);
        await con(agente().get(`${API}/tablero`), vieja).expect(401);
        expect(
          await contar(
            'SELECT COUNT(*) FROM pai_sesiones WHERE csrf IN (?, ?)',
            [inactiva.csrf, vieja.csrf],
          ),
        ).toBe(0);
        const viva = await con(agente().get(`${API}/sesion`), resp).expect(200);
        expect(viva.body.csrf).toBe(resp.csrf);
      });

      it('cerrar sesión exige CSRF, borra la sesión y la cookie (Path=/api/pai)', async () => {
        const otra = await iniciarSesionPai(prueba.servidor, 'responsable1');
        await con(agente().delete(`${API}/sesion`), otra).expect(403);
        await escritura(agente().delete(`${API}/sesion`), otra)
          .set('Origin', 'https://otro.example')
          .expect(403);
        const res = await escritura(
          agente().delete(`${API}/sesion`),
          otra,
        ).expect(204);
        const cookie = ([] as string[]).concat(res.headers['set-cookie'])[0];
        expect(cookie).toMatch(
          new RegExp(`^${COOKIE_SESION_PAI}=;.*Expires=Thu, 01 Jan 1970`),
        );
        expect(cookie).toMatch(/Path=\/api\/pai/);
        await con(agente().get(`${API}/sesion`), otra).expect(401);
        expect(
          await contar('SELECT COUNT(*) FROM pai_sesiones WHERE csrf = ?', [
            otra.csrf,
          ]),
        ).toBe(0);
        // Sin sesión, cerrar responde 204 igual.
        await agente().delete(`${API}/sesion`).expect(204);
      });

      it('bloquea al usuario tras 5 fallos (aunque luego acierte) y a la IP tras 20', async () => {
        await crearUsuarioPai(base, { usuario: 'victima', rol: 'responsable' });
        for (let i = 0; i < MAX_FALLOS_USUARIO; i++) {
          await agente()
            .post(`${API}/sesion`)
            .send({ usuario: 'victima', contrasena: `mala-${i}-xxxxxx` })
            .expect(401);
        }
        const bloqueo = await agente()
          .post(`${API}/sesion`)
          .send({ usuario: 'victima', contrasena: CONTRASENA_PRUEBA_PAI })
          .expect(429);
        expect(bloqueo.body.codigo).toBe('demasiados_intentos');
        expect(bloqueo.body.mensaje).toMatch(/Espere 15 minutos/);
        expect(Number(bloqueo.headers['retry-after'])).toBeGreaterThan(800);
        expect(bloqueo.headers['cache-control']).toBe('no-store');
        expect(
          await contar(
            "SELECT COUNT(*) FROM pai_registro WHERE usuario = 'victima' AND accion = 'iniciar_sesion' AND detalle LIKE '%bloqueado%'",
          ),
        ).toBe(1);

        const previos = await contar(
          'SELECT COUNT(*) FROM pai_intentos_acceso WHERE exito = 0',
        );
        for (let i = previos; i < MAX_FALLOS_IP; i++) {
          await agente()
            .post(`${API}/sesion`)
            .send({ usuario: `otro${i}`, contrasena: 'no-existe-este' })
            .expect(401);
        }
        await agente()
          .post(`${API}/sesion`)
          .send({ usuario: 'responsable1', contrasena: CONTRASENA_PRUEBA_PAI })
          .expect(429);
        // La sesión ya abierta no se ve afectada.
        await con(agente().get(`${API}/sesion`), resp).expect(200);
        await base.admin.query('DELETE FROM pai_intentos_acceso');
        await agente()
          .post(`${API}/sesion`)
          .send({ usuario: 'victima', contrasena: CONTRASENA_PRUEBA_PAI })
          .expect(200);
      });

      it('una ráfaga de intentos simultáneos no se salta el límite (como mucho 5 verificaciones)', async () => {
        await crearUsuarioPai(base, { usuario: 'rafaga', rol: 'responsable' });
        if (!prueba.servidor.listening) {
          await new Promise<void>((listo) =>
            prueba.servidor.listen(0, '127.0.0.1', listo),
          );
        }
        const { port } = prueba.servidor.address() as AddressInfo;
        const estados = await Promise.all(
          Array.from({ length: 30 }, async (_, i) => {
            const res = await fetch(`http://127.0.0.1:${port}${API}/sesion`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                usuario: 'rafaga',
                contrasena: `equivocada-${i}-xxxxxx`,
              }),
            });
            await res.arrayBuffer();
            return res.status;
          }),
        );
        const verificados = estados.filter((estado) => estado === 401).length;
        expect(verificados).toBeLessThanOrEqual(MAX_FALLOS_USUARIO);
        expect(
          estados.filter((estado) => estado !== 401 && estado !== 429),
        ).toEqual([]);
        expect(estados.filter((estado) => estado === 429)).toHaveLength(
          30 - verificados,
        );
        expect(
          await contar(
            "SELECT COUNT(*) FROM pai_intentos_acceso WHERE usuario = 'rafaga' AND exito = 0",
          ),
        ).toBe(verificados);
        expect(
          await contar(
            "SELECT COUNT(*) FROM pai_intentos_acceso WHERE usuario = 'rafaga' AND exito NOT IN (0, 1)",
          ),
        ).toBe(0);
        expect(
          await contar(
            "SELECT COUNT(*) FROM pai_registro WHERE usuario = 'rafaga' AND detalle LIKE '%fallido%'",
          ),
        ).toBe(verificados);
        const bloqueado = verificados === MAX_FALLOS_USUARIO;
        expect(
          await contar(
            "SELECT COUNT(*) FROM pai_registro WHERE usuario = 'rafaga' AND detalle LIKE '%bloqueado%'",
          ),
        ).toBe(bloqueado ? 1 : 0);
        await agente()
          .post(`${API}/sesion`)
          .send({ usuario: 'rafaga', contrasena: CONTRASENA_PRUEBA_PAI })
          .expect(bloqueado ? 429 : 200);
      });

      it('los fallos desde un mismo /64 de IPv6 comparten el límite de la IP', async () => {
        const conProxy = await crearAppRepositorio(
          base.config,
          dist.directorio,
          { TRUST_PROXY: 'loopback' },
        );
        try {
          const desde = (ip: string) =>
            request(conProxy.servidor)
              .post(`${API}/sesion`)
              .set('X-Forwarded-For', ip);
          for (let i = 1; i <= MAX_FALLOS_IP; i++) {
            await desde(`2001:db8:9:9::${i.toString(16)}`)
              .send({ usuario: `nadie${i}`, contrasena: 'no-es-esta-clave' })
              .expect(401);
          }
          await desde('2001:db8:9:9:abcd::1')
            .send({
              usuario: 'responsable1',
              contrasena: CONTRASENA_PRUEBA_PAI,
            })
            .expect(429);
          await desde('2001:db8:9:a::1')
            .send({
              usuario: 'responsable1',
              contrasena: CONTRASENA_PRUEBA_PAI,
            })
            .expect(200);
          expect(
            await contar(
              "SELECT COUNT(*) FROM pai_sesiones WHERE ip = '2001:db8:9:a::1'",
            ),
          ).toBe(1);
          expect(
            await contar(
              "SELECT COUNT(*) FROM pai_intentos_acceso WHERE ip = '2001:db8:9:9::/64' AND exito = 0",
            ),
          ).toBe(MAX_FALLOS_IP);
        } finally {
          await conProxy.cerrar();
        }
      });
    });

    describe('CSRF, mismo sitio y rol en toda la API', () => {
      it('una escritura sin X-CSRF-Token válido o de otro sitio: 403 antes de llegar al manejador', async () => {
        const escrituras: [SesionPaiPrueba, Metodo, string, object][] = [
          [
            admin,
            'post',
            '/admin/usuarios',
            {
              usuario: 'csrf1',
              nombre: 'X',
              rol: 'responsable',
              contrasenaTemporal: TEMPORAL,
            },
          ],
          [
            admin,
            'patch',
            `/admin/usuarios/${idResp}`,
            { nombre: 'Cambiado por CSRF' },
          ],
          [
            admin,
            'put',
            `/admin/usuarios/${idResp}/asignaciones`,
            { procesos: [datos.procesoTh], indicadores: [] },
          ],
          [
            admin,
            'put',
            '/admin/vigencia',
            { bimestreAbierto: null, abiertoHasta: null },
          ],
          [admin, 'post', '/admin/autorizaciones', {}],
          [admin, 'delete', '/admin/autorizaciones/1', {}],
          [
            resp,
            'put',
            `/indicadores/${datos.indicadores.th01}/bimestres/4`,
            { avance: 1 },
          ],
          [
            resp,
            'post',
            `/indicadores/${datos.indicadores.th01}/bimestres/4/evidencias/subidas`,
            {},
          ],
          [resp, 'delete', '/evidencias/1', {}],
          [
            resp,
            'put',
            '/sesion/contrasena',
            { actual: CONTRASENA_PRUEBA_PAI, nueva: NUEVA },
          ],
        ];
        for (const [sesion, metodo, ruta, cuerpo] of escrituras) {
          const variantes: [string, (r: request.Test) => request.Test][] = [
            ['sin CSRF', (r) => r.set('Cookie', sesion.cookie)],
            [
              'CSRF equivocado',
              (r) =>
                r
                  .set('Cookie', sesion.cookie)
                  .set('X-CSRF-Token', `${sesion.csrf}x`),
            ],
            [
              'CSRF de otra sesión',
              (r) =>
                r
                  .set('Cookie', sesion.cookie)
                  .set('X-CSRF-Token', (sesion === admin ? resp : admin).csrf),
            ],
            [
              'Origin de otro sitio',
              (r) =>
                escritura(r, sesion).set(
                  'Origin',
                  'https://otro-sitio.example',
                ),
            ],
            [
              'Sec-Fetch-Site cross-site',
              (r) => escritura(r, sesion).set('Sec-Fetch-Site', 'cross-site'),
            ],
          ];
          for (const [caso, preparar] of variantes) {
            const res = await preparar(agente()[metodo](`${API}${ruta}`)).send(
              cuerpo,
            );
            expect(res.status, `${metodo} ${ruta} (${caso})`).toBe(403);
            expect(res.body.codigo).toBe('prohibido');
          }
        }
        expect(
          await contar(
            "SELECT COUNT(*) FROM pai_usuarios WHERE usuario = 'csrf1'",
          ),
        ).toBe(0);
        expect(
          await contar('SELECT COUNT(*) FROM pai_usuarios WHERE nombre = ?', [
            'Cambiado por CSRF',
          ]),
        ).toBe(0);
        expect(
          await contar(
            'SELECT COUNT(*) FROM pai_asignaciones WHERE usuario_id = ?',
            [idResp],
          ),
        ).toBe(0);
        // Desde el mismo sitio (como el navegador) sí pasa.
        await escritura(agente().get(`${API}/admin/usuarios`), admin)
          .set('Sec-Fetch-Site', 'same-origin')
          .expect(200);
      });

      it('el responsable recibe 403 en toda la administración; el administrador entra', async () => {
        const rutas: [Metodo, string][] = [
          ['get', '/admin/usuarios'],
          ['post', '/admin/usuarios'],
          ['patch', `/admin/usuarios/${idResp}`],
          ['put', `/admin/usuarios/${idResp}/asignaciones`],
          ['put', '/admin/vigencia'],
          ['get', '/admin/autorizaciones'],
          ['post', '/admin/autorizaciones'],
          ['delete', '/admin/autorizaciones/1'],
          ['get', '/admin/registro'],
          ['get', '/admin/exportar.csv'],
        ];
        for (const [metodo, ruta] of rutas) {
          const res = await escritura(
            agente()[metodo](`${API}${ruta}`),
            resp,
          ).send({ procesos: [1], indicadores: [] });
          expect(res.status, `${metodo} ${ruta}`).toBe(403);
          expect(res.body).toEqual({
            codigo: 'prohibido',
            mensaje: expect.stringMatching(/administrador/) as unknown,
          });
        }
        expect(
          await contar(
            'SELECT COUNT(*) FROM pai_asignaciones WHERE usuario_id = ?',
            [idResp],
          ),
        ).toBe(0);
        await con(agente().get(`${API}/admin/usuarios`), admin).expect(200);
      });
    });

    describe('contraseña temporal', () => {
      it('un usuario nuevo solo puede usar /sesion hasta cambiar su contraseña', async () => {
        const creado = await escritura(
          agente().post(`${API}/admin/usuarios`),
          admin,
        )
          .send({
            usuario: 'Nuevo.Uno',
            nombre: 'Nuevo Uno',
            rol: 'responsable',
            contrasenaTemporal: TEMPORAL,
          })
          .expect(201);
        expect(creado.body).toMatchObject({
          usuario: 'nuevo.uno',
          rol: 'responsable',
          activo: true,
          debeCambiarContrasena: true,
          ultimoAcceso: null,
          asignaciones: { procesos: [], indicadores: [] },
        });
        const nuevo = await iniciarSesionPai(
          prueba.servidor,
          'nuevo.uno',
          TEMPORAL,
        );
        const otra = await iniciarSesionPai(
          prueba.servidor,
          'nuevo.uno',
          TEMPORAL,
        );
        expect(nuevo.sesion.debeCambiarContrasena).toBe(true);
        expect(
          (await con(agente().get(`${API}/sesion`), nuevo).expect(200)).body
            .debeCambiarContrasena,
        ).toBe(true);

        const cerradas: [Metodo, string][] = [
          ['get', '/vigencia'],
          ['get', '/tablero'],
          ['get', '/indicadores/SAF-TH-01'],
          ['put', `/indicadores/${datos.indicadores.th01}/bimestres/4`],
          [
            'post',
            `/indicadores/${datos.indicadores.th01}/bimestres/4/evidencias/subidas`,
          ],
          ['get', '/evidencias/1'],
          ['get', '/admin/usuarios'],
        ];
        for (const [metodo, ruta] of cerradas) {
          const res = await escritura(
            agente()[metodo](`${API}${ruta}`),
            nuevo,
          ).send({ avance: 1 });
          expect(res.status, `${metodo} ${ruta}`).toBe(403);
          expect(res.body).toEqual({
            codigo: 'cambio_contrasena_requerido',
            mensaje: MENSAJES_ERROR_PAI.cambio_contrasena_requerido,
          });
        }

        const cambiar = (cuerpo: object) =>
          escritura(agente().put(`${API}/sesion/contrasena`), nuevo).send(
            cuerpo,
          );
        await con(agente().put(`${API}/sesion/contrasena`), nuevo)
          .send({ actual: TEMPORAL, nueva: NUEVA })
          .expect(403);
        const mala = await cambiar({
          actual: 'no-es-la-temporal',
          nueva: NUEVA,
        }).expect(400);
        expect(mala.body.campos).toEqual({
          actual: 'La contraseña actual no es correcta.',
        });
        const corta = await cambiar({
          actual: TEMPORAL,
          nueva: 'corta',
        }).expect(400);
        expect(corta.body.campos.nueva).toMatch(/al menos 12/);
        const igual = await cambiar({
          actual: TEMPORAL,
          nueva: TEMPORAL,
        }).expect(400);
        expect(igual.body.campos.nueva).toMatch(/distinta/);
        const hecha = await cambiar({ actual: TEMPORAL, nueva: NUEVA }).expect(
          200,
        );
        expect(hecha.body).toMatchObject({
          usuario: 'nuevo.uno',
          debeCambiarContrasena: false,
          csrf: nuevo.csrf,
        });
        expect(hecha.headers['cache-control']).toBe('no-store');

        // La sesión actual sigue y ya no está cerrada; la otra se cerró.
        expect(
          (await con(agente().get(`${API}/sesion`), nuevo).expect(200)).body
            .debeCambiarContrasena,
        ).toBe(false);
        const tablero = await con(agente().get(`${API}/tablero`), nuevo);
        expect(tablero.body?.codigo).not.toBe('cambio_contrasena_requerido');
        expect(tablero.status).not.toBe(403);
        await con(agente().get(`${API}/sesion`), otra).expect(401);
        // La contraseña temporal ya no sirve; la nueva sí.
        await agente()
          .post(`${API}/sesion`)
          .send({ usuario: 'nuevo.uno', contrasena: TEMPORAL })
          .expect(401);
        await iniciarSesionPai(prueba.servidor, 'nuevo.uno', NUEVA);
        const registro = await ultimoRegistro('cambiar_contrasena');
        expect(registro).toMatchObject({
          usuario: 'nuevo.uno',
          detalle: { resultado: 'correcto', temporal: true },
        });
      });

      it('con contraseña temporal se puede cerrar la sesión; el administrador también queda cerrado', async () => {
        await crearUsuarioPai(base, {
          usuario: 'admin.temporal',
          rol: 'administrador',
          debeCambiarContrasena: true,
        });
        const sesion = await iniciarSesionPai(
          prueba.servidor,
          'admin.temporal',
        );
        const res = await con(
          agente().get(`${API}/admin/usuarios`),
          sesion,
        ).expect(403);
        expect(res.body.codigo).toBe('cambio_contrasena_requerido');
        await escritura(agente().delete(`${API}/sesion`), sesion).expect(204);
        await con(agente().get(`${API}/sesion`), sesion).expect(401);
      });

      it('el administrador restablece la contraseña: se cierran sus sesiones y debe cambiarla', async () => {
        const id = await crearUsuarioPai(base, {
          usuario: 'olvidadizo',
          rol: 'responsable',
        });
        const sesion = await iniciarSesionPai(prueba.servidor, 'olvidadizo');
        const res = await escritura(
          agente().patch(`${API}/admin/usuarios/${id}`),
          admin,
        )
          .send({ contrasenaTemporal: TEMPORAL })
          .expect(200);
        expect(res.body).toMatchObject({ id, debeCambiarContrasena: true });
        await con(agente().get(`${API}/sesion`), sesion).expect(401);
        await agente()
          .post(`${API}/sesion`)
          .send({ usuario: 'olvidadizo', contrasena: CONTRASENA_PRUEBA_PAI })
          .expect(401);
        const nueva = await iniciarSesionPai(
          prueba.servidor,
          'olvidadizo',
          TEMPORAL,
        );
        expect(nueva.sesion.debeCambiarContrasena).toBe(true);
        const registro = await ultimoRegistro('editar_usuario');
        expect(registro).toMatchObject({
          usuario: 'planeacion',
          usuario_id: idAdmin,
          detalle: {
            id,
            usuario: 'olvidadizo',
            despues: {
              debeCambiarContrasena: true,
              contrasenaTemporal: 'restablecida',
            },
            sesionesCerradas: true,
          },
        });
        expect(JSON.stringify(registro)).not.toContain(TEMPORAL);
      });

      it('el bloqueo del inicio de sesión no impide cambiar la contraseña desde la sesión y el restablecimiento lo levanta (SEG-6)', async () => {
        const id = await crearUsuarioPai(base, { usuario: 'acosado', rol: 'responsable' });
        const sesion = await iniciarSesionPai(prueba.servidor, 'acosado');
        // Alguien que solo conoce el nombre de usuario bloquea el ingreso.
        for (let i = 0; i <= MAX_FALLOS_USUARIO; i++) {
          await agente()
            .post(`${API}/sesion`)
            .send({ usuario: 'acosado', contrasena: `mala-${i}-de-doce-caracteres` })
            .expect(i < MAX_FALLOS_USUARIO ? 401 : 429);
        }
        // La sesión abierta sí puede cambiar su contraseña.
        await escritura(agente().put(`${API}/sesion/contrasena`), sesion)
          .send({ actual: CONTRASENA_PRUEBA_PAI, nueva: NUEVA })
          .expect(200);
        // Se vuelve a bloquear y el administrador restablece la contraseña:
        // la temporal funciona de inmediato.
        await base.admin.query('DELETE FROM pai_intentos_acceso');
        for (let i = 0; i <= MAX_FALLOS_USUARIO; i++) {
          await agente()
            .post(`${API}/sesion`)
            .send({ usuario: 'acosado', contrasena: `mala-${i}-de-doce-caracteres` })
            .expect(i < MAX_FALLOS_USUARIO ? 401 : 429);
        }
        await escritura(agente().patch(`${API}/admin/usuarios/${id}`), admin)
          .send({ contrasenaTemporal: TEMPORAL })
          .expect(200);
        const nueva = await iniciarSesionPai(prueba.servidor, 'acosado', TEMPORAL);
        expect(nueva.sesion.debeCambiarContrasena).toBe(true);
      });

      it('cambiar la contraseña con la actual equivocada tiene su propio límite (no bloquea el inicio de sesión)', async () => {
        await crearUsuarioPai(base, { usuario: 'adivino', rol: 'responsable' });
        const sesion = await iniciarSesionPai(prueba.servidor, 'adivino');
        for (let i = 0; i < MAX_FALLOS_USUARIO; i++) {
          await escritura(agente().put(`${API}/sesion/contrasena`), sesion)
            .send({ actual: `intento-${i}-equivocado`, nueva: NUEVA })
            .expect(400);
        }
        const bloqueo = await escritura(
          agente().put(`${API}/sesion/contrasena`),
          sesion,
        )
          .send({ actual: CONTRASENA_PRUEBA_PAI, nueva: NUEVA })
          .expect(429);
        expect(Number(bloqueo.headers['retry-after'])).toBeGreaterThan(800);
        // El inicio de sesión de esa cuenta tiene su propio límite.
        await agente()
          .post(`${API}/sesion`)
          .send({ usuario: 'adivino', contrasena: CONTRASENA_PRUEBA_PAI })
          .expect(200);
        expect(
          await contar(
            "SELECT COUNT(*) FROM pai_registro WHERE usuario = 'adivino' AND accion = 'cambiar_contrasena' AND detalle LIKE '%bloqueado%'",
          ),
        ).toBe(1);
        expect(
          await contar(
            "SELECT COUNT(*) FROM pai_registro WHERE usuario = 'adivino' AND accion = 'cambiar_contrasena' AND detalle LIKE '%fallido%'",
          ),
        ).toBe(MAX_FALLOS_USUARIO);
      });
    });

    describe('administración de usuarios', () => {
      it('lista los usuarios sin hashes, con sus asignaciones de la vigencia', async () => {
        const res = await con(
          agente().get(`${API}/admin/usuarios`),
          admin,
        ).expect(200);
        expect(res.headers['cache-control']).toBe('no-store');
        const usuarios = res.body.usuarios as UsuarioPai[];
        expect(usuarios.find((u) => u.usuario === 'planeacion')).toMatchObject({
          id: idAdmin,
          nombre: 'Oficina de Planeación',
          rol: 'administrador',
          activo: true,
          debeCambiarContrasena: false,
          asignaciones: { procesos: [], indicadores: [] },
        });
        const responsable = usuarios.find((u) => u.usuario === 'responsable1');
        expect(Date.parse(responsable?.ultimoAcceso ?? '')).toBeGreaterThan(
          Date.now() - 600_000,
        );
        expect(Date.parse(responsable?.creadoEn ?? '')).toBeGreaterThan(0);
        expect(JSON.stringify(res.body)).not.toMatch(/hash|scrypt/i);
      });

      it('crear valida los datos y rechaza un usuario repetido', async () => {
        const invalido = await escritura(
          agente().post(`${API}/admin/usuarios`),
          admin,
        )
          .send({
            usuario: 'x',
            nombre: '',
            rol: 'jefe',
            contrasenaTemporal: 'corta',
            correo: 'mal',
          })
          .expect(400);
        expect(Object.keys(invalido.body.campos).toSorted()).toEqual(
          [
            'contrasenaTemporal',
            'correo',
            'nombre',
            'rol',
            'usuario',
          ].toSorted(),
        );
        const repetido = await escritura(
          agente().post(`${API}/admin/usuarios`),
          admin,
        )
          .send({
            usuario: 'RESPONSABLE1',
            nombre: 'Otro',
            rol: 'responsable',
            contrasenaTemporal: TEMPORAL,
          })
          .expect(409);
        expect(repetido.body).toMatchObject({
          codigo: 'conflicto',
          campos: { usuario: expect.any(String) as unknown },
        });

        const creado = await escritura(
          agente().post(`${API}/admin/usuarios`),
          admin,
        )
          .send({
            usuario: 'ana.perez',
            nombre: 'Ana  Pérez',
            rol: 'administrador',
            correo: 'ana.perez@sapiencia.gov.co',
            cargo: 'Profesional',
            contrasenaTemporal: TEMPORAL,
          })
          .expect(201);
        expect(creado.body).toMatchObject({
          usuario: 'ana.perez',
          nombre: 'Ana Pérez',
          correo: 'ana.perez@sapiencia.gov.co',
          cargo: 'Profesional',
          rol: 'administrador',
        });
        const registro = await ultimoRegistro('crear_usuario');
        expect(registro).toMatchObject({
          usuario: 'planeacion',
          detalle: {
            id: creado.body.id,
            usuario: 'ana.perez',
            rol: 'administrador',
            contrasenaTemporal: true,
          },
        });
        expect(JSON.stringify(registro)).not.toContain(TEMPORAL);
      });

      it('editar nombre, correo y cargo; 404 si el usuario no existe; un PATCH vacío no cambia nada', async () => {
        const id = await crearUsuarioPai(base, {
          usuario: 'editable',
          rol: 'responsable',
          correo: 'a@b.co',
        });
        const res = await escritura(
          agente().patch(`${API}/admin/usuarios/${id}`),
          admin,
        )
          .send({
            nombre: 'Nombre Editado',
            correo: null,
            cargo: 'Contratista',
          })
          .expect(200);
        expect(res.body).toMatchObject({
          nombre: 'Nombre Editado',
          correo: null,
          cargo: 'Contratista',
        });
        expect((await ultimoRegistro('editar_usuario')).detalle).toMatchObject({
          id,
          antes: { nombre: 'Usuario editable', correo: 'a@b.co', cargo: null },
          despues: {
            nombre: 'Nombre Editado',
            correo: null,
            cargo: 'Contratista',
          },
        });
        const registros = await contar(
          "SELECT COUNT(*) FROM pai_registro WHERE accion = 'editar_usuario'",
        );
        await escritura(agente().patch(`${API}/admin/usuarios/${id}`), admin)
          .send({})
          .expect(200);
        expect(
          await contar(
            "SELECT COUNT(*) FROM pai_registro WHERE accion = 'editar_usuario'",
          ),
        ).toBe(registros);
        for (const ruta of [
          '/admin/usuarios/999999',
          '/admin/usuarios/abc',
          '/admin/usuarios/0',
        ]) {
          const noExiste = await escritura(
            agente().patch(`${API}${ruta}`),
            admin,
          )
            .send({ nombre: 'X' })
            .expect(404);
          expect(noExiste.body.codigo).toBe('no_encontrado');
        }
        await escritura(agente().patch(`${API}/admin/usuarios/${id}`), admin)
          .send({ activo: 'no' })
          .expect(400);
      });

      it('desactivar borra sus sesiones y le impide entrar; reactivar lo deja entrar', async () => {
        const id = await crearUsuarioPai(base, {
          usuario: 'saliente',
          rol: 'responsable',
        });
        const sesion = await iniciarSesionPai(prueba.servidor, 'saliente');
        await escritura(agente().patch(`${API}/admin/usuarios/${id}`), admin)
          .send({ activo: false })
          .expect(200);
        expect(
          await contar(
            'SELECT COUNT(*) FROM pai_sesiones WHERE usuario_id = ?',
            [id],
          ),
        ).toBe(0);
        await con(agente().get(`${API}/sesion`), sesion).expect(401);
        const res = await agente()
          .post(`${API}/sesion`)
          .send({ usuario: 'saliente', contrasena: CONTRASENA_PRUEBA_PAI })
          .expect(401);
        expect(res.body.mensaje).toBe(MENSAJE_CREDENCIALES);
        expect((await ultimoRegistro('editar_usuario')).detalle).toMatchObject({
          antes: { activo: true },
          despues: { activo: false },
          sesionesCerradas: true,
        });
        await escritura(agente().patch(`${API}/admin/usuarios/${id}`), admin)
          .send({ activo: true })
          .expect(200);
        await iniciarSesionPai(prueba.servidor, 'saliente');
      });

      it('el administrador no puede desactivarse, quitarse el rol ni darse una contraseña temporal', async () => {
        for (const [cuerpo, campo] of [
          [{ activo: false }, 'activo'],
          [{ rol: 'responsable' }, 'rol'],
          [{ contrasenaTemporal: TEMPORAL }, 'contrasenaTemporal'],
        ] as const) {
          const res = await escritura(
            agente().patch(`${API}/admin/usuarios/${idAdmin}`),
            admin,
          )
            .send(cuerpo)
            .expect(409);
          expect(Object.keys(res.body.campos)).toEqual([campo]);
        }
        await con(agente().get(`${API}/sesion`), admin).expect(200);
        expect(
          await contar('SELECT activo FROM pai_usuarios WHERE id = ?', [
            idAdmin,
          ]),
        ).toBe(1);
      });

      it('dos administradores que se desactivan o se quitan el rol a la vez no dejan el PAI sin administrador (SEG-1)', async () => {
        for (const [ronda, cuerpo] of [
          [1, { activo: false }],
          [2, { rol: 'responsable' }],
          [3, { activo: false }],
          [4, { rol: 'responsable' }],
        ] as const) {
          const idA = await crearUsuarioPai(base, {
            usuario: `cruzado${ronda}a`,
            rol: 'administrador',
          });
          const idB = await crearUsuarioPai(base, {
            usuario: `cruzado${ronda}b`,
            rol: 'administrador',
          });
          const sesionA = await iniciarSesionPai(
            prueba.servidor,
            `cruzado${ronda}a`,
          );
          const sesionB = await iniciarSesionPai(
            prueba.servidor,
            `cruzado${ronda}b`,
          );
          const respuestas = await Promise.all([
            escritura(agente().patch(`${API}/admin/usuarios/${idB}`), sesionA).send(cuerpo),
            escritura(agente().patch(`${API}/admin/usuarios/${idA}`), sesionB).send(cuerpo),
          ]);
          const estados = respuestas.map((r) => r.status).toSorted();
          // Uno gana; el otro ya no es administrador activo cuando su
          // transacción obtiene el bloqueo (403), o su sesión ya se cerró (401).
          expect(estados[0]).toBe(200);
          expect([401, 403]).toContain(estados[1]);
          expect(
            await contar(
              "SELECT COUNT(*) FROM pai_usuarios WHERE rol = 'administrador' AND activo = 1 AND id IN (?, ?)",
              [idA, idB],
            ),
          ).toBe(1);
          // Se dejan inactivos para la ronda siguiente.
          await base.admin.query('UPDATE pai_usuarios SET activo = 0 WHERE id IN (?, ?)', [idA, idB]);
        }
        expect(
          await contar(
            "SELECT COUNT(*) FROM pai_usuarios WHERE rol = 'administrador' AND activo = 1 AND usuario LIKE 'cruzado%'",
          ),
        ).toBe(0);
      });

      it('un cambio de rol rige de inmediato y al pasar a administrador se borran sus asignaciones', async () => {
        const id = await crearUsuarioPai(base, {
          usuario: 'ascendido',
          rol: 'responsable',
        });
        await asignarPai(base, id, { procesoId: datos.procesoTh });
        const sesion = await iniciarSesionPai(prueba.servidor, 'ascendido');
        await con(agente().get(`${API}/admin/usuarios`), sesion).expect(403);
        const res = await escritura(
          agente().patch(`${API}/admin/usuarios/${id}`),
          admin,
        )
          .send({ rol: 'administrador' })
          .expect(200);
        expect(res.body).toMatchObject({
          rol: 'administrador',
          asignaciones: { procesos: [], indicadores: [] },
        });
        expect(
          await contar(
            'SELECT COUNT(*) FROM pai_asignaciones WHERE usuario_id = ?',
            [id],
          ),
        ).toBe(0);
        await con(agente().get(`${API}/admin/usuarios`), sesion).expect(200);
        expect(
          (await con(agente().get(`${API}/sesion`), sesion).expect(200)).body
            .rol,
        ).toBe('administrador');
      });
    });

    describe('asignaciones', () => {
      it('reemplaza el conjunto (conservando lo que sigue) y lo registra con códigos', async () => {
        const id = await crearUsuarioPai(base, {
          usuario: 'asignado',
          rol: 'responsable',
        });
        const primera = await escritura(
          agente().put(`${API}/admin/usuarios/${id}/asignaciones`),
          admin,
        )
          .send({
            procesos: [datos.procesoTh, datos.procesoTh],
            indicadores: [datos.indicadores.ac01],
          })
          .expect(200);
        expect(primera.body.asignaciones).toEqual({
          procesos: [datos.procesoTh],
          indicadores: [datos.indicadores.ac01],
        });
        expect((await ultimoRegistro('asignar')).detalle).toEqual({
          id,
          usuario: 'asignado',
          vigencia: datos.anio,
          procesos: ['SAF-TH'],
          indicadores: ['SAF-AC-01'],
          agregados: { procesos: ['SAF-TH'], indicadores: ['SAF-AC-01'] },
          quitados: { procesos: [], indicadores: [] },
        });
        const [filaAc] = await filas(
          'SELECT id FROM pai_asignaciones WHERE usuario_id = ? AND indicador_id = ?',
          [id, datos.indicadores.ac01],
        );

        const segunda = await escritura(
          agente().put(`${API}/admin/usuarios/${id}/asignaciones`),
          admin,
        )
          .send({
            procesos: [],
            indicadores: [datos.indicadores.ac01, datos.indicadores.th02],
          })
          .expect(200);
        expect(segunda.body.asignaciones).toEqual({
          procesos: [],
          indicadores: [
            datos.indicadores.th02,
            datos.indicadores.ac01,
          ].toSorted((a, b) => a - b),
        });
        const [filaAcDespues] = await filas(
          'SELECT id FROM pai_asignaciones WHERE usuario_id = ? AND indicador_id = ?',
          [id, datos.indicadores.ac01],
        );
        expect(Number(filaAcDespues.id)).toBe(Number(filaAc.id));
        expect(
          await contar(
            'SELECT COUNT(*) FROM pai_asignaciones WHERE usuario_id = ?',
            [id],
          ),
        ).toBe(2);
        expect((await ultimoRegistro('asignar')).detalle).toMatchObject({
          agregados: { procesos: [], indicadores: ['SAF-TH-02'] },
          quitados: { procesos: ['SAF-TH'], indicadores: [] },
        });

        // El mismo conjunto otra vez: sin cambios ni registro.
        const registros = await contar(
          "SELECT COUNT(*) FROM pai_registro WHERE accion = 'asignar'",
        );
        await escritura(
          agente().put(`${API}/admin/usuarios/${id}/asignaciones`),
          admin,
        )
          .send({
            procesos: [],
            indicadores: [datos.indicadores.th02, datos.indicadores.ac01],
          })
          .expect(200);
        expect(
          await contar(
            "SELECT COUNT(*) FROM pai_registro WHERE accion = 'asignar'",
          ),
        ).toBe(registros);

        const lista = await con(
          agente().get(`${API}/admin/usuarios`),
          admin,
        ).expect(200);
        expect(
          (lista.body.usuarios as UsuarioPai[]).find((u) => u.id === id)
            ?.asignaciones.indicadores,
        ).toHaveLength(2);

        // Vaciar.
        await escritura(
          agente().put(`${API}/admin/usuarios/${id}/asignaciones`),
          admin,
        )
          .send({ procesos: [], indicadores: [] })
          .expect(200);
        expect(
          await contar(
            'SELECT COUNT(*) FROM pai_asignaciones WHERE usuario_id = ?',
            [id],
          ),
        ).toBe(0);
      });

      it('ids inexistentes: 400 con campos y sin cambios; solo responsables; 404 sin usuario', async () => {
        const id = await crearUsuarioPai(base, {
          usuario: 'asignado2',
          rol: 'responsable',
        });
        await asignarPai(base, id, { indicadorId: datos.indicadores.th01 });
        const res = await escritura(
          agente().put(`${API}/admin/usuarios/${id}/asignaciones`),
          admin,
        )
          .send({
            procesos: [999_999],
            indicadores: [datos.indicadores.th02, 888_888],
          })
          .expect(400);
        expect(res.body.campos).toEqual({
          procesos: `No existen en la vigencia ${datos.anio}: 999999.`,
          indicadores: `No existen en la vigencia ${datos.anio}: 888888.`,
        });
        expect(
          await contar(
            'SELECT COUNT(*) FROM pai_asignaciones WHERE usuario_id = ?',
            [id],
          ),
        ).toBe(1);

        await escritura(
          agente().put(`${API}/admin/usuarios/${id}/asignaciones`),
          admin,
        )
          .send({ procesos: 'todos' })
          .expect(400);
        const aAdmin = await escritura(
          agente().put(`${API}/admin/usuarios/${idAdmin}/asignaciones`),
          admin,
        )
          .send({ procesos: [datos.procesoTh], indicadores: [] })
          .expect(409);
        expect(aAdmin.body.mensaje).toMatch(/Solo los responsables/);
        await escritura(
          agente().put(`${API}/admin/usuarios/${idAdmin}/asignaciones`),
          admin,
        )
          .send({ procesos: [], indicadores: [] })
          .expect(200);
        await escritura(
          agente().put(`${API}/admin/usuarios/999999/asignaciones`),
          admin,
        )
          .send({ procesos: [], indicadores: [] })
          .expect(404);
      });

      it('cada vigencia tiene sus asignaciones (?vigencia=)', async () => {
        const anterior = await crearFixturePai(base, { anio: 2025 });
        const id = await crearUsuarioPai(base, {
          usuario: 'dos.vigencias',
          rol: 'responsable',
        });
        await asignarPai(base, id, { procesoId: datos.procesoAc });

        // Un proceso de 2025 no existe en la vigencia más reciente (2026).
        const mal = await escritura(
          agente().put(`${API}/admin/usuarios/${id}/asignaciones`),
          admin,
        )
          .send({ procesos: [anterior.procesoTh], indicadores: [] })
          .expect(400);
        expect(mal.body.campos.procesos).toMatch(/vigencia 2026/);

        const en2025 = await escritura(
          agente().put(
            `${API}/admin/usuarios/${id}/asignaciones?vigencia=2025`,
          ),
          admin,
        )
          .send({
            procesos: [anterior.procesoTh],
            indicadores: [anterior.indicadores.ac01],
          })
          .expect(200);
        expect(en2025.body.asignaciones).toEqual({
          procesos: [anterior.procesoTh],
          indicadores: [anterior.indicadores.ac01],
        });
        // La de 2026 no se tocó.
        const lista2026 = await con(
          agente().get(`${API}/admin/usuarios`),
          admin,
        ).expect(200);
        expect(
          (lista2026.body.usuarios as UsuarioPai[]).find((u) => u.id === id)
            ?.asignaciones,
        ).toEqual({
          procesos: [datos.procesoAc],
          indicadores: [],
        });
        const lista2025 = await con(
          agente().get(`${API}/admin/usuarios?vigencia=2025`),
          admin,
        ).expect(200);
        expect(
          (lista2025.body.usuarios as UsuarioPai[]).find((u) => u.id === id)
            ?.asignaciones,
        ).toEqual({
          procesos: [anterior.procesoTh],
          indicadores: [anterior.indicadores.ac01],
        });
        expect(
          await contar(
            'SELECT COUNT(*) FROM pai_asignaciones WHERE usuario_id = ?',
            [id],
          ),
        ).toBe(3);
        await con(
          agente().get(`${API}/admin/usuarios?vigencia=2030`),
          admin,
        ).expect(404);
        await con(
          agente().get(`${API}/admin/usuarios?vigencia=abc`),
          admin,
        ).expect(400);
        // La ficha por código: sin ?vigencia=, la más reciente (2026); con
        // ?vigencia=2025, la de ese año (NEG-3).
        const reciente = await con(
          agente().get(`${API}/indicadores/SAF-TH-02`),
          admin,
        ).expect(200);
        expect(reciente.body).toMatchObject({ id: datos.indicadores.th02, vigencia: 2026 });
        const de2025 = await con(
          agente().get(`${API}/indicadores/SAF-TH-02?vigencia=2025`),
          admin,
        ).expect(200);
        expect(de2025.body).toMatchObject({ id: anterior.indicadores.th02, vigencia: 2025 });
      });
    });

    describe('CLI pai:crear-usuario', () => {
      it('crea un administrador, le cambia la contraseña (temporal) y lo desactiva', async () => {
        const bd = new BaseDatosRepositorio(base.config);
        bd.registro = SILENCIO;
        bd.iniciar();
        try {
          const opciones = {
            usuario: 'cli.admin',
            nombre: 'Administrador CLI',
            rol: 'administrador' as const,
            correo: 'cli@sapiencia.gov.co',
            temporal: false,
            desactivar: false,
            soloSql: false,
          };
          const creado = await guardarUsuarioCli(
            bd,
            opciones,
            await hashContrasena(CONTRASENA_PRUEBA_PAI),
          );
          expect(creado.creado).toBe(true);
          const sesion = await iniciarSesionPai(prueba.servidor, 'cli.admin');
          expect(sesion.sesion).toMatchObject({
            id: creado.id,
            rol: 'administrador',
            debeCambiarContrasena: false,
          });

          // Bloqueado por intentos fallidos: la contraseña que pone la CLI
          // debe servir de inmediato (SEG-6).
          for (let i = 0; i <= MAX_FALLOS_USUARIO; i++) {
            await agente()
              .post(`${API}/sesion`)
              .send({ usuario: 'cli.admin', contrasena: `mala-${i}-de-doce-caracteres` })
              .expect(i < MAX_FALLOS_USUARIO ? 401 : 429);
          }
          const actualizado = await guardarUsuarioCli(
            bd,
            {
              usuario: 'cli.admin',
              temporal: true,
              desactivar: false,
              soloSql: false,
            },
            await hashContrasena(TEMPORAL),
          );
          expect(actualizado).toEqual({ id: creado.id, creado: false });
          await con(agente().get(`${API}/sesion`), sesion).expect(401);
          const temporal = await iniciarSesionPai(
            prueba.servidor,
            'cli.admin',
            TEMPORAL,
          );
          expect(temporal.sesion).toMatchObject({
            debeCambiarContrasena: true,
            nombre: 'Administrador CLI',
          });

          await desactivarUsuarioCli(bd, 'cli.admin');
          await con(agente().get(`${API}/sesion`), temporal).expect(401);
          await agente()
            .post(`${API}/sesion`)
            .send({ usuario: 'cli.admin', contrasena: TEMPORAL })
            .expect(401);
          const acciones = await filas(
            "SELECT accion, usuario_id FROM pai_registro WHERE detalle LIKE '%pai:crear-usuario%' AND detalle LIKE '%cli.admin%' ORDER BY id",
          );
          expect(
            acciones.map((fila) => [fila.accion, fila.usuario_id]),
          ).toEqual([
            ['crear_usuario', null],
            ['editar_usuario', null],
            ['editar_usuario', null],
          ]);
        } finally {
          await bd.cerrar();
        }
      });

      it.skipIf(!ES_POSTGRES)(
        'el SQL de --solo-sql funciona en Postgres (crear, cambiar, solo contraseña, desactivar)',
        async () => {
          const url = new URL(URL_POSTGRES_PRUEBAS ?? '');
          url.pathname = `/${base.nombre}`;
          const cliente = new ClientePg({ connectionString: url.toString() });
          await cliente.connect();
          try {
            const opciones = {
              usuario: 'supabase.admin',
              nombre: "Administración d'Supabase",
              rol: 'administrador' as const,
              temporal: true,
              desactivar: false,
              soloSql: true,
            };
            await cliente.query(
              sqlCrearUsuarioPai(opciones, await hashContrasena(TEMPORAL)),
            );
            const primera = await iniciarSesionPai(
              prueba.servidor,
              'supabase.admin',
              TEMPORAL,
            );
            expect(primera.sesion).toMatchObject({
              nombre: "Administración d'Supabase",
              rol: 'administrador',
              debeCambiarContrasena: true,
            });

            // Otra vez (ON CONFLICT): contraseña definitiva, cierra la sesión anterior.
            await cliente.query(
              sqlCrearUsuarioPai(
                { ...opciones, temporal: false, cargo: 'Soporte' },
                await hashContrasena(NUEVA),
              ),
            );
            await con(agente().get(`${API}/sesion`), primera).expect(401);
            const segunda = await iniciarSesionPai(
              prueba.servidor,
              'supabase.admin',
              NUEVA,
            );
            expect(segunda.sesion.debeCambiarContrasena).toBe(false);

            // Solo la contraseña (sin --nombre ni --rol).
            await cliente.query(
              sqlCrearUsuarioPai(
                {
                  usuario: 'supabase.admin',
                  temporal: false,
                  desactivar: false,
                  soloSql: true,
                },
                await hashContrasena(CONTRASENA_PRUEBA_PAI),
              ),
            );
            await iniciarSesionPai(prueba.servidor, 'supabase.admin');
            // Para un usuario que no existe, ese SQL no hace nada.
            await cliente.query(
              sqlCrearUsuarioPai(
                {
                  usuario: 'no.existe',
                  temporal: false,
                  desactivar: false,
                  soloSql: true,
                },
                await hashContrasena(CONTRASENA_PRUEBA_PAI),
              ),
            );
            expect(
              await contar(
                "SELECT COUNT(*) FROM pai_usuarios WHERE usuario = 'no.existe'",
              ),
            ).toBe(0);

            await cliente.query(sqlDesactivarUsuarioPai('supabase.admin'));
            await agente()
              .post(`${API}/sesion`)
              .send({
                usuario: 'supabase.admin',
                contrasena: CONTRASENA_PRUEBA_PAI,
              })
              .expect(401);
            const acciones = await filas(
              "SELECT accion FROM pai_registro WHERE detalle LIKE '%--solo-sql%' AND detalle LIKE '%supabase.admin%' ORDER BY id",
            );
            expect(acciones.map((fila) => fila.accion)).toEqual([
              'crear_usuario',
              'editar_usuario',
              'editar_usuario',
              'editar_usuario',
            ]);
            expect(
              await contar(
                "SELECT cargo IS NOT NULL FROM pai_usuarios WHERE usuario = 'supabase.admin'",
              ),
            ).toBe(1);
          } finally {
            await cliente.end();
          }
        },
      );
    });

    it('el registro nunca guarda contraseñas ni hashes', async () => {
      const detalles = await filas(
        'SELECT detalle FROM pai_registro WHERE detalle IS NOT NULL',
      );
      expect(detalles.length).toBeGreaterThan(10);
      const texto = detalles.map((fila) => String(fila.detalle)).join('\n');
      for (const secreto of [
        'scrypt$',
        CONTRASENA_PRUEBA_PAI,
        NUEVA,
        TEMPORAL,
      ]) {
        expect(texto).not.toContain(secreto);
      }
    });
  },
);
