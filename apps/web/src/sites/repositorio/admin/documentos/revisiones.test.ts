import { describe, expect, it } from 'vitest'
import { LIMITES_REPOSITORIO } from '../../api-repositorio'
import { claveNormalizada, extensionDeTipo, tamanoLegible, tipoPermitido } from '../datos/formatos'
import { MAX_BYTES_IMAGEN_ORIGEN, revisarArchivo, revisarImagen } from './revisiones'

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

describe('tipo de archivo permitido (antes de subir)', () => {
  it('acepta PDF, PNG, JPEG, DOCX y PPTX por su tipo', () => {
    expect(tipoPermitido({ name: 'a.pdf', type: 'application/pdf' })).toBe('application/pdf')
    expect(tipoPermitido({ name: 'a.PNG', type: 'image/png' })).toBe('image/png')
    expect(tipoPermitido({ name: 'a.jpg', type: 'image/jpg' })).toBe('image/jpeg')
    expect(tipoPermitido({ name: 'a.docx', type: DOCX })).toBe(DOCX)
  })

  it('sin tipo declarado (algunos sistemas con DOCX/PPTX), decide la extensión', () => {
    expect(tipoPermitido({ name: 'informe.docx', type: '' })).toBe(DOCX)
    expect(tipoPermitido({ name: 'informe.pptx', type: 'application/octet-stream' })).toMatch(/presentationml/)
    expect(tipoPermitido({ name: 'sin-extension', type: '' })).toBeNull()
  })

  it('rechaza otros tipos y un tipo que contradice la extensión', () => {
    expect(tipoPermitido({ name: 'virus.exe', type: 'application/x-msdownload' })).toBeNull()
    expect(tipoPermitido({ name: 'hoja.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })).toBeNull()
    expect(tipoPermitido({ name: 'foto.webp', type: 'image/webp' })).toBeNull()
    expect(tipoPermitido({ name: 'falso.pdf', type: 'image/png' })).toBeNull()
  })

  it('extensión canónica de cada tipo', () => {
    expect(extensionDeTipo('image/jpeg')).toBe('jpg')
    expect(extensionDeTipo('application/pdf')).toBe('pdf')
    expect(extensionDeTipo('otra/cosa')).toBe('bin')
  })
})

describe('revisarArchivo', () => {
  it('explica por qué no se acepta un tipo', () => {
    expect(revisarArchivo({ name: 'notas.txt', type: 'text/plain', size: 10 })).toBe(
      '«notas.txt» no es un tipo permitido. Se aceptan PDF, PNG, JPEG, DOCX y PPTX.',
    )
  })

  it('rechaza archivos vacíos y de más de 80 MB', () => {
    expect(revisarArchivo({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toMatch(/está vacío/)
    expect(revisarArchivo({ name: 'a.pdf', type: 'application/pdf', size: LIMITES_REPOSITORIO.maxBytesArchivo + 1 })).toMatch(
      /el máximo es 80 MB/,
    )
    expect(revisarArchivo({ name: 'a.pdf', type: 'application/pdf', size: LIMITES_REPOSITORIO.maxBytesArchivo })).toBeNull()
  })

  it('imágenes para la portada: JPEG, PNG o WebP de hasta 25 MB', () => {
    expect(revisarImagen({ name: 'p.webp', type: 'image/webp', size: 100 })).toBeNull()
    expect(revisarImagen({ name: 'p.gif', type: 'image/gif', size: 100 })).toMatch(/no es una imagen JPEG, PNG o WebP/)
    expect(revisarImagen({ name: 'p.png', type: 'image/png', size: MAX_BYTES_IMAGEN_ORIGEN + 1 })).toMatch(/máximo es 25 MB/)
  })
})

describe('formatos', () => {
  it('tamaños legibles en español', () => {
    expect(tamanoLegible(512)).toBe('512 bytes')
    expect(tamanoLegible(1536)).toBe('1,5 kB')
    expect(tamanoLegible(1423850)).toBe('1,4 MB')
  })

  it('clave de comparación de palabras clave igual que el servidor', () => {
    expect(claveNormalizada('  Educación   Superior ')).toBe('educacion superior')
    expect(claveNormalizada('Niñez')).toBe('ninez')
  })
})
