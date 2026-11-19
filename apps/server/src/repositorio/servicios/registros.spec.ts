import { describe, expect, it } from 'vitest';
import type { TipoProducto } from '../api-repositorio.js';
import { aDocumentoAdmin, aDocumentoPublico, type RegistroDocumento } from './registros.js';

const ARCHIVO = {
  id: 1,
  sha256: 'a'.repeat(64),
  mime: 'application/pdf',
  bytes: 1000,
  trozos: 1,
  tamanoTrozo: 1_048_576,
  creadoEn: new Date('2026-01-01T00:00:00Z'),
};

function registro(tipo: TipoProducto, urlVerExterna: string | null): RegistroDocumento {
  return {
    id: 'doc-1',
    orden: 1,
    titulo: 'Título',
    subtitulo: null,
    descripcion: null,
    categoriaId: 1,
    categoria: 'Boletín',
    numero: null,
    anio: 2024,
    mes: null,
    idioma: 'es',
    tipo,
    claves: [],
    urlVerExterna,
    urlEntradaBlog: null,
    nota: null,
    permiteDescarga: true,
    equivalenteEnEspanol: null,
    notasInternas: null,
    publicado: true,
    urlOriginal: null,
    archivo: ARCHIVO,
    portada: null,
    miniatura: null,
    creadoEn: new Date('2026-01-01T00:00:00Z'),
    actualizadoEn: new Date('2026-01-01T00:00:00Z'),
    actualizadoPor: null,
  };
}

describe('aDocumentoPublico: destino de «Ver»', () => {
  it('un documento con archivo abre la copia propia aunque tenga URL externa', () => {
    expect(aDocumentoPublico(registro('documento', 'https://ejemplo.org/x')).urlVer).toBe(
      '/api/repositorio/documentos/doc-1/ver',
    );
  });

  it('un tablero o una entrada con archivo propio abre su URL externa (como la vista previa del editor)', () => {
    for (const tipo of ['tablero', 'entrada'] as const) {
      const r = registro(tipo, 'https://app.powerbi.com/view?r=1');
      expect(aDocumentoPublico(r).urlVer).toBe('https://app.powerbi.com/view?r=1');
      // La administración conserva el enlace al archivo («Ver el archivo actual»).
      expect(aDocumentoAdmin(r).urlVer).toBe('/api/repositorio/admin/documentos/doc-1/ver');
    }
  });

  it('un tablero sin URL externa pero con archivo sigue abriendo el archivo', () => {
    expect(aDocumentoPublico(registro('tablero', null)).urlVer).toBe('/api/repositorio/documentos/doc-1/ver');
  });
});
