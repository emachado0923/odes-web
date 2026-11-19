import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { TIPOS_ARCHIVO_PERMITIDOS } from '../api-repositorio.js';
import {
  type ReferenciaArchivo,
  type Resumen,
  resumenArchivo,
} from '../archivos/almacen-archivos.js';
import { crearAlmacenArchivos } from '../archivos/crear-almacen.js';
import { conFuenteDeArchivo, fuenteDeBuffer } from '../archivos/fuente-bytes.js';
import { dimensionesImagen } from '../archivos/imagenes.js';
import { detectarTipo, MIME, type MimeConocido, nombreTipo } from '../archivos/tipos-archivo.js';
import type { BaseDatosRepositorio, Conexion } from '../bd/base-datos.js';
import { claveNormalizada, mismasClaves } from '../dominio/normalizacion.js';
import { marcarContenidoCambiado, registrarCambio } from '../servicios/cambios.js';
import { abrirPosicion, asignarClaves } from '../servicios/escritura-comun.js';
import { leerDocumento, type RegistroDocumento } from '../servicios/registros.js';
import { leerPaquete, notasInternasDe, type RegistroPaquete } from './paquete.js';

/**
 * Carga inicial (y recarga) del repositorio desde el paquete de datos.
 *
 * - Idempotente: upsert por id; los archivos se identifican por sha256 y no
 *   se duplican; un documento sin cambios no se toca (ni su fecha ni la
 *   versión del contenido). Correrlo dos veces deja los mismos conteos.
 * - Reanudable: cada documento va en su propia transacción; si se corta, la
 *   siguiente corrida salta lo ya cargado (solo vuelve a calcular sha256).
 * - Un documento nuevo entra publicado, en la posición "Más recientes" que le
 *   da el paquete (abriendo lugar: las posiciones siguen siendo 1..N). Uno
 *   existente conserva su estado de publicación y su posición (las decide la
 *   administración) y recibe los demás datos del paquete. Con `soloNuevos`,
 *   los existentes no se tocan.
 * - Protege el trabajo de la administración (salvo que se pida lo contrario):
 *   no vuelve a crear un documento que se borró en la administración (su
 *   último registro en `repositorio_cambios` es 'borrar'; `restaurarBorrados` lo crea de
 *   nuevo) y no actualiza un documento que la administración modificó
 *   después de la carga (actualizado_por distinto del importador; `forzar`
 *   lo sobrescribe con los datos del paquete).
 * - Lo que el paquete no trae (archivo, portada, miniatura) no se borra de un
 *   documento existente.
 * - `curaduria` y el origen van a notas_internas (solo administración).
 */

export interface OpcionesImportacion {
  paquete: string;
  /** Carpeta con <id>.webp (192×192): las miniaturas de apps/web/public/odes/portadas. */
  miniaturas?: string | null;
  soloNuevos?: boolean;
  /** Vuelve a crear los documentos que se borraron en la administración. */
  restaurarBorrados?: boolean;
  /** Sobrescribe con el paquete también los documentos editados en la administración. */
  forzar?: boolean;
  /** Solo para pruebas: sin los archivos de documentos (quedan con su URL original). */
  sinDocumentos?: boolean;
  /** Solo estos ids. */
  ids?: readonly string[] | null;
  usuario?: string;
  registro?: (mensaje: string) => void;
}

export interface ResultadoImportacion {
  version: string | null;
  generado: string | null;
  leidos: number;
  creados: number;
  actualizados: number;
  sinCambios: number;
  /** Existentes que no se tocaron por `soloNuevos`. */
  omitidos: number;
  /** Borrados en la administración que no se volvieron a crear (sin `restaurarBorrados`). */
  omitidosBorrados: number;
  /** Editados en la administración que no se actualizaron (sin `forzar`). */
  omitidosEditados: number;
  archivosNuevos: number;
  bytesNuevos: number;
  archivosReutilizados: number;
  categoriasCreadas: number;
  soloEnBase: number;
  huerfanosBorrados: number;
  avisos: string[];
  duracionMs: number;
}

