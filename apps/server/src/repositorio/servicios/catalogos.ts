import { Inject, Injectable } from '@nestjs/common';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import type { CategoriaAdmin, PalabraClaveAdmin } from '../api-repositorio.js';
import { BaseDatosRepositorio, type Conexion } from '../bd/base-datos.js';
import { esDuplicado } from '../bd/errores-bd.js';
import { claveNormalizada } from '../dominio/normalizacion.js';
import {
  validarCambioCategoria,
  validarCategoriaNueva,
  validarPalabraClave,
} from '../dominio/validacion.js';
import { conflicto, noEncontrado } from '../errores-repositorio.js';
import { marcarContenidoCambiado, registrarCambio } from './cambios.js';
import { ServicioLecturaRepositorio } from './lectura-repositorio.js';

/**
 * Categorías y palabras clave de la administración.
 *
 * - Categoría: nombre único sin distinguir tildes ni mayúsculas; borrarla
 *   exige que no tenga documentos (409).
 * - Palabra clave: renombrarla a una que ya existe (sin distinguir tildes ni
 *   mayúsculas) las fusiona; borrarla exige que no esté en uso (409).
 */

interface FilaCategoria extends RowDataPacket {
  id: number;
  nombre: string;
  orden: number;
  documentos: number;
}

interface FilaPalabra extends RowDataPacket {
  id: number;
  texto: string;
  clave: string;
  documentos: number;
}

