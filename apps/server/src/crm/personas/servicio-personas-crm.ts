/// <reference types="multer" />
/**
 * Personas del equipo (crm_personas): lista pública (sin correos) con los
 * conteos de tareas, fotos y la pantalla Equipo del líder.
 *
 * Reglas:
 * - El correo nunca sale en PersonaCrm (solo en PersonaAdminCrm y en
 *   ContactoPersonaCrm, que es interno, para los avisos).
 * - Correo único sin distinguir mayúsculas (uq_crm_personas_correo): se
 *   guarda recortado y en minúsculas; repetido -> 409.
 * - No se puede desactivar al único líder activo (409).
 * - Foto: se guarda en el almacén del CRM, sube foto_version (la URL lleva
 *   ?v=, así el navegador no muestra la anterior) y se recolecta la vieja.
 *   La ruta pública da 404 si la persona no existe, está inactiva o no tiene.
 */
import { Inject, Injectable } from '@nestjs/common';
import type { RowDataPacket } from 'mysql2/promise';
import type { Request, Response } from 'express';
import type { ConteoTareasCrm, PersonaAdminCrm, PersonaCrm } from '../api-crm.js';
import { ServicioArchivosCrm } from '../archivos/servicio-archivos-crm.js';
import { BaseDatosRepositorio, type Conexion, type ResultadoEscritura } from '../../repositorio/bd/base-datos.js';
import { esDuplicado } from '../../repositorio/bd/errores-bd.js';
import { conflicto, noEncontrado } from '../../repositorio/errores-repositorio.js';
import {
  aBooleano,
  aContactoPersonaCrm,
  aConteoTareas,
  aPersonaAdminCrm,
  aPersonaCrm,
  COLUMNAS_PERSONA,
  COLUMNAS_PUBLICAS_PERSONA,
  consultaConteos,
  conteoVacio,
  type FilaConteoTareas,
  type FilaPersonaCrm,
  type FilaPersonaPublica,
} from './mapeo-personas.js';
import {
  esIdPersona,
  MAX_ORDEN_PERSONA,
  MENSAJE_CORREO_REPETIDO,
  MENSAJE_PERSONA_NO_EXISTE,
  MENSAJE_ULTIMO_LIDER,
  validarCambiosPersona,
  validarPersonaNueva,
} from './validacion-personas.js';

/** Datos internos de una persona (con correo): para los avisos. Nunca salen por la API del equipo. */
export interface ContactoPersonaCrm {
  id: number;
  nombre: string;
  correo: string;
  iniciales: string;
  foto: string | null;
  esLider: boolean;
  activo: boolean;
}

const INDICE_CORREO = 'uq_crm_personas_correo';

interface FilaFoto extends RowDataPacket {
  foto_archivo_id: number | null;
}

interface FilaMaximo extends RowDataPacket {
  maximo: number | null;
}

function correoRepetido() {
  return conflicto(MENSAJE_CORREO_REPETIDO);
}

function personaNoExiste() {
  return noEncontrado(MENSAJE_PERSONA_NO_EXISTE);
}

/** Id del almacén guardado en foto_archivo_id, o null. */
function idFoto(valor: unknown): number | null {
  return valor === null || valor === undefined ? null : Number(valor);
}

