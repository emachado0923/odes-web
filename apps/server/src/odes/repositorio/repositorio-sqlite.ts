import { statSync } from 'node:fs';
import {
  DatabaseSync,
  type SQLInputValue,
  type StatementSync,
} from 'node:sqlite';
import { construirConsulta, restringirAColumnas } from './consulta-fts.js';
import { PESOS_POR_DEFECTO, VERSION_ESQUEMA } from './esquema-indice.js';
import { claveComparacion } from './normalizacion.js';
import {
  RepositorioOdes,
  type CriteriosListado,
  type DocumentoRepositorio,
  type EstadoRepositorio,
  type FiltrosRepositorio,
  type FragmentoRepositorio,
  type IdiomaDocumento,
  type TipoDocumento,
} from './repositorio.tipos.js';
import {
  crearConstructorUrl,
  urlEnPagina,
  type ConstructorUrlDocumento,
} from './url-documento.js';

/**
 * Implementación de RepositorioOdes sobre el índice SQLite (node:sqlite, sin
 * dependencias nativas) que genera `npm run odes:indexar`.
 *
 * - Abre el archivo en SOLO LECTURA al arrancar. Si no existe, está dañado o
 *   es de otra versión del esquema: `estado().disponible` es false, avisa UNA
 *   vez en el registro y todas las operaciones devuelven listas vacías (leer y
 *   obtener devuelven null). Nunca lanza.
 * - Recarga en caliente: como mucho cada `intervaloRecarga` (30 s) mira si el
 *   archivo cambió (inodo, tamaño, fecha). El indexador lo reemplaza con un
 *   rename atómico, así que basta con abrir el nuevo y cerrar el viejo. No usa
 *   temporizadores: la comprobación ocurre en la siguiente consulta.
 */

export interface RegistroRepositorio {
  log(mensaje: string): void;
  warn(mensaje: string): void;
}

export interface OpcionesRepositorioSqlite {
  /** Ruta absoluta del índice. */
  rutaIndice: string;
  /** Constructor de enlaces (ver url-documento.ts). Por defecto: url_ver. */
  construirUrl?: ConstructorUrlDocumento;
  /** Milisegundos mínimos entre comprobaciones del archivo. Por defecto 30 000. */
  intervaloRecarga?: number;
  /** Pesos BM25 (titulo, claves, cuerpo). */
  pesos?: readonly [number, number, number];
  registro?: RegistroRepositorio;
  /** Reloj (para pruebas). */
  ahora?: () => number;
}

export const LIMITE_BUSQUEDA_POR_DEFECTO = 8;
export const LIMITE_BUSQUEDA_MAXIMO = 20;
export const LIMITE_LISTADO_POR_DEFECTO = 20;
export const LIMITE_LISTADO_MAXIMO = 100;
/** Tope de caracteres que devuelve `leer` en una llamada. */
export const MAXIMO_CARACTERES_LECTURA = 24_000;
/** Fragmentos de un mismo documento en la primera pasada de `buscar` (luego hasta 3). */
const MAXIMO_POR_DOCUMENTO = [2, 3] as const;
/** Candidatos que se leen de FTS5 antes de aplicar la diversidad. */
const CANDIDATOS = 400;

const ESTADO_NO_DISPONIBLE: EstadoRepositorio = Object.freeze({
  disponible: false,
  documentos: 0,
  documentosConTexto: 0,
  fragmentos: 0,
  generado: null,
});

interface DocumentoInterno {
  rid: number;
  anio: number | null;
  /** rid de su traducción / original (mismo contenido en el otro idioma), o null. */
  equivalente: number | null;
  documento: DocumentoRepositorio;
}

interface Conexion {
  db: DatabaseSync;
  firma: string;
  porRid: Map<number, DocumentoInterno>;
  porId: Map<string, DocumentoInterno>;
  categorias: string[];
  categoriaPorClave: Map<string, string>;
  estado: EstadoRepositorio;
  sentencias: Map<string, StatementSync>;
}

interface Candidato {
  rid: number;
  documento: number;
  ficha: number;
  paginaInicio: number | null;
  paginaFin: number | null;
  rango: number;
}

interface FiltroSql {
  sql: string;
  parametros: SQLInputValue[];
}

const registroPorDefecto: RegistroRepositorio = {
  log: () => {},
  warn: (mensaje) => console.warn(mensaje),
};

function entero(valor: unknown): number | undefined {
  return typeof valor === 'number' && Number.isFinite(valor)
    ? Math.trunc(valor)
    : undefined;
}

