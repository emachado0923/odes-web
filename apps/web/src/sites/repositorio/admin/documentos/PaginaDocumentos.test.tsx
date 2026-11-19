import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CABECERA_CSRF } from '../../api-repositorio'
import { ApiSimulada, CSRF_PRUEBA, error, instalarApi } from '../pruebas/apiSimulada'
import { boton, esperarTitulo, renderAdmin } from '../pruebas/renderAdmin'

let api: ApiSimulada

beforeEach(() => {
  api = new ApiSimulada(120)
  api.sesionActiva = true
  api.documentos[2].publicado = false
  instalarApi(api)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function abrir(ruta = '/repositorio/admin') {
  const r = renderAdmin(ruta)
  await esperarTitulo('Documentos')
  await screen.findByRole('table', {}, { timeout: 3000 })
  return r
}

const filas = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
const caption = () => screen.getByRole('table').querySelector('caption')!

describe('listado de documentos', () => {
  it('tabla accesible con caption, encabezados ordenables, conteos y 50 por página', async () => {
    await abrir()
    expect(caption()).toHaveTextContent('Documentos 1–50 de 120 (página 1 de 3)')
    expect(filas()).toHaveLength(50)
    expect(screen.getByRole('columnheader', { name: /Pos\./ })).toHaveAttribute('aria-sort', 'ascending')
    const resumen = screen.getByRole('list', { name: 'Resumen del repositorio' })
    expect(resumen).toHaveTextContent('120 documentos')
    expect(boton('119 publicados', resumen)).toHaveAttribute('aria-pressed', 'false')
    expect(boton('1 despublicados', resumen)).toBeInTheDocument()
    expect(document.querySelector('.ra-conteo')).toHaveTextContent('120 documentos en el repositorio')
    expect(document.querySelector('.ra-conteo')).toHaveAttribute('aria-live', 'polite')
  })

  it('?clave= filtra por la palabra clave exacta, se muestra como filtro activo y se puede quitar', async () => {
    const conAcceso = api.documentos.filter((d) => d.claves.includes('Acceso')).length
    expect(conAcceso).toBeGreaterThan(0)
    const { router } = await abrir('/repositorio/admin?clave=Acceso')
    const filtro = screen.getByRole('group', { name: 'Palabra clave' })
    expect(filtro).toHaveTextContent('Acceso')
    await waitFor(() =>
      expect(document.querySelector('.ra-conteo')).toHaveTextContent(
        conAcceso === 1 ? '1 de 120 documentos coincide' : `${conAcceso} de 120 documentos coinciden`,
      ),
    )
    expect(filas()).toHaveLength(Math.min(conAcceso, 50))
    fireEvent.click(within(filtro).getByRole('button', { name: 'Quitar el filtro de la palabra clave «Acceso»' }))
    expect(screen.queryByRole('group', { name: 'Palabra clave' })).not.toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Buscar' })).toHaveFocus()
    await waitFor(() => expect(document.querySelector('.ra-conteo')).toHaveTextContent('120 documentos en el repositorio'))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('busca con el motor difuso (sin tildes, con errores) y cuenta las coincidencias', async () => {
    const { router } = await abrir()
    const objetivo = api.documentos.find((d) => /Sinergia/.test(d.titulo)) ?? api.documentos[40]
    // La palabra más larga del título, sin tildes y con dos letras cambiadas de lugar.
    const palabra = objetivo.titulo
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .split(/\s+/)
      .sort((a, b) => b.length - a.length)[0]
      .toLowerCase()
    const conError = palabra.slice(0, 2) + palabra[3] + palabra[2] + palabra.slice(4)
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), { target: { value: conError } })
    await waitFor(() => expect(filas().some((f) => f.textContent?.includes(objetivo.titulo))).toBe(true))
    expect(router.state.location.search).toBe(`?q=${encodeURIComponent(conError)}`)
    await waitFor(() => expect(document.querySelector('.ra-conteo')).toHaveTextContent(/^\d+ de 120 documentos coincid/))
  })

  it('filtra por estado, tipo, idioma y lo que falta; "Limpiar filtros" los quita', async () => {
    await abrir()
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'despublicado' } })
    await waitFor(() => expect(filas()).toHaveLength(1))
    expect(filas()[0]).toHaveTextContent('Despublicado')
    fireEvent.click(boton('Limpiar filtros'))
    await waitFor(() => expect(filas()).toHaveLength(50))

    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'tablero' } })
    const tableros = api.documentos.filter((d) => d.tipo === 'tablero').length
    await waitFor(() => expect(caption()).toHaveTextContent(`de ${tableros}`))
    fireEvent.change(screen.getByLabelText('Idioma'), { target: { value: 'en' } })
    fireEvent.change(screen.getByLabelText('Le falta'), { target: { value: 'portada' } })
    expect(await screen.findByText('Ningún documento coincide')).toBeInTheDocument()
  })

  it('los botones del resumen filtran (aria-pressed)', async () => {
    await abrir()
    const b = boton('1 despublicados')
    fireEvent.click(b)
    expect(boton('1 despublicados')).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(filas()).toHaveLength(1))
  })

  it('ordena por columna (aria-sort) y la URL guarda filtros, orden y página', async () => {
    const { router } = await abrir('/repositorio/admin?pagina=2')
    expect(caption()).toHaveTextContent('Documentos 51–100 de 120 (página 2 de 3)')
    fireEvent.click(boton(/^Título/, screen.getByRole('columnheader', { name: /Título/ })))
    expect(screen.getByRole('columnheader', { name: /Título/ })).toHaveAttribute('aria-sort', 'ascending')
    // Ordenar vuelve a la página 1.
    await waitFor(() => expect(router.state.location.search).toBe('?orden=titulo'))
    fireEvent.click(boton(/^Título/, screen.getByRole('columnheader', { name: /Título/ })))
    expect(screen.getByRole('columnheader', { name: /Título/ })).toHaveAttribute('aria-sort', 'descending')
    await waitFor(() => expect(router.state.location.search).toBe('?orden=titulo&dir=desc'))
  })

  it('paginación: "Siguiente" cambia de página y lleva el foco al caption', async () => {
    await abrir()
    const nav = screen.getByRole('navigation', { name: 'Páginas del listado' })
    expect(boton('Anterior', nav)).toBeDisabled()
    fireEvent.click(boton('Siguiente', nav))
    await waitFor(() => expect(caption()).toHaveTextContent('Documentos 51–100 de 120 (página 2 de 3)'))
    expect(caption()).toHaveFocus()
  })

  it('publicar y despublicar desde la fila (POST con el token CSRF)', async () => {
    await abrir()
    const d = api.documentos[0]
    const fila = filas()[0]
    await act(async () => fireEvent.click(boton(`Despublicar «${d.titulo}»`, fila)))
    await waitFor(() => expect(within(filas()[0]).getAllByText('Despublicado').length).toBeGreaterThan(0))
    const p = api.mutaciones()[0]
    expect(p).toMatchObject({ metodo: 'POST', ruta: `/api/repositorio/admin/documentos/${d.id}/despublicar` })
    expect(p.cabeceras[CABECERA_CSRF.toLowerCase()]).toBe(CSRF_PRUEBA)
    expect(await screen.findByText(`«${d.titulo}» quedó despublicado.`)).toBeInTheDocument()
    await act(async () => fireEvent.click(boton(`Publicar «${d.titulo}»`, filas()[0])))
    await waitFor(() => expect(api.documento(d.id).publicado).toBe(true))
  })

  it('un error al publicar se muestra en un aviso', async () => {
    const d = api.documentos[2]
    api.forzar('POST', `/api/repositorio/admin/documentos/${d.id}/publicar`, error(409, 'conflicto', 'Agregue el archivo o una URL externa antes de publicar el documento.'))
    await abrir()
    await act(async () => fireEvent.click(boton(`Publicar «${d.titulo}»`)))
    expect(await screen.findByRole('alert')).toHaveTextContent(`No se pudo publicar «${d.titulo}». Agregue el archivo o una URL externa`)
  })

  it('un documento sin archivo ni URL no se puede publicar desde la fila', async () => {
    const d = api.documentos[2]
    d.archivo = null
    d.urlVerExterna = null
    await abrir()
    expect(boton(`Publicar «${d.titulo}»`)).toBeDisabled()
    expect(screen.getByText('Falta el archivo o la URL')).toBeInTheDocument()
  })

  it('"Editar" lleva al formulario del documento', async () => {
    const { router } = await abrir()
    const d = api.documentos[0]
    fireEvent.click(screen.getAllByRole('link').find((a) => a.textContent === `Editar «${d.titulo}»`)!)
    await waitFor(() => expect(router.state.location.pathname).toBe(`/repositorio/admin/documentos/${d.id}`))
  })

  it('error al cargar: mensaje y "Intentar de nuevo"', async () => {
    api.forzar('GET', '/api/repositorio/admin/documentos', error(503, 'no_disponible', 'El repositorio no está disponible en este momento.'))
    renderAdmin()
    expect(await screen.findByText('No se pudieron cargar los documentos', {}, { timeout: 3000 })).toBeInTheDocument()
    fireEvent.click(boton('Intentar de nuevo'))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })
})
