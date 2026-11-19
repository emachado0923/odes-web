import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import type { RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type DocumentoAdmin,
  LIMITES_REPOSITORIO,
  type ListadoPublico,
  type SubidaPorPartes,
} from '../src/repositorio/api-repositorio.js';
import { TAMANO_PARTE } from '../src/repositorio/archivos/subidas-por-partes.js';
import { BaseDatosRepositorio } from '../src/repositorio/bd/base-datos.js';
import { ServicioLecturaRepositorio } from '../src/repositorio/servicios/lectura-repositorio.js';
import { importarPaquete } from '../src/repositorio/importacion/importador.js';
import { MAX_FALLOS_IP, MAX_FALLOS_USUARIO } from '../src/repositorio/servicios/sesiones.js';
import { crearDistTemporal, type DistTemporal } from './dist-temporal.js';
import {
  type AppPrueba,
  avisarSiNoHayBd,
  type BasePrueba,
  crearAdminPrueba,
  crearAppRepositorio,
  crearBasePrueba,
  crearPaqueteSintetico,
  cuerpoBinario,
  HAY_BD,
  MOTOR_PRUEBAS,
  iniciarSesion,
  type PaqueteSintetico,
  type Sesion,
} from './repositorio-apoyo.js';
import { docxFalso, jpegFalso, pdfFalso, pngFalso, webpFalso } from './repositorio-fixtures.js';

/**
 * API HTTP de /api/repositorio contra una base desechable (MYSQL_PRUEBAS o
 * POSTGRES_PRUEBAS):
 * lectura pública, sesión, CSRF, límites de intentos, escritura, archivos,
 * reglas para publicar, categorías, palabras clave y registro de cambios.
 * Sin MYSQL_PRUEBAS ni POSTGRES_PRUEBAS se omite.
 */

avisarSiNoHayBd('repositorio-api');

const SILENCIO = { log: () => undefined, warn: () => undefined, error: () => undefined };
const USUARIO = 'observatorio';
const CONTRASENA = 'clave-de-pruebas-2026';
const PUB = '/api/repositorio/documentos';
const ADM = '/api/repositorio/admin';
const B19 = 'boletin-19-fe-erratas-boletin-n-19-2021';
const TABLERO = 'estudio-seguimiento-tablero';

/** Descripción de 30 palabras (para publicar se piden 30; se aceptan de 25 a 35). */
const DESCRIPCION =
  'El boletín 30 del Observatorio analiza la relación entre la educación postsecundaria y el empleo de los jóvenes de ' +
  'Medellín, con cifras de matrícula, graduación y vinculación laboral por nivel.';
const SEIS_CLAVES = ['Permanencia', 'Deserción', 'Becas', 'Acceso', 'Educación superior', 'Medellín'];

function sha256(datos: Buffer): string {
  return createHash('sha256').update(datos).digest('hex');
}

