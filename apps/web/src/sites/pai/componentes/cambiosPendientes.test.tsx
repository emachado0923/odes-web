import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { Link, Outlet, createMemoryRouter, useNavigate } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProveedorSesionPrueba } from '../pruebas/ProveedorSesionPrueba'
import { ok, simularApiPai } from '../tablero/apiPruebaPai'
import { respuestaReportePrueba, reportePrueba, tableroPrueba } from '../tablero/datosPruebaTablero'
import PaginaTablero from '../tablero/PaginaTablero'
import BarraPai from './BarraPai'
import { ContextoCambios, ESTADO_SIN_GUARDIA, crearRegistroCambios, useCambiosPendientes, type RegistroCambios } from './cambiosPendientes'
import GuardiaCambios from './GuardiaCambios'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('registro de cambios', () => {
  it('marca, avisa a los suscriptores solo cuando cambia hay() y sigue los guardados en curso', async () => {
    const registro = crearRegistroCambios()
    const oyente = vi.fn<() => void>()
    const dejar = registro.suscribir(oyente)
    registro.marcar('a', true)
    registro.marcar('b', true)
    expect(registro.hay()).toBe(true)
    expect(oyente).toHaveBeenCalledTimes(1)
    registro.marcar('a', false)
    registro.marcar('b', false)
    expect(registro.hay()).toBe(false)
    expect(oyente).toHaveBeenCalledTimes(2)
    dejar()

    let terminar: (valor: string) => void = () => undefined
    const guardado = new Promise<string>((resolver) => {
      terminar = resolver
    })
    expect(registro.seguir(guardado)).toBe(guardado)
    expect(registro.guardando()).toBe(true)
    const listo = vi.fn<() => void>()
    void registro.esperarGuardados().then(listo)
    await Promise.resolve()
    expect(listo).not.toHaveBeenCalled()
    terminar('ok')
    await waitFor(() => expect(listo).toHaveBeenCalled())
    expect(registro.guardando()).toBe(false)
    // Un guardado que falla también termina.
    const fallido = Promise.reject(new Error('x'))
    registro.seguir(fallido).catch(() => undefined)
    await registro.esperarGuardados()
    expect(registro.guardando()).toBe(false)
  })
})

function Editor() {
  const [texto, setTexto] = useState('')
  useCambiosPendientes(texto !== '')
  const navigate = useNavigate()
  return (
    <>
      <label htmlFor="editor">Texto</label>
      <input id="editor" value={texto} onChange={(e) => setTexto(e.target.value)} />
      <Link to="/pai/otra">Otra página</Link>
      <Link to="/pai?filtro=1">Filtrar</Link>
      <button type="button" onClick={() => navigate('/pai/otra', { state: ESTADO_SIN_GUARDIA })}>
        Salir sin guardia
      </button>
    </>
  )
}

