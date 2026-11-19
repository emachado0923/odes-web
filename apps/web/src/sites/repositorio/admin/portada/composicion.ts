/**
 * Composición de las portadas (720 × 720), igual que las 372 del paquete
 * (Septiembre/observatorio/repositorio-datos, LEEME.md, "Portadas"):
 *
 * - La primera página completa, centrada con un margen del 6 % y una sombra.
 * - El fondo es la misma página ampliada hasta cubrir el cuadrado,
 *   desenfocada (gaussiano de 36 px) y mezclada al 45 % con #f7f7f7.
 * - Las páginas muy altas (más de 1,42 de alto por 1 de ancho) se recortan
 *   desde arriba.
 * - Antes se quitan las líneas oscuras finas (1–3 px) de los bordes, si
 *   contrastan con lo que sigue.
 *
 * Es un port exacto del script con el que se hicieron (Pillow: portada.py),
 * con los mismos algoritmos de Pillow para redimensionar (bilineal y Lanczos
 * con antialias), desenfocar (caja extendida de 3 pasadas), mezclar y pegar
 * con máscara, y el redondeo de Python. Con la misma página de entrada da los
 * mismos píxeles que Pillow; la diferencia que queda es la del rasterizador
 * del PDF (pdf.js en el navegador; el paquete usó poppler a 1400 px de ancho).
 *
 * TypeScript puro, sin DOM: las imágenes son RGBA en un Uint8ClampedArray
 * (la forma de ImageData). El canal alfa se ignora y sale en 255.
 */

export const LADO_PORTADA = 720
export const LADO_MINIATURA = 192
/** Margen alrededor de la página, en fracción del lado. */
export const MARGEN = 0.06
/** Más alto que esto (alto / ancho) se recorta desde arriba. */
export const ALTO_MAXIMO = 1.42
export const DESENFOQUE_FONDO = 36
export const MEZCLA_FONDO = 0.45
export const GRIS_FONDO = [247, 247, 247] as const
export const COLOR_SOMBRA = [20, 20, 30] as const
export const OPACIDAD_SOMBRA = 110
export const DESENFOQUE_SOMBRA = 12
/** Ancho al que se rasteriza la primera página del PDF (como el paquete). */
export const ANCHO_RENDER = 1400
export const CALIDAD_JPEG = 0.8
export const CALIDAD_MINIATURA = 0.7

export interface Imagen {
  ancho: number
  alto: number
  /** RGBA, 4 bytes por píxel. */
  datos: Uint8ClampedArray<ArrayBuffer>
}

export interface Rect {
  x: number
  y: number
  ancho: number
  alto: number
}

export interface Corte {
  arriba: number
  abajo: number
  izq: number
  der: number
}

export function crearImagen(ancho: number, alto: number, color: readonly number[] = [0, 0, 0]): Imagen {
  const datos = new Uint8ClampedArray(ancho * alto * 4)
  for (let i = 0; i < datos.length; i += 4) {
    datos[i] = color[0]
    datos[i + 1] = color[1]
    datos[i + 2] = color[2]
    datos[i + 3] = 255
  }
  return { ancho, alto, datos }
}

// ── Redondeos de Python ─────────────────────────────────────────────────────

/** round() de Python 3: al par más cercano cuando queda justo en ,5. */
export function redondearPython(x: number): number {
  const piso = Math.floor(x)
  const resto = x - piso
  if (resto > 0.5) return piso + 1
  if (resto < 0.5) return piso
  return piso % 2 === 0 ? piso : piso + 1
}

// ── Disposición (geometría pura) ────────────────────────────────────────────

export interface Disposicion {
  /** Alto de la página después de la regla de 1,42 (el ancho no cambia). */
  altoUtil: number
  /** true si la página se recortó desde arriba. */
  recortada: boolean
  /** Tamaño de la página ampliada para el fondo y recorte centrado de LADO × LADO. */
  fondo: { ancho: number; alto: number; x: number; y: number }
  /** Página reducida y su posición en el cuadrado. */
  pagina: Rect
  /** Rectángulo de la sombra (inclusivo, como ImageDraw.rectangle) antes de desenfocarla. */
  sombra: { x0: number; y0: number; x1: number; y1: number }
}

