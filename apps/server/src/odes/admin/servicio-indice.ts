import { type ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { setPriority } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
} from '@nestjs/common';
import { RAIZ_SERVIDOR } from '../../config/configuracion.js';
import { conflicto } from '../../repositorio/errores-repositorio.js';
import { ServicioLecturaRepositorio } from '../../repositorio/servicios/lectura-repositorio.js';
import type { ResultadoIndexacionCli } from '../cli/resultado-indexacion.js';
import type {
  EstadoIndiceAdmin,
  EstadoReindexacion,
} from '../chat/protocolo.js';
import { cerrojoOcupado } from '../repositorio/indexacion/cerrojo.js';
import {
  huellaDocumentos,
  type LectorRepositorio,
} from '../repositorio/indexacion/fuente-mysql.js';
import { leerMetaIndice } from '../repositorio/meta-indice.js';
import { RepositorioOdes } from '../repositorio/repositorio.tipos.js';
import {
  OPCIONES_REINDEXACION,
  type OpcionesReindexacion,
} from './configuracion-reindexacion.js';

/**
 * Estado del índice del Asistente ODES y reindexación pedida desde la
 * administración del repositorio.
 *
 * - La reindexación corre en un PROCESO HIJO (el indexador compilado, con la
 *   base del repositorio como fuente), con prioridad baja: el servidor sigue
 *   atendiendo y un fallo del indexador no lo afecta.
 * - Solo una a la vez: en este proceso (el trabajo en curso) y entre
 *   procesos (el cerrojo <índice>.lock, que también respeta
 *   `npm run odes:indexar`). Una segunda petición responde 409.
 * - Al terminar bien, el índice nuevo ya está en su lugar (rename atómico) y
 *   se pide al repositorio que lo cargue de inmediato.
 * - Si falla (faltan herramientas, base caída, demasiados archivos sin
 *   texto, tiempo agotado), el índice anterior queda intacto y el motivo
 *   queda en el estado, apto para mostrar.
 *
 * El estado de la última reindexación vive en memoria (se pierde al
 * reiniciar el servidor; el índice y su fecha no).
 */

/** Líneas del registro del indexador que se conservan (progreso). */
const MAX_LINEAS = 40;
/** Espera entre SIGTERM y SIGKILL al detener el indexador. */
const GRACIA_MS = 10_000;

interface Trabajo {
  estado: EstadoReindexacion;
  inicio: Date;
  fin: Date | null;
  usuario: string;
  error: string | null;
  registro: string[];
  terminado: Promise<void>;
}

/** Lo que el servicio usa del repositorio del índice (comprobarAhora es de RepositorioSqlite). */
type RepositorioRecargable = RepositorioOdes & { comprobarAhora?: () => void };

// oxlint-disable-next-line no-control-regex -- se quitan los códigos de color de la terminal
const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;

@Injectable()
export class ServicioIndiceOdes implements OnModuleDestroy {
  private readonly registro = new Logger('OdesIndice');
  private trabajo: Trabajo | null = null;
  private hijo: ChildProcess | null = null;
  private huellaMemo: { version: number; huella: string } | null = null;

  constructor(
    @Inject(OPCIONES_REINDEXACION)
    private readonly opciones: OpcionesReindexacion,
    @Inject(RepositorioOdes)
    private readonly repositorio: RepositorioRecargable,
    @Inject(ServicioLecturaRepositorio)
    private readonly lectura: Pick<LectorRepositorio, 'listarPublicados'>,
  ) {}

  async onModuleDestroy(): Promise<void> {
    const hijo = this.hijo;
    if (!hijo || hijo.exitCode !== null) return;
    hijo.kill('SIGTERM');
    const salida = this.trabajo?.terminado ?? Promise.resolve();
    const temporizador = setTimeout(() => hijo.kill('SIGKILL'), GRACIA_MS);
    await salida;
    clearTimeout(temporizador);
  }

  /** Promesa del trabajo en curso (para pruebas y el cierre ordenado). */
  esperar(): Promise<void> {
    return this.trabajo?.terminado ?? Promise.resolve();
  }

  // ── Estado ────────────────────────────────────────────────────────────

