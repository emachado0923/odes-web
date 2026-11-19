import { existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ESQUEMA_SQL, VERSION_ESQUEMA } from '../esquema-indice.js';
import { claveComparacion, normalizarParaIndice } from '../normalizacion.js';
import {
  MINIMO_CARACTERES_TEXTO,
  type DocumentoIndexable,
} from './documento-indexable.js';
import { fragmentarPaginas } from './fragmentacion.js';
import { caracteresVisibles } from './limpieza.js';

/**
 * Escribe el índice SQLite completo en un archivo temporal junto al destino y
 * lo pone en su lugar con rename (atómico): el servidor nunca ve un índice a
 * medio escribir y, al detectar el archivo nuevo, lo recarga solo.
 */

export interface DatosIndice {
  /** Fecha ISO de generación. */
  generado: string;
  /** Descripción de la fuente (p. ej. "paquete JSON … (versión 4.2)"). */
  fuente: string;
  versionFuente: string | null;
  /** paquete | mysql (meta fuente_tipo). */
  origenFuente?: string | null;
  /** Huella del contenido de la fuente (meta huella_fuente). */
  huellaFuente?: string | null;
  /** Categorías en orden de presentación. */
  categorias: string[];
  documentos: DocumentoIndexable[];
  /** Datos extra para la tabla meta (estadísticas de la indexación). */
  extra?: Record<string, string | number>;
}

export interface ResumenEscritura {
  documentos: number;
  documentosConTexto: number;
  /** Fragmentos de texto (sin contar fichas). */
  fragmentosTexto: number;
  fichas: number;
  paginas: number;
  bytes: number;
}

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** Nombre en inglés de cada categoría (las traducciones se buscan también así). */
const CATEGORIA_EN_INGLES: Readonly<Record<string, string>> = {
  Boletín: 'bulletin newsletter',
  Estudio: 'study',
  Infografía: 'infographic',
  'Nota temática': 'issues note thematic note',
  'Informe dinámico': 'dynamic report',
  'Informe de tendencias': 'trends report',
  'Educación superior en cifras': 'higher education in figures',
  'Otros productos': 'other products',
};

