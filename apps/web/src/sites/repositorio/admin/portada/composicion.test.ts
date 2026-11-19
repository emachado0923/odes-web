import { describe, expect, it } from 'vitest'
import {
  ALTO_MAXIMO,
  LADO_MINIATURA,
  LADO_PORTADA,
  MAX_PIXELES_LIENZO,
  ajustarCuadrada,
  componerPortada,
  crearImagen,
  desenfocar,
  disposicionPortada,
  escalaRender,
  esCuadrada,
  limpiarBordes,
  mezclar,
  miniaturaDe,
  radioCaja,
  redimensionar,
  redondearPython,
  type Imagen,
} from './composicion'

/** Página sintética determinista (la misma que genera la referencia con Pillow). */
function sintetica(ancho: number, alto: number, borde = false): Imagen {
  const img = crearImagen(ancho, alto)
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      const i = (y * ancho + x) * 4
      const oscuro = borde && y < 2
      img.datos[i] = oscuro ? 10 : 180 + ((x * 5 + y * 3) % 76)
      img.datos[i + 1] = oscuro ? 10 : 150 + ((x * 3 + y * 7) % 106)
      img.datos[i + 2] = oscuro ? 10 : 120 + ((x + y * 11) % 136)
    }
  }
  return img
}

function rgb(img: Imagen, x: number, y: number): number[] {
  const i = (y * img.ancho + x) * 4
  return [img.datos[i], img.datos[i + 1], img.datos[i + 2]]
}

/** sha256 (hex) de los píxeles RGB, como Image.tobytes() de Pillow. */
async function huella(img: Imagen): Promise<string> {
  const rgbPlano = new Uint8Array(img.ancho * img.alto * 3)
  for (let p = 0; p < img.ancho * img.alto; p++) {
    rgbPlano[p * 3] = img.datos[p * 4]
    rgbPlano[p * 3 + 1] = img.datos[p * 4 + 1]
    rgbPlano[p * 3 + 2] = img.datos[p * 4 + 2]
  }
  const resumen = new Uint8Array(await crypto.subtle.digest('SHA-256', rgbPlano))
  return [...resumen].map((b) => b.toString(16).padStart(2, '0')).join('')
}

describe('disposición de la portada (reglas del LEEME del paquete)', () => {
  it('centra la página entera con un margen del 6 % (caja de 634 px en 720)', () => {
    // A4 a 1400 px de ancho (como rasteriza el paquete).
    const d = disposicionPortada(1400, 1980)
    expect(d.recortada).toBe(false)
    expect(d.pagina.alto).toBe(634)
    expect(d.pagina.ancho).toBe(448)
    expect(d.pagina.y).toBe(43)
    expect(d.pagina.x).toBe(136)
    // Margen: 6 % de 720 = 43,2 px arriba y abajo; centrada a lo ancho.
    expect(d.pagina.x * 2 + d.pagina.ancho).toBe(LADO_PORTADA)
    expect(LADO_PORTADA - d.pagina.y - d.pagina.alto).toBe(43)
  })

  it('una página apaisada ocupa el ancho de la caja y queda centrada en vertical', () => {
    const d = disposicionPortada(1600, 900)
    expect(d.pagina).toEqual({ x: 43, y: 181, ancho: 634, alto: 357 })
    expect(d.recortada).toBe(false)
  })

  it('las páginas de más de 1,42 de alto por 1 de ancho se recortan desde arriba', () => {
    const d = disposicionPortada(1000, 3000)
    expect(d.recortada).toBe(true)
    expect(d.altoUtil).toBe(Math.trunc(1000 * ALTO_MAXIMO))
    expect(d.pagina.alto).toBe(634)
    // Justo en el límite no se recorta.
    expect(disposicionPortada(100, 142).recortada).toBe(false)
    expect(disposicionPortada(100, 143).recortada).toBe(true)
  })

  it('el fondo es la misma página ampliada hasta cubrir el cuadrado, recortada al centro', () => {
    const d = disposicionPortada(1400, 1980)
    expect(d.fondo.ancho).toBe(720)
    expect(d.fondo.alto).toBe(1018)
    expect(d.fondo.x).toBe(0)
    expect(d.fondo.y).toBe(149)
  })

  it('la sombra va 2 px adentro a los lados y 8 px más abajo (antes de desenfocarla)', () => {
    const d = disposicionPortada(1400, 1980)
    expect(d.sombra).toEqual({ x0: 138, y0: 51, x1: 582, y1: 683 })
  })

  it('rechaza una página sin tamaño', () => {
    expect(() => disposicionPortada(0, 100)).toThrow(RangeError)
  })
})

