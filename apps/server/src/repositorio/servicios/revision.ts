import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { LIMITES_REPOSITORIO } from '../api-repositorio.js';
import type { BaseDatosRepositorio, Conexion } from '../bd/base-datos.js';
import { mismasClaves } from '../dominio/normalizacion.js';
import { ANIO_MAXIMO, ANIO_MINIMO, MAX_CLAVE, problemasParaPublicar } from '../dominio/validacion.js';
import { marcarContenidoCambiado, registrarCambio } from './cambios.js';
import {
  asignarClaves,
  bloquearDocumento,
  categoriaPorNombre,
  moverPosicion,
  posicionPorFecha,
} from './escritura-comun.js';
import { leerDocumento, leerDocumentos, type RegistroDocumento } from './registros.js';

/**
 * Revisión de datos del repositorio: los cambios que salen de una revisión
 * editorial y que serían cientos de ediciones a mano en la administración
 * (categoría, publicación, año y mes, descripción y palabras clave de cada
 * documento, y categorías que quedan sin uso). La usa
 * `npm run repositorio:revision` (cli/revision.ts).
 *
 * - Todo va en UNA transacción: o se aplica todo o nada. En simulación la
 *   transacción se deshace al final, así que lo que se informa es exactamente
 *   lo que haría la aplicación real.
 * - Cada documento cambiado deja su fila en repositorio_cambios (como una
 *   edición de la administración); los que cambian de fecha se recolocan en
 *   «Más recientes» como al editar; la versión del contenido sube una vez.
 * - Al final todo lo publicado tiene que cumplir lo necesario para publicar
 *   (problemasParaPublicar), salvo `permitirIncompletos`.
 *
 * Formato: { "titulo": "…", "documentos": [ { "id": "…", "categoria"?: "…",
 *   "publicado"?: true|false, "anio"?: 2023, "mes"?: 5|null, "descripcion"?: "…",
 *   "claves"?: ["…", …] } ], "categoriasQuitar"?: ["…"] }. Cada campo que
 * falta queda como está; las categorías de destino deben existir, y las de
 * categoriasQuitar deben quedar sin documentos.
 */

const texto = z.string().transform((t) => t.replace(/\s+/g, ' ').trim());

export const esquemaRevision = z
  .object({
    titulo: texto.pipe(z.string().min(1).max(200)),
    documentos: z
      .array(
        z
          .object({
            id: z.string().min(1).max(120),
            categoria: texto.pipe(z.string().min(1).max(100)).optional(),
            publicado: z.boolean().optional(),
            anio: z.number().int().min(ANIO_MINIMO).max(ANIO_MAXIMO).optional(),
            mes: z.number().int().min(1).max(12).nullable().optional(),
            descripcion: texto.pipe(z.string().min(1).max(LIMITES_REPOSITORIO.maxDescripcion)).optional(),
            claves: z
              .array(texto.pipe(z.string().min(1).max(MAX_CLAVE)))
              .max(LIMITES_REPOSITORIO.maxClaves)
              .optional(),
          })
          .strict(),
      )
      .min(1),
    categoriasQuitar: z.array(texto.pipe(z.string().min(1).max(100))).optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const vistos = new Set<string>();
    for (const d of r.documentos) {
      if (vistos.has(d.id)) ctx.addIssue({ code: 'custom', message: `Documento repetido en la revisión: ${d.id}` });
      vistos.add(d.id);
    }
  });

export type Revision = z.infer<typeof esquemaRevision>;
type CambioDocumento = Revision['documentos'][number];

export interface Diferencia {
  campo: string;
  antes: string;
  despues: string;
}

export interface ResultadoRevision {
  aplicada: boolean;
  /** Documentos con algún cambio, con lo que cambió en cada uno. */
  cambios: Array<{ id: string; diferencias: Diferencia[] }>;
  porCampo: Record<string, number>;
  categoriasQuitadas: string[];
  publicados: number;
  /** Documentos publicados que no cumplen lo necesario para publicar (id: problemas). */
  incompletos: string[];
  versionAntes: number;
  versionDespues: number;
}

export class ErrorRevision extends Error {}

