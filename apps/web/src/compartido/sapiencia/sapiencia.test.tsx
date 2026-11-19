import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CabeceraSapiencia from './CabeceraSapiencia'
import PieSapiencia from './PieSapiencia'
import { ACCESIBILIDAD_ENLACES, MENU_PRINCIPAL, PIE, type EnlaceOficial } from './sapiencia-oficial'
import { CLAVE_ALMACEN, useAccesibilidad } from './useAccesibilidad'

/*
 * Cabecera, pie y panel de accesibilidad de sapiencia.gov.co (src/compartido/sapiencia), probados solos y
 * montados como los monta un sitio (p. ej. la página pública de /repositorio): la raíz .sap-oficial con las
 * clases y el estilo de useAccesibilidad(clave), la cabecera, el <main class="sap-contenido"> y el pie.
 */

/** Clave propia de este "sitio" de prueba en localStorage (la de /repositorio es 'repositorio.accesibilidad'). */
const CLAVE = 'prueba.accesibilidad'

const NUEVA_PESTANA = '(se abre en una pestaña nueva)'

function Sitio({ clave }: { clave?: string }) {
  const accesibilidad = useAccesibilidad(clave)
  return (
    <div
      className={`sitio sap-oficial${accesibilidad.clases ? ` ${accesibilidad.clases}` : ''}`}
      style={accesibilidad.estilo}
      lang="es-CO"
    >
      <CabeceraSapiencia accesibilidad={accesibilidad} />
      <main className="sap-contenido">Contenido de la página</main>
      <PieSapiencia />
    </div>
  )
}

const raiz = () => document.querySelector<HTMLElement>('.sap-oficial')!
/** Clases de efecto de accesibilidad de la raíz, en su orden. */
const efectos = () => [...raiz().classList].filter((c) => c.startsWith('sap-efecto-'))
const escala = () => raiz().style.getPropertyValue('--sap-efecto-escala')
const guardado = (clave: string): unknown => JSON.parse(window.localStorage.getItem(clave) ?? 'null')

/** Enlace de un contenedor por su dirección exacta (las del pie llevan #, %, paréntesis...). */
function enlacePorDireccion(contenedor: HTMLElement, url: string): HTMLAnchorElement {
  const enlace = [...contenedor.querySelectorAll('a')].find((a) => a.getAttribute('href') === url)
  if (!enlace) throw new Error(`No hay un enlace a ${url}`)
  return enlace
}

/** Un enlace de sapiencia-oficial.ts: en la misma pestaña o, si pestanaNueva, en otra, con rel y el aviso oculto. */
function comprobarEnlaceOficial(enlace: HTMLAnchorElement, datos: EnlaceOficial) {
  expect(enlace).toHaveTextContent(datos.texto)
  // La dirección va en los dos lados para que, si falla, se sepa qué enlace fue.
  const comoSeAbre = {
    url: enlace.getAttribute('href'),
    target: enlace.getAttribute('target'),
    rel: enlace.getAttribute('rel'),
    aviso: enlace.textContent!.includes(NUEVA_PESTANA),
  }
  const esperado = datos.pestanaNueva
    ? { url: datos.url, target: '_blank', rel: 'noopener noreferrer', aviso: true }
    : { url: datos.url, target: null, rel: null, aviso: false }
  expect(comoSeAbre).toEqual(esperado)
}

