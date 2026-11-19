import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import {
  type EvidenciaPai,
  LIMITES_PAI,
  type NumeroBimestre,
  type RespuestaSubidaPai,
  type SubidaPorPartesPai,
  TIPOS_EVIDENCIA,
} from '../api-pai.js';
import {
  type ReferenciaArchivo,
  resumenArchivo,
} from '../../repositorio/archivos/almacen-archivos.js';
import { ErrorStorage } from '../../repositorio/archivos/almacen-supabase.js';
import {
  ErrorSubidaPartes,
  esRutaPartes,
  TAMANO_PARTE,
} from '../../repositorio/archivos/subidas-por-partes.js';
import { conFuenteDeArchivo } from '../../repositorio/archivos/fuente-bytes.js';
import {
  coincideDeclarado,
  detectarTipo,
  extensionDeMime,
  nombreTipo,
} from '../../repositorio/archivos/tipos-archivo.js';
import {
  BaseDatosRepositorio,
  type Conexion,
  ErrorReintentar,
} from '../../repositorio/bd/base-datos.js';
import type { ResultadoEscritura } from '../../repositorio/bd/conexion.js';
import { esDuplicado } from '../../repositorio/bd/errores-bd.js';
import {
  CONFIGURACION_REPOSITORIO,
  type ConfiguracionRepositorio,
} from '../../repositorio/configuracion-repositorio.js';
import { textoLinea } from '../../repositorio/dominio/normalizacion.js';
import { enviarArchivo } from '../../repositorio/http/enviar-archivo.js';
import { nombreArchivoLegible } from '../../repositorio/servicios/documentos-admin.js';
import { registrarEnPai } from '../compartido/registro-pai.js';
import { asegurarReporte } from '../compartido/reportes-comun.js';
import {
  PERMISOS_PAI,
  type PermisosPai,
  type SesionValidaPai,
} from '../compartido/tipos-servidor.js';
import { validarCuerpo } from '../compartido/validacion-comun.js';
import {
  CONFIGURACION_PAI,
  type ConfiguracionPai,
} from '../configuracion-pai.js';
import {
  demasiadasEvidencias,
  demasiadoGrande,
  noDisponible,
  noEncontrado,
  solicitudInvalida,
  tipoNoPermitido,
} from '../errores-pai.js';
import {
  type AlmacenEvidenciasPai,
  type ArchivoEvidenciaValidado,
  CACHE_EVIDENCIA,
  type CuerpoBinario,
  crearAlmacenEvidencias,
  esSubidaEvidencia,
  type OpcionesRecoleccionEvidencias,
} from './almacen-evidencias.js';
import { urlDescargaEvidencia } from './evidencia-pai.js';

/**
 * Evidencias de un reporte (pai_evidencias), spec §5:
 *
 * - Subir y borrar: solo si el usuario puede editar ese (indicador, bimestre)
 *   (PermisosPai.exigirEdicion, que se comprueba antes de tocar el archivo y
 *   otra vez dentro de la transacción). El reporte se crea vacío si no existe
 *   (asegurarReporte). Máximo LIMITES_PAI.maxEvidenciasPorReporte por reporte
 *   (409) y LIMITES_PAI.maxBytesEvidencia por archivo (413); el tipo real se
 *   detecta por firma y debe ser uno de TIPOS_EVIDENCIA (415). Cada subida y
 *   cada borrado quedan en el registro (subir_evidencia / borrar_evidencia).
 * - Descargar: el administrador o un responsable que ve el indicador
 *   (PermisosPai.puedeVer); si no, 404 (no se revela que existe). Con
 *   Supabase, 302 a una URL firmada de 60 s del bucket privado, generada
 *   después de esa comprobación; sin Supabase, el archivo desde la base. En
 *   los dos casos como adjunto con el nombre original y Cache-Control:
 *   private, no-store.
 * - Subida directa (Supabase, por el límite de 4,5 MB del cuerpo en Vercel):
 *   POST …/subidas da una URL firmada de subida al bucket privado (anotada
 *   en pai_subidas a nombre del usuario, el indicador y el bimestre; a lo
 *   sumo MAX_SUBIDAS_PENDIENTES por usuario); el navegador sube con PUT y
 *   envía { subida, nombre, tipo } a POST …/evidencias, que solo acepta una
 *   subida pendiente de ese mismo usuario, indicador y bimestre (si no, 400
 *   sin tocar el objeto); el servidor trae el objeto (cortando en 25 MB), lo
 *   valida como una subida multipart y borra el temporal y su fila.
 * - Multipart: GuardiaSubidaEvidenciaPai comprueba el permiso y el cupo
 *   ANTES de que multer escriba el archivo en disco.
 */

