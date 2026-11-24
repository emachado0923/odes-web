import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { ArchivoRecibidoCrm, ServicioArchivosCrm } from '../archivos/servicio-archivos-crm.js';
import type { BaseDatosRepositorio, Conexion, ResultadoEscritura } from '../../repositorio/bd/base-datos.js';
import { traducirAPostgres } from '../../repositorio/bd/conexion.js';
import { ErrorRepositorioHttp } from '../../repositorio/errores-repositorio.js';
import {
  aBooleano,
  aContactoPersonaCrm,
  aConteoTareas,
  aPersonaAdminCrm,
  aPersonaCrm,
  consultaConteos,
  conteoVacio,
  type FilaConteoTareas,
  type FilaPersonaCrm,
  urlFotoPersona,
} from './mapeo-personas.js';
import { ServicioPersonasCrm } from './servicio-personas-crm.js';
import {
  esIdPersona,
  idPersonaDeRuta,
  validarCambiosPersona,
  validarPersonaNueva,
} from './validacion-personas.js';

// El almacén lo implementa otra parte: aquí solo hace falta la clase (token de Nest).
vi.mock('../archivos/servicio-archivos-crm.js', () => ({
  ServicioArchivosCrm: class ServicioArchivosCrmFalso {
    readonly falso = true;
  },
  LIMITES_MULTER_FOTO_CRM: {},
}));

function errorDe(accion: () => unknown): ErrorRepositorioHttp {
  try {
    accion();
  } catch (error) {
    if (error instanceof ErrorRepositorioHttp) return error;
    throw error;
  }
  throw new Error('No lanzó ningún error.');
}

async function errorDeAsync(promesa: Promise<unknown>): Promise<ErrorRepositorioHttp> {
  try {
    await promesa;
  } catch (error) {
    if (error instanceof ErrorRepositorioHttp) return error;
    throw error;
  }
  throw new Error('No lanzó ningún error.');
}

/** Columnas de una fila de crm_personas (sin lo heredado de RowDataPacket). */
interface DatosFila {
  id?: number;
  nombre?: string;
  correo?: string;
  es_lider?: number;
  activo?: number;
  puede_crear_tareas?: number;
  orden?: number;
  foto_archivo_id?: number | null;
  foto_version?: number;
}

function fila(datos: DatosFila = {}): FilaPersonaCrm {
  return {
    id: 3,
    nombre: 'Luciana Vélez Arenas',
    correo: 'luciana@sapiencia.gov.co',
    es_lider: 0,
    activo: 1,
    puede_crear_tareas: 0,
    orden: 2,
    foto_archivo_id: null,
    foto_version: 0,
    ...datos,
  } as unknown as FilaPersonaCrm;
}

// ── Validación ──────────────────────────────────────────────────────────────

describe('validarPersonaNueva', () => {
  it('recorta el nombre, colapsa espacios, pasa el correo a minúsculas y esLider es false por defecto', () => {
    expect(validarPersonaNueva({ nombre: '  Ana   María\tPérez ', correo: '  Ana.Perez@Sapiencia.GOV.co ' })).toEqual({
      nombre: 'Ana María Pérez',
      correo: 'ana.perez@sapiencia.gov.co',
      esLider: false,
    });
    expect(validarPersonaNueva({ nombre: 'Jose', correo: 'jose@x.co', esLider: true }).esLider).toBe(true);
  });

  it('cuenta el largo del nombre en caracteres (1 a 120)', () => {
    expect(validarPersonaNueva({ nombre: '😀'.repeat(120), correo: 'a@x.co' }).nombre).toHaveLength(240);
    const largo = errorDe(() => validarPersonaNueva({ nombre: 'ñ'.repeat(121), correo: 'a@x.co' }));
    expect(largo.getStatus()).toBe(400);
    expect(largo.codigo).toBe('solicitud_invalida');
    expect(largo.campos).toEqual({ nombre: 'El nombre: máximo 120 caracteres.' });
    expect(errorDe(() => validarPersonaNueva({ nombre: '   ', correo: 'a@x.co' })).campos).toEqual({
      nombre: 'Escriba el nombre.',
    });
  });

  it('exige un correo válido de máximo 254 caracteres', () => {
    expect(errorDe(() => validarPersonaNueva({ nombre: 'Ana' })).campos).toEqual({ correo: 'Escriba el correo.' });
    expect(errorDe(() => validarPersonaNueva({ nombre: 'Ana', correo: '  ' })).campos).toEqual({
      correo: 'Escriba el correo.',
    });
    for (const correo of ['ana@', 'ana perez@x.co', 'ana@x', 'a\u0001b@x.co', 'ana@@x.co']) {
      expect(errorDe(() => validarPersonaNueva({ nombre: 'Ana', correo })).campos?.correo).toMatch(/correo válido/);
    }
    expect(validarPersonaNueva({ nombre: 'Ana', correo: `${'a'.repeat(249)}@x.co` }).correo).toHaveLength(254);
    expect(errorDe(() => validarPersonaNueva({ nombre: 'Ana', correo: `${'a'.repeat(250)}@x.co` })).campos).toEqual({
      correo: 'El correo: máximo 254 caracteres.',
    });
  });

  it('rechaza esLider que no sea booleano y un cuerpo que no sea objeto', () => {
    expect(errorDe(() => validarPersonaNueva({ nombre: 'Ana', correo: 'a@x.co', esLider: 'si' })).campos).toHaveProperty(
      'esLider',
    );
    for (const cuerpo of [null, [], 'texto', 3]) {
      const error = errorDe(() => validarPersonaNueva(cuerpo));
      expect(error.getStatus()).toBe(400);
      expect(error.cuerpo.mensaje).toBe('Envíe los datos como un objeto JSON.');
      expect(error.campos).toBeUndefined();
    }
  });
});