describe('redondeos y radios iguales a Python/Pillow', () => {
  it('round() de Python redondea al par en ,5', () => {
    expect(redondearPython(0.5)).toBe(0)
    expect(redondearPython(1.5)).toBe(2)
    expect(redondearPython(2.5)).toBe(2)
    expect(redondearPython(633.6)).toBe(634)
    expect(redondearPython(447.4)).toBe(447)
  })

  it('radio de la caja equivalente al gaussiano de 36 px (3 pasadas)', () => {
    expect(radioCaja(36)).toBeCloseTo(35.5, 0)
    expect(radioCaja(0)).toBe(0)
  })

  it('escala de render: 1400 px de ancho, con un tope de píxeles para páginas enormes', () => {
    expect(escalaRender(595, 842) * 595).toBeCloseTo(1400)
    const e = escalaRender(14400, 14400)
    expect(14400 * e * 14400 * e).toBeLessThanOrEqual(MAX_PIXELES_LIENZO + 1)
  })
})

describe('operaciones de imagen', () => {
  it('redimensionar y desenfocar una imagen de un solo color la dejan igual', () => {
    const lisa = crearImagen(40, 30, [120, 200, 33])
    for (const filtro of ['bilineal', 'lanczos'] as const) {
      const r = redimensionar(lisa, 17, 61, filtro)
      expect(r.ancho).toBe(17)
      expect(r.alto).toBe(61)
      expect(rgb(r, 8, 30)).toEqual([120, 200, 33])
    }
    expect(rgb(desenfocar(lisa, 36), 20, 15)).toEqual([120, 200, 33])
  })

  it('mezclar al 45 % con #f7f7f7 (Image.blend)', () => {
    const r = mezclar(crearImagen(1, 1, [0, 100, 247]), [247, 247, 247], 0.45)
    expect(rgb(r, 0, 0)).toEqual([111, 166, 247])
  })

  it('quita líneas oscuras finas del borde, pero no una franja de color del diseño', () => {
    const conLinea = limpiarBordes(sintetica(100, 140, true))
    expect(conLinea.corte).toEqual({ arriba: 2, abajo: 0, izq: 0, der: 0 })
    expect(conLinea.imagen.alto).toBe(138)

    // Franja oscura gruesa (10 px): es parte del diseño y se conserva.
    const franja = sintetica(100, 140)
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 100; x++) franja.datos.set([20, 20, 60], (y * 100 + x) * 4)
    }
    expect(limpiarBordes(franja).corte).toEqual({ arriba: 0, abajo: 0, izq: 0, der: 0 })
  })

  it('una imagen cuadrada se usa tal cual, solo llevada a 720 px; la miniatura mide 192 px', () => {
    const cuadrada = crearImagen(1000, 1000, [10, 20, 30])
    expect(esCuadrada(cuadrada)).toBe(true)
    expect(esCuadrada(crearImagen(1000, 999))).toBe(false)
    const p = ajustarCuadrada(cuadrada)
    expect([p.ancho, p.alto]).toEqual([LADO_PORTADA, LADO_PORTADA])
    const m = miniaturaDe(p)
    expect([m.ancho, m.alto]).toEqual([LADO_MINIATURA, LADO_MINIATURA])
    expect(rgb(m, 96, 96)).toEqual([10, 20, 30])
  })
})

describe('portada completa: mismos píxeles que Pillow (portada.py del paquete)', () => {
  // Huellas calculadas con Pillow 11.3 aplicando portada.py (sin el JPEG) a las
  // mismas páginas sintéticas.
  const casos = [
    {
      nombre: 'vertical (90 × 120)',
      pagina: () => sintetica(90, 120),
      sha256: '22c08b9a7b37fb663283df6de29ab2957f826a47cbac53b1cb1ed30081c2fc83',
      rect: { x: 122, y: 43, ancho: 476, alto: 634 },
      centro: [202, 171, 143],
      esquina: [236, 216, 206],
    },
    {
      nombre: 'muy alta (60 × 120, recortada)',
      pagina: () => sintetica(60, 120),
      sha256: 'c13953f462cd7ea0145f056af0fdbc00ac19f16e7e97b06f6ad879c142a5eef9',
      rect: { x: 136, y: 43, ancho: 448, alto: 634 },
      centro: [226, 215, 205],
      esquina: [236, 230, 209],
    },
    {
      nombre: 'apaisada (160 × 90)',
      pagina: () => sintetica(160, 90),
      sha256: 'ebae1b334288da6c22dacb79dc771594d9c328b992368d543daa3d67da603852',
      rect: { x: 43, y: 181, ancho: 634, alto: 357 },
      centro: [208, 172, 149],
      esquina: [231, 214, 210],
    },
    {
      nombre: 'con línea oscura arriba (100 × 140)',
      pagina: () => sintetica(100, 140, true),
      sha256: '637a71880abaab1806d7ef39be2fb5291f84c92a545c7fdc2fd28ef050159a84',
      rect: { x: 130, y: 43, ancho: 459, alto: 634 },
      centro: [188, 144, 118],
      esquina: [230, 226, 220],
    },
  ]

  it.each(casos)('$nombre', async (c) => {
    const r = componerPortada(c.pagina())
    expect([r.imagen.ancho, r.imagen.alto]).toEqual([720, 720])
    expect(r.disposicion.pagina).toEqual(c.rect)
    expect(rgb(r.imagen, 360, 360)).toEqual(c.centro)
    expect(rgb(r.imagen, 5, 5)).toEqual(c.esquina)
    expect(await huella(r.imagen)).toBe(c.sha256)
  })
})