/** Archivo que multer dejó en la carpeta temporal (subida multipart). */
export interface ArchivoEvidenciaSubido {
  ruta: string;
  nombreOriginal: string;
  mimeDeclarado: string;
  bytes: number;
}

const TEXTO_TIPOS =
  'Se aceptan PDF, PNG, JPEG, WebP, Word (DOCX), Excel (XLSX) y PowerPoint (PPTX).';
const TIPOS_PERMITIDOS: readonly string[] = TIPOS_EVIDENCIA;

/** Segundo paso de una subida directa (EvidenciaSubidaDirecta). */
const esquemaSubidaDirecta = z.object({
  subida: z
    .string()
    .refine(
      (ruta) => esSubidaEvidencia(ruta) || esRutaPartes(ruta),
      'La subida no es válida: vuelva a subir el archivo.',
    ),
  nombre: z
    .string()
    .max(
      4 * LIMITES_PAI.maxNombreArchivo,
      'El nombre del archivo es demasiado largo.',
    )
    .default(''),
  tipo: z
    .string()
    .max(255, 'El tipo declarado es demasiado largo.')
    .default(''),
});

/**
 * Nombre con el que se guarda y se descarga la evidencia: el original
 * (arreglado si busboy lo leyó como latin1), sin carpetas, sin caracteres de
 * control, con la extensión del tipo real si no traía ninguna y de a lo sumo
 * LIMITES_PAI.maxNombreArchivo caracteres (conservando la extensión).
 */
export function nombreEvidencia(original: string, mime: string): string {
  const sinCarpetas = nombreArchivoLegible(original).split(/[\\/]/).pop() ?? '';
  // Tabuladores y saltos cuentan como espacios (textoLinea quita los de control).
  let nombre = textoLinea(sinCarpetas.replace(/[\t\r\n]+/g, ' ')).replace(
    /^\.+$/,
    '',
  );
  const extensionReal = `.${extensionDeMime(mime)}`;
  if (!nombre) nombre = `evidencia${extensionReal}`;
  else if (!extname(nombre)) nombre += extensionReal;
  const caracteres = [...nombre];
  if (caracteres.length <= LIMITES_PAI.maxNombreArchivo) return nombre;
  const extension = [...extname(nombre)];
  const conservar =
    extension.length > 0 && extension.length <= 10 ? extension : [];
  return [
    ...caracteres.slice(0, LIMITES_PAI.maxNombreArchivo - conservar.length),
    ...conservar,
  ].join('');
}

/**
 * id del reporte (indicador, bimestre), bloqueado para esta transacción; si
 * no existe, se crea vacío (asegurarReporte). Si otra subida lo creó a la vez,
 * asegurarReporte puede no verlo (en MySQL, REPEATABLE READ, sus lecturas
 * usan la foto del inicio de la transacción) y falla por duplicado: entonces
 * se repite la transacción entera (ErrorReintentar), que ya lo encuentra.
 */
async function reporteBloqueado(
  conexion: Conexion,
  indicadorId: number,
  bimestre: NumeroBimestre,
  usuarioId: number,
): Promise<number> {
  let id: number;
  try {
    id = await asegurarReporte(conexion, indicadorId, bimestre, usuarioId);
  } catch (error) {
    if (esDuplicado(error)) throw new ErrorReintentar(error);
    throw error;
  }
  await conexion.query('SELECT id FROM pai_reportes WHERE id = ? FOR UPDATE', [
    id,
  ]);
  return id;
}

interface FilaEvidenciaCompleta extends RowDataPacket {
  id: number;
  reporte_id: number;
  archivo_id: number;
  ruta_privada: string | null;
  nombre: string;
  tipo: string;
  bytes: number;
  indicador_id: number;
  bimestre: number;
}

interface FilaDescarga extends FilaEvidenciaCompleta {
  sha256: string;
  archivo_bytes: number;
  trozos: number;
  tamano_trozo: number;
  creado_en: Date;
}

@Injectable()
export class ServicioEvidenciasPai {
  private readonly almacen: AlmacenEvidenciasPai;
  private readonly registro = new Logger('PAI');

