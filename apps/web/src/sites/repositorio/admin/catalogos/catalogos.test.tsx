import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CABECERA_CSRF } from '../../api-repositorio'
import { ApiSimulada, CSRF_PRUEBA, error, instalarApi } from '../pruebas/apiSimulada'
import { boton, esperarTitulo, renderAdmin } from '../pruebas/renderAdmin'
import { filtrarPalabras } from './palabras'

let api: ApiSimulada

beforeEach(() => {
  api = new ApiSimulada()
  api.sesionActiva = true
  instalarApi(api)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function responder(metodo: string, ruta: string, cuerpo: unknown, estado = 200) {
  api.forzar(metodo, ruta, { estado, cuerpo })
}

describe('categorías', () => {
  async function abrir() {
    renderAdmin('/repositorio/admin/categorias')
    await esperarTitulo('Categorías')
    return screen.findByRole('list', { name: 'Categorías, en su orden' }, { timeout: 3000 })
  }

  it('lista en su orden, con el número de documentos', async () => {
    const lista = await abrir()
    const items = within(lista).getAllByRole('listitem')
    expect(items).toHaveLength(8)
    expect(items[0]).toHaveTextContent('Boletín')
    expect(items[1]).toHaveTextContent('Estudio')
  })

  it('crea una categoría (POST con CSRF); el nombre vacío se explica', async () => {
    await abrir()
    fireEvent.click(boton('Agregar'))
    expect(await screen.findByText('Escriba el nombre de la categoría.')).toBeInTheDocument()
    responder('POST', '/api/repositorio/admin/categorias', { id: 9, nombre: 'Cartillas', orden: 9, documentos: 0 }, 201)
    fireEvent.change(screen.getByLabelText('Nueva categoría'), { target: { value: '  Cartillas ' } })
    await act(async () => fireEvent.click(boton('Agregar')))
    expect(await screen.findByText('Cartillas')).toBeInTheDocument()
    const p = api.mutaciones()[0]
    expect(p.cuerpo).toEqual({ nombre: 'Cartillas' })
    expect(p.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
  })

  it('reordena con "Bajar" (PUT orden) y anuncia la posición', async () => {
    await abrir()
    responder('PUT', '/api/repositorio/admin/categorias/1', { ...api.categorias[0], orden: 2 })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Bajar «Boletín» (posición 1 de 8)' })))
    expect(api.mutaciones()[0]).toMatchObject({ metodo: 'PUT', cuerpo: { orden: 2 } })
    const items = within(screen.getByRole('list', { name: 'Categorías, en su orden' })).getAllByRole('listitem')
    await waitFor(() => expect(items[0]).toHaveTextContent('Estudio'))
    expect(screen.getByText('«Boletín» quedó en la posición 2 de 8.')).toBeInTheDocument()
  })

  it('renombra en el sitio (Esc cancela)', async () => {
    await abrir()
    fireEvent.click(boton('Renombrar «Estudio»'))
    const campo = screen.getByLabelText('Nuevo nombre de «Estudio»')
    expect(campo).toHaveFocus()
    fireEvent.keyDown(campo, { key: 'Escape' })
    expect(screen.queryByLabelText('Nuevo nombre de «Estudio»')).not.toBeInTheDocument()

    fireEvent.click(boton('Renombrar «Estudio»'))
    responder('PUT', '/api/repositorio/admin/categorias/2', { ...api.categorias[1], nombre: 'Estudios' })
    fireEvent.change(screen.getByLabelText('Nuevo nombre de «Estudio»'), { target: { value: 'Estudios' } })
    await act(async () => fireEvent.click(boton('Guardar')))
    expect(await screen.findByText('La categoría ahora se llama «Estudios».')).toBeInTheDocument()
    expect(api.mutaciones()[0].cuerpo).toEqual({ nombre: 'Estudios' })
  })

  it('borrar una categoría con documentos muestra el mensaje del 409', async () => {
    await abrir()
    api.forzar('DELETE', '/api/repositorio/admin/categorias/1', error(409, 'conflicto', 'La categoría «Boletín» tiene documentos: muévalos a otra antes de borrarla.'))
    await act(async () => fireEvent.click(boton('Borrar «Boletín»')))
    expect(await screen.findByRole('alert')).toHaveTextContent('La categoría «Boletín» tiene documentos')
    expect(screen.getAllByText('Boletín').length).toBeGreaterThan(0)
  })

  it('borra una categoría sin documentos (204)', async () => {
    await abrir()
    responder('DELETE', '/api/repositorio/admin/categorias/8', undefined, 204)
    await act(async () => fireEvent.click(boton('Borrar «Otros productos»')))
    expect(await screen.findByText('Se borró la categoría «Otros productos».')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Categorías, en su orden' })).getAllByRole('listitem')).toHaveLength(7)
  })
})

describe('palabras clave', () => {
  async function abrir() {
    renderAdmin('/repositorio/admin/palabras-clave')
    await esperarTitulo('Palabras clave')
    return screen.findByRole('table', {}, { timeout: 3000 })
  }

  it('lista con el número de documentos, ordenada por uso; busca sin tildes', async () => {
    const tabla = await abrir()
    const filas = within(tabla).getAllByRole('row').slice(1)
    expect(filas[0]).toHaveTextContent('Educación superior40')
    // El conteo lleva al listado filtrado por esa palabra exacta (no a la búsqueda difusa).
    expect(within(filas[0]).getByRole('link')).toHaveAttribute('href', '/repositorio/admin?clave=Educaci%C3%B3n%20superior')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar palabra clave' }), { target: { value: 'desercion' } })
    await waitFor(() => expect(within(tabla).getAllByRole('row')).toHaveLength(2))
    expect(screen.getByText('1 de 5 palabras clave')).toBeInTheDocument()
  })

  it('solo las que no se usan tienen "Borrar"; borra con DELETE', async () => {
    await abrir()
    expect(() => boton('Borrar «Acceso»')).toThrow('No hay un botón')
    responder('DELETE', '/api/repositorio/admin/palabras-clave/5', undefined, 204)
    await act(async () => fireEvent.click(boton('Borrar «Palabra sin uso»')))
    expect(await screen.findByText('Se borró la palabra clave «Palabra sin uso».')).toBeInTheDocument()
  })

  it('renombrar a una que ya existe avisa que se unirán', async () => {
    await abrir()
    fireEvent.click(boton('Renombrar «Matrícula»'))
    const campo = screen.getByLabelText('Nuevo texto de «Matrícula»')
    fireEvent.change(campo, { target: { value: 'acceso' } })
    expect(screen.getByText(/Ya existe «Acceso» \(30 documentos\): al guardar, las dos se unen/)).toBeInTheDocument()
    expect(boton('Unir')).toBeInTheDocument()
    responder('PUT', '/api/repositorio/admin/palabras-clave/4', { id: 2, texto: 'acceso', documentos: 50 })
    await act(async () => fireEvent.click(boton('Unir')))
    expect(await screen.findByText('«Matrícula» se unió con «acceso».')).toBeInTheDocument()
    expect(api.mutaciones()[0]).toMatchObject({ metodo: 'PUT', cuerpo: { texto: 'acceso' } })
  })

  it('filtrarPalabras: sin uso y alfabético', () => {
    const lista = filtrarPalabras(api.palabras, '', true, 'texto')
    expect(lista.map((p) => p.texto)).toEqual(['Palabra sin uso'])
    expect(filtrarPalabras(api.palabras, '', false, 'texto')[0].texto).toBe('Acceso')
  })
})

describe('registro de cambios', () => {
  it('muestra los últimos cambios y permite pedir más', async () => {
    renderAdmin('/repositorio/admin/cambios')
    await esperarTitulo('Registro de cambios')
    const tabla = await screen.findByRole('table', {}, { timeout: 3000 })
    expect(within(tabla).getByText('Los últimos 2 cambios, del más reciente al más antiguo')).toBeInTheDocument()
    expect(within(tabla).getByText('Publicó «Boletín 29»')).toBeInTheDocument()
    expect(api.peticiones.at(-1)!.ruta).toBe('/api/repositorio/admin/cambios?limite=50')
    fireEvent.change(screen.getByLabelText('Mostrar'), { target: { value: '200' } })
    await waitFor(() => expect(api.peticiones.at(-1)!.ruta).toBe('/api/repositorio/admin/cambios?limite=200'))
  })

  it('el historial de un documento pide solo sus cambios', async () => {
    renderAdmin('/repositorio/admin/cambios?documento=boletin-29')
    expect(await esperarTitulo('Historial del documento')).toBeInTheDocument()
    await screen.findByRole('table', {}, { timeout: 3000 })
    expect(api.peticiones.at(-1)!.ruta).toBe('/api/repositorio/admin/cambios?limite=50&documento=boletin-29')
  })
})
