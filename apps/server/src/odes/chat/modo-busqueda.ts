import type { FragmentoRepositorio, RepositorioOdes } from '../repositorio/repositorio.tipos.js';
import { documentoEncontrado } from './catalogo.js';
import { type Emisor, type ResumenRespuesta, usoVacio } from './motor-ia.js';
import type { MensajeChat } from './protocolo.js';

/** Documentos distintos que se muestran en modo búsqueda. */
export const DOCUMENTOS_MODO_BUSQUEDA = 6;

export const AVISO_MODO_BUSQUEDA =
  'El asistente con inteligencia artificial todavía no está activado, así que por ahora no puedo ' +
  'redactar una respuesta. Estos son los documentos del repositorio que mejor coinciden con tu pregunta:';

export const AVISO_SIN_RESULTADOS =
  'El asistente con inteligencia artificial todavía no está activado y no encontré documentos del ' +
  'repositorio que coincidan con tu pregunta. Prueba con otras palabras, por ejemplo un tema ' +
  '("deserción", "matrícula"), una categoría ("boletín") o un año.';

/**
 * Modo "busqueda" (sin clave de API): busca la última pregunta en el índice
 * y devuelve los mejores documentos distintos, con un extracto. Así la
 * interfaz se puede usar y probar completa antes de activar la IA.
 *
 * Eventos: texto (aviso) -> documentos (si hay) -> fin. El evento 'inicio' lo
 * emite el servicio.
 */
export function responderModoBusqueda(
  historial: readonly MensajeChat[],
  repositorio: RepositorioOdes,
  emitir: Emisor,
): ResumenRespuesta {
  const pregunta = historial.at(-1)?.texto.slice(0, 500) ?? '';
  const fragmentos = repositorio.buscar(pregunta, undefined, 20);
  const mejores: FragmentoRepositorio[] = [];
  const vistos = new Set<string>();
  for (const fragmento of fragmentos) {
    if (vistos.has(fragmento.documento.id)) continue;
    vistos.add(fragmento.documento.id);
    mejores.push(fragmento);
    if (mejores.length >= DOCUMENTOS_MODO_BUSQUEDA) break;
  }
  if (mejores.length === 0) {
    emitir({ tipo: 'texto', delta: AVISO_SIN_RESULTADOS });
  } else {
    emitir({ tipo: 'texto', delta: AVISO_MODO_BUSQUEDA });
    emitir({
      tipo: 'documentos',
      titulo: 'Documentos relacionados',
      documentos: mejores.map(documentoEncontrado),
    });
  }
  emitir({ tipo: 'fin', motivo: 'completo' });
  return {
    resultado: 'completo',
    llamadas: 0,
    herramientas: 1,
    modeloServido: null,
    respaldo: false,
    uso: usoVacio(),
    usoPrimeraLlamada: null,
  };
}