  constructor(
    @Inject(BaseDatosRepositorio) private readonly bd: BaseDatosRepositorio,
    @Inject(PERMISOS_PAI) private readonly permisos: PermisosPai,
    @Inject(CONFIGURACION_PAI) config: ConfiguracionPai,
    @Inject(CONFIGURACION_REPOSITORIO)
    private readonly configRepositorio: ConfiguracionRepositorio,
  ) {
    this.almacen = crearAlmacenEvidencias(bd, config);
  }

  /** POST .../evidencias/subidas */
  async prepararSubida(
    sesion: SesionValidaPai,
    indicadorId: number,
    bimestre: NumeroBimestre,
  ): Promise<RespuestaSubidaPai> {
    await this.verificarAntes(sesion, indicadorId, bimestre);
    if (!this.almacen.directa) {
      return this.almacen.porPartes
        ? { directa: false, tamanoParte: TAMANO_PARTE, maxBytes: LIMITES_PAI.maxBytesEvidencia }
        : { directa: false };
    }
    const { ruta, url } = await this.almacen.crearSubida({
      usuarioId: sesion.usuarioId,
      indicadorId,
      bimestre,
    });
    return {
      directa: true,
      ruta,
      url,
      maxBytes: LIMITES_PAI.maxBytesEvidencia,
    };
  }