function mostrar(valor: unknown): string {
  if (valor === null || valor === undefined) return '∅';
  if (Array.isArray(valor)) return valor.join(' | ');
  return String(valor);
}

/** Qué cambia en un documento (vacío si nada). */
export function diferencias(actual: RegistroDocumento, c: CambioDocumento): Diferencia[] {
  const d: Diferencia[] = [];
  const agregar = (campo: string, antes: unknown, despues: unknown) =>
    d.push({ campo, antes: mostrar(antes), despues: mostrar(despues) });
  if (c.categoria !== undefined && c.categoria !== actual.categoria) agregar('categoría', actual.categoria, c.categoria);
  if (c.publicado !== undefined && c.publicado !== actual.publicado) agregar('publicado', actual.publicado, c.publicado);
  if (c.anio !== undefined && c.anio !== actual.anio) agregar('año', actual.anio, c.anio);
  if (c.mes !== undefined && c.mes !== actual.mes) agregar('mes', actual.mes, c.mes);
  if (c.descripcion !== undefined && c.descripcion !== actual.descripcion) {
    agregar('descripción', actual.descripcion, c.descripcion);
  }
  if (c.claves !== undefined && !mismasClaves(actual.claves, c.claves)) agregar('palabras clave', actual.claves, c.claves);
  return d;
}

/** Aplica los cambios de un documento (dentro de la transacción). Devuelve lo que cambió. */
async function aplicarDocumento(
  conexion: Conexion,
  c: CambioDocumento,
  usuario: string,
  titulo: string,
): Promise<Diferencia[]> {
  await bloquearDocumento(conexion, c.id);
  const antes = (await leerDocumento(conexion, c.id)) as RegistroDocumento;
  const cambios = diferencias(antes, c);
  if (cambios.length === 0) return cambios;

  const categoria = c.categoria !== undefined ? await categoriaPorNombre(conexion, c.categoria) : null;
  const anio = c.anio !== undefined ? c.anio : antes.anio;
  const mes = c.mes !== undefined ? c.mes : c.anio !== undefined && c.anio !== antes.anio ? null : antes.mes;
  let orden = antes.orden;
  if (anio !== antes.anio || mes !== antes.mes) {
    // Cambió la fecha: se recoloca en «Más recientes», como al editar en la administración.
    const destino = await posicionPorFecha(conexion, anio, mes, c.id);
    orden = await moverPosicion(conexion, c.id, antes.orden, destino > antes.orden ? destino - 1 : destino);
  }
  await conexion.query(
    `UPDATE repositorio_documentos
        SET orden = ?, categoria_id = ?, anio = ?, mes = ?, descripcion = ?, publicado = ?,
            actualizado_en = ?, actualizado_por = ?
      WHERE id = ?`,
    [
      orden,
      categoria ? categoria.id : antes.categoriaId,
      anio,
      mes,
      c.descripcion !== undefined ? c.descripcion : antes.descripcion,
      (c.publicado ?? antes.publicado) ? 1 : 0,
      new Date(),
      usuario,
      c.id,
    ],
  );
  if (c.claves !== undefined && !mismasClaves(antes.claves, c.claves)) await asignarClaves(conexion, c.id, c.claves);

  const despublica = c.publicado === false && antes.publicado;
  const publica = c.publicado === true && !antes.publicado;
  const otros = cambios.filter((x) => x.campo !== 'publicado').map((x) => x.campo);
  await registrarCambio(conexion, {
    usuario,
    accion: despublica ? 'despublicar' : publica ? 'publicar' : 'editar',
    documentoId: c.id,
    detalle:
      `Revisión «${titulo}»` +
      (despublica ? `: despublicó «${antes.titulo}»` : publica ? `: publicó «${antes.titulo}»` : '') +
      (otros.length ? `${despublica || publica ? '; ' : ': '}cambió ${otros.join(', ')}` : ''),
  });
  return cambios;
}

/** Documentos publicados que no cumplen lo necesario para estarlo (id: problemas). */
export function incompletos(registros: readonly RegistroDocumento[]): string[] {
  return registros
    .filter((r) => r.publicado)
    .map((r) => ({ r, p: Object.values(problemasParaPublicar(r)) }))
    .filter(({ p }) => p.length > 0)
    .map(({ r, p }) => `${r.id}: ${p.join(' ')}`);
}

