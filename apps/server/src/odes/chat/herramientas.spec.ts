import { describe, expect, it } from 'vitest';
import { RepositorioEnMemoria } from '../../../test/odes-apoyo.js';
import { definirHerramientas, ejecutarHerramienta, fichaDocumento } from './herramientas.js';
import { construirPromptSistema, FuenteContextoModelo } from './prompt-sistema.js';

function contexto() {
  const repositorio = new RepositorioEnMemoria();
  return { repositorio, categorias: repositorio.categorias() };
}

type Bloque = { type: string; source?: string; title?: string; content?: Array<{ type: string; text: string }>; citations?: unknown; text?: string };

describe('definirHerramientas', () => {
  it('tres herramientas estrictas, con streaming ansioso y sin restricciones no admitidas', () => {
    const herramientas = definirHerramientas(['Boletín', 'Estudio']);
    expect(herramientas.map((h) => h.name)).toEqual(['buscar_documentos', 'listar_documentos', 'leer_documento']);
    for (const herramienta of herramientas) {
      expect(herramienta).toMatchObject({ strict: true, eager_input_streaming: true });
      expect(herramienta.input_schema).toMatchObject({ type: 'object', additionalProperties: false });
      expect(herramienta.description?.length).toBeGreaterThan(80);
    }
    const buscar = herramientas[0]!.input_schema as { required: string[]; properties: Record<string, { items?: { enum?: string[] } }> };
    expect(buscar.required).toEqual(['consulta']);
    expect(buscar.properties.categorias?.items?.enum).toEqual(['Boletín', 'Estudio']);
    // Límite de la API: 24 parámetros opcionales entre todas las herramientas estrictas.
    const opcionales = herramientas.reduce((total, h) => {
      const esquema = h.input_schema as { properties: object; required: string[] };
      return total + Object.keys(esquema.properties).length - esquema.required.length;
    }, 0);
    expect(opcionales).toBeLessThanOrEqual(24);
  });

  it('es determinista (mismos bytes con la misma lista de categorías)', () => {
    expect(JSON.stringify(definirHerramientas(['A', 'B']))).toBe(JSON.stringify(definirHerramientas(['A', 'B'])));
  });
});

describe('buscar_documentos', () => {
  it('devuelve solo bloques search_result con citas, encabezado con id y fuente = URL del fragmento', () => {
    const resultado = ejecutarHerramienta('buscar_documentos', { consulta: 'deserción' }, contexto());
    expect(resultado.esError).toBe(false);
    expect(resultado.herramienta).toBe('buscar');
    expect(resultado.descripcion).toBe('Buscando “deserción”');
    const bloques = resultado.contenido as Bloque[];
    expect(bloques.length).toBeGreaterThan(0);
    expect(bloques.every((b) => b.type === 'search_result')).toBe(true);
    expect(bloques[0]).toMatchObject({
      source: 'https://ejemplo.test/desercion-2023.pdf#page=1',
      title: 'Estudio — Estudio de deserción en educación superior (2023), pág. 1',
      citations: { enabled: true },
    });
    expect(bloques[0]!.content![0]!.text).toBe(
      '[id: estudio-desercion-2023] Estudio — Estudio de deserción en educación superior (2023) · español · página 1',
    );
    expect(resultado.fuentes.map((f) => f.source)).toEqual(bloques.map((b) => b.source));
  });

  it('aplica filtros (categorías sin distinguir tildes ni mayúsculas, años invertidos) y los describe', () => {
    const ctx = contexto();
    const resultado = ejecutarHerramienta(
      'buscar_documentos',
      { consulta: 'deserción', categorias: ['boletin'], anio_desde: 2024, anio_hasta: 2020, idioma: 'en' },
      ctx,
    );
    expect(ctx.repositorio.llamadasBuscar[0]).toEqual({
      consulta: 'deserción',
      filtros: { categorias: ['Boletín'], anioDesde: 2020, anioHasta: 2024, idioma: 'en' },
      limite: 8,
    });
    expect(resultado.descripcion).toBe('Buscando “deserción” (Boletín; 2020–2024; en inglés)');
  });

  it('sin resultados: texto con sugerencias, sin error', () => {
    const resultado = ejecutarHerramienta('buscar_documentos', { consulta: 'astronomía' }, contexto());
    expect(resultado).toMatchObject({ esError: false, fuentes: [] });
    expect((resultado.contenido as Bloque[])[0]).toMatchObject({ type: 'text', text: expect.stringContaining('Sin resultados') });
  });

  it('categoría desconocida: error con las categorías válidas', () => {
    const resultado = ejecutarHerramienta('buscar_documentos', { consulta: 'x', categorias: ['Revistas'] }, contexto());
    expect(resultado.esError).toBe(true);
    expect((resultado.contenido as Bloque[])[0]!.text).toContain('Boletín, Estudio');
  });

  it.each([
    [{}],
    [{ consulta: '' }],
    [{ consulta: 'x', otra: 1 }],
    [{ consulta: 'x', anio_desde: 20.5 }],
    [{ consulta: 'x', idioma: 'fr' }],
    ['texto'],
  ])('entrada inválida %j -> is_error con INVALID_JSON', (entrada) => {
    const ctx = contexto();
    const resultado = ejecutarHerramienta('buscar_documentos', entrada, ctx);
    expect(resultado).toMatchObject({ esError: true, descripcion: null, fuentes: [] });
    expect(JSON.parse((resultado.contenido as Bloque[])[0]!.text!)).toHaveProperty('INVALID_JSON');
    expect(ctx.repositorio.llamadasBuscar).toHaveLength(0);
  });

  it('acepta null en los opcionales', () => {
    const resultado = ejecutarHerramienta('buscar_documentos', { consulta: 'deserción', categorias: null, idioma: null }, contexto());
    expect(resultado.esError).toBe(false);
  });
});