  /** POST .../evidencias/subidas/partes: empieza una subida por partes (sin Supabase). */
  async iniciarSubidaPorPartes(
    sesion: SesionValidaPai,
    indicadorId: number,
    bimestre: NumeroBimestre,
    cuerpo: unknown,
  ): Promise<SubidaPorPartesPai> {
    await this.verificarAntes(sesion, indicadorId, bimestre);
    if (!this.almacen.porPartes) {
      throw solicitudInvalida('Con Supabase Storage las evidencias se suben directo al bucket privado.');
    }
    const bytes = (cuerpo as { bytes?: unknown } | null)?.bytes;
    if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 1) {
      throw solicitudInvalida('Falta el tamaño del archivo.', { archivo: 'Seleccione un archivo.' });
    }
    if (bytes > LIMITES_PAI.maxBytesEvidencia) {
      throw demasiadoGrande(undefined, { archivo: 'El archivo supera 25 MB.' });
    }
    const ruta = await this.almacen.crearSubidaPorPartes({ usuarioId: sesion.usuarioId, indicadorId, bimestre }, bytes);
    return { ruta, tamanoParte: TAMANO_PARTE };
  }

  /** PUT /subidas/partes/:uuid/:n: una parte de una subida por partes del usuario. */
  async recibirParte(sesion: SesionValidaPai, uuid: string, numero: string, req: CuerpoBinario): Promise<void> {
    try {
      await this.almacen.guardarParte(`partes/${uuid}`, sesion.usuarioId, numero, req);
    } catch (error) {
      throw traducirErrorPartes(error);
    }
  }

  /**
   * POST .../evidencias: `archivo` (multipart) o `cuerpo` JSON
   * EvidenciaSubidaDirecta (subida directa al bucket privado o por partes).
   */
  async crear(
    sesion: SesionValidaPai,
    indicadorId: number,
    bimestre: NumeroBimestre,
    archivo: ArchivoEvidenciaSubido | undefined,
    cuerpo: unknown,
  ): Promise<EvidenciaPai> {
    if (archivo) {
      await this.verificarAntes(sesion, indicadorId, bimestre);
      const validado = await this.validarArchivo(archivo);
      return this.guardar(sesion, indicadorId, bimestre, validado);
    }
    const directa = this.leerSubidaDirecta(cuerpo);
    // Solo la subida que pidió este usuario para este indicador y bimestre;
    // la de otro no se usa ni se borra.
    const propia = await this.almacen.esSubidaDe(directa.subida, {
      usuarioId: sesion.usuarioId,
      indicadorId,
      bimestre,
    });
    if (!propia) {
      throw solicitudInvalida(
        'La subida no es válida o ya venció: vuelva a subir el archivo.',
        { archivo: 'Vuelva a seleccionar el archivo.' },
      );
    }
    await mkdir(this.configRepositorio.directorioTemporal, {
      recursive: true,
      mode: 0o700,
    });
    const destino = join(
      this.configRepositorio.directorioTemporal,
      `pai-directa-${randomUUID()}`,
    );
    try {
      await this.verificarAntes(sesion, indicadorId, bimestre);
      const bytes = await this.traerSubida(directa.subida, destino);
      const validado = await this.validarArchivo({
        ruta: destino,
        nombreOriginal: directa.nombre,
        mimeDeclarado: directa.tipo,
        bytes,
      });
      return await this.guardar(sesion, indicadorId, bimestre, validado);
    } finally {
      await rm(destino, { force: true });
      // El objeto temporal (de este usuario) no sirve más: se usó, se
      // rechazó o ya no tiene permiso. Se borran el objeto y su fila.
      await this.almacen.borrarSubida(directa.subida);
    }
  }

  /** GET /evidencias/:id: responde el archivo o un 302 a la URL firmada. */
  async descargar(
    sesion: SesionValidaPai,
    id: number,
    req: Request,
    res: Response,
  ): Promise<void> {
    const filas = await this.bd.filas<FilaDescarga>(
      `SELECT e.id, e.reporte_id, e.archivo_id, e.ruta_privada, e.nombre, e.tipo, e.bytes,
              r.indicador_id, r.bimestre,
              a.sha256, a.bytes AS archivo_bytes, a.trozos, a.tamano_trozo, a.creado_en
         FROM pai_evidencias e
         JOIN pai_reportes r ON r.id = e.reporte_id
         JOIN pai_almacen_archivos a ON a.id = e.archivo_id
        WHERE e.id = ?`,
      [id],
    );
    const fila = filas[0];
    if (
      !fila ||
      !(await this.permisos.puedeVer(sesion, Number(fila.indicador_id)))
    ) {
      throw noEncontrado('La evidencia no existe.');
    }
    const nombre = fila.nombre;
    if (fila.ruta_privada) {
      const url = await this.almacen.urlDescarga(fila.ruta_privada, nombre);
      if (url) {
        res.setHeader('Cache-Control', CACHE_EVIDENCIA);
        res.redirect(302, url);
        return;
      }
      // Evidencia del bucket privado en una instalación que ya no tiene
      // Supabase configurado: solo se puede servir si la ficha tiene trozos.
      if (!(Number(fila.trozos) > 0)) throw noDisponible();
    }
    const archivo: ReferenciaArchivo = {
      id: Number(fila.archivo_id),
      sha256: String(fila.sha256).trim(),
      mime: fila.tipo,
      bytes: Number(fila.archivo_bytes),
      trozos: Number(fila.trozos),
      tamanoTrozo: Number(fila.tamano_trozo),
      creadoEn: new Date(fila.creado_en),
    };
    await enviarArchivo(req, res, {
      archivo,
      almacen: this.almacen.enBase,
      cacheControl: CACHE_EVIDENCIA,
      disposicion: { tipo: 'attachment', nombre },
      registro: this.registro,
    });
  }

  /** DELETE /evidencias/:id */
  async borrar(sesion: SesionValidaPai, id: number): Promise<void> {
    const fila = await this.buscar(id);
    if (
      !fila ||
      !(await this.permisos.puedeVer(sesion, Number(fila.indicador_id)))
    ) {
      throw noEncontrado('La evidencia no existe.');
    }
    const indicadorId = Number(fila.indicador_id);
    const bimestre = Number(fila.bimestre) as NumeroBimestre;
    // Antes de la transacción: 403 con el motivo (solo lectura, bimestre cerrado…).
    await this.permisos.exigirEdicion(sesion, indicadorId, bimestre);
    const rutaPrivada = await this.bd.transaccion(async (conexion) => {
      const [bloqueadas] = await conexion.query<FilaEvidenciaCompleta[]>(
        'SELECT id, reporte_id, archivo_id, ruta_privada, nombre, tipo, bytes FROM pai_evidencias WHERE id = ? FOR UPDATE',
        [id],
      );
      const actual = bloqueadas[0];
      if (!actual) throw noEncontrado('La evidencia no existe.');
      const editable = await this.permisos.exigirEdicion(
        sesion,
        indicadorId,
        bimestre,
        {
          conexion,
        },
      );
      await conexion.query('DELETE FROM pai_evidencias WHERE id = ?', [id]);
      await this.almacen.liberarFicha(conexion, Number(actual.archivo_id));
      await registrarEnPai(conexion, {
        accion: 'borrar_evidencia',
        usuarioId: sesion.usuarioId,
        usuario: sesion.usuario,
        indicadorId,
        codigoIndicador: editable.codigo,
        bimestre,
        detalle: {
          evidenciaId: id,
          nombre: actual.nombre,
          tipo: actual.tipo,
          bytes: Number(actual.bytes),
          motivo: editable.motivo,
        },
      });
      return actual.ruta_privada;
    });
    // Ya confirmado: el objeto privado se borra (si falla, queda para la recolección).
    await this.almacen.borrarContenido([rutaPrivada]);
  }

  /** Objetos del bucket privado sin evidencia y subidas directas viejas (mantenimiento). */
  recolectarHuerfanos(
    opciones?: OpcionesRecoleccionEvidencias,
  ): Promise<{ objetos: number; subidas: number }> {
    return this.almacen.recolectarHuerfanos(opciones);
  }

  /** Fichas de pai_almacen_archivos que ya no usa ninguna evidencia (mantenimiento). */
  recolectarFichasHuerfanas(): Promise<{ archivos: number }> {
    return this.almacen.recolectarFichasHuerfanas();
  }

  // ── Internos ──────────────────────────────────────────────────────────────

  /**
   * Antes de tocar el archivo: puede editar (404/403) y el reporte tiene
   * cupo (409). La transacción lo vuelve a comprobar. También la usa
   * GuardiaSubidaEvidenciaPai antes de que multer reciba el archivo.
   */
  async verificarAntes(
    sesion: SesionValidaPai,
    indicadorId: number,
    bimestre: NumeroBimestre,
  ): Promise<void> {
    await this.permisos.exigirEdicion(sesion, indicadorId, bimestre);
    const filas = await this.bd.filas<RowDataPacket & { n: number }>(
      `SELECT COUNT(*) AS n FROM pai_evidencias e
         JOIN pai_reportes r ON r.id = e.reporte_id
        WHERE r.indicador_id = ? AND r.bimestre = ?`,
      [indicadorId, bimestre],
    );
    if (Number(filas[0]?.n ?? 0) >= LIMITES_PAI.maxEvidenciasPorReporte) {
      throw demasiadasEvidencias();
    }
  }

  private leerSubidaDirecta(
    cuerpo: unknown,
  ): z.output<typeof esquemaSubidaDirecta> {
    const tieneSubida =
      typeof cuerpo === 'object' && cuerpo !== null && 'subida' in cuerpo;
    if (!(this.almacen.directa || this.almacen.porPartes) || !tieneSubida) {
      throw solicitudInvalida(
        'Falta el archivo (campo "archivo" del formulario multipart).',
        { archivo: 'Seleccione un archivo.' },
      );
    }
    return validarCuerpo(
      esquemaSubidaDirecta,
      cuerpo,
      'La subida no es válida.',
    );
  }

  private async traerSubida(subida: string, destino: string): Promise<number> {
    try {
      return await this.almacen.traerSubida(
        subida,
        destino,
        LIMITES_PAI.maxBytesEvidencia,
      );
    } catch (error) {
      if (error instanceof ErrorSubidaPartes) throw traducirErrorPartes(error);
      if (error instanceof ErrorStorage && error.estado === 413) {
        throw demasiadoGrande(undefined, {
          archivo: 'El archivo supera 25 MB.',
        });
      }
      if (error instanceof ErrorStorage && error.estado < 500) {
        throw solicitudInvalida(
          'No se encontró el archivo subido: vuelva a subirlo.',
          { archivo: 'Vuelva a seleccionar el archivo.' },
        );
      }
      throw error;
    }
  }

  /** Tamaño, tipo real (firma) y coincidencia con lo declarado. */
  private async validarArchivo(
    archivo: ArchivoEvidenciaSubido,
  ): Promise<ArchivoEvidenciaValidado & { nombre: string }> {
    if (archivo.bytes === 0) {
      throw solicitudInvalida('El archivo está vacío.', {
        archivo: 'El archivo está vacío.',
      });
    }
    if (archivo.bytes > LIMITES_PAI.maxBytesEvidencia) {
      throw demasiadoGrande(undefined, { archivo: 'El archivo supera 25 MB.' });
    }
    const mime = await conFuenteDeArchivo(archivo.ruta, detectarTipo);
    if (!mime || !TIPOS_PERMITIDOS.includes(mime)) {
      throw tipoNoPermitido(undefined, { archivo: TEXTO_TIPOS });
    }
    if (
      !coincideDeclarado(mime, {
        nombre: archivo.nombreOriginal,
        mime: archivo.mimeDeclarado,
      })
    ) {
      const mensaje = `El archivo dice ser otro tipo, pero su contenido es ${nombreTipo(mime)}. Revise que la extensión corresponda al contenido.`;
      throw tipoNoPermitido(mensaje, { archivo: mensaje });
    }
    const resumen = await resumenArchivo(archivo.ruta);
    if (resumen.bytes === 0) {
      throw solicitudInvalida('El archivo está vacío.', {
        archivo: 'El archivo está vacío.',
      });
    }
    if (resumen.bytes > LIMITES_PAI.maxBytesEvidencia) {
      throw demasiadoGrande(undefined, { archivo: 'El archivo supera 25 MB.' });
    }
    return {
      ruta: archivo.ruta,
      mime,
      resumen,
      nombre: nombreEvidencia(archivo.nombreOriginal, mime),
    };
  }

  /**
   * Guarda la evidencia ya validada: el contenido al bucket privado (fuera de
   * la transacción) y, en la transacción, permisos, cupo, ficha, fila y
   * registro. Si la transacción falla, el objeto privado se borra.
   */
  private async guardar(
    sesion: SesionValidaPai,
    indicadorId: number,
    bimestre: NumeroBimestre,
    archivo: ArchivoEvidenciaValidado & { nombre: string },
  ): Promise<EvidenciaPai> {
    const rutaPrivada = await this.almacen.subirContenido(archivo);
    try {
      return await this.bd.transaccion(async (conexion) => {
        const editable = await this.permisos.exigirEdicion(
          sesion,
          indicadorId,
          bimestre,
          {
            conexion,
          },
        );
        const reporteId = await reporteBloqueado(
          conexion,
          indicadorId,
          bimestre,
          sesion.usuarioId,
        );
        // Lectura con bloqueo: ve lo último confirmado también en MySQL
        // (REPEATABLE READ), así dos subidas a la vez no pasan del máximo.
        const [existentes] = await conexion.query<RowDataPacket[]>(
          'SELECT id FROM pai_evidencias WHERE reporte_id = ? FOR SHARE',
          [reporteId],
        );
        if (existentes.length >= LIMITES_PAI.maxEvidenciasPorReporte) {
          throw demasiadasEvidencias();
        }
        const ficha = await this.almacen.guardarFicha(conexion, archivo);
        const subidoEn = new Date();
        const [resultado] = await conexion.query<ResultadoEscritura>(
          `INSERT INTO pai_evidencias (reporte_id, archivo_id, ruta_privada, nombre, tipo, bytes, subido_por, subido_en)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            reporteId,
            ficha.id,
            rutaPrivada,
            archivo.nombre,
            archivo.mime,
            archivo.resumen.bytes,
            sesion.usuarioId,
            subidoEn,
          ],
        );
        const id = Number(resultado.insertId);
        await registrarEnPai(conexion, {
          accion: 'subir_evidencia',
          usuarioId: sesion.usuarioId,
          usuario: sesion.usuario,
          indicadorId,
          codigoIndicador: editable.codigo,
          bimestre,
          detalle: {
            evidenciaId: id,
            nombre: archivo.nombre,
            tipo: archivo.mime,
            bytes: archivo.resumen.bytes,
            sha256: archivo.resumen.sha256,
            motivo: editable.motivo,
          },
          fecha: subidoEn,
        });
        return {
          id,
          nombre: archivo.nombre,
          tipo: archivo.mime,
          bytes: archivo.resumen.bytes,
          subidoEn: subidoEn.toISOString(),
          subidoPor: sesion.nombre,
          urlDescarga: urlDescargaEvidencia(id),
        };
      });
    } catch (error) {
      await this.almacen.borrarContenido([rutaPrivada]);
      throw error;
    }
  }

  private async buscar(id: number): Promise<FilaEvidenciaCompleta | undefined> {
    const filas = await this.bd.filas<FilaEvidenciaCompleta>(
      `SELECT e.id, e.reporte_id, e.archivo_id, e.ruta_privada, e.nombre, e.tipo, e.bytes,
              r.indicador_id, r.bimestre
         FROM pai_evidencias e
         JOIN pai_reportes r ON r.id = e.reporte_id
        WHERE e.id = ?`,
      [id],
    );
    return filas[0];
  }
}

/** ErrorSubidaPartes -> respuesta HTTP del PAI (los demás errores pasan igual). */
function traducirErrorPartes(error: unknown): unknown {
  if (!(error instanceof ErrorSubidaPartes)) return error;
  return error.motivo === 'demasiado_grande'
    ? demasiadoGrande(error.message, { archivo: error.message })
    : solicitudInvalida(error.message, { archivo: error.message });
}
