import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { ErrorCrmHttp } from './clienteCrm'
import { useCarga } from './useCarga'

/** Una promesa que se resuelve o se rechaza desde la prueba. */
function diferida<T>() {
  let resolver!: (valor: T) => void
  let rechazar!: (error: unknown) => void
  const promesa = new Promise<T>((si, no) => {
    resolver = si
    rechazar = no
  })
  return { promesa, resolver, rechazar }
}

describe('useCarga', () => {
  it('empieza cargando y entrega los datos', async () => {
    const { result } = renderHook(() => useCarga(async () => ['a', 'b'], []))
    expect(result.current).toMatchObject({ estado: 'cargando', datos: null })
    await waitFor(() => expect(result.current.estado).toBe('listo'))
    expect(result.current.datos).toEqual(['a', 'b'])
  })

  it('al cambiar las deps cancela la petición anterior y no pinta datos de las deps viejas', async () => {
    const pedidos: { id: number; signal: AbortSignal; d: ReturnType<typeof diferida<string>> }[] = []
    const { result, rerender } = renderHook(
      ({ id }) =>
        useCarga((signal) => {
          const d = diferida<string>()
          pedidos.push({ id, signal, d })
          return d.promesa
        }, [id]),
      { initialProps: { id: 1 } },
    )
    await act(async () => pedidos.at(-1)?.d.resolver('tablero de 1'))
    expect(result.current).toMatchObject({ estado: 'listo', datos: 'tablero de 1' })

    rerender({ id: 2 })
    expect(result.current).toMatchObject({ estado: 'cargando', datos: null })
    const deUno = pedidos.filter((p) => p.id === 1)
    expect(deUno.every((p) => p.signal.aborted)).toBe(true)

    await act(async () => pedidos.at(-1)?.d.resolver('tablero de 2'))
    expect(result.current).toMatchObject({ estado: 'listo', datos: 'tablero de 2' })
  })

  it('recargar conserva los datos mientras carga y los cambia al llegar', async () => {
    let n = 0
    const { result } = renderHook(() => useCarga(async () => `versión ${++n}`, []))
    await waitFor(() => expect(result.current.datos).toBe('versión 1'))
    const pedidosAntes = n

    act(() => result.current.recargar())
    expect(result.current).toMatchObject({ estado: 'cargando', datos: 'versión 1' })
    await waitFor(() => expect(result.current.estado).toBe('listo'))
    expect(n).toBeGreaterThan(pedidosAntes)
    expect(result.current.datos).toBe(`versión ${n}`)
  })

  it('un error queda en `error`; una cancelación no cuenta', async () => {
    const fallo = new ErrorCrmHttp('red', 'Sin conexión')
    const { result } = renderHook(() => useCarga(() => Promise.reject(fallo), []))
    await waitFor(() => expect(result.current.estado).toBe('error'))
    expect(result.current.error).toBe(fallo)

    const cancelada = renderHook(() => useCarga(() => Promise.reject(new ErrorCrmHttp('abortado', 'Cancelada')), []))
    await act(async () => {})
    expect(cancelada.result.current.estado).toBe('cargando')
  })

  it('ponerDatos cambia lo cargado sin volver a pedir', async () => {
    const cargar = vi.fn<(signal: AbortSignal) => Promise<number[]>>(async () => [1, 2])
    const { result } = renderHook(() => useCarga(cargar, []))
    await waitFor(() => expect(result.current.estado).toBe('listo'))
    const llamadas = cargar.mock.calls.length

    act(() => result.current.ponerDatos((anterior) => [...(anterior ?? []), 3]))
    expect(result.current.datos).toEqual([1, 2, 3])
    expect(cargar.mock.calls.length).toBe(llamadas)
  })

  it('con conservarAlCambiar mantiene los datos mientras llegan los de las deps nuevas', async () => {
    const { result, rerender } = renderHook(({ q }) => useCarga(async () => `resultados de ${q}`, [q], { conservarAlCambiar: true }), {
      initialProps: { q: 'informe' },
    })
    await waitFor(() => expect(result.current.datos).toBe('resultados de informe'))
    rerender({ q: 'matriz' })
    expect(result.current).toMatchObject({ estado: 'cargando', datos: 'resultados de informe' })
    await waitFor(() => expect(result.current.datos).toBe('resultados de matriz'))
  })
})
