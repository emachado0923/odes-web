import { createHash } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  type EvidenciaPai,
  LIMITES_PAI,
  type NumeroBimestre,
  type RespuestaSubidaPai,
  type SubidaPorPartesPai,
  RUTA_API_PAI,
  RUTAS_API_PAI,
} from '../src/pai/api-pai.js';
import { ALMACEN_PAI, MAX_SUBIDAS_PENDIENTES } from '../src/pai/evidencias/almacen-evidencias.js';
import { TAMANO_PARTE } from '../src/repositorio/archivos/subidas-por-partes.js';
import { ServicioEvidenciasPai } from '../src/pai/evidencias/servicio-evidencias.js';
import {
  ALMACEN_REPOSITORIO,
  borrarFichasHuerfanas,
  idsHuerfanos,
} from '../src/repositorio/archivos/almacen-archivos.js';
import { AlmacenArchivosSupabase, rutaObjeto } from '../src/repositorio/archivos/almacen-supabase.js';
import { crearAlmacenArchivos } from '../src/repositorio/archivos/crear-almacen.js';
import { MIME } from '../src/repositorio/archivos/tipos-archivo.js';
import { BaseDatosRepositorio } from '../src/repositorio/bd/base-datos.js';
import type { ResultadoEscritura } from '../src/repositorio/bd/conexion.js';
import type { ConfiguracionRepositorio } from '../src/repositorio/configuracion-repositorio.js';
import { crearDistTemporal, type DistTemporal } from './dist-temporal.js';
import {
  abrirBimestrePai,
  asignarPai,
  autorizarPai,
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
  cuerpoBinario,
  HAY_BD,
  MOTOR_PRUEBAS,
} from './repositorio-apoyo.js';
import { crearZip, pdfFalso, pngFalso } from './repositorio-fixtures.js';
import { crearStorageFalso, type StorageFalso } from './storage-falso.js';

/**
 * Evidencias del PAI (spec §5) contra una base DESECHABLE, en MySQL y en
 * Postgres (MYSQL_PRUEBAS / POSTGRES_PRUEBAS, ver repositorio-apoyo.ts), con
 * la autenticación y los permisos reales:
 *
 * - sin Supabase: trozos en la base, servidos con streaming (attachment con el
 *   nombre original, private, no-store) después de comprobar los permisos;
 * - con Supabase (storage-falso.ts): bucket PRIVADO del PAI, subida directa
 *   con URL firmada y descarga = 302 a una URL firmada de 60 s generada solo
 *   después de comprobar los permisos; nada va al bucket público;
 * - el PAI tiene su propio almacén (pai_almacen_archivos): el repositorio
 *   nunca reutiliza ni borra sus fichas, y el recolector de cada uno solo
 *   mira lo suyo.
 */

avisarSiNoHayBd('pai-evidencias.e2e-spec.ts');

const SILENCIO = { log: () => undefined, warn: () => undefined, error: () => undefined };
const BUCKET_PRIVADO = 'pai-evidencias';
const NOMBRE_ACTA = 'Acta de reunión N.º 4.pdf';

function sha256(datos: Buffer): string {
  return createHash('sha256').update(datos).digest('hex');
}

function xlsxFalso(): Buffer {
  return crearZip([
    { nombre: '[Content_Types].xml', datos: Buffer.from('<Types/>') },
    { nombre: 'xl/workbook.xml', datos: Buffer.from('<workbook/>') },
    { nombre: 'xl/worksheets/sheet1.xml', datos: Buffer.from('<worksheet/>') },
  ]);
}

interface Escenario {
  base: BasePrueba;
  config: ConfiguracionRepositorio;
  prueba: AppPrueba;
  dist: DistTemporal;
  bd: BaseDatosRepositorio;
  datos: FixturePai;
  ids: { resp: number; otro: number; admin: number };
  /** Responsable de SAF-TH (todos sus indicadores). */
  resp: SesionPaiPrueba;
  /** Responsable de SAF-AC: no ve los indicadores de SAF-TH. */
  otro: SesionPaiPrueba;
  admin: SesionPaiPrueba;
}

/** Base, app, vigencia con el bimestre 4 abierto, usuarios y sesiones. */
async function crearEscenario(
  prefijo: string,
  supabase: ConfiguracionRepositorio['supabase'] = null,
): Promise<Escenario> {
  const base = await crearBasePrueba(prefijo);
  const config: ConfiguracionRepositorio = { ...base.config, supabase };
  const dist = await crearDistTemporal();
  const bd = new BaseDatosRepositorio(config);
  bd.registro = SILENCIO;
  bd.iniciar();
  await bd.listo();
  const datos = await crearFixturePai(base, { bimestreAbierto: 4 });
  const resp = await crearUsuarioPai(base, { usuario: 'responsable.th', rol: 'responsable', nombre: 'Ana Responsable' });
  const otro = await crearUsuarioPai(base, { usuario: 'responsable.ac', rol: 'responsable', nombre: 'Otro Responsable' });
  const admin = await crearUsuarioPai(base, { usuario: 'planeacion', rol: 'administrador', nombre: 'Planeación' });
  await asignarPai(base, resp, { procesoId: datos.procesoTh });
  await asignarPai(base, otro, { procesoId: datos.procesoAc });
  const prueba = await crearAppRepositorio(
    config,
    dist.directorio,
    supabase ? { REPOSITORIO_SUPABASE_URL: supabase.url } : {},
  );
  return {
    base,
    config,
    prueba,
    dist,
    bd,
    datos,
    ids: { resp, otro, admin },
    resp: await iniciarSesionPai(prueba.servidor, 'responsable.th'),
    otro: await iniciarSesionPai(prueba.servidor, 'responsable.ac'),
    admin: await iniciarSesionPai(prueba.servidor, 'planeacion'),
  };
}

async function cerrarEscenario(escenario: Escenario | undefined): Promise<void> {
  await escenario?.prueba.cerrar();
  await escenario?.bd.cerrar();
  await escenario?.base.borrar();
  await escenario?.dist.limpiar();
}

function conSesion(r: request.Test, sesion: SesionPaiPrueba): request.Test {
  return r.set('Cookie', sesion.cookie).set('X-CSRF-Token', sesion.csrf);
}

/** Hace `horas` horas. */
function hace(horas: number): Date {
  return new Date(Date.now() - horas * 3_600_000);
}

