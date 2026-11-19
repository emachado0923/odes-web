import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { cargarConfiguracion } from '../src/config/configuracion.js';
import { configurarAplicacion } from '../src/configurar-aplicacion.js';
import { INTERVALO_PING_SSE } from '../src/odes/chat/chat.controller.js';
import { CLIENTE_ANTHROPIC } from '../src/odes/chat/cliente-anthropic.js';
import type { EventoChat } from '../src/odes/chat/protocolo.js';
import { CONFIGURACION_ODES, type ConfiguracionOdes } from '../src/odes/configuracion-odes.js';
import { crearFetchSimulado, type FetchSimulado, type Guion } from '../src/odes/cli/simulador-claude.js';
import {
  type CriteriosListado,
  type DocumentoRepositorio,
  type EstadoRepositorio,
  type FiltrosRepositorio,
  type FragmentoRepositorio,
  RepositorioOdes,
} from '../src/odes/repositorio/repositorio.tipos.js';

/**
 * Apoyo de las pruebas del Asistente ODES: un repositorio en memoria, una
 * configuración de prueba, un cliente del SDK real con fetch simulado y un
 * lector de eventos SSE.
 */

export function configuracionPrueba(cambios: Partial<ConfiguracionOdes> = {}): ConfiguracionOdes {
  return {
    claveApi: 'clave-de-prueba',
    urlBaseApi: null,
    modelo: 'claude-opus-5-5',
    esfuerzo: 'medium',
    maxTokens: 16000,
    maxRondasHerramientas: 5,
    fallbacks: true,
    herramientasEstrictas: true,
    limitePorMinuto: 100,
    limitePorDia: 1000,
    limiteGlobalDia: 10000,
    timeoutMs: 30_000,
    ...cambios,
  };
}

interface PaginaPrueba {
  readonly documento: string;
  readonly pagina: number;
  readonly texto: string;
}

const DOCUMENTOS: DocumentoRepositorio[] = [
  {
    id: 'boletin-29-resultados-preliminares-2024',
    titulo: 'Resultados preliminares estudios de educación postsecundaria 2024',
    subtitulo: 'Seguimiento a bachilleres y expectativas',
    categoria: 'Boletín',
    numero: '29',
    anio: '2024',
    claves: ['Seguimiento a bachilleres', 'Tasa de continuidad', 'Expectativas'],
    idioma: 'es',
    tipo: 'pdf',
    url: 'https://ejemplo.test/boletin-29.pdf',
    portada: 'boletin-29.jpg',
    textoIndexado: true,
    paginas: 3,
  },
  {
    id: 'estudio-desercion-2023',
    titulo: 'Estudio de deserción en educación superior',
    categoria: 'Estudio',
    anio: '2023',
    claves: ['Deserción', 'Permanencia'],
    idioma: 'es',
    tipo: 'pdf',
    url: 'https://ejemplo.test/desercion-2023.pdf',
    textoIndexado: true,
    paginas: 2,
  },
  {
    id: 'informe-dinamico-matricula',
    titulo: 'Matrícula en educación superior',
    categoria: 'Informe dinámico',
    anio: '2022',
    claves: ['Matrícula'],
    idioma: 'es',
    tipo: 'tablero',
    url: 'https://app.powerbi.test/matricula',
    textoIndexado: false,
  },
  {
    id: 'boletin-12-en',
    titulo: 'Higher education dropout in Medellín',
    categoria: 'Boletín',
    numero: '12',
    anio: '2021',
    claves: ['Dropout'],
    idioma: 'en',
    tipo: 'pdf',
    url: 'https://ejemplo.test/boletin-12-en.pdf',
    textoIndexado: true,
    paginas: 1,
  },
];

