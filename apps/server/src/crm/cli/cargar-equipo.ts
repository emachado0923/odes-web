/**
 * Carga el equipo del CRM (crm_personas) desde un JSON, o lo actualiza.
 *
 *   npm run crm:cargar-equipo -- --archivo <ruta.json> [--solo-sql] [--motor mysql|postgres]
 *
 * El archivo es un arreglo en el orden de las tarjetas de la pantalla de
 * inicio (orden 1..n), con exactamente un líder:
 *
 *   [{ "nombre": "…", "correo": "…", "lider": true }, { "nombre": "…", "correo": "…" }]
 *
 * Tiene nombres y correos: guárdelo en apps/server/datos/crm/ (git lo
 * ignora), nunca en el repositorio, que es público.
 *
 * Cada persona se busca por correo (sin distinguir mayúsculas): si existe se
 * le actualizan el nombre, si es líder y el orden, y se reactiva; si no, se
 * crea. El líder del archivo queda como el único líder. Las personas de la
 * base que no están en el archivo no se tocan (se desactivan en la pantalla
 * Equipo del líder). Todo va en una transacción.
 * Sin --solo-sql usa la conexión de la aplicación (apps/server/.env). Con
 * --solo-sql no se conecta: imprime el SQL de MySQL (por defecto; producción)
 * o de Postgres.
 */
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { cargarArchivoEnv } from '../../config/configuracion.js';
import type { BaseDatosRepositorio } from '../../repositorio/bd/base-datos.js';
import type { ResultadoEscritura } from '../../repositorio/bd/conexion.js';
import { abrirBaseDatos, ejecutarCli, ErrorCli, rutaDeOpcion } from '../../repositorio/cli/comun.js';
import { LIMITES_CRM } from '../api-crm.js';
import {
  conAyudaSiFalla,
  largo,
  leerMotor,
  literalSql,
  type MotorSql,
  nombreMotor,
  seEjecutaDirecto,
  textoUnaLinea,
} from './clave-lider.js';

/** Correo: el mismo patrón de los usuarios del PAI (sin espacios, una @ y un dominio con punto). */
export const PATRON_CORREO_CRM = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;

export const AYUDA_CARGAR_EQUIPO = `Uso: npm run crm:cargar-equipo -- --archivo <ruta.json> [--solo-sql] [--motor mysql|postgres]

  --archivo   JSON del equipo: [{ "nombre": "…", "correo": "…", "lider": true }, …]
              en el orden de las tarjetas, con exactamente un "lider": true
  --solo-sql  no se conecta: imprime el SQL para correrlo a mano
  --motor     con --solo-sql: mysql (por defecto; producción, planeacionbd) o postgres
  --ayuda     muestra esta ayuda

Cada persona se busca por correo: si existe se actualiza (nombre, líder, orden)
y se reactiva; si no, se crea. El líder del archivo queda como el único líder.
Las personas de la base que no están en el archivo no se tocan.
El archivo tiene nombres y correos: guárdelo en apps/server/datos/crm/ (git lo
ignora), nunca en el repositorio.`;

export interface PersonaEquipoCrm {
  nombre: string;
  /** En minúsculas. */
  correo: string;
  esLider: boolean;
  /** 1..n: la posición en el archivo. */
  orden: number;
}

const esquemaPersona = z.strictObject({
  nombre: z
    .string({ error: 'falta el nombre (texto)' })
    .transform(textoUnaLinea)
    .refine((valor) => valor.length > 0, 'el nombre está vacío')
    .refine(
      (valor) => largo(valor) <= LIMITES_CRM.nombrePersona,
      `el nombre pasa de ${LIMITES_CRM.nombrePersona} caracteres`,
    ),
  correo: z
    .string({ error: 'falta el correo (texto)' })
    .transform((valor) => textoUnaLinea(valor).toLowerCase())
    .refine((valor) => largo(valor) <= LIMITES_CRM.correo, `el correo pasa de ${LIMITES_CRM.correo} caracteres`)
    .refine((valor) => PATRON_CORREO_CRM.test(valor), 'el correo no es válido (por ejemplo, nombre@sapiencia.gov.co)'),
  lider: z.boolean({ error: '"lider" debe ser true o false' }).optional(),
});

const esquemaEquipo = z
  .array(esquemaPersona, { error: 'debe ser un arreglo: [{ "nombre": "…", "correo": "…", "lider": true }, …]' })
  .min(1, 'el arreglo está vacío');

/**
 * Valida el equipo ya leído del JSON y lo normaliza (nombres de una línea,
 * correos en minúsculas, orden 1..n). Junta todos los problemas en un solo
 * ErrorCli: datos mal escritos, correos repetidos y que no haya exactamente
 * un líder.
 */