/** Peticiones con la sesión (y el CSRF en las mutaciones). */
function clientePai(escenario: () => Escenario) {
  const agente = () => request(escenario().prueba.servidor);
  return {
    agente,
    preparar: (sesion: SesionPaiPrueba, indicadorId: number, b: NumeroBimestre) =>
      conSesion(agente().post(`${RUTA_API_PAI}${RUTAS_API_PAI.subidasEvidencia(indicadorId, b)}`), sesion),
    subir: (
      sesion: SesionPaiPrueba,
      indicadorId: number,
      b: NumeroBimestre,
      datos: Buffer,
      nombre: string,
      tipo = 'application/octet-stream',
    ) =>
      conSesion(agente().post(`${RUTA_API_PAI}${RUTAS_API_PAI.evidencias(indicadorId, b)}`), sesion).attach(
        'archivo',
        datos,
        { filename: nombre, contentType: tipo },
      ),
    iniciarPorPartes: (sesion: SesionPaiPrueba, indicadorId: number, b: NumeroBimestre, bytes: unknown) =>
      conSesion(agente().post(`${RUTA_API_PAI}${RUTAS_API_PAI.subidasPorPartesEvidencia(indicadorId, b)}`), sesion).send({
        bytes,
      }),
    parte: (sesion: SesionPaiPrueba, ruta: string, n: number, datos: Buffer) =>
      conSesion(agente().put(`${RUTA_API_PAI}${RUTAS_API_PAI.parteSubida(ruta, n)}`), sesion)
        .set('Content-Type', 'application/octet-stream')
        .send(datos),
    subirJson: (sesion: SesionPaiPrueba, indicadorId: number, b: NumeroBimestre, cuerpo: unknown) =>
      conSesion(agente().post(`${RUTA_API_PAI}${RUTAS_API_PAI.evidencias(indicadorId, b)}`), sesion).send(
        cuerpo as object,
      ),
    descargar: (sesion: SesionPaiPrueba | null, id: number) => {
      const r = agente().get(`${RUTA_API_PAI}${RUTAS_API_PAI.evidencia(id)}`);
      return sesion ? r.set('Cookie', sesion.cookie) : r;
    },
    borrar: (sesion: SesionPaiPrueba, id: number) =>
      conSesion(agente().delete(`${RUTA_API_PAI}${RUTAS_API_PAI.evidencia(id)}`), sesion),
  };
}

async function filaEvidencia(base: BasePrueba, id: number) {
  const [filas] = await base.admin.query<RowDataPacket[]>(
    `SELECT e.reporte_id, e.archivo_id, e.ruta_privada, e.nombre, e.tipo, e.bytes, e.subido_por,
            a.sha256, a.trozos, r.indicador_id, r.bimestre, r.origen, r.avance
       FROM pai_evidencias e
       JOIN pai_almacen_archivos a ON a.id = e.archivo_id
       JOIN pai_reportes r ON r.id = e.reporte_id
      WHERE e.id = ?`,
    [id],
  );
  return filas[0];
}

async function contar(base: BasePrueba, sql: string, valores: unknown[] = []): Promise<number> {
  const [filas] = await base.admin.query<RowDataPacket[]>(sql, valores);
  return Number(filas[0]!.n);
}

interface EntradaRegistroPrueba {
  usuario_id: number | null;
  usuario: string | null;
  accion: string;
  indicador_id: number | null;
  codigo_indicador: string | null;
  bimestre: number | null;
  detalle: Record<string, unknown> | null;
}

async function registro(base: BasePrueba, accion: string): Promise<EntradaRegistroPrueba[]> {
  const [filas] = await base.admin.query<Array<RowDataPacket & EntradaRegistroPrueba & { detalle: unknown }>>(
    'SELECT usuario_id, usuario, accion, indicador_id, codigo_indicador, bimestre, detalle FROM pai_registro WHERE accion = ? ORDER BY id',
    [accion],
  );
  return filas.map((fila) => ({
    ...fila,
    detalle: typeof fila.detalle === 'string' ? (JSON.parse(fila.detalle) as Record<string, unknown>) : null,
  }));
}

