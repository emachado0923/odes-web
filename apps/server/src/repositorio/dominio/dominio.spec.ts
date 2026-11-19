import { describe, expect, it } from 'vitest';
import { LIMITES_REPOSITORIO } from '../api-repositorio.js';
import { ErrorRepositorioHttp } from '../errores-repositorio.js';
import {
  hashContrasena,
  interpretarHash,
  necesitaRehash,
  obtenerHashFicticio,
  problemaContrasena,
  verificarContrasena,
} from './contrasenas.js';
import {
  claveNormalizada,
  generarIdDocumento,
  idUnico,
  slug,
  textoLinea,
  textoMultilinea,
} from './normalizacion.js';
import {
  contarPalabras,
  type DatosParaPublicar,
  esIdDocumento,
  problemasParaPublicar,
  validarCambioCategoria,
  validarConfirmacion,
  validarCredenciales,
  validarDatosDocumento,
  validarLimite,
} from './validacion.js';

describe('contraseñas (scrypt)', () => {
  it('guarda el formato scrypt$N$r$p$sal$hash y verifica', async () => {
    const hash = await hashContrasena('una contraseña larga');
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
    expect(await verificarContrasena('una contraseña larga', hash)).toBe(true);
    expect(await verificarContrasena('una contraseña largA', hash)).toBe(false);
    expect(necesitaRehash(hash)).toBe(false);
  });

  it('usa una sal distinta cada vez', async () => {
    const [a, b] = await Promise.all([hashContrasena('igual igual igual'), hashContrasena('igual igual igual')]);
    expect(a).not.toBe(b);
  });

  it('normaliza a NFC: la misma contraseña con tildes compuestas o separadas', async () => {
    const hash = await hashContrasena('contraseña-segura');
    expect(await verificarContrasena('contrasen\u0303a-segura', hash)).toBe(true);
  });

  it.each(['', 'texto', 'scrypt$1$8$1$AAAA$BBBB', 'scrypt$32768$8$1$c2Fs$aGFzaA==', 'bcrypt$2b$10$x'])(
    'un hash mal formado (%j) nunca coincide',
    async (hash) => {
      expect(await verificarContrasena('x', hash)).toBe(false);
      expect(necesitaRehash(hash)).toBe(true);
    },
  );

  it('detecta parámetros viejos', async () => {
    const datos = interpretarHash(await hashContrasena('abcdefghijklmn'));
    expect(datos?.N).toBe(32768);
    const viejo = `scrypt$16384$8$1$${datos?.sal.toString('base64')}$${datos?.hash.toString('base64')}`;
    expect(necesitaRehash(viejo)).toBe(true);
  });

  it('el hash ficticio sirve para igualar tiempos y no coincide con nada obvio', async () => {
    expect(await verificarContrasena('', await obtenerHashFicticio())).toBe(false);
  });

  it('exige mínimo 12 caracteres, sin espacios en los extremos', () => {
    expect(problemaContrasena('corta')).toMatch(/12/);
    expect(problemaContrasena(' espacio al inicio')).toMatch(/espacios/);
    expect(problemaContrasena('suficientemente-larga')).toBeNull();
  });
});

describe('normalización y slugs', () => {
  it('clave de palabra clave sin tildes, mayúsculas ni espacios dobles', () => {
    expect(claveNormalizada('  Educación   Superior ')).toBe('educacion superior');
    expect(claveNormalizada('EDUCACION superior')).toBe('educacion superior');
    expect(claveNormalizada('Niñez')).toBe('ninez');
  });

  it('limpia caracteres de control', () => {
    expect(textoLinea('a\u0000b\tc\n d')).toBe('abc d');
    expect(textoMultilinea('línea 1\r\nlínea 2  \n\n\u0007')).toBe('línea 1\nlínea 2');
  });

  it('slug', () => {
    expect(slug('Boletín N.º 19: Fe de erratas')).toBe('boletin-n-19-fe-de-erratas');
  });

  it.each([
    [
      { categoria: 'Boletín', numero: '19', titulo: 'Fe de erratas del Boletín N.º 19', anio: 2021, idioma: 'es' },
      'boletin-19-fe-erratas-boletin-n-19-2021',
    ],
    [
      { categoria: 'Estudio', numero: null, titulo: 'Brecha digital en Medellín', anio: 2023, idioma: 'es' },
      'estudio-brecha-digital-medellin-2023',
    ],
    [
      { categoria: 'Infografía', numero: null, titulo: 'Ranking ciudades: grupos de investigación', anio: null, idioma: 'es' },
      'infografia-ranking-ciudades-grupos-investigacion',
    ],
    [
      { categoria: 'Boletín', numero: '24', titulo: 'General landscape of the labor market in Medellín', anio: 2022, idioma: 'en' },
      'boletin-24-en-general-landscape-labor-market-medellin-2022',
    ],
  ])('id como los del paquete: %j', (datos, esperado) => {
    expect(generarIdDocumento(datos)).toBe(esperado);
  });

  it('recorta ids largos sin partir palabras y los hace únicos', async () => {
    const id = generarIdDocumento({
      categoria: 'Educación superior en cifras',
      titulo: 'Resultados convocatoria Fondo Sapiencia EPM y Universidades de la ciudad',
      anio: 2019,
    });
    expect(id.length).toBeLessThanOrEqual(90);
    expect(esIdDocumento(id)).toBe(true);
    const usados = new Set([id, `${id}-2`]);
    expect(await idUnico(id, async (candidato) => usados.has(candidato))).toBe(`${id}-3`);
  });
});

