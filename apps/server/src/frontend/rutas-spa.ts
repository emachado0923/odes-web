/**
 * Reglas puras (sin Express) que deciden qué rutas responde la SPA de React.
 * Cada sitio nuevo del front-end se agrega a SITIOS_SPA.
 */
export const SITIOS_SPA = [
  'sivu',
  'odes',
  'repositorio',
  'tableros',
  'pai',
  'pertinencia',
] as const;

const PATRON_RUTA_SPA = new RegExp(
  `^/(?:(?:${SITIOS_SPA.join('|')})(?:/.*)?)?$`,
  // Sin distinguir mayúsculas, igual que el enrutador de Express y React Router.
  'i',
);

/**
 * "/", "/sivu[/…]", "/odes[/…]", "/repositorio[/…]", "/tableros[/…]",
 * "/pai[/…]" y "/pertinencia[/…]" (pathname, sin query).
 */
export function esRutaDelFrontend(ruta: string): boolean {
  return PATRON_RUTA_SPA.test(ruta);
}

/**
 * ¿El último segmento de la ruta tiene extensión de archivo? Se decodifica
 * primero (`falta%2Eglb` cuenta como `falta.glb`); si la codificación es
 * inválida se trata como archivo, para que nunca reciba index.html.
 */
export function pareceArchivo(ruta: string): boolean {
  let segmento = ruta.slice(ruta.lastIndexOf('/') + 1);
  try {
    segmento = decodeURIComponent(segmento);
  } catch {
    return true;
  }
  // %2F o %5C decodificados pueden traer separadores: solo cuenta lo último.
  const nombre = segmento.slice(
    Math.max(segmento.lastIndexOf('/'), segmento.lastIndexOf('\\')) + 1,
  );
  return /\.[^.]+$/.test(nombre);
}

/**
 * La SPA responde index.html solo en rutas propias sin extensión: un archivo
 * que falta (p. ej. /sivu/falta.glb) debe ser 404, nunca HTML, porque
 * GLTFLoader intentaría interpretar el HTML como modelo.
 */
export function debeServirIndex(ruta: string): boolean {
  return esRutaDelFrontend(ruta) && !pareceArchivo(ruta);
}

/**
 * Páginas estáticas que pasaron a la SPA: [dirección vieja, ruta nueva]. La
 * batería de indicadores era un index.html que navegaba con el hash
 * (index.html#/sa-fondo-epm?v=comunas); el navegador conserva el hash al
 * seguir la redirección y la SPA lo traduce a la ruta de la vista
 * (apps/web/src/sites/tableros/bateria/rutas-bateria.ts).
 */
const REDIRECCIONES: ReadonlyArray<readonly [RegExp, string]> = [
  [
    /^\/tableros\/bateria-indicadores\/index\.html$/i,
    '/tableros/bateria-indicadores',
  ],
];

/** Ruta nueva de una dirección vieja (sin distinguir mayúsculas), o null. */
export function redireccionAntigua(ruta: string): string | null {
  return REDIRECCIONES.find(([patron]) => patron.test(ruta))?.[1] ?? null;
}
