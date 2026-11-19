/**
 * Prueba el Asistente ODES desde la terminal contra la API REAL de Claude:
 *
 *   npm run odes:probar -- "¿Cuál fue la tasa de deserción en 2023?"
 *   npm run odes:probar -- --dos-veces "¿Qué boletines hay de 2024?"
 *
 * Necesita ANTHROPIC_API_KEY (en apps/server/.env o en el entorno) y el
 * índice del repositorio (npm run odes:indexar). Usa la misma configuración
 * que el servidor (ODES_MODELO, ODES_ESFUERZO, ...). Muestra los eventos tal
 * como los recibiría la interfaz, las fuentes citadas y el uso de tokens.
 * Con --dos-veces repite la pregunta para comprobar la caché de prompts
 * entre peticiones: la PRIMERA llamada de la segunda pregunta debe leer de la
 * caché lo que escribió la primera. (El total de la pregunta no sirve: dentro
 * de una misma pregunta, la segunda llamada siempre lee lo que acaba de
 * escribir la primera, aunque el prefijo cambie entre preguntas.)
 */
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { cargarArchivoEnv } from '../../config/configuracion.js';
import type { ResumenRespuesta } from '../chat/motor-ia.js';
import type { EventoChat } from '../chat/protocolo.js';
import { seudonimoIp } from '../chat/registro-uso.js';
import { ServicioChat } from '../chat/servicio-chat.js';
import { OdesModule } from '../odes.module.js';
import { mensajeCache } from './comprobacion-cache.js';

type EventoCita = Extract<EventoChat, { tipo: 'cita' }>;

function paginas(cita: EventoCita): string {
  if (cita.paginaInicio === null) return '';
  return cita.paginaFin && cita.paginaFin !== cita.paginaInicio
    ? `, págs. ${cita.paginaInicio}-${cita.paginaFin}`
    : `, pág. ${cita.paginaInicio}`;
}

async function preguntar(servicio: ServicioChat, pregunta: string): Promise<ResumenRespuesta> {
  const fuentes = new Map<number, EventoCita>();
  const resumen = await servicio.responder(
    [{ rol: 'usuario', texto: pregunta }],
    (evento) => {
      switch (evento.tipo) {
        case 'inicio':
          process.stderr.write(`[inicio: modo ${evento.modo}]\n`);
          break;
        case 'busqueda':
          process.stderr.write(`\n[${evento.herramienta}] ${evento.descripcion}\n`);
          break;
        case 'texto':
          process.stdout.write(evento.delta);
          break;
        case 'cita':
          fuentes.set(evento.indice, evento);
          process.stdout.write(`[${evento.indice}]`);
          break;
        case 'documentos':
          process.stdout.write(`\n${evento.titulo}:\n`);
          for (const doc of evento.documentos) process.stdout.write(`  - ${doc.titulo} (${doc.anio}) ${doc.urlFragmento}\n`);
          break;
        case 'fin':
          process.stderr.write(`\n\n[fin: ${evento.motivo}]\n`);
          break;
        case 'error':
          process.stderr.write(`\n\n[error ${evento.codigo}] ${evento.mensaje}\n`);
          break;
      }
    },
    new AbortController().signal,
    seudonimoIp('odes:probar'),
  );
  if (fuentes.size > 0) {
    process.stdout.write('\nFuentes:\n');
    for (const [indice, cita] of [...fuentes].toSorted(([a], [b]) => a - b)) {
      process.stdout.write(
        `  [${indice}] ${cita.documento.categoria} — ${cita.documento.titulo} (${cita.documento.anio})${paginas(cita)}\n       ${cita.url}\n`,
      );
    }
  }
  const { uso } = resumen;
  process.stderr.write(
    `\nResultado: ${resumen.resultado}${resumen.detalle ? ` (${resumen.detalle})` : ''} | modelo: ${resumen.modeloServido ?? '-'}` +
      `${resumen.respaldo ? ' (respaldo)' : ''} | llamadas: ${resumen.llamadas} | herramientas: ${resumen.herramientas}\n` +
      `Tokens: entrada ${uso.entrada}, salida ${uso.salida}, caché leída ${uso.cacheLectura}, caché escrita ${uso.cacheEscritura}\n` +
      (resumen.usoPrimeraLlamada
        ? `Primera llamada: caché leída ${resumen.usoPrimeraLlamada.cacheLectura}, caché escrita ${resumen.usoPrimeraLlamada.cacheEscritura}\n`
        : ''),
  );
  return resumen;
}

async function principal(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { 'dos-veces': { type: 'boolean', default: false } },
  });
  const pregunta = positionals.join(' ').trim();
  if (!pregunta) {
    console.error('Uso: npm run odes:probar -- [--dos-veces] "pregunta"');
    process.exitCode = 2;
    return;
  }
  cargarArchivoEnv();
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error(
      'Falta ANTHROPIC_API_KEY. Agréguela en apps/server/.env (ver .env.example, sección "Asistente ODES") ' +
        'o en el entorno. Para probar sin clave use el simulador: node dist/odes/cli/simulador-claude.js',
    );
    process.exitCode = 1;
    return;
  }
  const contexto = await NestFactory.createApplicationContext(OdesModule, { logger: ['error', 'warn'] });
  try {
    const servicio = contexto.get(ServicioChat);
    if (!servicio.repositorioDisponible()) {
      console.error('El índice del repositorio no está disponible. Genérelo con: npm run odes:indexar');
      process.exitCode = 1;
      return;
    }
    const primera = await preguntar(servicio, pregunta);
    if (values['dos-veces']) {
      process.stderr.write('\n──────── segunda vez (comprobación de caché) ────────\n');
      const segunda = await preguntar(servicio, pregunta);
      process.stderr.write(mensajeCache(primera, segunda));
    }
    if (primera.resultado === 'error') process.exitCode = 1;
  } finally {
    await contexto.close();
  }
}

principal().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