/**
 * Quita una categoría que quedó sin documentos. Si ya no existe (la revisión
 * se aplicó antes), no hace nada y devuelve false: repetir la revisión no falla.
 */
async function quitarCategoria(conexion: Conexion, nombre: string, usuario: string, titulo: string): Promise<boolean> {
  const [existentes] = await conexion.query<RowDataPacket[]>(
    'SELECT id, nombre FROM repositorio_categorias WHERE nombre = ?',
    [nombre],
  );
  if (!existentes[0]) return false;
  const categoria = { id: Number(existentes[0].id), nombre: String(existentes[0].nombre) };
  const [filas] = await conexion.query<RowDataPacket[]>(
    'SELECT COUNT(*) AS n FROM repositorio_documentos WHERE categoria_id = ?',
    [categoria.id],
  );
  const n = Number(filas[0]?.n ?? 0);
  if (n > 0) {
    throw new ErrorRevision(`La categoría «${categoria.nombre}» todavía tiene ${n} documentos: no se puede quitar.`);
  }
  await conexion.query('DELETE FROM repositorio_categorias WHERE id = ?', [categoria.id]);
  await registrarCambio(conexion, {
    usuario,
    accion: 'categoria',
    detalle: `Revisión «${titulo}»: quitó la categoría «${categoria.nombre}» (sin documentos)`,
  });
  return true;
}

/** Corta la transacción de una simulación (ROLLBACK) llevando el resultado. */
class Simulacion extends Error {
  constructor(readonly resultado: ResultadoRevision) {
    super('simulación');
  }
}

async function version(conexion: Conexion): Promise<number> {
  const [filas] = await conexion.query<RowDataPacket[]>('SELECT version FROM repositorio_estado WHERE id = 1');
  return Number(filas[0]?.version ?? 0);
}

/** Aplica (o simula) la revisión. Lanza ErrorRevision si algo no cuadra; en ese caso no escribe nada. */
export async function aplicarRevision(
  bd: BaseDatosRepositorio,
  revision: Revision,
  opciones: { aplicar: boolean; usuario: string; permitirIncompletos?: boolean },
): Promise<ResultadoRevision> {
  const usuario = opciones.usuario.trim().slice(0, 64) || 'revision';
  try {
    return await bd.transaccion(async (conexion) => {
      const versionAntes = await version(conexion);
      const cambios: ResultadoRevision['cambios'] = [];
      const porCampo: Record<string, number> = {};
      for (const c of revision.documentos) {
        const d = await aplicarDocumento(conexion, c, usuario, revision.titulo);
        if (!d.length) continue;
        cambios.push({ id: c.id, diferencias: d });
        for (const x of d) porCampo[x.campo] = (porCampo[x.campo] ?? 0) + 1;
      }
      const categoriasQuitadas: string[] = [];
      for (const nombre of revision.categoriasQuitar ?? []) {
        if (await quitarCategoria(conexion, nombre, usuario, revision.titulo)) categoriasQuitadas.push(nombre);
      }
      if (cambios.length || categoriasQuitadas.length) await marcarContenidoCambiado(conexion);
      const despues = await leerDocumentos(conexion);
      const faltan = incompletos(despues);
      if (faltan.length && !opciones.permitirIncompletos) {
        throw new ErrorRevision(
          `Quedarían ${faltan.length} documentos publicados sin lo necesario para publicar (no se escribió nada):\n  ` +
            faltan.slice(0, 30).join('\n  ') +
            (faltan.length > 30 ? `\n  … y ${faltan.length - 30} más` : ''),
        );
      }
      const resultado: ResultadoRevision = {
        aplicada: opciones.aplicar,
        cambios,
        porCampo,
        categoriasQuitadas,
        publicados: despues.filter((r) => r.publicado).length,
        incompletos: faltan,
        versionAntes,
        versionDespues: await version(conexion),
      };
      if (!opciones.aplicar) throw new Simulacion(resultado);
      return resultado;
    });
  } catch (error) {
    if (error instanceof Simulacion) return error.resultado;
    throw error;
  }
}