const PAGINAS: PaginaPrueba[] = [
  {
    documento: 'boletin-29-resultados-preliminares-2024',
    pagina: 1,
    texto:
      'Boletín 29. Resultados preliminares de los estudios de seguimiento a bachilleres y expectativas de educación postsecundaria 2024.\n\n' +
      'La tasa de tránsito inmediato a la educación superior de los bachilleres de Medellín fue del 41 % en 2024, ' +
      'tres puntos más que en 2023. La continuidad fue mayor en las comunas del sur.',
  },
  {
    documento: 'boletin-29-resultados-preliminares-2024',
    pagina: 2,
    texto:
      'Expectativas. El 78 % de los estudiantes de grado 11 espera continuar estudios técnicos, tecnológicos o universitarios.\n\n' +
      'Las principales barreras declaradas son económicas: el costo de la matrícula y del transporte.',
  },
  {
    documento: 'boletin-29-resultados-preliminares-2024',
    pagina: 3,
    texto: 'Metodología. Encuesta a 12.000 bachilleres de instituciones oficiales y privadas.',
  },
  {
    documento: 'estudio-desercion-2023',
    pagina: 1,
    texto:
      'La deserción anual en educación superior en Medellín fue del 9,8 % en 2023. ' +
      'La deserción es más alta en los programas técnicos profesionales.',
  },
  {
    documento: 'estudio-desercion-2023',
    pagina: 2,
    texto: 'Factores asociados a la deserción: situación económica, orientación vocacional y rendimiento académico.',
  },
  {
    documento: 'boletin-12-en',
    pagina: 1,
    texto: 'Higher education dropout in Medellín reached 10 % in 2021.',
  },
];

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
}

function anioNumero(doc: DocumentoRepositorio): number | null {
  return /^\d{4}$/.test(doc.anio) ? Number(doc.anio) : null;
}

/** Repositorio en memoria con el mismo contrato que el índice SQLite. */
export class RepositorioEnMemoria extends RepositorioOdes {
  disponible = true;
  llamadasBuscar: Array<{ consulta: string; filtros?: FiltrosRepositorio; limite?: number }> = [];

  constructor(
    private readonly documentos: DocumentoRepositorio[] = DOCUMENTOS,
    private readonly paginas: PaginaPrueba[] = PAGINAS,
  ) {
    super();
  }

  estado(): EstadoRepositorio {
    return {
      disponible: this.disponible,
      documentos: this.disponible ? this.documentos.length : 0,
      documentosConTexto: this.disponible ? this.documentos.filter((d) => d.textoIndexado).length : 0,
      fragmentos: this.disponible ? this.paginas.length : 0,
      generado: this.disponible ? '2026-10-08T00:00:00.000Z' : null,
    };
  }

  categorias(): string[] {
    return ['Boletín', 'Estudio', 'Infografía', 'Nota temática', 'Informe dinámico'];
  }

