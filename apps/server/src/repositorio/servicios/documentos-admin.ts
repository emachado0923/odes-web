import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import type { Readable } from 'node:stream';
import type { RowDataPacket } from 'mysql2/promise';
import {
  type ArchivoSubidoDirecto,
  type DocumentoAdmin,
  LIMITES_REPOSITORIO,
  type RespuestaSubida,
  type SubidaPorPartes,
  TIPOS_ARCHIVO_PERMITIDOS,
} from '../api-repositorio.js';
import {
  type AlmacenArchivos,
  type ReferenciaArchivo,
  resumenArchivo,
} from '../archivos/almacen-archivos.js';
import { conFuenteDeArchivo, fuenteDeBuffer } from '../archivos/fuente-bytes.js';
import { dimensionesImagen } from '../archivos/imagenes.js';
import {
  coincideDeclarado,
  detectarTipo,
  MIME,
  type MimeConocido,
  nombreTipo,
} from '../archivos/tipos-archivo.js';
import { AlmacenArchivosSupabase, esRutaSubida } from '../archivos/almacen-supabase.js';
import {
  armarSubida,
  ErrorSubidaPartes,
  esRutaPartes,
  guardarParte,
  leerCuerpoBinario,
  numeroDeParte,
  rutaPartesNueva,
  TAMANO_PARTE,
  VIGENCIA_SUBIDA_PARTES_MS,
} from '../archivos/subidas-por-partes.js';
import { BaseDatosRepositorio, type Conexion } from '../bd/base-datos.js';
import {
  CONFIGURACION_REPOSITORIO,
  type ConfiguracionRepositorio,
} from '../configuracion-repositorio.js';
import { esDuplicado } from '../bd/errores-bd.js';
import { generarIdDocumento, idUnico, mismasClaves } from '../dominio/normalizacion.js';
import {
  type DatosDocumentoValidos,
  problemasParaPublicar,
  validarConfirmacion,
  validarDatosDocumento,
} from '../dominio/validacion.js';
import {
  conflicto,
  demasiadoGrande,
  demasiadosIntentos,
  type ErrorRepositorioHttp,
  noEncontrado,
  solicitudInvalida,
  tipoNoPermitido,
} from '../errores-repositorio.js';
import { marcarContenidoCambiado, registrarCambio } from './cambios.js';
import {
  abrirPosicion,
  asignarClaves,
  bloquearDocumento,
  categoriaPorNombre,
  cerrarPosicion,
  existeDocumento,
  moverPosicion,
  posicionPorFecha,
} from './escritura-comun.js';
import { ServicioLecturaRepositorio } from './lectura-repositorio.js';
import {
  aDocumentoAdmin,
  leerDocumento,
  leerDocumentos,
  type RegistroDocumento,
  tieneDestino,
} from './registros.js';

/** Subidas por partes sin terminar que puede tener un administrador a la vez. */
export const MAX_SUBIDAS_PARTES = 5;

/** ErrorSubidaPartes -> respuesta HTTP del repositorio (los demás errores pasan igual). */
function traducirErrorPartes(error: unknown): unknown {
  if (!(error instanceof ErrorSubidaPartes)) return error;
  const campos = { archivo: error.message };
  return error.motivo === 'demasiado_grande'
    ? (demasiadoGrande(error.message, campos) as ErrorRepositorioHttp)
    : solicitudInvalida(error.message, campos);
}

/** Archivo recibido por multer (ya en la carpeta temporal). */
export interface ArchivoSubido {
  ruta: string;
  nombreOriginal: string;
  mimeDeclarado: string;
  bytes: number;
}

export const DIMENSION_PORTADA = 720;
export const DIMENSION_MINIATURA = 192;

/** Tipos aceptados para la miniatura (WebP; PNG para navegadores que no codifican WebP). */
const TIPOS_MINIATURA: readonly string[] = [MIME.webp, MIME.png];

