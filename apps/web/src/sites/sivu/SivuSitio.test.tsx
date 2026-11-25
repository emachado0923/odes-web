import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { rutas } from '../../router'
import { ESTADO_INICIAL_VISOR, type EstadoVisor } from './visor/estado'
import type { OpcionesVisor, SentidoGiro } from './visor/VisorEdificio'

/*
 * jsdom no tiene WebGL: se simula el motor (VisorEdificio) y se prueban los
 * componentes React con estados emitidos a mano, a través del router real.
 */

interface VisorSimulado {
  contenedor: HTMLElement
  opciones: OpcionesVisor
  alternarRotacion: Mock<() => void>
  girar: Mock<(sentido: SentidoGiro) => void>
  acercar: Mock<() => void>
  alejar: Mock<() => void>
  enfocarPuerta: Mock<() => boolean>
  fijarZonaTapada: Mock<(pixeles: number) => void>
  dispose: Mock<() => void>
}

const simulado = vi.hoisted(() => ({ instancias: [] as VisorSimulado[] }))
const navegacion = vi.hoisted(() => ({ irA: vi.fn<(url: string) => void>() }))

vi.mock('./navegacion', () => ({ irA: navegacion.irA }))

const URL_TABLERO = '/tableros/bateria-indicadores'

vi.mock('./visor/VisorEdificio', () => ({
  VisorEdificio: class implements VisorSimulado {
    contenedor: HTMLElement
    opciones: OpcionesVisor
    alternarRotacion = vi.fn<() => void>()
    girar = vi.fn<(sentido: SentidoGiro) => void>()
    acercar = vi.fn<() => void>()
    alejar = vi.fn<() => void>()
    enfocarPuerta = vi.fn<() => boolean>(() => true)
    fijarZonaTapada = vi.fn<(pixeles: number) => void>()
    dispose = vi.fn<() => void>()

    constructor(contenedor: HTMLElement, opciones: OpcionesVisor) {
      this.contenedor = contenedor
      this.opciones = opciones
      simulado.instancias.push(this)
    }
  },
}))

const TITULO = 'Sistema de Visualización de Datos de Sapiencia'

function ultimoVisor(): VisorSimulado {
  const visor = simulado.instancias.at(-1)
  if (!visor) throw new Error('No se creó ningún VisorEdificio')
  return visor
}

function emitir(cambios: Partial<EstadoVisor>) {
  act(() => {
    ultimoVisor().opciones.alCambiarEstado?.({ ...ESTADO_INICIAL_VISOR, ...cambios })
  })
}

const LISTO: Partial<EstadoVisor> = { fase: 'listo', listo: true, progreso: 100, puertaEncontrada: true }

async function renderizarEn(ruta: string) {
  const router = createMemoryRouter(rutas, { initialEntries: [ruta] })
  render(<RouterProvider router={router} />)
  return router
}

async function abrirSivu() {
  const router = await renderizarEn('/sivu')
  await screen.findByRole('heading', { level: 1, name: TITULO })
  // El título aparece al insertarse el DOM; el visor se crea en el efecto de
  // Edificio3D. Esperarlo explícitamente.
  await waitFor(() => expect(simulado.instancias).toHaveLength(1))
  return router
}

const bloque = () => screen.getByRole('region', { name: TITULO })