@Injectable()
export class ServicioCatalogos {
  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
    @Inject(ServicioLecturaRepositorio)
    private readonly lectura: ServicioLecturaRepositorio,
  ) {}

  // ── Categorías ────────────────────────────────────────────────────────

  async listarCategorias(): Promise<CategoriaAdmin[]> {
    const filas = await this.bd.filas<FilaCategoria>(
      `SELECT c.id, c.nombre, c.orden, COUNT(d.id) AS documentos
         FROM repositorio_categorias c LEFT JOIN repositorio_documentos d ON d.categoria_id = c.id
        GROUP BY c.id ORDER BY c.orden, c.nombre`,
    );
    return filas.map(aCategoria);
  }

  async crearCategoria(cuerpo: unknown, usuario: string): Promise<CategoriaAdmin> {
    const { nombre } = validarCategoriaNueva(cuerpo);
    const id = await this.escribir(async (conexion) => {
      const [maximo] = await conexion.query<RowDataPacket[]>(
        'SELECT COALESCE(MAX(orden), 0) AS maximo FROM repositorio_categorias',
      );
      let resultado: ResultSetHeader;
      try {
        [resultado] = await conexion.query<ResultSetHeader>(
          'INSERT INTO repositorio_categorias (nombre, orden) VALUES (?, ?)',
          [nombre, Number(maximo[0]?.maximo ?? 0) + 1],
        );
      } catch (error) {
        if (esDuplicado(error)) throw conflicto(`Ya existe la categoría "${nombre}".`);
        throw error;
      }
      await registrarCambio(conexion, {
        usuario,
        accion: 'categoria',
        detalle: `Creó la categoría «${nombre}»`,
      });
      return resultado.insertId;
    });
    return this.categoria(id);
  }

  async actualizarCategoria(id: number, cuerpo: unknown, usuario: string): Promise<CategoriaAdmin> {
    const { nombre, orden } = validarCambioCategoria(cuerpo);
    await this.escribir(async (conexion) => {
      const [filas] = await conexion.query<FilaCategoria[]>(
        'SELECT id, nombre, orden FROM repositorio_categorias WHERE id = ? FOR UPDATE',
        [id],
      );
      const actual = filas[0];
      if (!actual) throw noEncontrado('La categoría no existe.');
      const detalles: string[] = [];
      if (nombre !== null && nombre !== actual.nombre) {
        try {
          await conexion.query('UPDATE repositorio_categorias SET nombre = ? WHERE id = ?', [nombre, id]);
        } catch (error) {
          if (esDuplicado(error)) throw conflicto(`Ya existe la categoría "${nombre}".`);
          throw error;
        }
        detalles.push(`renombró «${actual.nombre}» a «${nombre}»`);
      }
      if (orden !== null) {
        const movida = await this.moverCategoria(conexion, id, orden);
        if (movida) detalles.push(`la movió a la posición ${orden}`);
      }
      if (detalles.length === 0) return;
      await registrarCambio(conexion, {
        usuario,
        accion: 'categoria',
        detalle: `Categoría: ${detalles.join(' y ')}`,
      });
    });
    return this.categoria(id);
  }

  async borrarCategoria(id: number, usuario: string): Promise<void> {
    await this.escribir(async (conexion) => {
      const [filas] = await conexion.query<FilaCategoria[]>(
        `SELECT c.id, c.nombre, (SELECT COUNT(*) FROM repositorio_documentos d WHERE d.categoria_id = c.id) AS documentos
           FROM repositorio_categorias c WHERE c.id = ? FOR UPDATE`,
        [id],
      );
      const actual = filas[0];
      if (!actual) throw noEncontrado('La categoría no existe.');
      const documentos = Number(actual.documentos);
      if (documentos > 0) {
        throw conflicto(
          `La categoría «${actual.nombre}» tiene ${documentos} ${documentos === 1 ? 'documento' : 'documentos'}: muévalos a otra categoría antes de borrarla.`,
        );
      }
      await conexion.query('DELETE FROM repositorio_categorias WHERE id = ?', [id]);
      await this.renumerarCategorias(conexion);
      await registrarCambio(conexion, {
        usuario,
        accion: 'categoria',
        detalle: `Borró la categoría «${actual.nombre}»`,
      });
    });
  }

  private async categoria(id: number): Promise<CategoriaAdmin> {
    const [fila] = await this.bd.filas<FilaCategoria>(
      `SELECT c.id, c.nombre, c.orden, COUNT(d.id) AS documentos
         FROM repositorio_categorias c LEFT JOIN repositorio_documentos d ON d.categoria_id = c.id
        WHERE c.id = ? GROUP BY c.id`,
      [id],
    );
    if (!fila) throw noEncontrado('La categoría no existe.');
    return aCategoria(fila);
  }

  /** Mueve la categoría a la posición `orden` (1 = primera) y renumera. */
  private async moverCategoria(conexion: Conexion, id: number, orden: number): Promise<boolean> {
    const [filas] = await conexion.query<FilaCategoria[]>(
      'SELECT id FROM repositorio_categorias ORDER BY orden, nombre FOR UPDATE',
    );
    const ids = filas.map((fila) => Number(fila.id));
    const actual = ids.indexOf(id);
    const destino = Math.max(0, Math.min(orden - 1, ids.length - 1));
    if (actual === -1 || actual === destino) return false;
    ids.splice(actual, 1);
    ids.splice(destino, 0, id);
    await this.guardarOrden(conexion, ids);
    return true;
  }

  private async renumerarCategorias(conexion: Conexion): Promise<void> {
    const [filas] = await conexion.query<FilaCategoria[]>(
      'SELECT id FROM repositorio_categorias ORDER BY orden, nombre FOR UPDATE',
    );
    await this.guardarOrden(conexion, filas.map((fila) => Number(fila.id)));
  }

  private async guardarOrden(conexion: Conexion, ids: number[]): Promise<void> {
    for (const [posicion, id] of ids.entries()) {
      await conexion.query('UPDATE repositorio_categorias SET orden = ? WHERE id = ?', [posicion + 1, id]);
    }
  }

  // ── Palabras clave ───────────────────────────────────────────────────

  async listarPalabras(): Promise<PalabraClaveAdmin[]> {
    const filas = await this.bd.filas<FilaPalabra>(
      `SELECT p.id, p.texto, COUNT(dp.documento_id) AS documentos
         FROM repositorio_palabras_clave p LEFT JOIN repositorio_documento_palabras_clave dp ON dp.palabra_id = p.id
        GROUP BY p.id ORDER BY p.texto`,
    );
    return filas.map(aPalabra);
  }

  /**
   * Renombra la palabra. Si el texto nuevo coincide (sin tildes ni
   * mayúsculas) con otra palabra, se fusionan: los documentos pasan a la
   * otra, que toma la escritura nueva, y esta se borra. Devuelve la que queda.
   */
  async renombrarPalabra(id: number, cuerpo: unknown, usuario: string): Promise<PalabraClaveAdmin> {
    const { texto } = validarPalabraClave(cuerpo);
    const clave = claveNormalizada(texto);
    const final = await this.escribir(async (conexion) => {
      const [filas] = await conexion.query<FilaPalabra[]>(
        'SELECT id, texto, clave FROM repositorio_palabras_clave WHERE id = ? FOR UPDATE',
        [id],
      );
      const actual = filas[0];
      if (!actual) throw noEncontrado('La palabra clave no existe.');
      const [otras] = await conexion.query<FilaPalabra[]>(
        'SELECT id, texto FROM repositorio_palabras_clave WHERE clave = ? AND id <> ? FOR UPDATE',
        [clave, id],
      );
      const destino = otras[0];
      if (!destino) {
        if (actual.texto === texto) return id;
        await conexion.query('UPDATE repositorio_palabras_clave SET texto = ?, clave = ? WHERE id = ?', [
          texto,
          clave,
          id,
        ]);
        await registrarCambio(conexion, {
          usuario,
          accion: 'palabra_clave',
          detalle: `Renombró la palabra clave «${actual.texto}» a «${texto}»`,
        });
        return id;
      }
      await this.fusionar(conexion, id, Number(destino.id));
      await conexion.query('UPDATE repositorio_palabras_clave SET texto = ? WHERE id = ?', [texto, destino.id]);
      await registrarCambio(conexion, {
        usuario,
        accion: 'palabra_clave',
        detalle: `Fusionó la palabra clave «${actual.texto}» con «${destino.texto}» (queda «${texto}»)`,
      });
      return Number(destino.id);
    });
    return this.palabra(final);
  }

  async borrarPalabra(id: number, usuario: string): Promise<void> {
    await this.escribir(async (conexion) => {
      const [filas] = await conexion.query<FilaPalabra[]>(
        `SELECT p.id, p.texto,
                (SELECT COUNT(*) FROM repositorio_documento_palabras_clave dp WHERE dp.palabra_id = p.id) AS documentos
           FROM repositorio_palabras_clave p WHERE p.id = ? FOR UPDATE`,
        [id],
      );
      const actual = filas[0];
      if (!actual) throw noEncontrado('La palabra clave no existe.');
      const documentos = Number(actual.documentos);
      if (documentos > 0) {
        throw conflicto(
          `La palabra clave «${actual.texto}» está en ${documentos} ${documentos === 1 ? 'documento' : 'documentos'}: quítela de ellos antes de borrarla.`,
        );
      }
      await conexion.query('DELETE FROM repositorio_palabras_clave WHERE id = ?', [id]);
      await registrarCambio(conexion, {
        usuario,
        accion: 'palabra_clave',
        detalle: `Borró la palabra clave «${actual.texto}»`,
      });
    });
  }

  /** Pasa los documentos de `origen` a `destino` y borra `origen`. */
  private async fusionar(conexion: Conexion, origen: number, destino: number): Promise<void> {
    const [afectados] = await conexion.query<RowDataPacket[]>(
      'SELECT documento_id FROM repositorio_documento_palabras_clave WHERE palabra_id = ? FOR UPDATE',
      [origen],
    );
    // Documentos que ya tenían las dos: se queda la de destino.
    await conexion.query(
      conexion.dialecto === 'postgres'
        ? `DELETE FROM repositorio_documento_palabras_clave o
             USING repositorio_documento_palabras_clave d
            WHERE d.documento_id = o.documento_id AND d.palabra_id = ? AND o.palabra_id = ?`
        : `DELETE o FROM repositorio_documento_palabras_clave o
             JOIN repositorio_documento_palabras_clave d ON d.documento_id = o.documento_id AND d.palabra_id = ?
            WHERE o.palabra_id = ?`,
      [destino, origen],
    );
    await conexion.query(
      'UPDATE repositorio_documento_palabras_clave SET palabra_id = ? WHERE palabra_id = ?',
      [destino, origen],
    );
    await conexion.query('DELETE FROM repositorio_palabras_clave WHERE id = ?', [origen]);
    // Posiciones 1..n sin huecos en los documentos afectados.
    for (const { documento_id: documentoId } of afectados) {
      const [relaciones] = await conexion.query<RowDataPacket[]>(
        'SELECT palabra_id FROM repositorio_documento_palabras_clave WHERE documento_id = ? ORDER BY posicion, palabra_id',
        [documentoId],
      );
      for (const [indice, relacion] of relaciones.entries()) {
        await conexion.query(
          'UPDATE repositorio_documento_palabras_clave SET posicion = ? WHERE documento_id = ? AND palabra_id = ?',
          [indice + 1, documentoId, relacion.palabra_id],
        );
      }
    }
  }

  private async palabra(id: number): Promise<PalabraClaveAdmin> {
    const [fila] = await this.bd.filas<FilaPalabra>(
      `SELECT p.id, p.texto, COUNT(dp.documento_id) AS documentos
         FROM repositorio_palabras_clave p LEFT JOIN repositorio_documento_palabras_clave dp ON dp.palabra_id = p.id
        WHERE p.id = ? GROUP BY p.id`,
      [id],
    );
    if (!fila) throw noEncontrado('La palabra clave no existe.');
    return aPalabra(fila);
  }

  /** Transacción con aumento de versión e invalidación de la caché pública. */
  private async escribir<T>(accion: (conexion: Conexion) => Promise<T>): Promise<T> {
    const resultado = await this.bd.transaccion(async (conexion) => {
      const valor = await accion(conexion);
      await marcarContenidoCambiado(conexion);
      return valor;
    });
    this.lectura.invalidar();
    return resultado;
  }
}

function aCategoria(fila: FilaCategoria): CategoriaAdmin {
  return {
    id: Number(fila.id),
    nombre: fila.nombre,
    orden: Number(fila.orden),
    documentos: Number(fila.documentos ?? 0),
  };
}

function aPalabra(fila: FilaPalabra): PalabraClaveAdmin {
  return {
    id: Number(fila.id),
    texto: fila.texto,
    documentos: Number(fila.documentos ?? 0),
  };
}
