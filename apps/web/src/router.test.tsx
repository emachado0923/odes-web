import { fireEvent, render, screen } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { rutas } from './router'
import { documento, listado } from './sites/repositorio/pruebas/datos-prueba'

// La plantilla de ODES se carga con <link rel="stylesheet" precedence>: React
// espera a que la hoja cargue antes de mostrar la rama y jsdom nunca la carga.
vi.mock('./sites/odes/kit/KitPlantilla', () => ({ default: () => null }))

// La administración del repositorio la implementa otra parte: aquí solo se
// comprueba que la ruta la cargue (diferida), sin depender de su contenido.
vi.mock('./sites/repositorio/admin/AdminRepositorio', () => ({
  default: () => (
    <main id="contenido">
      <h1>Administración simulada</h1>
    </main>
  ),
}))

const ESTADO_ODES = {
  asistente: 'Asistente ODES',
  modo: 'ia',
  repositorio: { disponible: true, documentos: 372, documentosConTexto: 290, generado: null },
}

const LISTADO_REPOSITORIO = listado([documento()])

beforeEach(() => {
  sessionStorage.clear()
  // La pantalla de ingreso de ODES dibuja estrellas en <canvas>, que jsdom no implementa.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const cuerpo = String(url).startsWith('/api/repositorio/') ? LISTADO_REPOSITORIO : ESTADO_ODES
      return new Response(JSON.stringify(cuerpo), { headers: { 'Content-Type': 'application/json' } })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  Reflect.deleteProperty(document, 'scrollingElement')
})

/** jsdom no desplaza: se espía scrollTo de document.scrollingElement. */
function espiarDesplazamiento() {
  const subir = vi.fn<(opciones: ScrollToOptions) => void>()
  Object.defineProperty(document, 'scrollingElement', { configurable: true, value: { scrollTo: subir } })
  return subir
}

function renderizarEn(ruta: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] })
  render(<RouterProvider router={router} />)
  return router
}

/**
 * Hace clic en un enlace y dice si React Router lo dejó pasar como navegación
 * normal del navegador (reloadDocument: no llama a preventDefault). El clic
 * se cancela al final para que jsdom no intente navegar.
 */
function recargaElDocumento(enlace: HTMLElement): boolean {
  let prevenido: boolean | undefined
  const registrar = (evento: MouseEvent) => {
    prevenido = evento.defaultPrevented
    evento.preventDefault()
  }
  window.addEventListener('click', registrar)
  fireEvent.click(enlace)
  window.removeEventListener('click', registrar)
  return prevenido === false
}