/**
 * Medidas de la portada para una página de `ancho` × `alto` píxeles (ya sin
 * los bordes oscuros). Mismo cálculo que portada.py.
 */
export function disposicionPortada(ancho: number, alto: number, lado = LADO_PORTADA): Disposicion {
  if (!(ancho > 0 && alto > 0)) throw new RangeError('La página no tiene tamaño.')
  let altoUtil = alto
  let recortada = false
  if (alto / ancho > ALTO_MAXIMO) {
    altoUtil = Math.trunc(ancho * ALTO_MAXIMO)
    recortada = true
  }
  const w = ancho
  const h = altoUtil
  const eFondo = Math.max(lado / w, lado / h)
  const fondoAncho = Math.max(lado, redondearPython(w * eFondo))
  const fondoAlto = Math.max(lado, redondearPython(h * eFondo))
  const caja = redondearPython(lado * (1 - 2 * MARGEN))
  const ePagina = Math.min(caja / w, caja / h)
  const pw = redondearPython(w * ePagina)
  const ph = redondearPython(h * ePagina)
  const x = Math.floor((lado - pw) / 2)
  const y = Math.floor((lado - ph) / 2)
  return {
    altoUtil,
    recortada,
    fondo: {
      ancho: fondoAncho,
      alto: fondoAlto,
      x: Math.floor((fondoAncho - lado) / 2),
      y: Math.floor((fondoAlto - lado) / 2),
    },
    pagina: { x, y, ancho: pw, alto: ph },
    sombra: { x0: x + 2, y0: y + 8, x1: x + pw - 2, y1: y + ph + 6 },
  }
}

// ── Recortes y bordes ───────────────────────────────────────────────────────

export function recortar(img: Imagen, x0: number, y0: number, x1: number, y1: number): Imagen {
  const ancho = x1 - x0
  const alto = y1 - y0
  const datos = new Uint8ClampedArray(ancho * alto * 4)
  for (let y = 0; y < alto; y++) {
    const desde = ((y + y0) * img.ancho + x0) * 4
    datos.set(img.datos.subarray(desde, desde + ancho * 4), y * ancho * 4)
  }
  return { ancho, alto, datos }
}

function luminancia(d: Uint8ClampedArray, i: number): number {
  return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
}

type Lado = 'arriba' | 'abajo' | 'izq' | 'der'

/** Media y desviación de la luminancia de la línea `i` contada desde el borde `lado`. */
function linea(img: Imagen, i: number, lado: Lado): [number, number] {
  const { ancho: w, alto: h, datos } = img
  const ls: number[] = []
  if (lado === 'arriba' || lado === 'abajo') {
    const y = lado === 'arriba' ? i : h - 1 - i
    for (let x = 0; x < w; x += Math.max(1, Math.floor(w / 160))) ls.push(luminancia(datos, (y * w + x) * 4))
  } else {
    const x = lado === 'izq' ? i : w - 1 - i
    for (let y = 0; y < h; y += Math.max(1, Math.floor(h / 160))) ls.push(luminancia(datos, (y * w + x) * 4))
  }
  let suma = 0
  for (const l of ls) suma += l
  const media = suma / ls.length
  let cuadrados = 0
  for (const l of ls) cuadrados += (l - media) ** 2
  return [media, Math.sqrt(cuadrados / ls.length)]
}

/**
 * Quita líneas oscuras finas (1–3 px) en los bordes, solo si contrastan con
 * lo que sigue: una franja de color del diseño (un encabezado) no se toca.
 */
export function limpiarBordes(img: Imagen, maximo = 3): { imagen: Imagen; corte: Corte } {
  const corte: Corte = { arriba: 0, abajo: 0, izq: 0, der: 0 }
  for (const lado of ['arriba', 'abajo', 'izq', 'der'] as const) {
    let n = 0
    while (n < maximo + 1) {
      const [m, de] = linea(img, n, lado)
      if (de < 8 && m < 70) n += 1
      else break
    }
    const [siguiente] = linea(img, n, lado)
    corte[lado] = n > 0 && n <= maximo && siguiente - linea(img, 0, lado)[0] > 30 ? n : 0
  }
  if (corte.arriba || corte.abajo || corte.izq || corte.der) {
    const imagen = recortar(img, corte.izq, corte.arriba, img.ancho - corte.der, img.alto - corte.abajo)
    return { imagen, corte }
  }
  return { imagen: img, corte }
}

