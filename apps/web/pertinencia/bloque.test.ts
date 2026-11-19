/**
 * Reglas del bloque de WordPress de /pertinencia (pertinencia-bloque.html).
 *
 * El bloque se pega tal cual en un elemento "Raw HTML" de WPBakery en
 * https://sapiencia.gov.co/metodologia_de_pertinencia/ (WordPress 5.9, tema
 * Jupiter), y /pertinencia lo muestra igual. Todo cambio de /pertinencia se
 * hace en el bloque, así que estas pruebas vigilan que siga funcionando allá:
 * cada regla viene de algo que pasó o que se comprobó en ese sitio (ver
 * LEEME.md y principal/bloque.test.ts, de donde salen).
 *
 * Cada regla es una función que devuelve sus hallazgos: se corre sobre el
 * bloque (no debe encontrar nada) y sobre copias del bloque con el error
 * metido a propósito (debe encontrarlo), para saber que la regla sí mira.
 */
import { describe, expect, it } from 'vitest'
import bloque from './pertinencia-bloque.html?raw'
import { moduloDelScript, scriptDelBloque } from './componer'

const RAIZ = 'odes-pertinencia'

function linea(texto: string, indice: number): number {
  return texto.slice(0, indice).split('\n').length
}

/** Cada coincidencia de `patron` como "línea N: texto". */
function hallazgos(texto: string, patron: RegExp): string[] {
  return [...texto.matchAll(patron)].map((coincidencia) => `línea ${linea(texto, coincidencia.index)}: ${coincidencia[0]}`)
}

function scriptsDe(html: string): { atributos: string; contenido: string }[] {
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map(([, atributos = '', contenido = '']) => ({
    atributos,
    contenido,
  }))
}

/** Selectores de las reglas de estilo (también dentro de @media y @container) y las at-rules de un CSS. */
function analizarCss(css: string): { selectores: string[]; arrobas: string[] } {
  const sinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const selectores: string[] = []
  const arrobas: string[] = []
  // Contexto de cada llave abierta: 'grupo' (@media, @container...), 'regla' u 'otra'.
  const pila: string[] = []
  let previo = ''
  for (let i = 0; i < sinComentarios.length; i++) {
    const caracter = sinComentarios.charAt(i)
    if (caracter === '"' || caracter === "'") {
      const cierre = sinComentarios.indexOf(caracter, i + 1)
      previo += sinComentarios.slice(i, cierre + 1)
      i = cierre
    } else if (caracter === '{') {
      const preludio = previo.trim()
      previo = ''
      const dentroDeRegla = pila.length > 0 && pila.at(-1) !== 'grupo'
      if (preludio.startsWith('@')) {
        arrobas.push(preludio)
        pila.push(/^@(media|supports|container|layer)\b/.test(preludio) ? 'grupo' : 'otra')
      } else {
        if (!dentroDeRegla) selectores.push(...separarSelectores(preludio))
        pila.push(dentroDeRegla ? 'otra' : 'regla')
      }
    } else if (caracter === '}') {
      pila.pop()
      previo = ''
    } else if (caracter === ';' && (pila.length === 0 || pila.at(-1) === 'grupo')) {
      if (previo.trim().startsWith('@')) arrobas.push(previo.trim())
      previo = ''
    } else {
      previo += caracter
    }
  }
  return { selectores, arrobas }
}

/** Separa "a, b:is(c, d)" en ["a", "b:is(c, d)"]: las comas entre paréntesis no cuentan. */
function separarSelectores(lista: string): string[] {
  const partes = ['']
  let profundidad = 0
  for (const caracter of lista) {
    if (caracter === '(') profundidad++
    if (caracter === ')') profundidad--
    if (caracter === ',' && profundidad === 0) partes.push('')
    else partes[partes.length - 1] += caracter
  }
  return partes.map((parte) => parte.trim().replace(/\s+/g, ' '))
}

const estilosDe = (html: string) => /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? ''
/** El bloque sin comentarios HTML (los comentarios pueden nombrar direcciones y ejemplos). */
const sinComentariosHtml = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '')
/** La plantilla de EDITAR ENLACES. */
const plantillaDe = (html: string) => /<template data-odes-enlaces>([\s\S]*?)<\/template>/.exec(html)?.[1] ?? ''
/** El contenido visible: la raíz del bloque, sin la plantilla, los estilos ni el script. */
const marcadoDe = (html: string) =>
  sinComentariosHtml(html)
    .replace(/<template\b[\s\S]*?<\/template>/g, '')
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<script\b[\s\S]*?<\/script>/g, '')