interface ArchivoPreparado {
  origen: { ruta: string } | { datos: Buffer };
  mime: MimeConocido;
  resumen: Resumen;
  ancho?: number;
  alto?: number;
}

interface Preparado {
  archivo: ArchivoPreparado | null;
  portada: ArchivoPreparado | null;
  miniatura: ArchivoPreparado | null;
}

const PERMITIDOS: readonly string[] = TIPOS_ARCHIVO_PERMITIDOS;

async function prepararImagen(
  ruta: string,
  tipos: readonly MimeConocido[],
  etiqueta: string,
  avisos: string[],
): Promise<ArchivoPreparado | null> {
  const datos = await readFile(ruta);
  const mime = await detectarTipo(fuenteDeBuffer(datos));
  if (!mime || !tipos.includes(mime)) {
    avisos.push(`${etiqueta}: no es ${tipos.map(nombreTipo).join(' ni ')} (${nombreTipo(mime)}); se omite`);
    return null;
  }
  const dimensiones = dimensionesImagen(mime, datos);
  return {
    origen: { datos },
    mime,
    resumen: { sha256: '', bytes: datos.length },
    ancho: dimensiones?.ancho,
    alto: dimensiones?.alto,
  };
}

/** Lee y verifica los archivos de un registro (fuera de la transacción). */
async function preparar(
  registro: RegistroPaquete,
  opciones: OpcionesImportacion,
  avisos: string[],
): Promise<Preparado> {
  let archivo: ArchivoPreparado | null = null;
  if (registro.rutaArchivo && !opciones.sinDocumentos) {
    const mime = await conFuenteDeArchivo(registro.rutaArchivo, detectarTipo);
    if (!mime || !PERMITIDOS.includes(mime)) {
      avisos.push(`${registro.id}: el archivo no es de un tipo permitido (${nombreTipo(mime)}); queda sin archivo`);
    } else {
      if (registro.archivo_tipo && registro.archivo_tipo !== mime) {
        avisos.push(
          `${registro.id}: archivo_tipo dice ${registro.archivo_tipo} pero el contenido es ${mime}; se usa el real`,
        );
      }
      archivo = { origen: { ruta: registro.rutaArchivo }, mime, resumen: await resumenArchivo(registro.rutaArchivo) };
      if (registro.archivo_bytes !== null && registro.archivo_bytes !== archivo.resumen.bytes) {
        avisos.push(
          `${registro.id}: archivo_bytes dice ${registro.archivo_bytes} y el archivo tiene ${archivo.resumen.bytes}`,
        );
      }
    }
  }
  const portada = registro.rutaPortada
    ? await prepararImagen(registro.rutaPortada, [MIME.jpeg], `${registro.id}: portada`, avisos)
    : null;
  if (portada && (portada.ancho !== 720 || portada.alto !== 720)) {
    avisos.push(`${registro.id}: la portada mide ${portada.ancho} × ${portada.alto} (se esperaba 720 × 720)`);
  }
  let miniatura: ArchivoPreparado | null = null;
  if (opciones.miniaturas) {
    const ruta = join(opciones.miniaturas, `${registro.id}.webp`);
    if (existsSync(ruta)) {
      miniatura = await prepararImagen(ruta, [MIME.webp, MIME.png], `${registro.id}: miniatura`, avisos);
    } else {
      avisos.push(`${registro.id}: no hay miniatura ${registro.id}.webp`);
    }
  }
  return { archivo, portada, miniatura };
}

/**
 * Valores de la fila `repositorio_documentos` que salen del paquete. La posición
 * (`orden`) no está aquí: un documento nuevo la recibe con abrirPosicion y
 * uno existente conserva la suya.
 */