function plural(
  cantidad: number,
  singular: string,
  pluralTexto: string,
): string {
  return `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
}

/** Descripción del formato para la ficha. */
export function descripcionFormato(
  documento: DocumentoIndexable,
  conTexto: boolean,
): string {
  const paginas = documento.paginas.length;
  switch (documento.tipo) {
    case 'tablero':
      return 'Tablero interactivo de Power BI (solo enlace; sus datos no están en el índice de texto).';
    case 'entrada':
      return 'Entrada de blog (solo enlace).';
    case 'imagen':
      return conTexto
        ? 'Infografía en imagen; su texto se obtuvo con reconocimiento óptico de caracteres (OCR).'
        : 'Infografía en imagen, sin texto reconocible.';
    default:
      break;
  }
  if (!documento.tieneArchivo) {
    return 'Documento sin copia en el repositorio: solo enlace externo; su texto no está indexado.';
  }
  const nombre =
    documento.formato === 'pptx'
      ? `Presentación de PowerPoint de ${plural(paginas, 'diapositiva', 'diapositivas')}`
      : documento.formato === 'docx'
        ? 'Documento de Word'
        : `PDF de ${plural(paginas, 'página', 'páginas')}`;
  if (!conTexto) return `${nombre}, sin texto extraíble (solo metadatos).`;
  const ocr = documento.paginasOcr.length;
  return ocr > 0
    ? `${nombre}; texto completo indexado (${plural(ocr, 'página', 'páginas')} con OCR).`
    : `${nombre}; texto completo indexado.`;
}

/** Texto legible de la ficha (lo que recibe el modelo cuando encuentra la ficha). */
export function textoFicha(
  documento: DocumentoIndexable,
  conTexto: boolean,
): string {
  const lineas = [`Ficha del documento: ${documento.titulo}`];
  if (documento.subtitulo) lineas.push(`Subtítulo: ${documento.subtitulo}`);
  const fecha =
    documento.anio === null
      ? 'sin fecha (S. F.)'
      : documento.mes
        ? `${MESES[documento.mes - 1]} de ${documento.anio}`
        : String(documento.anio);
  lineas.push(
    [
      `Categoría: ${documento.categoria}${documento.numero ? ` N.º ${documento.numero}` : ''}`,
      `Fecha: ${fecha}`,
      `Idioma: ${documento.idioma === 'en' ? 'inglés' : 'español'}`,
    ].join(' · '),
  );
  lineas.push(`Formato: ${descripcionFormato(documento, conTexto)}`);
  if (documento.claves.length > 0)
    lineas.push(`Palabras clave: ${documento.claves.join(', ')}`);
  if (documento.nota) lineas.push(`Nota: ${documento.nota}`);
  if (documento.equivalente) {
    lineas.push(
      documento.idioma === 'en'
        ? `Traducción al inglés de: ${documento.equivalente}`
        : `Tiene traducción al inglés: ${documento.equivalente}`,
    );
  }
  return lineas.join('\n');
}

/** Columnas FTS "titulo" y "claves" (iguales para la ficha y los fragmentos). */
function columnasDeMetadatos(documento: DocumentoIndexable): {
  titulo: string;
  claves: string;
} {
  const titulo = normalizarParaIndice(
    [documento.titulo, documento.subtitulo ?? ''].join(' \n '),
  );
  const partes = [
    ...documento.claves,
    documento.categoria,
    documento.numero ?? '',
    documento.anio === null ? 'sin fecha' : String(documento.anio),
  ];
  if (documento.tipo === 'tablero')
    partes.push('tablero interactivo Power BI dashboard');
  if (documento.tipo === 'entrada') partes.push('entrada de blog');
  if (documento.idioma === 'en') {
    partes.push(
      'inglés english',
      CATEGORIA_EN_INGLES[documento.categoria] ?? '',
    );
  }
  return { titulo, claves: normalizarParaIndice(partes.join(' \n ')) };
}

function eliminarSiExiste(ruta: string): void {
  if (existsSync(ruta)) rmSync(ruta, { force: true });
}

export function escribirIndice(
  ruta: string,
  datos: DatosIndice,
): ResumenEscritura {
  mkdirSync(dirname(ruta), { recursive: true });
  const temporal = `${ruta}.tmp-${process.pid}-${Date.now()}`;
  eliminarSiExiste(temporal);
  const db = new DatabaseSync(temporal);
  const resumen: ResumenEscritura = {
    documentos: 0,
    documentosConTexto: 0,
    fragmentosTexto: 0,
    fichas: 0,
    paginas: 0,
    bytes: 0,
  };
  try {
    db.exec('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');
    db.exec(ESQUEMA_SQL);
    db.exec(`PRAGMA user_version = ${VERSION_ESQUEMA};`);
    db.exec('BEGIN');

    const insertarCategoria = db.prepare(
      'INSERT INTO categorias (nombre, orden) VALUES (?, ?)',
    );
    const categorias = [
      ...new Set([
        ...datos.categorias,
        ...datos.documentos.map((d) => d.categoria),
      ]),
    ];
    categorias.forEach((nombre, orden) =>
      insertarCategoria.run(nombre, orden + 1),
    );

    const insertarDocumento = db.prepare(`
      INSERT INTO documentos (id, orden, titulo, subtitulo, categoria, numero, anio, mes, idioma,
        tipo, claves, url_ver, tiene_archivo, portada, url_miniatura, nota, equivalente, equivalente_id,
        texto_indexado, paginas, paginas_ocr)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const insertarClave = db.prepare(
      'INSERT INTO claves (documento, posicion, clave, comparacion) VALUES (?, ?, ?, ?)',
    );
    const insertarPagina = db.prepare(
      'INSERT INTO paginas (documento, numero, texto, ocr) VALUES (?, ?, ?, ?)',
    );
    const insertarFragmento = db.prepare(`
      INSERT INTO fragmentos (documento, posicion, ficha, pagina_inicio, pagina_fin, texto)
      VALUES (?, ?, ?, ?, ?, ?)`);
    const insertarBusqueda = db.prepare(
      'INSERT INTO busqueda (rowid, titulo, claves, cuerpo) VALUES (?, ?, ?, ?)',
    );

    const documentos = datos.documentos.toSorted((a, b) => a.orden - b.orden);
    for (const documento of documentos) {
      const visibles = documento.paginas.reduce(
        (total, texto) => total + caracteresVisibles(texto),
        0,
      );
      const fragmentos =
        visibles >= MINIMO_CARACTERES_TEXTO
          ? fragmentarPaginas(
              documento.paginas.map((texto, indice) => ({
                numero: indice + 1,
                texto,
              })),
            )
          : [];
      const conTexto = fragmentos.length > 0;
      const paginasOcr = new Set(documento.paginasOcr);

      const rid = Number(
        insertarDocumento.run(
          documento.id,
          documento.orden,
          documento.titulo,
          documento.subtitulo,
          documento.categoria,
          documento.numero,
          documento.anio,
          documento.mes,
          documento.idioma,
          documento.tipo,
          JSON.stringify(documento.claves),
          documento.urlVer,
          documento.tieneArchivo ? 1 : 0,
          documento.portada,
          documento.urlMiniatura ?? null,
          documento.nota,
          documento.equivalente,
          documento.equivalenteId,
          conTexto ? 1 : 0,
          documento.paginas.length > 0 ? documento.paginas.length : null,
          conTexto ? paginasOcr.size : 0,
        ).lastInsertRowid,
      );
      resumen.documentos += 1;
      if (conTexto) resumen.documentosConTexto += 1;

      documento.claves.forEach((clave, posicion) =>
        insertarClave.run(rid, posicion, clave, claveComparacion(clave)),
      );
      if (conTexto) {
        documento.paginas.forEach((texto, indice) => {
          insertarPagina.run(
            rid,
            indice + 1,
            texto,
            paginasOcr.has(indice + 1) ? 1 : 0,
          );
          resumen.paginas += 1;
        });
      }

      const { titulo, claves } = columnasDeMetadatos(documento);
      const ficha = textoFicha(documento, conTexto);
      const cuerpoFicha = normalizarParaIndice(
        [
          documento.nota ?? '',
          documento.equivalente ?? '',
          descripcionFormato(documento, conTexto),
        ].join(' \n '),
      );
      const ridFicha = Number(
        insertarFragmento.run(rid, 0, 1, null, null, ficha).lastInsertRowid,
      );
      insertarBusqueda.run(ridFicha, titulo, claves, cuerpoFicha);
      resumen.fichas += 1;

      fragmentos.forEach((fragmento, indice) => {
        const ridFragmento = Number(
          insertarFragmento.run(
            rid,
            indice + 1,
            0,
            fragmento.paginaInicio,
            fragmento.paginaFin,
            fragmento.texto,
          ).lastInsertRowid,
        );
        insertarBusqueda.run(
          ridFragmento,
          titulo,
          claves,
          normalizarParaIndice(fragmento.texto),
        );
        resumen.fragmentosTexto += 1;
      });
    }

    const meta: Record<string, string | number> = {
      version_esquema: VERSION_ESQUEMA,
      generado: datos.generado,
      fuente: datos.fuente,
      version_fuente: datos.versionFuente ?? '',
      fuente_tipo: datos.origenFuente ?? '',
      huella_fuente: datos.huellaFuente ?? '',
      documentos: resumen.documentos,
      documentos_con_texto: resumen.documentosConTexto,
      fragmentos_texto: resumen.fragmentosTexto,
      fichas: resumen.fichas,
      paginas: resumen.paginas,
      ...datos.extra,
    };
    const insertarMeta = db.prepare(
      'INSERT INTO meta (clave, valor) VALUES (?, ?)',
    );
    for (const [clave, valor] of Object.entries(meta))
      insertarMeta.run(clave, String(valor));

    db.exec('COMMIT');
    db.exec("INSERT INTO busqueda (busqueda) VALUES ('optimize')");
    db.exec('VACUUM');
    db.close();
  } catch (error) {
    try {
      db.close();
    } catch {
      // ya estaba cerrada
    }
    eliminarSiExiste(temporal);
    throw error;
  }
  renameSync(temporal, ruta);
  resumen.bytes = statSync(ruta).size;
  return resumen;
}
