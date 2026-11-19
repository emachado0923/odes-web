import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  emparejarTraducciones,
  ordenarCategorias,
  tipoDeDocumento,
} from './documento-indexable.js';
import { ErrorFuente, FuentePaqueteJson } from './fuente-paquete-json.js';

const directorios: string[] = [];
afterEach(() => {
  for (const directorio of directorios.splice(0))
    rmSync(directorio, { recursive: true, force: true });
});

function registro(
  id: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    orden: 1,
    titulo: `Título de ${id}`,
    subtitulo: null,
    categoria: 'Boletín',
    numero: null,
    anio: 2021,
    mes: null,
    idioma: 'es',
    tipo: 'documento',
    claves: ['Acceso'],
    archivo: null,
    archivo_tipo: null,
    portada: null,
    url_ver: 'https://sapiencia.gov.co/x.pdf',
    nota: null,
    origen: { pagina_sitio: '/x/', subido: null, equivalente_en_espanol: null },
    curaduria: { evidencia: 'NOTA INTERNA SECRETA', dudas: 'DUDA INTERNA' },
    ...extra,
  };
}

function crearPaquete(documentos: unknown[]): string {
  const directorio = mkdtempSync(join(tmpdir(), 'odes-paquete-'));
  directorios.push(directorio);
  mkdirSync(join(directorio, 'documentos'));
  writeFileSync(join(directorio, 'documentos', 'con-archivo.pdf'), '%PDF-1.4');
  writeFileSync(
    join(directorio, 'repositorio.json'),
    JSON.stringify({
      version: '4.2',
      generado: '2026-10-08',
      total: documentos.length,
      documentos,
    }),
  );
  return directorio;
}

describe('FuentePaqueteJson', () => {
  it('mapea los registros válidos y nunca entrega la curaduría', async () => {
    const directorio = crearPaquete([
      registro('con-archivo', {
        archivo: 'documentos/con-archivo.pdf',
        archivo_tipo: 'application/pdf',
        numero: 19,
        subtitulo: '  ',
      }),
    ]);
    const lectura = await new FuentePaqueteJson(directorio).leer();
    expect(lectura.version).toBe('4.2');
    expect(lectura.avisos).toEqual([]);
    expect(lectura.registros).toHaveLength(1);
    const [{ metadatos, archivo }] = lectura.registros as [
      (typeof lectura.registros)[number],
    ];
    expect(archivo).toBe(join(directorio, 'documentos', 'con-archivo.pdf'));
    expect(metadatos.numero).toBe('19');
    expect(metadatos.subtitulo).toBeNull();
    expect(JSON.stringify(lectura)).not.toMatch(/INTERNA|curaduria/);
  });

  it('omite registros inválidos o repetidos y avisa por qué', async () => {
    const directorio = crearPaquete([
      registro('valido'),
      registro('Id Malo'),
      registro('sin-url', { url_ver: 'javascript:alert(1)' }),
      registro('valido'),
      'no es un objeto',
    ]);
    const lectura = await new FuentePaqueteJson(directorio).leer();
    expect(lectura.registros.map((r) => r.metadatos.id)).toEqual(['valido']);
    expect(lectura.avisos).toHaveLength(4);
    expect(lectura.avisos.join('\n')).toContain('id repetido');
  });

  it('ignora archivos que no existen o salen del paquete', async () => {
    const directorio = crearPaquete([
      registro('falta', { archivo: 'documentos/no-existe.pdf' }),
      registro('escapa', { archivo: '../../etc/passwd' }),
      registro('absoluto', { archivo: '/etc/passwd' }),
    ]);
    const lectura = await new FuentePaqueteJson(directorio).leer();
    expect(lectura.registros.every((r) => r.archivo === null)).toBe(true);
    expect(lectura.avisos).toHaveLength(3);
  });

  it('falla con un error claro si no hay repositorio.json', async () => {
    const directorio = mkdtempSync(join(tmpdir(), 'odes-vacio-'));
    directorios.push(directorio);
    await expect(
      new FuentePaqueteJson(directorio).leer(),
    ).rejects.toBeInstanceOf(ErrorFuente);
  });
});

describe('mapeo al contrato', () => {
  it('asigna el tipo según el producto y el archivo', () => {
    const base = { urlVer: 'https://sapiencia.gov.co/x' };
    expect(tipoDeDocumento({ ...base, tipo: 'tablero' }, null)).toBe('tablero');
    expect(tipoDeDocumento({ ...base, tipo: 'entrada' }, null)).toBe('entrada');
    expect(tipoDeDocumento({ ...base, tipo: 'documento' }, 'pdf')).toBe('pdf');
    expect(tipoDeDocumento({ ...base, tipo: 'documento' }, 'imagen')).toBe(
      'imagen',
    );
    expect(tipoDeDocumento({ ...base, tipo: 'documento' }, 'docx')).toBe(
      'otro',
    );
    expect(tipoDeDocumento({ ...base, tipo: 'documento' }, 'pptx')).toBe(
      'otro',
    );
    expect(
      tipoDeDocumento(
        {
          tipo: 'documento',
          urlVer: 'https://sapienciagov-my.sharepoint.com/:b:/g/personal/x',
        },
        null,
      ),
    ).toBe('pdf');
    expect(tipoDeDocumento({ ...base, tipo: 'documento' }, null)).toBe('otro');
  });

  it('ordena las categorías como el repositorio y deja las nuevas al final', () => {
    expect(
      ordenarCategorias([
        'Otros productos',
        'Zeta',
        'Boletín',
        'Infografía',
        'Alfa',
      ]),
    ).toEqual(['Boletín', 'Infografía', 'Otros productos', 'Alfa', 'Zeta']);
  });

  it('empareja cada traducción con su original', () => {
    const comun = {
      orden: 1,
      subtitulo: null,
      numero: null,
      mes: null,
      tipo: 'documento' as const,
      claves: [],
      urlVer: 'https://x',
      nota: null,
      archivoTipo: null,
    };
    const pares = emparejarTraducciones([
      {
        ...comun,
        id: 'es-2022',
        titulo: 'Mujeres en educación',
        categoria: 'Infografía',
        anio: 2022,
        idioma: 'es',
        equivalenteEnEspanol: null,
      },
      {
        ...comun,
        id: 'es-2020',
        titulo: 'Mujeres en educación',
        categoria: 'Infografía',
        anio: 2020,
        idioma: 'es',
        equivalenteEnEspanol: null,
      },
      {
        ...comun,
        id: 'en-2020',
        titulo: 'Women in education',
        categoria: 'Infografía',
        anio: 2020,
        idioma: 'en',
        equivalenteEnEspanol: 'Mujeres en educación (Infografía, 2020)',
      },
    ]);
    expect(pares.get('en-2020')).toBe('es-2020');
    expect(pares.get('es-2020')).toBe('en-2020');
    expect(pares.has('es-2022')).toBe(false);
  });
});