function valoresDe(registro: RegistroPaquete, conArchivo: boolean) {
  return {
    titulo: registro.titulo,
    subtitulo: registro.subtitulo,
    numero: registro.numero,
    anio: registro.anio,
    mes: registro.anio === null ? null : registro.mes,
    idioma: registro.idioma,
    tipo: registro.tipo,
    // Con archivo propio, url_ver es solo la referencia histórica.
    urlVerExterna: conArchivo ? null : registro.url_ver,
    urlEntradaBlog: registro.url_entrada_blog,
    nota: registro.nota,
    permiteDescarga: registro.permite_descarga && registro.tipo === 'documento',
    equivalenteEnEspanol: registro.origen.equivalente_en_espanol,
    notasInternas: notasInternasDe(registro),
    urlOriginal: registro.url_ver,
    urlDescargaOriginal: registro.url_descarga,
    paginaOriginal: registro.origen.pagina_sitio?.slice(0, 200) ?? null,
    subidoOriginal: registro.origen.subido && /^\d{4}-\d{2}$/.test(registro.origen.subido) ? registro.origen.subido : null,
  };
}

/** Claves sin repetidas (sin tildes ni mayúsculas) y máximo 7. */
function clavesDe(registro: RegistroPaquete, avisos: string[]): string[] {
  const vistas = new Set<string>();
  const claves: string[] = [];
  for (const texto of registro.claves) {
    const clave = claveNormalizada(texto);
    if (!clave || vistas.has(clave)) continue;
    vistas.add(clave);
    claves.push(texto.trim().slice(0, 80));
  }
  if (claves.length > 7) {
    avisos.push(`${registro.id}: tiene ${claves.length} palabras clave; se guardan las 7 primeras`);
  }
  return claves.slice(0, 7);
}

/** Ids en un aviso: los primeros y cuántos más. */
function listaIds(ids: readonly string[], maximo = 10): string {
  return ids.length > maximo
    ? `${ids.slice(0, maximo).join(', ')} y ${ids.length - maximo} más`
    : ids.join(', ');
}

/** Qué pasó con un documento del paquete. */
type EfectoImportacion = 'creado' | 'actualizado' | 'igual' | 'omitido' | 'borrado' | 'editado';

interface FilaExtra extends RowDataPacket {
  url_descarga_original: string | null;
  pagina_original: string | null;
  subido_original: string | null;
}