/* ---------- Las reglas ---------- */

/**
 * WPBakery pasa el HTML por do_shortcode: "[nombre]", "[nombre atributo" o "[nombre/" se ejecutarían si ese
 * shortcode existe en el sitio. Los índices de JavaScript van con espacios (lista[ i ]); [data-…] y [aria-…] no
 * chocan con ningún shortcode.
 */
const pareceShortcode = (html: string) => hallazgos(html, /\[(?!data-|aria-)[A-Za-z_][\w-]*(?=[\]\s/])/g)

/**
 * Todo selector va bajo #odes-pertinencia. La única excepción son las reglas del plugin de accesibilidad del sitio
 * (pojo), que dependen de una clase en el <body>: "body.pojo-a11y-… #odes-pertinencia…".
 */
const selectoresFueraDelBloque = (html: string) =>
  analizarCss(estilosDe(html)).selectores.filter(
    (selector) => !selector.startsWith(`#${RAIZ}`) && !new RegExp(`^body\\.pojo-a11y-[\\w-]+ #${RAIZ}(?![\\w-])`).test(selector),
  )

/** Nombres globales (keyframes, contenedores, propiedades personalizadas e ids) con el prefijo odes-. */
function nombresSinPrefijo(html: string): string[] {
  const css = estilosDe(html).replace(/\/\*[\s\S]*?\*\//g, '')
  const { arrobas } = analizarCss(css)
  return [
    ...arrobas.filter((a) => /^@(?:-webkit-)?keyframes\b/.test(a) && !/keyframes odes-/.test(a)),
    ...arrobas.filter((a) => /^@container\b/.test(a) && !/^@container odes-/.test(a)),
    ...[...css.matchAll(/container(?:-name)?\s*:\s*([\w-]+)/g)].map(([, n]) => n).filter((n) => !n.startsWith('odes-')),
    ...[...css.matchAll(/(?<![\w-])(--[\w-]+)/g)].map(([, n]) => n).filter((n) => !n.startsWith('--odes-')),
    ...[...html.matchAll(/\bid\s*=\s*"([^"]*)"/g)].map(([, id]) => id).filter((id) => !id.startsWith('odes-')),
  ]
}

/**
 * Nada de otros sitios: ni hojas, fuentes, scripts, imágenes ni marcos en el HTML (el tablero lo crea el script
 * con la dirección de EDITAR TABLERO). Las únicas direcciones http(s) permitidas son los enlaces de la plantilla de
 * EDITAR ENLACES y el espacio de nombres de SVG dentro de un data:; en comentarios se pueden nombrar otras.
 */
function cargasExternas(html: string): string[] {
  // La dirección del tablero (EDITAR TABLERO) es configuración: el script la pone en un marco solo si es http(s).
  const sinPlantilla = sinComentariosHtml(html)
    .replace(/<template data-odes-enlaces>[\s\S]*?<\/template>/, '')
    .replace(/data-odes-tablero-url="[^"]*"/g, 'data-odes-tablero-url=""')
  return [
    ...hallazgos(sinPlantilla, /<link\b|@import\b|<iframe\b|<img\b|\b(?:src|srcset|poster|data)\s*=\s*["']?(?:https?:)?\/\/|url\(\s*["']?(?:https?:)?\/\//gi),
    ...hallazgos(sinPlantilla.replaceAll("xmlns='http://www.w3.org/2000/svg'", ''), /https?:\/\/[^\s"'<>)]*/g),
  ]
}

/**
 * Lo que el CSS y los plugins del sitio alteran: .master-holder strong pinta de morado todo <strong>; "header nav"
 * lleva margin-left: 185px; remove_link_target quita los target (todo se abre en la misma pestaña, así que tampoco
 * van avisos de "pestaña nueva"); el bloque no usa Shadow DOM.
 */
const loQueElSitioAltera = (html: string) =>
  hallazgos(html, /<strong\b|<header\b|\btarget\s*=|attachShadow|pestaña nueva|_blank/gi)

/** Los enlaces visibles no traen dirección: la pone el script desde la plantilla de EDITAR ENLACES. */
function enlacesFueraDeLaPlantilla(html: string): string[] {
  const claves = [...plantillaDe(html).matchAll(/data-odes-enlace="([^"]+)"/g)].map(([, clave]) => clave)
  return [...marcadoDe(html).matchAll(/<a\b[^>]*>/g)]
    .map(([etiqueta]) => etiqueta)
    .filter((etiqueta) => {
      const clave = /data-odes-enlace="([^"]+)"/.exec(etiqueta)?.[1]
      return /\bhref\s*=/.test(etiqueta) || !clave || !claves.includes(clave)
    })
}

/** Los tamaños de letra van en --odes-fs (el !important del bloque le gana al "Aumentar texto" del plugin). */
const tamanosSueltos = (html: string) =>
  hallazgos(
    estilosDe(html)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(`#${RAIZ} *{--odes-fs:1em;font-size:var(--odes-fs)!important}`, '')
      .replace(new RegExp(`(?:body\\.pojo-a11y-resize-font-\\d+ )?#${RAIZ}\\{[^}]*\\}`, 'g'), (regla) =>
        regla.includes('--odes-marino') || regla.startsWith('body.') ? '' : regla,
      ),
    /font(?:-size)?\s*:[^;}]*/g,
  )

/** Caracteres que un editor o WordPress pueden quitar o cambiar sin que se note, y saltos de línea de Windows. */
const invisibles = (html: string) => hallazgos(html, /[\p{Cf}\p{Mn}\p{Co}\p{Cs}]|[^\P{Cc}\n\t]/gu)

/* ---------- Pruebas ---------- */

describe('el bloque de pertinencia se puede pegar en WordPress', () => {
  it('trae la plantilla de enlaces, sus estilos, su contenido y su script, en ese orden', () => {
    expect(bloque.match(/<template data-odes-enlaces>/g)).toHaveLength(1)
    expect(bloque.match(/<style>/g)).toHaveLength(1)
    expect(bloque.match(new RegExp(`\\bid="${RAIZ}"`, 'g'))).toHaveLength(1)
    const orden = ['<template data-odes-enlaces>', '<style>', `<div id="${RAIZ}">`, '<script>'].map((t) => bloque.indexOf(t))
    expect(orden.every((posicion, i) => posicion >= 0 && (i === 0 || posicion > orden[i - 1]))).toBe(true)
    // Los marcadores que nombra el LEEME, junto a lo que editan.
    expect(bloque.indexOf('===== EDITAR ENLACES =====')).toBeLessThan(bloque.indexOf('<template data-odes-enlaces>'))
    expect(bloque.indexOf('===== EDITAR TABLERO =====')).toBeLessThan(bloque.indexOf('<div class="odes-tablero" data-odes-tablero-url='))
  })

  it('no tiene nada que WordPress pueda tomar por un shortcode', () => {
    expect(pareceShortcode(bloque)).toEqual([])
    expect(pareceShortcode(bloque.replace('enlaces[ i ]', 'enlaces[i]'))).toEqual([expect.stringContaining(': [i')])
    expect(pareceShortcode(bloque.replace('<p class="odes-bajada">', '<p class="odes-bajada">[caption] '))).toHaveLength(1)
  })

  it(`todos sus estilos van bajo #${RAIZ} (salvo los del plugin de accesibilidad), para no tocar el tema`, () => {
    expect(analizarCss(estilosDe(bloque)).selectores.length).toBeGreaterThan(60)
    expect(selectoresFueraDelBloque(bloque)).toEqual([])
    // Una regla suelta, o una del plugin que no termine en el bloque, sí se encuentra.
    const conRegla = (regla: string) => bloque.replace('</style>', `${regla}\n</style>`)
    expect(selectoresFueraDelBloque(conRegla('.odes-banda{color:red}'))).toEqual(['.odes-banda'])
    expect(selectoresFueraDelBloque(conRegla('body.pojo-a11y-grayscale p{color:red}'))).toEqual(['body.pojo-a11y-grayscale p'])
    // Ni hojas ni fuentes externas: la fuente Rubik la pone el tema.
    expect(analizarCss(estilosDe(bloque)).arrobas.filter((a) => /^@(import|font-face)\b/.test(a))).toEqual([])
  })

  it('sus nombres globales (keyframes, contenedores, propiedades personalizadas e ids) llevan el prefijo odes-', () => {
    expect(nombresSinPrefijo(bloque)).toEqual([])
    expect(nombresSinPrefijo(bloque.replace('id="odes-pe-consulta-titulo"', 'id="consulta"'))).toEqual(['consulta'])
    expect(nombresSinPrefijo(bloque.replace('--odes-magenta:#921b8c', '--magenta:#921b8c'))).toEqual(['--magenta'])
  })

  it('no carga nada de otros sitios; las únicas direcciones son las de EDITAR ENLACES', () => {
    expect(cargasExternas(bloque)).toEqual([])
    expect(cargasExternas(bloque.replace('<p class="odes-bajada">', '<img src="https://ejemplo.org/a.png"><p class="odes-bajada">'))).toHaveLength(3)
    expect(cargasExternas(bloque.replace("--odes-fuente:", "--odes-x:url('https://fonts.example/f.woff2');--odes-fuente:"))).toHaveLength(2)
    // El tablero vive en Vercel mientras se resuelve alojarlo en sapiencia.gov.co (allá X-Frame-Options: DENY).
    expect(sinComentariosHtml(bloque).match(/data-odes-tablero-url="([^"]*)"/g)).toEqual([
      'data-odes-tablero-url="https://sapiencia-web.vercel.app/tableros/pertinencia/index.html"',
    ])
  })

  it('evita lo que el CSS y los plugins del sitio alteran (strong, header, target, pestañas nuevas)', () => {
    expect(loQueElSitioAltera(bloque)).toEqual([])
    expect(loQueElSitioAltera(bloque.replace('<a class="odes-boton"', '<a target="_blank" class="odes-boton"'))).toHaveLength(2)
  })

  it('su JavaScript va en un solo script, encerrado en una función con "use strict"', () => {
    const ejecutables = scriptsDe(bloque).filter(({ atributos }) => !/\btype\s*=/.test(atributos))
    expect(ejecutables).toHaveLength(1)
    const [{ atributos, contenido }] = ejecutables
    expect(atributos.trim()).toBe('')
    expect(contenido.trim()).toMatch(/^\(function \(\) \{\s*'use strict';[\s\S]*\}\)\(\);$/)
    // Es el mismo que el aplicativo corre como módulo (plugin-vite.ts).
    expect(scriptDelBloque(bloque)).toBe(contenido)
    expect(moduloDelScript(bloque)).toContain(`export default function ejecutarBloquePertinencia() {\n${contenido}\n}`)
    expect(() => scriptDelBloque(bloque.replace('</script>', '</script><script>1</script>'))).toThrow(/exactamente un script/)
  })

  it('no tiene caracteres invisibles ni saltos de línea de Windows', () => {
    expect(invisibles(bloque)).toEqual([])
    expect(invisibles(bloque.replace('Medida de pertinencia</h1>', 'Medida de\u200bpertinencia</h1>'))).toHaveLength(1)
    expect(invisibles(bloque.replace('\n', '\r\n'))).toHaveLength(1)
  })
})