function camposDe(accion: () => unknown): Record<string, string> {
  let capturado: unknown;
  try {
    accion();
  } catch (error) {
    capturado = error;
  }
  expect(capturado).toBeInstanceOf(ErrorRepositorioHttp);
  const error = capturado as ErrorRepositorioHttp;
  expect(error.getStatus()).toBe(400);
  return error.campos ?? { mensaje: error.cuerpo.mensaje };
}

const base = {
  titulo: '  Fe de erratas  ',
  categoria: 'Boletín',
  idioma: 'es',
  tipo: 'documento',
  claves: ['Educación', 'educacion', '  Acceso '],
  permiteDescarga: true,
};

describe('validación de DatosDocumento', () => {
  it('limpia textos, quita claves repetidas y completa nulos', () => {
    const datos = validarDatosDocumento({ ...base, subtitulo: '   ', numero: 19, nota: null });
    expect(datos).toMatchObject({
      titulo: 'Fe de erratas',
      subtitulo: null,
      numero: '19',
      claves: ['Educación', 'Acceso'],
      urlVerExterna: null,
      orden: null,
      notasInternas: null,
    });
  });

  it('máximo 6 palabras clave y longitudes del contrato (descripción: 700 caracteres)', () => {
    const campos = camposDe(() =>
      validarDatosDocumento({
        ...base,
        titulo: 'x'.repeat(301),
        claves: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        descripcion: 'd'.repeat(701),
        nota: 'n'.repeat(301),
      }),
    );
    expect(Object.keys(campos).toSorted()).toEqual(['claves', 'descripcion', 'nota', 'titulo']);
    expect(campos.claves).toBe('Máximo 6 palabras clave.');
    expect(campos.descripcion).toBe('La descripción: máximo 700 caracteres.');
    // Seis sí; las repetidas (sin distinguir tildes ni mayúsculas) no cuentan.
    expect(validarDatosDocumento({ ...base, claves: ['a', 'b', 'c', 'd', 'e', 'f'] }).claves).toHaveLength(6);
    expect(
      validarDatosDocumento({ ...base, claves: ['Educación', 'educacion', 'b', 'c', 'd', 'e', 'f'] }).claves,
    ).toEqual(['Educación', 'b', 'c', 'd', 'e', 'f']);
    // Los 700 se cuentan en caracteres, no en bytes.
    expect(validarDatosDocumento({ ...base, descripcion: 'ñ'.repeat(700) }).descripcion).toHaveLength(700);
  });

  it('descripción opcional: se limpia como un texto de una línea y vacía queda en null', () => {
    expect(validarDatosDocumento(base).descripcion).toBeNull();
    expect(validarDatosDocumento({ ...base, descripcion: null }).descripcion).toBeNull();
    expect(validarDatosDocumento({ ...base, descripcion: '   ' }).descripcion).toBeNull();
    expect(validarDatosDocumento({ ...base, descripcion: '  El boletín   presenta  cifras. ' }).descripcion).toBe(
      'El boletín presenta cifras.',
    );
    expect(camposDe(() => validarDatosDocumento({ ...base, descripcion: 60 }))).toHaveProperty('descripcion');
  });

  it.each(['javascript:alert(1)', 'ftp://servidor/archivo.pdf', 'sapiencia.gov.co', 'http://'])(
    'solo URL http(s): rechaza %j',
    (url) => {
      expect(camposDe(() => validarDatosDocumento({ ...base, urlVerExterna: url }))).toHaveProperty('urlVerExterna');
    },
  );

  it('tableros y entradas exigen URL externa y no tienen descarga', () => {
    const campos = camposDe(() => validarDatosDocumento({ ...base, tipo: 'tablero', permiteDescarga: true }));
    expect(Object.keys(campos).toSorted()).toEqual(['permiteDescarga', 'urlVerExterna']);
    expect(
      validarDatosDocumento({
        ...base,
        tipo: 'entrada',
        permiteDescarga: false,
        urlVerExterna: 'https://sapiencia.gov.co/blog',
      }).tipo,
    ).toBe('entrada');
  });

  it('mes solo con año; año y mes en rango', () => {
    expect(camposDe(() => validarDatosDocumento({ ...base, mes: 5 }))).toHaveProperty('mes');
    expect(camposDe(() => validarDatosDocumento({ ...base, anio: 1800 }))).toHaveProperty('anio');
    expect(camposDe(() => validarDatosDocumento({ ...base, anio: 2020, mes: 13 }))).toHaveProperty('mes');
  });

  it('id opcional en formato slug', () => {
    expect(validarDatosDocumento({ ...base, id: 'mi-documento-2025' }).id).toBe('mi-documento-2025');
    expect(camposDe(() => validarDatosDocumento({ ...base, id: 'Con Mayúsculas' }))).toHaveProperty('id');
  });

  it('rechaza cuerpos que no son objetos y tipos equivocados', () => {
    expect(camposDe(() => validarDatosDocumento('texto'))).toHaveProperty('mensaje');
    const campos = camposDe(() => validarDatosDocumento({ ...base, permiteDescarga: 'sí', idioma: 'fr' }));
    expect(Object.keys(campos).toSorted()).toEqual(['idioma', 'permiteDescarga']);
  });
});

