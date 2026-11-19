import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErrorPaquete, leerPaquete, notasInternasDe } from './paquete.js';

function registro(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'boletin-19-fe-erratas-boletin-n-19-2021',
    orden: 1,
    titulo: 'Fe de erratas del Boletín N.º 19',
    subtitulo: null,
    categoria: 'Boletín',
    numero: '19',
    anio: 2021,
    mes: 8,
    idioma: 'es',
    tipo: 'documento',
    claves: ['Normatividad'],
    archivo: 'documentos/b19.pdf',
    archivo_tipo: 'application/pdf',
    archivo_bytes: 9,
    portada: 'portadas/b19.jpg',
    url_ver: 'https://sapiencia.gov.co/b19.pdf',
    url_descarga: null,
    permite_descarga: true,
    url_entrada_blog: null,
    nota: null,
    origen: { pagina_sitio: '/observatorio-boletines/', subido: '2021-08', equivalente_en_espanol: null },
    curaduria: { evidencia: 'Portada del boletín', dudas: null },
    ...extra,
  };
}

describe('lectura del paquete de carga inicial', () => {
  let carpeta: string;

  beforeAll(async () => {
    carpeta = await mkdtemp(join(tmpdir(), 'repositorio-paquete-'));
    await mkdir(join(carpeta, 'documentos'));
    await mkdir(join(carpeta, 'portadas'));
    await writeFile(join(carpeta, 'documentos', 'b19.pdf'), '%PDF-1.7\n');
    await writeFile(join(carpeta, 'portadas', 'b19.jpg'), 'x');
    await writeFile(join(carpeta, 'secreto.txt'), 'fuera');
    await writeFile(
      join(carpeta, 'repositorio.json'),
      JSON.stringify({
        version: '4.2',
        generado: '2026-10-08',
        documentos: [
          registro(),
          registro({ id: 'Mal Id' }),
          registro({ id: 'otro', archivo: '../secreto.txt' }),
          registro({ id: 'boletin-19-fe-erratas-boletin-n-19-2021' }),
          registro({ id: 'tablero-x', tipo: 'tablero', archivo: null, portada: 'portadas/falta.jpg', url_ver: 'ftp://x' }),
        ],
      }),
    );
  });

  afterAll(async () => {
    await rm(carpeta, { recursive: true, force: true });
  });

  it('valida cada registro, rechaza rutas fuera del paquete y repetidos', async () => {
    const paquete = await leerPaquete(carpeta);
    expect(paquete.version).toBe('4.2');
    expect(paquete.registros.map((r) => r.id)).toEqual(['boletin-19-fe-erratas-boletin-n-19-2021', 'otro']);
    expect(paquete.registros[0].rutaArchivo).toBe(join(carpeta, 'documentos', 'b19.pdf'));
    expect(paquete.registros[1].rutaArchivo).toBeNull();
    expect(paquete.avisos).toHaveLength(4);
    expect(paquete.avisos.join('\n')).toMatch(/Mal Id.*omitido/);
    expect(paquete.avisos.join('\n')).toMatch(/secreto\.txt no existe en el paquete/);
    expect(paquete.avisos.join('\n')).toMatch(/id repetido/);
    expect(paquete.avisos.join('\n')).toMatch(/tablero-x.*url_ver/);
  });

  it('la curaduría y el origen pasan a las notas internas', async () => {
    const [primero] = (await leerPaquete(carpeta)).registros;
    expect(notasInternasDe(primero)).toBe(
      'Evidencia: Portada del boletín\n\nPublicado originalmente en: https://sapiencia.gov.co/b19.pdf — ' +
        'página /observatorio-boletines/, subido 2021-08',
    );
  });

  it('una carpeta sin repositorio.json da un error claro', async () => {
    await expect(leerPaquete(join(carpeta, 'documentos'))).rejects.toBeInstanceOf(ErrorPaquete);
  });
});