export function validarEquipo(datos: unknown): PersonaEquipoCrm[] {
  const resultado = esquemaEquipo.safeParse(datos);
  if (!resultado.success) {
    const problemas = resultado.error.issues.map((problema) => {
      const [indice, campo] = problema.path;
      const donde =
        typeof indice === 'number' ? `Persona ${indice + 1}${typeof campo === 'string' ? ` (${campo})` : ''}` : 'El archivo';
      const mensaje =
        problema.code === 'unrecognized_keys'
          ? `no se esperaba ${problema.keys.map((clave) => `"${clave}"`).join(', ')} (solo "nombre", "correo" y "lider")`
          : problema.message;
      return `${donde}: ${mensaje}`;
    });
    throw errorDeEquipo(problemas);
  }

  const personas = resultado.data.map((persona, i) => ({
    nombre: persona.nombre,
    correo: persona.correo,
    esLider: persona.lider === true,
    orden: i + 1,
  }));
  const problemas: string[] = [];
  const posiciones = new Map<string, number[]>();
  for (const persona of personas) posiciones.set(persona.correo, [...(posiciones.get(persona.correo) ?? []), persona.orden]);
  for (const [correo, lista] of posiciones) {
    if (lista.length > 1) problemas.push(`El correo ${correo} está repetido (personas ${lista.join(', ')}).`);
  }
  const lideres = personas.filter((persona) => persona.esLider);
  if (lideres.length === 0) {
    problemas.push('Ninguna persona tiene "lider": true. Marque exactamente una: quien asigna las tareas.');
  } else if (lideres.length > 1) {
    problemas.push(
      `Hay ${lideres.length} personas con "lider": true (${lideres.map((persona) => persona.nombre).join(', ')}): debe haber exactamente una.`,
    );
  }
  if (problemas.length > 0) throw errorDeEquipo(problemas);
  return personas;
}

function errorDeEquipo(problemas: string[]): ErrorCli {
  return new ErrorCli(`El archivo del equipo no se cargó:\n  - ${problemas.join('\n  - ')}`, 2);
}

/** Interpreta el texto del archivo (JSON, con o sin BOM) y lo valida. */
export function leerEquipo(texto: string): PersonaEquipoCrm[] {
  let datos: unknown;
  try {
    datos = JSON.parse(texto.replace(/^﻿/, ''));
  } catch (error) {
    throw new ErrorCli(`El archivo del equipo no es un JSON válido: ${error instanceof Error ? error.message : String(error)}`, 2);
  }
  return validarEquipo(datos);
}

/**
 * SQL que carga el equipo: deja como único líder al del archivo y, por cada
 * persona, la crea o (si su correo ya está) le actualiza nombre, líder y
 * orden y la reactiva. En MySQL el ON DUPLICATE KEY UPDATE repite los valores
 * (VALUES() está en desuso y 8.0.18 no tiene el alias de fila).
 */
export function sqlCargarEquipo(motor: MotorSql, personas: readonly PersonaEquipoCrm[]): string {
  const lineas = [
    `-- Equipo del CRM: ${personas.length} ${personas.length === 1 ? 'persona' : 'personas'} (generado por crm:cargar-equipo --solo-sql, ${nombreMotor(motor)}).`,
    '-- Tiene nombres y correos: no lo guarde en el repositorio.',
    ...(motor === 'mysql' ? ['SET NAMES utf8mb4;', 'START TRANSACTION;'] : ['BEGIN;']),
  ];
  const lider = personas.find((persona) => persona.esLider);
  if (lider) {
    lineas.push(
      '-- Un solo líder: el del archivo.',
      `UPDATE crm_personas SET es_lider = 0 WHERE es_lider = 1 AND correo <> ${literalSql(motor, lider.correo)};`,
    );
  }
  for (const persona of personas) {
    const nombre = literalSql(motor, persona.nombre);
    const esLider = persona.esLider ? 1 : 0;
    const orden = Math.trunc(persona.orden);
    lineas.push(
      `INSERT INTO crm_personas (nombre, correo, es_lider, activo, orden) VALUES (${nombre}, ${literalSql(motor, persona.correo)}, ${esLider}, 1, ${orden})`,
      motor === 'mysql'
        ? `  ON DUPLICATE KEY UPDATE nombre = ${nombre}, es_lider = ${esLider}, activo = 1, orden = ${orden};`
        : '  ON CONFLICT (correo) DO UPDATE SET nombre = EXCLUDED.nombre, es_lider = EXCLUDED.es_lider, activo = 1, orden = EXCLUDED.orden;',
    );
  }
  lineas.push('COMMIT;');
  return lineas.join('\n');
}

export interface ResultadoCargaEquipo {
  creadas: number;
  actualizadas: number;
  /** Personas que dejaron de ser líder (no están en el archivo como líder). */
  lideresQuitados: number;
  /** Personas activas de la base que no están en el archivo (no se tocaron). */
  fueraDelArchivo: number;
}