export async function importarPaquete(
  bd: BaseDatosRepositorio,
  opciones: OpcionesImportacion,
): Promise<ResultadoImportacion> {
  const inicio = Date.now();
  const registrar = opciones.registro ?? ((): void => undefined);
  const usuario = opciones.usuario ?? 'importador';
  const almacen = crearAlmacenArchivos(bd);
  await bd.listo();
  const paquete = await leerPaquete(opciones.paquete);
  const avisos = [...paquete.avisos];
  const filtro = opciones.ids?.length ? new Set(opciones.ids) : null;
  // En orden "Más recientes": cada documento nuevo abre su lugar en la
  // posición del paquete y la carga inicial queda 1..N en ese orden.
  const registros = (
    filtro ? paquete.registros.filter((registro) => filtro.has(registro.id)) : paquete.registros
  ).toSorted((a, b) => a.orden - b.orden);
  registrar(
    `Paquete ${paquete.version ?? 's. v.'} (${paquete.generado ?? 'sin fecha'}): ${registros.length} registros a importar.`,
  );

  const resultado: ResultadoImportacion = {
    version: paquete.version,
    generado: paquete.generado,
    leidos: registros.length,
    creados: 0,
    actualizados: 0,
    sinCambios: 0,
    omitidos: 0,
    omitidosBorrados: 0,
    omitidosEditados: 0,
    archivosNuevos: 0,
    bytesNuevos: 0,
    archivosReutilizados: 0,
    categoriasCreadas: 0,
    soloEnBase: 0,
    huerfanosBorrados: 0,
    avisos,
    duracionMs: 0,
  };

  // Categorías que faltan, en orden alfabético después de las existentes.
  const categorias = new Map<string, number>();
  await bd.transaccion(async (conexion) => {
    const [existentes] = await conexion.query<RowDataPacket[]>(
      'SELECT id, nombre, orden FROM repositorio_categorias ORDER BY orden FOR UPDATE',
    );
    let orden = existentes.reduce((maximo, fila) => Math.max(maximo, Number(fila.orden)), 0);
    const porClave = new Map(existentes.map((fila) => [claveNormalizada(String(fila.nombre)), Number(fila.id)]));
    const nombres = [...new Set(registros.map((registro) => registro.categoria))].toSorted((a, b) =>
      a.localeCompare(b, 'es'),
    );
    for (const nombre of nombres) {
      const clave = claveNormalizada(nombre);
      let id = porClave.get(clave);
      if (id === undefined) {
        const [insercion] = await conexion.query<ResultSetHeader>(
          'INSERT INTO repositorio_categorias (nombre, orden) VALUES (?, ?)',
          [nombre, ++orden],
        );
        id = insercion.insertId;
        porClave.set(clave, id);
        resultado.categoriasCreadas++;
      }
      categorias.set(nombre, id);
    }
    if (resultado.categoriasCreadas > 0) {
      await registrarCambio(conexion, {
        usuario,
        accion: 'categoria',
        detalle: `Importación: ${resultado.categoriasCreadas} categorías creadas`,
      });
      await marcarContenidoCambiado(conexion);
    }
  });

  const guardarArchivo = async (
    conexion: Conexion,
    preparado: ArchivoPreparado | null,
  ): Promise<ReferenciaArchivo | null> => {
    if (!preparado) return null;
    const guardado = await almacen.guardar(
      conexion,
      preparado.origen,
      { mime: preparado.mime, ancho: preparado.ancho, alto: preparado.alto },
      preparado.resumen.sha256 ? preparado.resumen : undefined,
    );
    if (guardado.nuevo) {
      resultado.archivosNuevos++;
      resultado.bytesNuevos += guardado.bytes;
    } else {
      resultado.archivosReutilizados++;
    }
    return guardado;
  };

  const borrados: string[] = [];
  const editados: string[] = [];
  let procesados = 0;
  for (const registro of registros) {
    const preparado = await preparar(registro, opciones, avisos);
    const claves = clavesDe(registro, avisos);
    const categoriaId = categorias.get(registro.categoria) as number;
    const efecto = await bd.transaccion(async (conexion): Promise<EfectoImportacion> => {
      const [bloqueo] = await conexion.query<RowDataPacket[]>(
        'SELECT id FROM repositorio_documentos WHERE id = ? FOR UPDATE',
        [registro.id],
      );
      const existe = bloqueo.length > 0;
      if (existe && opciones.soloNuevos) return 'omitido';
      const actual = existe ? ((await leerDocumento(conexion, registro.id)) as RegistroDocumento) : null;
      if (
        actual &&
        !opciones.forzar &&
        actual.actualizadoPor !== null &&
        actual.actualizadoPor !== usuario
      ) {
        return 'editado';
      }
      if (!actual && !opciones.restaurarBorrados) {
        // `repositorio_cambios` nunca se purga: su último crear/borrar dice si la
        // administración lo quitó a propósito.
        const [ultimo] = await conexion.query<RowDataPacket[]>(
          `SELECT accion FROM repositorio_cambios WHERE documento_id = ? AND accion IN ('crear', 'borrar')
            ORDER BY id DESC LIMIT 1`,
          [registro.id],
        );
        if (ultimo[0]?.accion === 'borrar') return 'borrado';
      }

      // Lo que el paquete no trae (archivo, portada, miniatura) no se borra:
      // p. ej. el PDF que la administración subió a un estudio de OneDrive.
      const archivo =
        (await guardarArchivo(conexion, preparado.archivo)) ?? actual?.archivo ?? null;
      const portada =
        (await guardarArchivo(conexion, preparado.portada)) ?? actual?.portada ?? null;
      const miniatura =
        (await guardarArchivo(conexion, preparado.miniatura)) ?? actual?.miniatura ?? null;
      const valores = valoresDe(registro, archivo !== null);
      const ahora = new Date();

      if (actual) {
        const [extra] = await conexion.query<FilaExtra[]>(
          'SELECT url_descarga_original, pagina_original, subido_original FROM repositorio_documentos WHERE id = ?',
          [registro.id],
        );
        const sinCambios =
          actual.titulo === valores.titulo &&
          actual.subtitulo === valores.subtitulo &&
          actual.categoriaId === categoriaId &&
          actual.numero === valores.numero &&
          actual.anio === valores.anio &&
          actual.mes === valores.mes &&
          actual.idioma === valores.idioma &&
          actual.tipo === valores.tipo &&
          actual.urlVerExterna === valores.urlVerExterna &&
          actual.urlEntradaBlog === valores.urlEntradaBlog &&
          actual.nota === valores.nota &&
          actual.permiteDescarga === valores.permiteDescarga &&
          actual.equivalenteEnEspanol === valores.equivalenteEnEspanol &&
          actual.notasInternas === valores.notasInternas &&
          actual.urlOriginal === valores.urlOriginal &&
          extra[0]?.url_descarga_original === valores.urlDescargaOriginal &&
          extra[0]?.pagina_original === valores.paginaOriginal &&
          extra[0]?.subido_original === valores.subidoOriginal &&
          mismasClaves(actual.claves, claves) &&
          (actual.archivo?.id ?? null) === (archivo?.id ?? null) &&
          (actual.portada?.id ?? null) === (portada?.id ?? null) &&
          (actual.miniatura?.id ?? null) === (miniatura?.id ?? null);
        if (sinCambios) return 'igual';
        await conexion.query(
          `UPDATE repositorio_documentos SET titulo = ?, subtitulo = ?, categoria_id = ?, numero = ?,
             anio = ?, mes = ?, idioma = ?, tipo = ?, url_ver_externa = ?, url_entrada_blog = ?, nota = ?,
             permite_descarga = ?, equivalente_en_espanol = ?, notas_internas = ?, archivo_id = ?,
             portada_id = ?, miniatura_id = ?, url_original = ?, url_descarga_original = ?,
             pagina_original = ?, subido_original = ?, actualizado_en = ?, actualizado_por = ?
           WHERE id = ?`,
          [
            valores.titulo, valores.subtitulo, categoriaId, valores.numero,
            valores.anio, valores.mes, valores.idioma, valores.tipo, valores.urlVerExterna,
            valores.urlEntradaBlog, valores.nota, valores.permiteDescarga ? 1 : 0,
            valores.equivalenteEnEspanol, valores.notasInternas, archivo?.id ?? null,
            portada?.id ?? null, miniatura?.id ?? null, valores.urlOriginal,
            valores.urlDescargaOriginal, valores.paginaOriginal, valores.subidoOriginal,
            ahora, usuario, registro.id,
          ],
        );
        if (!mismasClaves(actual.claves, claves)) await asignarClaves(conexion, registro.id, claves);
        await almacen.recolectar(conexion, [
          actual.archivo?.id !== archivo?.id ? actual.archivo?.id : null,
          actual.portada?.id !== portada?.id ? actual.portada?.id : null,
          actual.miniatura?.id !== miniatura?.id ? actual.miniatura?.id : null,
        ]);
        await registrarCambio(conexion, {
          usuario,
          accion: 'editar',
          documentoId: registro.id,
          detalle: `Actualizado desde el paquete ${paquete.version ?? ''}`.trim(),
        });
        await marcarContenidoCambiado(conexion);
        return 'actualizado';
      }

      const orden = await abrirPosicion(conexion, registro.orden);
      await conexion.query(
        `INSERT INTO repositorio_documentos (id, orden, titulo, subtitulo, categoria_id, numero, anio, mes, idioma, tipo,
           url_ver_externa, url_entrada_blog, nota, permite_descarga, equivalente_en_espanol, notas_internas,
           archivo_id, portada_id, miniatura_id, publicado, url_original, url_descarga_original,
           pagina_original, subido_original, creado_en, actualizado_en, actualizado_por)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
        [
          registro.id, orden, valores.titulo, valores.subtitulo, categoriaId, valores.numero,
          valores.anio, valores.mes, valores.idioma, valores.tipo, valores.urlVerExterna,
          valores.urlEntradaBlog, valores.nota, valores.permiteDescarga ? 1 : 0,
          valores.equivalenteEnEspanol, valores.notasInternas, archivo?.id ?? null,
          portada?.id ?? null, miniatura?.id ?? null, valores.urlOriginal,
          valores.urlDescargaOriginal, valores.paginaOriginal, valores.subidoOriginal,
          ahora, ahora, usuario,
        ],
      );
      await asignarClaves(conexion, registro.id, claves);
      await registrarCambio(conexion, {
        usuario,
        accion: 'crear',
        documentoId: registro.id,
        detalle: `Importado del paquete ${paquete.version ?? ''} (publicado)`.trim(),
      });
      await marcarContenidoCambiado(conexion);
      return 'creado';
    });
    if (efecto === 'creado') resultado.creados++;
    else if (efecto === 'actualizado') resultado.actualizados++;
    else if (efecto === 'igual') resultado.sinCambios++;
    else if (efecto === 'borrado') borrados.push(registro.id);
    else if (efecto === 'editado') editados.push(registro.id);
    else resultado.omitidos++;
    procesados++;
    if (procesados % 25 === 0 || procesados === registros.length) {
      registrar(
        `  ${procesados}/${registros.length}: ${resultado.creados} nuevos, ${resultado.actualizados} actualizados, ` +
          `${resultado.sinCambios} sin cambios; ${resultado.archivosNuevos} archivos nuevos ` +
          `(${(resultado.bytesNuevos / 1024 / 1024).toFixed(1)} MB)`,
      );
    }
  }

  resultado.omitidosBorrados = borrados.length;
  resultado.omitidosEditados = editados.length;
  if (borrados.length > 0) {
    avisos.push(
      `${borrados.length} documentos se borraron en la administración y no se volvieron a crear ` +
        `(use --restaurar-borrados para crearlos de nuevo): ${listaIds(borrados)}`,
    );
  }
  if (editados.length > 0) {
    avisos.push(
      `${editados.length} documentos se modificaron en la administración y no se actualizaron desde el paquete ` +
        `(use --forzar para sobrescribirlos): ${listaIds(editados)}`,
    );
  }

  if (!filtro) {
    const ids = new Set(registros.map((registro) => registro.id));
    const enBase = await bd.filas<RowDataPacket>('SELECT id FROM repositorio_documentos');
    resultado.soloEnBase = enBase.filter((fila) => !ids.has(String(fila.id))).length;
  }
  resultado.huerfanosBorrados = (await almacen.recolectarHuerfanos()).archivos;
  resultado.duracionMs = Date.now() - inicio;
  return resultado;
}

export interface Conteos {
  publicados: number;
  total: number;
  porCategoria: Array<{ categoria: string; documentos: number }>;
  porIdioma: Record<string, number>;
  tableros: number;
  conEntradaBlog: number;
  conNota: number;
  conArchivo: number;
  conPortada: number;
  conMiniatura: number;
  archivos: number;
  bytesArchivos: number;
  bytesBase: number;
}

/** Conteos de la sección 8 del encargo (sobre los publicados) y tamaño de la base. */
export async function conteosRepositorio(bd: BaseDatosRepositorio): Promise<Conteos> {
  const [totales] = await bd.filas<RowDataPacket>(
    `SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN publicado = 1 THEN 1 ELSE 0 END), 0) AS publicados,
            COALESCE(SUM(CASE WHEN publicado = 1 AND tipo = 'tablero' THEN 1 ELSE 0 END), 0) AS tableros,
            COALESCE(SUM(CASE WHEN publicado = 1 AND url_entrada_blog IS NOT NULL THEN 1 ELSE 0 END), 0) AS blog,
            COALESCE(SUM(CASE WHEN publicado = 1 AND nota IS NOT NULL THEN 1 ELSE 0 END), 0) AS nota,
            COALESCE(SUM(CASE WHEN publicado = 1 AND archivo_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS con_archivo,
            COALESCE(SUM(CASE WHEN publicado = 1 AND portada_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS con_portada,
            COALESCE(SUM(CASE WHEN publicado = 1 AND miniatura_id IS NOT NULL THEN 1 ELSE 0 END), 0) AS con_miniatura
       FROM repositorio_documentos`,
  );
  const categorias = await bd.filas<RowDataPacket>(
    `SELECT c.nombre, COUNT(d.id) AS documentos FROM repositorio_categorias c
       JOIN repositorio_documentos d ON d.categoria_id = c.id AND d.publicado = 1
      GROUP BY c.id ORDER BY documentos DESC, c.nombre`,
  );
  const idiomas = await bd.filas<RowDataPacket>(
    'SELECT idioma, COUNT(*) AS documentos FROM repositorio_documentos WHERE publicado = 1 GROUP BY idioma ORDER BY idioma DESC',
  );
  const [archivos] = await bd.filas<RowDataPacket>(
    'SELECT COUNT(*) AS archivos, COALESCE(SUM(bytes), 0) AS bytes FROM repositorio_almacen_archivos',
  );
  // Tamaño real: estadísticas recién calculadas (ANALYZE solo necesita
  // SELECT e INSERT, que el usuario de la aplicación tiene). En Postgres, el
  // tamaño de las tablas del esquema actual (con índices y TOAST).
  const bytesBase = await bd.conConexion(async (conexion) => {
    if (conexion.dialecto === 'postgres') {
      const [filas] = await conexion.query<RowDataPacket[]>(
        `SELECT COALESCE(SUM(pg_total_relation_size(c.oid)), 0) AS bytes
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = current_schema() AND c.relkind = 'r'`,
      );
      return Number(filas[0]?.bytes ?? 0);
    }
    try {
      await conexion.query(
        'ANALYZE TABLE repositorio_almacen_archivo_trozos, repositorio_almacen_archivos, repositorio_documentos, repositorio_documento_palabras_clave, repositorio_palabras_clave, repositorio_cambios',
      );
      await conexion.query('SET SESSION information_schema_stats_expiry = 0');
    } catch {
      // Sin permiso o sin la variable: queda el tamaño aproximado.
    }
    const [filas] = await conexion.query<RowDataPacket[]>(
      `SELECT COALESCE(SUM(data_length + index_length), 0) AS bytes
         FROM information_schema.tables WHERE table_schema = DATABASE()`,
    );
    return Number(filas[0]?.bytes ?? 0);
  });
  return {
    total: Number(totales?.total ?? 0),
    publicados: Number(totales?.publicados ?? 0),
    porCategoria: categorias.map((fila) => ({
      categoria: String(fila.nombre),
      documentos: Number(fila.documentos),
    })),
    porIdioma: Object.fromEntries(idiomas.map((fila) => [String(fila.idioma), Number(fila.documentos)])),
    tableros: Number(totales?.tableros ?? 0),
    conEntradaBlog: Number(totales?.blog ?? 0),
    conNota: Number(totales?.nota ?? 0),
    conArchivo: Number(totales?.con_archivo ?? 0),
    conPortada: Number(totales?.con_portada ?? 0),
    conMiniatura: Number(totales?.con_miniatura ?? 0),
    archivos: Number(archivos?.archivos ?? 0),
    bytesArchivos: Number(archivos?.bytes ?? 0),
    bytesBase,
  };
}