@Injectable()
export class ServicioPersonasCrm {
  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
    @Inject(ServicioArchivosCrm) private readonly archivos: ServicioArchivosCrm,
  ) {}

  /** Activas, por `orden` y nombre, con sus conteos. */
  async listarPublicas(): Promise<PersonaCrm[]> {
    const filas = await this.bd.filas<FilaPersonaPublica>(
      `SELECT ${COLUMNAS_PUBLICAS_PERSONA} FROM crm_personas WHERE activo = 1 ORDER BY orden, nombre, id`,
    );
    if (filas.length === 0) return [];
    const conteos = await this.conteos(filas.map((fila) => Number(fila.id)));
    return filas.map((fila) => aPersonaCrm(fila, conteos.get(Number(fila.id)) ?? conteoVacio()));
  }

  /** Una persona activa (404 `no_encontrado` si no existe o está inactiva). */
  async obtenerPublica(personaId: number): Promise<PersonaCrm> {
    if (!esIdPersona(personaId)) throw personaNoExiste();
    const filas = await this.bd.filas<FilaPersonaPublica>(
      `SELECT ${COLUMNAS_PUBLICAS_PERSONA} FROM crm_personas WHERE id = ? AND activo = 1`,
      [personaId],
    );
    const fila = filas[0];
    if (!fila) throw personaNoExiste();
    const conteos = await this.conteos([personaId]);
    return aPersonaCrm(fila, conteos.get(personaId) ?? conteoVacio());
  }

  /**
   * Conteos de tareas por persona (todas las personas si no se dan ids), en
   * una sola consulta. Quien no tiene tareas sale con ceros (también cada id
   * pedido que no exista).
   */
  async conteos(personaIds?: readonly number[]): Promise<Map<number, ConteoTareasCrm>> {
    const resultado = new Map<number, ConteoTareasCrm>();
    let ids: number[] | undefined;
    if (personaIds !== undefined) {
      ids = [...new Set(personaIds.filter(esIdPersona))];
      for (const id of ids) resultado.set(id, conteoVacio());
      if (ids.length === 0) return resultado;
    }
    const { sql, valores } = consultaConteos(ids);
    const filas = await this.bd.filas<FilaConteoTareas>(sql, valores);
    for (const fila of filas) resultado.set(Number(fila.persona_id), aConteoTareas(fila));
    return resultado;
  }

  /** Todas (también inactivas), para la pantalla Equipo del líder. */
  async listarAdmin(): Promise<PersonaAdminCrm[]> {
    const filas = await this.bd.filas<FilaPersonaCrm>(
      `SELECT ${COLUMNAS_PERSONA} FROM crm_personas ORDER BY activo DESC, orden, nombre, id`,
    );
    if (filas.length === 0) return [];
    const conteos = await this.conteos();
    return filas.map((fila) => aPersonaAdminCrm(fila, conteos.get(Number(fila.id)) ?? conteoVacio()));
  }

  /** Una persona (activa o no) con correo y conteos; 404 si no existe. */
  async obtenerAdmin(personaId: number): Promise<PersonaAdminCrm> {
    if (!esIdPersona(personaId)) throw personaNoExiste();
    const filas = await this.bd.filas<FilaPersonaCrm>(`SELECT ${COLUMNAS_PERSONA} FROM crm_personas WHERE id = ?`, [
      personaId,
    ]);
    const fila = filas[0];
    if (!fila) throw personaNoExiste();
    const conteos = await this.conteos([personaId]);
    return aPersonaAdminCrm(fila, conteos.get(personaId) ?? conteoVacio());
  }

  /** NuevaPersonaCrm -> PersonaAdminCrm. Queda activa y al final (orden = máximo + 1). */
  async crear(cuerpo: unknown): Promise<PersonaAdminCrm> {
    const datos = validarPersonaNueva(cuerpo);
    const id = await this.bd.transaccion(async (conexion) => {
      if ((await this.idPorCorreo(conexion, datos.correo)) !== null) throw correoRepetido();
      const [maximos] = await conexion.query<FilaMaximo[]>(
        'SELECT COALESCE(MAX(orden), 0) AS maximo FROM crm_personas',
      );
      const orden = Math.min(Number(maximos[0]?.maximo ?? 0) + 1, MAX_ORDEN_PERSONA);
      let resultado: ResultadoEscritura;
      try {
        [resultado] = await conexion.query<ResultadoEscritura>(
          'INSERT INTO crm_personas (nombre, correo, es_lider, activo, orden) VALUES (?, ?, ?, 1, ?)',
          [datos.nombre, datos.correo, datos.esLider ? 1 : 0, orden],
        );
      } catch (error) {
        if (esDuplicado(error, INDICE_CORREO)) throw correoRepetido();
        throw error;
      }
      // En Postgres el id solo vuelve si la tabla está en TABLAS_CON_ID
      // (RETURNING id); si no, se busca por el correo, que es único.
      const nuevoId = Number(resultado.insertId) || (await this.idPorCorreo(conexion, datos.correo));
      if (!nuevoId) throw new Error('No se pudo leer el id de la persona creada.');
      return nuevoId;
    });
    return this.obtenerAdmin(id);
  }

  /** EdicionPersonaCrm (parcial) -> PersonaAdminCrm. */
  async editar(personaId: number, cuerpo: unknown): Promise<PersonaAdminCrm> {
    if (!esIdPersona(personaId)) throw personaNoExiste();
    const cambios = validarCambiosPersona(cuerpo);
    await this.bd.transaccion(async (conexion) => {
      const [filas] = await conexion.query<FilaPersonaCrm[]>(
        `SELECT ${COLUMNAS_PERSONA} FROM crm_personas WHERE id = ? FOR UPDATE`,
        [personaId],
      );
      const actual = filas[0];
      if (!actual) throw personaNoExiste();

      const columnas: [string, unknown][] = [];
      if (cambios.nombre !== undefined && cambios.nombre !== actual.nombre) {
        columnas.push(['nombre', cambios.nombre]);
      }
      if (cambios.correo !== undefined && cambios.correo !== actual.correo) {
        const otro = await this.idPorCorreo(conexion, cambios.correo);
        if (otro !== null && otro !== personaId) throw correoRepetido();
        columnas.push(['correo', cambios.correo]);
      }
      if (cambios.activo !== undefined && cambios.activo !== aBooleano(actual.activo)) {
        if (!cambios.activo && aBooleano(actual.es_lider)) {
          // Con bloqueo: otra transacción no puede desactivar a la vez al otro líder.
          const [otros] = await conexion.query<RowDataPacket[]>(
            'SELECT id FROM crm_personas WHERE es_lider = 1 AND activo = 1 AND id <> ? ORDER BY id FOR UPDATE',
            [personaId],
          );
          if (otros.length === 0) throw conflicto(MENSAJE_ULTIMO_LIDER);
        }
        columnas.push(['activo', cambios.activo ? 1 : 0]);
      }
      if (cambios.orden !== undefined && cambios.orden !== Number(actual.orden)) {
        columnas.push(['orden', cambios.orden]);
      }
      if (cambios.puedeCrearTareas !== undefined && cambios.puedeCrearTareas !== aBooleano(actual.puede_crear_tareas)) {
        columnas.push(['puede_crear_tareas', cambios.puedeCrearTareas ? 1 : 0]);
      }
      if (columnas.length === 0) return;

      try {
        await conexion.query(
          `UPDATE crm_personas SET ${columnas.map(([columna]) => `${columna} = ?`).join(', ')} WHERE id = ?`,
          [...columnas.map(([, valor]) => valor), personaId],
        );
      } catch (error) {
        if (esDuplicado(error, INDICE_CORREO)) throw correoRepetido();
        throw error;
      }
    });
    return this.obtenerAdmin(personaId);
  }

  /** PUT .../foto (PNG, JPEG o WEBP): reemplaza la foto y recolecta la anterior. */
  async ponerFoto(personaId: number, archivo: Express.Multer.File | undefined): Promise<PersonaAdminCrm> {
    if (!esIdPersona(personaId)) throw personaNoExiste();
    const recibido = await this.archivos.validar(archivo, 'foto');
    await this.bd.transaccion(async (conexion) => {
      const anterior = await this.fotoParaCambiar(conexion, personaId);
      const nuevo = await this.archivos.guardar(conexion, recibido);
      await conexion.query(
        'UPDATE crm_personas SET foto_archivo_id = ?, foto_version = foto_version + 1 WHERE id = ?',
        [nuevo, personaId],
      );
      if (anterior !== null && anterior !== nuevo) await this.archivos.recolectar(conexion, [anterior]);
    });
    return this.obtenerAdmin(personaId);
  }

  /** DELETE .../foto: la deja en NULL y recolecta la anterior (sin foto, no cambia nada). */
  async quitarFoto(personaId: number): Promise<PersonaAdminCrm> {
    if (!esIdPersona(personaId)) throw personaNoExiste();
    await this.bd.transaccion(async (conexion) => {
      const anterior = await this.fotoParaCambiar(conexion, personaId);
      if (anterior === null) return;
      await conexion.query(
        'UPDATE crm_personas SET foto_archivo_id = NULL, foto_version = foto_version + 1 WHERE id = ?',
        [personaId],
      );
      await this.archivos.recolectar(conexion, [anterior]);
    });
    return this.obtenerAdmin(personaId);
  }

  /** Responde con la foto (404 si la persona no existe, está inactiva o no tiene). */
  async enviarFoto(req: Request, res: Response, personaId: number): Promise<void> {
    if (!esIdPersona(personaId)) throw personaNoExiste();
    const filas = await this.bd.filas<FilaFoto>(
      'SELECT foto_archivo_id FROM crm_personas WHERE id = ? AND activo = 1',
      [personaId],
    );
    const archivoId = idFoto(filas[0]?.foto_archivo_id);
    if (archivoId === null) throw noEncontrado('La persona no tiene foto.');
    await this.archivos.enviar(req, res, {
      archivoId,
      nombre: `foto-${personaId}`,
      disposicion: 'inline',
      cache: 'foto',
    });
  }

  /** Contacto de una persona (activa o no), o null. */
  async contacto(personaId: number): Promise<ContactoPersonaCrm | null> {
    if (!esIdPersona(personaId)) return null;
    const filas = await this.bd.filas<FilaPersonaCrm>(`SELECT ${COLUMNAS_PERSONA} FROM crm_personas WHERE id = ?`, [
      personaId,
    ]);
    return filas[0] ? aContactoPersonaCrm(filas[0]) : null;
  }

  /** El líder activo (es_lider = 1; el primero por orden si hubiera varios), o null. */
  async lider(): Promise<ContactoPersonaCrm | null> {
    const filas = await this.bd.filas<FilaPersonaCrm>(
      `SELECT ${COLUMNAS_PERSONA} FROM crm_personas WHERE es_lider = 1 AND activo = 1 ORDER BY orden, nombre, id LIMIT 1`,
    );
    return filas[0] ? aContactoPersonaCrm(filas[0]) : null;
  }

  /** Bloquea la fila y devuelve su foto actual (404 si la persona no existe). */
  private async fotoParaCambiar(conexion: Conexion, personaId: number): Promise<number | null> {
    const [filas] = await conexion.query<FilaFoto[]>(
      'SELECT foto_archivo_id FROM crm_personas WHERE id = ? FOR UPDATE',
      [personaId],
    );
    if (!filas[0]) throw personaNoExiste();
    return idFoto(filas[0].foto_archivo_id);
  }

  /** Id de la persona con ese correo (sin distinguir mayúsculas), o null. */
  private async idPorCorreo(conexion: Conexion, correo: string): Promise<number | null> {
    const [filas] = await conexion.query<RowDataPacket[]>(
      'SELECT id FROM crm_personas WHERE LOWER(correo) = ? ORDER BY id LIMIT 1',
      [correo.toLowerCase()],
    );
    return filas[0] ? Number(filas[0].id) : null;
  }
}