function montarGuardia(registro: RegistroCambios = crearRegistroCambios()) {
  const router = createMemoryRouter(
    [
      {
        path: '/pai',
        element: (
          <ContextoCambios value={registro}>
            <Outlet />
            <GuardiaCambios />
          </ContextoCambios>
        ),
        children: [
          { index: true, element: <Editor /> },
          { path: 'otra', element: <p>Otra página cargada</p> },
        ],
      },
    ],
    { initialEntries: ['/pai'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

describe('GuardiaCambios', () => {
  it('con cambios sin guardar, un enlace a otra página pregunta; "Seguir editando" se queda y "Salir sin guardar" sale', async () => {
    const router = montarGuardia()
    fireEvent.change(screen.getByLabelText('Texto'), { target: { value: 'a medias' } })
    fireEvent.click(screen.getByRole('link', { name: 'Otra página' }))
    const aviso = await screen.findByRole('alertdialog', { name: 'Hay cambios sin guardar' })
    expect(aviso).toHaveTextContent('Si sale de esta página ahora, se perderán los cambios que no ha guardado.')
    expect(screen.getByRole('button', { name: 'Seguir editando' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(router.state.location.pathname).toBe('/pai')
    expect(screen.getByLabelText('Texto')).toHaveValue('a medias')

    // Atrás/Adelante también pasan por aquí (POP).
    fireEvent.click(screen.getByRole('link', { name: 'Otra página' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Salir sin guardar' }))
    expect(await screen.findByText('Otra página cargada')).toBeInTheDocument()
  })

  it('sin cambios, o si solo cambia la consulta (filtros), o con ESTADO_SIN_GUARDIA, no pregunta', async () => {
    const router = montarGuardia()
    fireEvent.change(screen.getByLabelText('Texto'), { target: { value: 'algo' } })
    fireEvent.click(screen.getByRole('link', { name: 'Filtrar' }))
    await waitFor(() => expect(router.state.location.search).toBe('?filtro=1'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Salir sin guardia' }))
    expect(await screen.findByText('Otra página cargada')).toBeInTheDocument()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('beforeunload (recargar, cerrar la pestaña) solo se detiene mientras hay cambios', async () => {
    montarGuardia()
    const sinCambios = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(sinCambios)
    expect(sinCambios.defaultPrevented).toBe(false)
    fireEvent.change(screen.getByLabelText('Texto'), { target: { value: 'algo' } })
    await waitFor(() => {
      const conCambios = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(conCambios)
      expect(conCambios.defaultPrevented).toBe(true)
    })
    fireEvent.change(screen.getByLabelText('Texto'), { target: { value: '' } })
    await waitFor(() => {
      const otraVez = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(otraVez)
      expect(otraVez.defaultPrevented).toBe(false)
    })
  })
})

describe('Cerrar sesión con una casilla que se está guardando', () => {
  it('espera a que termine el guardado ("Guardando…") en vez de avisar que se perderá', async () => {
    const tablero = tableroPrueba()
    simularApiPai((p) => {
      if (p.metodo === 'GET' && p.ruta === '/api/pai/tablero') return ok(tablero)
      if (p.metodo === 'PUT') {
        return ok(
          respuestaReportePrueba(
            tablero.indicadores[0],
            reportePrueba(4, { avance: 1, porcentaje: 0.5, estado: 'reportado', actualizadoEn: '2026-08-20T15:00:00.000Z', editable: true, motivo: 'abierto' }),
          ),
        )
      }
      return undefined
    })
    // El PUT tarda hasta que la prueba lo suelte.
    let soltar: () => void = () => undefined
    const espera = new Promise<void>((resolver) => {
      soltar = resolver
    })
    const original = globalThis.fetch
    vi.stubGlobal('fetch', async (url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') await espera
      return original(url, init)
    })
    const registro = crearRegistroCambios()
    const router = createMemoryRouter(
      [
        {
          path: '/pai/*',
          element: (
            <ContextoCambios value={registro}>
              <ProveedorSesionPrueba rol="responsable">
                <BarraPai />
                <PaginaTablero />
              </ProveedorSesionPrueba>
            </ContextoCambios>
          ),
        },
      ],
      { initialEntries: ['/pai/x'] },
    )
    render(<RouterProvider router={router} />)
    const campo = await screen.findByLabelText(/Avance de SAF-TH-01/)
    fireEvent.change(campo, { target: { value: '1' } })
    // Pulsar "Cerrar sesión" saca el foco de la casilla (se guarda) y luego hace clic.
    fireEvent.blur(campo)
    const salir = screen.getByRole('button', { name: 'Cerrar sesión' })
    fireEvent.click(salir)
    expect(await screen.findByRole('button', { name: 'Guardando…' })).toBeDisabled()
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await act(async () => soltar())
    await waitFor(() => expect(router.state.location.pathname).toBe('/pai'))
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    expect(registro.hay()).toBe(false)
  })
})