  #pasaFiltros(doc: DocumentoRepositorio, filtros: FiltrosRepositorio = {}): boolean {
    if (filtros.categorias?.length && !filtros.categorias.includes(doc.categoria)) return false;
    if (filtros.idioma && doc.idioma !== filtros.idioma) return false;
    const anio = anioNumero(doc);
    if (filtros.anioDesde !== undefined && (anio === null || anio < filtros.anioDesde)) return false;
    if (filtros.anioHasta !== undefined && (anio === null || anio > filtros.anioHasta)) return false;
    return true;
  }

  #fragmento(pagina: PaginaPrueba, doc: DocumentoRepositorio, puntaje: number): FragmentoRepositorio {
    return {
      documento: doc,
      paginaInicio: pagina.pagina,
      paginaFin: pagina.pagina,
      texto: pagina.texto,
      url: `${doc.url}#page=${pagina.pagina}`,
      puntaje,
    };
  }

  buscar(consulta: string, filtros?: FiltrosRepositorio, limite = 8): FragmentoRepositorio[] {
    this.llamadasBuscar.push({ consulta, filtros, limite });
    if (!this.disponible) return [];
    const palabras = normalizar(consulta)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((palabra) => palabra.length > 3);
    const resultados: FragmentoRepositorio[] = [];
    for (const pagina of this.paginas) {
      const doc = this.documentos.find((d) => d.id === pagina.documento);
      if (!doc || !this.#pasaFiltros(doc, filtros)) continue;
      const texto = normalizar(`${doc.titulo} ${pagina.texto}`);
      const puntaje = palabras.filter((palabra) => texto.includes(palabra.slice(0, 6))).length;
      if (puntaje > 0) resultados.push(this.#fragmento(pagina, doc, puntaje));
    }
    for (const doc of this.documentos) {
      if (doc.textoIndexado || !this.#pasaFiltros(doc, filtros)) continue;
      const texto = normalizar(`${doc.titulo} ${doc.claves.join(' ')}`);
      const puntaje = palabras.filter((palabra) => texto.includes(palabra.slice(0, 6))).length;
      if (puntaje > 0) {
        resultados.push({ documento: doc, paginaInicio: null, paginaFin: null, texto: `${doc.titulo}. ${doc.claves.join(', ')}`, url: doc.url, puntaje });
      }
    }
    return resultados.toSorted((a, b) => b.puntaje - a.puntaje).slice(0, Math.min(limite, 20));
  }

  listar(criterios: CriteriosListado, limite = 20): { total: number; documentos: DocumentoRepositorio[] } {
    if (!this.disponible) return { total: 0, documentos: [] };
    const texto = criterios.texto ? normalizar(criterios.texto) : null;
    const clave = criterios.palabraClave ? normalizar(criterios.palabraClave) : null;
    const coinciden = this.documentos.filter((doc) => {
      if (!this.#pasaFiltros(doc, criterios)) return false;
      if (texto && !normalizar(`${doc.titulo} ${doc.subtitulo ?? ''} ${doc.claves.join(' ')}`).includes(texto)) return false;
      if (clave && !doc.claves.some((c) => normalizar(c) === clave)) return false;
      return true;
    });
    return { total: coinciden.length, documentos: coinciden.slice(0, limite) };
  }

  leer(id: string, paginaDesde?: number, paginaHasta?: number): FragmentoRepositorio[] | null {
    const doc = this.obtener(id);
    if (!doc) return null;
    if (!doc.textoIndexado) return [];
    const desde = paginaDesde ?? 1;
    const hasta = paginaHasta ?? desde + 4;
    return this.paginas
      .filter((p) => p.documento === id && p.pagina >= desde && p.pagina <= hasta)
      .map((p) => this.#fragmento(p, doc, 1));
  }

  obtener(id: string): DocumentoRepositorio | null {
    return this.disponible ? (this.documentos.find((doc) => doc.id === id) ?? null) : null;
  }
}

/** Cliente real del SDK con un fetch simulado (sin red, sin reintentos). */
export function clienteSimulado(guion?: Guion, pausaMs = 0): { cliente: Anthropic; simulado: FetchSimulado } {
  const simulado = crearFetchSimulado(guion, pausaMs);
  const cliente = new Anthropic({ apiKey: 'clave-de-prueba', authToken: null, fetch: simulado.fetch, maxRetries: 0 });
  return { cliente, simulado };
}

/** Extrae los eventos `data:` de un cuerpo SSE completo (ignora los comentarios `: ping`). */
export function leerEventosSse(cuerpo: string): EventoChat[] {
  return cuerpo
    .split('\n\n')
    .map((mensaje) => mensaje.trim())
    .filter((mensaje) => mensaje.startsWith('data: '))
    .map((mensaje) => JSON.parse(mensaje.slice('data: '.length)) as EventoChat);
}

/** Texto de la respuesta con las marcas de cita, como lo arma la interfaz. */
export function textoConCitas(eventos: readonly EventoChat[]): string {
  let texto = '';
  for (const evento of eventos) {
    if (evento.tipo === 'texto') texto += evento.delta;
    if (evento.tipo === 'cita') texto += `⟦${evento.indice}⟧`;
  }
  return texto;
}

export interface AppOdes {
  readonly app: NestExpressApplication;
  cerrar(): Promise<void>;
}

/**
 * App completa (AppModule + configurarAplicacion: helmet, compresión,
 * front-end) con el repositorio, la configuración y el cliente de Claude
 * reemplazados.
 */
export async function crearAppOdes(opciones: {
  config: ConfiguracionOdes;
  /** undefined = el cliente real que crea el módulo a partir de `config`. */
  cliente?: Anthropic | null;
  repositorio: RepositorioOdes;
  intervaloPingMs?: number;
  trustProxy?: string;
}): Promise<AppOdes> {
  const directorio = await mkdtemp(join(tmpdir(), 'sapiencia-odes-'));
  let armado = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(CONFIGURACION_ODES)
    .useValue(opciones.config);
  if (opciones.cliente !== undefined) {
    armado = armado.overrideProvider(CLIENTE_ANTHROPIC).useValue(opciones.cliente);
  }
  const modulo = await armado
    .overrideProvider(RepositorioOdes)
    .useValue(opciones.repositorio)
    .overrideProvider(INTERVALO_PING_SSE)
    .useValue(opciones.intervaloPingMs ?? 15_000)
    .compile();
  const app = modulo.createNestApplication<NestExpressApplication>({ logger: false });
  configurarAplicacion(
    app,
    cargarConfiguracion({ WEB_DIST_DIR: directorio, ...(opciones.trustProxy ? { TRUST_PROXY: opciones.trustProxy } : {}) }),
  );
  await app.init();
  return {
    app,
    cerrar: async () => {
      await app.close();
      await rm(directorio, { recursive: true, force: true });
    },
  };
}