describe('validarCambiosPersona', () => {
  it('devuelve solo los campos que vinieron, normalizados', () => {
    expect(validarCambiosPersona({ orden: 0 })).toEqual({ orden: 0 });
    expect(validarCambiosPersona({ orden: 9999, activo: false })).toEqual({ orden: 9999, activo: false });
    expect(validarCambiosPersona({ puedeCrearTareas: true })).toEqual({ puedeCrearTareas: true });
    expect(validarCambiosPersona({ puedeCrearTareas: false })).toEqual({ puedeCrearTareas: false });
    expect(validarCambiosPersona({ nombre: ' Jose  David ', correo: 'X@Y.CO' })).toEqual({
      nombre: 'Jose David',
      correo: 'x@y.co',
    });
  });

  it('exige al menos un campo conocido', () => {
    expect(errorDe(() => validarCambiosPersona({})).cuerpo.mensaje).toMatch(/al menos un cambio/);
    expect(errorDe(() => validarCambiosPersona({ esLider: true, id: 4 })).cuerpo.mensaje).toMatch(/al menos un cambio/);
  });

  it('rechaza orden fuera de 0–9999 o no entero, activo no booleano y nombre vacío', () => {
    for (const orden of [-1, 10000, 1.5, '3', null, Number.NaN]) {
      expect(errorDe(() => validarCambiosPersona({ orden })).campos).toHaveProperty('orden');
    }
    expect(errorDe(() => validarCambiosPersona({ activo: 'no' })).campos).toHaveProperty('activo');
    expect(errorDe(() => validarCambiosPersona({ puedeCrearTareas: 1 })).campos).toHaveProperty('puedeCrearTareas');
    expect(errorDe(() => validarCambiosPersona({ nombre: '' })).campos).toEqual({ nombre: 'Escriba el nombre.' });
    expect(errorDe(() => validarCambiosPersona({ correo: 'sin-arroba' })).campos).toHaveProperty('correo');
  });
});

describe('ids de persona', () => {
  it('acepta enteros positivos hasta 2147483647 y responde 404 con lo demás', () => {
    expect(idPersonaDeRuta('1')).toBe(1);
    expect(idPersonaDeRuta('2147483647')).toBe(2_147_483_647);
    for (const texto of ['0', '-1', '01', '1.5', 'abc', '', '2147483648', '99999999999', ' 1']) {
      const error = errorDe(() => idPersonaDeRuta(texto));
      expect(error.getStatus()).toBe(404);
      expect(error.cuerpo.mensaje).toBe('La persona no existe.');
    }
    expect(esIdPersona(5)).toBe(true);
    for (const valor of [0, -3, 1.5, Number.NaN, 2_147_483_648, '5']) expect(esIdPersona(valor)).toBe(false);
  });
});

// ── Mapeo ───────────────────────────────────────────────────────────────────