  async estado(): Promise<EstadoIndiceAdmin> {
    const meta = leerMetaIndice(this.opciones.rutaIndice);
    const repositorio: EstadoIndiceAdmin['repositorio'] = {
      publicados: null,
      actualizado: null,
      cambiado: null,
      motivo: null,
    };
    try {
      const listado = await this.lectura.listarPublicados();
      repositorio.publicados = listado.documentos.length;
      repositorio.actualizado = listado.actualizado;
      if (this.huellaMemo?.version !== listado.version) {
        this.huellaMemo = {
          version: listado.version,
          huella: huellaDocumentos(listado.documentos),
        };
      }
      if (!meta.disponible) {
        repositorio.cambiado = true;
        repositorio.motivo = 'No hay un índice utilizable: genérelo con "Reindexar".';
      } else if (meta.origen !== 'mysql' || !meta.huella) {
        repositorio.cambiado = true;
        repositorio.motivo =
          'El índice se generó desde el paquete de datos, no desde la base: reindexe para usar lo publicado.';
      } else if (meta.huella !== this.huellaMemo.huella) {
        repositorio.cambiado = true;
        repositorio.motivo =
          'Se publicaron, editaron o retiraron documentos después de generar el índice.';
      } else {
        repositorio.cambiado = false;
      }
    } catch {
      repositorio.motivo = 'No se pudo consultar la base del repositorio.';
    }

    return {
      indice: {
        disponible: meta.disponible,
        generado: meta.generado,
        origen: meta.origen,
        documentos: meta.documentos,
        documentosConTexto: meta.documentosConTexto,
        paginas: meta.paginas,
        paginasOcr: meta.paginasOcr,
        bytes: meta.bytes,
        error: meta.error,
      },
      repositorio,
      reindexacion: this.estadoReindexacion(),
    };
  }

  private estadoReindexacion(): EstadoIndiceAdmin['reindexacion'] {
    const trabajo = this.trabajo;
    if (trabajo?.estado !== 'en_curso') {
      // ¿La está haciendo otro proceso (otra instancia o la terminal)?
      const otro = cerrojoOcupado(this.opciones.rutaIndice);
      if (otro) {
        return {
          estado: 'en_curso',
          inicio: otro.inicio,
          fin: null,
          usuario: null,
          error: null,
          registro: [`Indexación en curso en otro proceso (${otro.descripcion || `PID ${otro.pid}`}).`],
        };
      }
    }
    if (!trabajo) {
      return {
        estado: 'inactiva',
        inicio: null,
        fin: null,
        usuario: null,
        error: null,
        registro: [],
      };
    }
    return {
      estado: trabajo.estado,
      inicio: trabajo.inicio.toISOString(),
      fin: trabajo.fin?.toISOString() ?? null,
      usuario: trabajo.usuario,
      error: trabajo.error,
      registro: [...trabajo.registro],
    };
  }

  // ── Reindexación ──────────────────────────────────────────────────────

  /**
   * Inicia la reindexación (devuelve enseguida). Lanza 409 si ya hay una en
   * curso o si el indexador no está compilado.
   */
  async reindexar(usuario: string): Promise<EstadoIndiceAdmin> {
    this.iniciar(usuario);
    return this.estado();
  }