describe.skipIf(!HAY_BD)(`PAI con ${MOTOR_PRUEBAS}: evidencias en la base (trozos) (e2e)`, () => {
  let esc: Escenario;
  const api = clientePai(() => esc);
  /** PDF de 2,5 MB: cruza trozos de 1 MiB. */
  const acta = pdfFalso(2_500_000);
  let idActa = 0;

  beforeAll(async () => {
    esc = await crearEscenario('paievb');
  });

  afterAll(async () => {
    await cerrarEscenario(esc);
  });

  it('sin Supabase la subida no es directa (multipart o por partes) y la respuesta no se guarda en caché', async () => {
    const res = await api.preparar(esc.resp, esc.datos.indicadores.th01, 4).expect(200);
    expect(res.body as RespuestaSubidaPai).toEqual({
      directa: false,
      tamanoParte: TAMANO_PARTE,
      maxBytes: LIMITES_PAI.maxBytesEvidencia,
    });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('el responsable sube una evidencia: trozos en la base, reporte creado y registro', async () => {
    const res = await api.subir(esc.resp, esc.datos.indicadores.th01, 4, acta, NOMBRE_ACTA, 'application/pdf').expect(201);
    const evidencia = res.body as EvidenciaPai;
    idActa = evidencia.id;
    expect(evidencia).toEqual({
      id: expect.any(Number),
      nombre: NOMBRE_ACTA,
      tipo: MIME.pdf,
      bytes: acta.length,
      subidoEn: expect.any(String),
      subidoPor: 'Ana Responsable',
      urlDescarga: `${RUTA_API_PAI}/evidencias/${evidencia.id}`,
    });
    expect(res.headers['cache-control']).toBe('no-store');
    const fila = await filaEvidencia(esc.base, idActa);
    expect(fila).toMatchObject({ ruta_privada: null, nombre: NOMBRE_ACTA, tipo: MIME.pdf, origen: 'aplicativo', avance: null });
    expect(Number(fila!.bytes)).toBe(acta.length);
    expect(Number(fila!.subido_por)).toBe(esc.ids.resp);
    expect(Number(fila!.indicador_id)).toBe(esc.datos.indicadores.th01);
    expect(Number(fila!.bimestre)).toBe(4);
    expect(String(fila!.sha256).trim()).toBe(sha256(acta));
    expect(Number(fila!.trozos)).toBe(3);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_almacen_archivo_trozos WHERE archivo_id = ?', [fila!.archivo_id])).toBe(3);
    const [entrada] = await registro(esc.base, 'subir_evidencia');
    expect(entrada).toMatchObject({ usuario: 'responsable.th', codigo_indicador: 'SAF-TH-01' });
    expect(Number(entrada!.usuario_id)).toBe(esc.ids.resp);
    expect(Number(entrada!.bimestre)).toBe(4);
    expect(entrada!.detalle).toMatchObject({
      evidenciaId: idActa,
      nombre: NOMBRE_ACTA,
      tipo: MIME.pdf,
      bytes: acta.length,
      sha256: sha256(acta),
      motivo: 'abierto',
    });
  });

  it('acepta XLSX (detectado por su contenido)', async () => {
    const res = await api.subir(esc.resp, esc.datos.indicadores.th01, 4, xlsxFalso(), 'avance.xlsx').expect(201);
    expect((res.body as EvidenciaPai).tipo).toBe(MIME.xlsx);
  });

  it('después de la primera evidencia, guardar la casilla con el actualizadoEn null de antes no da un 409 falso (NEG-8)', async () => {
    // La primera evidencia creó un reporte vacío (con su actualizado_en).
    const ruta = `${RUTA_API_PAI}${RUTAS_API_PAI.reporte(esc.datos.indicadores.th01, 4)}`;
    const res = await conSesion(api.agente().put(ruta), esc.resp).send({ avance: 0, actualizadoEn: null }).expect(200);
    expect(res.body.reporte).toMatchObject({ avance: 0, evidencias: [{ id: idActa }, expect.anything()] });
    // Con datos ya guardados, el null sí es un conflicto (otra persona guardó).
    await conSesion(api.agente().put(ruta), esc.resp).send({ avance: 1, actualizadoEn: null }).expect(409);
  });

  it('descarga: adjunto con el nombre original, private, no-store, y con Range', async () => {
    const res = await api.descargar(esc.resp, idActa).buffer(true).parse(cuerpoBinario).expect(200);
    expect(sha256(res.body as Buffer)).toBe(sha256(acta));
    expect(res.headers).toMatchObject({
      'content-type': 'application/pdf',
      'content-length': String(acta.length),
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    });
    expect(res.headers['content-disposition']).toBe(
      "attachment; filename=\"Acta de reunion N.o 4.pdf\"; filename*=UTF-8''Acta%20de%20reuni%C3%B3n%20N.%C2%BA%204.pdf",
    );
    const parcial = await api
      .descargar(esc.resp, idActa)
      .set('Range', 'bytes=1048570-1048585')
      .buffer(true)
      .parse(cuerpoBinario)
      .expect(206);
    expect((parcial.body as Buffer).equals(acta.subarray(1048570, 1048586))).toBe(true);
  });

  it('descarga: el administrador sí; un responsable no asignado recibe 404 y sin sesión 401', async () => {
    const admin = await api.descargar(esc.admin, idActa).buffer(true).parse(cuerpoBinario).expect(200);
    expect(sha256(admin.body as Buffer)).toBe(sha256(acta));
    const ajeno = await api.descargar(esc.otro, idActa).expect(404);
    expect(ajeno.body).toMatchObject({ codigo: 'no_encontrado' });
    expect(ajeno.headers['content-disposition']).toBeUndefined();
    await api.descargar(null, idActa).expect(401);
    await api.descargar(esc.resp, 999_999).expect(404);
  });

  it('el administrador no sube ni borra (solo lectura): 403', async () => {
    const res = await api.subir(esc.admin, esc.datos.indicadores.th01, 4, pdfFalso(), 'a.pdf').expect(403);
    expect(res.body).toMatchObject({ codigo: 'prohibido' });
    await api.preparar(esc.admin, esc.datos.indicadores.th01, 4).expect(403);
    await api.borrar(esc.admin, idActa).expect(403);
  });

  /**
   * Un cuerpo multipart roto: si multer lo leyera primero respondería otro
   * error (o esperaría el resto); la guardia responde antes de leerlo.
   */
  const multipartRoto = (sesion: SesionPaiPrueba, indicadorId: number) =>
    conSesion(api.agente().post(`${RUTA_API_PAI}${RUTAS_API_PAI.evidencias(indicadorId, 4)}`), sesion)
      .set('Content-Type', 'multipart/form-data; boundary=----limite')
      .send(
        Buffer.concat([
          Buffer.from('------limite\r\nContent-Disposition: form-data; name="archivo"; filename="a.pdf"\r\n\r\n'),
          pdfFalso(200_000),
        ]),
      );

  it('multipart: el permiso se comprueba antes de que multer lea el archivo (SEG-2)', async () => {
    const roto = multipartRoto;
    const admin = await roto(esc.admin, esc.datos.indicadores.th01).expect(403);
    expect(admin.body).toMatchObject({ codigo: 'prohibido' });
    await roto(esc.otro, esc.datos.indicadores.th01).expect(404);
    // Con permiso, el mismo cuerpo roto sí llega a multer (y falla allí).
    const conPermiso = await roto(esc.resp, esc.datos.indicadores.th01);
    expect(conPermiso.status).not.toBe(403);
    expect(conPermiso.status).toBeGreaterThanOrEqual(400);
  });

  it('un responsable no sube a un indicador no asignado (404) ni a un bimestre cerrado (403)', async () => {
    const ajeno = await api.subir(esc.otro, esc.datos.indicadores.th01, 4, pdfFalso(), 'a.pdf').expect(404);
    expect(ajeno.body).toMatchObject({ codigo: 'no_encontrado' });
    await api.preparar(esc.otro, esc.datos.indicadores.th01, 4).expect(404);
    await api.borrar(esc.otro, idActa).expect(404);
    const cerrado = await api.subir(esc.resp, esc.datos.indicadores.th01, 3, pdfFalso(), 'a.pdf').expect(403);
    expect(cerrado.body).toMatchObject({ codigo: 'prohibido' });
    await api.preparar(esc.resp, esc.datos.indicadores.th01, 5).expect(403);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_evidencias')).toBe(2);
  });

  it('las mutaciones exigen el CSRF', async () => {
    const subida = await api
      .agente()
      .post(`${RUTA_API_PAI}${RUTAS_API_PAI.evidencias(esc.datos.indicadores.th01, 4)}`)
      .set('Cookie', esc.resp.cookie)
      .attach('archivo', pdfFalso(), 'a.pdf')
      .expect(403);
    expect(subida.body).toMatchObject({ codigo: 'prohibido' });
    await api
      .agente()
      .delete(`${RUTA_API_PAI}${RUTAS_API_PAI.evidencia(idActa)}`)
      .set('Cookie', esc.resp.cookie)
      .expect(403);
    expect(await filaEvidencia(esc.base, idActa)).toBeDefined();
  });

  it('rechaza tipos no permitidos (415), extensiones que no corresponden (415), vacíos (400) y sin archivo (400)', async () => {
    const id = esc.datos.indicadores.th02;
    const html = await api.subir(esc.resp, id, 4, Buffer.from('<html><body>%PDF-1.4</body></html>'), 'a.pdf').expect(415);
    expect(html.body).toMatchObject({ codigo: 'tipo_no_permitido', campos: { archivo: expect.any(String) } });
    await api.subir(esc.resp, id, 4, Buffer.from('MZ\x90\x00ejecutable'), 'programa.exe').expect(415);
    const disfrazado = await api.subir(esc.resp, id, 4, pngFalso(10, 10), 'informe.pdf', 'application/pdf').expect(415);
    expect(disfrazado.body.mensaje).toMatch(/su contenido es PNG/);
    await api.subir(esc.resp, id, 4, Buffer.alloc(0), 'vacio.pdf').expect(400);
    const sinArchivo = await api.subirJson(esc.resp, id, 4, {}).expect(400);
    expect(sinArchivo.body).toMatchObject({ codigo: 'solicitud_invalida', campos: { archivo: expect.any(String) } });
    // En la base no hay subidas directas: { subida } se trata como "sin archivo".
    await api.subirJson(esc.resp, id, 4, { subida: 'subidas/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d', nombre: 'a.pdf', tipo: '' }).expect(400);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_evidencias e JOIN pai_reportes r ON r.id = e.reporte_id WHERE r.indicador_id = ?', [id])).toBe(0);
  });

  it('una evidencia de más de una parte se sube por partes (Vercel no acepta más de 4,5 MB por petición)', async () => {
    const th03 = esc.datos.indicadores.th03;
    const pdf = pdfFalso(TAMANO_PARTE + 5000);
    const parte = (n: number): Buffer => pdf.subarray(n * TAMANO_PARTE, (n + 1) * TAMANO_PARTE);
    await api.iniciarPorPartes(esc.resp, th03, 4, 0).expect(400);
    await api.iniciarPorPartes(esc.resp, th03, 4, LIMITES_PAI.maxBytesEvidencia + 1).expect(413);
    // Sin permiso sobre el indicador: no empieza.
    await api.iniciarPorPartes(esc.otro, th03, 4, pdf.length).expect(404);
    const inicio = await api.iniciarPorPartes(esc.resp, th03, 4, pdf.length).expect(201);
    const { ruta, tamanoParte } = inicio.body as SubidaPorPartesPai;
    expect(ruta).toMatch(/^partes\/[0-9a-f-]{36}$/);
    expect(tamanoParte).toBe(TAMANO_PARTE);
    // Las partes solo las manda quien empezó la subida, con el tamaño exacto.
    await api.parte(esc.otro, ruta, 0, parte(0)).expect(400);
    await api.parte(esc.resp, ruta, 0, parte(0).subarray(2)).expect(400);
    await api.parte(esc.resp, ruta, 2, parte(1)).expect(400);
    for (const n of [1, 0]) await api.parte(esc.resp, ruta, n, parte(n)).expect(204);
    // Otro usuario no la usa.
    await api.subirJson(esc.otro, esc.datos.indicadores.ac01, 4, { subida: ruta, nombre: 'a.pdf', tipo: 'application/pdf' }).expect(400);
    const res = await api
      .subirJson(esc.resp, th03, 4, { subida: ruta, nombre: 'Informe por partes.pdf', tipo: 'application/pdf' })
      .expect(201);
    const evidencia = res.body as EvidenciaPai;
    expect(evidencia).toMatchObject({ nombre: 'Informe por partes.pdf', tipo: MIME.pdf, bytes: pdf.length });
    const bajada = await api.descargar(esc.resp, evidencia.id).buffer(true).parse(cuerpoBinario).expect(200);
    expect(sha256(bajada.body as Buffer)).toBe(sha256(pdf));
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_subidas WHERE ruta = ?', [ruta])).toBe(0);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_subida_partes')).toBe(0);
    await api.borrar(esc.resp, evidencia.id).expect(204);
  });

  it('por partes: incompleta da 400 y la subida ya no sirve; vencida tampoco', async () => {
    const th03 = esc.datos.indicadores.th03;
    const pdf = pdfFalso(TAMANO_PARTE + 5000);
    const { ruta } = (await api.iniciarPorPartes(esc.resp, th03, 4, pdf.length).expect(201)).body as SubidaPorPartesPai;
    await api.parte(esc.resp, ruta, 0, pdf.subarray(0, TAMANO_PARTE)).expect(204);
    const incompleta = await api.subirJson(esc.resp, th03, 4, { subida: ruta, nombre: 'a.pdf', tipo: 'application/pdf' }).expect(400);
    expect(incompleta.body.mensaje).toMatch(/1 de 2 partes/);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_subidas WHERE ruta = ?', [ruta])).toBe(0);

    const otra = (await api.iniciarPorPartes(esc.resp, th03, 4, pdf.length).expect(201)).body as SubidaPorPartesPai;
    await esc.base.admin.query('UPDATE pai_subidas SET creado_en = ? WHERE ruta = ?', [hace(3), otra.ruta]);
    await api.parte(esc.resp, otra.ruta, 0, pdf.subarray(0, TAMANO_PARTE)).expect(400);
    // La siguiente subida purga la vencida (con sus partes).
    const nueva = (await api.iniciarPorPartes(esc.resp, th03, 4, 10).expect(201)).body as SubidaPorPartesPai;
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_subidas WHERE ruta = ?', [otra.ruta])).toBe(0);
    await esc.base.admin.query('DELETE FROM pai_subidas WHERE ruta = ?', [nueva.ruta]);
  });

  it(`rechaza archivos de más de ${LIMITES_PAI.maxBytesEvidencia / 1024 / 1024} MB (413)`, async () => {
    const res = await api
      .subir(esc.resp, esc.datos.indicadores.th02, 4, pdfFalso(LIMITES_PAI.maxBytesEvidencia + 1), 'grande.pdf')
      .expect(413);
    expect(res.body).toMatchObject({ codigo: 'demasiado_grande' });
  });

  it(`máximo ${LIMITES_PAI.maxEvidenciasPorReporte} evidencias por reporte (409)`, async () => {
    const id = esc.datos.indicadores.th03;
    for (let i = 0; i < LIMITES_PAI.maxEvidenciasPorReporte; i++) {
      await api.subir(esc.resp, id, 4, pdfFalso(), `soporte-${i + 1}.pdf`).expect(201);
    }
    const res = await api.subir(esc.resp, id, 4, pdfFalso(), 'una-mas.pdf').expect(409);
    expect(res.body).toMatchObject({ codigo: 'conflicto' });
    await api.preparar(esc.resp, id, 4).expect(409);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_evidencias e JOIN pai_reportes r ON r.id = e.reporte_id WHERE r.indicador_id = ?', [id])).toBe(10);
  });

  it('una autorización vigente permite subir a un bimestre pasado (motivo autorizado)', async () => {
    await api.subir(esc.resp, esc.datos.indicadores.th02, 2, pdfFalso(), 'b2.pdf').expect(403);
    await autorizarPai(esc.base, { usuarioId: esc.ids.resp, bimestre: 2, indicadorId: esc.datos.indicadores.th02, otorgadaPor: esc.ids.admin });
    const res = await api.subir(esc.resp, esc.datos.indicadores.th02, 2, pdfFalso(), 'b2.pdf').expect(201);
    const entradas = await registro(esc.base, 'subir_evidencia');
    expect(entradas.at(-1)!.detalle).toMatchObject({ evidenciaId: (res.body as EvidenciaPai).id, motivo: 'autorizado' });
  });

  it('subidas simultáneas a un reporte nuevo: un solo reporte y no más del máximo', async () => {
    // Bimestre 1 autorizado: el reporte (SAF-TH-01, 1) todavía no existe.
    await autorizarPai(esc.base, { usuarioId: esc.ids.resp, bimestre: 1, procesoId: esc.datos.procesoTh });
    const total = LIMITES_PAI.maxEvidenciasPorReporte + 2;
    const respuestas = await Promise.all(
      Array.from({ length: total }, (_v, i) =>
        api.subir(esc.resp, esc.datos.indicadores.th01, 1, pdfFalso(3000), `simultanea-${i + 1}.pdf`),
      ),
    );
    const estados = respuestas.map((res) => res.status).toSorted();
    expect(estados).toEqual([
      ...Array<number>(LIMITES_PAI.maxEvidenciasPorReporte).fill(201),
      ...Array<number>(total - LIMITES_PAI.maxEvidenciasPorReporte).fill(409),
    ]);
    expect(
      await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_reportes WHERE indicador_id = ? AND bimestre = 1', [
        esc.datos.indicadores.th01,
      ]),
    ).toBe(1);
    expect(
      await contar(
        esc.base,
        'SELECT COUNT(*) AS n FROM pai_evidencias e JOIN pai_reportes r ON r.id = e.reporte_id WHERE r.indicador_id = ? AND r.bimestre = 1',
        [esc.datos.indicadores.th01],
      ),
    ).toBe(LIMITES_PAI.maxEvidenciasPorReporte);
  });

  it('el mismo contenido en dos reportes comparte la ficha; la ficha se borra con la última evidencia', async () => {
    const contenido = pdfFalso(5000);
    const a = (await api.subir(esc.resp, esc.datos.indicadores.th01, 4, contenido, 'copia-a.pdf').expect(201)).body as EvidenciaPai;
    const b = (await api.subir(esc.resp, esc.datos.indicadores.th02, 4, contenido, 'copia-b.pdf').expect(201)).body as EvidenciaPai;
    const filaA = await filaEvidencia(esc.base, a.id);
    const filaB = await filaEvidencia(esc.base, b.id);
    expect(Number(filaA!.archivo_id)).toBe(Number(filaB!.archivo_id));
    const archivoId = Number(filaA!.archivo_id);
    await api.borrar(esc.resp, a.id).expect(204);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_almacen_archivos WHERE id = ?', [archivoId])).toBe(1);
    const sigue = await api.descargar(esc.resp, b.id).buffer(true).parse(cuerpoBinario).expect(200);
    expect(sha256(sigue.body as Buffer)).toBe(sha256(contenido));
    await api.borrar(esc.resp, b.id).expect(204);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_almacen_archivos WHERE id = ?', [archivoId])).toBe(0);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_almacen_archivo_trozos WHERE archivo_id = ?', [archivoId])).toBe(0);
  });

  it('cada almacén recolecta solo sus fichas huérfanas', async () => {
    const fila = await filaEvidencia(esc.base, idActa);
    const archivoId = Number(fila!.archivo_id);
    // La ficha de la evidencia está solo en el almacén del PAI.
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM repositorio_almacen_archivos WHERE sha256 = ?', [fila!.sha256])).toBe(0);
    // Una ficha huérfana en cada almacén.
    const [huerfanaPai] = await esc.base.admin.query<ResultadoEscritura>(
      'INSERT INTO pai_almacen_archivos (sha256, mime, bytes, trozos, tamano_trozo) VALUES (?, ?, 0, 0, 1048576)',
      ['f'.repeat(64), MIME.pdf],
    );
    const [huerfanaRepositorio] = await esc.base.admin.query<ResultadoEscritura>(
      'INSERT INTO repositorio_almacen_archivos (sha256, mime, bytes, trozos, tamano_trozo) VALUES (?, ?, 0, 0, 1048576)',
      ['e'.repeat(64), MIME.pdf],
    );
    const huerfanos = await idsHuerfanos(esc.bd, ALMACEN_PAI);
    expect(huerfanos).toEqual([Number(huerfanaPai.insertId)]);
    expect(huerfanos).not.toContain(archivoId);
    expect(await esc.bd.transaccion((conexion) => borrarFichasHuerfanas(conexion, ALMACEN_PAI, [archivoId]))).toEqual([]);
    expect(await idsHuerfanos(esc.bd, ALMACEN_REPOSITORIO)).toEqual([Number(huerfanaRepositorio.insertId)]);

    // El recolector del repositorio (repositorio:importar) no toca el almacén del PAI...
    expect(await crearAlmacenArchivos(esc.bd).recolectarHuerfanos()).toEqual({ archivos: 1 });
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_almacen_archivos WHERE id = ?', [huerfanaPai.insertId])).toBe(1);
    // ...y el del PAI (pai:recolectar-evidencias) no toca el del repositorio.
    await esc.base.admin.query(
      'INSERT INTO repositorio_almacen_archivos (sha256, mime, bytes, trozos, tamano_trozo) VALUES (?, ?, 0, 0, 1048576)',
      ['e'.repeat(64), MIME.pdf],
    );
    const servicio = esc.prueba.app.get(ServicioEvidenciasPai);
    expect(await servicio.recolectarFichasHuerfanas()).toEqual({ archivos: 1 });
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_almacen_archivos WHERE id = ?', [huerfanaPai.insertId])).toBe(0);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM repositorio_almacen_archivos WHERE sha256 = ?', ['e'.repeat(64)])).toBe(1);
    await esc.base.admin.query('DELETE FROM repositorio_almacen_archivos WHERE sha256 = ?', ['e'.repeat(64)]);

    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_almacen_archivos WHERE id = ?', [archivoId])).toBe(1);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_almacen_archivo_trozos WHERE archivo_id = ?', [archivoId])).toBe(3);
    await api.descargar(esc.resp, idActa).expect(200);
  });

  it('un documento con el mismo PDF que una evidencia tiene su propia ficha; retirarlo no toca la evidencia', async () => {
    const fila = await filaEvidencia(esc.base, idActa);
    const archivoId = Number(fila!.archivo_id);
    const almacen = crearAlmacenArchivos(esc.bd);
    const guardado = await esc.bd.transaccion((conexion) => almacen.guardar(conexion, { datos: acta }, { mime: MIME.pdf }));
    expect(guardado.nuevo).toBe(true);
    expect(guardado.sha256).toBe(sha256(acta));
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM repositorio_almacen_archivo_trozos WHERE archivo_id = ?', [guardado.id])).toBe(3);
    const [categoria] = await esc.base.admin.query<ResultadoEscritura>(
      'INSERT INTO repositorio_categorias (nombre, orden) VALUES (?, ?)',
      ['Boletín', 1],
    );
    await esc.base.admin.query(
      "INSERT INTO repositorio_documentos (id, orden, titulo, categoria_id, idioma, tipo, archivo_id) VALUES ('doc-mismo-pdf', 1, 'Documento con el mismo PDF', ?, 'es', 'documento', ?)",
      [categoria.insertId, guardado.id],
    );
    await esc.bd.transaccion(async (conexion) => {
      await conexion.query('DELETE FROM repositorio_documentos WHERE id = ?', ['doc-mismo-pdf']);
      expect(await almacen.recolectar(conexion, [guardado.id])).toBe(1);
    });
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM repositorio_almacen_archivos WHERE sha256 = ?', [sha256(acta)])).toBe(0);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_almacen_archivo_trozos WHERE archivo_id = ?', [archivoId])).toBe(3);
    const sigue = await api.descargar(esc.resp, idActa).buffer(true).parse(cuerpoBinario).expect(200);
    expect(sha256(sigue.body as Buffer)).toBe(sha256(acta));
  });

  it('con el bimestre cerrado el responsable ya no borra (403) pero sí descarga', async () => {
    await abrirBimestrePai(esc.base, esc.datos.vigenciaId, null);
    try {
      const res = await api.borrar(esc.resp, idActa).expect(403);
      expect(res.body).toMatchObject({ codigo: 'prohibido' });
      await api.descargar(esc.resp, idActa).expect(200);
    } finally {
      await abrirBimestrePai(esc.base, esc.datos.vigenciaId, 4);
    }
  });

  it('borrar: 204, la ficha y sus trozos se van, queda el registro y la descarga da 404', async () => {
    const fila = await filaEvidencia(esc.base, idActa);
    const archivoId = Number(fila!.archivo_id);
    const res = await api.borrar(esc.resp, idActa).expect(204);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(await filaEvidencia(esc.base, idActa)).toBeUndefined();
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_almacen_archivos WHERE id = ?', [archivoId])).toBe(0);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_almacen_archivo_trozos WHERE archivo_id = ?', [archivoId])).toBe(0);
    const entradas = await registro(esc.base, 'borrar_evidencia');
    expect(entradas.at(-1)).toMatchObject({ usuario: 'responsable.th', codigo_indicador: 'SAF-TH-01' });
    expect(entradas.at(-1)!.detalle).toMatchObject({ evidenciaId: idActa, nombre: NOMBRE_ACTA, motivo: 'abierto' });
    await api.descargar(esc.resp, idActa).expect(404);
    await api.borrar(esc.resp, idActa).expect(404);
  });
});

