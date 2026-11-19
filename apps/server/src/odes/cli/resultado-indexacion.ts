/**
 * JSON que escribe `odes:indexar --resultado <archivo>` al terminar (bien o
 * mal). Lo lee la administración (src/odes/admin/servicio-indice.ts) para
 * mostrar un motivo claro sin interpretar la salida de texto.
 */

export type CodigoResultadoIndexacion =
  | 'uso'
  | 'cerrojo'
  | 'herramientas'
  | 'fuente'
  | 'fallos'
  | 'cancelada'
  | 'error';

export interface ResultadoIndexacionCli {
  ok: boolean;
  codigo?: CodigoResultadoIndexacion;
  /** Mensaje apto para mostrar (solo si ok es false). */
  error?: string;
  resumen?: {
    fuente: string;
    origen: string | null;
    documentos: number;
    documentosConTexto: number;
    conArchivo: number;
    paginas: number;
    paginasOcr: number;
    desdeCache: number;
    fallos: number;
    retirados: number;
    duracionMs: number;
  };
}