describe('mapeo de filas', () => {
  it('PersonaCrm no lleva el correo aunque la fila lo traiga', () => {
    const persona = aPersonaCrm(fila({ es_lider: 1, foto_archivo_id: 40, foto_version: 3 }), conteoVacio());
    expect(persona).toEqual({
      id: 3,
      nombre: 'Luciana Vélez Arenas',
      iniciales: 'LV',
      esLider: true,
      puedeCrearTareas: false,
      foto: '/api/crm/personas/3/foto?v=3',
      conteo: { pendientes: 0, enProceso: 0, terminadasRecientes: 0, vencidas: 0 },
    });
    expect(persona).not.toHaveProperty('correo');
    expect(JSON.stringify(persona)).not.toContain('@');
  });

  it('sin foto, foto es null; las banderas 0/1 pasan a booleanos', () => {
    expect(aPersonaCrm(fila(), conteoVacio()).foto).toBeNull();
    expect(urlFotoPersona(8, null, 4)).toBeNull();
    expect(urlFotoPersona(8, 12, null)).toBe('/api/crm/personas/8/foto?v=0');
    expect(aPersonaCrm(fila({ puede_crear_tareas: 1 }), conteoVacio()).puedeCrearTareas).toBe(true);
    expect([1, '1', true].map(aBooleano)).toEqual([true, true, true]);
    expect([0, '0', false, null, undefined].map(aBooleano)).toEqual([false, false, false, false, false]);
  });

  it('PersonaAdminCrm y ContactoPersonaCrm llevan correo, activo y orden', () => {
    const conteo = { pendientes: 1, enProceso: 2, terminadasRecientes: 3, vencidas: 1 };
    const admin = aPersonaAdminCrm(fila({ activo: 0, orden: '7' as unknown as number }), conteo);
    expect(admin).toMatchObject({ id: 3, correo: 'luciana@sapiencia.gov.co', activo: false, orden: 7, conteo });
    expect(admin.conteo).not.toBe(conteo);
    expect(aContactoPersonaCrm(fila({ es_lider: 1, foto_archivo_id: 9, foto_version: 1 }))).toEqual({
      id: 3,
      nombre: 'Luciana Vélez Arenas',
      correo: 'luciana@sapiencia.gov.co',
      iniciales: 'LV',
      foto: '/api/crm/personas/3/foto?v=1',
      esLider: true,
      activo: true,
    });
  });

  it('los conteos aceptan números, texto o null', () => {
    const conteo = aConteoTareas({
      persona_id: 3,
      pendientes: '2',
      en_proceso: 1,
      terminadas_recientes: null,
      vencidas: 4,
    } as unknown as FilaConteoTareas);
    expect(conteo).toEqual({ pendientes: 2, enProceso: 1, terminadasRecientes: 0, vencidas: 4 });
    const vacio = conteoVacio();
    vacio.pendientes = 9;
    expect(conteoVacio().pendientes).toBe(0);
  });
});

describe('consultaConteos', () => {
  // 03:00 UTC del 24-nov = 22:00 del 23-nov en Bogotá.
  const ahora = new Date('2026-11-24T03:00:00Z');

  it('pasa las fechas como parámetros y no cuenta las tareas ocultas', () => {
    const { sql, valores } = consultaConteos(undefined, ahora);
    expect(valores).toEqual([new Date('2026-10-25T03:00:00Z'), '2026-11-23']);
    expect(sql).toContain('eliminada_en IS NULL');
    expect(sql).toContain('LEFT JOIN crm_tareas');
    expect(sql).toContain('GROUP BY p.id');
    expect(sql).not.toContain('IN (?)');
  });

  it('con ids filtra por ellos y se traduce a Postgres', () => {
    const { sql, valores } = consultaConteos([4, 9], ahora);
    expect(valores[2]).toEqual([4, 9]);
    const pg = traducirAPostgres(sql, valores);
    expect(pg.lectura).toBe(true);
    expect(pg.texto).toContain('t.terminada_en >= $1');
    expect(pg.texto).toContain('t.fecha_limite < $2');
    expect(pg.texto).toContain('p.id IN ($3, $4)');
    expect(pg.valores).toEqual([new Date('2026-10-25T03:00:00Z'), '2026-11-23', 4, 9]);
  });
});

// ── Servicio (con base falsa) ───────────────────────────────────────────────

