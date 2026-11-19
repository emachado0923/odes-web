import { Inject, Injectable, Logger } from '@nestjs/common';
import { CONFIGURACION_ODES, type ConfiguracionOdes } from '../configuracion-odes.js';
import { RepositorioOdes } from '../repositorio/repositorio.tipos.js';
import { CLIENTE_ANTHROPIC, type ClienteAnthropic } from './cliente-anthropic.js';
import { errorChat, MENSAJE_TIEMPO_AGOTADO } from './errores-chat.js';
import { responderModoBusqueda } from './modo-busqueda.js';
import { type Emisor, MotorIa, type ResumenRespuesta, usoVacio } from './motor-ia.js';
import { FuenteContextoModelo } from './prompt-sistema.js';
import {
  type EstadoAsistente,
  type MensajeChat,
  type ModoAsistente,
  NOMBRE_ASISTENTE,
} from './protocolo.js';
import { lineaRegistro } from './registro-uso.js';

/** Motivo con el que se aborta la petición al vencer el tiempo máximo. */
const MOTIVO_TIEMPO = 'tiempo_agotado';

function resumenError(detalle: string): ResumenRespuesta {
  return {
    resultado: 'error',
    detalle,
    llamadas: 0,
    herramientas: 0,
    modeloServido: null,
    respaldo: false,
    uso: usoVacio(),
    usoPrimeraLlamada: null,
  };
}

/**
 * Orquesta una pregunta: elige el modo (ia si hay clave de API, busqueda si
 * no), emite 'inicio', aplica el tiempo máximo y registra una línea de uso.
 * No sabe nada de HTTP: lo usan el controlador (SSE) y la CLI odes:probar.
 */
@Injectable()
export class ServicioChat {
  readonly #registro = new Logger('AsistenteOdes');
  readonly #motor: MotorIa | null;

  constructor(
    @Inject(CONFIGURACION_ODES) private readonly config: ConfiguracionOdes,
    @Inject(CLIENTE_ANTHROPIC) cliente: ClienteAnthropic | null,
    @Inject(RepositorioOdes) private readonly repositorio: RepositorioOdes,
  ) {
    this.#motor = cliente
      ? new MotorIa({
          cliente,
          config,
          repositorio,
          contexto: new FuenteContextoModelo(repositorio),
          registrarError: (mensaje) => this.#registro.error(mensaje),
        })
      : null;
  }

  get modo(): ModoAsistente {
    return this.#motor ? 'ia' : 'busqueda';
  }

  estado(): EstadoAsistente {
    const estado = this.repositorio.estado();
    return {
      asistente: NOMBRE_ASISTENTE,
      modo: this.modo,
      repositorio: {
        disponible: estado.disponible,
        documentos: estado.documentos,
        documentosConTexto: estado.documentosConTexto,
        generado: estado.generado,
      },
    };
  }

  repositorioDisponible(): boolean {
    return this.repositorio.estado().disponible;
  }

  /**
   * Responde una pregunta ya validada. `senal` se aborta si el cliente se
   * desconecta; entonces no se emite nada más.
   */
  async responder(
    mensajes: readonly MensajeChat[],
    emitir: Emisor,
    senal: AbortSignal,
    usuario: string,
  ): Promise<ResumenRespuesta> {
    const inicio = performance.now();
    const modo = this.modo;
    emitir({ tipo: 'inicio', modo });
    let resumen: ResumenRespuesta;
    if (!this.#motor) {
      try {
        resumen = responderModoBusqueda(mensajes, this.repositorio, emitir);
      } catch (error) {
        this.#registro.error(
          `Error del repositorio en modo búsqueda: ${error instanceof Error ? error.message : String(error)}`,
        );
        emitir({ tipo: 'error', ...errorChat('interno') });
        resumen = resumenError('repositorio');
      }
    } else {
      const control = new AbortController();
      const alAbortar = (): void => control.abort(senal.reason);
      if (senal.aborted) alAbortar();
      senal.addEventListener('abort', alAbortar, { once: true });
      const temporizador = setTimeout(() => control.abort(MOTIVO_TIEMPO), this.config.timeoutMs);
      try {
        resumen = await this.#motor.responder(mensajes, emitir, control.signal, usuario);
      } catch (error) {
        // El motor no debería lanzar; si pasa, se informa sin detalles.
        this.#registro.error(
          `Error inesperado en el chat: ${error instanceof Error ? error.message : String(error)}`,
        );
        emitir({ tipo: 'error', ...errorChat('interno') });
        resumen = resumenError('inesperado');
      } finally {
        clearTimeout(temporizador);
        senal.removeEventListener('abort', alAbortar);
      }
      if (resumen.resultado === 'cancelado' && control.signal.reason === MOTIVO_TIEMPO && !senal.aborted) {
        emitir({ tipo: 'error', ...errorChat('sobrecarga', MENSAJE_TIEMPO_AGOTADO) });
        resumen.resultado = 'tiempo_agotado';
      }
    }
    this.#registro.log(
      lineaRegistro(modo, modo === 'ia' ? this.config.modelo : null, resumen, performance.now() - inicio, usuario),
    );
    return resumen;
  }
}
