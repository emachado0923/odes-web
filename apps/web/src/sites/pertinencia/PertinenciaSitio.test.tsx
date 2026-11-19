import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import bloque from '../../../pertinencia/pertinencia-bloque.html?raw'
import ejecutarBloque from '../../../pertinencia/pertinencia-bloque.html?script'
import { rutas } from '../../router'
import BloquePertinencia, { URL_TABLERO } from './componentes/BloquePertinencia'

/*
 * Se prueba a través del router real: la rama se carga diferida, como en el sitio. El contenido es el bloque de
 * WordPress (apps/web/pertinencia/pertinencia-bloque.html); sus reglas y su script tienen pruebas propias en esa
 * carpeta. Aquí se mira que la página lo muestre completo y que su script corra (una vez) con el tablero del sitio.
 */

// El script del bloque, espiado (corre el real).
vi.mock('../../../pertinencia/pertinencia-bloque.html?script', async (importarOriginal) => {
  const original = await importarOriginal<{ default: () => void }>()
  return { default: vi.fn<() => void>(original.default) }
})

const TITULO = 'Medida de pertinencia'

const PRESENTACION =
  'La medida de pertinencia relaciona la oferta de programas de educación superior de Medellín con las ocupaciones y ' +
  'los sectores que demanda la ciudad. Este espacio presenta el propósito de la medida, su alcance y la forma de leer ' +
  'los resultados del tablero.'

/** Los accesos del diseño, en orden: título, color y clave de su enlace en EDITAR ENLACES. */
const ACCESOS_DISENO = [
  { titulo: 'Resolución de pertinencia', color: 'marino', clave: 'resolucion' },
  { titulo: 'Infografía', color: 'celeste', clave: 'infografia' },
  { titulo: 'Relación CUOC y sectores estratégicos', color: 'morado', clave: 'cuoc-sectores' },
  { titulo: 'Relación CINE y CUOC', color: 'verde', clave: 'cine-cuoc' },
  { titulo: 'Índice de pertinencia por campo CINE detallado', color: 'amarillo', clave: 'indice-cine' },
]

/** Dirección de un enlace en la plantilla EDITAR ENLACES del bloque (el archivo, no el DOM). */
function direccionEnElBloque(clave: string): string {
  const direccion = new RegExp(`<a data-odes-enlace="${clave}" href="([^"]*)">`).exec(bloque)?.[1]
  if (direccion === undefined) throw new Error(`El bloque no tiene el enlace ${clave}`)
  return direccion
}

function renderizarEn(ruta: string, { estricto = false } = {}) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] })
  const proveedor = <RouterProvider router={router} />
  render(estricto ? <StrictMode>{proveedor}</StrictMode> : proveedor)
  return router
}

async function abrirPagina(opciones?: { estricto?: boolean }) {
  renderizarEn('/pertinencia', opciones)
  return screen.findByRole('heading', { level: 1, name: TITULO })
}

beforeEach(() => {
  vi.mocked(ejecutarBloque).mockClear()
})