function acotar(
  valor: number | undefined,
  porDefecto: number,
  maximo: number,
): number {
  const numero = entero(valor) ?? porDefecto;
  return Math.min(Math.max(numero, 1), maximo);
}

function copiar(documento: DocumentoRepositorio): DocumentoRepositorio {
  return { ...documento, claves: [...documento.claves] };
}

export class RepositorioSqlite extends RepositorioOdes {
  private readonly rutaIndice: string;
  private readonly construirUrl: ConstructorUrlDocumento;
  private readonly intervaloRecarga: number;
  private readonly pesos: readonly [number, number, number];
  private readonly registro: RegistroRepositorio;
  private readonly ahora: () => number;

  private conexion: Conexion | null = null;
  private ultimaComprobacion = Number.NEGATIVE_INFINITY;
  /** Firma del archivo que ya se intentó abrir sin éxito (para no reintentar ni avisar en bucle). */
  private firmaFallida: string | null = null;
  private ultimoAviso: string | null = null;

  constructor(opciones: OpcionesRepositorioSqlite) {
    super();
    this.rutaIndice = opciones.rutaIndice;
    this.construirUrl = opciones.construirUrl ?? crearConstructorUrl(null);
    this.intervaloRecarga = opciones.intervaloRecarga ?? 30_000;
    this.pesos = opciones.pesos ?? PESOS_POR_DEFECTO;
    this.registro = opciones.registro ?? registroPorDefecto;
    this.ahora = opciones.ahora ?? Date.now;
    this.comprobarArchivo(true);
  }

  /** Cierra el índice (al apagar Nest). */
  onModuleDestroy(): void {
    this.cerrar();
  }

  /**
   * Mira ya si hay un índice nuevo, sin esperar el intervalo (lo llama la
   * administración al terminar una reindexación).
   */
  comprobarAhora(): void {
    this.comprobarArchivo(true);
  }

  cerrar(): void {
    this.conexion?.db.close();
    this.conexion = null;
  }

  // ── Apertura y recarga ────────────────────────────────────────────────

  private avisar(mensaje: string): void {
    if (mensaje === this.ultimoAviso) return;
    this.ultimoAviso = mensaje;
    this.registro.warn(mensaje);
  }

  private firmaArchivo(): string | null {
    try {
      const datos = statSync(this.rutaIndice);
      return datos.isFile()
        ? `${datos.ino}:${datos.size}:${datos.mtimeMs}`
        : null;
    } catch {
      return null;
    }
  }

  /** Abre el índice si cambió. `forzar` ignora el intervalo (arranque). */
  private comprobarArchivo(forzar = false): void {
    const ahora = this.ahora();
    if (!forzar && ahora - this.ultimaComprobacion < this.intervaloRecarga)
      return;
    this.ultimaComprobacion = ahora;

    const firma = this.firmaArchivo();
    if (firma === null) {
      if (!this.conexion) {
        this.avisar(
          `Índice del repositorio ODES no disponible: no existe ${this.rutaIndice}. ` +
            'El asistente responderá sin documentos hasta que se genere con `npm run odes:indexar`.',
        );
      }
      // Si ya había un índice abierto y el archivo desapareció, se sigue
      // usando el abierto (el sistema conserva el archivo mientras esté abierto).
      return;
    }
    if (firma === this.conexion?.firma || firma === this.firmaFallida) return;

    try {
      const nueva = this.abrir(firma);
      const habia = this.conexion !== null;
      this.cerrar();
      this.conexion = nueva;
      this.firmaFallida = null;
      this.ultimoAviso = null;
      const { estado } = nueva;
      this.registro.log(
        `Índice del repositorio ODES ${habia ? 'recargado' : 'cargado'}: ` +
          `${estado.documentos} documentos (${estado.documentosConTexto} con texto), ` +
          `${estado.fragmentos} fragmentos, generado ${estado.generado ?? '¿?'}.`,
      );
    } catch (error) {
      this.firmaFallida = firma;
      const motivo = error instanceof Error ? error.message : String(error);
      this.avisar(
        this.conexion
          ? `No se pudo recargar el índice del repositorio ODES (${this.rutaIndice}): ${motivo}. Se sigue usando el anterior.`
          : `Índice del repositorio ODES no disponible (${this.rutaIndice}): ${motivo}. ` +
              'Vuelva a generarlo con `npm run odes:indexar`.',
      );
    }
  }