interface Consulta {
  sql: string;
  valores: unknown[];
  enTransaccion: boolean;
}

type Responder = (sql: string, valores: unknown[]) => unknown;

/** BaseDatosRepositorio falsa: registra cada sentencia y responde con `responder`. */
class BdFalsa {
  readonly consultas: Consulta[] = [];

  constructor(private readonly responder: Responder) {}

  async filas(sql: string, valores: unknown[] = []): Promise<unknown[]> {
    this.consultas.push({ sql, valores, enTransaccion: false });
    return (this.responder(sql, valores) as unknown[] | undefined) ?? [];
  }

  async transaccion<T>(accion: (conexion: Conexion) => Promise<T>): Promise<T> {
    const conexion = {
      dialecto: 'mysql',
      query: async (sql: string, valores: unknown[] = []) => {
        this.consultas.push({ sql, valores, enTransaccion: true });
        const respuesta = this.responder(sql, valores);
        if (respuesta instanceof Error) throw respuesta;
        return [respuesta ?? { insertId: 0, affectedRows: 1 }, undefined];
      },
    } as unknown as Conexion;
    return accion(conexion);
  }

  /** Sentencias que contienen `texto`. */
  con(texto: string): Consulta[] {
    return this.consultas.filter((consulta) => consulta.sql.includes(texto));
  }

  /** Sentencias que empiezan por `verbo` (UPDATE no confunde los SELECT ... FOR UPDATE). */
  sentencias(verbo: 'INSERT' | 'UPDATE'): Consulta[] {
    return this.consultas.filter((consulta) => consulta.sql.trimStart().startsWith(verbo));
  }
}

const RECIBIDO: ArchivoRecibidoCrm = {
  ruta: '/tmp/x',
  nombre: 'foto.png',
  mime: 'image/png',
  bytes: 10,
  ancho: 1,
  alto: 1,
};

/** ServicioArchivosCrm falso, con las firmas acordadas en su stub. */
function archivosFalsos(nuevoId = 77) {
  return {
    validar: vi.fn<ServicioArchivosCrm['validar']>(async () => RECIBIDO),
    guardar: vi.fn<ServicioArchivosCrm['guardar']>(async () => nuevoId),
    recolectar: vi.fn<ServicioArchivosCrm['recolectar']>(async () => undefined),
    enviar: vi.fn<ServicioArchivosCrm['enviar']>(async () => undefined),
  };
}

function servicio(bd: BdFalsa, archivos = archivosFalsos()): ServicioPersonasCrm {
  return new ServicioPersonasCrm(
    bd as unknown as BaseDatosRepositorio,
    archivos as unknown as ServicioArchivosCrm,
  );
}

/** Respuesta de la consulta de conteos: una fila por id pedido (o la persona 3). */
function filasConteo(valores: unknown[]): unknown[] {
  const ids = (valores[2] as number[] | undefined) ?? [3];
  return ids.map((id) => ({ persona_id: id, pendientes: 1, en_proceso: 0, terminadas_recientes: 0, vencidas: 0 }));
}

/** Base para editar: la fila `actual` (o ninguna), conteos y lo que responda `extra` primero. */
function bdEdicion(actual: FilaPersonaCrm | null, extra: Responder = () => undefined): BdFalsa {
  return new BdFalsa((sql, valores) => {
    const respuesta = extra(sql, valores);
    if (respuesta !== undefined) return respuesta;
    if (sql.includes('FOR UPDATE') && sql.includes('WHERE id = ?')) return actual ? [actual] : [];
    if (sql.includes('crm_tareas')) return filasConteo(valores);
    if (sql.startsWith('SELECT')) return actual ? [actual] : [];
    return undefined;
  });
}

/** Base para las fotos: la foto actual de la persona 3 (o que no exista). */
function bdFoto(fotoActual: number | null | 'sin persona'): BdFalsa {
  return new BdFalsa((sql, valores) => {
    if (sql.includes('SELECT foto_archivo_id')) {
      return fotoActual === 'sin persona' ? [] : [{ foto_archivo_id: fotoActual }];
    }
    if (sql.includes('crm_tareas')) return filasConteo(valores);
    if (sql.startsWith('SELECT')) return [fila({ foto_archivo_id: 77, foto_version: 2 })];
    return undefined;
  });
}