function abrirPanel() {
  const boton = screen.getByRole('button', { name: 'Opciones de Accesibilidad' })
  fireEvent.click(boton)
  const panel = screen.getByRole('region', { name: 'Accesibilidad' })
  const opcion = (texto: string) => within(panel).getByRole('button', { name: texto })
  return { boton, panel, opcion }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('cabecera de sapiencia.gov.co', () => {
  it('arriba, la barra GOV.CO: el logo abre gov.co en otra pestaña, y los botones de accesibilidad e idioma', () => {
    render(<Sitio />)

    const barra = document.querySelector<HTMLElement>('.sap-govco')!
    const govco = within(barra).getByRole('link', { name: `GOV.CO, portal único del Estado colombiano ${NUEVA_PESTANA}` })
    expect(govco).toHaveAttribute('href', 'https://www.gov.co/')
    expect(govco).toHaveAttribute('target', '_blank')
    expect(govco).toHaveAttribute('rel', 'noopener noreferrer')
    // La barra va antes (encima) de la cabecera blanca.
    expect(barra.compareDocumentPosition(screen.getByRole('banner')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    expect(within(barra).getByRole('button', { name: 'Opciones de Accesibilidad' })).toHaveAttribute('aria-expanded', 'false')

    // "Idioma": "Inglés" es la traducción de Google de la página actual (otra pestaña); "Español", la página tal cual.
    const idioma = within(barra).getByRole('button', { name: 'Idioma' })
    expect(within(barra).queryByRole('link', { name: /^Inglés/ })).not.toBeInTheDocument()
    fireEvent.click(idioma)
    expect(idioma).toHaveAttribute('aria-expanded', 'true')
    const ingles = within(barra).getByRole('link', { name: /^Inglés/ })
    expect(ingles).toHaveAttribute(
      'href',
      `https://translate.google.com/translate?sl=es&tl=en&hl=es&u=${encodeURIComponent(window.location.href)}`,
    )
    expect(ingles).toHaveAttribute('target', '_blank')
    expect(within(barra).getByRole('link', { name: 'Español' })).toHaveAttribute('aria-current', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(idioma).toHaveAttribute('aria-expanded', 'false')
  })

  it('el logo de Sapiencia y la Alcaldía lleva al inicio de https://sapiencia.gov.co/ en la misma pestaña', () => {
    render(<Sitio />)

    const cabecera = screen.getByRole('banner')
    const logo = within(cabecera).getByRole('link', {
      name: 'Sapiencia, Agencia de Educación Postsecundaria de Medellín, y Alcaldía de Medellín: ir al inicio de sapiencia.gov.co',
    })
    expect(logo).toHaveAttribute('href', 'https://sapiencia.gov.co/')
    expect(logo).not.toHaveAttribute('target')
  })

  it('el menú del sitio, en su orden, con sus submenús, y la lupa que busca en sapiencia.gov.co', () => {
    render(<Sitio />)

    const cabecera = screen.getByRole('banner')
    const menu = within(cabecera).getByRole('navigation', { name: 'Menú principal de sapiencia.gov.co' })
    const items = [...menu.querySelectorAll('.sap-menu-barra > li > .sap-menu-enlace')]
    expect(items.map((i) => i.textContent)).toEqual(MENU_PRINCIPAL.map((i) => i.texto))
    expect(within(menu).getByRole('link', { name: 'Observatorio' })).toHaveAttribute('href', 'https://sapiencia.gov.co/observatorio/')

    const nosotros = within(menu).getByRole('button', { name: 'Nosotros' })
    expect(nosotros).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(nosotros)
    expect(nosotros).toHaveAttribute('aria-expanded', 'true')
    const panelNosotros = document.getElementById(nosotros.getAttribute('aria-controls')!)!
    expect(panelNosotros).not.toHaveAttribute('inert')
    expect(within(panelNosotros).getByRole('link', { name: 'Historia Sapiencia' })).toHaveAttribute(
      'href',
      'https://sapiencia.gov.co/historia/',
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(nosotros).toHaveAttribute('aria-expanded', 'false')

    // La lupa abre el formulario del buscador de WordPress (GET https://sapiencia.gov.co/?s=…).
    const lupa = within(cabecera).getByRole('button', { name: 'Buscar en sapiencia.gov.co' })
    expect(screen.queryByRole('search', { name: 'Buscar en sapiencia.gov.co' })).not.toBeInTheDocument()
    fireEvent.click(lupa)
    expect(lupa).toHaveAttribute('aria-expanded', 'true')
    const formulario = screen.getByRole('search', { name: 'Buscar en sapiencia.gov.co' })
    expect(formulario).toHaveAttribute('action', 'https://sapiencia.gov.co/')
    expect(formulario).toHaveAttribute('method', 'get')
    const campo = within(formulario).getByRole('searchbox', { name: 'Buscar en sapiencia.gov.co' })
    expect(campo).toHaveAttribute('name', 's')
    expect(campo).toHaveFocus()
  })

  it('en tablet y celular, la hamburguesa abre el menú en un panel con el buscador; Escape lo cierra y devuelve el foco', () => {
    render(<Sitio />)

    const hamburguesa = within(screen.getByRole('banner')).getByRole('button', { name: 'Menú' })
    const panel = document.getElementById(hamburguesa.getAttribute('aria-controls')!)!
    expect(hamburguesa).toHaveAttribute('aria-expanded', 'false')
    expect(panel).not.toBeVisible()

    fireEvent.click(hamburguesa)
    expect(hamburguesa).toHaveAttribute('aria-expanded', 'true')
    expect(panel).toBeVisible()
    // Mientras está abierto, la página de atrás no se desplaza.
    expect(document.body.style.overflow).toBe('hidden')
    // El mismo menú que la barra de escritorio, con los submenús en acordeón, y el buscador del sitio.
    const menu = within(panel).getByRole('navigation', { name: 'Menú principal de sapiencia.gov.co' })
    const formacion = within(menu).getByRole('button', { name: 'Formación' })
    expect(within(menu).queryByRole('link', { name: 'Estud-IA' })).not.toBeInTheDocument()
    fireEvent.click(formacion)
    expect(formacion).toHaveAttribute('aria-expanded', 'true')
    expect(within(menu).getByRole('link', { name: 'Estud-IA' })).toHaveAttribute('href', 'https://sapiencia.gov.co/estudia/')
    expect(within(panel).getByRole('search', { name: 'Buscar en sapiencia.gov.co' })).toHaveAttribute(
      'action',
      'https://sapiencia.gov.co/',
    )

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(hamburguesa).toHaveAttribute('aria-expanded', 'false')
    expect(hamburguesa).toHaveFocus()
    expect(panel).not.toBeVisible()
    expect(document.body.style.overflow).toBe('')
    // Al volver a abrirlo, el acordeón está plegado.
    fireEvent.click(hamburguesa)
    expect(within(menu).getByRole('button', { name: 'Formación' })).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('pie de sapiencia.gov.co', () => {
  it('muestra los datos de sapiencia-oficial.ts: la agencia, el contacto y las redes', () => {
    render(<Sitio />)

    const pie = screen.getByRole('contentinfo')
    expect(within(pie).getByText(PIE.nombre)).toBeInTheDocument()
    expect(within(pie).getByRole('heading', { level: 2, name: PIE.tituloContacto })).toBeInTheDocument()
    // Cada contacto en su fila, en el orden de los datos: el título y, debajo, el detalle.
    const filas = [...pie.querySelectorAll('.sap-pie-contacto > li')].map((li) =>
      [...li.querySelectorAll('.sap-pie-lineas > span')].map((linea) => linea.textContent),
    )
    expect(filas).toEqual(PIE.contacto.map((c) => [c.titulo, c.detalle]))
    expect(within(pie).getByText('info@sapiencia.gov.co')).toBeInTheDocument()

    expect(within(pie).getByRole('heading', { level: 2, name: PIE.tituloRedes })).toBeInTheDocument()
    for (const red of PIE.redes) {
      const enlace = within(pie).getByRole('link', { name: `${red.nombre} ${NUEVA_PESTANA}` })
      expect(enlace).toHaveAttribute('href', red.url)
      expect(enlace).toHaveAttribute('target', '_blank')
      expect(enlace).toHaveAttribute('rel', 'noopener noreferrer')
    }
  })

  it('contratación y políticas con sus direcciones (en otra pestaña solo las que el sitio abre así) y los logos', () => {
    render(<Sitio />)

    const pie = screen.getByRole('contentinfo')
    expect(within(pie).getByRole('heading', { level: 2, name: PIE.tituloContratacion })).toBeInTheDocument()
    expect(within(pie).getByRole('heading', { level: 2, name: PIE.tituloPoliticas })).toBeInTheDocument()
    for (const datos of [...PIE.contratacion, ...PIE.politicas]) {
      comprobarEnlaceOficial(enlacePorDireccion(pie, datos.url), datos)
    }
    // "Procesos Contractuales" lleva debajo el logo de Colombia Compra Eficiente, dentro del mismo enlace.
    expect(within(enlacePorDireccion(pie, PIE.contratacion[0].url)).getByRole('img')).toHaveAttribute(
      'alt',
      'Colombia Compra Eficiente',
    )

    expect(within(pie).getByRole('link', { name: `Colombia, marca país ${NUEVA_PESTANA}` })).toHaveAttribute(
      'href',
      PIE.urlColombia,
    )
    expect(within(pie).getByRole('link', { name: `GOV.CO, portal único del Estado colombiano ${NUEVA_PESTANA}` })).toHaveAttribute(
      'href',
      PIE.urlGovco,
    )
    expect(
      within(pie).getByRole('img', { name: /^Sapiencia, Agencia de Educación Postsecundaria de Medellín\. Alcaldía de Medellín/ }),
    ).toBeInTheDocument()
  })

  it('las dos sedes con su dirección, su horario y su mapa, y la fecha de actualización', () => {
    render(<Sitio />)

    const pie = screen.getByRole('contentinfo')
    /** Cada dato va en su propia línea (span) del pie. */
    const linea = (texto: string) => expect(within(pie).getByText(texto)).toBeInTheDocument()
    const { sedePrincipal: principal, sedeOccidente: occidente } = PIE
    expect(within(pie).getByRole('heading', { level: 2, name: PIE.tituloUbicacion })).toBeInTheDocument()

    expect(within(pie).getByRole('heading', { level: 3, name: principal.nombre })).toBeInTheDocument()
    principal.direccion.forEach(linea)
    for (const h of principal.horario) [h.dias, h.horas].forEach(linea)
    expect(
      within(pie).getByRole('link', { name: `Ver la sede principal en Google Maps ${NUEVA_PESTANA}` }),
    ).toHaveAttribute('href', principal.mapa)

    expect(within(pie).getByRole('heading', { level: 3, name: occidente.nombre })).toBeInTheDocument()
    for (const entrada of [occidente.peatonal, occidente.vehicular]) {
      ;[entrada.titulo, entrada.direccion].forEach(linea)
      expect(enlacePorDireccion(pie, entrada.mapa)).toHaveAttribute('target', '_blank')
    }
    for (const h of occidente.horario) [h.dias, h.horas].forEach(linea)

    expect(within(pie).getByText(PIE.fechaActualizacion)).toBeInTheDocument()
    expect(PIE.fechaActualizacion).toMatch(/^Fecha última actualización \d{2}\/\d{2}\/\d{4}$/)
  })
})

describe('panel "Opciones de Accesibilidad"', () => {
  it('cambia las clases sap-efecto-* de la raíz y guarda la preferencia en localStorage con la clave que recibe', () => {
    render(<Sitio clave={CLAVE} />)
    expect(efectos()).toEqual([])
    expect(escala()).toBe('1')
    // Sin cambios no se guarda nada.
    expect(window.localStorage.length).toBe(0)

    const { boton, panel, opcion } = abrirPanel()
    expect(boton).toHaveAttribute('aria-expanded', 'true')
    expect(panel).not.toHaveAttribute('inert')
    // Al abrir, el foco va a la primera opción.
    expect(opcion('Aumentar texto')).toHaveFocus()

    // Tamaño del texto: de 10 en 10, con la escala en la variable --sap-efecto-escala.
    fireEvent.click(opcion('Aumentar texto'))
    fireEvent.click(opcion('Aumentar texto'))
    expect(efectos()).toEqual(['sap-efecto-texto-120'])
    expect(escala()).toBe('1.2')
    expect(panel).toHaveTextContent('Tamaño del texto: 120 % (de 80 % a 200 %).')
    expect(guardado(CLAVE)).toEqual({ texto: 120, esquema: null, subrayar: false, legible: false })

    // Esquema de color: uno a la vez.
    fireEvent.click(opcion('Alto contraste'))
    expect(opcion('Alto contraste')).toHaveAttribute('aria-pressed', 'true')
    expect(efectos()).toEqual(['sap-efecto-texto-120', 'sap-efecto-alto-contraste'])
    fireEvent.click(opcion('Escala de grises'))
    expect(opcion('Alto contraste')).toHaveAttribute('aria-pressed', 'false')
    expect(opcion('Escala de grises')).toHaveAttribute('aria-pressed', 'true')
    expect(efectos()).toEqual(['sap-efecto-texto-120', 'sap-efecto-grises'])

    fireEvent.click(opcion('Subrayar enlaces'))
    fireEvent.click(opcion('Fuente legible'))
    expect(efectos()).toEqual(['sap-efecto-texto-120', 'sap-efecto-grises', 'sap-efecto-subrayar', 'sap-efecto-legible'])
    expect(raiz()).toHaveClass('sitio', 'sap-oficial')
    expect(guardado(CLAVE)).toEqual({ texto: 120, esquema: 'grises', subrayar: true, legible: true })
    // Solo con la clave que recibió: la de omisión ni se toca.
    expect(window.localStorage.getItem(CLAVE_ALMACEN)).toBeNull()
    expect(window.localStorage.length).toBe(1)

    // Apagar un esquema activo lo quita.
    fireEvent.click(opcion('Escala de grises'))
    expect(efectos()).toEqual(['sap-efecto-texto-120', 'sap-efecto-subrayar', 'sap-efecto-legible'])

    // "Restablecer" deja la página como estaba y borra la preferencia guardada.
    fireEvent.click(opcion('Restablecer'))
    expect(efectos()).toEqual([])
    expect(escala()).toBe('1')
    expect(window.localStorage.getItem(CLAVE)).toBeNull()

    // El texto no baja de 80 %.
    for (let i = 0; i < 4; i++) fireEvent.click(opcion('Disminuir texto'))
    expect(efectos()).toEqual(['sap-efecto-texto-80'])
    expect(escala()).toBe('0.8')
    expect(guardado(CLAVE)).toEqual({ texto: 80, esquema: null, subrayar: false, legible: false })
  })

  it('el texto no pasa de 200 %', () => {
    render(<Sitio clave={CLAVE} />)
    const { opcion, panel } = abrirPanel()

    for (let i = 0; i < 12; i++) fireEvent.click(opcion('Aumentar texto'))

    expect(efectos()).toEqual(['sap-efecto-texto-200'])
    expect(escala()).toBe('2')
    expect(panel).toHaveTextContent('Tamaño del texto: 200 % (de 80 % a 200 %).')
  })

  it('lo abren "Opciones de Accesibilidad" y la pestaña del panel; Escape lo cierra y devuelve el foco a quien lo abrió', () => {
    render(<Sitio clave={CLAVE} />)
    const opciones = screen.getByRole('button', { name: 'Opciones de Accesibilidad' })
    const pestana = screen.getByRole('button', { name: 'Accesibilidad' })
    const panel = screen.getByRole('region', { name: 'Accesibilidad' })
    // Cerrado, el panel queda inerte (ni foco ni lectores).
    expect(panel).toHaveAttribute('inert')
    expect(document.querySelector('.sap-a11y')).not.toHaveClass('is-abierto')

    fireEvent.click(opciones)
    expect(document.querySelector('.sap-a11y')).toHaveClass('is-abierto')
    expect(pestana).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(opciones).toHaveAttribute('aria-expanded', 'false')
    expect(opciones).toHaveFocus()
    expect(panel).toHaveAttribute('inert')

    fireEvent.click(pestana)
    expect(opciones).toHaveAttribute('aria-expanded', 'true')
    expect(within(panel).getByRole('button', { name: 'Aumentar texto' })).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(pestana).toHaveAttribute('aria-expanded', 'false')
    expect(pestana).toHaveFocus()

    // La pestaña también lo cierra (alterna).
    fireEvent.click(pestana)
    fireEvent.click(pestana)
    expect(pestana).toHaveAttribute('aria-expanded', 'false')
  })

  it('abajo, los enlaces del sitio: Centro de Relevo (otra pestaña) y el certificado de accesibilidad', () => {
    render(<Sitio clave={CLAVE} />)
    const { panel } = abrirPanel()

    for (const datos of ACCESIBILIDAD_ENLACES) comprobarEnlaceOficial(enlacePorDireccion(panel, datos.url), datos)
    expect(enlacePorDireccion(panel, ACCESIBILIDAD_ENLACES[0].url)).toHaveTextContent('Centro de Relevo')
  })

  it('la preferencia guardada con esa clave se aplica desde el primer render; la de otra clave, no', () => {
    window.localStorage.setItem(
      CLAVE,
      JSON.stringify({ texto: 150, esquema: 'contraste-negativo', subrayar: true, legible: false }),
    )
    render(<Sitio clave={CLAVE} />)
    expect(efectos()).toEqual(['sap-efecto-texto-150', 'sap-efecto-contraste-negativo', 'sap-efecto-subrayar'])
    expect(escala()).toBe('1.5')
    const { opcion } = abrirPanel()
    expect(opcion('Contraste negativo')).toHaveAttribute('aria-pressed', 'true')
    expect(opcion('Subrayar enlaces')).toHaveAttribute('aria-pressed', 'true')
    expect(opcion('Fuente legible')).toHaveAttribute('aria-pressed', 'false')
    cleanup()

    // Otro sitio, con su propia clave, no la hereda (ni la borra).
    render(<Sitio clave="otro.sitio" />)
    expect(efectos()).toEqual([])
    expect(guardado(CLAVE)).toEqual({ texto: 150, esquema: 'contraste-negativo', subrayar: true, legible: false })
    cleanup()

    // Sin clave se usa la de omisión.
    window.localStorage.setItem(CLAVE_ALMACEN, JSON.stringify({ texto: 90 }))
    render(<Sitio />)
    expect(efectos()).toEqual(['sap-efecto-texto-90'])
  })

  it.each([
    { caso: 'JSON roto', crudo: '{' },
    { caso: 'null', crudo: 'null' },
    {
      caso: 'tipos y valores que no existen',
      crudo: JSON.stringify({ texto: 155, esquema: 'rojo', subrayar: 'si', legible: 1 }),
    },
    { caso: 'texto por encima de 200 %', crudo: JSON.stringify({ texto: 210 }) },
    { caso: 'texto por debajo de 80 %', crudo: JSON.stringify({ texto: 70 }) },
  ])('un valor guardado raro ($caso) vuelve al estado inicial y se borra', ({ crudo }) => {
    window.localStorage.setItem(CLAVE, crudo)
    render(<Sitio clave={CLAVE} />)
    expect(efectos()).toEqual([])
    expect(escala()).toBe('1')
    expect(window.localStorage.getItem(CLAVE)).toBeNull()
  })

  it('de un valor guardado a medias se toma lo válido, y se vuelve a guardar limpio', () => {
    window.localStorage.setItem(CLAVE, JSON.stringify({ texto: 120, esquema: 'rojo', subrayar: true, otra: 1 }))
    render(<Sitio clave={CLAVE} />)
    expect(efectos()).toEqual(['sap-efecto-texto-120', 'sap-efecto-subrayar'])
    expect(escala()).toBe('1.2')
    expect(guardado(CLAVE)).toEqual({ texto: 120, esquema: null, subrayar: true, legible: false })
  })

  it('sin localStorage (modo privado, bloqueado) el panel funciona igual, sin recordar la preferencia', () => {
    const bloqueado = () => {
      throw new DOMException('El almacenamiento está bloqueado.', 'SecurityError')
    }
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(bloqueado)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(bloqueado)
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(bloqueado)

    render(<Sitio clave={CLAVE} />)
    expect(efectos()).toEqual([])
    const { opcion } = abrirPanel()
    fireEvent.click(opcion('Fuente legible'))
    fireEvent.click(opcion('Aumentar texto'))

    expect(efectos()).toEqual(['sap-efecto-texto-110', 'sap-efecto-legible'])
    expect(Storage.prototype.setItem).toHaveBeenCalledWith(CLAVE, expect.any(String))
  })
})