  private abrir(firma: string): Conexion {
    const db = new DatabaseSync(this.rutaIndice, { readOnly: true });
    try {
      const meta = new Map<string, string>();
      for (const fila of db.prepare('SELECT clave, valor FROM meta').all()) {
        meta.set(String(fila.clave), String(fila.valor));
      }
      const version = Number(meta.get('version_esquema'));
      if (version !== VERSION_ESQUEMA) {
        throw new Error(
          `el índice es de la versión de esquema ${meta.get('version_esquema') ?? '¿?'} ` +
            `y este servidor espera la ${VERSION_ESQUEMA}`,
        );
      }

      const categorias = db
        .prepare('SELECT nombre FROM categorias ORDER BY orden, nombre')
        .all()
        .map((fila) => String(fila.nombre));
      const categoriaPorClave = new Map<string, string>();
      for (const nombre of categorias)
        categoriaPorClave.set(claveComparacion(nombre), nombre);

      const porRid = new Map<number, DocumentoInterno>();
      const porId = new Map<string, DocumentoInterno>();
      // url_miniatura es opcional: los índices anteriores no la tienen.
      const columnas = new Set(
        db
          .prepare('PRAGMA table_info(documentos)')
          .all()
          .map((fila) => String(fila.name)),
      );
      const urlMiniatura = columnas.has('url_miniatura')
        ? 'd.url_miniatura'
        : 'NULL AS url_miniatura';
      const filas = db
        .prepare(
          `SELECT d.rid, d.id, d.titulo, d.subtitulo, d.categoria, d.numero, d.anio, d.idioma,
                  d.tipo, d.claves, d.url_ver, d.tiene_archivo, d.portada, ${urlMiniatura}, d.nota,
                  d.texto_indexado, d.paginas, e.rid AS equivalente
           FROM documentos d LEFT JOIN documentos e ON e.id = d.equivalente_id
           ORDER BY d.orden`,
        )
        .all();
      for (const fila of filas) {
        const id = String(fila.id);
        const anio = fila.anio === null ? null : Number(fila.anio);
        const documento: DocumentoRepositorio = {
          id,
          titulo: String(fila.titulo),
          categoria: String(fila.categoria),
          anio: anio === null ? 'S. F.' : String(anio),
          claves: JSON.parse(String(fila.claves)) as string[],
          idioma: String(fila.idioma) as IdiomaDocumento,
          tipo: String(fila.tipo) as TipoDocumento,
          url: this.construirUrl({
            id,
            urlVer: String(fila.url_ver),
            tieneArchivo: fila.tiene_archivo === 1,
          }),
          textoIndexado: fila.texto_indexado === 1,
        };
        if (fila.subtitulo !== null)
          documento.subtitulo = String(fila.subtitulo);
        if (fila.numero !== null) documento.numero = String(fila.numero);
        if (fila.portada !== null) documento.portada = String(fila.portada);
        if (fila.url_miniatura !== null && fila.url_miniatura !== undefined)
          documento.urlMiniatura = String(fila.url_miniatura);
        if (fila.nota !== null) documento.nota = String(fila.nota);
        if (fila.paginas !== null) documento.paginas = Number(fila.paginas);
        const interno = {
          rid: Number(fila.rid),
          anio,
          equivalente:
            fila.equivalente === null ? null : Number(fila.equivalente),
          documento,
        };
        porRid.set(interno.rid, interno);
        porId.set(id, interno);
      }

      // Comprueba que la tabla FTS5 responde (detecta un índice dañado al abrir).
      db.prepare(
        'SELECT rowid FROM busqueda WHERE busqueda MATCH \'"observatorio"\' LIMIT 1',
      ).all();
      const fragmentos = Number(
        db.prepare('SELECT COUNT(*) AS total FROM fragmentos').get()?.total ??
          0,
      );

      return {
        db,
        firma,
        porRid,
        porId,
        categorias,
        categoriaPorClave,
        estado: {
          disponible: true,
          documentos: porId.size,
          documentosConTexto: [...porId.values()].filter(
            (d) => d.documento.textoIndexado,
          ).length,
          fragmentos,
          generado: meta.get('generado') ?? null,
        },
        sentencias: new Map(),
      };
    } catch (error) {
      db.close();
      throw error;
    }
  }

  /** Conexión vigente (comprobando antes si hay un índice nuevo). */
  private actual(): Conexion | null {
    this.comprobarArchivo();
    return this.conexion;
  }

  private sentencia(conexion: Conexion, sql: string): StatementSync {
    let sentencia = conexion.sentencias.get(sql);
    if (!sentencia) {
      sentencia = conexion.db.prepare(sql);
      conexion.sentencias.set(sql, sentencia);
    }
    return sentencia;
  }