describe('ServicioPersonasCrm: lectura', () => {
  it('listarPublicas: activas, en orden, sin correo y con conteos', async () => {
    const bd = new BdFalsa((sql) => {
      if (sql.includes('crm_tareas')) return [{ persona_id: 3, pendientes: 2, en_proceso: 1, terminadas_recientes: 0, vencidas: 1 }];
      if (sql.includes('FROM crm_personas')) return [fila(), fila({ id: 5, nombre: 'Jose', orden: 4 })];
      return undefined;
    });
    const personas = await servicio(bd).listarPublicas();
    const [lista] = bd.con('WHERE activo = 1');
    expect(lista.sql).toContain('ORDER BY orden, nombre');
    expect(lista.sql).not.toContain('correo');
    expect(bd.con('crm_tareas')[0].valores[2]).toEqual([3, 5]);
    expect(personas.map((p) => [p.id, p.conteo.pendientes, p.conteo.vencidas])).toEqual([
      [3, 2, 1],
      [5, 0, 0],
    ]);
    expect(JSON.stringify(personas)).not.toContain('correo');
  });

  it('conteos: sin ids pendientes no consulta; da ceros a quien no tiene tareas', async () => {
    const bd = new BdFalsa((sql, valores) => (sql.includes('crm_tareas') ? filasConteo(valores).slice(0, 1) : undefined));
    expect((await servicio(bd).conteos([])).size).toBe(0);
    expect(bd.consultas).toHaveLength(0);
    const conteos = await servicio(bd).conteos([4, 4, 9]);
    expect(bd.consultas[0].valores[2]).toEqual([4, 9]);
    expect(conteos.get(4)?.pendientes).toBe(1);
    expect(conteos.get(9)).toEqual(conteoVacio());
  });

  it('obtenerPublica: 404 si no existe o está inactiva', async () => {
    const bd = new BdFalsa(() => []);
    const error = await errorDeAsync(servicio(bd).obtenerPublica(5));
    expect(error.getStatus()).toBe(404);
    expect(error.cuerpo.mensaje).toBe('La persona no existe.');
    expect(bd.consultas[0].sql).toContain('activo = 1');
    await expect(servicio(bd).obtenerPublica(0)).rejects.toBeInstanceOf(ErrorRepositorioHttp);
    expect(bd.consultas).toHaveLength(1);
  });

  it('listarAdmin: todas, activas primero, con correo', async () => {
    const bd = new BdFalsa((sql, valores) => {
      if (sql.includes('crm_tareas')) return filasConteo(valores);
      return [fila(), fila({ id: 6, activo: 0 })];
    });
    const personas = await servicio(bd).listarAdmin();
    expect(bd.consultas[0].sql).toContain('ORDER BY activo DESC, orden, nombre');
    expect(bd.con('crm_tareas')[0].sql).not.toContain('IN (?)');
    expect(personas.map((p) => [p.id, p.correo, p.activo, p.conteo.pendientes])).toEqual([
      [3, 'luciana@sapiencia.gov.co', true, 1],
      [6, 'luciana@sapiencia.gov.co', false, 0],
    ]);
  });

  it('contacto y lider: la fila completa o null', async () => {
    const vacia = new BdFalsa(() => []);
    expect(await servicio(vacia).contacto(3)).toBeNull();
    expect(await servicio(vacia).lider()).toBeNull();
    expect(await servicio(vacia).contacto(-1)).toBeNull();
    const bd = new BdFalsa(() => [fila({ es_lider: 1 })]);
    expect(await servicio(bd).lider()).toMatchObject({ id: 3, correo: 'luciana@sapiencia.gov.co', esLider: true });
    expect(bd.consultas[0].sql).toContain('es_lider = 1 AND activo = 1 ORDER BY orden');
  });
});

