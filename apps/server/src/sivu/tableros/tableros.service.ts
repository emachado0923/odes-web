import { createHash } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import { armarFondos, ID_TABLERO_FONDOS } from './datos-fondos.js';
import { armarConjunto, type FilasLeidas, ID_TABLERO_MATRICULA } from './datos-matricula.js';

/** Respuesta lista para enviar: el JSON del tablero y su ETag. */
export interface RespuestaTablero {
  cuerpo: Buffer;
  etag: string;
}

/**
 * Un tablero con datos en la base: cómo leer sus tablas
 * (sivu_tablero_<tablero>_*) y armar lo que va en la respuesta, junto a sus
 * definiciones (de sivu_tableros).
 */
interface TableroRegistrado {
  /** Lee las tablas del tablero y arma el objeto de la respuesta (sin las definiciones). */
  leer(bd: BaseDatosRepositorio, titulo: string): Promise<Record<string, unknown>>;
  /** Mensaje del 404 cuando el tablero todavía no tiene datos. */
  sinDatos: string;
  /** Solo con sesión de tableros (cookie sivu_sesion, ver ../acceso). */
  privado?: boolean;
}

async function leerMatricula(bd: BaseDatosRepositorio): Promise<Record<string, unknown>> {
  const [meta] = await bd.filas<RowDataPacket>(
    'SELECT municipio, anio, referencia, fuente, generado FROM sivu_tablero_matricula_2025_meta WHERE id = 1',
  );
  if (!meta) throw new NotFoundException('Faltan los datos de matrícula: cárguelos de nuevo.');
  const leidas = {
    meta,
    categorias: await bd.filas<RowDataPacket>(
      'SELECT dimension, indice, nombre, padre FROM sivu_tablero_matricula_2025_categorias ORDER BY dimension, indice',
    ),
    ies: await bd.filas<RowDataPacket>(
      'SELECT indice, nombre, corto, sector, caracter, acreditada, codigos FROM sivu_tablero_matricula_2025_ies ORDER BY indice',
    ),
    programas: await bd.filas<RowDataPacket>(
      'SELECT indice, codigo, nombre, ies, nivel_formacion, modalidad, nbc, cine, acreditado FROM sivu_tablero_matricula_2025_programas ORDER BY indice',
    ),
    filas: await bd.filas<RowDataPacket>('SELECT programa, sexo, periodo, matriculados FROM sivu_tablero_matricula_2025_filas ORDER BY n'),
  } as unknown as FilasLeidas;
  return { matricula: armarConjunto(leidas) };
}

async function leerFondos(bd: BaseDatosRepositorio, titulo: string): Promise<Record<string, unknown>> {
  const [meta] = await bd.filas<RowDataPacket>(
    'SELECT corte, periodo_actual, fuente, generado, beneficios, filas_origen, excluidos FROM sivu_tablero_fondos_2026_meta WHERE id = 1',
  );
  if (!meta) throw new NotFoundException('Faltan los datos de los fondos: cárguelos de nuevo.');
  const fondos = armarFondos({
    titulo,
    meta,
    programas: await bd.filas<RowDataPacket>('SELECT indice, clave, nombre, corto, linea FROM sivu_tablero_fondos_2026_programas'),
    categorias: await bd.filas<RowDataPacket>('SELECT dimension, indice, nombre FROM sivu_tablero_fondos_2026_categorias'),
    estados: await bd.filas<RowDataPacket>('SELECT programa, convocatoria, periodo, estado, beneficios FROM sivu_tablero_fondos_2026_estados'),
    giros: await bd.filas<RowDataPacket>('SELECT programa, periodo, monto, matricula, sostenimiento, con_giro FROM sivu_tablero_fondos_2026_giros'),
    cohortes: await bd.filas<RowDataPacket>('SELECT programa, convocatoria, estado, beneficios FROM sivu_tablero_fondos_2026_cohortes'),
    activos: await bd.filas<RowDataPacket>('SELECT tipo, programa, periodo, categoria, beneficios FROM sivu_tablero_fondos_2026_activos'),
    destinos: await bd.filas<RowDataPacket>('SELECT convocatoria, pais, beneficios FROM sivu_tablero_fondos_2026_destinos'),
  });
  return { fondos };
}

/**
 * Tableros con datos en la base, por su id (el de la página /tableros/<id> y
 * el de GET /api/sivu/tableros/<id>). Sumar un tablero es agregar su entrada
 * aquí, con su migración y su comando de carga.
 */
const TABLEROS: ReadonlyMap<string, TableroRegistrado> = new Map([
  [ID_TABLERO_MATRICULA, { leer: leerMatricula, sinDatos: 'El tablero todavía no tiene datos: cárguelos con npm run tableros:cargar-matricula.' }],
  // Privado (17-nov-2026): solo para cuentas de tableros, como pidió Planeación.
  [
    ID_TABLERO_FONDOS,
    { leer: leerFondos, sinDatos: 'El tablero todavía no tiene datos: cárguelos con npm run tableros:cargar-fondos.', privado: true },
  ],
]);

/**
 * Datos de los tableros de SIVU, desde la base (el catálogo sivu_tableros y
 * las tablas de cada tablero). El JSON de cada uno se arma una vez y se guarda
 * en memoria mientras no cambie su sivu_tableros.actualizado_en: cada petición
 * hace una sola consulta corta.
 */
@Injectable()
export class ServicioTableros {
  private readonly cache = new Map<string, { clave: string; respuesta: RespuestaTablero }>();

  constructor(private readonly bd: BaseDatosRepositorio) {}

  /** ¿Es uno de los tableros con datos en la base? */
  existe(id: string): boolean {
    return TABLEROS.has(id);
  }

  /** ¿Pide iniciar sesión? */
  esPrivado(id: string): boolean {
    return TABLEROS.get(id)?.privado === true;
  }

  async respuesta(id: string): Promise<RespuestaTablero> {
    const registrado = TABLEROS.get(id);
    if (!registrado) throw new NotFoundException('No existe ese tablero.');
    const [tablero] = await this.bd.filas<RowDataPacket>('SELECT titulo, definiciones, actualizado_en FROM sivu_tableros WHERE id = ?', [id]);
    if (!tablero) throw new NotFoundException(registrado.sinDatos);
    const clave = new Date(tablero.actualizado_en as string | Date).toISOString();
    const guardada = this.cache.get(id);
    if (guardada?.clave === clave) return guardada.respuesta;

    const datos = {
      ...(await registrado.leer(this.bd, String(tablero.titulo))),
      definiciones: JSON.parse(String(tablero.definiciones)) as unknown,
    };
    const cuerpo = Buffer.from(JSON.stringify(datos));
    const etag = `"${createHash('sha256').update(cuerpo).digest('base64url').slice(0, 27)}"`;
    const respuesta = { cuerpo, etag };
    this.cache.set(id, { clave, respuesta });
    return respuesta;
  }
}