/** Lo mismo que sqlCargarEquipo, en una transacción con la conexión de la aplicación. */
export async function cargarEquipo(
  bd: Pick<BaseDatosRepositorio, 'transaccion'>,
  personas: readonly PersonaEquipoCrm[],
): Promise<ResultadoCargaEquipo> {
  return bd.transaccion(async (conexion) => {
    let creadas = 0;
    let actualizadas = 0;
    let lideresQuitados = 0;
    const lider = personas.find((persona) => persona.esLider);
    if (lider) {
      const [quitados] = await conexion.query<ResultadoEscritura>(
        'UPDATE crm_personas SET es_lider = 0 WHERE es_lider = 1 AND correo <> ?',
        [lider.correo],
      );
      lideresQuitados = quitados.affectedRows;
    }
    for (const persona of personas) {
      const [existentes] = await conexion.query<Array<{ id: number }>>('SELECT id FROM crm_personas WHERE correo = ?', [
        persona.correo,
      ]);
      const esLider = persona.esLider ? 1 : 0;
      if (existentes[0]) {
        await conexion.query('UPDATE crm_personas SET nombre = ?, es_lider = ?, orden = ?, activo = 1 WHERE id = ?', [
          persona.nombre,
          esLider,
          persona.orden,
          existentes[0].id,
        ]);
        actualizadas++;
      } else {
        await conexion.query('INSERT INTO crm_personas (nombre, correo, es_lider, activo, orden) VALUES (?, ?, ?, 1, ?)', [
          persona.nombre,
          persona.correo,
          esLider,
          persona.orden,
        ]);
        creadas++;
      }
    }
    const [fuera] = await conexion.query<Array<{ n: number | string }>>(
      'SELECT COUNT(*) AS n FROM crm_personas WHERE activo = 1 AND correo NOT IN (?)',
      [personas.map((persona) => persona.correo)],
    );
    return { creadas, actualizadas, lideresQuitados, fueraDelArchivo: Number(fuera[0]?.n ?? 0) };
  });
}

export interface OpcionesCargarEquipo {
  archivo: string;
  soloSql: boolean;
  motor: MotorSql;
}

/** Opciones de la línea de comandos (null = --ayuda). */
export function interpretarArgumentosCargarEquipo(argumentos: readonly string[]): OpcionesCargarEquipo | null {
  const { values: valores } = conAyudaSiFalla(
    () =>
      parseArgs({
        args: [...argumentos],
        options: {
          archivo: { type: 'string' },
          'solo-sql': { type: 'boolean', default: false },
          motor: { type: 'string' },
          ayuda: { type: 'boolean', short: 'h', default: false },
        },
        strict: true,
        allowPositionals: false,
      }),
    AYUDA_CARGAR_EQUIPO,
  );
  if (valores.ayuda) return null;
  const archivo = valores.archivo?.trim();
  if (!archivo) throw new ErrorCli(`Indique el --archivo del equipo.\n\n${AYUDA_CARGAR_EQUIPO}`, 2);
  const soloSql = valores['solo-sql'];
  if (valores.motor !== undefined && !soloSql) {
    throw new ErrorCli('--motor solo va con --solo-sql: sin ella se usa el motor de la conexión (apps/server/.env).', 2);
  }
  return { archivo, soloSql, motor: leerMotor(valores.motor) };
}

async function leerArchivo(ruta: string): Promise<string> {
  try {
    return await readFile(rutaDeOpcion(ruta), 'utf8');
  } catch (error) {
    const codigo = (error as NodeJS.ErrnoException).code;
    throw new ErrorCli(`No se pudo leer ${ruta}${codigo ? ` (${codigo})` : ''}.`, 2);
  }
}

async function principal(): Promise<number> {
  cargarArchivoEnv();
  const opciones = interpretarArgumentosCargarEquipo(process.argv.slice(2));
  if (!opciones) {
    console.log(AYUDA_CARGAR_EQUIPO);
    return 0;
  }
  const personas = leerEquipo(await leerArchivo(opciones.archivo));
  if (opciones.soloSql) {
    console.log(sqlCargarEquipo(opciones.motor, personas));
    return 0;
  }
  const bd = await abrirBaseDatos();
  try {
    const resultado = await cargarEquipo(bd, personas);
    console.log(`Equipo cargado. Personas creadas: ${resultado.creadas}; actualizadas: ${resultado.actualizadas}.`);
    if (resultado.lideresQuitados > 0) {
      console.log(`Dejaron de ser líder (el único es el del archivo): ${resultado.lideresQuitados}.`);
    }
    if (resultado.fueraDelArchivo > 0) {
      console.log(
        `Personas activas de la base que no están en el archivo (no se tocaron; se desactivan en la pantalla Equipo del líder): ${resultado.fueraDelArchivo}.`,
      );
    }
    return 0;
  } finally {
    await bd.cerrar();
  }
}

if (seEjecutaDirecto(import.meta.url)) await ejecutarCli(principal);