describe('ServicioPersonasCrm.crear', () => {
  it('crea al final (máximo + 1) y devuelve PersonaAdminCrm', async () => {
    const bd = new BdFalsa((sql, valores) => {
      if (sql.includes('LOWER(correo)')) return [];
      if (sql.includes('MAX(orden)')) return [{ maximo: 3 }];
      if (sql.startsWith('INSERT')) return { insertId: 12, affectedRows: 1 } satisfies ResultadoEscritura;
      if (sql.includes('crm_tareas')) return filasConteo(valores);
      return [fila({ id: 12, nombre: 'Ana Pérez', correo: 'ana@x.co', es_lider: 1, orden: 4 })];
    });
    const persona = await servicio(bd).crear({ nombre: ' Ana  Pérez ', correo: 'ANA@x.co', esLider: true });
    expect(bd.sentencias('INSERT')[0].valores).toEqual(['Ana Pérez', 'ana@x.co', 1, 4]);
    expect(persona).toMatchObject({ id: 12, correo: 'ana@x.co', esLider: true, activo: true, orden: 4 });
  });

  it('sin insertId (Postgres sin RETURNING) busca el id por el correo', async () => {
    let busquedas = 0;
    const bd = new BdFalsa((sql, valores) => {
      if (sql.includes('LOWER(correo)')) return busquedas++ === 0 ? [] : [{ id: 15 }];
      if (sql.includes('MAX(orden)')) return [{ maximo: null }];
      if (sql.startsWith('INSERT')) return { insertId: 0, affectedRows: 1 };
      if (sql.includes('crm_tareas')) return filasConteo(valores);
      return [fila({ id: 15 })];
    });
    expect((await servicio(bd).crear({ nombre: 'Ana', correo: 'ana@x.co' })).id).toBe(15);
    expect(bd.sentencias('INSERT')[0].valores).toEqual(['Ana', 'ana@x.co', 0, 1]);
  });

  it('correo repetido: 409 (antes de insertar o por el índice único)', async () => {
    const repetida = new BdFalsa((sql) => (sql.includes('LOWER(correo)') ? [{ id: 2 }] : undefined));
    const error = await errorDeAsync(servicio(repetida).crear({ nombre: 'Ana', correo: 'ana@x.co' }));
    expect(error.getStatus()).toBe(409);
    expect(error.cuerpo.mensaje).toBe('Ya hay una persona con ese correo.');
    expect(repetida.sentencias('INSERT')).toHaveLength(0);

    const carrera = new BdFalsa((sql) => {
      if (sql.includes('LOWER(correo)')) return [];
      if (sql.includes('MAX(orden)')) return [{ maximo: 1 }];
      if (sql.startsWith('INSERT')) {
        return Object.assign(new Error('Duplicate entry'), {
          code: 'ER_DUP_ENTRY',
          sqlMessage: "Duplicate entry 'ana@x.co' for key 'crm_personas.uq_crm_personas_correo'",
        });
      }
      return undefined;
    });
    expect((await errorDeAsync(servicio(carrera).crear({ nombre: 'Ana', correo: 'ana@x.co' }))).getStatus()).toBe(409);
  });

  it('valida antes de tocar la base', async () => {
    const bd = new BdFalsa(() => undefined);
    expect((await errorDeAsync(servicio(bd).crear({ nombre: '', correo: 'x' }))).campos).toHaveProperty('nombre');
    expect(bd.consultas).toHaveLength(0);
  });
});

describe('ServicioPersonasCrm.editar', () => {
  it('404 si la persona no existe', async () => {
    const bd = bdEdicion(null);
    expect((await errorDeAsync(servicio(bd).editar(9, { orden: 1 }))).getStatus()).toBe(404);
    expect(bd.sentencias('UPDATE')).toHaveLength(0);
  });

  it('actualiza solo lo que cambió', async () => {
    const bd = bdEdicion(fila());
    await servicio(bd).editar(3, { nombre: 'Luciana Vélez', orden: 2, activo: true });
    const [update] = bd.sentencias('UPDATE');
    expect(update.sql).toBe('UPDATE crm_personas SET nombre = ? WHERE id = ?');
    expect(update.valores).toEqual(['Luciana Vélez', 3]);

    const igual = bdEdicion(fila());
    await servicio(igual).editar(3, { nombre: 'Luciana Vélez Arenas' });
    expect(igual.sentencias('UPDATE')).toHaveLength(0);
  });

  it('no deja desactivar al único líder activo (409)', async () => {
    const bd = bdEdicion(fila({ es_lider: 1 }), (sql) => (sql.includes('es_lider = 1 AND activo = 1') ? [] : undefined));
    const error = await errorDeAsync(servicio(bd).editar(3, { activo: false }));
    expect(error.getStatus()).toBe(409);
    expect(error.cuerpo.mensaje).toBe('No se puede desactivar al único líder activo.');
    expect(bd.sentencias('UPDATE')).toHaveLength(0);

    const conOtro = bdEdicion(fila({ es_lider: 1 }), (sql) =>
      sql.includes('es_lider = 1 AND activo = 1') ? [{ id: 8 }] : undefined,
    );
    await servicio(conOtro).editar(3, { activo: false });
    expect(conOtro.sentencias('UPDATE')[0].valores).toEqual([0, 3]);
  });

  it('correo de otra persona: 409; el propio en otras mayúsculas sí se guarda', async () => {
    const ocupado = bdEdicion(fila(), (sql) => (sql.includes('LOWER(correo)') ? [{ id: 4 }] : undefined));
    expect((await errorDeAsync(servicio(ocupado).editar(3, { correo: 'jose@x.co' }))).getStatus()).toBe(409);

    const propio = bdEdicion(fila({ correo: 'Luciana@Sapiencia.gov.co' }), (sql) =>
      sql.includes('LOWER(correo)') ? [{ id: 3 }] : undefined,
    );
    await servicio(propio).editar(3, { correo: 'luciana@sapiencia.gov.co' });
    expect(propio.sentencias('UPDATE')[0].valores).toEqual(['luciana@sapiencia.gov.co', 3]);
  });
});

