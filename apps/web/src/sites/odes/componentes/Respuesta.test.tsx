import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RespuestaAsistente } from '../chat/conversacion'
import Respuesta, { ESPERA_REVISANDO, MENSAJE_RECHAZO } from './Respuesta'

function respuesta(cambios: Partial<RespuestaAsistente>): RespuestaAsistente {
  return {
    tipo: 'asistente',
    id: 'r1',
    idPregunta: 'p1',
    estado: 'completa',
    modo: 'ia',
    texto: '',
    fuentes: [],
    busquedas: [],
    documentos: [],
    error: null,
    ...cambios,
  }
}

/** Avanza el reloj de a un segundo, dejando que React vuelva a dibujar (y a programar el siguiente temporizador) en cada paso. */
function avanzar(ms: number) {
  for (let hecho = 0; hecho < ms; hecho += 1000) act(() => vi.advanceTimersByTime(Math.min(1000, ms - hecho)))
}

describe('Respuesta', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('límite de uso: la espera visible baja mientras se espera y "Reintentar" se habilita al terminar', () => {
    const limite = respuesta({
      estado: 'error',
      error: { codigo: 'limite_uso', mensaje: 'Espera un poco.', reintentarDesde: Date.now() + 59_000 },
    })
    render(<Respuesta respuesta={limite} onReintentar={() => {}} />)
    const boton = screen.getByRole('button', { name: 'Reintentar' })
    expect(screen.getByText('Podrás volver a preguntar en 59 segundos.')).toBeInTheDocument()
    expect(boton).toBeDisabled()

    avanzar(30_000)
    expect(screen.getByText('Podrás volver a preguntar en 29 segundos.')).toBeInTheDocument()
    expect(boton).toBeDisabled()

    avanzar(29_000)
    expect(screen.queryByText(/Podrás volver a preguntar/)).not.toBeInTheDocument()
    expect(boton).toBeEnabled()
  })

  it('una espera larga se muestra en minutos y también se actualiza', () => {
    const limite = respuesta({
      estado: 'error',
      error: { codigo: 'limite_uso', mensaje: 'Llegaste al límite de hoy.', reintentarDesde: Date.now() + 5 * 60_000 },
    })
    render(<Respuesta respuesta={limite} onReintentar={() => {}} />)
    expect(screen.getByText('Podrás volver a preguntar en 5 minutos.')).toBeInTheDocument()
    avanzar(3 * 60_000)
    expect(screen.getByText('Podrás volver a preguntar en 2 minutos.')).toBeInTheDocument()
    avanzar(90_000)
    expect(screen.getByText('Podrás volver a preguntar en 30 segundos.')).toBeInTheDocument()
  })

  it('paso en vivo: la frase del servidor y, si se alarga, lo que sigue; desaparece al llegar el texto', () => {
    const buscando = respuesta({
      estado: 'buscando',
      busquedas: [{ herramienta: 'buscar', descripcion: 'Buscando “deserción 2023”', posicion: 0 }],
    })
    const { rerender } = render(<Respuesta respuesta={buscando} />)
    expect(screen.getByText('Buscando “deserción 2023”…')).toBeInTheDocument()
    avanzar(ESPERA_REVISANDO)
    expect(screen.getByText('Revisando lo que encontré…')).toBeInTheDocument()
    expect(screen.queryByText(/Buscando/)).not.toBeInTheDocument()

    // Un paso nuevo empieza de cero con su propia frase.
    const leyendo = respuesta({
      ...buscando,
      busquedas: [...buscando.busquedas, { herramienta: 'leer', descripcion: 'Leyendo “Boletín 29”', posicion: 0 }],
    })
    rerender(<Respuesta respuesta={leyendo} />)
    expect(screen.getByText('Leyendo “Boletín 29”…')).toBeInTheDocument()
    avanzar(ESPERA_REVISANDO * 2)
    expect(screen.getByText('Leyendo “Boletín 29”…')).toBeInTheDocument()
    expect(document.querySelectorAll('.odes-paso')).toHaveLength(1)

    rerender(<Respuesta respuesta={{ ...leyendo, estado: 'escribiendo', texto: 'La deserción bajó.' }} />)
    expect(screen.getByText('La deserción bajó.')).toBeInTheDocument()
    expect(document.querySelectorAll('.odes-paso')).toHaveLength(0)
  })

  it('una consulta después de parte del texto se muestra debajo de él', () => {
    const r = respuesta({
      estado: 'escribiendo',
      texto: 'Primero esto.',
      busquedas: [{ herramienta: 'listar', descripcion: 'Consultando el catálogo: “matrícula”', posicion: 13 }],
    })
    render(<Respuesta respuesta={r} />)
    const paso = screen.getByText('Consultando el catálogo: “matrícula”…')
    expect(screen.getByText('Primero esto.').compareDocumentPosition(paso) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('rechazo: un solo aviso', () => {
    render(<Respuesta respuesta={respuesta({ estado: 'rechazada' })} />)
    expect(screen.getAllByText(MENSAJE_RECHAZO)).toHaveLength(1)
    expect(document.querySelectorAll('.odes-burbuja')).toHaveLength(1)
  })
})
