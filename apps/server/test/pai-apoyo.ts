import type { Server } from 'node:http';
import request from 'supertest';
import {
  COOKIE_SESION_PAI,
  type NumeroBimestre,
  RUTA_API_PAI,
  type RolPai,
  type SesionPai,
} from '../src/pai/api-pai.js';
import type { ResultadoEscritura } from '../src/repositorio/bd/conexion.js';
import { hashContrasena } from '../src/repositorio/dominio/contrasenas.js';
import type { BasePrueba } from './repositorio-apoyo.js';

/**
 * Apoyo de las pruebas e2e del PAI con base (MySQL o Postgres desechable, ver
 * repositorio-apoyo.ts: crearBasePrueba('pai'), crearAppRepositorio). Todo se
 * escribe con base.admin (cuenta administradora de la base de prueba), con
 * `?` como marcador en los dos motores.
 *
 *   const base = await crearBasePrueba('pai');
 *   const datos = await crearFixturePai(base, { bimestreAbierto: 4 });
 *   const id = await crearUsuarioPai(base, { usuario: 'resp', rol: 'responsable' });
 *   await asignarPai(base, id, { procesoId: datos.procesoTh });
 *   const sesion = await iniciarSesionPai(servidor, 'resp');
 */

/** Contraseña de las cuentas de prueba (solo para bases desechables). */
export const CONTRASENA_PRUEBA_PAI = 'clave-de-prueba-del-pai-2026';

async function insertar(
  base: BasePrueba,
  sql: string,
  valores: readonly unknown[],
): Promise<number> {
  const [resultado] = await base.admin.query<ResultadoEscritura>(sql, valores);
  const id = Number(resultado.insertId);
  if (!id) throw new Error(`INSERT sin id: ${sql.slice(0, 60)}`);
  return id;
}

export interface DatosUsuarioPruebaPai {
  usuario: string;
  rol: RolPai;
  nombre?: string;
  contrasena?: string;
  activo?: boolean;
  debeCambiarContrasena?: boolean;
  correo?: string | null;
}

/** Inserta un usuario del PAI (contraseña con scrypt) y devuelve su id. */
export async function crearUsuarioPai(
  base: BasePrueba,
  datos: DatosUsuarioPruebaPai,
): Promise<number> {
  return insertar(
    base,
    'INSERT INTO pai_usuarios (usuario, nombre, correo, rol, hash_contrasena, debe_cambiar_contrasena, activo) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [
      datos.usuario,
      datos.nombre ?? `Usuario ${datos.usuario}`,
      datos.correo ?? null,
      datos.rol,
      await hashContrasena(datos.contrasena ?? CONTRASENA_PRUEBA_PAI),
      datos.debeCambiarContrasena ? 1 : 0,
      datos.activo === false ? 0 : 1,
    ],
  );
}

export interface SesionPaiPrueba {
  /** Para la cabecera Cookie: "pai_sesion=…". */
  cookie: string;
  /** Para la cabecera X-CSRF-Token. */
  csrf: string;
  sesion: SesionPai;
}

/** POST /api/pai/sesion y devuelve la cookie y el token CSRF (falla si no es 200). */
export async function iniciarSesionPai(
  servidor: Server,
  usuario: string,
  contrasena = CONTRASENA_PRUEBA_PAI,
): Promise<SesionPaiPrueba> {
  const res = await request(servidor)
    .post(`${RUTA_API_PAI}/sesion`)
    .send({ usuario, contrasena })
    .expect(200);
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith(`${COOKIE_SESION_PAI}=`));
  if (!cookie) throw new Error('Sin cookie de sesión del PAI');
  const sesion = res.body as SesionPai;
  return { cookie: cookie.split(';')[0], csrf: sesion.csrf, sesion };
}

export interface OpcionesFixturePai {
  anio?: number;
  bimestreAbierto?: NumeroBimestre | null;
  abiertoHasta?: Date | null;
}

/**
 * Estructura mínima de una vigencia (ids para las pruebas):
 *
 *   SAF (dependencia)
 *   ├── SAF-TH proceso "Gestión del Talento Humano" (riesgos R1 corrupción, R2)
 *   │   ├── acción 1 (R1, R2): SAF-TH-01 numero, metas 1,0,1,0,1,0 = 3, suma, sin tope
 *   │   │                      SAF-TH-02 porcentaje, metas 0,50,0,50,0,0 = 100, suma, con tope
 *   │   └── acción 2 (R2):     SAF-TH-03 a_demanda, metas 100×6 = 100, suma_dividida/6, con tope
 *   └── SAF-AC proyecto "Atención a la Ciudadanía"
 *       └── acción 1:          SAF-AC-01 numero, metas 0,0,2,0,0,2 = 4, suma, mixto
 */