/** Texto de `n` palabras separadas por un espacio. */
function palabras(n: number): string {
  return Array.from({ length: n }, (_, i) => `palabra${i + 1}`).join(' ');
}

const SEIS_CLAVES = ['Educación superior', 'Acceso', 'Permanencia', 'Medellín', 'Becas', 'Deserción'];

/** Un documento con todo lo necesario para publicarse. */
const PUBLICABLE: DatosParaPublicar = {
  tipo: 'documento',
  anio: 2024,
  descripcion: palabras(30),
  claves: SEIS_CLAVES,
};

describe('contarPalabras', () => {
  it('cuenta los fragmentos separados por espacios', () => {
    expect(contarPalabras('El boletín presenta cifras.')).toBe(4);
    expect(contarPalabras('Boletín')).toBe(1);
    expect(contarPalabras(palabras(60))).toBe(60);
  });

  it.each(['', '   ', '\n\t ', null, undefined])('sin texto (%j): 0', (texto) => {
    expect(contarPalabras(texto)).toBe(0);
  });

  it('los espacios repetidos, saltos de línea, tabuladores y espacios duros separan, pero no suman', () => {
    expect(contarPalabras('  uno   dos\n\ntres\tcuatro cinco  ')).toBe(5);
  });

  it('la puntuación pegada no es otra palabra; un signo suelto entre espacios sí', () => {
    expect(contarPalabras('Medellín, Antioquia (Colombia).')).toBe(3);
    expect(contarPalabras('educación postsecundaria/terciaria')).toBe(2);
    expect(contarPalabras('2019 — 2023')).toBe(3);
  });
});

