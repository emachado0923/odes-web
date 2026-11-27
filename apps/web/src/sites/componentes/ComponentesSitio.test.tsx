import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rutas } from '../../router'
import { armarBloque, COMPONENTES } from './catalogo'

function renderizarEn(ruta: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] })
  render(<RouterProvider router={router} />)
  return router
}

async function fichaTresLados() {
  return screen.findByRole('article', { name: 'Formación en CTi' })
}

afterEach(() => {
  Reflect.deleteProperty(URL, 'createObjectURL')
  Reflect.deleteProperty(URL, 'revokeObjectURL')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('rama /componentes', () => {
  it('muestra el catálogo con una ficha por componente y la vista previa en vivo', async () => {
    renderizarEn('/componentes')

    expect(await screen.findByRole('heading', { level: 1, name: 'Componentes' })).toBeInTheDocument()
    expect(document.title).toBe('Componentes · Sapiencia')
    expect(screen.getAllByRole('article')).toHaveLength(COMPONENTES.length)

    const ficha = await fichaTresLados()
    const vista = within(ficha).getByRole('region', { name: 'Vista previa Formación en CTi' })
    // El componente tal cual: su raíz, su título, las cifras de sus tres triángulos y el botón.
    expect(vista.querySelector('#odes-tres-lados')).not.toBeNull()
    expect(vista.querySelector('style')?.textContent).toContain('#odes-tres-lados')
    expect(within(vista).getByRole('heading', { level: 2, name: 'Medellín potencia la formación en CTi' })).toBeInTheDocument()
    expect([...vista.querySelectorAll('.odes-cti-pieza__cifra')].map((cifra) => cifra.textContent)).toEqual(['36', '757', '110.092'])
    expect(within(vista).getByRole('link', { name: 'Conoce más' })).toHaveAttribute('href', 'https://odes-web-327402776385.us-central1.run.app/tableros/matricula-cti')
  })

  it('los botones de ancho angostan la vista previa', async () => {
    renderizarEn('/componentes')
    const ficha = await fichaTresLados()
    const marco = ficha.querySelector<HTMLElement>('.co-vista__marco')
    const escritorio = within(ficha).getByRole('button', { name: 'Escritorio' })
    const celular = within(ficha).getByRole('button', { name: /^Celular/ })

    expect(escritorio).toHaveAttribute('aria-pressed', 'true')
    expect(marco?.style.maxWidth).toBe('')

    fireEvent.click(celular)
    expect(celular).toHaveAttribute('aria-pressed', 'true')
    expect(escritorio).toHaveAttribute('aria-pressed', 'false')
    expect(marco?.style.maxWidth).toBe('375px')

    fireEvent.click(within(ficha).getByRole('button', { name: /^Tableta/ }))
    expect(marco?.style.maxWidth).toBe('768px')
  })

  it('descarga cada parte y el bloque completo con su nombre; sin script, el botón queda deshabilitado', async () => {
    const blobs: Blob[] = []
    // jsdom no implementa URL.createObjectURL ni revokeObjectURL.
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn<(blob: Blob) => string>((blob) => {
        blobs.push(blob)
        return `blob:prueba/${blobs.length}`
      }),
    })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn<(url: string) => void>() })
    const descargados: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      descargados.push(this.download)
    })

    renderizarEn('/componentes')
    const ficha = await fichaTresLados()
    const [tresLados] = COMPONENTES

    fireEvent.click(within(ficha).getByRole('button', { name: /^Bloque completo/ }))
    fireEvent.click(within(ficha).getByRole('button', { name: /^HTML/ }))
    fireEvent.click(within(ficha).getByRole('button', { name: /^CSS/ }))

    expect(descargados).toEqual(['tres-lados-bloque.html', 'tres-lados.html', 'tres-lados.css'])
    expect(await blobs[0]?.text()).toBe(tresLados && armarBloque(tresLados))
    expect(await blobs[1]?.text()).toBe(tresLados?.html)
    expect(await blobs[2]?.text()).toBe(tresLados?.css)
    expect(within(ficha).getByRole('button', { name: 'Script no usa script' })).toBeDisabled()
  })

  it('las fichas de cifras: se ven las cinco y su script se descarga aparte y va en el bloque', async () => {
    const blobs: Blob[] = []
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn<(blob: Blob) => string>((blob) => {
        blobs.push(blob)
        return `blob:prueba/${blobs.length}`
      }),
    })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn<(url: string) => void>() })
    const descargados: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      descargados.push(this.download)
    })
    const cifras = COMPONENTES.find((componente) => componente.slug === 'cifras')
    if (!cifras?.js) throw new Error('Falta el componente de cifras con su script')

    renderizarEn('/componentes')
    const ficha = await screen.findByRole('article', { name: 'Fichas de cifras' })
    const vista = within(ficha).getByRole('region', { name: 'Vista previa Fichas de cifras' })
    expect(vista.querySelector('#odes-cifras')).not.toBeNull()
    expect(within(vista).getByRole('heading', { level: 2, name: 'El Observatorio en cifras' })).toBeInTheDocument()
    expect(vista.querySelectorAll('.odes-cifra')).toHaveLength(5)
    expect(within(vista).getAllByText('Dato preliminar', { exact: false })).toHaveLength(2)

    fireEvent.click(within(ficha).getByRole('button', { name: /^Script/ }))
    fireEvent.click(within(ficha).getByRole('button', { name: /^Bloque completo/ }))
    expect(descargados).toEqual(['cifras.js', 'cifras-bloque.html'])
    expect(await blobs[0]?.text()).toBe(cifras.js)
    const bloque = (await blobs[1]?.text()) ?? ''
    expect(bloque).toContain('Incluye estilos, contenido y script.')
    expect(bloque.trimEnd().endsWith(`<script>\n${cifras.js.trim()}\n</script>`)).toBe(true)
  })

  it('copia el bloque completo al portapapeles y lo avisa', async () => {
    const escribir = vi.fn<(texto: string) => Promise<void>>(async () => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: escribir } })

    renderizarEn('/componentes')
    const ficha = await fichaTresLados()
    const [tresLados] = COMPONENTES

    await act(async () => {
      fireEvent.click(within(ficha).getByRole('button', { name: /^Copiar bloque/ }))
    })
    expect(escribir).toHaveBeenCalledWith(tresLados && armarBloque(tresLados))
    expect(within(ficha).getByRole('status')).toHaveTextContent('Bloque copiado.')
  })

  it('si no se puede copiar, sugiere descargar el bloque', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: vi.fn<(texto: string) => Promise<void>>(async () => Promise.reject(new Error('no'))) } })

    renderizarEn('/componentes')
    const ficha = await fichaTresLados()
    await act(async () => {
      fireEvent.click(within(ficha).getByRole('button', { name: /^Copiar bloque/ }))
    })
    expect(within(ficha).getByRole('status')).toHaveTextContent('No se pudo copiar. Descarga el bloque completo.')
  })

  it('"/componentes/x" muestra el 404 propio de la rama', async () => {
    renderizarEn('/componentes/x')

    expect(await screen.findByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeInTheDocument()
    expect(screen.getByText('Esta página no existe dentro del catálogo de componentes.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver los componentes' })).toHaveAttribute('href', '/componentes')
  })

  it('"/" enlaza el catálogo de componentes', async () => {
    renderizarEn('/')

    expect(await screen.findByRole('link', { name: 'Componentes' })).toHaveAttribute('href', '/componentes')
  })
})
