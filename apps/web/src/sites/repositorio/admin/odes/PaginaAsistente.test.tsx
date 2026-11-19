import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CABECERA_CSRF } from '../../api-repositorio'
import { ApiSimulada, CSRF_PRUEBA, error, instalarApi } from '../pruebas/apiSimulada'
import { boton, esperarTitulo, renderAdmin } from '../pruebas/renderAdmin'
import { INTERVALO_ESTADO_MS } from './PaginaAsistente'

let api: ApiSimulada

beforeEach(() => {
  api = new ApiSimulada(5)
  api.sesionActiva = true
  instalarApi(api)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function abrir() {
  renderAdmin('/repositorio/admin/asistente')
  await esperarTitulo('Asistente ODES')
  await screen.findByRole('heading', { level: 2, name: 'Índice actual' }, { timeout: 3000 })
}

describe('Asistente ODES (índice)', () => {
  it('muestra el índice y avisa que conviene reindexar, con el motivo', async () => {
    await abrir()
    expect(screen.getByText('El paquete de datos de la carga inicial')).toBeInTheDocument()
    expect(screen.getByText('372 documentos (365 con texto)')).toBeInTheDocument()
    expect(screen.getByText(/Conviene reindexar\./).closest('p')).toHaveTextContent('se generó desde el paquete de datos')
    expect(document.querySelector('.ra-estado-reindexacion')).toHaveAttribute('role', 'status')
    expect(document.querySelector('.ra-estado-reindexacion')).toHaveTextContent('No se ha pedido ninguna reindexación')
  })

  it('"Reindexar" hace POST con el token CSRF y sigue el progreso hasta terminar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await abrir()
    await act(async () => fireEvent.click(boton('Reindexar')))
    const post = api.mutaciones()[0]
    expect(post).toMatchObject({ metodo: 'POST', ruta: '/api/repositorio/admin/odes/reindexar' })
    expect(post.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
    expect(await screen.findByText('Se inició la reindexación del Asistente ODES.')).toBeInTheDocument()
    expect(boton('Reindexando…')).toBeDisabled()
    expect(screen.getByText('Leyendo 372 documentos…')).toBeInTheDocument()

    api.indiceOdes = {
      ...api.indiceOdes,
      indice: { ...api.indiceOdes.indice, origen: 'mysql' },
      repositorio: { ...api.indiceOdes.repositorio, cambiado: false, motivo: null },
      reindexacion: { ...api.indiceOdes.reindexacion, estado: 'completada', fin: '2026-10-08T15:05:00.000Z' },
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERVALO_ESTADO_MS + 10)
    })
    expect(await screen.findByText('La reindexación del Asistente ODES terminó.')).toBeInTheDocument()
    expect(screen.getByText('La última reindexación terminó bien.')).toBeInTheDocument()
    expect(screen.getByText(/El índice está al día con los 372 documentos publicados\./)).toBeInTheDocument()
    expect(boton('Reindexar')).toBeEnabled()
  })

  it('409 (ya hay una en curso) muestra el mensaje del servidor', async () => {
    api.forzar('POST', '/api/repositorio/admin/odes/reindexar', error(409, 'conflicto', 'Ya hay una reindexación en curso en otro proceso.'))
    await abrir()
    await act(async () => fireEvent.click(boton('Reindexar')))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Ya hay una reindexación en curso en otro proceso.'))
  })
})