  /** Parte síncrona: comprobar y lanzar sin ceder el turno (dos peticiones a la vez: una gana). */
  private iniciar(usuario: string): void {
    if (this.opciones.desactivada) throw conflicto(this.opciones.desactivada);
    const actual = this.trabajo;
    if (actual?.estado === 'en_curso') {
      throw conflicto(
        `Ya hay una reindexación en curso (la inició ${actual.usuario} el ${actual.inicio.toISOString()}). Espere a que termine.`,
      );
    }
    const otro = cerrojoOcupado(this.opciones.rutaIndice);
    if (otro) {
      throw conflicto(
        `Ya hay una indexación en curso en otro proceso (desde ${otro.inicio}). Espere a que termine.`,
      );
    }
    const { comando } = this.opciones;
    if (comando.requiere && !existsSync(comando.requiere)) {
      throw conflicto(
        'El indexador no está compilado en este servidor (falta dist/odes/cli/indexar.js). ' +
          'Ejecute npm run build y reinicie el servicio.',
      );
    }

    const rutaResultado = join(
      this.opciones.directorioTemporal,
      `odes-reindexar-${process.pid}-${randomBytes(6).toString('hex')}.json`,
    );
    const argumentos = [
      ...comando.argumentos,
      '--fuente',
      'mysql',
      '--indice',
      this.opciones.rutaIndice,
      '--concurrencia',
      String(this.opciones.concurrencia),
      '--resultado',
      rutaResultado,
    ];

    let terminar!: () => void;
    const trabajo: Trabajo = {
      estado: 'en_curso',
      inicio: new Date(),
      fin: null,
      usuario,
      error: null,
      registro: [],
      terminado: new Promise<void>((resolver) => {
        terminar = resolver;
      }),
    };
    this.trabajo = trabajo;
    this.registro.log(`Reindexación del Asistente ODES iniciada por ${usuario}.`);

    let ultimoError: string | null = null;
    let tiempoAgotado = false;
    const agregar = (linea: string, deError: boolean): void => {
      const limpia = linea.replace(ANSI, '').trimEnd();
      if (!limpia.trim()) return;
      trabajo.registro.push(limpia.slice(0, 500));
      if (trabajo.registro.length > MAX_LINEAS) trabajo.registro.shift();
      if (deError && limpia.startsWith('Error: ')) {
        ultimoError = limpia.slice('Error: '.length);
      }
    };

    const finalizar = (estado: EstadoReindexacion, error: string | null): void => {
      if (trabajo.estado !== 'en_curso') return;
      clearTimeout(temporizador);
      trabajo.estado = estado;
      trabajo.error = error;
      trabajo.fin = new Date();
      if (this.hijo === hijo) this.hijo = null;
      rmSync(rutaResultado, { force: true });
      const segundos = ((trabajo.fin.getTime() - trabajo.inicio.getTime()) / 1000).toFixed(1);
      if (estado === 'completada') {
        this.registro.log(`Reindexación del Asistente ODES completada en ${segundos} s.`);
        try {
          this.repositorio.comprobarAhora?.();
        } catch {
          // Si no se pudo cargar ya, lo hará en la siguiente consulta.
        }
      } else {
        this.registro.warn(`Reindexación del Asistente ODES fallida (${segundos} s): ${error}`);
      }
      terminar();
    };

    const hijo = spawn(comando.ejecutable, argumentos, {
      cwd: RAIZ_SERVIDOR,
      env: { ...process.env, ODES_FUENTE: 'mysql' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.hijo = hijo;
    if (hijo.pid !== undefined) {
      try {
        // Prioridad baja: el sitio sigue respondiendo mientras se indexa.
        setPriority(hijo.pid, 10);
      } catch {
        // Sin permiso o sistema sin prioridades: no importa.
      }
    }
    createInterface({ input: hijo.stdout! }).on('line', (linea) => agregar(linea, false));
    createInterface({ input: hijo.stderr! }).on('line', (linea) => agregar(linea, true));

    const temporizador = setTimeout(() => {
      tiempoAgotado = true;
      hijo.kill('SIGTERM');
      setTimeout(() => {
        if (hijo.exitCode === null) hijo.kill('SIGKILL');
      }, GRACIA_MS).unref();
    }, this.opciones.timeoutMs);
    temporizador.unref();

    hijo.on('error', (error) => {
      finalizar('fallida', `No se pudo iniciar el indexador: ${error.message}`);
    });
    hijo.on('close', (codigo, senal) => {
      const resultado = leerResultado(rutaResultado);
      if (codigo === 0 && resultado?.ok !== false) {
        finalizar('completada', null);
        return;
      }
      let error: string;
      if (tiempoAgotado) {
        error =
          `Se agotó el tiempo máximo de la reindexación (${duracion(this.opciones.timeoutMs)}); ` +
          'el índice anterior no se modificó.';
      } else if (resultado?.error) {
        error = resultado.error;
      } else if (ultimoError) {
        error = ultimoError;
      } else if (senal) {
        error = `El indexador se detuvo (${senal}); el índice anterior no se modificó.`;
      } else {
        error = `El indexador terminó con el código ${codigo}; el índice anterior no se modificó.`;
      }
      finalizar('fallida', error);
    });
  }
}

function duracion(ms: number): string {
  return ms >= 60_000 ? `${Math.round(ms / 60_000)} min` : `${Math.round(ms / 1000)} s`;
}

function leerResultado(ruta: string): ResultadoIndexacionCli | null {
  try {
    const datos = JSON.parse(readFileSync(ruta, 'utf8')) as ResultadoIndexacionCli;
    return typeof datos === 'object' && datos !== null ? datos : null;
  } catch {
    return null;
  }
}