describe('EDITAR ENLACES', () => {
  const claves = [...plantillaDe(bloque).matchAll(/<a data-odes-enlace="([^"]+)" href="([^"]*)">/g)]

  it('la plantilla trae los 6 enlaces ("Conoce más" y los 5 accesos), cada uno con su dirección', () => {
    expect(claves.map(([, clave]) => clave)).toEqual([
      'conoce-mas',
      'resolucion',
      'infografia',
      'cuoc-sectores',
      'cine-cuoc',
      'indice-cine',
    ])
    // Por ahora todos van a google.com, pendientes de las direcciones reales (ver el comentario del bloque).
    expect(claves.map(([, , href]) => href)).toEqual(Array(6).fill('https://www.google.com'))
  })

  it('cada enlace del contenido sale de la plantilla: lleva su clave y ninguna dirección propia', () => {
    const enlaces = [...marcadoDe(bloque).matchAll(/<a\b[^>]*data-odes-enlace="([^"]+)"/g)].map(([, clave]) => clave)
    expect(enlaces).toEqual(claves.map(([, clave]) => clave))
    expect(enlacesFueraDeLaPlantilla(bloque)).toEqual([])
    expect(enlacesFueraDeLaPlantilla(bloque.replace('<a class="odes-boton" data-odes-enlace="conoce-mas"', '<a class="odes-boton" data-odes-enlace="conoce-mas" href="https://x.org"'))).toHaveLength(1)
    expect(enlacesFueraDeLaPlantilla(bloque.replace('data-odes-enlace="infografia">', 'data-odes-enlace="otra">'))).toHaveLength(1)
  })
})