beforeEach(() => {
  simulado.instancias.length = 0
  navegacion.irA.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('SIVU: página', () => {
  it('cabecera y pie del Observatorio, el edificio arriba y los tableros debajo', async () => {
    await abrirSivu()

    expect(document.title).toBe(TITULO)
    expect(screen.getByRole('link', { name: 'Observatorio de Sapiencia: ir al inicio' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('banner')).toHaveTextContent('Sistema de Visualización de Datos')
    expect(screen.getByRole('link', { name: /^Sapiencia, Agencia de Educación Postsecundaria/ })).toHaveAttribute(
      'target',
      '_blank',
    )

    const tableros = screen.getByRole('region', { name: 'Tableros de información' })
    expect(tableros).toHaveAttribute('id', 'tableros')
    // El edificio va antes que los tableros en el documento.
    expect(bloque().compareDocumentPosition(tableros) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const matricula = within(tableros).getByRole('heading', { level: 3, name: /Matrícula en educación superior en Medellín \(2025\)/ })
    // El tablero de matrícula ya está publicado en /tableros (con recarga completa: otra rama).
    const abrir = within(matricula.closest('li')!).getByRole('link', { name: /Abrir tablero/ })
    expect(abrir).toHaveAttribute('href', '/tableros/matricula-2025')
    // Y la serie 2000-2025, también en /tableros.
    const historica = within(tableros).getByRole('heading', { level: 3, name: /Matrícula en educación superior en Medellín \(2000-2025\)/ })
    expect(within(historica.closest('li')!).getByRole('link', { name: /Abrir tablero/ })).toHaveAttribute('href', '/tableros/matricula-historica')
    // Y el de los beneficiarios de los fondos, también en /tableros.
    const fondos = within(tableros).getByRole('heading', { level: 3, name: /Beneficiarios de los fondos de Sapiencia/ })
    // Los fondos tienen dos entradas con la misma sesión: el tablero y la ventanilla de consulta.
    expect(within(fondos.closest('li')!).getByRole('link', { name: 'Tablero' })).toHaveAttribute('href', '/tableros/fondos-2026')
    expect(within(fondos.closest('li')!).getByRole('link', { name: 'Ventanilla de consulta' })).toHaveAttribute(
      'href',
      '/tableros/fondos-2026/ventanilla',
    )
    expect(within(fondos.closest('li')!).getByText('Fondos y becas')).toHaveClass('sv-tablero-tema')
    expect(within(tableros).getByText('Pronto habrá más tableros aquí.')).toBeInTheDocument()
  })

  it('"Saltar al contenido" lleva el foco al <main>', async () => {
    await abrirSivu()

    fireEvent.click(screen.getByRole('link', { name: 'Saltar al contenido' }))

    expect(screen.getByRole('main')).toHaveFocus()
  })
})

describe('SIVU: bloque del edificio', () => {
  it('monta el visor con el modelo y el decodificador Draco de /sivu y muestra la carga', async () => {
    await abrirSivu()

    const visor = ultimoVisor()
    expect(visor.opciones.urlModelo).toBe('/sivu/edificiofinal.glb')
    expect(visor.opciones.rutaDecodificadorDraco).toBe('/sivu/draco/')
    expect(bloque()).toHaveAttribute('data-estado', 'cargando')
    expect(visor.contenedor).toHaveAttribute('aria-hidden', 'true')

    expect(screen.getByText('Cargando el edificio en 3D…')).toHaveAttribute('role', 'status')
    // La barra de controles aparece con el edificio listo.
    expect(screen.queryByRole('group', { name: 'Controles del edificio en 3D' })).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Observatorio de Sapiencia' })).toBeInTheDocument()
  })

  it('muestra el porcentaje de descarga, "Preparando…" y quita la tarjeta cuando el edificio está listo', async () => {
    await abrirSivu()

    emitir({ progreso: 42 })
    expect(bloque()).toHaveTextContent('42 %')

    emitir({ fase: 'procesando', progreso: 100 })
    expect(screen.getByText('Preparando el edificio en 3D…')).toBeInTheDocument()

    emitir(LISTO)
    expect(bloque()).toHaveAttribute('data-estado', 'listo')
    expect(bloque()).toHaveClass('ed-listo')
    expect(ultimoVisor().contenedor).not.toHaveAttribute('aria-hidden')
    expect(screen.queryByText('Preparando el edificio en 3D…')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Controles del edificio en 3D' })).toBeInTheDocument()
  })

  it('si el foco estaba en la tarjeta de carga, pasa al botón de pausa cuando desaparece', async () => {
    await abrirSivu()

    act(() => screen.getByText('Cargando el edificio en 3D…').focus())
    emitir(LISTO)

    expect(screen.getByRole('button', { name: 'Detener el giro automático' })).toHaveFocus()
  })

  it('la barra: pausa el giro (y cambia su nombre), gira, acerca y aleja', async () => {
    await abrirSivu()
    emitir(LISTO)
    const visor = ultimoVisor()

    fireEvent.click(screen.getByRole('button', { name: 'Detener el giro automático' }))
    expect(visor.alternarRotacion).toHaveBeenCalledTimes(1)
    emitir({ ...LISTO, rotacionActiva: false })
    expect(screen.getByRole('button', { name: 'Reanudar el giro automático' })).toHaveClass('ed-detenido')

    fireEvent.click(screen.getByRole('button', { name: 'Girar a la izquierda' }))
    fireEvent.click(screen.getByRole('button', { name: 'Girar a la derecha' }))
    fireEvent.click(screen.getByRole('button', { name: 'Acercar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Alejar' }))
    expect(visor.girar.mock.calls).toEqual([['izquierda'], ['derecha']])
    expect(visor.acercar).toHaveBeenCalledTimes(1)
    expect(visor.alejar).toHaveBeenCalledTimes(1)
  })

  it('"Ingresar" con el edificio listo lleva la cámara a la puerta y, al llegar, abre el tablero de la batería', async () => {
    await abrirSivu()
    emitir(LISTO)

    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(ultimoVisor().enfocarPuerta).toHaveBeenCalledTimes(1)

    emitir({ ...LISTO, enfocandoPuerta: true, rotacionActiva: false })
    expect(bloque()).toHaveClass('ed-enfocando')
    expect(navegacion.irA).not.toHaveBeenCalled()
    emitir({ ...LISTO, enfocandoPuerta: false, rotacionActiva: false })

    expect(await screen.findByText('Abriendo el tablero de la batería de indicadores.')).toHaveAttribute('role', 'status')
    await waitFor(() => expect(navegacion.irA).toHaveBeenCalledWith(URL_TABLERO))
    expect(navegacion.irA).toHaveBeenCalledTimes(1)
  })

  it('llegar a la puerta con doble clic (sin "Ingresar") anuncia la llegada y no abre el tablero', async () => {
    await abrirSivu()
    emitir(LISTO)
    emitir({ ...LISTO, enfocandoPuerta: true, rotacionActiva: false })
    emitir({ ...LISTO, enfocandoPuerta: false, rotacionActiva: false })

    expect(await screen.findByText('Vista de la entrada del edificio.')).toHaveAttribute('role', 'status')
    expect(navegacion.irA).not.toHaveBeenCalled()
  })

  it('"Ingresar" mientras carga espera al edificio y entonces va a la puerta', async () => {
    await abrirSivu()

    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(ultimoVisor().enfocarPuerta).not.toHaveBeenCalled()
    expect(bloque()).toHaveClass('ed-esperando')
    expect(
      await screen.findByText('El edificio se está cargando; la vista irá a la entrada al terminar.'),
    ).toBeInTheDocument()

    emitir(LISTO)

    expect(ultimoVisor().enfocarPuerta).toHaveBeenCalledTimes(1)
    expect(bloque()).not.toHaveClass('ed-esperando')
  })

  it('muestra el error y "Reintentar" crea un visor nuevo, con el foco en el mensaje', async () => {
    await abrirSivu()
    const primero = ultimoVisor()

    emitir({ fase: 'error', error: { tipo: 'carga', mensaje: 'No se pudo descargar el modelo del edificio (error 404).' } })
    expect(screen.getByText('No se pudo descargar el modelo del edificio (error 404).')).toHaveAttribute('role', 'status')
    expect(bloque()).toHaveAttribute('data-estado', 'error')
    expect(bloque()).toHaveClass('ed-error')

    const reintentar = screen.getByRole('button', { name: 'Reintentar' })
    reintentar.focus()
    fireEvent.click(reintentar)

    expect(primero.dispose).toHaveBeenCalledTimes(1)
    expect(simulado.instancias).toHaveLength(2)
    expect(bloque()).toHaveAttribute('data-estado', 'cargando')
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
    // El botón desaparece: el foco pasa al mensaje de carga y no se pierde en <body>.
    expect(screen.getByText('Cargando el edificio en 3D…')).toHaveFocus()
  })

  it('si el error llega con el foco en el mensaje, pasa al botón "Reintentar"', async () => {
    await abrirSivu()

    act(() => screen.getByText('Cargando el edificio en 3D…').focus())
    emitir({ fase: 'error', error: { tipo: 'carga', mensaje: 'No se pudo leer el modelo 3D del edificio.' } })

    expect(screen.getByRole('button', { name: 'Reintentar' })).toHaveFocus()
  })

  it('sin WebGL no ofrece "Reintentar" e "Ingresar" abre el tablero de una vez', async () => {
    await abrirSivu()

    emitir({ fase: 'error', rotacionActiva: false, error: { tipo: 'webgl', mensaje: 'Tu navegador no puede mostrar el edificio en 3D.' } })
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))

    await waitFor(() => expect(navegacion.irA).toHaveBeenCalledWith(URL_TABLERO))
    expect(simulado.instancias).toHaveLength(1)
  })

  it('"Ingresar" después de un error de carga reintenta y espera al edificio', async () => {
    await abrirSivu()
    emitir({ fase: 'error', error: { tipo: 'carga', mensaje: 'No se pudo leer el modelo 3D del edificio.' } })

    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }))
    expect(simulado.instancias).toHaveLength(2)

    emitir(LISTO)
    expect(ultimoVisor().enfocarPuerta).toHaveBeenCalledTimes(1)
  })

  it('"Conoce más" baja a los tableros y les pasa el foco', async () => {
    const desplazar = vi.fn<(opciones?: ScrollIntoViewOptions | boolean) => void>()
    Element.prototype.scrollIntoView = desplazar
    await abrirSivu()

    const conoceMas = screen.getByRole('link', { name: 'Conoce más' })
    expect(conoceMas).toHaveAttribute('href', '#tableros')
    fireEvent.click(conoceMas)

    const tableros = screen.getByRole('region', { name: 'Tableros de información' })
    expect(desplazar).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(tableros).toHaveFocus()
  })

  it('la rueda sin Ctrl muestra junto al puntero cómo acercar, y el aviso se va solo', async () => {
    await abrirSivu()
    emitir(LISTO)
    vi.useFakeTimers()

    act(() => ultimoVisor().opciones.alUsarRuedaSinTecla?.(new WheelEvent('wheel', { clientY: 200 })))

    const aviso = bloque().querySelector('.ed-aviso')
    expect(aviso).toHaveClass('ed-visible')
    expect(aviso).toHaveTextContent(/rueda del ratón/)
    expect(aviso).toHaveAttribute('aria-hidden', 'true')

    act(() => vi.advanceTimersByTime(1600))
    expect(aviso).not.toHaveClass('ed-visible')
  })

  it('libera el visor al salir de la página', async () => {
    const router = await abrirSivu()
    const visor = ultimoVisor()

    await act(() => router.navigate('/sivu/otra'))

    expect(await screen.findByText('Esta página no existe dentro de SIVU.')).toBeInTheDocument()
    expect(visor.dispose).toHaveBeenCalledTimes(1)
  })
})

describe('SIVU: rutas', () => {
  it('"/sivu/x" muestra el 404 propio de SIVU con enlace a /sivu', async () => {
    await renderizarEn('/sivu/x')

    expect(await screen.findByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeInTheDocument()
    expect(screen.getByText('Esta página no existe dentro de SIVU.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Volver al edificio' })).toHaveAttribute('href', '/sivu')
    expect(document.title).toBe('Página no encontrada · Sistema de Visualización de Datos')
    // El 404 conserva la cabecera y el pie, pero no monta el visor 3D.
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(simulado.instancias).toHaveLength(0)
  })
})
