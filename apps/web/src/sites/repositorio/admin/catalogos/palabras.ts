/** Lista de palabras clave de la administración (TypeScript puro). */
import type { PalabraClaveAdmin } from '../../api-repositorio'
import { normalizar } from '../../busqueda/texto'

export type Orden = 'texto' | 'documentos'

/** Lista visible: búsqueda (sin tildes), solo sin uso y orden. */
export function filtrarPalabras(
  palabras: readonly PalabraClaveAdmin[],
  q: string,
  soloSinUso: boolean,
  orden: Orden,
): PalabraClaveAdmin[] {
  const buscado = normalizar(q)
  return palabras
    .filter((p) => (!buscado || normalizar(p.texto).includes(buscado)) && (!soloSinUso || p.documentos === 0))
    .sort((a, b) =>
      orden === 'documentos'
        ? b.documentos - a.documentos || a.texto.localeCompare(b.texto, 'es')
        : a.texto.localeCompare(b.texto, 'es', { sensitivity: 'base' }),
    )
}
