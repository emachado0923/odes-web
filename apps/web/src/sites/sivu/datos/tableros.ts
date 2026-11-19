/**
 * Tableros de información que se muestran debajo del edificio.
 *
 * Para publicar un tablero: agrégalo aquí (o completa su `url`). Sin `url`,
 * la tarjeta dice "Próximamente" y no enlaza a ningún lado. Las URL externas
 * (http/https a otro dominio) se abren en una pestaña nueva; las rutas propias
 * ("/sivu/…", "/repositorio…") recargan la página, como todo enlace que sale
 * de una rama.
 */
export interface Tablero {
  /** Identificador estable (clave de React y data-tablero en el HTML). */
  id: string
  titulo: string
  /** Una o dos frases: qué muestra y con qué datos. */
  descripcion: string
  /** Etiqueta morada de la tarjeta (tema o área). */
  tema: string
  /** Dirección del tablero. Vacía o ausente: "Próximamente". */
  url?: string
  /** Varias entradas del mismo producto (p. ej. tablero y ventanilla); si está, reemplaza el botón de `url`. */
  enlaces?: readonly { texto: string; url: string }[]
}

export const TABLEROS: readonly Tablero[] = [
  {
    id: 'matricula-educacion-superior-2025',
    titulo: 'Matrícula en educación superior en Medellín (2025)',
    descripcion:
      'Estudiantes matriculados por institución, programa, área de conocimiento, nivel, modalidad y género, con datos del SNIES.',
    tema: 'Educación superior',
    url: '/tableros/matricula-2025',
  },
  {
    id: 'beneficiarios-fondos-2026',
    titulo: 'Beneficiarios de los fondos de Sapiencia (2026)',
    descripcion:
      'Tablero con los beneficios, estados, giros, instituciones y comunas de los fondos y becas de Sapiencia, y ventanilla de consulta por documento. Uso interno: requiere usuario y contraseña.',
    tema: 'Fondos y becas',
    url: '/tableros/fondos-2026',
    enlaces: [
      { texto: 'Tablero', url: '/tableros/fondos-2026' },
      { texto: 'Ventanilla de consulta', url: '/tableros/fondos-2026/ventanilla' },
    ],
  },
]