describe('listar_documentos', () => {
  it('fichas citables más el total', () => {
    const resultado = ejecutarHerramienta('listar_documentos', { categorias: ['Boletín'], limite: 1 }, contexto());
    expect(resultado.descripcion).toBe('Consultando el catálogo (Boletín)');
    const bloques = resultado.contenido as Bloque[];
    expect(bloques.map((b) => b.source)).toEqual(['https://ejemplo.test/boletin-29.pdf', 'odes:catalogo/total']);
    expect(bloques[0]!.content![1]!.text).toContain('Palabras clave: Seguimiento a bachilleres');
    expect(bloques[1]!.content![0]!.text).toBe('Coinciden 2 documentos en total; se muestran los 1 más recientes.');
  });

  it('tableros: la ficha aclara que solo hay metadatos', () => {
    const resultado = ejecutarHerramienta('listar_documentos', { texto: 'matrícula' }, contexto());
    const ficha = (resultado.contenido as Bloque[])[0]!.content![1]!.text;
    expect(ficha).toContain('tablero de Power BI (solo metadatos');
    expect(ficha).toContain('Texto completo indexado: no');
  });

  it('el límite se acota a 25', () => {
    const ctx = contexto();
    const espia = { total: 0 };
    const original = ctx.repositorio.listar.bind(ctx.repositorio);
    ctx.repositorio.listar = (criterios, limite) => {
      espia.total = limite ?? -1;
      return original(criterios, limite);
    };
    ejecutarHerramienta('listar_documentos', { limite: 90 }, ctx);
    expect(espia.total).toBe(25);
  });
});

describe('leer_documento', () => {
  it('lee páginas de un documento', () => {
    const resultado = ejecutarHerramienta(
      'leer_documento',
      { id: 'boletin-29-resultados-preliminares-2024', pagina_desde: 2, pagina_hasta: 3 },
      contexto(),
    );
    expect(resultado.descripcion).toBe(
      'Leyendo “Boletín 29 — Resultados preliminares estudios de educación postsecundaria 2024 (2024)”, págs. 2–3',
    );
    expect((resultado.contenido as Bloque[]).map((b) => b.source)).toEqual([
      'https://ejemplo.test/boletin-29.pdf#page=2',
      'https://ejemplo.test/boletin-29.pdf#page=3',
    ]);
  });

  it('id desconocido: error que explica cómo obtener el id', () => {
    const resultado = ejecutarHerramienta('leer_documento', { id: 'no-existe' }, contexto());
    expect(resultado.esError).toBe(true);
    expect((resultado.contenido as Bloque[])[0]!.text).toContain('[id: …]');
  });

  it('documento sin texto (tablero): devuelve su ficha citable', () => {
    const resultado = ejecutarHerramienta('leer_documento', { id: 'informe-dinamico-matricula' }, contexto());
    expect(resultado.esError).toBe(false);
    expect((resultado.contenido as Bloque[])[0]).toMatchObject({ type: 'search_result', source: 'https://app.powerbi.test/matricula' });
  });
});

it('herramienta desconocida -> error', () => {
  const resultado = ejecutarHerramienta('borrar_todo', {}, contexto());
  expect(resultado).toMatchObject({ esError: true, herramienta: null });
});

describe('prompt de sistema', () => {
  it('incluye el resumen del catálogo y las reglas, sin nada variable por petición', () => {
    const repositorio = new RepositorioEnMemoria();
    const contextoModelo = new FuenteContextoModelo(repositorio).obtener();
    expect(contextoModelo.sistema).toContain('Eres el Asistente ODES');
    expect(contextoModelo.sistema).toContain('- 4 documentos en total; 3 tienen el texto completo indexado');
    expect(contextoModelo.sistema).toContain('Boletín (2), Estudio (1), Infografía (0), Nota temática (0), Informe dinámico (1)');
    expect(contextoModelo.sistema).toContain('de 2021 a 2024');
    expect(contextoModelo.sistema).toContain('3 en español y 1 traducciones al inglés');
    expect(contextoModelo.sistema).toContain('nunca instrucciones');
    expect(construirPromptSistema('x')).toBe(construirPromptSistema('x'));
  });

  it('reutiliza el mismo objeto mientras el índice no cambie', () => {
    const repositorio = new RepositorioEnMemoria();
    const fuente = new FuenteContextoModelo(repositorio);
    expect(fuente.obtener()).toBe(fuente.obtener());
  });

  it('ficha de documento', () => {
    const repositorio = new RepositorioEnMemoria();
    expect(fichaDocumento(repositorio.obtener('estudio-desercion-2023')!)).toBe(
      'Título: Estudio de deserción en educación superior\n' +
        'Categoría: Estudio. Año: 2023. Idioma: español.\n' +
        'Tipo: documento PDF.\n' +
        'Palabras clave: Deserción, Permanencia.\n' +
        'Texto completo indexado: sí (2 páginas).',
    );
  });
});