const NOMBRES_CAMPOS: Readonly<Record<string, string>> = {
  titulo: 'título',
  subtitulo: 'subtítulo',
  descripcion: 'descripción',
  categoria: 'categoría',
  numero: 'número',
  anio: 'año',
  mes: 'mes',
  idioma: 'idioma',
  tipo: 'tipo',
  claves: 'palabras clave',
  urlVerExterna: 'URL externa',
  urlEntradaBlog: 'entrada del blog',
  nota: 'nota',
  permiteDescarga: 'descarga',
  orden: 'posición',
  equivalenteEnEspanol: 'equivalente en español',
  notasInternas: 'notas internas',
};

export function tamanoLegible(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Arregla nombres UTF-8 que busboy entrega leídos como latin1 (dos caracteres raros por cada tilde). */
export function nombreArchivoLegible(nombre: string): string {
  const reinterpretado = Buffer.from(nombre, 'latin1').toString('utf8');
  return /[\u0080-\u00ff]/.test(nombre) && !reinterpretado.includes('\ufffd')
    ? reinterpretado
    : nombre;
}

function camposCambiados(
  antes: RegistroDocumento,
  datos: DatosDocumentoValidos,
  categoria: string,
): string[] {
  const cambios: string[] = [];
  const comparar = (campo: string, a: unknown, b: unknown): void => {
    if (JSON.stringify(a) !== JSON.stringify(b)) cambios.push(campo);
  };
  comparar('titulo', antes.titulo, datos.titulo);
  comparar('subtitulo', antes.subtitulo, datos.subtitulo);
  comparar('descripcion', antes.descripcion, datos.descripcion);
  comparar('categoria', antes.categoria, categoria);
  comparar('numero', antes.numero, datos.numero);
  comparar('anio', antes.anio, datos.anio);
  comparar('mes', antes.mes, datos.mes);
  comparar('idioma', antes.idioma, datos.idioma);
  comparar('tipo', antes.tipo, datos.tipo);
  if (!mismasClaves(antes.claves, datos.claves)) cambios.push('claves');
  comparar('urlVerExterna', antes.urlVerExterna, datos.urlVerExterna);
  comparar('urlEntradaBlog', antes.urlEntradaBlog, datos.urlEntradaBlog);
  comparar('nota', antes.nota, datos.nota);
  comparar('permiteDescarga', antes.permiteDescarga, datos.permiteDescarga);
  if (datos.orden !== null) comparar('orden', antes.orden, datos.orden);
  comparar('equivalenteEnEspanol', antes.equivalenteEnEspanol, datos.equivalenteEnEspanol);
  comparar('notasInternas', antes.notasInternas, datos.notasInternas);
  return cambios;
}

/**
 * Administración de documentos: crear, editar, publicar, despublicar, borrar
 * y subir o quitar archivo y portada. Cada escritura va en una transacción
 * con su fila en `repositorio_cambios` y el aumento de versión del contenido, y al
 * terminar invalida la caché del listado público.
 */
@Injectable()
export class ServicioDocumentosAdmin {
  private readonly almacen: AlmacenArchivos;

  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
    @Inject(ServicioLecturaRepositorio)
    private readonly lectura: ServicioLecturaRepositorio,
    @Inject(CONFIGURACION_REPOSITORIO)
    private readonly config: ConfiguracionRepositorio,
  ) {
    this.almacen = lectura.almacenArchivos;
  }

  /**
   * Dónde subir un archivo: directo a Supabase Storage (URL firmada) si los
   * archivos van allá; si van en la base, multipart al servidor o, si pesa
   * más de una parte, por partes (ver subidas-por-partes.ts).
   */
  async prepararSubida(): Promise<RespuestaSubida> {
    if (!(this.almacen instanceof AlmacenArchivosSupabase)) {
      return { directa: false, tamanoParte: TAMANO_PARTE, maxBytes: LIMITES_REPOSITORIO.maxBytesArchivo };
    }
    await this.bd.listo();
    const { ruta, url } = await this.almacen.crearSubida();
    return { directa: true, ruta, url, maxBytes: LIMITES_REPOSITORIO.maxBytesArchivo };
  }

  /**
   * POST /subidas/partes: empieza una subida por partes del administrador
   * `usuarioId`. Purga antes las vencidas (de cualquiera) y permite a lo sumo
   * MAX_SUBIDAS_PARTES pendientes por administrador.
   */
  async iniciarSubidaPorPartes(usuarioId: number, cuerpo: unknown, ahora = new Date()): Promise<SubidaPorPartes> {
    const bytes = (cuerpo as { bytes?: unknown } | null)?.bytes;
    if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 1) {
      throw solicitudInvalida('Falta el tamaño del archivo.', { archivo: 'Seleccione un archivo.' });
    }
    if (bytes > LIMITES_REPOSITORIO.maxBytesArchivo) {
      throw demasiadoGrande('El archivo supera el tamaño máximo.', {
        archivo: 'El archivo supera el tamaño máximo.',
      });
    }
    if (this.almacen instanceof AlmacenArchivosSupabase) {
      throw solicitudInvalida('Con Supabase Storage los archivos se suben directo al bucket (POST /subidas).');
    }
    const vencidas = new Date(ahora.getTime() - VIGENCIA_SUBIDA_PARTES_MS);
    await this.bd.ejecutar('DELETE FROM repositorio_subidas WHERE creado_en <= ?', [vencidas]);
    const ruta = rutaPartesNueva();
    await this.bd.transaccion(async (conexion) => {
      // Serializa las subidas de un mismo administrador: el cupo no se pasa
      // con peticiones simultáneas.
      await conexion.query('SELECT id FROM repositorio_administradores WHERE id = ? FOR UPDATE', [usuarioId]);
      const [pendientes] = await conexion.query<(RowDataPacket & { n: number })[]>(
        'SELECT COUNT(*) AS n FROM repositorio_subidas WHERE usuario_id = ?',
        [usuarioId],
      );
      if (Number(pendientes[0]?.n ?? 0) >= MAX_SUBIDAS_PARTES) {
        throw demasiadosIntentos(
          600,
          `Tiene ${MAX_SUBIDAS_PARTES} subidas sin terminar. Espere a que terminen (o unas horas, si se interrumpieron) antes de subir otra.`,
        );
      }
      await conexion.query(
        'INSERT INTO repositorio_subidas (ruta, usuario_id, bytes, creado_en) VALUES (?, ?, ?, ?)',
        [ruta, usuarioId, bytes, ahora],
      );
    });
    return { ruta, tamanoParte: TAMANO_PARTE };
  }

  /** PUT /subidas/partes/:uuid/:n: guarda una parte (el cuerpo binario de `req`). */
  async recibirParte(
    usuarioId: number,
    uuid: string,
    numero: string,
    req: Readable & { headers: Record<string, string | string[] | undefined> },
  ): Promise<void> {
    const subida = await this.subidaPorPartes(`partes/${uuid}`, usuarioId);
    try {
      const n = numeroDeParte(numero, subida.bytes);
      const datos = await leerCuerpoBinario(req, TAMANO_PARTE);
      await guardarParte(this.bd, 'repositorio_subida_partes', subida.id, subida.bytes, n, datos);
    } catch (error) {
      throw traducirErrorPartes(error);
    }
  }

  /**
   * Segundo paso de una subida directa (trae el archivo del bucket) o por
   * partes (lo arma desde la base): el archivo queda en la carpeta temporal y
   * se valida y guarda igual que una subida multipart.
   */
  async subirArchivoDirecto(
    id: string,
    cuerpo: unknown,
    usuario: string,
    usuarioId: number,
  ): Promise<DocumentoAdmin> {
    const datos = (cuerpo ?? {}) as Partial<Record<keyof ArchivoSubidoDirecto, unknown>>;
    const almacen = this.almacen;
    const directa = almacen instanceof AlmacenArchivosSupabase && esRutaSubida(datos.subida);
    const porPartes = !(almacen instanceof AlmacenArchivosSupabase) && esRutaPartes(datos.subida);
    if (!directa && !porPartes) {
      throw solicitudInvalida('Falta el archivo (campo "archivo" del formulario multipart).', {
        archivo: 'Seleccione un archivo.',
      });
    }
    const subida = String(datos.subida);
    const fila = porPartes ? await this.subidaPorPartes(subida, usuarioId) : null;
    await mkdir(this.config.directorioTemporal, { recursive: true, mode: 0o700 });
    const destino = join(this.config.directorioTemporal, `directa-${randomUUID()}`);
    try {
      let bytes: number;
      try {
        bytes = fila
          ? await armarSubida(this.bd, 'repositorio_subida_partes', fila.id, fila.bytes, destino)
          : await (almacen as AlmacenArchivosSupabase).traerSubida(
              subida,
              destino,
              LIMITES_REPOSITORIO.maxBytesArchivo,
            );
      } catch (error) {
        throw traducirErrorPartes(error);
      }
      return await this.subirArchivo(
        id,
        {
          ruta: destino,
          nombreOriginal: typeof datos.nombre === 'string' ? datos.nombre.slice(0, 255) : '',
          mimeDeclarado: typeof datos.tipo === 'string' ? datos.tipo.slice(0, 127) : '',
          bytes,
        },
        usuario,
      );
    } finally {
      await rm(destino, { force: true });
      if (fila) {
        // Usada, rechazada o incompleta: la subida no sirve más (las partes se van en cascada).
        await this.bd.ejecutar('DELETE FROM repositorio_subidas WHERE id = ?', [fila.id]).catch(() => undefined);
      } else {
        await (almacen as AlmacenArchivosSupabase).borrarSubida(subida);
      }
    }
  }

  /** La subida por partes `ruta` de ese administrador, vigente, o 400. */
  private async subidaPorPartes(ruta: string, usuarioId: number): Promise<{ id: number; bytes: number }> {
    const filas = esRutaPartes(ruta)
      ? await this.bd.filas<RowDataPacket & { id: number; bytes: number; creado_en: Date }>(
          'SELECT id, bytes, creado_en FROM repositorio_subidas WHERE ruta = ? AND usuario_id = ?',
          [ruta, usuarioId],
        )
      : [];
    const fila = filas[0];
    if (!fila || Date.now() - new Date(fila.creado_en).getTime() > VIGENCIA_SUBIDA_PARTES_MS) {
      throw solicitudInvalida('La subida no es válida o ya venció: vuelva a subir el archivo.', {
        archivo: 'Vuelva a seleccionar el archivo.',
      });
    }
    return { id: Number(fila.id), bytes: Number(fila.bytes) };
  }

  async listar(): Promise<DocumentoAdmin[]> {
    const registros = await this.bd.conConexion((conexion) => leerDocumentos(conexion));
    return registros.map(aDocumentoAdmin);
  }

  async obtener(id: string): Promise<DocumentoAdmin> {
    return aDocumentoAdmin(await this.registro(id));
  }

  /** Registro completo (también despublicado) o 404. */
  async registro(id: string): Promise<RegistroDocumento> {
    const registro = await this.bd.conConexion((conexion) => leerDocumento(conexion, id));
    if (!registro) throw noEncontrado('El documento no existe.');
    return registro;
  }

  async crear(cuerpo: unknown, usuario: string): Promise<DocumentoAdmin> {
    const datos = validarDatosDocumento(cuerpo);
    return this.escribir(async (conexion) => {
      const categoria = await categoriaPorNombre(conexion, datos.categoria);
      let id: string;
      if (datos.id) {
        if (await existeDocumento(conexion, datos.id)) {
          throw conflicto(`Ya existe un documento con el identificador "${datos.id}".`);
        }
        id = datos.id;
      } else {
        id = await idUnico(
          generarIdDocumento({ ...datos, categoria: categoria.nombre }),
          (candidato) => existeDocumento(conexion, candidato),
        );
      }
      const orden = await abrirPosicion(
        conexion,
        datos.orden ?? (await posicionPorFecha(conexion, datos.anio, datos.mes, null)),
      );
      const ahora = new Date();
      try {
        await conexion.query(
          `INSERT INTO repositorio_documentos (id, orden, titulo, subtitulo, descripcion, categoria_id, numero, anio, mes,
             idioma, tipo, url_ver_externa, url_entrada_blog, nota, permite_descarga,
             equivalente_en_espanol, notas_internas, publicado, creado_en, actualizado_en, actualizado_por)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          [
            id,
            orden,
            datos.titulo,
            datos.subtitulo,
            datos.descripcion,
            categoria.id,
            datos.numero,
            datos.anio,
            datos.mes,
            datos.idioma,
            datos.tipo,
            datos.urlVerExterna,
            datos.urlEntradaBlog,
            datos.nota,
            datos.permiteDescarga ? 1 : 0,
            datos.equivalenteEnEspanol,
            datos.notasInternas,
            ahora,
            ahora,
            usuario,
          ],
        );
      } catch (error) {
        if (esDuplicado(error, 'PRIMARY')) {
          throw conflicto(`Ya existe un documento con el identificador "${id}".`);
        }
        throw error;
      }
      await asignarClaves(conexion, id, datos.claves);
      await registrarCambio(conexion, {
        usuario,
        accion: 'crear',
        documentoId: id,
        detalle: `Creó «${datos.titulo}» (despublicado)`,
      });
      return id;
    });
  }

  async actualizar(id: string, cuerpo: unknown, usuario: string): Promise<DocumentoAdmin> {
    const datos = validarDatosDocumento(cuerpo);
    if (datos.id && datos.id !== id) {
      throw solicitudInvalida('El identificador de un documento no se puede cambiar.', {
        id: 'El identificador de un documento no se puede cambiar.',
      });
    }
    return this.escribir(async (conexion) => {
      await bloquearDocumento(conexion, id);
      const antes = (await leerDocumento(conexion, id)) as RegistroDocumento;
      const categoria = await categoriaPorNombre(conexion, datos.categoria);
      const cambiados = camposCambiados(antes, datos, categoria.nombre);
      if (cambiados.length === 0) return { id, sinCambios: true };
      if (antes.publicado && !tieneDestino({ archivo: antes.archivo, urlVerExterna: datos.urlVerExterna })) {
        throw conflicto(
          'El documento está publicado y quedaría sin archivo ni URL externa. Agregue una URL externa o despublíquelo primero.',
        );
      }
      if (antes.publicado) {
        // Un documento publicado tiene que seguir cumpliendo lo necesario para estarlo.
        const problemas = problemasParaPublicar(datos);
        if (Object.keys(problemas).length > 0) {
          throw solicitudInvalida(
            'El documento está publicado: complete los campos marcados o despublíquelo para guardarlo incompleto.',
            problemas,
          );
        }
      }
      let orden = antes.orden;
      if (datos.orden !== null && datos.orden !== antes.orden) {
        orden = await moverPosicion(conexion, id, antes.orden, datos.orden);
      } else if (datos.orden === null && (datos.anio !== antes.anio || datos.mes !== antes.mes)) {
        // Cambió la fecha: se recoloca en "Más recientes".
        const destino = await posicionPorFecha(conexion, datos.anio, datos.mes, id);
        orden = await moverPosicion(conexion, id, antes.orden, destino > antes.orden ? destino - 1 : destino);
      }
      await conexion.query(
        `UPDATE repositorio_documentos SET orden = ?, titulo = ?, subtitulo = ?, descripcion = ?, categoria_id = ?, numero = ?,
           anio = ?, mes = ?, idioma = ?, tipo = ?, url_ver_externa = ?, url_entrada_blog = ?,
           nota = ?, permite_descarga = ?, equivalente_en_espanol = ?, notas_internas = ?,
           actualizado_en = ?, actualizado_por = ?
         WHERE id = ?`,
        [
          orden,
          datos.titulo,
          datos.subtitulo,
          datos.descripcion,
          categoria.id,
          datos.numero,
          datos.anio,
          datos.mes,
          datos.idioma,
          datos.tipo,
          datos.urlVerExterna,
          datos.urlEntradaBlog,
          datos.nota,
          datos.permiteDescarga ? 1 : 0,
          datos.equivalenteEnEspanol,
          datos.notasInternas,
          new Date(),
          usuario,
          id,
        ],
      );
      if (cambiados.includes('claves')) await asignarClaves(conexion, id, datos.claves);
      await registrarCambio(conexion, {
        usuario,
        accion: 'editar',
        documentoId: id,
        detalle: `Cambió: ${cambiados.map((campo) => NOMBRES_CAMPOS[campo] ?? campo).join(', ')}`,
      });
      return id;
    });
  }

  async publicar(id: string, usuario: string): Promise<DocumentoAdmin> {
    return this.cambiarPublicacion(id, true, usuario);
  }

  async despublicar(id: string, usuario: string): Promise<DocumentoAdmin> {
    return this.cambiarPublicacion(id, false, usuario);
  }

  private cambiarPublicacion(id: string, publicar: boolean, usuario: string): Promise<DocumentoAdmin> {
    return this.escribir(async (conexion) => {
      await bloquearDocumento(conexion, id);
      const actual = (await leerDocumento(conexion, id)) as RegistroDocumento;
      if (actual.publicado === publicar) return { id, sinCambios: true };
      if (publicar && !tieneDestino(actual)) {
        throw conflicto('Agregue el archivo o una URL externa antes de publicar el documento.');
      }
      if (publicar) {
        const problemas = Object.values(problemasParaPublicar(actual));
        if (problemas.length > 0) throw conflicto(`No se puede publicar todavía. ${problemas.join(' ')}`);
      }
      await conexion.query(
        'UPDATE repositorio_documentos SET publicado = ?, actualizado_en = ?, actualizado_por = ? WHERE id = ?',
        [publicar ? 1 : 0, new Date(), usuario, id],
      );
      await registrarCambio(conexion, {
        usuario,
        accion: publicar ? 'publicar' : 'despublicar',
        documentoId: id,
        detalle: `${publicar ? 'Publicó' : 'Despublicó'} «${actual.titulo}»`,
      });
      return id;
    });
  }

  async borrar(id: string, cuerpo: unknown, usuario: string): Promise<void> {
    const { confirmarId } = validarConfirmacion(cuerpo);
    await this.bd.transaccion(async (conexion) => {
      await bloquearDocumento(conexion, id);
      const actual = (await leerDocumento(conexion, id)) as RegistroDocumento;
      if (confirmarId !== id) {
        throw solicitudInvalida('La confirmación no coincide con el identificador del documento.', {
          confirmarId: `Escriba exactamente "${id}" para confirmar.`,
        });
      }
      if (actual.publicado) {
        throw conflicto('Despublique el documento antes de borrarlo definitivamente.');
      }
      await conexion.query('DELETE FROM repositorio_documentos WHERE id = ?', [id]);
      await cerrarPosicion(conexion, actual.orden);
      await this.almacen.recolectar(conexion, [
        actual.archivo?.id,
        actual.portada?.id,
        actual.miniatura?.id,
      ]);
      await registrarCambio(conexion, {
        usuario,
        accion: 'borrar',
        documentoId: id,
        detalle: `Borró definitivamente «${actual.titulo}» (con su archivo y portada)`,
      });
      await marcarContenidoCambiado(conexion);
    });
    this.lectura.invalidar();
  }

  async subirArchivo(id: string, subido: ArchivoSubido | undefined, usuario: string): Promise<DocumentoAdmin> {
    if (!subido) {
      throw solicitudInvalida('Falta el archivo (campo "archivo" del formulario multipart).', {
        archivo: 'Seleccione un archivo.',
      });
    }
    if (subido.bytes === 0) {
      throw solicitudInvalida('El archivo está vacío.', { archivo: 'El archivo está vacío.' });
    }
    const mime = await conFuenteDeArchivo(subido.ruta, detectarTipo);
    const permitidos: readonly string[] = TIPOS_ARCHIVO_PERMITIDOS;
    if (!mime || !permitidos.includes(mime)) {
      throw tipoNoPermitido('Tipo de archivo no permitido. Se aceptan PDF, PNG, JPEG, DOCX y PPTX.', {
        archivo: 'Se aceptan PDF, PNG, JPEG, DOCX y PPTX.',
      });
    }
    this.verificarDeclarado(mime, subido, 'archivo');
    const resumen = await resumenArchivo(subido.ruta);
    const nombre = nombreArchivoLegible(subido.nombreOriginal);
    return this.escribir(async (conexion) => {
      await bloquearDocumento(conexion, id);
      const actual = (await leerDocumento(conexion, id)) as RegistroDocumento;
      const guardado = await this.almacen.guardar(conexion, { ruta: subido.ruta }, { mime }, resumen);
      if (actual.archivo?.id === guardado.id) return { id, sinCambios: true };
      await conexion.query(
        'UPDATE repositorio_documentos SET archivo_id = ?, actualizado_en = ?, actualizado_por = ? WHERE id = ?',
        [guardado.id, new Date(), usuario, id],
      );
      await this.almacen.recolectar(conexion, [actual.archivo?.id]);
      await registrarCambio(conexion, {
        usuario,
        accion: 'subir_archivo',
        documentoId: id,
        detalle: `${actual.archivo ? 'Reemplazó' : 'Subió'} el archivo: ${nombre} (${nombreTipo(mime)}, ${tamanoLegible(resumen.bytes)})`,
      });
      return id;
    });
  }

  async quitarArchivo(id: string, usuario: string): Promise<DocumentoAdmin> {
    return this.escribir(async (conexion) => {
      await bloquearDocumento(conexion, id);
      const actual = (await leerDocumento(conexion, id)) as RegistroDocumento;
      if (!actual.archivo) return { id, sinCambios: true };
      if (actual.publicado && !actual.urlVerExterna) {
        throw conflicto(
          'El documento está publicado y no tiene URL externa: despublíquelo o agregue una URL externa antes de quitar el archivo.',
        );
      }
      await conexion.query(
        'UPDATE repositorio_documentos SET archivo_id = NULL, actualizado_en = ?, actualizado_por = ? WHERE id = ?',
        [new Date(), usuario, id],
      );
      await this.almacen.recolectar(conexion, [actual.archivo.id]);
      await registrarCambio(conexion, {
        usuario,
        accion: 'quitar_archivo',
        documentoId: id,
        detalle: `Quitó el archivo (${nombreTipo(actual.archivo.mime)}, ${tamanoLegible(actual.archivo.bytes)})`,
      });
      return id;
    });
  }

  async subirPortada(
    id: string,
    portada: ArchivoSubido | undefined,
    miniatura: ArchivoSubido | undefined,
    usuario: string,
  ): Promise<DocumentoAdmin> {
    if (!portada) {
      throw solicitudInvalida('Falta la portada (campo "portada", JPEG de 720 × 720 px).', {
        portada: 'Seleccione la portada (JPEG de 720 × 720 px).',
      });
    }
    const datosPortada = await this.leerImagen(portada, 'portada', [MIME.jpeg], DIMENSION_PORTADA);
    const datosMiniatura = miniatura
      ? await this.leerImagen(miniatura, 'miniatura', TIPOS_MINIATURA, DIMENSION_MINIATURA)
      : null;
    return this.escribir(async (conexion) => {
      await bloquearDocumento(conexion, id);
      const actual = (await leerDocumento(conexion, id)) as RegistroDocumento;
      const nuevaPortada = await this.almacen.guardar(
        conexion,
        { datos: datosPortada.datos },
        { mime: datosPortada.mime, ancho: DIMENSION_PORTADA, alto: DIMENSION_PORTADA },
      );
      const nuevaMiniatura = datosMiniatura
        ? await this.almacen.guardar(
            conexion,
            { datos: datosMiniatura.datos },
            { mime: datosMiniatura.mime, ancho: DIMENSION_MINIATURA, alto: DIMENSION_MINIATURA },
          )
        : null;
      if (actual.portada?.id === nuevaPortada.id && (actual.miniatura?.id ?? null) === (nuevaMiniatura?.id ?? null)) {
        return { id, sinCambios: true };
      }
      await conexion.query(
        'UPDATE repositorio_documentos SET portada_id = ?, miniatura_id = ?, actualizado_en = ?, actualizado_por = ? WHERE id = ?',
        [nuevaPortada.id, nuevaMiniatura?.id ?? null, new Date(), usuario, id],
      );
      await this.almacen.recolectar(conexion, [actual.portada?.id, actual.miniatura?.id]);
      await registrarCambio(conexion, {
        usuario,
        accion: 'subir_portada',
        documentoId: id,
        detalle:
          `${actual.portada ? 'Reemplazó' : 'Subió'} la portada (${tamanoLegible(datosPortada.datos.length)})` +
          (datosMiniatura ? ` y la miniatura (${nombreTipo(datosMiniatura.mime)})` : ', sin miniatura'),
      });
      return id;
    });
  }

  /** Archivo, portada o miniatura de cualquier documento (para la administración). */
  async referenciaAdmin(
    id: string,
    recurso: 'archivo' | 'portada' | 'miniatura',
  ): Promise<{ registro: RegistroDocumento; referencia: ReferenciaArchivo }> {
    const registro = await this.registro(id);
    const referencia = registro[recurso];
    if (!referencia) throw noEncontrado('El documento no tiene ese archivo.');
    return { registro, referencia };
  }

  private verificarDeclarado(mime: MimeConocido, subido: ArchivoSubido, campo: string): void {
    if (!coincideDeclarado(mime, { nombre: subido.nombreOriginal, mime: subido.mimeDeclarado })) {
      const mensaje = `El archivo dice ser otro tipo, pero su contenido es ${nombreTipo(mime)}. Revise que la extensión corresponda al contenido.`;
      throw tipoNoPermitido(mensaje, { [campo]: mensaje });
    }
  }

  private async leerImagen(
    subido: ArchivoSubido,
    campo: 'portada' | 'miniatura',
    tipos: readonly string[],
    lado: number,
  ): Promise<{ datos: Buffer; mime: MimeConocido }> {
    const nombre = campo === 'portada' ? 'La portada' : 'La miniatura';
    const esperado = campo === 'portada' ? 'JPEG' : 'WebP (o PNG)';
    if (subido.bytes === 0 || subido.bytes > LIMITES_REPOSITORIO.maxBytesPortada) {
      throw solicitudInvalida(`${nombre} está vacía o es demasiado grande.`, {
        [campo]: `${nombre} está vacía o es demasiado grande.`,
      });
    }
    const datos = await readFile(subido.ruta);
    const mime = await detectarTipo(fuenteDeBuffer(datos));
    if (!mime || !tipos.includes(mime)) {
      throw tipoNoPermitido(`${nombre} debe ser una imagen ${esperado}.`, {
        [campo]: `${nombre} debe ser una imagen ${esperado} de ${lado} × ${lado} px.`,
      });
    }
    this.verificarDeclarado(mime, subido, campo);
    const dimensiones = dimensionesImagen(mime, datos);
    if (!dimensiones || dimensiones.ancho !== lado || dimensiones.alto !== lado) {
      const mide = dimensiones ? ` (mide ${dimensiones.ancho} × ${dimensiones.alto})` : '';
      throw solicitudInvalida(`${nombre} debe medir ${lado} × ${lado} px${mide}.`, {
        [campo]: `${nombre} debe medir ${lado} × ${lado} px${mide}.`,
      });
    }
    return { datos, mime };
  }

  /**
   * Transacción de escritura de un documento: la acción devuelve el id (o
   * { id, sinCambios } si no hubo nada que guardar). Si hubo cambios, aumenta
   * la versión del contenido e invalida la caché. Devuelve el documento como
   * quedó.
   */
  private async escribir(
    accion: (conexion: Conexion) => Promise<string | { id: string; sinCambios: true }>,
  ): Promise<DocumentoAdmin> {
    let huboCambios = false;
    const registro = await this.bd.transaccion(async (conexion) => {
      const resultado = await accion(conexion);
      const id = typeof resultado === 'string' ? resultado : resultado.id;
      huboCambios = typeof resultado === 'string';
      if (huboCambios) await marcarContenidoCambiado(conexion);
      return (await leerDocumento(conexion, id)) as RegistroDocumento;
    });
    if (huboCambios) this.lectura.invalidar();
    return aDocumentoAdmin(registro);
  }
}