describe.skipIf(!HAY_BD)(`PAI con ${MOTOR_PRUEBAS}: evidencias en el bucket privado de Supabase (e2e)`, () => {
  let esc: Escenario;
  let storage: StorageFalso;
  const api = clientePai(() => esc);
  const privado = () => storage.privados.get(BUCKET_PRIVADO)!;
  const acta = pdfFalso(300_000);
  let evidencia: EvidenciaPai;

  /** PUT a la URL firmada de subida, como el navegador. */
  async function subirDirecto(url: string, datos: Buffer, tipo = 'application/pdf'): Promise<void> {
    const firmada = new URL(url);
    await request(storage.url)
      .put(`${firmada.pathname}${firmada.search}`)
      .set('Content-Type', tipo)
      .set('x-upsert', 'false')
      .send(datos)
      .expect(200);
  }

  async function preparada(sesion: SesionPaiPrueba, indicadorId: number) {
    const res = await api.preparar(sesion, indicadorId, 4).expect(200);
    return res.body as Extract<RespuestaSubidaPai, { directa: true }>;
  }

  beforeAll(async () => {
    storage = await crearStorageFalso('repositorio', { privados: [BUCKET_PRIVADO] });
    esc = await crearEscenario('paievs', { url: storage.url, clave: storage.clave, bucket: storage.bucket });
  });

  afterAll(async () => {
    await cerrarEscenario(esc);
    await storage?.cerrar();
  });

  it('si el bucket de las evidencias es público no se sube ni se firma nada: 503 (BD-9)', async () => {
    storage.publicos.add(BUCKET_PRIVADO);
    try {
      const res = await api.preparar(esc.resp, esc.datos.indicadores.th01, 4).expect(503);
      expect(res.body).toMatchObject({ codigo: 'no_disponible' });
      expect(storage.peticiones.some((p) => p.includes('/upload/sign/'))).toBe(false);
    } finally {
      storage.publicos.delete(BUCKET_PRIVADO);
    }
    // Corregido el bucket, funciona sin reiniciar.
    const subida = await preparada(esc.resp, esc.datos.indicadores.th01);
    await esc.base.admin.query('DELETE FROM pai_subidas WHERE ruta = ?', [subida.ruta]);
  });

  it('subida directa: URL firmada al bucket PRIVADO, PUT y JSON; nada va al bucket público', async () => {
    const subida = await preparada(esc.resp, esc.datos.indicadores.th01);
    expect(subida).toMatchObject({ directa: true, maxBytes: LIMITES_PAI.maxBytesEvidencia });
    expect(subida.ruta).toMatch(/^subidas\/[0-9a-f-]{36}$/);
    expect(subida.url.startsWith(`${storage.url}/storage/v1/object/upload/sign/${BUCKET_PRIVADO}/${subida.ruta}?token=`)).toBe(true);
    await subirDirecto(subida.url, acta);
    expect(privado().has(subida.ruta)).toBe(true);

    const res = await api
      .subirJson(esc.resp, esc.datos.indicadores.th01, 4, { subida: subida.ruta, nombre: NOMBRE_ACTA, tipo: 'application/pdf' })
      .expect(201);
    evidencia = res.body as EvidenciaPai;
    expect(evidencia).toMatchObject({ nombre: NOMBRE_ACTA, tipo: MIME.pdf, bytes: acta.length, subidoPor: 'Ana Responsable' });
    // El temporal se borró; el contenido quedó en evidencias/<uuid>.pdf, sin caché.
    expect(privado().has(subida.ruta)).toBe(false);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_subidas WHERE ruta = ?', [subida.ruta])).toBe(0);
    const fila = await filaEvidencia(esc.base, evidencia.id);
    expect(fila!.ruta_privada).toMatch(/^evidencias\/[0-9a-f-]{36}\.pdf$/);
    const objeto = privado().get(String(fila!.ruta_privada))!;
    expect(sha256(objeto.datos)).toBe(sha256(acta));
    expect(objeto).toMatchObject({ tipo: MIME.pdf, cache: 'private, no-store' });
    // Ficha sin trozos ni objeto público.
    expect(Number(fila!.trozos)).toBe(0);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_almacen_archivo_trozos WHERE archivo_id = ?', [fila!.archivo_id])).toBe(0);
    expect([...storage.objetos.keys()]).toEqual([]);
  });

  it('descarga: 302 a una URL firmada de 60 s con el nombre original, private, no-store', async () => {
    const antes = storage.firmasDescarga.length;
    const res = await api.descargar(esc.resp, evidencia.id).redirects(0).expect(302);
    expect(res.headers['cache-control']).toBe('private, no-store');
    const fila = await filaEvidencia(esc.base, evidencia.id);
    const destino = new URL(res.headers.location as string);
    expect(`${destino.origin}${destino.pathname}`).toBe(
      `${storage.url}/storage/v1/object/sign/${BUCKET_PRIVADO}/${String(fila!.ruta_privada)}`,
    );
    expect(destino.searchParams.get('token')).toBeTruthy();
    expect(destino.searchParams.get('download')).toBe(NOMBRE_ACTA);
    expect(storage.firmasDescarga.slice(antes)).toEqual([
      { bucket: BUCKET_PRIVADO, ruta: String(fila!.ruta_privada), segundos: 60 },
    ]);
    const contenido = await request(storage.url)
      .get(`${destino.pathname}${destino.search}`)
      .buffer(true)
      .parse(cuerpoBinario)
      .expect(200);
    expect(sha256(contenido.body as Buffer)).toBe(sha256(acta));
    expect(contenido.headers['content-disposition']).toMatch(/^attachment/);
    // El bucket es privado: no hay URL pública.
    await request(storage.url).get(`/storage/v1/object/public/${BUCKET_PRIVADO}/${String(fila!.ruta_privada)}`).expect(400);
  });

  it('la URL firmada se genera solo después de comprobar los permisos', async () => {
    const antes = storage.firmasDescarga.length;
    await api.descargar(esc.otro, evidencia.id).redirects(0).expect(404);
    await api.descargar(null, evidencia.id).redirects(0).expect(401);
    expect(storage.firmasDescarga.length).toBe(antes);
    const admin = await api.descargar(esc.admin, evidencia.id).redirects(0).expect(302);
    expect(admin.headers.location).toContain(`/object/sign/${BUCKET_PRIVADO}/`);
    expect(storage.firmasDescarga.length).toBe(antes + 1);
  });

  it('multipart también funciona con Supabase (archivos pequeños): va al bucket privado', async () => {
    const res = await api.subir(esc.resp, esc.datos.indicadores.th02, 4, xlsxFalso(), 'avance.xlsx').expect(201);
    const fila = await filaEvidencia(esc.base, (res.body as EvidenciaPai).id);
    expect(fila!.ruta_privada).toMatch(/^evidencias\/[0-9a-f-]{36}\.xlsx$/);
    expect(privado().has(String(fila!.ruta_privada))).toBe(true);
    expect([...storage.objetos.keys()]).toEqual([]);
  });

  it('subida directa de más de 25 MB: 413, sin evidencia y sin objetos sobrantes', async () => {
    const subida = await preparada(esc.resp, esc.datos.indicadores.th03);
    await subirDirecto(subida.url, pdfFalso(LIMITES_PAI.maxBytesEvidencia + 1));
    const objetosAntes = privado().size;
    const res = await api
      .subirJson(esc.resp, esc.datos.indicadores.th03, 4, { subida: subida.ruta, nombre: 'grande.pdf', tipo: 'application/pdf' })
      .expect(413);
    expect(res.body).toMatchObject({ codigo: 'demasiado_grande' });
    expect(privado().has(subida.ruta)).toBe(false);
    expect(privado().size).toBe(objetosAntes - 1);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_evidencias e JOIN pai_reportes r ON r.id = e.reporte_id WHERE r.indicador_id = ?', [esc.datos.indicadores.th03])).toBe(0);
  });

  it('subida directa de un tipo no permitido: 415 y el temporal se borra', async () => {
    const subida = await preparada(esc.resp, esc.datos.indicadores.th03);
    await subirDirecto(subida.url, Buffer.from('<html>no</html>'), 'text/html');
    await api
      .subirJson(esc.resp, esc.datos.indicadores.th03, 4, { subida: subida.ruta, nombre: 'pagina.html', tipo: 'text/html' })
      .expect(415);
    expect(privado().has(subida.ruta)).toBe(false);
  });

  it('subida directa sin permiso (bimestre cerrado entre los dos pasos): 403 y el temporal se borra', async () => {
    const subida = await preparada(esc.resp, esc.datos.indicadores.th03);
    await subirDirecto(subida.url, pdfFalso());
    await abrirBimestrePai(esc.base, esc.datos.vigenciaId, null);
    try {
      await api
        .subirJson(esc.resp, esc.datos.indicadores.th03, 4, { subida: subida.ruta, nombre: 'a.pdf', tipo: 'application/pdf' })
        .expect(403);
    } finally {
      await abrirBimestrePai(esc.base, esc.datos.vigenciaId, 4);
    }
    expect(privado().has(subida.ruta)).toBe(false);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_subidas WHERE ruta = ?', [subida.ruta])).toBe(0);
  });

  it('subidas pendientes: cupo por usuario, ligadas a quien las pidió y purgadas al vencer (SEG-3)', async () => {
    await esc.base.admin.query('DELETE FROM pai_subidas');
    const th03 = esc.datos.indicadores.th03;
    const subidas: Extract<RespuestaSubidaPai, { directa: true }>[] = [];
    for (let i = 0; i < MAX_SUBIDAS_PENDIENTES; i++) subidas.push(await preparada(esc.resp, th03));
    const tope = await api.preparar(esc.resp, th03, 4).expect(429);
    expect(tope.body).toMatchObject({ codigo: 'demasiados_intentos' });
    expect(Number(tope.headers['retry-after'])).toBeGreaterThan(60);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_subidas WHERE usuario_id = ?', [esc.ids.resp])).toBe(MAX_SUBIDAS_PENDIENTES);
    // Otro responsable tiene su propio cupo.
    const deOtro = await preparada(esc.otro, esc.datos.indicadores.ac01);

    // La subida de otro usuario, o para otro indicador o bimestre: 400 y el objeto no se toca.
    const [primera] = subidas;
    await subirDirecto(primera.url, pdfFalso());
    const ajena = await api
      .subirJson(esc.otro, esc.datos.indicadores.ac01, 4, { subida: primera.ruta, nombre: 'a.pdf', tipo: 'application/pdf' })
      .expect(400);
    expect(ajena.body.mensaje).toMatch(/no es válida/);
    await api
      .subirJson(esc.resp, esc.datos.indicadores.th02, 4, { subida: primera.ruta, nombre: 'a.pdf', tipo: 'application/pdf' })
      .expect(400);
    expect(privado().has(primera.ruta)).toBe(true);
    // Su dueño la usa: 201 y se van el objeto y la fila.
    const usada = await api
      .subirJson(esc.resp, th03, 4, { subida: primera.ruta, nombre: 'a.pdf', tipo: 'application/pdf' })
      .expect(201);
    expect(privado().has(primera.ruta)).toBe(false);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_subidas WHERE ruta = ?', [primera.ruta])).toBe(0);
    await api.borrar(esc.resp, (usada.body as EvidenciaPai).id).expect(204);

    // Las pendientes vencidas (con o sin objeto) se purgan en la siguiente petición.
    const segunda = subidas[1];
    await subirDirecto(segunda.url, pdfFalso());
    await esc.base.admin.query('UPDATE pai_subidas SET creado_en = ? WHERE usuario_id = ?', [hace(3), esc.ids.resp]);
    const nueva = await preparada(esc.resp, th03);
    expect(privado().has(segunda.ruta)).toBe(false);
    const quedan = await esc.base.admin.query<RowDataPacket[]>('SELECT ruta FROM pai_subidas WHERE usuario_id = ?', [esc.ids.resp]);
    expect(quedan[0].map((f) => f.ruta)).toEqual([nueva.ruta]);
    await esc.base.admin.query('DELETE FROM pai_subidas WHERE ruta IN (?, ?)', [nueva.ruta, deOtro.ruta]);
  });

  it('subida directa con una ruta inválida o inexistente: 400', async () => {
    const invalida = await api
      .subirJson(esc.resp, esc.datos.indicadores.th03, 4, { subida: 'archivos/1-abc.pdf', nombre: 'a.pdf', tipo: '' })
      .expect(400);
    expect(invalida.body).toMatchObject({ codigo: 'solicitud_invalida', campos: { subida: expect.any(String) } });
    const inexistente = await api
      .subirJson(esc.resp, esc.datos.indicadores.th03, 4, {
        subida: 'subidas/0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d',
        nombre: 'a.pdf',
        tipo: '',
      })
      .expect(400);
    expect(inexistente.body.mensaje).toMatch(/vuelva a subir/);
  });

  it('el repositorio guarda los mismos bytes de una evidencia en su propio almacén, con objeto público', async () => {
    const fila = await filaEvidencia(esc.base, evidencia.id);
    const almacen = new AlmacenArchivosSupabase(esc.bd, esc.config.supabase!);
    const guardado = await esc.bd.transaccion((conexion) => almacen.guardar(conexion, { datos: acta }, { mime: MIME.pdf }));
    expect(guardado).toMatchObject({ nuevo: true, sha256: sha256(acta), trozos: 0 });
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM repositorio_almacen_archivos WHERE id = ?', [guardado.id])).toBe(1);
    const publico = rutaObjeto(guardado);
    expect(sha256(storage.objetos.get(publico)!.datos)).toBe(sha256(acta));
    expect(privado().has(String(fila!.ruta_privada))).toBe(true);
    // Sin documento que la use, la ficha del repositorio se va con su objeto público.
    expect(await esc.bd.transaccion((conexion) => almacen.recolectar(conexion, [guardado.id]))).toBe(1);
    await almacen.vaciarPendientes();
    expect(storage.objetos.has(publico)).toBe(false);
  });

  it('un documento retirado no queda público si una evidencia del PAI tiene los mismos bytes (SEG-4)', async () => {
    const fila = await filaEvidencia(esc.base, evidencia.id);
    const archivoId = Number(fila!.archivo_id);
    const almacen = new AlmacenArchivosSupabase(esc.bd, esc.config.supabase!);
    // El repositorio publica el mismo PDF: ficha propia y objeto público.
    const guardado = await esc.bd.transaccion((conexion) => almacen.guardar(conexion, { datos: acta }, { mime: MIME.pdf }));
    const [categoria] = await esc.base.admin.query<ResultadoEscritura>('INSERT INTO repositorio_categorias (nombre, orden) VALUES (?, ?)', [
      'Informes',
      2,
    ]);
    await esc.base.admin.query(
      "INSERT INTO repositorio_documentos (id, orden, titulo, categoria_id, idioma, tipo, archivo_id) VALUES ('doc-retirado', 1, 'Informe publicado por error', ?, 'es', 'documento', ?)",
      [categoria.insertId, guardado.id],
    );
    const publico = rutaObjeto(guardado);
    expect(storage.objetos.has(publico)).toBe(true);

    // Se retira el documento: su ficha y su objeto público se van; la evidencia sigue.
    await esc.bd.transaccion(async (conexion) => {
      await conexion.query('DELETE FROM repositorio_documentos WHERE id = ?', ['doc-retirado']);
      expect(await almacen.recolectar(conexion, [guardado.id])).toBe(1);
    });
    await almacen.vaciarPendientes();
    expect(storage.objetos.has(publico)).toBe(false);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_almacen_archivos WHERE id = ?', [archivoId])).toBe(1);
    expect(privado().has(String(fila!.ruta_privada))).toBe(true);
    await api.descargar(esc.resp, evidencia.id).redirects(0).expect(302);

    // La recolección de huérfanos del repositorio también quita un objeto
    // público que no tiene ficha.
    storage.objetos.set(publico, { datos: acta, tipo: MIME.pdf });
    await crearAlmacenArchivos(esc.bd).recolectarHuerfanos();
    expect(storage.objetos.has(publico)).toBe(false);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_almacen_archivos WHERE id = ?', [archivoId])).toBe(1);
  });

  it('el recolector del repositorio no toca el bucket privado ni las fichas de las evidencias', async () => {
    const fila = await filaEvidencia(esc.base, evidencia.id);
    storage.objetos.set('archivos/999999-perdido.pdf', { datos: Buffer.from('x'), tipo: 'application/pdf' });
    const privadosAntes = [...privado().keys()].toSorted();
    await crearAlmacenArchivos(esc.bd).recolectarHuerfanos();
    expect(storage.objetos.has('archivos/999999-perdido.pdf')).toBe(false);
    expect([...privado().keys()].toSorted()).toEqual(privadosAntes);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_almacen_archivos WHERE id = ?', [fila!.archivo_id])).toBe(1);
    await api.descargar(esc.resp, evidencia.id).redirects(0).expect(302);
  });

  it('la recolección de huérfanos del repositorio termina de borrar los objetos públicos antes de volver (REG-5)', async () => {
    const sha = createHash('sha256').update('ficha huérfana de prueba').digest('hex');
    const [resultado] = await esc.base.admin.query<ResultadoEscritura>(
      'INSERT INTO repositorio_almacen_archivos (sha256, mime, bytes, trozos, tamano_trozo, ancho, alto, creado_en) VALUES (?, ?, ?, 0, ?, NULL, NULL, ?)',
      [sha, MIME.pdf, 1234, 1024 * 1024, new Date()],
    );
    const ruta = rutaObjeto({ id: Number(resultado.insertId), sha256: sha, mime: MIME.pdf });
    storage.objetos.set(ruta, { datos: Buffer.from('x'), tipo: MIME.pdf });
    const { archivos } = await crearAlmacenArchivos(esc.bd).recolectarHuerfanos();
    expect(archivos).toBeGreaterThanOrEqual(1);
    // Sin esperar ningún temporizador: la CLI cierra la base y termina justo después.
    expect(storage.objetos.has(ruta)).toBe(false);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM repositorio_almacen_archivos WHERE id = ?', [resultado.insertId])).toBe(0);
  });

  it('la recolección del PAI quita objetos privados sin evidencia y subidas viejas', async () => {
    const huerfano = 'evidencias/00000000-0000-4000-8000-0000000000aa.pdf';
    const reciente = 'evidencias/00000000-0000-4000-8000-0000000000bb.pdf';
    const subidaVieja = 'subidas/00000000-0000-4000-8000-0000000000cc';
    const subidaNueva = 'subidas/00000000-0000-4000-8000-0000000000dd';
    privado().set(huerfano, { datos: Buffer.from('x'), tipo: MIME.pdf, creado: hace(2) });
    privado().set(reciente, { datos: Buffer.from('x'), tipo: MIME.pdf, creado: hace(0.1) });
    privado().set(subidaVieja, { datos: Buffer.from('x'), tipo: MIME.pdf, creado: hace(30) });
    privado().set(subidaNueva, { datos: Buffer.from('x'), tipo: MIME.pdf, creado: hace(1) });
    const fila = await filaEvidencia(esc.base, evidencia.id);
    privado().get(String(fila!.ruta_privada))!.creado = hace(48);

    const resultado = await esc.prueba.app.get(ServicioEvidenciasPai).recolectarHuerfanos();
    expect(resultado).toEqual({ objetos: 1, subidas: 1 });
    expect(privado().has(huerfano)).toBe(false);
    expect(privado().has(subidaVieja)).toBe(false);
    expect(privado().has(reciente)).toBe(true);
    expect(privado().has(subidaNueva)).toBe(true);
    expect(privado().has(String(fila!.ruta_privada))).toBe(true);
    privado().delete(reciente);
    privado().delete(subidaNueva);
  });

  it('borrar: 204, se quitan la fila, la ficha y el objeto privado', async () => {
    const fila = await filaEvidencia(esc.base, evidencia.id);
    await api.borrar(esc.resp, evidencia.id).expect(204);
    expect(await filaEvidencia(esc.base, evidencia.id)).toBeUndefined();
    expect(privado().has(String(fila!.ruta_privada))).toBe(false);
    expect(await contar(esc.base, 'SELECT COUNT(*) AS n FROM pai_almacen_archivos WHERE id = ?', [fila!.archivo_id])).toBe(0);
    await api.descargar(esc.resp, evidencia.id).redirects(0).expect(404);
  });
});