// ── Redimensionar (Pillow: Resample.c, 8 bits) ──────────────────────────────

export type Filtro = 'bilineal' | 'lanczos'

const SOPORTE: Record<Filtro, number> = { bilineal: 1, lanczos: 3 }

function sinc(x: number): number {
  if (x === 0) return 1
  const px = x * Math.PI
  return Math.sin(px) / px
}

function nucleo(filtro: Filtro, x: number): number {
  if (filtro === 'bilineal') {
    const a = x < 0 ? -x : x
    return a < 1 ? 1 - a : 0
  }
  return -3 <= x && x < 3 ? sinc(x) * sinc(x / 3) : 0
}

const BITS = 22
const UNO = 2 ** BITS

interface Coeficientes {
  tam: number
  /** Para cada salida: [inicio, cantidad]. */
  limites: Int32Array
  /** Coeficientes en punto fijo (BITS). */
  k: Int32Array
}

function coeficientes(entrada: number, salida: number, filtro: Filtro): Coeficientes {
  const escala = entrada / salida
  const escalaFiltro = Math.max(1, escala)
  const soporte = SOPORTE[filtro] * escalaFiltro
  const tam = Math.ceil(soporte) * 2 + 1
  const limites = new Int32Array(salida * 2)
  const k = new Int32Array(salida * tam)
  const pesos = new Float64Array(tam)
  for (let xx = 0; xx < salida; xx++) {
    const centro = (xx + 0.5) * escala
    const ss = 1 / escalaFiltro
    let xmin = Math.trunc(centro - soporte + 0.5)
    if (xmin < 0) xmin = 0
    let xmax = Math.trunc(centro + soporte + 0.5)
    if (xmax > entrada) xmax = entrada
    xmax -= xmin
    let total = 0
    for (let x = 0; x < xmax; x++) {
      const w = nucleo(filtro, (x + xmin - centro + 0.5) * ss)
      pesos[x] = w
      total += w
    }
    for (let x = 0; x < xmax; x++) {
      const w = total !== 0 ? pesos[x] / total : pesos[x]
      k[xx * tam + x] = w < 0 ? Math.trunc(-0.5 + w * UNO) : Math.trunc(0.5 + w * UNO)
    }
    limites[xx * 2] = xmin
    limites[xx * 2 + 1] = xmax
  }
  return { tam, limites, k }
}

function recorte8(v: number): number {
  if (v >= UNO * 256) return 255
  if (v <= 0) return 0
  return Math.floor(v / UNO)
}