describe('ServicioPersonasCrm: fotos', () => {
  it('ponerFoto: valida, guarda, sube la versión y recolecta la anterior', async () => {
    const bd = bdFoto(5);
    const archivos = archivosFalsos(77);
    const archivo = { path: '/tmp/x' } as Express.Multer.File;
    const persona = await servicio(bd, archivos).ponerFoto(3, archivo);
    expect(archivos.validar).toHaveBeenCalledWith(archivo, 'foto');
    expect(archivos.guardar).toHaveBeenCalledWith(expect.anything(), RECIBIDO);
    const [update] = bd.sentencias('UPDATE');
    expect(update.sql).toContain('foto_version = foto_version + 1');
    expect(update.valores).toEqual([77, 3]);
    expect(archivos.recolectar).toHaveBeenCalledWith(expect.anything(), [5]);
    expect(persona.foto).toBe('/api/crm/personas/3/foto?v=2');
  });

  it('ponerFoto: la misma imagen no se recolecta; persona inexistente da 404 sin guardar', async () => {
    const archivos = archivosFalsos(77);
    await servicio(bdFoto(77), archivos).ponerFoto(3, undefined);
    expect(archivos.recolectar).not.toHaveBeenCalled();

    const otros = archivosFalsos();
    const error = await errorDeAsync(servicio(bdFoto('sin persona'), otros).ponerFoto(3, undefined));
    expect(error.getStatus()).toBe(404);
    expect(otros.guardar).not.toHaveBeenCalled();
  });

  it('quitarFoto: la deja en NULL y recolecta; sin foto no cambia nada', async () => {
    const bd = bdFoto(5);
    const archivos = archivosFalsos();
    await servicio(bd, archivos).quitarFoto(3);
    expect(bd.sentencias('UPDATE')[0].sql).toContain('foto_archivo_id = NULL, foto_version = foto_version + 1');
    expect(archivos.recolectar).toHaveBeenCalledWith(expect.anything(), [5]);

    const sinFoto = bdFoto(null);
    const otros = archivosFalsos();
    await servicio(sinFoto, otros).quitarFoto(3);
    expect(sinFoto.sentencias('UPDATE')).toHaveLength(0);
    expect(otros.recolectar).not.toHaveBeenCalled();
  });

  it('enviarFoto: 404 sin foto o inactiva; si no, la envía inline con caché de foto', async () => {
    const req = {} as Request;
    const res = {} as Response;
    const sinFoto = archivosFalsos();
    const bdSin = new BdFalsa(() => []);
    expect((await errorDeAsync(servicio(bdSin, sinFoto).enviarFoto(req, res, 3))).getStatus()).toBe(404);
    expect(bdSin.consultas[0].sql).toContain('activo = 1');
    expect(sinFoto.enviar).not.toHaveBeenCalled();

    const archivos = archivosFalsos();
    await servicio(new BdFalsa(() => [{ foto_archivo_id: 9 }]), archivos).enviarFoto(req, res, 3);
    expect(archivos.enviar).toHaveBeenCalledWith(req, res, {
      archivoId: 9,
      nombre: 'foto-3',
      disposicion: 'inline',
      cache: 'foto',
    });
  });
});