describe('rutas de la aplicación', () => {
  it('"/" muestra los enlaces a la página principal, SIVU, el Asistente ODES, el Repositorio y el PAI, con recarga completa', async () => {
    const router = renderizarEn('/')

    expect(await screen.findByRole('heading', { level: 1, name: 'Sapiencia' })).toBeInTheDocument()
    const principal = screen.getByRole('link', { name: 'Página principal del Observatorio' })
    const sivu = screen.getByRole('link', { name: 'Sistema de Visualización de Datos' })
    const odes = screen.getByRole('link', { name: 'Asistente ODES' })
    // "productos" en minúscula (comentarios del Observatorio, 12 de noviembre de 2026).
    const repositorio = screen.getByRole('link', { name: 'Repositorio de productos' })
    const pai = screen.getByRole('link', { name: 'Plan de Acción Institucional' })
    expect(principal).toHaveAttribute('href', '/principal')
    expect(sivu).toHaveAttribute('href', '/sivu')
    expect(odes).toHaveAttribute('href', '/odes')
    expect(repositorio).toHaveAttribute('href', '/repositorio')
    expect(pai).toHaveAttribute('href', '/pai')
    expect(document.title).toBe('Sapiencia')

    // Cada rama trae su propio CSS (el de ODES, global): nunca conviven en un
    // documento. /principal no es de React: solo existe con recarga completa.
    expect(recargaElDocumento(principal)).toBe(true)
    expect(recargaElDocumento(odes)).toBe(true)
    expect(recargaElDocumento(sivu)).toBe(true)
    expect(recargaElDocumento(repositorio)).toBe(true)
    expect(recargaElDocumento(pai)).toBe(true)
    expect(router.state.location.pathname).toBe('/')
  })

  it('"/odes" carga la rama diferida con la pantalla de ingreso, e «Ingresar» lleva al chat', async () => {
    const subir = espiarDesplazamiento()
    const router = renderizarEn('/odes')

    // Mientras baja el chunk se ve el indicador neutral (HydrateFallback).
    expect(screen.getByRole('status')).toHaveTextContent('Cargando')

    expect(await screen.findByRole('heading', { level: 1, name: '¡Pregúntale a OdeS!' })).toBeInTheDocument()
    expect(document.title).toBe('Pregúntale a OdeS · Observatorio de Sapiencia')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute('href', '#odes-contenido')

    // «Ingresar» es navegación interna (sin recargar el kit) y deja el foco en el campo del nombre.
    const ingresar = screen.getByRole('link', { name: 'Ingresar' })
    expect(ingresar).toHaveAttribute('href', '/odes/chat')
    expect(recargaElDocumento(ingresar)).toBe(false)
    expect(await screen.findByLabelText('Tu nombre')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/odes/chat')
    // El chat lleva la misma franja, sin «Ingresar» ni las preguntas de la pantalla de ingreso,
    // sobre el fondo de partículas fijo (.odes sin fondo para dejarlo ver).
    expect(screen.getByRole('region', { name: '¡Pregúntale a OdeS!' })).toBeInTheDocument()
    expect(document.querySelector('.odes-cielo')).toHaveClass('odes-cielo--fijo')
    expect(document.querySelector('.odes')).toHaveClass('odes--cielo')
    expect(document.querySelector('.odes-imagen-lateral')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Ingresar' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '¿Quién es OdeS?' })).not.toBeInTheDocument()
    expect(screen.getByText('¿Cuál es tu nombre?')).toBeInTheDocument()
    expect(screen.getByLabelText('Tu nombre')).toHaveFocus()
    expect(subir).toHaveBeenCalledWith({ top: 0, behavior: 'instant' })
    expect(document.title).toBe('Asistente ODES · Observatorio de Sapiencia')
    expect(screen.getByRole('link', { name: 'Saltar al campo de mensaje' })).toHaveAttribute('href', '#odes-entrada')

    // Cabecera y pie de la plantilla del Observatorio.
    const logo = screen.getByRole('link', { name: 'Observatorio de Sapiencia: ir al inicio' })
    expect(logo).toHaveAttribute('href', '/')
    expect(recargaElDocumento(logo)).toBe(true)
    expect(screen.getByRole('contentinfo')).toContainElement(
      screen.getByRole('link', { name: /^Sapiencia, Agencia de Educación Postsecundaria/ }),
    )
  })

  it('la pausa de las animaciones elegida en la pantalla de ingreso sigue en el chat', async () => {
    renderizarEn('/odes')
    fireEvent.click(await screen.findByRole('button', { name: 'Pausar animaciones' }))
    expect(document.querySelector('.odes')).not.toHaveClass('odes--cielo')

    fireEvent.click(screen.getByRole('link', { name: 'Ingresar' }))
    expect(await screen.findByLabelText('Tu nombre')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reanudar animaciones' })).toBeInTheDocument()
    expect(document.querySelector('.odes-cielo')).toHaveClass('odes-cielo--quieto')
    expect(document.querySelector('.odes-banda')).toHaveClass('odes-banda--quieta')
  })

  it('"/odes/chat" abre el chat directamente, sin mover el foco ni desplazar', async () => {
    const subir = espiarDesplazamiento()
    renderizarEn('/odes/chat')

    expect(await screen.findByRole('heading', { level: 1, name: '¡Pregúntale a OdeS!' })).toBeInTheDocument()
    expect(screen.getByLabelText('Tu nombre')).not.toHaveFocus()
    expect(subir).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'Ingresar' })).not.toBeInTheDocument()
    expect(document.title).toBe('Asistente ODES · Observatorio de Sapiencia')
  })

  it('recargar "/odes/chat" (el estado de «Ingresar» sigue en el historial) no vuelve a mover el foco', async () => {
    const subir = espiarDesplazamiento()
    // Un router en memoria arranca con POP, como una recarga o Atrás/Adelante.
    const router = createMemoryRouter(rutas, {
      initialEntries: [{ pathname: '/odes/chat', state: { desdeIngreso: true } }],
    })
    render(<RouterProvider router={router} />)

    expect(await screen.findByLabelText('Tu nombre')).not.toHaveFocus()
    expect(subir).not.toHaveBeenCalled()
  })

  it('"/odes/x" muestra el 404 propio de ODES', async () => {
    const router = renderizarEn('/odes/x')

    expect(await screen.findByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeInTheDocument()
    expect(screen.getByText('Esta página no existe dentro del Asistente ODES.')).toBeInTheDocument()
    // Aquí no hay campo de mensaje: «Saltar» lleva al contenido.
    expect(screen.getByRole('link', { name: 'Saltar al contenido' })).toHaveAttribute('href', '#odes-contenido')
    expect(screen.getByRole('main')).toHaveAttribute('id', 'odes-contenido')
    const inicio = screen.getByRole('link', { name: 'Ir al inicio de Sapiencia' })
    expect(inicio).toHaveAttribute('href', '/')
    expect(recargaElDocumento(inicio)).toBe(true)

    // Volver a ODES no sale de la rama: navegación interna, a la pantalla de ingreso.
    const volver = screen.getByRole('link', { name: 'Volver al Asistente ODES' })
    expect(volver).toHaveAttribute('href', '/odes')
    expect(recargaElDocumento(volver)).toBe(false)
    expect(await screen.findByRole('heading', { level: 1, name: '¡Pregúntale a OdeS!' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/odes')
  })

  it('"/repositorio" carga la rama diferida con los documentos de la API, con la cabecera y el pie de la entidad', async () => {
    renderizarEn('/repositorio')

    expect(screen.getByRole('status')).toHaveTextContent('Cargando')
    expect(await screen.findByRole('heading', { level: 1, name: 'Repositorio de productos' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 2, name: 'Fe de erratas del Boletín N.º 19' })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/repositorio/documentos', expect.anything())
    expect(document.title).toBe('Repositorio de productos · Observatorio de Sapiencia')

    // Cabecera y pie de sapiencia.gov.co (src/compartido/sapiencia), como en /pertinencia: barra GOV.CO con
    // "Opciones de Accesibilidad", menú del sitio y pie azul. El logo sale de la aplicación hacia el sitio oficial.
    expect(document.querySelector('.repositorio')).toHaveClass('sap-oficial')
    expect(screen.getByRole('main')).toHaveClass('sap-contenido')
    expect(screen.getByRole('button', { name: 'Opciones de Accesibilidad' })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toHaveTextContent('Nosotros')
    const logo = screen.getByRole('link', { name: /^Sapiencia, Agencia de Educación Postsecundaria de Medellín, y Alcaldía/ })
    expect(logo).toHaveAttribute('href', 'https://sapiencia.gov.co/')
    expect(recargaElDocumento(logo)).toBe(true)
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Fecha última actualización')
    // La cabecera y el pie compactos del Observatorio quedaron solo para la administración.
    expect(screen.queryByRole('link', { name: 'Observatorio de Sapiencia: ir al inicio' })).not.toBeInTheDocument()
  })

  it('"/repositorio/admin" carga la administración (otro chunk) dentro de la rama, con la cabecera y el pie del Observatorio', async () => {
    renderizarEn('/repositorio/admin')

    expect(await screen.findByRole('heading', { level: 1, name: 'Administración simulada' })).toBeInTheDocument()
    expect(screen.getByRole('banner')).toHaveTextContent('Repositorio de productos')
    expect(fetch).not.toHaveBeenCalledWith('/api/repositorio/documentos', expect.anything())

    // La administración es interna: conserva la cabecera y el pie compactos del Observatorio (el logo sale de la
    // rama con recarga completa), sin la barra GOV.CO, el menú ni el pie de la entidad.
    const logo = screen.getByRole('link', { name: 'Observatorio de Sapiencia: ir al inicio' })
    expect(logo).toHaveAttribute('href', '/')
    expect(recargaElDocumento(logo)).toBe(true)
    expect(screen.getByRole('contentinfo')).toContainElement(
      screen.getByRole('link', { name: /^Sapiencia, Agencia de Educación Postsecundaria/ }),
    )
    expect(document.querySelector('.repositorio')).not.toHaveClass('sap-oficial')
    expect(document.querySelector('.sap-govco')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Opciones de Accesibilidad' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Menú principal de sapiencia.gov.co' })).not.toBeInTheDocument()
  })

  it('"/repositorio/x" muestra el 404 propio del repositorio, con la cabecera y el pie de la entidad', async () => {
    const router = renderizarEn('/repositorio/x')

    expect(await screen.findByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeInTheDocument()
    expect(screen.getByText('Esta página no existe dentro del Repositorio de productos.')).toBeInTheDocument()
    expect(document.title).toBe('Página no encontrada · Repositorio de productos')
    expect(screen.queryByText('La dirección que buscas no existe o cambió de lugar.')).not.toBeInTheDocument()
    expect(screen.getByRole('banner')).toHaveTextContent('Nosotros')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Fecha última actualización')
    expect(screen.queryByRole('link', { name: 'Observatorio de Sapiencia: ir al inicio' })).not.toBeInTheDocument()
    const inicio = screen.getByRole('link', { name: 'Ir al inicio de Sapiencia' })
    expect(inicio).toHaveAttribute('href', '/')
    expect(recargaElDocumento(inicio)).toBe(true)

    // Volver al repositorio no sale de la rama: navegación interna.
    const volver = screen.getByRole('link', { name: 'Volver al repositorio' })
    expect(volver).toHaveAttribute('href', '/repositorio')
    expect(recargaElDocumento(volver)).toBe(false)
    expect(await screen.findByRole('heading', { level: 2, name: 'Fe de erratas del Boletín N.º 19' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/repositorio')
  })

  it('"/nada" muestra el 404 global, cuyo enlace al inicio recarga la página', async () => {
    renderizarEn('/nada')

    expect(await screen.findByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeInTheDocument()
    expect(screen.getByText('La dirección que buscas no existe o cambió de lugar.')).toBeInTheDocument()
    const inicio = screen.getByRole('link', { name: 'Ir al inicio' })
    expect(inicio).toHaveAttribute('href', '/')
    expect(recargaElDocumento(inicio)).toBe(true)
    expect(screen.queryByText('Esta página no existe dentro del Asistente ODES.')).not.toBeInTheDocument()
  })
})

describe('rama /pertinencia', () => {
  it('"/" enlaza la medida de pertinencia con recarga completa', async () => {
    renderizarEn('/')

    const pertinencia = await screen.findByRole('link', { name: 'Medida de pertinencia' })
    expect(pertinencia).toHaveAttribute('href', '/pertinencia')
    expect(recargaElDocumento(pertinencia)).toBe(true)
  })

  it('"/pertinencia" carga la rama diferida con la cabecera y el pie oficiales de sapiencia.gov.co', async () => {
    renderizarEn('/pertinencia')

    // Mientras baja el chunk se ve el indicador neutral (HydrateFallback).
    expect(screen.getByRole('status')).toHaveTextContent('Cargando')
    expect(await screen.findByRole('heading', { level: 1, name: 'Medida de pertinencia' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(document.title).toBe('Medida de pertinencia')
    expect(screen.getByRole('banner')).toHaveTextContent('Nosotros')

    const logo = screen.getByRole('link', { name: /^Sapiencia, Agencia de Educación Postsecundaria de Medellín, y Alcaldía/ })
    expect(logo).toHaveAttribute('href', 'https://sapiencia.gov.co/')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Fecha última actualización')
  })

  it('"/pertinencia/x" muestra el 404 propio de la rama, no el global', async () => {
    renderizarEn('/pertinencia/x')

    expect(await screen.findByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeInTheDocument()
    expect(screen.getByText('Esta página no existe dentro de la medida de pertinencia.')).toBeInTheDocument()
    expect(screen.queryByText('La dirección que buscas no existe o cambió de lugar.')).not.toBeInTheDocument()
    const volver = screen.getByRole('link', { name: 'Volver a la medida de pertinencia' })
    expect(volver).toHaveAttribute('href', '/pertinencia')
    // Volver no sale de la rama: navegación interna.
    expect(recargaElDocumento(volver)).toBe(false)
  })
})