describe('EDITAR TABLERO', () => {
  const comentario = /<!--\s*===== EDITAR TABLERO =====([\s\S]*?)-->/.exec(bloque)?.[1] ?? ''

  it('advierte que sapiencia.gov.co no deja incrustar (X-Frame-Options: DENY, también al mismo sitio) y no lo da de ejemplo', () => {
    expect(comentario).toContain('X-Frame-Options: DENY')
    expect(comentario).toContain('SAMEORIGIN')
    expect(comentario).toContain('curl -I')
    // El ejemplo no lleva a un marco roto en WordPress.
    expect(comentario).toMatch(/data-odes-tablero-url="https:\/\//)
    expect(comentario).not.toMatch(/data-odes-tablero-url="https:\/\/(?:www\.)?sapiencia\.gov\.co/)
  })
})

describe('diseño del bloque', () => {
  const css = estilosDe(bloque).replace(/\/\*[\s\S]*?\*\//g, '')

  /** Cuerpo de la regla cuyo selector es exactamente `selector` (fuera de @media y @container). */
  function regla(selector: string): string {
    const escapado = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(?:^|\\})\\s*${escapado}\\{([^}]*)\\}`).exec(css)?.[1] ?? ''
  }
  function valor(cuerpo: string, propiedad: string): string | undefined {
    return new RegExp(`(?:^|;)\\s*${propiedad.replace(/-/g, '\\-')}\\s*:\\s*([^;]+)`).exec(cuerpo)?.[1].trim()
  }
  /** Resuelve var(--odes-…) con las variables de la raíz. */
  function resolver(texto: string | undefined): string | undefined {
    const variable = /^var\((--[\w-]+)\)$/.exec(texto ?? '')?.[1]
    return variable ? resolver(valor(regla(`#${RAIZ}`), variable)) : texto
  }
  /** Contraste WCAG 2.x entre dos colores #rrggbb (o #fff). */
  function contraste(a: string, b: string): number {
    const luminancia = (hex: string) => {
      const largo = hex.length === 4 ? hex.replace(/^#(.)(.)(.)$/, '#$1$1$2$2$3$3') : hex
      const [r, g, bl] = [1, 3, 5]
        .map((k) => parseInt(largo.slice(k, k + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      return 0.2126 * r + 0.7152 * g + 0.0722 * bl
    }
    const [claro, oscuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
    return (claro + 0.05) / (oscuro + 0.05)
  }

  it('los tamaños de letra van en --odes-fs, con !important, y crecen con el "Aumentar texto" del plugin', () => {
    expect(css).toContain(`#${RAIZ} *{--odes-fs:1em;font-size:var(--odes-fs)!important}`)
    expect(tamanosSueltos(bloque)).toEqual([])
    expect(tamanosSueltos(bloque.replace('.odes-bajada{--odes-fs:.8125em;', '.odes-bajada{font-size:13px;'))).toHaveLength(1)
    // Una regla por cada tamaño del plugin (120 % a 200 %), sobre la raíz del bloque.
    const tamanos = [...css.matchAll(new RegExp(`body\\.pojo-a11y-resize-font-(\\d+) #${RAIZ}\\{font-size:([\\d.]+)rem\\}`, 'g'))]
    expect(tamanos.map(([, n, rem]) => [Number(n), Math.round(Number(rem) * 100)])).toEqual(
      [120, 130, 140, 150, 160, 170, 180, 190, 200].map((n) => [n, n]),
    )
  })

  it('el h1 puede partir "pertinencia" (min-width: 0): al 200 % en 320 px la banda no le corta la última letra', () => {
    // La banda es flex y recorta lo que se sale; sin min-width: 0 el h1 no baja del ancho de su palabra más larga.
    expect(valor(regla(`#${RAIZ} .odes-banda`), 'display')).toBe('flex')
    expect(valor(regla(`#${RAIZ} .odes-banda`), 'overflow')).toBe('hidden')
    expect(valor(regla(`#${RAIZ} .odes-titulo`), 'min-width')).toBe('0')
    expect(valor(regla(`#${RAIZ} .odes-titulo`), 'overflow-wrap')).toBe('break-word')
  })

  it('aire: completa hasta 20 px el de la columna del tema (5 px entre 961 y 1140 px) y deja 76 px hasta el pie', () => {
    const relleno = /^1\.9375rem max\(0px,calc\((\d+)px - \(100vw - 100%\) \/ 2\)\) ([\d.]+)rem$/.exec(
      valor(regla(`#${RAIZ}`), 'padding') ?? '',
    )
    expect(relleno).not.toBeNull()
    const [, minimo = '', abajo = ''] = relleno ?? []
    // Aire que pone la raíz para una ventana y una columna (100 % = el ancho de la columna).
    const aire = (ventana: number, columna: number) => Math.max(0, Number(minimo) - (ventana - columna) / 2)
    // Columnas medidas en /metodologia_de_pertinencia/: a 5 px de los bordes entre 961 y 1140 px...
    for (const ventana of [961, 1024, 1100, 1140]) expect(5 + aire(ventana, ventana - 10)).toBe(20)
    // ...y en los demás anchos (y en el aplicativo, que pone 20 px), nada.
    expect([aire(1440, 1070), aire(1141, 1070), aire(960, 920), aire(390, 350), aire(1024, 984)]).toEqual([0, 0, 0, 0, 0])
    // Abajo, con los 25 px de margen del Raw HTML de WPBakery, 76 px hasta el pie (el diseño).
    expect(Number(abajo) * 16 + 25).toBe(76)
  })

  it('el h1 tapa las estrellas que caen detrás de él con el mismo azul de la banda', () => {
    const fondoBanda = resolver(valor(regla(`#${RAIZ} .odes-banda`), 'background'))
    expect(fondoBanda).toMatch(/^#[0-9a-f]{6}$/i)
    expect(resolver(valor(regla(`#${RAIZ} .odes-titulo`), 'background'))).toBe(fondoBanda)
    expect(valor(regla(`#${RAIZ} .odes-estrellas`), 'z-index')).toBe('-1')
    expect(valor(regla(`#${RAIZ} .odes-banda`), 'isolation')).toBe('isolate')
  })

  it('contraste: el título de cada acceso llega a 4,5:1 sobre su color (16 px en negrita es texto normal)', () => {
    const colores = [...bloque.matchAll(/class="odes-acceso odes-acceso--(\w+)"/g)].map(([, color]) => color)
    expect(colores).toEqual(['marino', 'celeste', 'morado', 'verde', 'amarillo'])
    const base = regla(`#${RAIZ} a.odes-acceso`)
    for (const color of colores) {
      const variante = regla(`#${RAIZ} a.odes-acceso--${color}`)
      const fondo = resolver(valor(variante, '--odes-acento') ?? valor(base, '--odes-acento'))
      const texto = resolver(valor(variante, '--odes-acento-texto') ?? valor(base, '--odes-acento-texto'))
      expect({ color, contraste: contraste(fondo!, texto!) >= 4.5 }).toEqual({ color, contraste: true })
    }
    // "Conoce más": blanco sobre magenta.
    expect(contraste(resolver('var(--odes-magenta)')!, '#fff')).toBeGreaterThan(7)
  })

  it('los triángulos tienen tope en px (con la letra agrandada no le quitan a la banda el ancho del h1)', () => {
    const triangulos = regla(`#${RAIZ} .odes-triangulos`)
    expect(valor(triangulos, 'width')).toMatch(/^min\(.*\d+px\)$/)
    expect(valor(triangulos, 'aspect-ratio')).toBe('180 / 96')
  })

  it('el bloque es fluido: sus cortes dependen de su propio ancho, en em', () => {
    expect(valor(regla(`#${RAIZ}`), 'container')).toBe('odes-pertinencia / inline-size')
    const cortes = analizarCss(css).arrobas.filter((a) => a.startsWith('@container'))
    expect(cortes.length).toBeGreaterThan(0)
    expect(cortes.filter((a) => !/^@container odes-pertinencia \((?:min|max)-width: [\d.]+em\)$/.test(a))).toEqual([])
    // Sin @media de ancho de ventana.
    expect(analizarCss(css).arrobas.filter((a) => /^@media[^{]*width/.test(a))).toEqual([])
  })
})
