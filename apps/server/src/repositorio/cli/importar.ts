/**
 * Carga inicial (o recarga) del Repositorio de Productos desde el paquete de
 * datos (repositorio.json + documentos/ + portadas/).
 *
 *   npm run repositorio:importar -- --paquete <carpeta> [--miniaturas <carpeta>]
 *        [--solo-nuevos] [--ids a,b,c] [--sin-documentos] [--restaurar-borrados] [--forzar]
 *
 * Idempotente y reanudable (upsert por id, archivos por sha256): correrlo de
 * nuevo no duplica nada y continúa donde quedó. Una vez que la administración
 * empezó a trabajar, protege sus cambios: no vuelve a crear los documentos
 * borrados en la administración (--restaurar-borrados) ni sobrescribe los
 * editados allí (--forzar), y nunca cambia la posición de uno existente.
 * Termina mostrando los conteos de la sección 8 del encargo. Usa la conexión
 * de la aplicación (REPOSITORIO_MYSQL_*). Las rutas se resuelven contra la
 * carpeta desde la que se ejecutó npm; REPOSITORIO_PAQUETE (contra
 * apps/server) equivale a --paquete.
 */
import { parseArgs } from 'node:util';
import { cargarArchivoEnv } from '../../config/configuracion.js';
import { rutaDesdeEntorno } from '../configuracion-repositorio.js';
import { conteosRepositorio, importarPaquete } from '../importacion/importador.js';
import { abrirBaseDatos, ejecutarCli, ErrorCli, megabytes, rutaDeOpcion } from './comun.js';

const AYUDA = `Uso: npm run repositorio:importar -- --paquete <carpeta> [--miniaturas <carpeta>]
       [--solo-nuevos] [--ids id1,id2] [--sin-documentos] [--restaurar-borrados] [--forzar]

  --paquete             carpeta repositorio-datos (o REPOSITORIO_PAQUETE)
  --miniaturas          carpeta con <id>.webp de 192 px (p. ej. apps/web/public/odes/portadas)
  --solo-nuevos         solo agrega los documentos que no están en la base; no toca los existentes
  --ids                 solo esos documentos (separados por comas)
  --sin-documentos      solo metadatos, portadas y miniaturas (pruebas rápidas)
  --restaurar-borrados  vuelve a crear (publicados) los documentos que se borraron en la administración
  --forzar              sobrescribe con el paquete también los documentos editados en la administración
  --ayuda               muestra esta ayuda

Sin las dos últimas opciones, una corrida después de que la administración empezó a
trabajar no deshace su trabajo: se salta (y avisa) los documentos borrados o editados allí.
Un documento nuevo entra publicado en la posición que le da el paquete; uno existente
conserva su posición y su estado de publicación.`;

async function principal(): Promise<number> {
  cargarArchivoEnv();
  const { values } = parseArgs({
    options: {
      paquete: { type: 'string' },
      miniaturas: { type: 'string' },
      'solo-nuevos': { type: 'boolean', default: false },
      ids: { type: 'string' },
      'sin-documentos': { type: 'boolean', default: false },
      'restaurar-borrados': { type: 'boolean', default: false },
      forzar: { type: 'boolean', default: false },
      ayuda: { type: 'boolean', short: 'h', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.ayuda) {
    console.log(AYUDA);
    return 0;
  }
  const paquete = values.paquete
    ? rutaDeOpcion(values.paquete)
    : process.env.REPOSITORIO_PAQUETE?.trim()
      ? rutaDesdeEntorno(process.env.REPOSITORIO_PAQUETE.trim())
      : null;
  if (!paquete) throw new ErrorCli(`Falta --paquete.\n\n${AYUDA}`, 2);
  const miniaturas = values.miniaturas ? rutaDeOpcion(values.miniaturas) : null;
  const ids = values.ids
    ?.split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const bd = await abrirBaseDatos();
  try {
    console.log(`Paquete:    ${paquete}`);
    if (miniaturas) console.log(`Miniaturas: ${miniaturas}`);
    const r = await importarPaquete(bd, {
      paquete,
      miniaturas,
      soloNuevos: values['solo-nuevos'],
      sinDocumentos: values['sin-documentos'],
      restaurarBorrados: values['restaurar-borrados'],
      forzar: values.forzar,
      ids: ids ?? null,
      registro: (mensaje) => console.log(mensaje),
    });
    const c = await conteosRepositorio(bd);

    console.log('\nImportación terminada.');
    console.log(`  Registros leídos:      ${r.leidos}`);
    console.log(
      `  Documentos:            ${r.creados} nuevos, ${r.actualizados} actualizados, ${r.sinCambios} sin cambios` +
        (r.omitidos ? `, ${r.omitidos} omitidos (--solo-nuevos)` : ''),
    );
    if (r.omitidosBorrados || r.omitidosEditados) {
      console.log(
        `  Protegidos:            ${r.omitidosBorrados} borrados en la administración (--restaurar-borrados), ` +
          `${r.omitidosEditados} editados en la administración (--forzar)`,
      );
    }
    console.log(
      `  Archivos:              ${r.archivosNuevos} nuevos (${megabytes(r.bytesNuevos)}), ${r.archivosReutilizados} ya estaban` +
        (r.huerfanosBorrados ? `; ${r.huerfanosBorrados} huérfanos borrados` : ''),
    );
    if (r.categoriasCreadas) console.log(`  Categorías creadas:    ${r.categoriasCreadas}`);
    if (r.soloEnBase) console.log(`  En la base pero no en el paquete: ${r.soloEnBase} (no se tocan)`);
    console.log(`  Duración:              ${(r.duracionMs / 1000).toFixed(1)} s`);

    console.log('\nConteos (documentos publicados):');
    console.log(`  Total:                 ${c.publicados} publicados de ${c.total}`);
    console.log(
      `  Por categoría:         ${c.porCategoria.map((x) => `${x.categoria} ${x.documentos}`).join(', ')}`,
    );
    console.log(
      `  Por idioma:            español ${c.porIdioma.es ?? 0}, inglés ${c.porIdioma.en ?? 0}`,
    );
    console.log(
      `  Tableros:              ${c.tableros}; con entrada de blog: ${c.conEntradaBlog}; con nota: ${c.conNota}`,
    );
    console.log(
      `  Con archivo propio:    ${c.conArchivo}; con portada: ${c.conPortada}; con miniatura: ${c.conMiniatura}`,
    );
    console.log(
      `  Archivos en la base:   ${c.archivos} (${megabytes(c.bytesArchivos)}); tamaño de la base: ${megabytes(c.bytesBase)}`,
    );
    if (r.avisos.length > 0) {
      console.log(`\nAvisos (${r.avisos.length}):`);
      for (const aviso of r.avisos.slice(0, 50)) console.log(`  - ${aviso}`);
      if (r.avisos.length > 50) console.log(`  ... y ${r.avisos.length - 50} más`);
    }
    return 0;
  } finally {
    await bd.cerrar();
  }
}

await ejecutarCli(principal);