describe('problemasParaPublicar (comentarios del Observatorio)', () => {
  it('los límites del contrato: descripción de 25 a 35 palabras (se piden 30) y exactamente 6 palabras clave', () => {
    expect(LIMITES_REPOSITORIO.palabrasDescripcion).toEqual({ minimo: 25, recomendado: 30, maximo: 35 });
    expect(LIMITES_REPOSITORIO.clavesParaPublicar).toBe(6);
    expect(LIMITES_REPOSITORIO.maxClaves).toBe(6);
  });

  it('un documento con año, descripción de 30 palabras y 6 palabras clave no tiene problemas', () => {
    expect(problemasParaPublicar(PUBLICABLE)).toEqual({});
  });

  it.each(['tablero', 'entrada'] as const)('un %s completo también se publica (con las mismas reglas)', (tipo) => {
    expect(problemasParaPublicar({ ...PUBLICABLE, tipo })).toEqual({});
    expect(problemasParaPublicar({ ...PUBLICABLE, tipo, anio: null })).toEqual({
      anio: 'Para publicar, indique el año de publicación.',
    });
  });

  it('sin año no se publica', () => {
    expect(problemasParaPublicar({ ...PUBLICABLE, anio: null })).toEqual({
      anio: 'Para publicar, indique el año de publicación.',
    });
  });

  it.each([null, '', '   \n '])('sin descripción (%j) pide escribirla', (descripcion) => {
    expect(problemasParaPublicar({ ...PUBLICABLE, descripcion })).toEqual({
      descripcion: 'Para publicar, escriba la descripción (unas 30 palabras).',
    });
  });

  it.each([
    [1, false],
    [24, false],
    [25, true],
    [30, true],
    [35, true],
    [36, false],
    [120, false],
  ])('descripción de %i palabras: ¿se publica? %s', (n, publicable) => {
    const problemas = problemasParaPublicar({ ...PUBLICABLE, descripcion: palabras(n) });
    expect(problemas).toEqual(
      publicable
        ? {}
        : { descripcion: `La descripción tiene ${n} palabras: para publicar debe tener entre 25 y 35 (se piden 30).` },
    );
  });

  it('las palabras se cuentan como en contarPalabras: los espacios de más no suman', () => {
    const veinticinco = `  ${palabras(25).replaceAll(' ', ' \n\t ')}  `;
    expect(problemasParaPublicar({ ...PUBLICABLE, descripcion: veinticinco })).toEqual({});
    const treintaYSeis = palabras(36).replaceAll(' ', '   ');
    expect(problemasParaPublicar({ ...PUBLICABLE, descripcion: treintaYSeis }).descripcion).toMatch(/tiene 36 palabras/);
  });

  it.each([0, 1, 5, 7])('con %i palabras clave no se publica (se necesitan exactamente 6)', (n) => {
    const claves = [...SEIS_CLAVES, 'Otra más'].slice(0, n);
    expect(claves).toHaveLength(n);
    expect(problemasParaPublicar({ ...PUBLICABLE, claves })).toEqual({
      claves: `Para publicar, el documento necesita 6 palabras clave (tiene ${n}).`,
    });
  });

  it('las palabras clave vacías o repetidas no cuentan: la validación las quita antes de contar', () => {
    // Seis escritas, pero una vacía y dos iguales sin tildes ni mayúsculas: quedan cuatro.
    const datos = validarDatosDocumento({
      ...base,
      anio: 2024,
      descripcion: palabras(30),
      claves: ['Educación superior', 'EDUCACION SUPERIOR', '   ', 'Acceso', 'Permanencia', 'Medellín'],
    });
    expect(datos.claves).toEqual(['Educación superior', 'Acceso', 'Permanencia', 'Medellín']);
    expect(problemasParaPublicar(datos)).toEqual({
      claves: 'Para publicar, el documento necesita 6 palabras clave (tiene 4).',
    });
    // Con seis distintas, el mismo documento ya se puede publicar.
    expect(problemasParaPublicar(validarDatosDocumento({ ...base, anio: 2024, descripcion: palabras(30), claves: SEIS_CLAVES }))).toEqual({});
  });

  it('todo junto: un tablero sin año, sin descripción ni palabras clave tiene los tres problemas, en ese orden', () => {
    const problemas = problemasParaPublicar({ tipo: 'tablero', anio: null, descripcion: null, claves: [] });
    // El orden importa: el 409 de publicar los encadena en este orden. El tipo
    // no es un problema: tableros y entradas se publican como los documentos.
    expect(Object.keys(problemas)).toEqual(['anio', 'descripcion', 'claves']);
  });

  it('solo mira tipo, año, descripción y palabras clave: el mes no hace falta y el destino lo revisa aparte publicar', () => {
    // Sin mes, sin archivo ni URL externa y sin descarga: para estas reglas, publicable
    // (que tenga a dónde llevar el «Ver» lo comprueba la publicación con tieneDestino).
    const datos = validarDatosDocumento({
      ...base,
      anio: 2024,
      mes: null,
      descripcion: palabras(28),
      claves: SEIS_CLAVES,
      urlVerExterna: null,
      permiteDescarga: false,
    });
    expect(problemasParaPublicar(datos)).toEqual({});
  });
});

describe('otras validaciones', () => {
  it('credenciales: usuario en minúsculas', () => {
    expect(validarCredenciales({ usuario: ' Admin ', contrasena: 'x' })).toEqual({ usuario: 'admin', contrasena: 'x' });
    expect(() => validarCredenciales({ usuario: 'admin' })).toThrow(ErrorRepositorioHttp);
  });

  it('confirmación del borrado', () => {
    expect(validarConfirmacion({ confirmarId: 'abc' })).toEqual({ confirmarId: 'abc' });
    expect(() => validarConfirmacion({})).toThrow(ErrorRepositorioHttp);
  });

  it('cambio de categoría necesita nombre u orden', () => {
    expect(validarCambioCategoria({ orden: 2 })).toEqual({ nombre: null, orden: 2 });
    expect(() => validarCambioCategoria({})).toThrow(ErrorRepositorioHttp);
  });

  it('límite del registro de cambios', () => {
    expect(validarLimite(undefined)).toBe(50);
    expect(validarLimite('10')).toBe(10);
    expect(() => validarLimite('0')).toThrow(ErrorRepositorioHttp);
    expect(() => validarLimite('501')).toThrow(ErrorRepositorioHttp);
    expect(() => validarLimite(['1', '2'])).toThrow(ErrorRepositorioHttp);
  });

  it('identificadores de documento', () => {
    expect(esIdDocumento('boletin-19-fe-erratas-boletin-n-19-2021')).toBe(true);
    expect(esIdDocumento('../etc')).toBe(false);
    expect(esIdDocumento('a'.repeat(121))).toBe(false);
  });
});
