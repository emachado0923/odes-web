import { describe, expect, it } from 'vitest'
import { LectorSSE } from './sse'

/** Pasa los trozos al lector (y opcionalmente cierra el flujo) y devuelve los mensajes entregados. */
function leer(trozos: string[], terminar = false): string[] {
  const mensajes: string[] = []
  const lector = new LectorSSE((datos) => mensajes.push(datos))
  for (const trozo of trozos) lector.agregar(trozo)
  if (terminar) lector.terminar()
  return mensajes
}

/** Todas las formas de partir un texto en dos trozos. */
function particiones(texto: string): string[][] {
  return Array.from({ length: texto.length + 1 }, (_, i) => [texto.slice(0, i), texto.slice(i)])
}

describe('LectorSSE', () => {
  it('entrega un evento por cada línea en blanco', () => {
    expect(leer(['data: {"tipo":"inicio"}\n\n'])).toEqual(['{"tipo":"inicio"}'])
  })

  it('acepta varios eventos en un mismo trozo', () => {
    expect(leer(['data: 1\n\ndata: 2\n\ndata: 3\n\n'])).toEqual(['1', '2', '3'])
  })

  it('arma el evento aunque llegue partido en cualquier punto', () => {
    const flujo = 'data: {"tipo":"texto","delta":"Hola"}\n\ndata: {"tipo":"fin"}\r\n\r\n'
    for (const trozos of particiones(flujo)) {
      expect(leer(trozos)).toEqual(['{"tipo":"texto","delta":"Hola"}', '{"tipo":"fin"}'])
    }
  })

  it('arma el evento aunque llegue carácter por carácter', () => {
    const flujo = ': ping\n\ndata: {"a":1}\r\n\r\ndata: {"b":2}\r\r'
    expect(leer(Array.from(flujo))).toEqual(['{"a":1}', '{"b":2}'])
  })

  it('ignora los comentarios ": ping" y no entrega eventos vacíos', () => {
    expect(leer([': ping\n\n', ':otro comentario\n', '\n', 'data: x\n\n'])).toEqual(['x'])
  })

  it('reconoce los finales de línea CRLF, CR y LF', () => {
    expect(leer(['data: a\r\n\r\ndata: b\r\rdata: c\n\n'])).toEqual(['a', 'b', 'c'])
  })

  it('trata "\\r" al final de un trozo y "\\n" al principio del siguiente como un solo salto', () => {
    expect(leer(['data: a\r', '\n\r', '\ndata: b\r\n\r\n'])).toEqual(['a', 'b'])
  })

  it('une varias líneas data: con "\\n" y quita un solo espacio tras los dos puntos', () => {
    expect(leer(['data: uno\ndata:dos\ndata:  tres\n\n'])).toEqual(['uno\ndos\n tres'])
  })

  it('ignora event:, id:, retry:, campos desconocidos y líneas sin dos puntos', () => {
    expect(leer(['event: mensaje\nid: 7\nretry: 1000\nbasura\nx: y\ndata: ok\n\n'])).toEqual(['ok'])
  })

  it('una línea "data" sin dos puntos aporta un valor vacío', () => {
    expect(leer(['data\ndata: b\n\n'])).toEqual(['\nb'])
  })

  it('al terminar entrega el último evento aunque falte la línea en blanco', () => {
    expect(leer(['data: 1\n\ndata: 2'], false)).toEqual(['1'])
    expect(leer(['data: 1\n\ndata: 2'], true)).toEqual(['1', '2'])
    expect(leer(['data: 3\n'], true)).toEqual(['3'])
  })

  it('descarta una línea sin terminar que supera el tope', () => {
    const mensajes: string[] = []
    const lector = new LectorSSE((datos) => mensajes.push(datos), 10)
    lector.agregar('data: 0123456789abcdef')
    lector.agregar('\n\ndata: ok\n\n')
    expect(mensajes).toEqual(['ok'])
  })
})