export interface FixturePai {
  anio: number;
  vigenciaId: number;
  dependenciaId: number;
  procesoTh: number;
  procesoAc: number;
  riesgos: [number, number];
  acciones: { th1: number; th2: number; ac1: number };
  indicadores: { th01: number; th02: number; th03: number; ac01: number };
}

export async function crearFixturePai(
  base: BasePrueba,
  opciones: OpcionesFixturePai = {},
): Promise<FixturePai> {
  const anio = opciones.anio ?? 2026;
  const bimestreAbierto = opciones.bimestreAbierto ?? null;
  const vigenciaId = await insertar(
    base,
    'INSERT INTO pai_vigencias (anio, bimestre_abierto, abierto_hasta) VALUES (?, ?, ?)',
    [anio, bimestreAbierto, bimestreAbierto ? (opciones.abiertoHasta ?? null) : null],
  );
  const dependenciaId = await insertar(
    base,
    'INSERT INTO pai_dependencias (vigencia_id, sigla, nombre, orden) VALUES (?, ?, ?, ?)',
    [vigenciaId, 'SAF', 'Subdirección Administrativa, Financiera y de Apoyo a la Gestión', 1],
  );
  const proceso = (clave: string, codigo: string, nombre: string, tipo: string, orden: number) =>
    insertar(
      base,
      'INSERT INTO pai_procesos (vigencia_id, dependencia_id, clave, codigo, nombre, hoja, tipo, linea_plan_desarrollo, objetivo, orden) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        vigenciaId,
        dependenciaId,
        clave,
        codigo,
        nombre,
        nombre.toUpperCase(),
        tipo,
        '1. Creemos en la educación y en las oportunidades para el bienestar económico',
        `Objetivo de ${nombre}`,
        orden,
      ],
    );
  const procesoTh = await proceso('saf-talento-humano', 'SAF-TH', 'Gestión del Talento Humano', 'proceso', 1);
  const procesoAc = await proceso('saf-atencion-ciudadania', 'SAF-AC', 'Atención a la Ciudadanía', 'proyecto', 2);
  const riesgo = (orden: number, texto: string, corrupcion: number) =>
    insertar(
      base,
      'INSERT INTO pai_riesgos (proceso_id, orden, numeral, texto, descripcion, corrupcion, bloque) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [procesoTh, orden, orden, `${orden}. ${texto}`, texto, corrupcion, 1],
    );
  const r1 = await riesgo(1, 'Recibir dádivas por realizar trámites (RC)', 1);
  const r2 = await riesgo(2, 'Pérdida de información de las historias laborales', 0);
  const accion = (procesoId: number, orden: number, descripcion: string) =>
    insertar(base, 'INSERT INTO pai_acciones (proceso_id, orden, descripcion) VALUES (?, ?, ?)', [
      procesoId,
      orden,
      descripcion,
    ]);
  const th1 = await accion(procesoTh, 1, 'Formular y publicar el plan de talento humano');
  const th2 = await accion(procesoTh, 2, 'Acompañar las solicitudes de las áreas');
  const ac1 = await accion(procesoAc, 1, 'Evaluar el servicio de atención a la ciudadanía');
  for (const [accionId, riesgoId, orden] of [
    [th1, r1, 1],
    [th1, r2, 2],
    [th2, r2, 1],
  ]) {
    await base.admin.query('INSERT INTO pai_accion_riesgos (accion_id, riesgo_id, orden) VALUES (?, ?, ?)', [
      accionId,
      riesgoId,
      orden,
    ]);
  }
  const indicador = (
    procesoId: number,
    accionId: number,
    codigo: string,
    orden: number,
    nombre: string,
    tipoMeta: string,
    metas: number[],
    metaTotal: number,
    regla: [string, number | null],
    tope100: number | null,
    topePorBimestre: string | null = null,
  ) =>
    insertar(
      base,
      'INSERT INTO pai_indicadores (vigencia_id, proceso_id, accion_id, codigo, orden, nombre, tipo_meta, meta_1, meta_2, meta_3, meta_4, meta_5, meta_6, meta_total, regla_meta_total, divisor_meta_total, regla_avance_total, divisor_avance_total, tope_100, tope_por_bimestre, productos, rol_responsable, responsable, corresponsables) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        vigenciaId,
        procesoId,
        accionId,
        codigo,
        orden,
        nombre,
        tipoMeta,
        ...metas,
        metaTotal,
        regla[0],
        regla[1],
        regla[0],
        regla[1],
        tope100,
        topePorBimestre,
        `Productos de ${codigo}`,
        'Responsable:\nLíder del proceso',
        'Líder del proceso',
        'Subdirector(a)',
      ],
    );
  const th01 = await indicador(procesoTh, th1, 'SAF-TH-01', 1, 'Número de planes publicados', 'numero', [1, 0, 1, 0, 1, 0], 3, ['suma', null], 0);
  const th02 = await indicador(procesoTh, th1, 'SAF-TH-02', 2, 'Porcentaje de avance del plan', 'porcentaje', [0, 50, 0, 50, 0, 0], 100, ['suma', null], 1);
  const th03 = await indicador(procesoTh, th2, 'SAF-TH-03', 1, 'Solicitudes atendidas (a demanda)', 'a_demanda', [100, 100, 100, 100, 100, 100], 100, ['suma_dividida', 6], 1);
  const ac01 = await indicador(
    procesoAc,
    ac1,
    'SAF-AC-01',
    1,
    'Número de encuestas de satisfacción',
    'numero',
    [0, 0, 2, 0, 0, 2],
    4,
    ['suma', null],
    null,
    '{"1":true,"2":true,"3":false,"4":false,"5":false,"6":false,"total":false}',
  );
  return {
    anio,
    vigenciaId,
    dependenciaId,
    procesoTh,
    procesoAc,
    riesgos: [r1, r2],
    acciones: { th1, th2, ac1 },
    indicadores: { th01, th02, th03, ac01 },
  };
}