describe('Medida de pertinencia: página', () => {
  it('cabecera y pie oficiales de sapiencia.gov.co y, del bloque, el título, la presentación y los dos subtítulos', async () => {
    const h1 = await abrirPagina()

    expect(document.title).toBe(TITULO)
    const cabecera = screen.getByRole('banner')
    expect(cabecera).toHaveTextContent('Nosotros')
    expect(cabecera).toHaveTextContent('Observatorio')
    expect(
      screen.getByRole('link', { name: /^Sapiencia, Agencia de Educación Postsecundaria de Medellín, y Alcaldía de Medellín/ }),
    ).toHaveAttribute('href', 'https://sapiencia.gov.co/')
    const pie = screen.getByRole('contentinfo')
    expect(pie).toHaveTextContent('Fecha última actualización')
    expect(within(pie).getByRole('link', { name: /^Mapa del Sitio/ })).toBeInTheDocument()
    expect(document.querySelector('.pertinencia')).toHaveAttribute('lang', 'es-CO')

    // El h1 es el del bloque, dentro del <main>, en la columna del tema.
    const raiz = document.getElementById('odes-pertinencia')!
    expect(raiz).toContainElement(h1)
    expect(raiz.closest('.pe-columna')?.closest('main')).toBe(screen.getByRole('main'))

    expect(screen.getByText(PRESENTACION)).toBeInTheDocument()
    expect(h1.compareDocumentPosition(screen.getByText(PRESENTACION)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const consulta = screen.getByRole('region', { name: 'Consulta tu puntaje de pertinencia' })
    expect(within(consulta).getByRole('heading', { level: 2 })).toHaveTextContent('Consulta tu puntaje de pertinencia')
    expect(within(consulta).getByText('Selecciona un programa para ver su índice y su puntaje.')).toBeInTheDocument()

    const normativa = screen.getByRole('region', { name: 'Normativa y más detalle' })
    expect(within(normativa).getByRole('heading', { level: 2 })).toHaveTextContent('Normativa y más detalle')
    expect(within(normativa).getByText('Consulta la resolución y otras herramientas de consulta.')).toBeInTheDocument()
    expect(consulta.compareDocumentPosition(normativa) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('la página muestra el bloque de WordPress tal cual (su script en línea no corre: lo corre el módulo)', async () => {
    await abrirPagina()

    const raiz = document.getElementById('odes-pertinencia')!
    const contenedor = raiz.parentElement!
    // Los mismos estilos, la plantilla de enlaces y el script del archivo, en el DOM.
    expect(contenedor.querySelector('style')?.textContent).toBe(/<style>([\s\S]*?)<\/style>/.exec(bloque)?.[1])
    expect(contenedor.querySelector('template[data-odes-enlaces]')).not.toBeNull()
    expect(contenedor.querySelectorAll('script:not([type])')).toHaveLength(1)
    expect(contenedor.querySelectorAll('#odes-pertinencia')).toHaveLength(1)
  })

  it('el espacio del banner y, en la consulta, el tablero del propio sitio en el espacio del bloque', async () => {
    const h1 = await abrirPagina()

    const banner = document.querySelector('[data-espacio="banner"]')
    expect(banner).toHaveTextContent('Espacio para el banner')
    expect(banner!.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // El banner es del aplicativo (en WordPress lo pone la entidad): va fuera del bloque.
    expect(document.getElementById('odes-pertinencia')).not.toContainElement(banner as HTMLElement)

    const consulta = screen.getByRole('region', { name: 'Consulta tu puntaje de pertinencia' })
    const espacio = consulta.querySelector('[data-odes-tablero-url]') as HTMLElement
    expect(espacio).toHaveAttribute('data-odes-tablero-url', URL_TABLERO)
    const marco = within(espacio).getByTitle('Consulta del índice y el puntaje de pertinencia por programa')
    expect(marco.tagName).toBe('IFRAME')
    expect(marco).toHaveAttribute('src', '/tableros/pertinencia/index.html')
    expect(marco).toHaveAttribute('loading', 'lazy')
    // Con tablero ya no está el recuadro punteado, ni hay enlace a la versión completa.
    expect(within(espacio).queryByText('Espacio para el tablero de control')).not.toBeInTheDocument()
    expect(within(espacio).queryByRole('link')).not.toBeInTheDocument()
  })

  it('"Conoce más" va a la dirección de EDITAR ENLACES del bloque, en la misma pestaña', async () => {
    await abrirPagina()

    const consulta = screen.getByRole('region', { name: 'Consulta tu puntaje de pertinencia' })
    const conoceMas = within(consulta).getByRole('link', { name: 'Conoce más sobre la medida de pertinencia' })
    expect(conoceMas).toHaveAttribute('href', direccionEnElBloque('conoce-mas'))
    expect(conoceMas).not.toHaveAttribute('target')
    const marco = consulta.querySelector('iframe')!
    expect(marco.compareDocumentPosition(conoceMas) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('los cinco accesos numerados, en orden, con su color y la dirección de EDITAR ENLACES', async () => {
    await abrirPagina()

    const normativa = screen.getByRole('region', { name: 'Normativa y más detalle' })
    const lista = within(normativa).getByRole('list', { name: 'Normativa y más detalle' })
    expect(lista.tagName).toBe('OL')
    const enlaces = within(lista).getAllByRole('link')
    expect(enlaces).toHaveLength(5)

    enlaces.forEach((enlace, i) => {
      const esperado = ACCESOS_DISENO[i]
      // El número se ve pero no se lee (la lista ordenada ya da la posición).
      expect(enlace).toHaveAccessibleName(esperado.titulo)
      const numero = enlace.querySelector('.odes-acceso-numero')
      expect(numero).toHaveTextContent(String(i + 1))
      expect(numero).toHaveAttribute('aria-hidden', 'true')
      expect(enlace).toHaveClass('odes-acceso', `odes-acceso--${esperado.color}`)
      expect(enlace).toHaveAttribute('href', direccionEnElBloque(esperado.clave))
      expect(enlace).not.toHaveAttribute('target')
    })
  })

  it('en el contenido todo se abre en la misma pestaña (en WordPress el sitio quita los target)', async () => {
    await abrirPagina()

    const principal = screen.getByRole('main')
    expect(principal.querySelectorAll('a[target]')).toHaveLength(0)
    expect(principal).not.toHaveTextContent('pestaña nueva')
  })

  it('las estrellas, los triángulos y las flechas son decorativos', async () => {
    await abrirPagina()

    const raiz = document.getElementById('odes-pertinencia')!
    for (const decorativo of raiz.querySelectorAll('.odes-estrellas, .odes-triangulos, .odes-flecha svg')) {
      expect(decorativo).toHaveAttribute('aria-hidden', 'true')
    }
    expect(raiz.querySelectorAll('.odes-triangulo')).toHaveLength(3)
    expect(raiz.querySelectorAll('.odes-flecha svg')).toHaveLength(6)
  })

  it('en StrictMode el script del bloque corre una sola vez: un marco y un solo inicio', async () => {
    // El componente solo, montado de entrada en StrictMode: React corre su efecto dos veces sobre el mismo DOM.
    render(
      <StrictMode>
        <BloquePertinencia />
      </StrictMode>,
    )

    expect(ejecutarBloque).toHaveBeenCalledTimes(1)
    const raiz = document.getElementById('odes-pertinencia')!
    expect(raiz).toHaveAttribute('data-odes-iniciado')
    expect(raiz.querySelectorAll('iframe')).toHaveLength(1)
    expect(raiz.querySelectorAll('a[href]')).toHaveLength(6)

    // Y en la página real, dentro del router en StrictMode, igual.
    cleanup()
    vi.mocked(ejecutarBloque).mockClear()
    await abrirPagina({ estricto: true })
    expect(ejecutarBloque).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('#odes-pertinencia iframe')).toHaveLength(1)
  })

  it('"Saltar al contenido" lleva el foco al <main>', async () => {
    await abrirPagina()

    fireEvent.click(screen.getByRole('link', { name: 'Saltar al contenido' }))

    expect(screen.getByRole('main')).toHaveFocus()
  })
})

describe('Medida de pertinencia: rutas', () => {
  it('"/pertinencia/x" muestra el 404 propio con enlace a /pertinencia, dentro de la rama', async () => {
    const router = renderizarEn('/pertinencia/x')

    expect(await screen.findByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeInTheDocument()
    expect(screen.getByText('Esta página no existe dentro de la medida de pertinencia.')).toBeInTheDocument()
    expect(document.title).toBe(`Página no encontrada · ${TITULO}`)
    expect(screen.getByRole('banner')).toHaveTextContent('Nosotros')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Fecha última actualización')
    // El 404 no trae el bloque ni corre su script.
    expect(document.getElementById('odes-pertinencia')).toBeNull()
    expect(ejecutarBloque).not.toHaveBeenCalled()

    const volver = screen.getByRole('link', { name: 'Volver a la medida de pertinencia' })
    expect(volver).toHaveAttribute('href', '/pertinencia')
    fireEvent.click(volver)
    expect(await screen.findByRole('heading', { level: 1, name: TITULO })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/pertinencia')
    expect(ejecutarBloque).toHaveBeenCalledTimes(1)
  })
})