describe.skipIf(!HAY_BD)(`API del repositorio con ${MOTOR_PRUEBAS} (e2e)`, () => {
  let base: BasePrueba;
  let paquete: PaqueteSintetico;
  let dist: DistTemporal;
  let prueba: AppPrueba;
  let sesion: Sesion;

  const agente = () => request(prueba.servidor);
  const conSesion = (r: request.Test, s: Sesion = sesion) => r.set('Cookie', s.cookie);
  const escritura = (r: request.Test, s: Sesion = sesion) => r.set('Cookie', s.cookie).set('X-CSRF-Token', s.csrf);
  const contar = async (sql: string, valores: unknown[] = []): Promise<number> => {
    const [filas] = await base.admin.query<RowDataPacket[]>(sql, valores);
    return Number(Object.values(filas[0])[0]);
  };
  // Subida por partes (archivos en la base).
  const iniciar = (bytes: unknown, s: Sesion = sesion) => escritura(agente().post(`${ADM}/subidas/partes`), s).send({ bytes });
  const subirParte = (ruta: string, n: number | string, cuerpo: Buffer, s: Sesion = sesion) =>
    escritura(agente().put(`${ADM}/subidas/${ruta}/${n}`), s).set('Content-Type', 'application/octet-stream').send(cuerpo);
  const pendientes = () => contar('SELECT COUNT(*) FROM repositorio_subidas');

  beforeAll(async () => {
    base = await crearBasePrueba('api');
    paquete = await crearPaqueteSintetico();
    dist = await crearDistTemporal();
    const bd = new BaseDatosRepositorio(base.config);
    bd.registro = SILENCIO;
    bd.iniciar();
    await importarPaquete(bd, { paquete: paquete.directorio, miniaturas: paquete.miniaturas });
    await bd.cerrar();
    await crearAdminPrueba(base, USUARIO, CONTRASENA, 'Equipo del Observatorio');
    prueba = await crearAppRepositorio(base.config, dist.directorio);
    sesion = await iniciarSesion(prueba.servidor, USUARIO, CONTRASENA);
  });

  afterAll(async () => {
    await prueba?.cerrar();
    await base?.borrar();
    await paquete?.limpiar();
    await dist?.limpiar();
  });

  describe('lectura pública', () => {
    it('listado con ETag, 304 y sin notas internas', async () => {
      const res = await agente().get(PUB).expect(200);
      const listado = res.body as ListadoPublico;
      expect(listado.total).toBe(5);
      expect(listado.categorias).toEqual(['Boletín', 'Estudio', 'Infografía']);
      expect(listado.documentos.map((d) => d.orden)).toEqual([1, 2, 3, 4, 5]);
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(JSON.stringify(listado)).not.toMatch(/notasInternas|Evidencia|publicado/);
      const b19 = listado.documentos.find((d) => d.id === B19);
      expect(b19).toMatchObject({
        urlVer: `${PUB}/${B19}/ver`,
        urlDescarga: `${PUB}/${B19}/descargar`,
        archivo: { tipo: 'application/pdf', bytes: 2_500_000, extension: 'pdf' },
        claves: ['Normatividad', 'Educación postsecundaria'],
      });
      expect(b19?.urlPortada).toMatch(new RegExp(`^${PUB}/${B19}/portada\\?v=[0-9a-f]{16}$`));
      const tablero = listado.documentos.find((d) => d.tipo === 'tablero');
      expect(tablero).toMatchObject({ urlVer: 'https://app.powerbi.com/view?r=abc', urlDescarga: null, archivo: null });
      const onedrive = listado.documentos.find((d) => d.id === 'estudio-satisfaccion-2020');
      expect(onedrive?.nota).toMatch(/OneDrive/);
      const ingles = listado.documentos.find((d) => d.idioma === 'en');
      expect(ingles?.equivalenteEnEspanol).toMatch(/Empleabilidad/);

      await agente().get(PUB).set('If-None-Match', res.headers.etag).expect(304);
    });

    it('ver, descargar, rangos, portada y miniatura', async () => {
      const pdf = paquete.archivos[`${B19}.pdf`];
      const ver = await agente().get(`${PUB}/${B19}/ver`).buffer(true).parse(cuerpoBinario).expect(200);
      expect(sha256(ver.body as Buffer)).toBe(sha256(pdf));
      expect(ver.headers).toMatchObject({
        'content-type': 'application/pdf',
        'content-length': '2500000',
        'accept-ranges': 'bytes',
        etag: `"${sha256(pdf)}"`,
        'cache-control': 'public, max-age=600, must-revalidate',
      });
      expect(ver.headers['content-disposition']).toMatch(/^inline; filename="Boletin 19 - Fe de erratas/);
      expect(ver.headers['last-modified']).toBeTruthy();

      const descarga = await agente().get(`${PUB}/${B19}/descargar`).expect(200);
      expect(descarga.headers['content-disposition']).toBe(
        'attachment; filename="Boletin 19 - Fe de erratas del Boletin N.o 19.pdf"; ' +
          "filename*=UTF-8''Bolet%C3%ADn%2019%20-%20Fe%20de%20erratas%20del%20Bolet%C3%ADn%20N.%C2%BA%2019.pdf",
      );

      const rango = await agente()
        .get(`${PUB}/${B19}/ver`)
        .set('Range', 'bytes=1048570-1048585')
        .buffer(true)
        .parse(cuerpoBinario)
        .expect(206);
      expect(rango.headers['content-range']).toBe('bytes 1048570-1048585/2500000');
      expect((rango.body as Buffer).equals(pdf.subarray(1048570, 1048586))).toBe(true);
      await agente().get(`${PUB}/${B19}/ver`).set('Range', 'bytes=-10').expect(206);
      const fuera = await agente().get(`${PUB}/${B19}/ver`).set('Range', 'bytes=3000000-').expect(416);
      expect(fuera.headers['content-range']).toBe('bytes */2500000');
      await agente().get(`${PUB}/${B19}/ver`).set('If-Range', '"otro"').set('Range', 'bytes=0-9').expect(200);
      await agente().get(`${PUB}/${B19}/ver`).set('If-None-Match', ver.headers.etag).expect(304);
      const cabeza = await agente().head(`${PUB}/${B19}/descargar`).expect(200);
      expect(cabeza.headers['content-length']).toBe('2500000');

      const docx = await agente().get(`${PUB}/infografia-en-job-placement-2022/descargar`).expect(200);
      expect(docx.headers['content-type']).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      expect(docx.headers['content-disposition']).toContain('Infograf%C3%ADa%20-%20Job%20placement%20of%20beneficiaries.docx');

      const listado = (await agente().get(PUB)).body as ListadoPublico;
      // Los tableros publicados también salen en el listado público (no se quita ningún producto).
      expect(listado.documentos.find((d) => d.id === TABLERO)?.tipo).toBe('tablero');
      const urlPortada = listado.documentos[0].urlPortada as string;
      const portada = await agente().get(urlPortada).expect(200);
      expect(portada.headers['content-type']).toBe('image/jpeg');
      expect(portada.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      const sinVersion = await agente().get(urlPortada.split('?')[0]).expect(200);
      expect(sinVersion.headers['cache-control']).toBe('public, max-age=86400');
      const miniatura = await agente().get(listado.documentos[0].urlMiniatura as string).expect(200);
      expect(miniatura.headers['content-type']).toBe('image/webp');
    });

    it('404 para lo que no existe, no tiene archivo o no permite descarga', async () => {
      await agente().get(`${PUB}/no-existe/ver`).expect(404);
      await agente().get(`${PUB}/estudio-seguimiento-tablero/ver`).expect(404);
      await agente().get(`${PUB}/estudio-seguimiento-tablero/descargar`).expect(404);
      await agente().get(`${PUB}/estudio-satisfaccion-2020/descargar`).expect(404);
      const res = await agente().get(`${PUB}/..%2f..%2fetc/ver`).expect(404);
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('sesión', () => {
    it('sin cookie o con una inventada: 401', async () => {
      const res = await agente().get(`${ADM}/documentos`).expect(401);
      expect(res.body.codigo).toBe('no_autenticado');
      await agente().get(`${ADM}/sesion`).set('Cookie', 'repositorio_sesion=inventada').expect(401);
      await agente()
        .get(`${ADM}/sesion`)
        .set('Cookie', `repositorio_sesion=${'a'.repeat(43)}`)
        .expect(401);
    });

    it('la cookie es HttpOnly, SameSite=Strict y solo para la administración', async () => {
      const res = await agente().post(`${ADM}/sesion`).send({ usuario: USUARIO, contrasena: CONTRASENA }).expect(200);
      const cookie = ([] as string[]).concat(res.headers['set-cookie'])[0];
      expect(cookie).toMatch(/^repositorio_sesion=[A-Za-z0-9_-]{43};/);
      expect(cookie).toMatch(/Path=\/api\/repositorio\/admin/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).not.toMatch(/Secure/); // NODE_ENV de pruebas
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({ usuario: USUARIO, nombre: 'Equipo del Observatorio' });
      expect(res.body.csrf).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Date.parse(res.body.expira)).toBeGreaterThan(Date.now());
    });

    it('contraseña equivocada y usuario inexistente dan el mismo error', async () => {
      const malo = await agente().post(`${ADM}/sesion`).send({ usuario: USUARIO, contrasena: 'no-es-esta-clave' }).expect(401);
      const nadie = await agente().post(`${ADM}/sesion`).send({ usuario: 'nadie', contrasena: 'no-es-esta-clave' }).expect(401);
      expect(malo.body).toEqual(nadie.body);
      expect(malo.body.mensaje).toBe('Usuario o contraseña incorrectos.');
      await agente().post(`${ADM}/sesion`).send({ usuario: USUARIO }).expect(400);
      await agente()
        .post(`${ADM}/sesion`)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(`usuario=${USUARIO}&contrasena=${CONTRASENA}`)
        .expect(400);
      await agente()
        .post(`${ADM}/sesion`)
        .set('Origin', 'https://otro-sitio.example')
        .send({ usuario: USUARIO, contrasena: CONTRASENA })
        .expect(403);
    });

    it('rota el token al iniciar sesión de nuevo con la cookie anterior', async () => {
      const primera = await iniciarSesion(prueba.servidor, USUARIO, CONTRASENA);
      const res = await agente()
        .post(`${ADM}/sesion`)
        .set('Cookie', primera.cookie)
        .send({ usuario: USUARIO, contrasena: CONTRASENA })
        .expect(200);
      await conSesion(agente().get(`${ADM}/sesion`), primera).expect(401);
      const nueva = ([] as string[]).concat(res.headers['set-cookie'])[0].split(';')[0];
      expect(nueva).not.toBe(primera.cookie);
      await agente().get(`${ADM}/sesion`).set('Cookie', nueva).expect(200);
    });

    it('vence por inactividad y por duración máxima', async () => {
      const inactiva = await iniciarSesion(prueba.servidor, USUARIO, CONTRASENA);
      const vieja = await iniciarSesion(prueba.servidor, USUARIO, CONTRASENA);
      await base.admin.query('UPDATE repositorio_sesiones SET ultimo_uso = ? WHERE csrf = ?', [
        new Date(Date.now() - 31 * 60_000),
        inactiva.csrf,
      ]);
      await base.admin.query('UPDATE repositorio_sesiones SET expira_en = ? WHERE csrf = ?', [new Date(Date.now() - 1000), vieja.csrf]);
      await conSesion(agente().get(`${ADM}/sesion`), inactiva).expect(401);
      await conSesion(agente().get(`${ADM}/documentos`), vieja).expect(401);
      expect(await contar('SELECT COUNT(*) FROM repositorio_sesiones WHERE csrf IN (?, ?)', [inactiva.csrf, vieja.csrf])).toBe(0);
      // La sesión principal sigue viva.
      const viva = await conSesion(agente().get(`${ADM}/sesion`)).expect(200);
      expect(viva.body.csrf).toBe(sesion.csrf);
      expect(viva.headers['cache-control']).toBe('no-store');
    });

    it('cerrar sesión exige CSRF, borra la sesión y la cookie', async () => {
      const otra = await iniciarSesion(prueba.servidor, USUARIO, CONTRASENA);
      await conSesion(agente().delete(`${ADM}/sesion`), otra).expect(403);
      const res = await escritura(agente().delete(`${ADM}/sesion`), otra).expect(204);
      expect(([] as string[]).concat(res.headers['set-cookie'])[0]).toMatch(/repositorio_sesion=;.*Expires=Thu, 01 Jan 1970/);
      await conSesion(agente().get(`${ADM}/sesion`), otra).expect(401);
      // Sin sesión, cerrar responde 204 igual.
      await agente().delete(`${ADM}/sesion`).expect(204);
    });

    it('bloquea al usuario tras varios fallos (aunque luego acierte) y a la IP tras muchos', async () => {
      await crearAdminPrueba(base, 'victima', CONTRASENA);
      for (let i = 0; i < MAX_FALLOS_USUARIO; i++) {
        await agente().post(`${ADM}/sesion`).send({ usuario: 'victima', contrasena: `mala-${i}-xxxxxx` }).expect(401);
      }
      const bloqueo = await agente().post(`${ADM}/sesion`).send({ usuario: 'victima', contrasena: CONTRASENA }).expect(429);
      expect(bloqueo.body.codigo).toBe('demasiados_intentos');
      expect(Number(bloqueo.headers['retry-after'])).toBeGreaterThan(800);
      expect(
        await contar("SELECT COUNT(*) FROM repositorio_cambios WHERE usuario = 'victima' AND detalle LIKE 'Cuenta bloqueada%'"),
      ).toBe(1);

      // Por IP: muchos fallos con usuarios distintos bloquean también al resto.
      const previos = await contar('SELECT COUNT(*) FROM repositorio_intentos_acceso WHERE exito = 0');
      for (let i = previos; i < MAX_FALLOS_IP; i++) {
        await agente().post(`${ADM}/sesion`).send({ usuario: `otro${i}`, contrasena: 'no-existe-este' }).expect(401);
      }
      await agente().post(`${ADM}/sesion`).send({ usuario: USUARIO, contrasena: CONTRASENA }).expect(429);
      // La sesión ya abierta no se ve afectada.
      await conSesion(agente().get(`${ADM}/sesion`)).expect(200);
      await base.admin.query('DELETE FROM repositorio_intentos_acceso');
      await agente().post(`${ADM}/sesion`).send({ usuario: 'victima', contrasena: CONTRASENA }).expect(200);
    });

    it('una ráfaga de intentos simultáneos no se salta el límite (como mucho 5 verificaciones)', async () => {
      await base.admin.query('DELETE FROM repositorio_intentos_acceso');
      await crearAdminPrueba(base, 'rafaga', CONTRASENA);
      // Con el servidor escuchando en un puerto (supertest abriría uno por petición).
      if (!prueba.servidor.listening) {
        await new Promise<void>((listo) => prueba.servidor.listen(0, '127.0.0.1', listo));
      }
      const { port } = prueba.servidor.address() as AddressInfo;
      const estados = await Promise.all(
        Array.from({ length: 30 }, async (_, i) => {
          const res = await fetch(`http://127.0.0.1:${port}${ADM}/sesion`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: 'rafaga', contrasena: `equivocada-${i}-xxxxxx` }),
          });
          await res.arrayBuffer();
          return res.status;
        }),
      );
      const verificados = estados.filter((estado) => estado === 401).length;
      expect(verificados).toBeLessThanOrEqual(MAX_FALLOS_USUARIO);
      expect(estados.filter((estado) => estado !== 401 && estado !== 429)).toEqual([]);
      expect(estados.filter((estado) => estado === 429)).toHaveLength(30 - verificados);
      // Quedan exactamente los fallos verificados: las reservas rechazadas se
      // borraron y no hay intentos "en curso" colgados.
      expect(await contar("SELECT COUNT(*) FROM repositorio_intentos_acceso WHERE usuario = 'rafaga' AND exito = 0")).toBe(verificados);
      expect(await contar("SELECT COUNT(*) FROM repositorio_intentos_acceso WHERE usuario = 'rafaga' AND exito NOT IN (0, 1)")).toBe(0);
      expect(
        await contar("SELECT COUNT(*) FROM repositorio_cambios WHERE usuario = 'rafaga' AND detalle LIKE 'Inicio de sesión fallido%'"),
      ).toBe(verificados);
      const bloqueado = verificados === MAX_FALLOS_USUARIO;
      expect(
        await contar("SELECT COUNT(*) FROM repositorio_cambios WHERE usuario = 'rafaga' AND detalle LIKE 'Cuenta bloqueada%'"),
      ).toBe(bloqueado ? 1 : 0);
      // Con 5 fallos verificados la cuenta queda bloqueada; con menos (todas las
      // reservas se vieron entre sí), no se verificó ninguna contraseña de más.
      await agente()
        .post(`${ADM}/sesion`)
        .send({ usuario: 'rafaga', contrasena: CONTRASENA })
        .expect(bloqueado ? 429 : 200);
      await base.admin.query('DELETE FROM repositorio_intentos_acceso');
    });

    it('un usuario con tildes o emoji recibe 401 (no 500) y cuenta para el límite de la IP', async () => {
      await base.admin.query('DELETE FROM repositorio_intentos_acceso');
      for (const usuario of ['josé', 'JOSÉ', 'andrés', '😀', 'ñ'.repeat(64)]) {
        const res = await agente().post(`${ADM}/sesion`).send({ usuario, contrasena: 'no-es-esta-clave' }).expect(401);
        expect(res.body.mensaje).toBe('Usuario o contraseña incorrectos.');
      }
      expect(await contar("SELECT COUNT(*) FROM repositorio_intentos_acceso WHERE exito = 0 AND usuario LIKE '#%'")).toBe(5);
      await base.admin.query('DELETE FROM repositorio_intentos_acceso');
    });

    it('los fallos desde un mismo /64 de IPv6 comparten el límite de la IP', async () => {
      await base.admin.query('DELETE FROM repositorio_intentos_acceso');
      const conProxy = await crearAppRepositorio(base.config, dist.directorio, { TRUST_PROXY: 'loopback' });
      try {
        const desde = (ip: string) => request(conProxy.servidor).post(`${ADM}/sesion`).set('X-Forwarded-For', ip);
        for (let i = 1; i <= MAX_FALLOS_IP; i++) {
          await desde(`2001:db8:9:9::${i.toString(16)}`).send({ usuario: `nadie${i}`, contrasena: 'no-es-esta-clave' }).expect(401);
        }
        await desde('2001:db8:9:9:abcd::1').send({ usuario: USUARIO, contrasena: CONTRASENA }).expect(429);
        await desde('2001:db8:9:a::1').send({ usuario: USUARIO, contrasena: CONTRASENA }).expect(200);
        // La sesión guarda la dirección completa; el conteo, el prefijo.
        expect(await contar("SELECT COUNT(*) FROM repositorio_sesiones WHERE ip = '2001:db8:9:a::1'")).toBe(1);
        expect(await contar("SELECT COUNT(*) FROM repositorio_intentos_acceso WHERE ip = '2001:db8:9:9::/64' AND exito = 0")).toBe(MAX_FALLOS_IP);
      } finally {
        await conProxy.cerrar();
        await base.admin.query('DELETE FROM repositorio_intentos_acceso');
      }
    });
  });

  describe('CSRF y origen', () => {
    const nuevo = { titulo: 'Prueba CSRF', categoria: 'Estudio', idioma: 'es', tipo: 'documento', claves: [], permiteDescarga: false };

    it('sin token, con token equivocado o desde otro sitio: 403', async () => {
      const sin = await conSesion(agente().post(`${ADM}/documentos`)).send(nuevo).expect(403);
      expect(sin.body.codigo).toBe('prohibido');
      await conSesion(agente().post(`${ADM}/documentos`)).set('X-CSRF-Token', `${sesion.csrf}x`).send(nuevo).expect(403);
      await escritura(agente().post(`${ADM}/documentos`)).set('Sec-Fetch-Site', 'cross-site').send(nuevo).expect(403);
      await escritura(agente().post(`${ADM}/documentos`)).set('Origin', 'https://otro-sitio.example').send(nuevo).expect(403);
      await escritura(agente().delete(`${ADM}/categorias/1`)).set('Sec-Fetch-Site', 'same-site').expect(403);
      expect(await contar("SELECT COUNT(*) FROM repositorio_documentos WHERE titulo = 'Prueba CSRF'")).toBe(0);
    });

    it('las lecturas no necesitan token', async () => {
      const res = await conSesion(agente().get(`${ADM}/categorias`));
      expect(res.status).toBe(200);
    });
  });

  describe('documentos', () => {
    const datos = {
      titulo: 'Boletín de prueba: educación y empleo',
      categoria: 'boletin',
      numero: '30',
      anio: 2022,
      mes: 9,
      idioma: 'es',
      tipo: 'documento',
      claves: ['NORMATIVIDAD', 'Clave nueva de prueba'],
      permiteDescarga: true,
      notasInternas: 'Solo para el equipo',
    };
    /** Los mismos datos con lo que se pide para publicar: descripción de 30 palabras y 6 palabras clave. */
    const completos = {
      ...datos,
      descripcion: DESCRIPCION,
      claves: ['NORMATIVIDAD', 'Clave nueva de prueba', ...SEIS_CLAVES.slice(0, 4)],
    };
    let creado: DocumentoAdmin;
    /** Último paso de una subida por partes: el archivo del documento creado. */
    const terminar = (ruta: string, s: Sesion = sesion) =>
      escritura(agente().put(`${ADM}/documentos/${creado.id}/archivo`), s).send({
        subida: ruta,
        nombre: 'Boletín grande.pdf',
        tipo: 'application/pdf',
      });

    it('crea despublicado, con id generado, posición por fecha y claves canónicas', async () => {
      const res = await escritura(agente().post(`${ADM}/documentos`)).send(datos).expect(201);
      creado = res.body as DocumentoAdmin;
      expect(creado).toMatchObject({
        id: 'boletin-30-boletin-prueba-educacion-empleo-2022',
        categoria: 'Boletín',
        publicado: false,
        claves: ['Normatividad', 'Clave nueva de prueba'],
        notasInternas: 'Solo para el equipo',
        actualizadoPor: USUARIO,
        urlVer: '',
        // Antes del primer documento más antiguo (el boletín de 2021, en la posición 1).
        orden: 1,
      });
      expect(res.headers['cache-control']).toBe('no-store');
      const listado = (await agente().get(PUB)).body as ListadoPublico;
      expect(listado.total).toBe(5);
      expect(listado.documentos.map((d) => d.orden)).toEqual([2, 3, 4, 5, 6]);
      await agente().get(`${PUB}/${creado.id}/ver`).expect(404);
    });

    it('rechaza datos inválidos, categoría inexistente e id repetido', async () => {
      const malo = await escritura(agente().post(`${ADM}/documentos`))
        .send({ ...datos, tipo: 'tablero', claves: ['1', '2', '3', '4', '5', '6', '7', '8'] })
        .expect(400);
      expect(Object.keys(malo.body.campos).toSorted()).toEqual(['claves']);
      const tablero = await escritura(agente().post(`${ADM}/documentos`)).send({ ...datos, tipo: 'tablero' }).expect(400);
      expect(Object.keys(tablero.body.campos).toSorted()).toEqual(['permiteDescarga', 'urlVerExterna']);
      const categoria = await escritura(agente().post(`${ADM}/documentos`))
        .send({ ...datos, categoria: 'Revista' })
        .expect(400);
      expect(categoria.body.campos).toHaveProperty('categoria');
      await escritura(agente().post(`${ADM}/documentos`)).send({ ...datos, id: B19 }).expect(409);
      await escritura(agente().put(`${ADM}/documentos/${creado.id}`)).send({ ...datos, id: 'otro-id' }).expect(400);
      await escritura(agente().put(`${ADM}/documentos/no-existe`)).send(datos).expect(404);
    });

    it('no se publica sin archivo ni URL externa; con archivo sí', async () => {
      const conflicto = await escritura(agente().post(`${ADM}/documentos/${creado.id}/publicar`)).expect(409);
      expect(conflicto.body.codigo).toBe('conflicto');

      // Un .pdf que en realidad es un PNG: 415.
      const engano = await escritura(agente().put(`${ADM}/documentos/${creado.id}/archivo`))
        .attach('archivo', pngFalso(10, 10), { filename: 'informe.pdf', contentType: 'application/pdf' })
        .expect(415);
      expect(engano.body.codigo).toBe('tipo_no_permitido');
      await escritura(agente().put(`${ADM}/documentos/${creado.id}/archivo`))
        .attach('archivo', Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00]), { filename: 'virus.pdf' })
        .expect(415);
      await escritura(agente().put(`${ADM}/documentos/${creado.id}/archivo`))
        .attach('otro', pdfFalso(), { filename: 'a.pdf' })
        .expect(400);
      await escritura(agente().put(`${ADM}/documentos/${creado.id}/archivo`)).expect(400);

      const pdf = pdfFalso(1_300_000);
      const subido = await escritura(agente().put(`${ADM}/documentos/${creado.id}/archivo`))
        .attach('archivo', pdf, { filename: 'Boletín 30.pdf', contentType: 'application/pdf' })
        .expect(200);
      expect(subido.body.archivo).toEqual({
        tipo: 'application/pdf',
        bytes: 1_300_000,
        extension: 'pdf',
        sha256: sha256(pdf),
      });
      expect(subido.body.urlVer).toBe(`${ADM}/documentos/${creado.id}/ver`);
      // La administración ve el archivo aunque no esté publicado.
      const verAdmin = await conSesion(agente().get(`${ADM}/documentos/${creado.id}/ver`))
        .buffer(true)
        .parse(cuerpoBinario)
        .expect(200);
      expect(sha256(verAdmin.body as Buffer)).toBe(sha256(pdf));
      expect(verAdmin.headers['cache-control']).toBe('private, no-cache');
      await agente().get(`${ADM}/documentos/${creado.id}/ver`).expect(401);

      // Con archivo pero sin descripción ni 6 palabras clave: todavía no se publica (409).
      const incompleto = await escritura(agente().post(`${ADM}/documentos/${creado.id}/publicar`)).expect(409);
      expect(incompleto.body.mensaje).toMatch(/^No se puede publicar todavía/);
      await escritura(agente().put(`${ADM}/documentos/${creado.id}`)).send(completos).expect(200);
      const publicado = await escritura(agente().post(`${ADM}/documentos/${creado.id}/publicar`)).expect(200);
      expect(publicado.body.publicado).toBe(true);
      const listado = (await agente().get(PUB)).body as ListadoPublico;
      expect(listado.total).toBe(6);
      expect(listado.documentos.find((d) => d.id === creado.id)?.descripcion).toBe(DESCRIPCION);
      expect(listado.documentos.find((d) => d.id === creado.id)?.urlVer).toBe(`${PUB}/${creado.id}/ver`);
      const ver = await agente().get(`${PUB}/${creado.id}/ver`).buffer(true).parse(cuerpoBinario).expect(200);
      expect(sha256(ver.body as Buffer)).toBe(sha256(pdf));
    });

    it('un archivo igual a otro no se duplica; DOCX y PNG se aceptan', async () => {
      const antes = await contar('SELECT COUNT(*) FROM repositorio_almacen_archivos');
      await escritura(agente().put(`${ADM}/documentos/estudio-satisfaccion-2020/archivo`))
        .attach('archivo', paquete.archivos[`${B19}.pdf`], { filename: 'satisfaccion.pdf' })
        .expect(200);
      expect(await contar('SELECT COUNT(*) FROM repositorio_almacen_archivos')).toBe(antes);
      await escritura(agente().put(`${ADM}/documentos/estudio-satisfaccion-2020/archivo`))
        .attach('archivo', docxFalso(), { filename: 'satisfaccion.docx' })
        .expect(200);
      const png = await escritura(agente().put(`${ADM}/documentos/estudio-satisfaccion-2020/archivo`))
        .attach('archivo', pngFalso(50, 50), { filename: 'satisfaccion.png', contentType: 'image/png' })
        .expect(200);
      expect(png.body.archivo.tipo).toBe('image/png');
      // El PDF y el DOCX son idénticos a los de otros documentos: se reutilizan
      // y no se borran al reemplazarlos. Solo el PNG es nuevo.
      expect(await contar('SELECT COUNT(*) FROM repositorio_almacen_archivos')).toBe(antes + 1);
      // Publicado y con URL externa: se puede quitar el archivo.
      const quitado = await escritura(agente().delete(`${ADM}/documentos/estudio-satisfaccion-2020/archivo`)).expect(200);
      expect(quitado.body).toMatchObject({ archivo: null, urlVer: 'https://sapienciagov-my.sharepoint.com/:b:/g/x' });
      expect(await contar('SELECT COUNT(*) FROM repositorio_almacen_archivos')).toBe(antes);
    });

    it('archivo de más de 80 MB: 413 y sin restos en la carpeta temporal', async () => {
      const grande = Buffer.alloc(80 * 1024 * 1024 + 1024);
      grande.write('%PDF-1.7\n');
      const res = await escritura(agente().put(`${ADM}/documentos/${creado.id}/archivo`))
        .attach('archivo', grande, { filename: 'grande.pdf' })
        .expect(413);
      expect(res.body.codigo).toBe('demasiado_grande');
      expect(await readdir(base.config.directorioTemporal)).toEqual([]);
    });

    describe('subida por partes (archivos en la base: en Vercel una petición no pasa de 4,5 MB)', () => {
      const pdf = pdfFalso(2 * TAMANO_PARTE + 12_345);
      const parte = (n: number): Buffer => pdf.subarray(n * TAMANO_PARTE, (n + 1) * TAMANO_PARTE);

      it('POST /subidas dice el tamaño de parte; el inicio valida el tamaño total', async () => {
        const preparada = await escritura(agente().post(`${ADM}/subidas`)).expect(200);
        expect(preparada.body).toEqual({
          directa: false,
          tamanoParte: TAMANO_PARTE,
          maxBytes: LIMITES_REPOSITORIO.maxBytesArchivo,
        });
        for (const malo of [0, -5, 1.5, '10', null]) await iniciar(malo).expect(400);
        const grande = await iniciar(LIMITES_REPOSITORIO.maxBytesArchivo + 1).expect(413);
        expect(grande.body.codigo).toBe('demasiado_grande');
        await conSesion(agente().post(`${ADM}/subidas/partes`)).send({ bytes: 10 }).expect(403);
        expect(await pendientes()).toBe(0);
      });

      it('las partes en cualquier orden (y reintentadas) arman el archivo idéntico', async () => {
        const { ruta, tamanoParte } = (await iniciar(pdf.length).expect(201)).body as SubidaPorPartes;
        expect(ruta).toMatch(/^partes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
        expect(tamanoParte).toBe(TAMANO_PARTE);
        // Sin CSRF: 403. Tamaño o número equivocados: 400. Más de una parte: 413.
        await conSesion(agente().put(`${ADM}/subidas/${ruta}/0`))
          .set('Content-Type', 'application/octet-stream')
          .send(parte(0))
          .expect(403);
        await subirParte(ruta, 0, parte(0).subarray(1)).expect(400);
        await subirParte(ruta, 3, parte(2)).expect(400);
        await subirParte(ruta, 'x', parte(2)).expect(400);
        expect((await subirParte(ruta, 0, Buffer.alloc(TAMANO_PARTE + 1)).expect(413)).body.codigo).toBe('demasiado_grande');
        await subirParte('partes/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d', 0, parte(0)).expect(400);
        for (const n of [2, 1, 0, 1]) await subirParte(ruta, n, parte(n)).expect(204);
        const subido = await terminar(ruta).expect(200);
        expect(subido.body.archivo).toEqual({ tipo: 'application/pdf', bytes: pdf.length, extension: 'pdf', sha256: sha256(pdf) });
        const ver = await conSesion(agente().get(`${ADM}/documentos/${creado.id}/ver`)).buffer(true).parse(cuerpoBinario).expect(200);
        expect(sha256(ver.body as Buffer)).toBe(sha256(pdf));
        // La subida se usó: no queda ni la fila ni sus partes, y no se puede repetir.
        expect(await pendientes()).toBe(0);
        expect(await contar('SELECT COUNT(*) FROM repositorio_subida_partes')).toBe(0);
        await terminar(ruta).expect(400);
      });

      it('incompleta: 400, y la subida ya no sirve', async () => {
        const { ruta } = (await iniciar(pdf.length).expect(201)).body as SubidaPorPartes;
        await subirParte(ruta, 0, parte(0)).expect(204);
        await subirParte(ruta, 2, parte(2)).expect(204);
        const res = await terminar(ruta).expect(400);
        expect(res.body.mensaje).toMatch(/2 de 3 partes/);
        expect(await pendientes()).toBe(0);
        expect(await readdir(base.config.directorioTemporal)).toEqual([]);
      });

      it('solo su dueño la usa; vencida no sirve y se purga; a lo sumo 5 pendientes', async () => {
        await crearAdminPrueba(base, 'otra.persona', CONTRASENA, 'Otra persona');
        const otra = await iniciarSesion(prueba.servidor, 'otra.persona', CONTRASENA);
        const { ruta } = (await iniciar(pdf.length).expect(201)).body as SubidaPorPartes;
        await subirParte(ruta, 0, parte(0), otra).expect(400);
        await terminar(ruta, otra).expect(400);
        expect(await pendientes()).toBe(1);

        await base.admin.query('UPDATE repositorio_subidas SET creado_en = ? WHERE ruta = ?', [
          new Date(Date.now() - 3 * 3_600_000),
          ruta,
        ]);
        await subirParte(ruta, 0, parte(0)).expect(400);
        for (let i = 0; i < 5; i++) await iniciar(10).expect(201);
        // La vencida se purgó al empezar la siguiente; las 5 nuevas llenan el cupo.
        expect(await contar('SELECT COUNT(*) FROM repositorio_subidas WHERE ruta = ?', [ruta])).toBe(0);
        const tope = await iniciar(10).expect(429);
        expect(tope.body.codigo).toBe('demasiados_intentos');
        expect(Number(tope.headers['retry-after'])).toBeGreaterThan(0);
        await iniciar(10, otra).expect(201);
        await base.admin.query('DELETE FROM repositorio_subidas');
      });
    });

    it('portada JPEG 720 × 720 y miniatura WebP (o PNG) 192 × 192', async () => {
      const malaMedida = await escritura(agente().put(`${ADM}/documentos/${creado.id}/portada`))
        .attach('portada', jpegFalso(800, 600), { filename: 'portada.jpg' })
        .expect(400);
      expect(malaMedida.body.campos.portada).toMatch(/720 × 720 px \(mide 800 × 600\)/);
      await escritura(agente().put(`${ADM}/documentos/${creado.id}/portada`))
        .attach('portada', pngFalso(720, 720), { filename: 'portada.png' })
        .expect(415);
      await escritura(agente().put(`${ADM}/documentos/${creado.id}/portada`))
        .attach('portada', jpegFalso(720, 720), { filename: 'portada.jpg' })
        .attach('miniatura', webpFalso(100, 100), { filename: 'mini.webp' })
        .expect(400);
      const ok = await escritura(agente().put(`${ADM}/documentos/${creado.id}/portada`))
        .attach('portada', jpegFalso(720, 720), { filename: 'blob', contentType: 'image/jpeg' })
        .attach('miniatura', webpFalso(192, 192), { filename: 'blob', contentType: 'image/webp' })
        .expect(200);
      expect(ok.body.urlPortada).toMatch(new RegExp(`^${ADM}/documentos/${creado.id}/portada\\?v=`));
      const sinMiniatura = await escritura(agente().put(`${ADM}/documentos/${creado.id}/portada`))
        .attach('portada', jpegFalso(720, 720), { filename: 'portada.jpg' })
        .expect(200);
      expect(sinMiniatura.body.urlMiniatura).toBeNull();
      const conPng = await escritura(agente().put(`${ADM}/documentos/${creado.id}/portada`))
        .attach('portada', jpegFalso(720, 720), { filename: 'portada.jpg' })
        .attach('miniatura', pngFalso(192, 192), { filename: 'mini.png' })
        .expect(200);
      const mini = await agente().get(`${PUB}/${creado.id}/miniatura`).expect(200);
      expect(mini.headers['content-type']).toBe('image/png');
      expect(conPng.body.urlMiniatura).toBeTruthy();
      await conSesion(agente().get(conPng.body.urlPortada as string)).expect(200);
    });

    it('editar registra los campos cambiados y mover la posición reordena', async () => {
      const res = await escritura(agente().put(`${ADM}/documentos/${creado.id}`))
        .send({
          ...completos,
          titulo: 'Boletín de prueba editado',
          orden: 3,
          claves: ['Normatividad', 'clave NUEVA de prueba', ...SEIS_CLAVES.slice(0, 4)],
        })
        .expect(200);
      expect(res.body).toMatchObject({ titulo: 'Boletín de prueba editado', orden: 3 });
      const listado = (await agente().get(PUB)).body as ListadoPublico;
      expect(listado.documentos[2].id).toBe(creado.id);
      expect(listado.documentos.map((d) => d.orden)).toEqual([1, 2, 3, 4, 5, 6]);
      const [cambio] = (await conSesion(agente().get(`${ADM}/cambios?limite=1`))).body.cambios;
      expect(cambio).toMatchObject({ accion: 'editar', documentoId: creado.id, usuario: USUARIO });
      expect(cambio.detalle).toBe('Cambió: título, posición');
    });

    it('borrado definitivo: despublicado y con confirmación; borra sus archivos', async () => {
      await escritura(agente().delete(`${ADM}/documentos/${creado.id}`)).send({ confirmarId: creado.id }).expect(409);
      await escritura(agente().post(`${ADM}/documentos/${creado.id}/despublicar`)).expect(200);
      await agente().get(`${PUB}/${creado.id}/ver`).expect(404);
      await escritura(agente().delete(`${ADM}/documentos/${creado.id}`)).send({ confirmarId: 'otro' }).expect(400);
      await escritura(agente().delete(`${ADM}/documentos/${creado.id}`)).expect(400);
      const antes = await contar('SELECT COUNT(*) FROM repositorio_almacen_archivos');
      await escritura(agente().delete(`${ADM}/documentos/${creado.id}`)).send({ confirmarId: creado.id }).expect(204);
      await conSesion(agente().get(`${ADM}/documentos/${creado.id}`)).expect(404);
      // PDF, portada y miniatura propios: se van los tres.
      expect(await contar('SELECT COUNT(*) FROM repositorio_almacen_archivos')).toBe(antes - 3);
      const listado = (await agente().get(PUB)).body as ListadoPublico;
      expect(listado.documentos.map((d) => d.orden)).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('categorías y palabras clave', () => {
    it('categorías: crear, repetida, mover y borrar con reglas', async () => {
      const nueva = await escritura(agente().post(`${ADM}/categorias`)).send({ nombre: 'Presentaciones' }).expect(201);
      expect(nueva.body).toMatchObject({ nombre: 'Presentaciones', orden: 4, documentos: 0 });
      await escritura(agente().post(`${ADM}/categorias`)).send({ nombre: 'ESTUDIO' }).expect(409);
      const movida = await escritura(agente().put(`${ADM}/categorias/${nueva.body.id}`)).send({ orden: 1 }).expect(200);
      expect(movida.body.orden).toBe(1);
      const { categorias } = (await conSesion(agente().get(`${ADM}/categorias`))).body;
      expect(categorias.map((c: { nombre: string }) => c.nombre)).toEqual([
        'Presentaciones',
        'Boletín',
        'Estudio',
        'Infografía',
      ]);
      const estudio = categorias.find((c: { nombre: string }) => c.nombre === 'Estudio');
      const ocupada = await escritura(agente().delete(`${ADM}/categorias/${estudio.id}`)).expect(409);
      expect(ocupada.body.mensaje).toMatch(/tiene 3 documentos/);
      await escritura(agente().delete(`${ADM}/categorias/${nueva.body.id}`)).expect(204);
      await escritura(agente().delete(`${ADM}/categorias/999999`)).expect(404);
      // El orden de las categorías se ve en el listado público.
      await escritura(agente().put(`${ADM}/categorias/${estudio.id}`)).send({ orden: 1 }).expect(200);
      expect(((await agente().get(PUB)).body as ListadoPublico).categorias[0]).toBe('Estudio');
    });

    it('palabras clave: renombrar a una existente las fusiona sin duplicar', async () => {
      const palabras = async (): Promise<Array<{ id: number; texto: string; documentos: number }>> =>
        (await conSesion(agente().get(`${ADM}/palabras-clave`))).body.palabras;
      const lista = await palabras();
      const norm = lista.find((p) => p.texto === 'Normatividad');
      const educacion = lista.find((p) => p.texto === 'Educación postsecundaria');
      expect(norm && educacion).toBeTruthy();
      await escritura(agente().delete(`${ADM}/palabras-clave/${norm!.id}`)).expect(409);
      // El boletín 19 tiene las dos: tras fusionar queda una sola, en su posición.
      const fusion = await escritura(agente().put(`${ADM}/palabras-clave/${norm!.id}`))
        .send({ texto: 'EDUCACION postsecundaria' })
        .expect(200);
      expect(fusion.body).toMatchObject({ id: educacion!.id, texto: 'EDUCACION postsecundaria', documentos: 2 });
      expect((await palabras()).some((p) => p.id === norm!.id)).toBe(false);
      const b19 = (await conSesion(agente().get(`${ADM}/documentos/${B19}`))).body as DocumentoAdmin;
      expect(b19.claves).toEqual(['EDUCACION postsecundaria']);
      // Renombrar sin fusionar.
      await escritura(agente().put(`${ADM}/palabras-clave/${educacion!.id}`))
        .send({ texto: 'Educación postsecundaria' })
        .expect(200);
      // Una palabra sin documentos se puede borrar.
      const huerfana = (await palabras()).find((p) => p.documentos === 0);
      if (huerfana) await escritura(agente().delete(`${ADM}/palabras-clave/${huerfana.id}`)).expect(204);
    });
  });

  it('registro de cambios: acciones con usuario y filtro por documento', async () => {
    const { cambios } = (await conSesion(agente().get(`${ADM}/cambios?limite=500`))).body;
    const acciones = new Set(cambios.map((c: { accion: string }) => c.accion));
    for (const accion of [
      'crear',
      'editar',
      'publicar',
      'despublicar',
      'borrar',
      'subir_archivo',
      'quitar_archivo',
      'subir_portada',
      'categoria',
      'palabra_clave',
      'sesion',
    ]) {
      expect(acciones).toContain(accion);
    }
    expect(cambios[0].id).toBeGreaterThan(cambios[1].id);
    const propios = (await conSesion(agente().get(`${ADM}/cambios?documento=${B19}`))).body.cambios;
    expect(propios.every((c: { documentoId: string }) => c.documentoId === B19)).toBe(true);
    await conSesion(agente().get(`${ADM}/cambios?limite=0`)).expect(400);
    expect(await contar('SELECT COUNT(*) FROM repositorio_cambios WHERE usuario IS NULL')).toBe(0);
  });

  it('listado de administración: todos los documentos con sus campos internos', async () => {
    await escritura(agente().post(`${ADM}/documentos/estudio-seguimiento-tablero/despublicar`)).expect(200);
    const { documentos } = (await conSesion(agente().get(`${ADM}/documentos`))).body as { documentos: DocumentoAdmin[] };
    expect(documentos).toHaveLength(5);
    const tablero = documentos.find((d) => d.id === 'estudio-seguimiento-tablero');
    expect(tablero).toMatchObject({ publicado: false, urlVerExterna: 'https://app.powerbi.com/view?r=abc', permiteDescarga: false });
    expect(documentos.find((d) => d.id === B19)?.notasInternas).toMatch(/^Evidencia:/);
    expect(((await agente().get(PUB)).body as ListadoPublico).total).toBe(4);
    await agente().get(`${PUB}/estudio-seguimiento-tablero/portada`).expect(404);
    await conSesion(agente().get(`${ADM}/documentos/estudio-seguimiento-tablero/portada`)).expect(200);
  });

  it('con la base caída el listado sigue con la última copia y los archivos dan 503', async () => {
    const bd = prueba.app.get(BaseDatosRepositorio);
    const lectura = prueba.app.get(ServicioLecturaRepositorio);
    const antes = await agente().get(PUB).expect(200);
    bd.marcarCaida(new Error('simulada'));
    lectura.invalidar();
    const durante = await agente().get(PUB).expect(200);
    expect(durante.body.total).toBe(antes.body.total);
    const archivo = await agente().get(`${PUB}/${B19}/ver`).expect(503);
    expect(archivo.body.codigo).toBe('no_disponible');
    await conSesion(agente().get(`${ADM}/documentos`)).expect(503);
    // Se recupera sola (reintento en segundo plano).
    const inicio = Date.now();
    let estado = 503;
    while (estado !== 200 && Date.now() - inicio < 10_000) {
      await new Promise((listo) => setTimeout(listo, 200));
      estado = (await agente().get(`${PUB}/${B19}/ver`)).status;
    }
    expect(estado).toBe(200);
  });
});