/** Asigna un proceso completo o un indicador suelto a un usuario. */
export async function asignarPai(
  base: BasePrueba,
  usuarioId: number,
  destino: { procesoId: number } | { indicadorId: number },
): Promise<number> {
  return insertar(base, 'INSERT INTO pai_asignaciones (usuario_id, proceso_id, indicador_id) VALUES (?, ?, ?)', [
    usuarioId,
    'procesoId' in destino ? destino.procesoId : null,
    'indicadorId' in destino ? destino.indicadorId : null,
  ]);
}

/** Abre (1-6) o cierra (null) el bimestre de una vigencia. */
export async function abrirBimestrePai(
  base: BasePrueba,
  vigenciaId: number,
  bimestre: NumeroBimestre | null,
  abiertoHasta: Date | null = null,
): Promise<void> {
  await base.admin.query('UPDATE pai_vigencias SET bimestre_abierto = ?, abierto_hasta = ? WHERE id = ?', [
    bimestre,
    bimestre ? abiertoHasta : null,
    vigenciaId,
  ]);
}

/** Inserta una autorización (por defecto, vigente un día). */
export async function autorizarPai(
  base: BasePrueba,
  datos: {
    usuarioId: number;
    bimestre: NumeroBimestre;
    procesoId?: number | null;
    indicadorId?: number | null;
    vigenteHasta?: Date;
    revocadaEn?: Date | null;
    otorgadaPor?: number | null;
  },
): Promise<number> {
  return insertar(
    base,
    'INSERT INTO pai_autorizaciones (usuario_id, bimestre, proceso_id, indicador_id, vigente_hasta, motivo, otorgada_por, revocada_en) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      datos.usuarioId,
      datos.bimestre,
      datos.procesoId ?? null,
      datos.indicadorId ?? null,
      datos.vigenteHasta ?? new Date(Date.now() + 86_400_000),
      'Autorización de prueba',
      datos.otorgadaPor ?? null,
      datos.revocadaEn ?? null,
    ],
  );
}

/** Inserta un reporte importado (historial) y devuelve su id. */
export async function crearReportePai(
  base: BasePrueba,
  datos: {
    indicadorId: number;
    bimestre: NumeroBimestre;
    avance?: number | null;
    logros?: string | null;
    origen?: 'importado' | 'aplicativo';
  },
): Promise<number> {
  return insertar(
    base,
    'INSERT INTO pai_reportes (indicador_id, bimestre, avance, logros, origen) VALUES (?, ?, ?, ?, ?)',
    [datos.indicadorId, datos.bimestre, datos.avance ?? null, datos.logros ?? null, datos.origen ?? 'importado'],
  );
}
