/**
 * Fragmentación por páginas: cada fragmento sabe exactamente qué páginas
 * cubre (paginaInicio / paginaFin), para citar y abrir el PDF en su página.
 *
 * - Páginas cortas consecutivas se juntan hasta llegar a ~1200 caracteres
 *   (sin pasar de 1800).
 * - Una página de más de 1800 caracteres se parte en trozos de ~1500, cortando
 *   en un salto de párrafo, un fin de frase o un espacio, con un solape de
 *   ~150 caracteres entre trozos para no perder frases partidas.
 * - Un resto corto (portada, página casi vacía) se pega al fragmento vecino:
 *   al anterior si es el final, o al primer trozo de la página larga que sigue.
 */

export interface PaginaTexto {
  /** Número de página, desde 1. */
  numero: number;
  texto: string;
}

export interface FragmentoTexto {
  paginaInicio: number;
  paginaFin: number;
  texto: string;
}

export const FRAGMENTO_MINIMO = 1200;
export const FRAGMENTO_MAXIMO = 1800;
const CORTE_OBJETIVO = 1500;
const SOLAPE = 150;
/** Un resto final más corto que esto se une al fragmento anterior. */
const RESTO_MINIMO = 300;
/**
 * Lo acumulado antes de una página larga se pega a su primer trozo solo si es
 * mínimo (un número de boletín, una fecha): una portada con una frase propia
 * rinde mejor como fragmento corto aparte.
 */
const PORTADA_MAXIMA = 200;
/** Tope al unir un resto corto con el fragmento anterior. */
const MAXIMO_AL_UNIR_RESTO = 2200;

function mejorCorte(texto: string, desde: number, hasta: number): number {
  const ventana = texto.slice(desde, hasta);
  const parrafo = ventana.lastIndexOf('\n');
  if (parrafo !== -1) return desde + parrafo + 1;
  let finDeFrase = -1;
  for (const coincidencia of ventana.matchAll(/[.!?;:](?=\s)/g)) {
    finDeFrase = coincidencia.index + 1;
  }
  if (finDeFrase !== -1) return desde + finDeFrase;
  const espacio = ventana.lastIndexOf(' ');
  if (espacio !== -1) return desde + espacio + 1;
  return hasta;
}

/** Parte un texto largo en trozos de ~1500 caracteres con solape. */
export function partirTexto(texto: string): string[] {
  const partes: string[] = [];
  let inicio = 0;
  while (texto.length - inicio > FRAGMENTO_MAXIMO) {
    const corte = mejorCorte(
      texto,
      inicio + Math.floor(CORTE_OBJETIVO * 0.6),
      inicio + FRAGMENTO_MAXIMO,
    );
    const parte = texto.slice(inicio, corte).trim();
    if (parte) partes.push(parte);
    // El siguiente trozo empieza ~150 caracteres antes del corte, en un
    // comienzo de palabra.
    let siguiente = Math.max(corte - SOLAPE, inicio + 1);
    const espacio = texto.slice(siguiente, corte).search(/\s/);
    if (espacio !== -1) siguiente += espacio + 1;
    inicio = siguiente;
  }
  const resto = texto.slice(inicio).trim();
  if (resto) partes.push(resto);
  return partes;
}

interface Acumulado {
  inicio: number;
  fin: number;
  partes: string[];
  largo: number;
}

export function fragmentarPaginas(
  paginas: readonly PaginaTexto[],
): FragmentoTexto[] {
  const fragmentos: FragmentoTexto[] = [];
  let acumulado: Acumulado | null = null;

  const vaciar = (): void => {
    if (!acumulado) return;
    fragmentos.push({
      paginaInicio: acumulado.inicio,
      paginaFin: acumulado.fin,
      texto: acumulado.partes.join('\n\n'),
    });
    acumulado = null;
  };

  for (const pagina of paginas) {
    const texto = pagina.texto.trim();
    if (!texto) continue;
    if (texto.length > FRAGMENTO_MAXIMO) {
      const partes = partirTexto(texto).map((parte) => ({
        paginaInicio: pagina.numero,
        paginaFin: pagina.numero,
        texto: parte,
      }));
      // Lo acumulado, si es corto (p. ej. una portada), se pega al primer
      // trozo de la página larga en vez de quedar como fragmento suelto.
      const previo = acumulado as Acumulado | null;
      if (
        previo &&
        previo.largo < PORTADA_MAXIMA &&
        previo.largo + 2 + partes[0]!.texto.length <= MAXIMO_AL_UNIR_RESTO
      ) {
        partes[0] = {
          paginaInicio: previo.inicio,
          paginaFin: pagina.numero,
          texto: [...previo.partes, partes[0]!.texto].join('\n\n'),
        };
        acumulado = null;
      }
      vaciar();
      fragmentos.push(...partes);
      continue;
    }
    if (acumulado && acumulado.largo + 2 + texto.length > FRAGMENTO_MAXIMO)
      vaciar();
    if (!acumulado) {
      acumulado = {
        inicio: pagina.numero,
        fin: pagina.numero,
        partes: [],
        largo: -2,
      };
    }
    acumulado.partes.push(texto);
    acumulado.largo += 2 + texto.length;
    acumulado.fin = pagina.numero;
    if (acumulado.largo >= FRAGMENTO_MINIMO) vaciar();
  }

  // Resto final corto: se une al fragmento anterior si no queda enorme.
  const resto = acumulado as Acumulado | null;
  const anterior = fragmentos.at(-1);
  if (
    resto &&
    anterior &&
    resto.largo < RESTO_MINIMO &&
    anterior.texto.length + 2 + resto.largo <= MAXIMO_AL_UNIR_RESTO
  ) {
    anterior.texto = [anterior.texto, ...resto.partes].join('\n\n');
    anterior.paginaFin = resto.fin;
    acumulado = null;
  }
  vaciar();
  return fragmentos;
}