/** Image.resize((ancho, alto), BILINEAR | LANCZOS) de Pillow. */
export function redimensionar(img: Imagen, ancho: number, alto: number, filtro: Filtro): Imagen {
  if (ancho === img.ancho && alto === img.alto) {
    return { ancho, alto, datos: new Uint8ClampedArray(img.datos) }
  }
  const horizontal = ancho !== img.ancho
  const vertical = alto !== img.alto
  const ch = coeficientes(img.ancho, ancho, filtro)
  const cv = coeficientes(img.alto, alto, filtro)
  const primera = cv.limites[0]
  const ultima = cv.limites[alto * 2 - 2] + cv.limites[alto * 2 - 1]
  let actual = img
  let desplazamiento = 0
  if (horizontal) {
    const filas = ultima - primera
    const datos = new Uint8ClampedArray(ancho * filas * 4)
    const fuente = img.datos
    for (let yy = 0; yy < filas; yy++) {
      const base = (yy + primera) * img.ancho * 4
      for (let xx = 0; xx < ancho; xx++) {
        const xmin = ch.limites[xx * 2]
        const xmax = ch.limites[xx * 2 + 1]
        const kb = xx * ch.tam
        let s0 = UNO / 2
        let s1 = UNO / 2
        let s2 = UNO / 2
        for (let x = 0; x < xmax; x++) {
          const kv = ch.k[kb + x]
          const i = base + (x + xmin) * 4
          s0 += fuente[i] * kv
          s1 += fuente[i + 1] * kv
          s2 += fuente[i + 2] * kv
        }
        const o = (yy * ancho + xx) * 4
        datos[o] = recorte8(s0)
        datos[o + 1] = recorte8(s1)
        datos[o + 2] = recorte8(s2)
        datos[o + 3] = 255
      }
    }
    actual = { ancho, alto: filas, datos }
    desplazamiento = primera
  }
  if (!vertical) {
    return horizontal ? actual : { ancho, alto, datos: new Uint8ClampedArray(img.datos) }
  }
  const datos = new Uint8ClampedArray(actual.ancho * alto * 4)
  const fuente = actual.datos
  const anchoFuente = actual.ancho
  // Si no hubo pasada horizontal, las filas se cuentan desde 0 (sin desplazar).
  const resta = horizontal ? desplazamiento : 0
  for (let yy = 0; yy < alto; yy++) {
    const ymin = cv.limites[yy * 2] - resta
    const ymax = cv.limites[yy * 2 + 1]
    const kb = yy * cv.tam
    for (let xx = 0; xx < anchoFuente; xx++) {
      let s0 = UNO / 2
      let s1 = UNO / 2
      let s2 = UNO / 2
      for (let y = 0; y < ymax; y++) {
        const kv = cv.k[kb + y]
        const i = ((y + ymin) * anchoFuente + xx) * 4
        s0 += fuente[i] * kv
        s1 += fuente[i + 1] * kv
        s2 += fuente[i + 2] * kv
      }
      const o = (yy * anchoFuente + xx) * 4
      datos[o] = recorte8(s0)
      datos[o + 1] = recorte8(s1)
      datos[o + 2] = recorte8(s2)
      datos[o + 3] = 255
    }
  }
  return { ancho: anchoFuente, alto, datos }
}

// ── Desenfoque gaussiano (Pillow: BoxBlur.c, 3 pasadas) ─────────────────────

const f32 = Math.fround

/** Radio de la caja equivalente a un gaussiano de desviación `radio` en `pasadas` pasadas (en float, como Pillow). */
export function radioCaja(radio: number, pasadas = 3): number {
  const r = f32(radio)
  const sigma2 = f32(f32(r * r) / pasadas)
  const L = f32(Math.sqrt(12.0 * sigma2 + 1.0))
  const l = f32(Math.floor((L - 1.0) / 2.0))
  let a = f32(f32(f32(2 * l) + 1) * f32(f32(l * f32(l + 1)) - f32(3 * sigma2)))
  a = f32(a / f32(6 * f32(sigma2 - f32(f32(l + 1) * f32(l + 1)))))
  return f32(l + a)
}

/**
 * Una pasada de caja sobre una línea (ImagingLineBoxBlur8): `entrada` y
 * `salida` con `paso` entre muestras y `n` muestras. Bordes extendidos.
 */
function lineaCaja(
  entrada: Float64Array,
  salida: Float64Array,
  n: number,
  radio: number,
  ww: number,
  fw: number,
): void {
  const ultimo = n - 1
  const bordeA = Math.min(radio + 1, n)
  const bordeB = Math.max(n - radio - 1, 0)
  let acc = entrada[0] * (radio + 1)
  for (let x = 0; x < bordeA - 1; x++) acc += entrada[x]
  acc += entrada[ultimo] * (radio - bordeA + 1)
  const guardar = (x: number, bulk: number) => {
    salida[x] = Math.floor((bulk + 8388608) / 16777216)
  }
  if (bordeA <= bordeB) {
    for (let x = 0; x < bordeA; x++) {
      acc += entrada[x + radio] - entrada[0]
      guardar(x, acc * ww + (entrada[0] + entrada[x + radio + 1]) * fw)
    }
    for (let x = bordeA; x < bordeB; x++) {
      acc += entrada[x + radio] - entrada[x - radio - 1]
      guardar(x, acc * ww + (entrada[x - radio - 1] + entrada[x + radio + 1]) * fw)
    }
    for (let x = bordeB; x <= ultimo; x++) {
      acc += entrada[ultimo] - entrada[x - radio - 1]
      guardar(x, acc * ww + (entrada[x - radio - 1] + entrada[ultimo]) * fw)
    }
  } else {
    for (let x = 0; x < bordeB; x++) {
      acc += entrada[x + radio] - entrada[0]
      guardar(x, acc * ww + (entrada[0] + entrada[x + radio + 1]) * fw)
    }
    for (let x = bordeB; x < bordeA; x++) {
      acc += entrada[ultimo] - entrada[0]
      guardar(x, acc * ww + (entrada[0] + entrada[ultimo]) * fw)
    }
    for (let x = bordeA; x <= ultimo; x++) {
      acc += entrada[ultimo] - entrada[x - radio - 1]
      guardar(x, acc * ww + (entrada[x - radio - 1] + entrada[ultimo]) * fw)
    }
  }
}

