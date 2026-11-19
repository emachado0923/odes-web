import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListadoPublico } from '../api-repositorio'
import { documento, listado, listadoReal } from '../pruebas/datos-prueba'
import RepositorioSitio from '../RepositorioSitio'

let respuestas: Array<() => Response>

function json(cuerpo: unknown, estado = 200) {
  return () => new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } })
}

beforeEach(() => {
  respuestas = []
  // Preferencias del panel de accesibilidad de la entidad (useAccesibilidad).
  window.localStorage.clear()
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const siguiente = respuestas.shift()
      if (!siguiente) throw new Error('fetch inesperado')
      return siguiente()
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function renderizar(ruta = '/repositorio', datos: ListadoPublico | null = listadoReal()) {
  if (datos) respuestas.push(json(datos))
  const router = createMemoryRouter([{ path: '/repositorio/*', Component: RepositorioSitio }], { initialEntries: [ruta] })
  render(<RouterProvider router={router} />)
  return router
}

const conteo = () => document.querySelector('.rp-conteo')!.textContent
const tarjetas = () => document.querySelectorAll('.rp-lista .rp-tarjeta')
const titulos = () => [...document.querySelectorAll('.rp-lista .rp-nombre')].map((h) => h.textContent)
const campo = () => screen.getByRole('searchbox', { name: 'Buscar' })

/** Botón por su texto (jsdom no conserva el espacio inicial de los <span> internos en el nombre accesible). */
function boton(texto: string, dentro: HTMLElement = document.body): HTMLElement {
  const b = within(dentro)
    .queryAllByRole('button')
    .find((x) => x.textContent?.replace(/\s+/g, ' ').trim() === texto)
  if (!b) throw new Error(`No hay un botón "${texto}"`)
  return b
}

async function cargado() {
  await waitFor(() => expect(tarjetas().length).toBeGreaterThan(0))
}

/** Raíz de la rama: lleva la clase sap-oficial y las de los efectos de accesibilidad. */
const raiz = () => document.querySelector<HTMLElement>('.repositorio')!
const efectos = () => [...raiz().classList].filter((c) => c.startsWith('sap-efecto-'))
/** Opciones del panel de un filtro de casillas, en su orden. */
const textosOpciones = (panel: HTMLElement) => [...panel.querySelectorAll('.rp-opcion-texto')].map((o) => o.textContent)
const quitarClave = (texto: string) => screen.getByRole('button', { name: `Quitar la palabra clave «${texto}»` })
const listaClaves = () => screen.queryByRole('list', { name: 'Palabras clave seleccionadas' })

describe('página pública /repositorio', () => {
  it('muestra la carga, la presentación, el conteo y las 12 primeras tarjetas', async () => {
    renderizar()
    expect(screen.getByRole('status')).toHaveTextContent('Cargando documentos…')
    expect(screen.getByRole('heading', { level: 1, name: 'Repositorio de productos' })).toBeInTheDocument()
    expect(screen.getByText('Análisis e investigación sobre educación postsecundaria')).toHaveClass('rp-bajada')
    // La ayuda de uso va en su propio párrafo, después de la introducción y aparte de ella.
    const intro = document.querySelector('.rp-intro')!
    expect(intro.textContent).toBe(
      'Consulta los informes, boletines, infografías y estudios que publica el Observatorio de Sapiencia sobre la ' +
        'educación postsecundaria en Medellín.',
    )
    const ayuda = screen.getByText(
      'Busca por título o palabra clave, filtra por categoría y año, y abre o descarga cada documento.',
    )
    expect(ayuda).toHaveClass('rp-ayuda')
    expect(intro.compareDocumentPosition(ayuda) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await cargado()
    expect(document.title).toBe('Repositorio de productos · Observatorio de Sapiencia')
    expect(conteo()).toBe('372 documentos en el repositorio')
    expect(tarjetas()).toHaveLength(12)
    expect(titulos()[0]).toBe('Resultados preliminares estudios de educación postsecundaria 2024')
    expect(screen.getByText('Viendo 12 de 372')).toBeInTheDocument()
    expect(boton('Mostrar 12 más')).toBeInTheDocument()
    expect(screen.getByRole('search', { name: 'Buscar y filtrar documentos' })).toBeInTheDocument()
    expect(document.querySelector('.rp-estado .rp-limpiar')).not.toBeVisible()
  })

  it('lleva la cabecera y el pie de la entidad (sapiencia.gov.co), no los compactos del Observatorio', async () => {
    renderizar()
    await cargado()
    expect(raiz()).toHaveClass('sap-oficial')
    expect(raiz()).toHaveAttribute('lang', 'es-CO')
    expect(screen.getByRole('main')).toHaveClass('rp-principal', 'sap-contenido')

    // Barra GOV.CO, encima de la cabecera.
    const barra = document.querySelector<HTMLElement>('.sap-govco')!
    expect(within(barra).getByRole('link', { name: /^GOV\.CO, portal único del Estado colombiano/ })).toHaveAttribute(
      'href',
      'https://www.gov.co/',
    )
    expect(within(barra).getByRole('button', { name: 'Opciones de Accesibilidad' })).toBeInTheDocument()
    const cabecera = screen.getByRole('banner')
    expect(barra.compareDocumentPosition(cabecera) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // Cabecera: el logo de Sapiencia y la Alcaldía va a sapiencia.gov.co; el menú y el buscador del sitio.
    expect(
      within(cabecera).getByRole('link', { name: /^Sapiencia, Agencia de Educación Postsecundaria de Medellín, y Alcaldía/ }),
    ).toHaveAttribute('href', 'https://sapiencia.gov.co/')
    expect(within(cabecera).getByRole('navigation', { name: 'Menú principal de sapiencia.gov.co' })).toHaveTextContent(
      'Observatorio',
    )
    expect(within(cabecera).getByRole('button', { name: 'Buscar en sapiencia.gov.co' })).toBeInTheDocument()

    // Pie de la entidad, después del <main>.
    const pie = screen.getByRole('contentinfo')
    expect(pie).toHaveTextContent('Agencia de Educación Postsecundaria de Medellín - SAPIENCIA.')
    expect(pie).toHaveTextContent('Fecha última actualización')
    expect(screen.getByRole('main').compareDocumentPosition(pie) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // Nada de la cabecera ni del pie del Observatorio (siguen solo en la administración).
    expect(screen.queryByRole('link', { name: 'Observatorio de Sapiencia: ir al inicio' })).not.toBeInTheDocument()
    expect(document.querySelector('.rp-cabecera, .rp-pie')).toBeNull()
    // La cabecera y el pie de la entidad no traen encabezados de nivel 1: el único sigue siendo el del repositorio.
    expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(['Repositorio de productos'])
  })

  it('el panel de accesibilidad cambia las clases de la raíz y guarda la preferencia en "repositorio.accesibilidad"', async () => {
    renderizar()
    await cargado()
    expect(efectos()).toEqual([])

    fireEvent.click(screen.getByRole('button', { name: 'Opciones de Accesibilidad' }))
    const panel = screen.getByRole('region', { name: 'Accesibilidad' })
    fireEvent.click(within(panel).getByRole('button', { name: 'Aumentar texto' }))
    fireEvent.click(within(panel).getByRole('button', { name: 'Alto contraste' }))
    expect(efectos()).toEqual(['sap-efecto-texto-110', 'sap-efecto-alto-contraste'])
    expect(raiz().style.getPropertyValue('--sap-efecto-escala')).toBe('1.1')
    expect(JSON.parse(window.localStorage.getItem('repositorio.accesibilidad')!)).toEqual({
      texto: 110,
      esquema: 'alto-contraste',
      subrayar: false,
      legible: false,
    })
    // La clave es la del repositorio, no la de omisión de los componentes compartidos.
    expect(window.localStorage.getItem('sapiencia.accesibilidad')).toBeNull()

    fireEvent.click(within(panel).getByRole('button', { name: 'Restablecer' }))
    expect(efectos()).toEqual([])
    expect(window.localStorage.getItem('repositorio.accesibilidad')).toBeNull()
  })

  it('la preferencia de accesibilidad guardada se aplica al volver, desde el primer render', () => {
    window.localStorage.setItem(
      'repositorio.accesibilidad',
      JSON.stringify({ texto: 130, esquema: 'fondo-claro', subrayar: true, legible: true }),
    )
    renderizar()
    expect(efectos()).toEqual([
      'sap-efecto-texto-130',
      'sap-efecto-fondo-claro',
      'sap-efecto-subrayar',
      'sap-efecto-legible',
    ])
    expect(raiz().style.getPropertyValue('--sap-efecto-escala')).toBe('1.3')
  })

  it('el 404 de la rama lleva la misma cabecera y el mismo pie, y la preferencia sigue al volver al repositorio', async () => {
    const router = renderizar('/repositorio/x', null)
    expect(screen.getByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeInTheDocument()
    expect(screen.getByText('Esta página no existe dentro del Repositorio de productos.')).toBeInTheDocument()
    expect(document.title).toBe('Página no encontrada · Repositorio de productos')
    expect(screen.getByRole('main')).toHaveClass('sap-contenido')
    expect(raiz()).toHaveClass('sap-oficial')
    expect(screen.getByRole('banner')).toHaveTextContent('Nosotros')
    expect(screen.getByRole('contentinfo')).toHaveTextContent('Fecha última actualización')

    fireEvent.click(screen.getByRole('button', { name: 'Opciones de Accesibilidad' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fuente legible' }))
    const antes = raiz()
    expect(antes).toHaveClass('sap-efecto-legible')

    respuestas.push(json(listadoReal()))
    fireEvent.click(screen.getByRole('link', { name: 'Volver al repositorio' }))
    await cargado()
    expect(router.state.location.pathname).toBe('/repositorio')
    // La cabecera y el pie son del marco de la rama: no se vuelven a montar al cambiar de página.
    expect(raiz()).toBe(antes)
    expect(raiz()).toHaveClass('sap-efecto-legible')
  })

  it('busca mientras se escribe, resalta y refleja la búsqueda en la URL', async () => {
    const router = renderizar()
    await cargado()
    fireEvent.change(campo(), { target: { value: 'sinergia' } })
    await waitFor(() => expect(conteo()).toBe('2 de 372 documentos coinciden'))
    expect(titulos()[0]).toMatch(/^Avances y retos en la estrategia de Sinergia/)
    expect(document.querySelector('.rp-lista mark')).toHaveTextContent('Sinergia')
    expect(router.state.location.search).toBe('?q=sinergia')
    expect(screen.queryByText('Viendo 2 de 2')).not.toBeVisible()

    fireEvent.change(campo(), { target: { value: 'convocatoria 2018-2' } })
    await waitFor(() => expect(conteo()).toBe('6 de 372 documentos coinciden'))

    fireEvent.change(campo(), { target: { value: 'xyzzyq' } })
    await waitFor(() => expect(conteo()).toBe('Ningún documento coincide con la búsqueda.'))
    const vacio = document.querySelector('.rp-vacio')! as HTMLElement
    expect(vacio).toBeVisible()
    expect(vacio).toHaveTextContent('No encontramos documentos con esos criterios')
    fireEvent.click(boton('Limpiar filtros', vacio))
    expect(campo()).toHaveValue('')
    expect(campo()).toHaveFocus()
    await waitFor(() => expect(conteo()).toBe('372 documentos en el repositorio'))
    expect(router.state.location.search).toBe('')
  })

  it('tres filtros de casillas: Categoría, Año y Palabra clave (ya no hay filtro de Idioma)', async () => {
    renderizar()
    await cargado()
    expect([...document.querySelectorAll('.rp-faceta')].map((f) => f.getAttribute('data-faceta'))).toEqual([
      'categoria',
      'anio',
      'clave',
    ])
    expect(screen.getByRole('button', { name: 'Categoría Todas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Año Todos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Palabra clave Todas' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Idioma Todos/ })).not.toBeInTheDocument()
    expect(document.getElementById('rp-idioma-panel')).toBeNull()
  })

  it('Categoría va de la que tiene más productos a la que tiene menos; Palabra clave va en orden alfabético y no dice cuántos tiene cada una', async () => {
    renderizar()
    await cargado()
    fireEvent.click(screen.getByRole('button', { name: 'Categoría Todas' }))
    const categorias = document.getElementById('rp-categoria-panel')!
    expect(textosOpciones(categorias)).toEqual([
      'Infografía',
      'Educación superior en cifras',
      'Estudio',
      'Informe dinámico',
      'Nota temática',
      'Boletín',
      'Informe de tendencias',
      'Otros productos',
    ])
    expect([...categorias.querySelectorAll('.rp-opcion-total')].map((t) => Number(t.textContent))).toEqual([
      89, 66, 62, 54, 48, 43, 8, 2,
    ])
    // Para lectores de pantalla el número va en el nombre de la casilla (jsdom no conserva el espacio inicial del
    // <span> oculto, de ahí el " ?").
    expect(within(categorias).getByRole('checkbox', { name: /^Infografía ?\(89 documentos\)$/ })).toBeInTheDocument()

    // Año también dice cuántos tiene cada uno (y sigue del más reciente al más antiguo, no por número).
    fireEvent.click(screen.getByRole('button', { name: 'Año Todos' }))
    const anios = document.getElementById('rp-anio-panel')!
    expect(textosOpciones(anios)).toEqual([
      '2024',
      '2023',
      '2022',
      '2021',
      '2020',
      '2019',
      '2018',
      '2017',
      '2016',
      '2015',
      'Sin fecha',
    ])
    expect(within(anios).getByRole('checkbox', { name: /^2022 ?\(84 documentos\)$/ })).toBeInTheDocument()
    expect(within(anios).getByRole('checkbox', { name: /^2024 ?\(3 documentos\)$/ })).toBeInTheDocument()

    // Palabra clave es solo un selector de palabras: sin número, ni a la vista ni para lectores de pantalla.
    fireEvent.click(screen.getByRole('button', { name: 'Palabra clave Todas' }))
    const claves = document.getElementById('rp-clave-panel')!
    const textosClaves = textosOpciones(claves)
    expect(textosClaves).toEqual([...textosClaves].sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })))
    expect(textosClaves.slice(0, 2)).toEqual(['Acceso', 'Acoso sexual'])
    expect(claves.querySelector('.rp-opcion-total')).toBeNull()
    expect(within(claves).getByRole('checkbox', { name: 'Acceso' })).toBeInTheDocument()
    expect(claves).not.toHaveTextContent(/documentos?\)/)
  })

  it('a igual número de productos, Categoría sigue el orden configurado y luego el alfabético', async () => {
    const configuradas = ['Estudio', 'Boletín', 'Nota temática']
    renderizar(
      '/repositorio',
      listado(
        [
          documento({ id: 'zeta', categoria: 'Zeta' }),
          documento({ id: 'boletin', categoria: 'Boletín' }),
          documento({ id: 'anuario', categoria: 'Anuario' }),
          documento({ id: 'nota-1', categoria: 'Nota temática' }),
          documento({ id: 'estudio', categoria: 'Estudio' }),
          documento({ id: 'nota-2', categoria: 'Nota temática' }),
        ],
        configuradas,
      ),
    )
    await cargado()
    fireEvent.click(screen.getByRole('button', { name: 'Categoría Todas' }))
    const panel = document.getElementById('rp-categoria-panel')!
    // Nota temática (2) primero aunque está de última en la configuración; con 1: Estudio y Boletín en el orden
    // configurado (no el alfabético) y al final, alfabéticas, las que no están configuradas.
    expect(textosOpciones(panel)).toEqual(['Nota temática', 'Estudio', 'Boletín', 'Anuario', 'Zeta'])
    // Con 5 opciones o menos el panel no necesita buscador.
    expect(within(panel).queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('filtro de casillas: abre, marca (O dentro, Y entre filtros) y actualiza el botón y la URL', async () => {
    const router = renderizar()
    await cargado()
    const categoria = screen.getByRole('button', { name: 'Categoría Todas' })
    expect(categoria).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(categoria)
    expect(categoria).toHaveAttribute('aria-expanded', 'true')
    const panel = document.getElementById('rp-categoria-panel')!
    expect(panel).toBeVisible()
    expect(within(panel).getByRole('group', { name: 'Categorías' })).toBeInTheDocument()

    fireEvent.click(within(panel).getByRole('checkbox', { name: /^Boletín/ }))
    expect(conteo()).toBe('43 de 372 documentos coinciden')
    expect(categoria).toHaveTextContent('Boletín')
    expect(categoria).toHaveClass('rp-activo')
    fireEvent.click(within(panel).getByRole('checkbox', { name: /^Estudio/ }))
    expect(conteo()).toBe('105 de 372 documentos coinciden')
    // El botón las nombra en el orden del panel (Estudio, 62 productos, antes que Boletín, 43); la URL, en el que
    // se marcaron.
    expect(categoria).toHaveTextContent('Estudio, Boletín2 seleccionadas')
    await waitFor(() => expect(router.state.location.search).toBe('?categoria=boletin&categoria=estudio'))

    // Abrir otro filtro cierra el primero.
    const anio = screen.getByRole('button', { name: 'Año Todos' })
    fireEvent.click(anio)
    expect(categoria).toHaveAttribute('aria-expanded', 'false')
    expect(anio).toHaveAttribute('aria-expanded', 'true')
    const anios = document.getElementById('rp-anio-panel')!
    fireEvent.click(within(anios).getByRole('checkbox', { name: /^2023/ }))
    expect(conteo()).toBe('8 de 372 documentos coinciden')
    expect(anio).toHaveTextContent('2023')
    expect(document.querySelector('.rp-filtros-activos')).toHaveTextContent('(3)')
    await waitFor(() => expect(router.state.location.search).toBe('?categoria=boletin&categoria=estudio&anio=2023'))

    // "Quitar selección" y "Listo".
    fireEvent.click(boton('Quitar selección', anios))
    expect(conteo()).toBe('105 de 372 documentos coinciden')
    fireEvent.click(boton('Listo', anios))
    expect(screen.getByRole('button', { name: 'Año Todos' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Año Todos' })).toHaveAttribute('aria-expanded', 'false')

    // Clic fuera cierra.
    const clave = screen.getByRole('button', { name: 'Palabra clave Todas' })
    fireEvent.click(clave)
    expect(clave).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(document.querySelector('.rp-hero')!)
    expect(clave).toHaveAttribute('aria-expanded', 'false')
  })

  it('clic en el texto o el número de una opción la marca sin cerrar el panel (el foco pasa antes al <main>)', async () => {
    renderizar()
    await cargado()
    const categoria = screen.getByRole('button', { name: 'Categoría Todas' })
    fireEvent.click(categoria)
    const panel = document.getElementById('rp-categoria-panel')!
    const buscador = within(panel).getByRole('searchbox')
    buscador.focus()
    const main = document.getElementById('contenido')!
    const opcion = (texto: string) =>
      [...panel.querySelectorAll('.rp-opcion')].find((l) => l.querySelector('.rp-opcion-texto')?.textContent === texto)!

    // Lo que hace el navegador en el mousedown sobre el texto: el foco pasa al
    // ancestro enfocable más cercano (<main tabIndex={-1}>) antes del click.
    fireEvent.focusOut(buscador, { relatedTarget: main })
    expect(panel).toBeVisible()
    expect(categoria).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(opcion('Boletín').querySelector('.rp-opcion-texto')!)
    expect(conteo()).toBe('43 de 372 documentos coinciden')

    // Igual con el número de la opción, desde una casilla.
    const casilla = within(panel).getByRole('checkbox', { name: /^Boletín/ })
    casilla.focus()
    fireEvent.focusOut(casilla, { relatedTarget: main })
    expect(panel).toBeVisible()
    fireEvent.click(opcion('Estudio').querySelector('.rp-opcion-total')!)
    expect(conteo()).toBe('105 de 372 documentos coinciden')

    // Pasar el foco a otro control de la página (Tab) sí lo cierra.
    fireEvent.focusOut(casilla, { relatedTarget: campo() })
    expect(categoria).toHaveAttribute('aria-expanded', 'false')
  })

  it('cerrar el panel antes de la pausa del anuncio no deja un "N opciones" viejo al reabrirlo', async () => {
    renderizar()
    await cargado()
    vi.useFakeTimers()
    const boton = screen.getByRole('button', { name: 'Palabra clave Todas' })
    const estado = () => document.querySelector('#rp-clave-panel .rp-estado-opciones')!
    fireEvent.click(boton)
    const buscador = screen.getByRole('searchbox', { name: 'Buscar palabra clave' })
    fireEvent.change(buscador, { target: { value: 'financ' } })
    act(() => vi.advanceTimersByTime(100))
    fireEvent.click(within(document.getElementById('rp-clave-panel')!).getByRole('button', { name: 'Listo' }))
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    act(() => vi.advanceTimersByTime(700))
    expect(estado()).toHaveTextContent(/^$/)

    fireEvent.click(boton)
    expect(buscador).toHaveValue('')
    expect(estado()).toHaveTextContent(/^$/)

    // Lo mismo si lo cierra otro filtro al abrirse.
    fireEvent.change(buscador, { target: { value: 'financ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Año Todos' }))
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    act(() => vi.advanceTimersByTime(700))
    expect(estado()).toHaveTextContent(/^$/)
  })

  it('teclado del panel: flecha abajo, buscador difuso, Enter marca la primera, Esc borra y luego cierra', async () => {
    renderizar()
    await cargado()
    const boton = screen.getByRole('button', { name: 'Palabra clave Todas' })
    boton.focus()
    fireEvent.keyDown(boton, { key: 'ArrowDown' })
    const buscador = screen.getByRole('searchbox', { name: 'Buscar palabra clave' })
    await waitFor(() => expect(buscador).toHaveFocus())

    fireEvent.change(buscador, { target: { value: 'acesso' } })
    const visibles = () =>
      [...document.querySelectorAll('#rp-clave-panel .rp-opcion')].filter((l) => !(l as HTMLElement).hidden)
    expect(visibles()[0]).toHaveTextContent('Acceso')
    await waitFor(() => expect(document.querySelector('#rp-clave-panel .rp-estado-opciones')).toHaveTextContent(/opci/))

    fireEvent.keyDown(buscador, { key: 'Enter' })
    expect(conteo()).toBe('83 de 372 documentos coinciden')
    // La marcada aparece en "Palabras clave seleccionadas" sin robar el foco del panel.
    expect(quitarClave('Acceso')).toBeInTheDocument()
    expect(buscador).toHaveFocus()

    fireEvent.keyDown(buscador, { key: 'ArrowDown' })
    expect(document.activeElement).toHaveAttribute('value', 'acceso')
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    expect(buscador).toHaveFocus()

    fireEvent.keyDown(buscador, { key: 'Escape' })
    expect(buscador).toHaveValue('')
    expect(boton).toHaveAttribute('aria-expanded', 'true')
    fireEvent.change(buscador, { target: { value: 'zzzzzz' } })
    expect(visibles()).toHaveLength(0)
    expect(document.querySelector('#rp-clave-panel .rp-estado-opciones')).toHaveTextContent('Ninguna opción coincide.')
    fireEvent.keyDown(buscador, { key: 'Escape' })
    fireEvent.keyDown(buscador, { key: 'Escape' })
    expect(boton).toHaveAttribute('aria-expanded', 'false')
    expect(boton).toHaveFocus()
    // Al cerrar se borra la búsqueda del panel.
    expect(buscador).toHaveValue('')
  })

  it('las palabras clave de la tarjeta activan y quitan el filtro, y se ven en "Palabras clave seleccionadas"', async () => {
    renderizar()
    await cargado()
    expect(listaClaves()).not.toBeInTheDocument()
    expect(screen.queryByText('Palabras clave seleccionadas')).not.toBeInTheDocument()
    // Las palabras clave de la tarjeta van en orden alfabético: se busca la del primer documento por su texto.
    const primera = [...document.querySelectorAll<HTMLElement>('.rp-lista .rp-tarjeta')][0]
      .querySelectorAll<HTMLElement>('.rp-clave')
    const seguimiento = [...primera].find((b) => b.textContent?.includes('Seguimiento a bachilleres'))!
    expect(seguimiento).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(seguimiento)
    expect(conteo()).toBe('20 de 372 documentos coinciden')
    expect(screen.getByRole('button', { name: /^Palabra clave Seguimiento a bachilleres/ })).toBeInTheDocument()
    expect(document.querySelector('.rp-lista .rp-clave[aria-pressed="true"]')).toHaveTextContent('Seguimiento a bachilleres')
    expect(within(listaClaves()!).getAllByRole('button')).toEqual([quitarClave('Seguimiento a bachilleres')])
    expect(quitarClave('Seguimiento a bachilleres')).toHaveTextContent('Seguimiento a bachilleres')
    fireEvent.click(document.querySelector('.rp-lista .rp-clave[aria-pressed="true"]')!)
    expect(conteo()).toBe('372 documentos en el repositorio')
    expect(listaClaves()).not.toBeInTheDocument()
  })

  it('"Palabras clave seleccionadas": debajo de los filtros, cada una con su botón para quitarla; el foco pasa a la que queda en su lugar', async () => {
    const router = renderizar('/repositorio?clave=acceso&clave=inscripciones&clave=tendencias')
    await cargado()
    expect(conteo()).toBe('215 de 372 documentos coinciden')
    expect(screen.getByText('Palabras clave seleccionadas')).toBeVisible()
    const lista = listaClaves()!
    expect(within(lista).getAllByRole('button').map((b) => b.textContent)).toEqual(['Acceso', 'Inscripciones', 'Tendencias'])
    for (const b of within(lista).getAllByRole('button')) expect(b).toHaveClass('rp-activa')
    // Debajo de los filtros, antes del conteo, y fuera del bloque que se pliega en celular (siempre a la vista).
    const filtros = document.getElementById('rp-filtros-extra')!
    expect(filtros.compareDocumentPosition(lista) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(filtros).not.toContainElement(lista)
    expect(lista.compareDocumentPosition(document.querySelector('.rp-conteo')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    // Quitar la del medio: el foco pasa a la que queda en ese lugar.
    fireEvent.click(quitarClave('Inscripciones'))
    expect(conteo()).toBe('151 de 372 documentos coinciden')
    expect(quitarClave('Tendencias')).toHaveFocus()
    expect(screen.getByRole('button', { name: /^Palabra clave Acceso, Tendencias/ })).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.search).toBe('?clave=acceso&clave=tendencias'))

    // Quitar la última: el foco pasa a la que queda antes.
    fireEvent.click(quitarClave('Tendencias'))
    expect(conteo()).toBe('83 de 372 documentos coinciden')
    expect(quitarClave('Acceso')).toHaveFocus()

    // Sin ninguna, la lista desaparece y el foco va al filtro "Palabra clave" o, si está oculto (en celular con los
    // filtros plegados; en jsdom, que no tiene diseño, siempre), al buscador.
    fireEvent.click(quitarClave('Acceso'))
    expect(conteo()).toBe('372 documentos en el repositorio')
    expect(listaClaves()).not.toBeInTheDocument()
    expect(screen.queryByText('Palabras clave seleccionadas')).not.toBeInTheDocument()
    expect(campo()).toHaveFocus()
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('al quitar la última palabra clave con el filtro a la vista, el foco pasa al filtro "Palabra clave"', async () => {
    renderizar()
    await cargado()
    const filtro = screen.getByRole('button', { name: 'Palabra clave Todas' })
    fireEvent.click(filtro)
    fireEvent.click(within(document.getElementById('rp-clave-panel')!).getByRole('checkbox', { name: 'Acceso' }))
    fireEvent.click(document.querySelector('.rp-hero')!)
    expect(filtro).toHaveAttribute('aria-expanded', 'false')
    expect(filtro).toHaveAccessibleName('Palabra clave Acceso')

    // jsdom no calcula el diseño (offsetParent siempre es null): se simula que el filtro se ve, como en escritorio.
    Object.defineProperty(filtro, 'offsetParent', { configurable: true, get: () => document.body })
    fireEvent.click(quitarClave('Acceso'))
    expect(filtro).toHaveFocus()
    expect(filtro).toHaveAccessibleName('Palabra clave Todas')
    expect(listaClaves()).not.toBeInTheDocument()
  })

  it('"Limpiar filtros" también vacía "Palabras clave seleccionadas", y el foco se queda en el buscador', async () => {
    const router = renderizar('/repositorio?clave=acceso&categoria=boletin')
    await cargado()
    expect(quitarClave('Acceso')).toBeInTheDocument()
    // Con el filtro "Palabra clave" a la vista (escritorio; jsdom no calcula el diseño), que es a donde iría el foco
    // si la lista lo moviera al quedar vacía.
    const filtro = screen.getByRole('button', { name: 'Palabra clave Acceso' })
    Object.defineProperty(filtro, 'offsetParent', { configurable: true, get: () => document.body })

    fireEvent.click(boton('Limpiar filtros', document.querySelector<HTMLElement>('.rp-estado')!))
    expect(listaClaves()).not.toBeInTheDocument()
    expect(screen.queryByText('Palabras clave seleccionadas')).not.toBeInTheDocument()
    // La lista solo mueve el foco cuando se quita una palabra con su botón: aquí no se lo quita al buscador.
    expect(campo()).toHaveFocus()
    expect(filtro).toHaveAccessibleName('Palabra clave Todas')
    expect(conteo()).toBe('372 documentos en el repositorio')
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('la descripción llega de la API a la tarjeta y la búsqueda también la mira (resaltada)', async () => {
    renderizar(
      '/repositorio',
      listado([
        documento({
          id: 'permanencia',
          titulo: 'Boletín de permanencia',
          descripcion: 'Analiza la deserción estudiantil en las instituciones de educación superior de Medellín.',
        }),
        documento({ id: 'matricula', orden: 2, titulo: 'Boletín de matrícula' }),
      ]),
    )
    await cargado()
    const descripciones = document.querySelectorAll('.rp-lista .rp-descripcion')
    expect(descripciones).toHaveLength(1)
    expect(descripciones[0]).toHaveTextContent(
      'Analiza la deserción estudiantil en las instituciones de educación superior de Medellín.',
    )

    // La palabra solo está en la descripción.
    fireEvent.change(campo(), { target: { value: 'desercion' } })
    await waitFor(() => expect(conteo()).toBe('1 de 2 documentos coincide'))
    expect(titulos()).toEqual(['Boletín de permanencia'])
    expect(document.querySelector('.rp-lista .rp-descripcion mark')).toHaveTextContent('deserción')
  })

  it('"Mostrar 12 más" agrega tarjetas y pasa el foco al título de la primera nueva', async () => {
    renderizar()
    await cargado()
    fireEvent.click(boton('Mostrar 12 más'))
    expect(tarjetas()).toHaveLength(24)
    await waitFor(() => expect(document.activeElement).toBe(document.querySelectorAll('.rp-lista .rp-nombre')[12]))
    expect(document.querySelector('.rp-aviso')).toHaveTextContent('Se muestran 24 de 372 documentos.')
    expect(screen.getByText('Viendo 24 de 372')).toBeInTheDocument()
    // Cambiar el orden vuelve a 12.
    fireEvent.change(screen.getByRole('combobox', { name: 'Ordenar por' }), { target: { value: 'antiguo' } })
    expect(tarjetas()).toHaveLength(12)
    expect(titulos()[0]).not.toBe('Resultados preliminares estudios de educación postsecundaria 2024')
  })

  it('al final de la lista no hay "Mostrar más"', async () => {
    renderizar('/repositorio', listado([documento({ id: 'a' }), documento({ id: 'b', orden: 2 })]))
    await cargado()
    expect(conteo()).toBe('2 documentos en el repositorio')
    expect(document.querySelector('.rp-mas')).not.toBeVisible()
  })

  it('lee la búsqueda, los filtros y el orden de la URL (ignora valores que no existen)', async () => {
    const router = renderizar('/repositorio?q=fe+de+erratas&categoria=boletin&clave=no-existe&orden=titulo')
    await cargado()
    expect(campo()).toHaveValue('fe de erratas')
    expect(screen.getByRole('combobox', { name: 'Ordenar por' })).toHaveValue('titulo')
    expect(conteo()).toBe('1 de 372 documentos coincide')
    expect(titulos()).toEqual(['Fe de erratas del Boletín N.º 19'])
    // La palabra clave que no existe no llega a "Palabras clave seleccionadas".
    expect(listaClaves()).not.toBeInTheDocument()
    await waitFor(() => expect(router.state.location.search).toBe('?q=fe+de+erratas&categoria=boletin&orden=titulo'))

    // Si la URL cambia por fuera (Atrás/Adelante, un enlace), el estado se vuelve a leer.
    await act(() => router.navigate('/repositorio?clave=acceso'))
    await waitFor(() => expect(conteo()).toBe('83 de 372 documentos coinciden'))
    expect(campo()).toHaveValue('')
    expect(screen.getByRole('combobox', { name: 'Ordenar por' })).toHaveValue('relevancia')
    expect(quitarClave('Acceso')).toBeInTheDocument()
  })

  it('un enlace viejo con ?idioma= (el filtro ya no existe) no filtra y el parámetro sale de la URL', async () => {
    const router = renderizar('/repositorio?idioma=en&categoria=boletin&utm_source=boletin')
    await cargado()
    // Solo cuenta la categoría: los 43 boletines, en español y en inglés.
    expect(conteo()).toBe('43 de 372 documentos coinciden')
    expect(document.querySelector('.rp-filtros-activos')).toHaveTextContent('(1)')
    // Se borra idioma; los parámetros ajenos al repositorio se conservan.
    await waitFor(() => expect(router.state.location.search).toBe('?utm_source=boletin&categoria=boletin'))

    // Lo mismo si llega por fuera, después de cargar.
    await act(() => router.navigate('/repositorio?idioma=es'))
    await waitFor(() => expect(conteo()).toBe('372 documentos en el repositorio'))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('503: mensaje amable y "Intentar de nuevo" (el foco no se pierde)', async () => {
    respuestas.push(json({ codigo: 'no_disponible', mensaje: 'La base de datos no responde.' }, 503))
    renderizar('/repositorio', null)
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('No pudimos cargar los documentos')
    expect(alerta).toHaveTextContent('El repositorio no está disponible en este momento.')
    expect(screen.getByRole('link', { name: 'observatorio@sapiencia.gov.co' })).toHaveAttribute(
      'href',
      'mailto:observatorio@sapiencia.gov.co',
    )
    respuestas.push(json(listadoReal()))
    fireEvent.click(boton('Intentar de nuevo'))
    await cargado()
    await waitFor(() => expect(campo()).toHaveFocus())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('sin conexión y error del servidor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    renderizar('/repositorio', null)
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisa tu conexión a internet')
  })

  it('repositorio sin documentos publicados', async () => {
    renderizar('/repositorio', listado([]))
    expect(await screen.findByText('Todavía no hay documentos publicados')).toBeInTheDocument()
    expect(screen.queryByRole('search')).not.toBeInTheDocument()
  })

  it('enlace "Saltar al contenido" lleva al <main>', async () => {
    renderizar()
    await cargado()
    const saltar = screen.getByRole('link', { name: 'Saltar al contenido' })
    expect(saltar).toHaveAttribute('href', '#contenido')
    // Va antes de la barra GOV.CO y de la cabecera de la entidad: es lo primero que se alcanza con Tab.
    expect(saltar.compareDocumentPosition(document.querySelector('.sap-govco')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(saltar)
    expect(screen.getByRole('main')).toHaveFocus()
  })
})

describe('administración dentro de la rama /repositorio', () => {
  it('conserva la cabecera y el pie compactos del Observatorio, sin nada de la entidad ni su preferencia de accesibilidad', async () => {
    // Preferencia guardada en la página pública: la administración no la aplica ni la toca.
    const preferencia = JSON.stringify({ texto: 130, esquema: 'grises', subrayar: true, legible: true })
    window.localStorage.setItem('repositorio.accesibilidad', preferencia)
    // Sin sesión (401): la administración muestra su inicio de sesión.
    respuestas.push(json({ codigo: 'no_autenticado', mensaje: 'La sesión no existe o venció.' }, 401))
    const router = renderizar('/repositorio/admin', null)

    // Mientras baja el chunk de la administración (es la única prueba de este archivo que lo carga) se ve su aviso,
    // ya dentro del marco del Observatorio.
    expect(screen.getByRole('status')).toHaveTextContent('Cargando la administración…')
    expect(screen.getByRole('banner')).toHaveClass('rp-cabecera')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Repositorio de productos' }, { timeout: 3000 }),
    ).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith('/api/repositorio/admin/sesion', expect.anything())
    expect(fetch).not.toHaveBeenCalledWith('/api/repositorio/documentos', expect.anything())

    // Cabecera y pie del Observatorio: el logo sale de la rama hacia el inicio de la aplicación.
    const cabecera = screen.getByRole('banner')
    expect(cabecera).toHaveClass('rp-cabecera')
    expect(cabecera).toHaveTextContent('Repositorio de productos')
    expect(within(cabecera).getByRole('link', { name: 'Observatorio de Sapiencia: ir al inicio' })).toHaveAttribute('href', '/')
    const pie = screen.getByRole('contentinfo')
    expect(pie).toHaveClass('rp-pie')
    expect(within(pie).getByRole('link', { name: /^Sapiencia, Agencia de Educación Postsecundaria/ })).toHaveAttribute(
      'href',
      'https://www.sapiencia.gov.co/',
    )

    // Nada de la entidad: ni la barra GOV.CO, ni el panel de accesibilidad, ni el menú, ni su pie.
    expect(raiz()).not.toHaveClass('sap-oficial')
    expect(efectos()).toEqual([])
    expect(raiz().style.getPropertyValue('--sap-efecto-escala')).toBe('')
    expect(document.querySelector('.sap-govco, .sap-a11y, .sap-cabecera, .sap-movil, .sap-pie')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Opciones de Accesibilidad' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Menú principal de sapiencia.gov.co' })).not.toBeInTheDocument()
    expect(window.localStorage.getItem('repositorio.accesibilidad')).toBe(preferencia)

    // De vuelta a la página pública (navegación interna): cambia el marco y la preferencia se aplica.
    respuestas.push(json(listadoReal()))
    fireEvent.click(screen.getByRole('link', { name: 'Ver el repositorio público' }))
    await cargado()
    expect(router.state.location.pathname).toBe('/repositorio')
    expect(raiz()).toHaveClass('sap-oficial')
    expect(efectos()).toEqual(['sap-efecto-texto-130', 'sap-efecto-grises', 'sap-efecto-subrayar', 'sap-efecto-legible'])
    expect(screen.getByRole('banner')).not.toHaveClass('rp-cabecera')
    expect(screen.queryByRole('link', { name: 'Observatorio de Sapiencia: ir al inicio' })).not.toBeInTheDocument()
  })
})