  // ── Filtros ───────────────────────────────────────────────────────────

  /** SQL de los filtros sobre la tabla `documentos d`; null = imposibles de cumplir. */
  private filtros(
    conexion: Conexion,
    filtros: FiltrosRepositorio,
  ): FiltroSql | null {
    let sql = '';
    const parametros: SQLInputValue[] = [];

    if (Array.isArray(filtros.categorias) && filtros.categorias.length > 0) {
      const categorias = new Set<string>();
      for (const pedida of filtros.categorias) {
        if (typeof pedida !== 'string') continue;
        const canonica = conexion.categoriaPorClave.get(
          claveComparacion(pedida),
        );
        if (canonica) categorias.add(canonica);
      }
      // Pidió categorías y ninguna existe: no hay nada que cumpla el filtro.
      if (categorias.size === 0) return null;
      sql += ` AND d.categoria IN (${[...categorias].map(() => '?').join(', ')})`;
      parametros.push(...categorias);
    }

    let desde = entero(filtros.anioDesde);
    let hasta = entero(filtros.anioHasta);
    if (desde !== undefined && hasta !== undefined && desde > hasta)
      [desde, hasta] = [hasta, desde];
    // Con filtro de año, los documentos sin fecha (S. F.) quedan fuera.
    if (desde !== undefined || hasta !== undefined)
      sql += ' AND d.anio IS NOT NULL';
    if (desde !== undefined) {
      sql += ' AND d.anio >= ?';
      parametros.push(desde);
    }
    if (hasta !== undefined) {
      sql += ' AND d.anio <= ?';
      parametros.push(hasta);
    }

    if (filtros.idioma === 'es' || filtros.idioma === 'en') {
      sql += ' AND d.idioma = ?';
      parametros.push(filtros.idioma);
    }
    return { sql, parametros };
  }

  // ── Búsqueda ──────────────────────────────────────────────────────────