/**
 * Desenfoque gaussiano de Pillow (ImageFilter.GaussianBlur(radio)) sobre
 * `canales` canales intercalados cada `paso` bytes: 3 pasadas horizontales y
 * luego 3 verticales, cada una redondeada a 8 bits.
 */
function desenfocarCanales(
  datos: Uint8ClampedArray | Uint8Array,
  ancho: number,
  alto: number,
  paso: number,
  canales: number,
  radio: number,
  pasadas = 3,
): void {
  const radioF = radioCaja(radio, pasadas)
  const entero = Math.trunc(radioF)
  const ww = Math.trunc(f32(16777216 / f32(f32(radioF * 2) + 1)))
  const fw = Math.floor((16777216 - (entero * 2 + 1) * ww) / 2)
  const largo = Math.max(ancho, alto)
  let a = new Float64Array(largo)
  let b = new Float64Array(largo)
  for (let c = 0; c < canales; c++) {
    for (let y = 0; y < alto; y++) {
      const base = y * ancho * paso + c
      for (let x = 0; x < ancho; x++) a[x] = datos[base + x * paso]
      for (let p = 0; p < pasadas; p++) {
        lineaCaja(a, b, ancho, entero, ww, fw)
        ;[a, b] = [b, a]
      }
      for (let x = 0; x < ancho; x++) datos[base + x * paso] = a[x]
    }
    for (let x = 0; x < ancho; x++) {
      const base = x * paso + c
      for (let y = 0; y < alto; y++) a[y] = datos[base + y * ancho * paso]
      for (let p = 0; p < pasadas; p++) {
        lineaCaja(a, b, alto, entero, ww, fw)
        ;[a, b] = [b, a]
      }
      for (let y = 0; y < alto; y++) datos[base + y * ancho * paso] = a[y]
    }
  }
}

/** Copia desenfocada de una imagen RGB(A). */
export function desenfocar(img: Imagen, radio: number): Imagen {
  const datos = new Uint8ClampedArray(img.datos)
  if (radio > 0) desenfocarCanales(datos, img.ancho, img.alto, 4, 3, radio)
  return { ancho: img.ancho, alto: img.alto, datos }
}

/** Máscara de un canal (modo "L" de Pillow). */
export interface Mascara {
  ancho: number
  alto: number
  datos: Uint8Array
}

export function desenfocarMascara(m: Mascara, radio: number): Mascara {
  const datos = new Uint8Array(m.datos)
  if (radio > 0) desenfocarCanales(datos, m.ancho, m.alto, 1, 1, radio)
  return { ancho: m.ancho, alto: m.alto, datos }
}

// ── Mezclar y pegar ─────────────────────────────────────────────────────────

/** Image.blend(img, color sólido, alfa) de Pillow (en float y truncado, como en C). */
export function mezclar(img: Imagen, color: readonly number[], alfa: number): Imagen {
  const datos = new Uint8ClampedArray(img.datos.length)
  const a = f32(alfa)
  for (let i = 0; i < datos.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = img.datos[i + c]
      datos[i + c] = Math.trunc(f32(v + f32(a * (color[c] - v))))
    }
    datos[i + 3] = 255
  }
  return { ancho: img.ancho, alto: img.alto, datos }
}

/** fondo.paste(color sólido, (0, 0), máscara) de Pillow, en sitio. */
export function pegarColorConMascara(img: Imagen, color: readonly number[], m: Mascara): void {
  const d = img.datos
  for (let p = 0, i = 0; p < m.datos.length; p++, i += 4) {
    const mk = m.datos[p]
    if (!mk) continue
    for (let c = 0; c < 3; c++) {
      const t = d[i + c] * (255 - mk) + color[c] * mk + 128
      d[i + c] = ((t >> 8) + t) >> 8
    }
  }
}

