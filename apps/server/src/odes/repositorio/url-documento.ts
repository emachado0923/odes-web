/**
 * ÚNICO lugar donde se arman los enlaces a los documentos del repositorio.
 *
 * Por defecto el enlace es el `url_ver` que guardó el indexador:
 * - índice desde la base de la rama /repositorio (lo normal): la copia propia,
 *   /api/repositorio/documentos/<id>/ver (servida inline, así #page=N abre
 *   el PDF en la página citada), o la URL externa si el documento no tiene
 *   archivo (Power BI, blog, OneDrive);
 * - índice desde el paquete: la URL pública original (sapiencia.gov.co,
 *   Google Drive, Power BI, OneDrive).
 *
 * ODES_URL_DOCUMENTO reemplaza ese enlace para los documentos con archivo
 * propio (p. ej. `/api/repositorio/documentos/{id}/ver` con un índice del
 * paquete); se aplica al leer, sin reindexar.
 *
 * Marcadores de la plantilla:
 *   {id}      identificador del documento (codificado para URL)
 *   {url_ver} el url_ver del índice, tal cual
 *
 * La plantilla solo se aplica a los documentos que tienen archivo propio;
 * los tableros de Power BI, la entrada de blog y los estudios que solo están
 * en OneDrive siguen usando su URL externa.
 */

export interface DatosUrlDocumento {
  id: string;
  urlVer: string;
  /** true si la fuente tiene una copia del archivo (PDF, PNG, DOCX, PPTX). */
  tieneArchivo: boolean;
}

export type ConstructorUrlDocumento = (datos: DatosUrlDocumento) => string;

export class ErrorPlantillaUrl extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorPlantillaUrl';
  }
}

/** Valida una plantilla: ruta absoluta del sitio o URL http(s), con algún marcador. */
export function validarPlantillaUrl(plantilla: string): void {
  if (
    !/^(\/(?!\/)|https?:\/\/)/i.test(plantilla) &&
    !plantilla.startsWith('{url_ver}')
  ) {
    throw new ErrorPlantillaUrl(
      'ODES_URL_DOCUMENTO debe empezar por "/" (ruta del propio sitio), ' +
        `"http(s)://" o "{url_ver}" (recibido: ${JSON.stringify(plantilla)}).`,
    );
  }
  if (!/\{(id|url_ver)\}/.test(plantilla)) {
    throw new ErrorPlantillaUrl(
      'ODES_URL_DOCUMENTO debe incluir {id} o {url_ver} ' +
        `(recibido: ${JSON.stringify(plantilla)}).`,
    );
  }
  if (/[\s"<>\\]/.test(plantilla)) {
    throw new ErrorPlantillaUrl(
      'ODES_URL_DOCUMENTO no puede tener espacios, comillas, < > ni \\.',
    );
  }
}

/**
 * Crea el constructor de enlaces. Sin plantilla (o vacía) devuelve `url_ver`.
 * Lanza ErrorPlantillaUrl si la plantilla no es válida.
 */
export function crearConstructorUrl(
  plantilla?: string | null,
): ConstructorUrlDocumento {
  const valor = plantilla?.trim();
  if (!valor) return ({ urlVer }) => urlVer;
  validarPlantillaUrl(valor);
  return ({ id, urlVer, tieneArchivo }) =>
    tieneArchivo
      ? valor
          .replaceAll('{id}', encodeURIComponent(id))
          .replaceAll('{url_ver}', urlVer)
      : urlVer;
}

/**
 * Enlace que abre un PDF en una página: `${url}#page=N`. Los visores de PDF de
 * los navegadores lo respetan; Google Drive lo ignora sin romperse. No se toca
 * una URL que ya trae fragmento (#…).
 */
export function urlEnPagina(
  url: string,
  tipo: string,
  pagina: number | null,
): string {
  if (tipo !== 'pdf' || pagina === null || url.includes('#')) return url;
  return `${url}#page=${pagina}`;
}