  private candidatos(
    conexion: Conexion,
    expresion: string,
    filtro: FiltroSql,
  ): Candidato[] {
    const sql = `
      SELECT f.rid AS rid, f.documento AS documento, f.ficha AS ficha,
             f.pagina_inicio AS paginaInicio, f.pagina_fin AS paginaFin,
             bm25(busqueda, ?, ?, ?) AS rango
      FROM busqueda
      JOIN fragmentos f ON f.rid = busqueda.rowid
      JOIN documentos d ON d.rid = f.documento
      WHERE busqueda MATCH ?${filtro.sql}
      ORDER BY rango
      LIMIT ${CANDIDATOS}`;
    try {
      return this.sentencia(conexion, sql)
        .all(...this.pesos, expresion, ...filtro.parametros)
        .map((fila) => ({
          rid: Number(fila.rid),
          documento: Number(fila.documento),
          ficha: Number(fila.ficha),
          paginaInicio:
            fila.paginaInicio === null ? null : Number(fila.paginaInicio),
          paginaFin: fila.paginaFin === null ? null : Number(fila.paginaFin),
          rango: Number(fila.rango),
        }));
    } catch (error) {
      // No debería pasar (la consulta se arma con términos citados), pero una
      // búsqueda nunca debe tumbar el chat.
      this.avisar(
        `Búsqueda fallida en el índice del repositorio ODES: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  /**
   * Elige hasta `limite` candidatos con diversidad:
   * - como mucho 2 fragmentos por documento (3 si faltan resultados);
   * - la ficha de un documento que también tiene fragmentos de texto entre los
   *   candidatos se cambia por el mejor de esos fragmentos (el texto es más
   *   útil que la ficha; los metadatos ya van en cada fragmento);
   * - si ya salió un documento, no sale su traducción (mismo contenido en el
   *   otro idioma): gana la versión mejor ubicada, que suele ser la del idioma
   *   de la consulta. Con filtro de idioma no hace falta.
   */
  private seleccionar(
    conexion: Conexion,
    candidatos: readonly Candidato[],
    limite: number,
    porDocumento: Map<number, number>,
    usados: Set<number>,
    unirTraducciones: boolean,
  ): Candidato[] {
    const cuerpos = new Map<number, Candidato[]>();
    for (const candidato of candidatos) {
      if (candidato.ficha) continue;
      const lista = cuerpos.get(candidato.documento) ?? [];
      lista.push(candidato);
      cuerpos.set(candidato.documento, lista);
    }
    const elegidos: Candidato[] = [];
    for (const maximo of MAXIMO_POR_DOCUMENTO) {
      for (const candidato of candidatos) {
        if (elegidos.length >= limite) break;
        let elegido = candidato;
        if (candidato.ficha) {
          const cuerpo = cuerpos
            .get(candidato.documento)
            ?.find((c) => !usados.has(c.rid));
          if (cuerpo) elegido = { ...cuerpo, rango: candidato.rango };
          else if (cuerpos.has(candidato.documento)) continue;
        }
        if (usados.has(elegido.rid)) continue;
        if (unirTraducciones) {
          const equivalente = conexion.porRid.get(
            elegido.documento,
          )?.equivalente;
          if (
            equivalente !== null &&
            equivalente !== undefined &&
            porDocumento.has(equivalente)
          )
            continue;
        }
        const cuenta = porDocumento.get(elegido.documento) ?? 0;
        if (cuenta >= maximo) continue;
        usados.add(elegido.rid);
        porDocumento.set(elegido.documento, cuenta + 1);
        elegidos.push(elegido);
      }
      if (elegidos.length >= limite) break;
    }
    return elegidos.toSorted((a, b) => a.rango - b.rango);
  }

  private aFragmento(
    conexion: Conexion,
    candidato: Candidato,
    puntaje: number,
  ): FragmentoRepositorio | null {
    const interno = conexion.porRid.get(candidato.documento);
    if (!interno) return null;
    const fila = this.sentencia(
      conexion,
      'SELECT texto FROM fragmentos WHERE rid = ?',
    ).get(candidato.rid);
    const documento = copiar(interno.documento);
    return {
      documento,
      paginaInicio: candidato.paginaInicio,
      paginaFin: candidato.paginaFin,
      texto: String(fila?.texto ?? ''),
      url: urlEnPagina(documento.url, documento.tipo, candidato.paginaInicio),
      puntaje,
    };
  }

  buscar(
    consulta: string,
    filtros: FiltrosRepositorio = {},
    limite: number = LIMITE_BUSQUEDA_POR_DEFECTO,
  ): FragmentoRepositorio[] {
    const conexion = this.actual();
    if (!conexion || typeof consulta !== 'string') return [];
    const maximo = acotar(
      limite,
      LIMITE_BUSQUEDA_POR_DEFECTO,
      LIMITE_BUSQUEDA_MAXIMO,
    );
    const fts = construirConsulta(consulta);
    if (!fts) return [];
    const filtro = this.filtros(conexion, filtros ?? {});
    if (!filtro) return [];

    const porDocumento = new Map<number, number>();
    const usados = new Set<number>();
    const unirTraducciones =
      filtros?.idioma !== 'es' && filtros?.idioma !== 'en';
    // Primero los fragmentos que tienen TODOS los términos (Y). Si no llenan
    // el límite, se completa con los que tienen alguno (O), siempre después.
    const elegidos = this.seleccionar(
      conexion,
      this.candidatos(conexion, fts.y, filtro),
      maximo,
      porDocumento,
      usados,
      unirTraducciones,
    );
    if (fts.grupos > 1 && elegidos.length < maximo) {
      elegidos.push(
        ...this.seleccionar(
          conexion,
          this.candidatos(conexion, fts.o, filtro),
          maximo - elegidos.length,
          porDocumento,
          usados,
          unirTraducciones,
        ),
      );
    }

    // Puntaje = -BM25, sin subir nunca respecto del anterior (los resultados
    // de la búsqueda con O van después de los de Y).
    const resultado: FragmentoRepositorio[] = [];
    let anterior = Number.POSITIVE_INFINITY;
    for (const candidato of elegidos) {
      const puntaje = Math.min(
        anterior,
        Math.round(-candidato.rango * 1000) / 1000,
      );
      anterior = puntaje;
      const fragmento = this.aFragmento(conexion, candidato, puntaje);
      if (fragmento) resultado.push(fragmento);
    }
    return resultado;
  }

  // ── Listado, lectura y metadatos ──────────────────────────────────────

  listar(
    criterios: CriteriosListado,
    limite: number = LIMITE_LISTADO_POR_DEFECTO,
  ): { total: number; documentos: DocumentoRepositorio[] } {
    const vacio = { total: 0, documentos: [] };
    const conexion = this.actual();
    if (!conexion) return vacio;
    const maximo = acotar(
      limite,
      LIMITE_LISTADO_POR_DEFECTO,
      LIMITE_LISTADO_MAXIMO,
    );
    const filtro = this.filtros(conexion, criterios ?? {});
    if (!filtro) return vacio;

    let sql = filtro.sql;
    const parametros = [...filtro.parametros];
    const texto = typeof criterios?.texto === 'string' ? criterios.texto : '';
    const fts = texto.trim() ? construirConsulta(texto) : null;
    if (fts) {
      // Título, subtítulo, palabras clave, categoría, número y año (columnas
      // titulo y claves de la ficha), no el texto completo.
      sql +=
        ' AND d.rid IN (SELECT f.documento FROM busqueda JOIN fragmentos f ON f.rid = busqueda.rowid' +
        ' WHERE busqueda MATCH ? AND f.ficha = 1)';
      parametros.push(restringirAColumnas(fts.y, ['titulo', 'claves']));
    }
    const clave =
      typeof criterios?.palabraClave === 'string'
        ? claveComparacion(criterios.palabraClave)
        : '';
    if (clave) {
      // La clave pedida debe estar completa (palabras seguidas) dentro de una
      // palabra clave del documento: "becas" -> "Becas", "Becas Tecnologías".
      sql +=
        " AND d.rid IN (SELECT documento FROM claves WHERE ' ' || comparacion || ' ' LIKE ?)";
      parametros.push(`% ${clave} %`);
    }

    try {
      const total = Number(
        this.sentencia(
          conexion,
          `SELECT COUNT(*) AS total FROM documentos d WHERE 1 = 1${sql}`,
        ).get(...parametros)?.total ?? 0,
      );
      const documentos = this.sentencia(
        conexion,
        `SELECT d.rid AS rid FROM documentos d WHERE 1 = 1${sql} ORDER BY d.orden LIMIT ?`,
      )
        .all(...parametros, maximo)
        .map((fila) => conexion.porRid.get(Number(fila.rid)))
        .filter((interno): interno is DocumentoInterno => interno !== undefined)
        .map((interno) => copiar(interno.documento));
      return { total, documentos };
    } catch (error) {
      this.avisar(
        `Listado fallido en el índice del repositorio ODES: ${error instanceof Error ? error.message : String(error)}`,
      );
      return vacio;
    }
  }

  leer(
    id: string,
    paginaDesde?: number,
    paginaHasta?: number,
  ): FragmentoRepositorio[] | null {
    const conexion = this.actual();
    if (!conexion || typeof id !== 'string') return null;
    const interno = conexion.porId.get(id);
    if (!interno) return null;
    const { documento } = interno;
    const total = documento.paginas ?? 0;
    if (!documento.textoIndexado || total === 0) return [];

    let desde = Math.max(1, entero(paginaDesde) ?? 1);
    const pedidaHasta = entero(paginaHasta);
    let hasta = pedidaHasta ?? total;
    // Un rango invertido explícito (5 a 3) se corrige; "desde" sin "hasta" llega al final.
    if (pedidaHasta !== undefined && hasta < desde)
      [desde, hasta] = [Math.max(1, hasta), desde];
    if (desde > total) return [];
    hasta = Math.min(hasta, total);

    const filas = this.sentencia(
      conexion,
      'SELECT numero, texto FROM paginas WHERE documento = ? AND numero BETWEEN ? AND ? ORDER BY numero',
    ).all(interno.rid, desde, hasta);

    const resultado: FragmentoRepositorio[] = [];
    let caracteres = 0;
    for (const fila of filas) {
      let texto = String(fila.texto).trim();
      if (!texto) continue;
      if (caracteres + texto.length > MAXIMO_CARACTERES_LECTURA) {
        if (resultado.length > 0) break;
        texto = `${texto.slice(0, MAXIMO_CARACTERES_LECTURA)}…`;
      }
      caracteres += texto.length;
      const pagina = Number(fila.numero);
      resultado.push({
        documento: copiar(documento),
        paginaInicio: pagina,
        paginaFin: pagina,
        texto,
        url: urlEnPagina(documento.url, documento.tipo, pagina),
        puntaje: 0,
      });
    }
    return resultado;
  }

  obtener(id: string): DocumentoRepositorio | null {
    const interno =
      typeof id === 'string' ? this.actual()?.porId.get(id) : undefined;
    return interno ? copiar(interno.documento) : null;
  }

  categorias(): string[] {
    return [...(this.actual()?.categorias ?? [])];
  }

  estado(): EstadoRepositorio {
    return { ...(this.actual()?.estado ?? ESTADO_NO_DISPONIBLE) };
  }
}