/** Pega `otra` en (x, y), sin mezcla. */
export function pegar(img: Imagen, otra: Imagen, x: number, y: number): void {
  for (let fila = 0; fila < otra.alto; fila++) {
    const desde = fila * otra.ancho * 4
    img.datos.set(otra.datos.subarray(desde, desde + otra.ancho * 4), ((fila + y) * img.ancho + x) * 4)
  }
}

/** Rectángulo relleno inclusivo (ImageDraw.rectangle) en una máscara. */
function rectanguloMascara(m: Mascara, r: Disposicion['sombra'], valor: number): void {
  const x0 = Math.max(0, r.x0)
  const y0 = Math.max(0, r.y0)
  const x1 = Math.min(m.ancho - 1, r.x1)
  const y1 = Math.min(m.alto - 1, r.y1)
  for (let y = y0; y <= y1; y++) m.datos.fill(valor, y * m.ancho + x0, y * m.ancho + x1 + 1)
}

// ── Portada completa ────────────────────────────────────────────────────────

export interface ResultadoPortada {
  imagen: Imagen
  corte: Corte
  disposicion: Disposicion
}

/** Compone la portada de 720 × 720 a partir de la imagen de la página (o de una imagen cualquiera). */
export function componerPortada(pagina: Imagen, lado = LADO_PORTADA): ResultadoPortada {
  const { imagen: limpia, corte } = limpiarBordes(pagina)
  const disposicion = disposicionPortada(limpia.ancho, limpia.alto, lado)
  const im = disposicion.recortada ? recortar(limpia, 0, 0, limpia.ancho, disposicion.altoUtil) : limpia
  const f = disposicion.fondo
  let fondo = redimensionar(im, f.ancho, f.alto, 'bilineal')
  fondo = recortar(fondo, f.x, f.y, f.x + lado, f.y + lado)
  fondo = desenfocar(fondo, DESENFOQUE_FONDO)
  fondo = mezclar(fondo, GRIS_FONDO, MEZCLA_FONDO)
  const p = disposicion.pagina
  const reducida = redimensionar(im, p.ancho, p.alto, 'lanczos')
  let sombra: Mascara = { ancho: lado, alto: lado, datos: new Uint8Array(lado * lado) }
  rectanguloMascara(sombra, disposicion.sombra, OPACIDAD_SOMBRA)
  sombra = desenfocarMascara(sombra, DESENFOQUE_SOMBRA)
  pegarColorConMascara(fondo, COLOR_SOMBRA, sombra)
  pegar(fondo, reducida, p.x, p.y)
  return { imagen: fondo, corte, disposicion }
}

/** true si la imagen ya es cuadrada (se usa tal cual, solo ajustada a 720 px). */
export function esCuadrada(img: Pick<Imagen, 'ancho' | 'alto'>): boolean {
  return img.ancho === img.alto
}

/** Imagen cuadrada llevada a lado × lado (Lanczos). */
export function ajustarCuadrada(img: Imagen, lado = LADO_PORTADA): Imagen {
  return redimensionar(img, lado, lado, 'lanczos')
}

/** Miniatura de 192 × 192 a partir de la portada. */
export function miniaturaDe(portada: Imagen): Imagen {
  return redimensionar(portada, LADO_MINIATURA, LADO_MINIATURA, 'lanczos')
}

/**
 * Píxeles máximos de un lienzo: Safari (iPad incluido) no dibuja lienzos de
 * más de 16 777 216 px (4096 × 4096).
 */
export const MAX_PIXELES_LIENZO = 16_000_000

/**
 * Escala para rasterizar la página: 1400 px de ancho como el paquete, sin
 * pasar de `maxPixeles` en total (páginas enormes).
 */
export function escalaRender(anchoPts: number, altoPts: number, maxPixeles = MAX_PIXELES_LIENZO): number {
  let escala = ANCHO_RENDER / anchoPts
  const pixeles = anchoPts * escala * altoPts * escala
  if (pixeles > maxPixeles) escala *= Math.sqrt(maxPixeles / pixeles)
  return escala
}
